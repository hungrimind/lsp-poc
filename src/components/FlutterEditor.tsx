import { useState } from 'react';

interface FlutterEditorProps {
  initialCode: string;
}

interface JobInfo {
  jobId: string;
  status: string;
}

export default function FlutterEditor({ initialCode }: FlutterEditorProps) {
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<string>('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [showJobs, setShowJobs] = useState(false);

  async function startApp() {
    try {
      setStatus('Starting Flutter app...');
      
      const response = await fetch('/api/flutter/start.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileContent: btoa(code),
          path: 'lib/main.dart'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setJobId(result.jobId);
        setStatus('Compiling...');
        await pollStatus(result.jobId);
      }
    } catch (error) {
      setStatus('Error: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  async function pollStatus(id: string) {
    const maxAttempts = 60;
    const pollInterval = 2000;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch('/api/flutter/status.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId: id })
      });

      const result = await response.json();
      
      if (result.success && result.status === 'compiled') {
        const iframe = document.getElementById('flutterApp') as HTMLIFrameElement;
        if (iframe) {
          iframe.src = `/flutter/${id}/index.html`;
        }
        setStatus('Running');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
      attempts++;
    }

    setStatus('Compilation timed out');
  }

  async function hotRestart() {
    if (!jobId) return;
    
    try {
      setStatus('Restarting...');
      const response = await fetch('/api/flutter/hot-restart.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          jobId,
          fileContent: btoa(code)
        })
      });

      const result = await response.json();
      if (result.success) {
        await pollStatus(jobId);
      }
    } catch (error) {
      setStatus('Restart Error: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  async function fetchJobs() {
    try {
      setShowJobs(true);
      const response = await fetch('/api/flutter/jobs.json');
      const result = await response.json();
      
      if (result.success) {
        setJobs(result.jobs);
      } else {
        console.error('Failed to fetch jobs:', result.error);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setJobs([]);
    }
  }

  return (
    <div className="container mx-auto p-4">
      <div className="editor mb-4">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={20}
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono whitespace-pre overflow-x-scroll"
        />
      </div>

      <div className="preview mt-4">
        <div className="flex gap-4 mb-4 items-center">
          <button 
            onClick={startApp}
            className="px-4 py-2 bg-blue-500 text-white rounded-md shadow hover:bg-blue-600 transition"
          >
            Start Flutter App
          </button>
          
          {jobId && (
            <button 
              onClick={hotRestart}
              className="px-4 py-2 bg-green-500 text-white rounded-md shadow hover:bg-green-600 transition"
            >
              Hot Restart
            </button>
          )}
          
          <button 
            onClick={fetchJobs}
            className="px-4 py-2 bg-purple-500 text-white rounded-md shadow hover:bg-purple-600 transition"
          >
            Show Running Jobs
          </button>
          
          <span className="text-gray-700">{status}</span>
        </div>

        {showJobs && (
          <div className="mt-4 p-4 border rounded-md bg-gray-50 shadow">
            <h3 className="font-bold mb-2 text-lg">Running Jobs:</h3>
            {jobs.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {jobs.map((job) => (
                  <li key={job.jobId} className="text-gray-800">
                    Job: {job.jobId} 
                    <span className="ml-2 text-gray-600">({job.status})</span>
                    {job.jobId === jobId && (
                      <span className="text-green-600 ml-2">(current)</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-600">No jobs are currently running.</p>
            )}
          </div>
        )}

        <div className="mt-4" style={{ width: '100%', height: '600px' }}>
          <iframe
            id="flutterApp"
            className="w-full h-full border border-gray-300 rounded-md shadow"
            allow="cross-origin-isolated"
          />
        </div>
      </div>
    </div>
  );
} 