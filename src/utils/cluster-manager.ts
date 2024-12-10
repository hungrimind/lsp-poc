import { FlutterProcess } from './flutter-process';
import { CodeServerProcess } from './code-server-process';
import { createServer } from 'net';

class PortManager {
  private readonly MIN_PORT = 10000;
  private readonly MAX_PORT = 65535;
  private readonly inUse = new Set<number>();
  private currentPort = this.MIN_PORT;

  async acquirePort(): Promise<number> {
    const startPort = this.currentPort;
    let attemptCount = 0;
    
    while (this.currentPort <= this.MAX_PORT) {
      attemptCount++;
      if (attemptCount % 100 === 0) {
        console.log(`Tried ${attemptCount} ports, current port: ${this.currentPort}`);
      }

      if (!this.inUse.has(this.currentPort)) {
        try {
          const port = this.currentPort++;
          console.log(`Checking port ${port}...`);
          const isAvailable = await this.isPortAvailable(port);
          
          if (isAvailable) {
            console.log(`Successfully acquired port ${port}`);
            this.inUse.add(port);
            return port;
          }
        } catch (error) {
          console.warn(`Port ${this.currentPort} check failed:`, error);
        }
      }
      this.currentPort++;
      
      // Wrap around if we reach MAX_PORT
      if (this.currentPort > this.MAX_PORT) {
        this.currentPort = this.MIN_PORT;
      }
      
      // If we've checked all ports, break
      if (this.currentPort === startPort) {
        console.error('Checked all ports and none were available');
        break;
      }
    }
    
    throw new Error(`No available ports found after ${attemptCount} attempts`);
  }

  releasePort(port: number): void {
    console.log(`Releasing port ${port}`);
    this.inUse.delete(port);
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      
      server.once('error', (err: any) => {
        console.log(`Port ${port} check error:`, err.code);
        server.close();
        resolve(false);
      });

      server.once('listening', () => {
        console.log(`Port ${port} is available`);
        server.close();
        resolve(true);
      });

      server.listen(port, '127.0.0.1');
    });
  }
}

// Singleton instance
export const portManager = new PortManager();

interface JobProcess {
  flutter: FlutterProcess;
  codeServer: CodeServerProcess;
}

interface JobStatus {
  status: string;
  compiledFiles?: Record<string, string>;
  flutterPort?: number;
  codeServerPort?: number;
  tempDir?: string;
  lastAccessed?: number;
}

const processes = new Map<string, JobProcess>();
const jobStatuses = new Map<string, JobStatus>();

const JOB_TIMEOUT = 1000 * 60 * 10; // 10 minutes

export async function startJob(jobId: string, tempDir: string): Promise<void> {
  console.log(`Starting job ${jobId}`);
  
  let flutterPort: number | undefined;
  let codeServerPort: number | undefined;
  
  try {
    flutterPort = await portManager.acquirePort();
    codeServerPort = await portManager.acquirePort();
    
    const flutterProcess = new FlutterProcess(tempDir, jobId, flutterPort);
    const codeServerProcess = new CodeServerProcess(tempDir, jobId, codeServerPort);
    
    processes.set(jobId, { 
      flutter: flutterProcess,
      codeServer: codeServerProcess
    });
    
    jobStatuses.set(jobId, { 
      status: 'starting', 
      flutterPort, 
      codeServerPort,
      tempDir 
    });
    
    await Promise.all([
      flutterProcess.start(),
      codeServerProcess.start()
    ]);
    
    jobStatuses.set(jobId, { 
      status: 'compiled',
      flutterPort,
      codeServerPort,
      tempDir
    });
  } catch (error) {
    if (flutterPort) portManager.releasePort(flutterPort);
    if (codeServerPort) portManager.releasePort(codeServerPort);
    
    processes.delete(jobId);
    jobStatuses.delete(jobId);
    
    throw error;
  }
}

export async function hotRestartJob(jobId: string): Promise<void> {
  const process = processes.get(jobId);
  if (!process) throw new Error('Process not found');
  
  const currentStatus = await getJobStatus(jobId);
  if (!currentStatus?.flutterPort) throw new Error('Flutter port not found');
  
  await process.flutter.hotRestart();
  
  jobStatuses.set(jobId, { 
    ...currentStatus,
    status: 'compiled'
  });
}

export async function getJobStatus(jobId: string) {
  const status = jobStatuses.get(jobId);
  if (status) {
    status.lastAccessed = Date.now();
    jobStatuses.set(jobId, status);
  }
  return status;
}

export async function getRunningJobs() {
  return Array.from(jobStatuses.entries()).map(([jobId, status]) => ({
    jobId,
    status: status.status
  }));
}

export async function cleanupJob(jobId: string): Promise<void> {
  const process = processes.get(jobId);
  const status = jobStatuses.get(jobId);
  
  if (process) {
    await Promise.all([
      process.flutter.stop(),
      process.codeServer.stop()
    ]);
    processes.delete(jobId);
    
    if (status?.flutterPort) portManager.releasePort(status.flutterPort);
    if (status?.codeServerPort) portManager.releasePort(status.codeServerPort);
  }
  jobStatuses.delete(jobId);
}

// Cleanup inactive jobs periodically
setInterval(() => {
  const now = Date.now();
  jobStatuses.forEach((status, jobId) => {
    if (status.lastAccessed && (now - status.lastAccessed) > JOB_TIMEOUT) {
      cleanupJob(jobId);
    }
  });
}, 1000 * 60); // Check every minute
