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
    // Create temp directory with a unique id
    const id = randomUUID();
    tempDir = join(tmpdir(), `flutter-compilation-${id}`);
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

    // Run flutter build web
    const buildResult = await compileCode(tempDir);

    // Read compiled files
    const compiledFiles = await getCompiledFiles(tempDir);

    // Cleanup
    await cleanupTempDir(tempDir);

    return new Response(JSON.stringify({
      success: true,
      compiledFiles,
      output: buildResult.stdout,
      errors: buildResult.stderr
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
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
};
