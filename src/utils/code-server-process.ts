import { spawn, ChildProcess } from 'child_process';
import { watch } from 'fs';
import { readFileSync } from 'fs';
import { join } from 'path';

export class CodeServerProcess {
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
        const mainDartPath = join(this.tempDir, 'lib/main.dart');
        console.log(`[Job ${this.jobId}] Setting up file watcher for: ${mainDartPath}`);
        
        // Set up file watcher
        watch(mainDartPath, (eventType, filename) => {
          try {
            const content = readFileSync(mainDartPath, 'utf8');
            console.log(`[Job ${this.jobId}] File changed. New content:`, content);
          } catch (error) {
            console.error(`[Job ${this.jobId}] Error reading file after change:`, error);
          }
        });

        this.process = spawn('code-server', [
          '--auth', 'none',
          '--bind-addr', `0.0.0.0:${this.port}`,
          '--user-data-dir', `${this.tempDir}/.vscode-server`,
          '--extensions-dir', `${this.tempDir}/.vscode-extensions`,
          '--config', `${this.tempDir}/.vscode-config`,
          this.tempDir
        ], {
          cwd: this.tempDir,
        });

        this.process.stdout?.on('data', (data) => {
          const output = data.toString();
          if (output.includes('HTTP server listening')) {
            // Log initial file content
            try {
              const content = readFileSync(mainDartPath, 'utf8');
              console.log(`[Job ${this.jobId}] Initial file content:`, content);
            } catch (error) {
              console.error(`[Job ${this.jobId}] Error reading initial file:`, error);
            }
            resolve();
          }
        });

        this.process.stderr?.on('data', (data) => {
          console.error(`[Job ${this.jobId}] code-server stderr: ${data}`);
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
          reject(new Error('Code server startup timed out'));
        }, 30000);
      } catch (error) {
        console.error(`[Job ${this.jobId}] Error starting code-server:`, error);
        reject(error);
      }
    });
  }

  async hotRestart(): Promise<void> {
    // No equivalent for code-server, but we could implement file watching
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  getUrl(): string {
    return `http://localhost:${this.port}`;
  }

  cleanup(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  getFilePath(): string {
    return join(this.tempDir, 'lib/main.dart');
  }

  getFileContent(): string {
    const filePath = this.getFilePath();
    const fileContent = readFileSync(filePath, 'utf8');
    return fileContent;
  }
}
