import type { APIRoute } from "astro";
import { getRunningJobs } from '../../../utils/cluster-manager';

export const GET: APIRoute = async () => {
  try {
    const jobs = await getRunningJobs();
    
    return new Response(JSON.stringify({
      success: true,
      jobs: jobs,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Jobs fetch error:', error);
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