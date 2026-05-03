import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function SaveFileModal({ onClose, language, defaultName, content, token, onSaved }) {
  const [filename, setFilename] = useState(defaultName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existingFiles, setExistingFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);

  useEffect(() => {
    if (token) loadFiles();
  }, [token]);

  async function loadFiles() {
    try {
      const res = await fetch(`${API_URL}/api/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setExistingFiles(data);
      }
    } catch (e) {}
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!filename.trim()) return;
    setSaving(true);
    setError('');

    try {
      const url = selectedFileId
        ? `${API_URL}/api/files/${selectedFileId}`
        : `${API_URL}/api/files`;
      const method = selectedFileId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ filename: filename.trim(), language, content }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save');
        return;
      }

      onSaved(data);
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal save-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-header">
          <div className="auth-logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#51cf66" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <span>Save to Cloud</span>
          </div>
          <button className="auth-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSave}>
          {error && <div className="auth-error">{error}</div>}

          <label className="auth-label">
            File Name
            <input
              type="text"
              className="auth-input"
              placeholder="my-code.js"
              value={filename}
              onChange={(e) => { setFilename(e.target.value); setSelectedFileId(null); }}
              required
              autoFocus
            />
          </label>

          {existingFiles.length > 0 && (
            <div className="save-existing">
              <span className="save-existing-label">Or overwrite existing file:</span>
              <div className="save-file-list">
                {existingFiles.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`save-file-item ${selectedFileId === f.id ? 'selected' : ''}`}
                    onClick={() => { setSelectedFileId(f.id); setFilename(f.filename); }}
                  >
                    <span className="save-file-name">{f.filename}</span>
                    <span className="save-file-meta">{f.language} · {new Date(f.updated_at).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button type="submit" className="auth-submit save-submit" disabled={saving}>
            {saving ? (
              <><div className="auth-spinner" /> Saving...</>
            ) : selectedFileId ? (
              '↻ Update File'
            ) : (
              '☁ Save New File'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
