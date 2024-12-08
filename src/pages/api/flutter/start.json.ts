import type { APIRoute } from "astro";
import { mkdir, cp, writeFile } from "node:fs/promises";
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
    
    // Setup directory and files
    await mkdir(tempDir, { recursive: true });
    await cp(join(process.cwd(), 'template'), tempDir, { recursive: true });

    // Create lib directory and write the Dart file
    const libDir = join(tempDir, 'lib');
    await mkdir(libDir, { recursive: true });
    await writeFile(
      join(libDir, 'main.dart'), 
      Buffer.from(fileContent, 'base64').toString('utf-8')
    );

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
