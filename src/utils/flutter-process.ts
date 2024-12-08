import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import fetch from 'node-fetch';

export class FlutterProcess {
  private process: ChildProcess | null = null;
  private tempDir: string;
  private jobId: string;
  private port: number;

  constructor(tempDir: string, jobId: string, port: number) {
    this.tempDir = tempDir;
    this.jobId = jobId;
    this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const baseHref = `/flutter/${this.jobId}/`;
        this.process = spawn('flutter', [
          'run',
          '-d', 'web-server',
          '--web-port', this.port.toString(),
          '--web-renderer', 'html',
          '--dart-define=FLUTTER_BASE_HREF=' + baseHref
        ], {
          cwd: this.tempDir,
        });

        this.process.stdout?.on('data', (data) => {
          const output = data.toString();
          if (output.includes(`http://localhost:${this.port}`)) {
            resolve();
          }
        });

        this.process.stderr?.on('data', (data) => {
          console.error(`[Job ${this.jobId}] Flutter stderr: ${data}`);
        });

        this.process.on('error', (error) => {
          console.error(`[Job ${this.jobId}] Process error:`, error);
          reject(error);
        });

        this.process.on('exit', (code) => {
          console.log(`[Job ${this.jobId}] Process exited with code: ${code}`);
          if (code !== 0) {
            reject(new Error(`Process exited with code ${code}`));
          }
        });

        setTimeout(() => {
          reject(new Error('Flutter process startup timed out'));
        }, 120000);
      } catch (error) {
        console.error(`[Job ${this.jobId}] Error spawning Flutter process:`, error);
        reject(error);
      }
    });
  }

  async getCompiledFiles(): Promise<Record<string, string> | null> {
    if (!this.process) {
      console.log(`[Job ${this.jobId}] Process not ready yet`);
      return null;
    }

    try {
      console.log(`[Job ${this.jobId}] Attempting to fetch compiled files`);
      const [
        flutterJs, 
        mainDartJs, 
        manifest,
        flutterBootstrap,
        canvasKit,
        canvasKitWasm
      ] = await Promise.all([
        fetch('http://localhost:8000/flutter.js')
          .then(r => {
            console.log(`[Job ${this.jobId}] flutter.js fetch status: ${r.status}`);
            return r.text();
          }),
        fetch('http://localhost:8000/main.dart.js')
          .then(r => {
            console.log(`[Job ${this.jobId}] main.dart.js fetch status: ${r.status}`);
            return r.text();
          }),
        fetch('http://localhost:8000/manifest.json')
          .then(r => {
            console.log(`[Job ${this.jobId}] manifest.json fetch status: ${r.status}`);
            return r.text();
          }),
        fetch('http://localhost:8000/flutter_bootstrap.js')
          .then(r => {
            console.log(`[Job ${this.jobId}] flutter_bootstrap.js fetch status: ${r.status}`);
            return r.text();
          }),
        fetch('http://localhost:8000/canvaskit/canvaskit.js')
          .then(r => {
            console.log(`[Job ${this.jobId}] canvaskit.js fetch status: ${r.status}`);
            return r.text();
          }),
        fetch('http://localhost:8000/canvaskit/canvaskit.wasm')
          .then(r => {
            console.log(`[Job ${this.jobId}] canvaskit.wasm fetch status: ${r.status}`);
            return r.arrayBuffer();
          })
      ]);

      console.log(`[Job ${this.jobId}] Successfully fetched all compiled files`);
      return {
        'flutter.js': Buffer.from(flutterJs).toString('base64'),
        'main.dart.js': Buffer.from(mainDartJs).toString('base64'),
        'manifest.json': Buffer.from(manifest).toString('base64'),
        'flutter_bootstrap.js': Buffer.from(flutterBootstrap).toString('base64'),
        'canvaskit.js': Buffer.from(canvasKit).toString('base64'),
        'canvaskit.wasm': Buffer.from(canvasKitWasm).toString('base64')
      };
    } catch (error) {
      console.error(`[Job ${this.jobId}] Error fetching compiled files:`, error);
      return null;
    }
  }

  async hotRestart(): Promise<void> {
    if (!this.process) {
      throw new Error('Flutter process not running');
    }

    return new Promise((resolve, reject) => {
      // Send 'R' to trigger hot restart
      this.process?.stdin?.write('R\n');
      
      // You might want to implement proper detection of hot restart completion
      // For now, we'll just wait a short time
      setTimeout(resolve, 1000);
    });
  }

  cleanup(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}