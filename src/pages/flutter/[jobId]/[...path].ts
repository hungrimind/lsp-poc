import type { APIRoute } from "astro";
import { getJobStatus } from "../../../utils/cluster-manager";

export const GET: APIRoute = async ({ params, request }) => {
  const jobId = params.jobId as string;
  const path = params.path || '';
  
  const jobStatus = await getJobStatus(jobId);
  if (!jobStatus || !jobStatus.port) {
    return new Response('Job not found', { status: 404 });
  }

  try {
    const finalPath = Array.isArray(path) ? path.join('/') : path || 'index.html';
    const response = await fetch(`http://localhost:${jobStatus.port}/${finalPath}`);
    
    if (!response.ok) {
      return new Response('File not found', { status: 404 });
    }

    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      },
    });
  } catch (error) {
    return new Response('Error fetching file', { status: 500 });
  }
};

export const OPTIONS: APIRoute = async ({ request }) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}; 