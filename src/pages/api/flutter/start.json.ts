import type { APIRoute } from "astro";
import { mkdir, cp, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { startJob } from "../../../utils/cluster-manager";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { fileContent, path } = await request.json();
    
    // Create temp directory with a unique id
    const id = randomUUID();
    const tempDir = join(tmpdir(), `flutter-job-${id}`);
    
    // Setup directory and files with proper permissions
    await mkdir(tempDir, { recursive: true, mode: 0o777 });
    await cp(join(process.cwd(), 'template'), tempDir, { recursive: true });

    // Create lib directory and write the Dart file
    const libDir = join(tempDir, 'lib');
    await mkdir(libDir, { recursive: true, mode: 0o777 });
    
    const mainDartPath = join(libDir, 'main.dart');
    await writeFile(
      mainDartPath, 
      Buffer.from(fileContent, 'base64').toString('utf-8'),
      { mode: 0o666 }
    );

    // Ensure the entire directory tree is writable
    await chmod(tempDir, 0o777);
    await chmod(libDir, 0o777);
    await chmod(mainDartPath, 0o666);

    // Start job in worker
    await startJob(id, tempDir);

    return new Response(JSON.stringify({
      success: true,
      jobId: id,
      status: 'starting'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Process start error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
