import type { APIRoute } from "astro";
import { getJobStatus, hotRestartJob } from '../../../utils/cluster-manager';
import { join } from 'path';
import { writeFile } from "fs/promises";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { jobId, fileContent } = await request.json();
    
    // Write the new file content first
    const jobStatus = await getJobStatus(jobId);
    if (!jobStatus?.tempDir) {
      throw new Error('Job directory not found');
    }

    await writeFile(
      join(jobStatus.tempDir, 'lib/main.dart'),
      Buffer.from(fileContent, 'base64').toString('utf-8')
    );

    // Then trigger hot restart
    await hotRestartJob(jobId);

    return new Response(JSON.stringify({
      success: true,
      status: 'restarting'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Hot restart error:', error);
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