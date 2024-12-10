import type { APIRoute } from "astro";
import { getJobStatus, hotRestartJob } from '../../../utils/cluster-manager';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { jobId } = await request.json();
    
    const jobStatus = await getJobStatus(jobId);
    if (!jobStatus) {
      throw new Error('Job not found');
    }

    // Trigger hot restart
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
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}