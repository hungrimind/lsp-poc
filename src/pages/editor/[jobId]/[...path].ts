import type { APIRoute } from "astro";
import { getJobStatus } from "../../../utils/cluster-manager";

export const GET: APIRoute = async ({ params, request }) => {
    const jobId = params.jobId as string;
    const url = new URL(request.url);
    
    const jobStatus = await getJobStatus(jobId);
    if (!jobStatus?.codeServerPort) {
        return new Response('Job not found', { status: 404 });
    }

    // Redirect to the actual code-server instance
    const targetUrl = new URL(`http://127.0.0.1:${jobStatus.codeServerPort}`);
    
    // Copy query parameters
    url.searchParams.forEach((value, key) => {
        targetUrl.searchParams.set(key, value);
    });

    return Response.redirect(targetUrl.toString(), 307);
};

export const OPTIONS: APIRoute = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        }
    });
};