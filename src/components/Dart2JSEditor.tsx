import { useState } from "react";

interface Dart2JSEditorProps {
  initialCode: string;
}

export default function Dart2JSEditor({ initialCode }: Dart2JSEditorProps) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function updateFrameFile(code: string) {
    try {
      const response = await fetch("/api/flutter/update-frame.json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: code }),
      });

      if (!response.ok) {
        console.log(response);
        throw new Error("Failed to update frame");
      }

      // Force iframe refresh by updating its src
      const iframe = document.querySelector("iframe");
      if (iframe) {
        iframe.src = `/frame.html?t=${Date.now()}`; // Add timestamp to bypass cache
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function compileCode() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/flutter/dart2js.json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileContent: btoa(code),
        }),
      });

      const result = await response.json();

      if (result.success) {
        updateFrameFile(result.files["index.html"]);
      } else {
        setError(result.error || "Compilation failed");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
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
            {loading ? "Compiling..." : "Compile and Preview"}
          </button>
          {error && (
            <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-md">
              {error}
            </div>
          )}
        </div>

        <div className="preview-section">
          <h2 className="text-lg font-bold mb-2">Flutter Web Preview</h2>
          <iframe
            src="/frame.html"
            className="w-full h-[600px] border border-gray-300 rounded-md"
          />
        </div>
      </div>
    </div>
  );
}
