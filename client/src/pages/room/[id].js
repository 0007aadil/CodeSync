import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useCollaboration } from '@/hooks/useCollaboration';
import CollabEditor from '@/components/CollabEditor';
import { LANGUAGES } from '@/constants';

const LANG_EXT = {
  javascript: 'js', typescript: 'ts', python: 'py', java: 'java',
  cpp: 'cpp', csharp: 'cs', go: 'go', rust: 'rs', ruby: 'rb',
  php: 'php', swift: 'swift', kotlin: 'kt', html: 'html', css: 'css',
  sql: 'sql', markdown: 'md', json: 'json', yaml: 'yaml',
};

export default function RoomPage() {
  const router = useRouter();
  const { id: roomId, lang, name, avatar: urlAvatar, uname } = router.query;
  
  const [language, setLanguage] = useState('javascript');
  const [roomName, setRoomName] = useState('');
  const [copied, setCopied] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const prevUsersRef = useRef(0);
  const editorInstanceRef = useRef(null);

  const {
    bindEditor,
    connectionStatus,
    remoteUsers,
    isReady,
    clientId,
    userName,
    userColor,
    userAvatar,
  } = useCollaboration(roomId, { name: uname || undefined, avatar: urlAvatar || undefined });

  useEffect(() => {
    if (lang) setLanguage(lang);
    if (name) setRoomName(decodeURIComponent(name));
  }, [lang, name]);

  // Toast on join/leave
  useEffect(() => {
    const prev = prevUsersRef.current;
    const curr = remoteUsers.length;
    if (curr > prev && curr > 0) {
      const lastUser = remoteUsers[curr - 1];
      showToast(`${lastUser.avatar || '🦊'} ${lastUser.name} joined`, 'success');
    } else if (curr < prev && prev > 0) {
      showToast('A user left the room', 'error');
    }
    prevUsersRef.current = curr;
  }, [remoteUsers.length]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleEditorReady = useCallback((editor, monaco) => {
    editorInstanceRef.current = editor;
    bindEditor(editor, monaco);
  }, [bindEditor]);

  const handleSaveFile = useCallback(() => {
    const editor = editorInstanceRef.current;
    if (!editor) return;
    const content = editor.getValue();
    const ext = LANG_EXT[language] || 'txt';
    const filename = `${(roomName || roomId || 'code').replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Saved as ${filename}`, 'success');
  }, [language, roomName, roomId, showToast]);

  const handleCopyRoomUrl = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast('Room URL copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [showToast]);

  const handleLanguageChange = useCallback((e) => {
    setLanguage(e.target.value);
    const url = new URL(window.location);
    url.searchParams.set('lang', e.target.value);
    window.history.replaceState({}, '', url);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    router.push('/');
  }, [router]);

  if (!roomId) return null;

  const allUsers = [
    { clientId, name: userName, color: userColor, avatar: userAvatar || '🦊', isYou: true, isTyping: false },
    ...remoteUsers.map(u => ({ ...u, isYou: false })),
  ];

  return (
    <>
      <Head>
        <title>{roomName || roomId} — CodeSync</title>
        <meta name="description" content={`Collaborative editing room: ${roomName || roomId}`} />
      </Head>

      <div className="editor-page">
        {/* Header */}
        <header className="editor-header">
          <div className="editor-header-left">
            <div className="editor-logo" onClick={() => router.push('/')} title="Back to home">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="url(#lg2)" />
                <path d="M7 8h10M7 12h6M7 16h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                <defs><linearGradient id="lg2" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#ff6363" /><stop offset="1" stopColor="#ffb347" /></linearGradient></defs>
              </svg>
              <span>CodeSync</span>
            </div>
            <span className="editor-room-name" title={roomId}>
              {roomName || roomId}
            </span>
          </div>

          <div className="editor-header-right">
            {/* Mobile menu toggle */}
            <button
              className="btn-mobile-menu"
              onClick={() => setMobileMenuOpen(p => !p)}
              aria-label="Toggle menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {mobileMenuOpen ? (
                  <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                ) : (
                  <><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></>
                )}
              </svg>
            </button>

            <div className={`header-controls ${mobileMenuOpen ? 'open' : ''}`}>
              {/* Connection Status */}
              <div className="connection-status">
                <span className={`connection-dot ${connectionStatus}`} />
                <span>{connectionStatus === 'connected' ? 'Live' : connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}</span>
              </div>

              {/* Connected Users */}
              <div className="connected-users">
                {allUsers.slice(0, 5).map((user, idx) => (
                  <div
                    key={user.clientId}
                    className="user-avatar"
                    style={{ backgroundColor: user.color, zIndex: allUsers.length - idx }}
                    title={user.isYou ? `${user.name} (You)` : user.name}
                  >
                    <span className="user-avatar-emoji">{user.avatar}</span>
                    <span className="user-avatar-tooltip">{user.isYou ? `${user.name} (You)` : user.name}</span>
                  </div>
                ))}
                {allUsers.length > 5 && (
                  <span className="user-count-badge">+{allUsers.length - 5}</span>
                )}
              </div>

              {/* Language Select */}
              <select
                id="language-select-header"
                className="language-select"
                value={language}
                onChange={handleLanguageChange}
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>

              {/* Save File */}
              <button
                id="save-file-btn"
                className="btn-copy-room"
                onClick={handleSaveFile}
                title="Download code as file"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span className="btn-label-desktop">Save</span>
              </button>

              {/* Copy Room URL */}
              <button
                id="copy-room-btn"
                className={`btn-copy-room ${copied ? 'copied' : ''}`}
                onClick={handleCopyRoomUrl}
              >
                {copied ? '✓ Copied' : '🔗 Share'}
              </button>

              {/* Toggle Sidebar */}
              <button
                id="toggle-sidebar-btn"
                className={`btn-copy-room btn-sidebar-toggle ${sidebarOpen ? 'active' : ''}`}
                onClick={() => setSidebarOpen(prev => !prev)}
                title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="1" y="1" width="14" height="14" rx="2" />
                  <line x1="10" y1="1" x2="10" y2="15" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Editor + Sidebar */}
        <div className="editor-body">
          {/* Editor */}
          <div className="editor-main">
            {!isReady && connectionStatus === 'connecting' && (
              <div className="editor-loading">
                <div className="loading-spinner" />
                <div className="loading-text">Connecting to room...</div>
              </div>
            )}
            <CollabEditor language={language} onEditorReady={handleEditorReady} />
          </div>

          {/* Sidebar */}
          <aside className={`editor-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-section">
              <h4>Connected Users ({allUsers.length})</h4>
              <div className="sidebar-user-list">
                {allUsers.map((user) => (
                  <div key={user.clientId} className="sidebar-user">
                    <span className="sidebar-user-avatar">{user.avatar}</span>
                    <div className="sidebar-user-info">
                      <span className="sidebar-user-name" style={{ color: user.color }}>
                        {user.name}
                        {user.isYou && <span className="sidebar-you-tag">You</span>}
                      </span>
                      <span className="sidebar-user-status">
                        {user.isTyping ? (
                          <span className="typing-indicator">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            typing...
                          </span>
                        ) : user.cursor ? (
                          <span>Ln {user.cursor.lineNumber}</span>
                        ) : (
                          <span>Idle</span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <h4>Room Info</h4>
              <div className="sidebar-info-grid">
                <div className="sidebar-info-item">
                  <span className="sidebar-info-label">Room</span>
                  <code className="mono sidebar-info-value">{roomId?.slice(0, 10)}</code>
                </div>
                <div className="sidebar-info-item">
                  <span className="sidebar-info-label">Language</span>
                  <span className="sidebar-info-value">{LANGUAGES.find(l => l.value === language)?.label || language}</span>
                </div>
                <div className="sidebar-info-item">
                  <span className="sidebar-info-label">You</span>
                  <span className="sidebar-info-value" style={{ color: userColor }}>{userAvatar} {userName}</span>
                </div>
                <div className="sidebar-info-item">
                  <span className="sidebar-info-label">Sync</span>
                  <span className="sidebar-info-value">CRDT (Yjs)</span>
                </div>
              </div>
            </div>

            {/* Leave Room — at bottom */}
            <div className="sidebar-leave">
              <button className="btn-leave-room" onClick={handleLeaveRoom}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Leave Room
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </>
  );
}
