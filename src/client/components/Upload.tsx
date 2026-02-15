import { useState } from 'react';
import './Upload.css';

type UploadType = 'imessage' | 'openai' | 'anthropic' | 'generic';

export default function Upload() {
  const [uploadType, setUploadType] = useState<UploadType>('imessage');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setFile(files[0]);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${import.meta.env.BASE_URL}api/upload/${uploadType}`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Upload failed: ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
      setFile(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="upload">
      <h1>Upload & Import</h1>

      <div className="upload-type-selector">
        <button
          className={uploadType === 'imessage' ? 'active' : ''}
          onClick={() => setUploadType('imessage')}
        >
          📱 iMessage (chat.db)
        </button>
        <button
          className={uploadType === 'openai' ? 'active' : ''}
          onClick={() => setUploadType('openai')}
        >
          🤖 OpenAI Export
        </button>
        <button
          className={uploadType === 'anthropic' ? 'active' : ''}
          onClick={() => setUploadType('anthropic')}
        >
          🧠 Anthropic/Claude Export
        </button>
        <button
          className={uploadType === 'generic' ? 'active' : ''}
          onClick={() => setUploadType('generic')}
        >
          📄 Generic JSON
        </button>
      </div>

      <div className="upload-info">
        {uploadType === 'imessage' && (
          <p>Upload your iMessage chat.db file (SQLite database from ~/Library/Messages/)</p>
        )}
        {uploadType === 'openai' && (
          <p>Upload your OpenAI chat history export (JSON format from openai.com)</p>
        )}
        {uploadType === 'anthropic' && (
          <p>Upload your Claude chat history export (JSON format from claude.ai)</p>
        )}
        {uploadType === 'generic' && (
          <p>Upload a JSON array with fields: content, sender, recipient, timestamp</p>
        )}
      </div>

      <form onSubmit={handleUpload}>
        <div
          className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {file ? (
            <div className="file-selected">
              <span className="file-icon">📎</span>
              <span className="file-name">{file.name}</span>
              <button
                type="button"
                className="remove-file"
                onClick={() => setFile(null)}
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <div className="drop-icon">📤</div>
              <p>Drag & drop your file here</p>
              <p className="drop-or">or</p>
              <label className="file-input-label">
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept={uploadType === 'imessage' ? '.db' : '.json'}
                />
                Choose File
              </label>
            </>
          )}
        </div>

        {file && (
          <button type="submit" className="upload-button" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload & Import'}
          </button>
        )}
      </form>

      {error && (
        <div className="result-box error">
          <h3>❌ Error</h3>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="result-box success">
          <h3>✅ Success</h3>
          <p>
            Imported <strong>{result.imported || 0}</strong> messages
            {result.conversations && ` from ${result.conversations} conversations`}
          </p>
        </div>
      )}
    </div>
  );
}
