import type { APIRoute } from "astro";
import { getJobStatus, getRunningJobs } from '../../../utils/cluster-manager';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { jobId } = await request.json();
    const jobStatus = await getJobStatus(jobId);

    const editorUrl = jobStatus?.tempDir 
      ? `/editor/${jobId}?folder=${encodeURIComponent(jobStatus.tempDir)}`
      : `/editor/${jobId}`;

    return new Response(JSON.stringify({
      success: true,
      status: jobStatus?.status || 'not_found',
      compiledFiles: jobStatus?.compiledFiles,
      urls: jobStatus ? {
        flutter: `/flutter/${jobId}/`,
        editor: editorUrl
      } : null
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Status check error:', error);
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