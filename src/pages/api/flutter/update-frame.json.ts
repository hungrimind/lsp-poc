import type { APIRoute } from "astro";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export const POST: APIRoute = async ({ request }) => {
    try {
        const { content } = await request.json();
        const framePath = join(process.cwd(), 'src', 'pages', 'frame.html');
        await writeFile(framePath, content, 'utf-8');

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Frame update error:', error);
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