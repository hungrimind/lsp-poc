import { useState, useEffect } from 'react';

interface FlutterEditorProps {
  initialCode: string;
}

interface JobInfo {
  jobId: string;
  status: string;
}

interface JobStatus {
  success: boolean;
  status: string;
  urls?: {
    flutter: string;
    editor: string;
  };
}

export default function FlutterEditor({ initialCode }: FlutterEditorProps) {
  const [status, setStatus] = useState<string>('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [showJobs, setShowJobs] = useState(false);
  const [editorUrl, setEditorUrl] = useState<string | null>(null);
  const [flutterUrl, setFlutterUrl] = useState<string | null>(null);

  useEffect(() => {
    if (showJobs) {
      fetchJobs();
    }
  }, [showJobs]);

  async function startApp() {
    try {
      setStatus('Starting Flutter app...');
      
      const response = await fetch('/api/flutter/start.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileContent: btoa(initialCode),
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

  async function hotRestart() {
    if (!jobId) return;

    try {
      setStatus('Hot restarting...');
      const response = await fetch('/api/flutter/hot-restart.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId })
      });

      const result = await response.json();
      if (result.success) {
        setStatus('Hot restarted');
        // Force preview refresh by temporarily clearing and resetting the URL
        if (flutterUrl) {
          setFlutterUrl(null);
          setTimeout(() => setFlutterUrl(flutterUrl), 100);
        }
      } else {
        setStatus('Hot restart failed');
      }
    } catch (error) {
      setStatus('Hot restart error: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  async function fetchJobs() {
    try {
      const response = await fetch('/api/flutter/jobs.json');
      const result = await response.json();
      if (result.success) {
        setJobs(result.jobs);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  }

  async function pollStatus(id: string) {
    const maxAttempts = 60;
    const pollInterval = 2000;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch('/api/flutter/status.json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jobId: id })
        });

        const result: JobStatus = await response.json();
        
        if (result.success) {
          setStatus(result.status);
          
          if (result.urls) {
            setEditorUrl(result.urls.editor);
            setFlutterUrl(result.urls.flutter);
          }

          if (result.status === 'compiled') {
            break;
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <div className="flex justify-between items-center p-2 bg-gray-100 border-b border-gray-200">
        <div className="flex gap-2">
          <button
            onClick={startApp}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm"
          >
            Run Flutter App
          </button>
          {jobId && (
            <button
              onClick={hotRestart}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-sm"
            >
              Hot Restart
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          {status && (
            <span className="text-sm text-gray-700">Status: {status}</span>
          )}
          <button
            onClick={() => setShowJobs(!showJobs)}
            className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded text-sm"
          >
            {showJobs ? 'Hide Jobs' : 'Show Jobs'}
          </button>
        </div>
      </div>

      {showJobs && jobs.length > 0 && (
        <div className="p-2 bg-gray-50 border-b border-gray-200">
          <h3 className="font-bold mb-1 text-sm">Running Jobs:</h3>
          <ul className="space-y-1">
            {jobs.map((job) => (
              <li key={job.jobId} className="flex items-center gap-2 text-sm">
                <span className="font-mono">Job {job.jobId}</span>
                <span className="text-gray-600">({job.status})</span>
                {job.jobId === jobId && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">current</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[75%] h-full">
          {editorUrl ? (
            <iframe
              src={editorUrl}
              className="w-full h-full border-r border-gray-200"
              title="VS Code Editor"
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <p className="text-gray-500">Click "Run Flutter App" to start the editor</p>
            </div>
          )}
        </div>
        
        <div className="w-[25%] h-full">
          {flutterUrl ? (
            <iframe
              src={flutterUrl}
              className="w-full h-full"
              title="Flutter Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <p className="text-gray-500">Flutter preview will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}