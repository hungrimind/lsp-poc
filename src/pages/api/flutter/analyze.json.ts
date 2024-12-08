import type { APIRoute } from "astro";
import { exec } from "node:child_process";
import { writeFile, mkdir, rm, cp, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdtempSync } from "node:fs";

export interface TaskTiming {
  task: string;
  duration: number;
}

export async function measureTask<T>(taskName: string, task: () => Promise<T>, timings: TaskTiming[]): Promise<T> {
  const start = performance.now();
  try {
    return await task();
  } finally {
    const end = performance.now();
    timings.push({
      task: taskName,
      duration: Math.round((end - start) * 100) / 100 // Round to 2 decimal places
    });
  }
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
};

const execAsync = promisify(exec);

async function analyzeCode(tempDir: string, filePath: string) {
  try {
    return await execAsync(`dart analyze .`, {
      cwd: tempDir,
      maxBuffer: 1024 * 1024 // Increase buffer size to 1MB
    });
  } catch (analyzeError: any) {
    // The command might "fail" with non-zero exit code but that's expected
    const typedAnalyzeError = analyzeError as { stdout?: string, stderr?: string };

    return {
      stdout: typedAnalyzeError.stdout || '',
      stderr: typedAnalyzeError.stderr || ''
    };
  }
}

async function cleanupTempDir(tempDir: string) {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch (cleanupError) {
    console.error('Error during cleanup:', cleanupError);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

interface FileToAnalyze {
  path: string;
  fileContent: string; // base64 encoded
}

export const POST: APIRoute = async ({ request }) => {
  let tempDir = '';
  const timings: TaskTiming[] = [];
  
  try {
    // Create temp directory in memory (if available)
    const id = await measureTask('Generate UUID', () => randomUUID(), timings);
    const baseTmpDir = process.platform === 'linux' ? '/dev/shm' : tmpdir();
    tempDir = join(baseTmpDir, `dart-analysis-${id}`);
    await measureTask('Create temp directory', () => mkdir(tempDir, { recursive: true }), timings);

    // Copy files from template
    const templateDir = join(process.cwd(), 'template');
    await measureTask('Copy package files', async () => {
      // Copy pubspec.yaml
      await cp(join(templateDir, 'pubspec.yaml'), join(tempDir, 'pubspec.yaml'));
      // Copy .dart_tool directory which contains package info
      await cp(join(templateDir, '.dart_tool'), join(tempDir, '.dart_tool'), { recursive: true });
    }, timings);

    // Get JSON data from request
    const json = await measureTask('Parse request JSON', () => request.json(), timings);
    const files: FileToAnalyze[] = Array.isArray(json) ? json : [json];

    // Write all files
    await measureTask('Write files', async () => {
      for (const file of files) {
        const fileContent = Buffer.from(file.fileContent, 'base64');
        const fullPath = join(tempDir, file.path);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, fileContent);
      }
    }, timings);

    // Run dart analyze on the directory
    const analyzeResult = await measureTask('Run dart analyze', () => 
      analyzeCode(tempDir, ''), timings);

    // Cleanup
    await measureTask('Cleanup temp directory', () => cleanupTempDir(tempDir), timings);

    return new Response(JSON.stringify({
      success: true,
      output: analyzeResult.stdout || "No issues found",
      errors: analyzeResult.stderr || null,
      hasIssues: analyzeResult.stderr?.length > 0 || analyzeResult.stdout?.includes('error'),
      timings
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('Analysis error:', error);
    // Cleanup on error
    if (tempDir) {
      await measureTask('Cleanup temp directory (error)', () => cleanupTempDir(tempDir), timings);
    }

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.stack : undefined,
      timings
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
};
