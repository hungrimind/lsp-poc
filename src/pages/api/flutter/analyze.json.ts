import type { APIRoute } from "astro";
import { exec } from "node:child_process";
import { writeFile, mkdir, rm, cp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

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

async function analyzeCode(tempDir: string) {
  try {
    return await execAsync('dart analyze', {
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

export const POST: APIRoute = async ({ request }) => {
  let tempDir = '';
  try {
    // Create temp directory with a unique id
    const id = randomUUID();
    tempDir = join(tmpdir(), `dart-analysis-${id}`);
    await mkdir(tempDir, { recursive: true });

    // Copy template project to temp directory
    const templateDir = join(process.cwd(), 'template');
    await cp(templateDir, tempDir, { recursive: true });

    // Get JSON data from request
    const json = await request.json();
    const fileContent = Buffer.from(json.fileContent, 'base64');
    const relativePath = json.path;

    // Write file to appropriate location
    const fullPath = join(tempDir, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, fileContent);

    // Run flutter pub get first
    await execAsync('flutter pub get', { cwd: tempDir });

    // Run dart analyze with full output
    const analyzeResult = await analyzeCode(tempDir);

    // Cleanup
    await cleanupTempDir(tempDir);

    return new Response(JSON.stringify({
      success: true,
      output: analyzeResult.stdout || "No issues found",
      errors: analyzeResult.stderr || null,
      hasIssues: analyzeResult.stderr?.length > 0 || analyzeResult.stdout?.includes('error')
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
      await cleanupTempDir(tempDir);
    }

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.stack : undefined
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
