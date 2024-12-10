import { spawn, ChildProcess } from 'child_process';
import { watch } from 'fs';
import { readFileSync, writeFileSync, existsSync, mkdirSync, dirname } from 'fs';
import { join } from 'path';
import { rgPath } from '@vscode/ripgrep';

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
        console.log(`[CodeServer ${this.jobId}] Starting code-server on port ${this.port}`);
        
        // Create VS Code settings in workspace
        const vscodeDir = `${this.tempDir}/.vscode`;
        const settingsPath = `${vscodeDir}/settings.json`;
        const settings = {
          "files.exclude": {
            ".dart_tool": true,
            ".idea": true,
            ".vscode-extensions": true,
            ".vscode-server": true,
            "build": true,
            "web": true,
            ".gitignore": true,
            ".metadata": true,
            ".vscode": true,
            ".vscode-config": true,
            "README.md": true,
            ".vscod": true,
            "pubspec.lock": true
          }
        };
        
        try {
          // Ensure .vscode directory exists
          if (!existsSync(vscodeDir)) {
            mkdirSync(vscodeDir, { recursive: true });
          }
          writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        } catch (error) {
          console.error('Failed to create VS Code settings:', error);
        }

        this.process = spawn('code-server', [
          '--auth', 'none',
          '--bind-addr', `127.0.0.1:${this.port}`,
          '--port', this.port.toString(),
          '--user-data-dir', `${this.tempDir}/.vscode-server`,
          '--extensions-dir', `${this.tempDir}/.vscode-extensions`,
          '--config', `${this.tempDir}/.vscode-config`,
          '--disable-telemetry',
          '--disable-update-check',
          '--disable-workspace-trust',
          '--disable-file-downloads',
          this.tempDir
        ], {
          cwd: this.tempDir,
          env: {
            ...process.env,
            // Point to our installed ripgrep
            VSCODE_RIPGREP_PATH: rgPath,
            // Skip the ripgrep download
            VSCODE_RIPGREP_SKIP: 'true'
          }
        });

        this.process.stdout?.on('data', (data) => {
          const output = data.toString();
          console.log(`[CodeServer ${this.jobId}] stdout:`, output);
          if (output.includes('HTTP server listening')) {
            resolve();
          }
        });

        this.process.stderr?.on('data', (data) => {
          console.error(`[CodeServer ${this.jobId}] stderr:`, data.toString());
        });

        this.process.on('error', (error) => {
          console.error(`[CodeServer ${this.jobId}] Process error:`, error);
          reject(error);
        });

        this.process.on('exit', (code) => {
          console.log(`[CodeServer ${this.jobId}] Process exited with code: ${code}`);
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
    return `/editor/${this.jobId}?folder=${encodeURIComponent(this.tempDir)}`;
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
