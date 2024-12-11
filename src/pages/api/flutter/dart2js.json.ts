import type { APIRoute } from "astro";
import { exec } from "node:child_process";
import { writeFile, mkdir, rm, readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export interface TaskTiming {
  task: string;
  duration: number;
}

async function measureTask<T>(taskName: string, task: () => Promise<T>, timings: TaskTiming[]): Promise<T> {
  const start = performance.now();
  try {
    return await task();
  } finally {
    const end = performance.now();
    timings.push({
      task: taskName,
      duration: Math.round((end - start) * 100) / 100
    });
  }
}

const execAsync = promisify(exec);

async function compileDart2JS(tempDir: string, fileContent: string) {
  try {
    console.log(`Setting up Flutter project in ${tempDir}`);
    
    const templatePath = join(process.cwd(), 'template');
    await execAsync(`cp -r ${templatePath}/* ${tempDir}/`);
    
    const mainDartPath = join(tempDir, 'lib', 'main.dart');
    await writeFile(mainDartPath, fileContent);
    
    // Create bootstrap file
    const bootstrapCode = `
import 'package:flutter/material.dart';
import 'main.dart' as entrypoint;

void main() {
  // Initialize Flutter
  WidgetsFlutterBinding.ensureInitialized();

  // Run the app wrapped in a MaterialApp
  runApp(MaterialApp(
    home: Builder(builder: (context) {
      // Run the user's main function
      entrypoint.main();
      return Container(color: Colors.blue);
    }),
  ));
}`;

    const bootstrapPath = join(tempDir, 'lib', 'bootstrap.dart');
    await writeFile(bootstrapPath, bootstrapCode);

    // Create web/index.html with simpler initialization
    const indexHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta content="IE=Edge" http-equiv="X-UA-Compatible">
  <meta name="description" content="A Flutter app">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flutter Web</title>
</head>
<body>
  <script src="flutter.js" defer></script>
  <script src="dart_sdk.js"></script>
  <script src="main.dart.js"></script>
</body>
</html>`;

    const webDir = join(tempDir, 'web');
    await mkdir(webDir, { recursive: true });
    await writeFile(join(webDir, 'index.html'), indexHtml);

    // Create pubspec.yaml with minimal Flutter dependencies
    const pubspecContent = `
name: dartpad_sample
description: A Flutter web sample
version: 1.0.0

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
`;
    await writeFile(join(tempDir, 'pubspec.yaml'), pubspecContent);

    console.log('Running pub get...');
    await execAsync('flutter pub get', {
      cwd: tempDir,
      env: {
        ...process.env,
        FLUTTER_WEB: 'true'
      }
    });
    
    // Find paths and list contents to debug
    const { stdout: dartPath } = await execAsync('which dart');
    const flutterBinPath = dirname(dartPath.trim());
    const dartSdkPath = join(flutterBinPath, 'cache', 'dart-sdk');
    const dartdevcPath = join(dartSdkPath, 'bin', 'snapshots', 'dartdevc.dart.snapshot');
    
    const flutterWebSdkPath = join(flutterBinPath, 'cache', 'flutter_web_sdk');
    const kernelPath = join(flutterWebSdkPath, 'kernel');
    
    // Copy Flutter web SDK files
    console.log('Copying Flutter web SDK files...');
    await execAsync(`cp -r ${flutterWebSdkPath}/canvaskit ${webDir}/`);
    await execAsync(`cp -r ${flutterWebSdkPath}/flutter_js/* ${webDir}/`);
    
    // Copy SDK files
    const sdkPath = join(kernelPath, 'amd-canvaskit-sound/dart_sdk.js');
    console.log('Copying SDK from:', sdkPath);
    await execAsync(`cp ${sdkPath} ${webDir}/`);
    
    // Use dart to run the dartdevc snapshot with Flutter web summary
    const command = `dart ${dartdevcPath} \
      --modules=amd \
      --no-summarize \
      --module-name=dartpad_main \
      --enable-asserts \
      -s ${kernelPath}/ddc_outline_sound.dill \
      --packages=${join(tempDir, '.dart_tool/package_config.json')} \
      -o ${join(webDir, 'main.dart.js')} \
      ${bootstrapPath}`;
    
    console.log('Running command:', command);
    
    const result = await execAsync(command, {
      cwd: tempDir,
      maxBuffer: 1024 * 1024 * 50,
      env: {
        ...process.env,
        FLUTTER_WEB: 'true',
        DART_SDK: dartSdkPath
      }
    });

    if (result.stderr) {
      console.error('Compilation stderr:', result.stderr);
    }
    if (result.stdout) {
      console.log('Compilation stdout:', result.stdout);
    }

    // Read and log files for debugging
    const sdkJs = await readFile(join(webDir, 'dart_sdk.js'), 'utf-8');
    const mainJs = await readFile(join(webDir, 'main.dart.js'), 'utf-8');
    console.log('\nSDK JS first 500 chars:', sdkJs.substring(0, 500));
    console.log('\nMain JS first 500 chars:', mainJs.substring(0, 500));
    
    // Check if files exist
    console.log('\nChecking web directory contents...');
    const webDirContents = await readdir(webDir);
    console.log('Files in web directory:', webDirContents);
    
    // Read necessary files from web directory
    const [flutterJs, canvasKitJs, canvasKitWasm] = await Promise.all([
      readFile(join(webDir, 'flutter.js'), 'utf-8'),
      readFile(join(webDir, 'canvaskit', 'canvaskit.js'), 'utf-8'),
      readFile(join(webDir, 'canvaskit', 'canvaskit.wasm'), 'base64')
    ]);

    // Log the first few lines of each file for debugging
    console.log('main.dart.js first 100 chars:', mainJs.substring(0, 100));
    console.log('dart_sdk.js first 100 chars:', sdkJs.substring(0, 100));
    console.log('flutter.js first 100 chars:', flutterJs.substring(0, 100));

    // Process the JS to add module name explicitly
    const processedJs = mainJs.replace('define([', "define('dartpad_main', [");

    return {
      success: true,
      files: {
        'main.dart.js': processedJs,
        'flutter.js': flutterJs,
        'canvaskit.js': canvasKitJs,
        'canvaskit.wasm': canvasKitWasm,
        'dart_sdk.js': sdkJs
      }
    };
  } catch (error: any) {
    console.error('Compilation error:', error);
    return {
      success: false,
      error: error.message || String(error)
    };
  }
}

async function cleanupTempDir(tempDir: string) {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch (cleanupError) {
    console.error('Error during cleanup:', cleanupError);
  }
}

export const POST: APIRoute = async ({ request }) => {
  let tempDir = '';
  const timings: TaskTiming[] = [];
  
  try {
    // Create temp directory
    const id = await measureTask('Generate UUID', () => randomUUID(), timings);
    const baseTmpDir = process.platform === 'linux' ? '/dev/shm' : tmpdir();
    tempDir = join(baseTmpDir, `dart2js-${id}`);
    await measureTask('Create temp directory', () => mkdir(tempDir, { recursive: true }), timings);

    // Get file content from request
    const { fileContent } = await measureTask('Parse request JSON', () => request.json(), timings);
    
    // Run dart2js compilation with the decoded content
    const compileResult = await measureTask('Run dart2js', () => 
      compileDart2JS(tempDir, Buffer.from(fileContent, 'base64').toString('utf-8')), timings);

    if (compileResult.stderr) {
      return new Response(JSON.stringify({
        success: false,
        error: compileResult.stderr,
        timings
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      files: compileResult.files,
      timings
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timings
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}; 