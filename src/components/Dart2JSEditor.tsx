import { useState, useRef, useEffect } from 'react';

interface Dart2JSEditorProps {
  initialCode: string;
}

export default function Dart2JSEditor({ initialCode }: Dart2JSEditorProps) {
  const [code, setCode] = useState(initialCode);
  const [compiledFiles, setCompiledFiles] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (compiledFiles && previewRef.current) {
      // Clear previous content
      previewRef.current.innerHTML = '';
      
      // Create and append the new iframe
      const iframe = setupPreview(compiledFiles);
      previewRef.current.appendChild(iframe);
    }
  }, [compiledFiles]);

  async function compileCode() {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch('/api/flutter/dart2js.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileContent: btoa(code)
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setCompiledFiles(result.files);
        setupPreview(result.files);
      } else {
        setError(result.error || 'Compilation failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function setupPreview(files: Record<string, string>) {
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/require.js/2.3.6/require.min.js"></script>
    </head>
    <body>
      <div id="flutter_target"></div>

      <script>
        // Configure RequireJS first
        require.config({
          waitSeconds: 60,
          paths: {
            'dart_sdk': '/fake/path/dart_sdk',
            'dartpad_main': '/fake/path/dartpad_main'
          }
        });

        // Handle messages from the parent
        window.addEventListener('message', function(event) {
          if (event.data.command === 'execute') {
            eval(event.data.js);
          }
        });

        // Signal ready to parent
        parent.postMessage({ sender: 'frame', type: 'ready' }, '*');

        // Redirect print messages to parent
        function dartPrint(message) {
          parent.postMessage({
            sender: 'frame',
            type: 'stdout',
            message: message.toString()
          }, '*');
        }

        // Error handling
        window.onerror = function(message, url, line, column, error) {
          var errorMessage = error ? ', error: ' + error : '';
          parent.postMessage({
            sender: 'frame',
            type: 'stderr',
            message: message + errorMessage
          }, '*');
        };

        // Initialize Flutter
        window._flutter = {
          loader: {
            didCreateEngineInitializer: async function(engineInitializer) {
              const appRunner = await engineInitializer.initializeEngine({
                hostElement: document.querySelector('#flutter_target')
              });
              await appRunner.runApp();
            }
          }
        };

        // Unload any previous version
        require.undef('dart_sdk');
        require.undef('dartpad_main');

        // Load Flutter.js first (not as AMD)
        const flutterScript = document.createElement('script');
        flutterScript.textContent = ${JSON.stringify(files['flutter.js'])};
        document.body.appendChild(flutterScript);

        // Load the SDK directly first
        const sdkScript = document.createElement('script');
        sdkScript.textContent = ${JSON.stringify(files['dart_sdk.js'])};
        document.body.appendChild(sdkScript);

        // Define the main app module
        define('dartpad_main', ['dart_sdk'], function(sdk) {
          ${files['main.dart.js'].replace('define([', "define('dartpad_main', [")}
          return window.dartpad_main;
        });

        // Initialize the app
        require(['dartpad_main'], function(dartpad_main) {
          window.dart_sdk.dart.setStartAsyncSynchronously(true);
          window.dart_sdk._isolate_helper.startRootIsolate(() => {}, []);

          for (var prop in dartpad_main) {
            if (prop.endsWith("bootstrap")) {
              dartpad_main[prop].main();
            }
          }
        });
      </script>
    </body>
    </html>
  `;

    iframe.srcdoc = html;
    return iframe;
  }

  return (
    <div className="container mx-auto p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="editor-section">
          <h2 className="text-lg font-bold mb-2">Dart Code</h2>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={20}
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono whitespace-pre overflow-x-scroll"
          />
          <button 
            onClick={compileCode}
            disabled={loading}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md shadow hover:bg-blue-600 transition disabled:bg-gray-400"
          >
            {loading ? 'Compiling...' : 'Compile and Preview'}
          </button>
          {error && (
            <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-md">
              {error}
            </div>
          )}
        </div>

        <div className="preview-section">
          <h2 className="text-lg font-bold mb-2">Flutter Web Preview</h2>
          <div
            ref={previewRef}
            className="w-full h-[600px] border border-gray-300 rounded-md"
          />
        </div>
      </div>
    </div>
  );
} 