import type { APIRoute } from "astro";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export const POST: APIRoute = async ({ request }) => {
    try {
        const { flutterJs, dartSdkJs, mainDartJs } = await request.json();
        const publicDir = join(process.cwd(), 'public');

        await writeFile(join(publicDir, 'flutter.js'), flutterJs, 'utf-8');
        await writeFile(join(publicDir, 'dart_sdk.js'), dartSdkJs, 'utf-8');
        await writeFile(join(publicDir, 'main.dart.js'), mainDartJs, 'utf-8');

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