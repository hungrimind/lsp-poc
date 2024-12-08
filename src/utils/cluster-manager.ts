import { FlutterProcess } from './flutter-process';

const PORT_START = 8000;
let nextPort = PORT_START;

const processes = new Map<string, FlutterProcess>();
const jobStatuses = new Map<string, { 
  status: string, 
  compiledFiles?: Record<string, string>, 
  port?: number, 
  tempDir?: string,
  lastAccessed?: number 
}>();

const JOB_TIMEOUT = 1000 * 60 * 10; // 10 minutes

function getNextPort() {
  return nextPort++;
}

export async function startJob(jobId: string, tempDir: string): Promise<void> {
  console.log(`Starting job ${jobId}`);
  const port = getNextPort();
  const process = new FlutterProcess(tempDir, jobId, port);
  processes.set(jobId, process);
  jobStatuses.set(jobId, { status: 'starting', port, tempDir });
  
  try {
    await process.start();
    jobStatuses.set(jobId, { 
      status: 'compiled',
      port,
      tempDir
    });
  } catch (error) {
    console.error('Process start error:', error);
    jobStatuses.set(jobId, { 
      status: 'error',
      port,
      tempDir
    });
    throw error;
  }
}

export async function hotRestartJob(jobId: string): Promise<void> {
  const process = processes.get(jobId);
  if (!process) throw new Error('Process not found');
  
  const currentStatus = await getJobStatus(jobId);
  if (!currentStatus?.port) throw new Error('Port not found');
  
  await process.hotRestart();
  const compiledFiles = await process.getCompiledFiles();
  jobStatuses.set(jobId, { 
    status: 'compiled',
    compiledFiles,
    port: currentStatus.port,
    tempDir: currentStatus.tempDir
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
    process.cleanup();
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
