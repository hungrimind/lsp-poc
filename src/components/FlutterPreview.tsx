import { useState } from 'react';

interface FlutterPreviewProps {
  dartCode: string;
}

export default function FlutterPreview({ dartCode }: FlutterPreviewProps) {
  const [status, setStatus] = useState<string>('');
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  async function compileAndRun() {
    try {
      setStatus('Compiling...');
      setIsPreviewVisible(false);

      // Convert dart code to base64
      const base64Code = btoa(dartCode);
      
      const response = await fetch('/api/flutter/compile.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          fileContent: base64Code,
          path: 'lib/main.dart'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Get iframe element and write content
        const iframe = document.getElementById('flutterApp') as HTMLIFrameElement;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        
        if (iframeDoc) {
          // Create URLs for all necessary files
          const flutterJs = atob(result.compiledFiles['flutter.js']);
          const mainJs = atob(result.compiledFiles['main.dart.js']);
          const manifestJson = atob(result.compiledFiles['manifest.json']);
          
          // Write the complete HTML structure with proper Flutter initialization
          iframeDoc.open();
          iframeDoc.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <base href="/">
              <meta charset="UTF-8">
              <title>Flutter App</title>
              <script>
                // Flutter initialization code
                window.addEventListener('load', function() {
                  _flutter.loader.load({
                    onEntrypointLoaded: async function(engineInitializer) {
                      let appRunner = await engineInitializer.initializeEngine();
                      await appRunner.runApp();
                    }
                  });
                });
              </script>
              <script>
                ${flutterJs}
              </script>
            </head>
            <body>
              <script>
                window.flutterWebRenderer = "html";
              </script>
              <script defer src="main.dart.js"></script>
              <script>
                ${mainJs}
              </script>
            </body>
            </html>
          `);
          iframeDoc.close();
        }
        
        setIsPreviewVisible(true);
        setStatus('Compilation successful!');
      } else {
        setStatus('Compilation failed');
        console.error('Compilation failed:', result);
      }
    } catch (error) {
      setStatus('Error: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  return (
    <div className="mt-4">
      <button 
        onClick={compileAndRun}
        className="px-4 py-2 bg-[#0175C2] hover:bg-[#015fa3] text-white border-none rounded cursor-pointer"
      >
        Compile and Run
      </button>
      
      <div className="mt-8">
        <div className="mb-4">{status}</div>
        <div className="w-full max-w-[800px] mx-auto aspect-[9/16]">
          <iframe 
            id="flutterApp" 
            className={`w-full h-full border border-gray-300 rounded ${
              isPreviewVisible ? 'block' : 'hidden'
            }`}
            allow="clipboard-write; cross-origin-isolated; web-share"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads"
          />
        </div>
      </div>
    </div>
  );
}