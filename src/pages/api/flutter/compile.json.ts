import type { APIRoute } from "astro";
import { exec } from "node:child_process";
import { writeFile, mkdir, rm, cp, readdir, readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execAsync = promisify(exec);

async function compileCode(tempDir: string) {
  try {
    console.log('Running flutter pub get...');
    const pubGetResult = await execAsync('flutter pub get', { 
      cwd: tempDir,
      maxBuffer: 50 * 1024 * 1024 
    });
    console.log('pub get result:', pubGetResult);

    console.log('Building for web...');
    const buildResult = await execAsync('flutter build web --web-renderer html --release', {
      cwd: tempDir,
      maxBuffer: 50 * 1024 * 1024
    });
    console.log('build result:', buildResult);

    return buildResult;
  } catch (compileError: any) {
    console.error('Compilation error:', compileError);
    throw compileError;
  }
}

async function cleanupTempDir(tempDir: string) {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch (cleanupError) {
    console.error('Error during cleanup:', cleanupError);
  }
}

async function getCompiledFiles(tempDir: string) {
  const webBuildPath = join(tempDir, 'build', 'web');
  const files: { [key: string]: string } = {};
  
  try {
    const entries = await readdir(webBuildPath, { recursive: true });
    
    for (const entry of entries) {
      const fullPath = join(webBuildPath, entry);
      try {
        const stats = await stat(fullPath);
        if (stats.isFile()) {
          const content = await readFile(fullPath);
          files[entry] = content.toString('base64');
        }
      } catch (error) {
        console.error(`Error reading file ${entry}:`, error);
      }
    }
  } catch (error) {
    console.error('Error reading build directory:', error);
    throw error;
  }
  
  return files;
}

export const POST: APIRoute = async ({ request }) => {
  let tempDir = '';
  try {
    // Create temp directory with unique id
    const id = randomUUID();
    tempDir = join(tmpdir(), `flutter-web-${id}`);
    await mkdir(tempDir, { recursive: true });

    // Copy template project to temp directory
    const templateDir = join(process.cwd(), 'template');
    await cp(templateDir, tempDir, { recursive: true });

    // Get files from request and their paths
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

    // Compile the code
    const compileResult = await compileCode(tempDir);

    // Get the compiled files from the build/web directory
    const compiledFiles = await getCompiledFiles(tempDir);

    console.log('Compiled files:', compiledFiles);

    // Cleanup
    await cleanupTempDir(tempDir);

    return new Response(JSON.stringify({
      success: true,
      output: compileResult.stdout || "Compilation successful",
      errors: compileResult.stderr || null,
      hasIssues: compileResult.stderr?.length > 0,
      compiledFiles: compiledFiles
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Compilation error:', error);
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
        'Content-Type': 'application/json'
      }
    });
  }
};
