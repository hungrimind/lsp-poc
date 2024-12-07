import type { APIRoute } from "astro";
import { exec } from "node:child_process";
import { writeFile, mkdir, rm, cp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

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

    // Get file from request and their correct paths
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const paths = formData.getAll("paths") as string[];

    // Write files to appropriate locations
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relativePath = paths[i];
      const fullPath = join(tempDir, relativePath);

      await mkdir(dirname(fullPath), { recursive: true });
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(fullPath, buffer);
    }

    // Run flutter pub get first
    await execAsync('flutter pub get', { cwd: tempDir });

    // Run dart analyze with full output
    const analyzeResult = await analyzeCode(tempDir);

    // Cleanup
    await cleanupTempDir(tempDir);

    return new Response(JSON.stringify({
      success: true, // Analysis completed successfully even if it found issues
      output: analyzeResult.stdout || "No issues found",
      errors: analyzeResult.stderr || null,
      hasIssues: analyzeResult.stderr?.length > 0 || analyzeResult.stdout?.includes('error')
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.log(error);
    // Cleanup on error
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }

    // Return more detailed error information
    return new Response(JSON.stringify({
      error: error,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
