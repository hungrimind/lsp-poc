import { FlutterProcess } from './flutter-process';
import { CodeServerProcess } from './code-server-process';

const PORT_START = 8000;
let nextPort = PORT_START;

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

function getNextPort() {
  return nextPort++;
}

export async function startJob(jobId: string, tempDir: string): Promise<void> {
  console.log(`Starting job ${jobId}`);
  const flutterPort = getNextPort();
  const codeServerPort = getNextPort();
  
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
  
  try {
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
    console.error('Process start error:', error);
    jobStatuses.set(jobId, { 
      status: 'error',
      flutterPort,
      codeServerPort,
      tempDir
    });
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
  if (process) {
    await Promise.all([
      process.flutter.stop(),
      process.codeServer.stop()
    ]);
    processes.delete(jobId);
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
