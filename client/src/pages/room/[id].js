import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useCollaboration } from '@/hooks/useCollaboration';
import CollabEditor from '@/components/CollabEditor';
import { LANGUAGES } from '@/constants';

export default function RoomPage() {
  const router = useRouter();
  const { id: roomId, lang, name, avatar: urlAvatar, uname } = router.query;
  
  const [language, setLanguage] = useState('javascript');
  const [roomName, setRoomName] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [toast, setToast] = useState(null);

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

  // Set language and room name from URL params
  useEffect(() => {
    if (lang) setLanguage(lang);
    if (name) setRoomName(decodeURIComponent(name));
  }, [lang, name]);

  // Show toast when users join/leave
  useEffect(() => {
    if (remoteUsers.length > 0) {
      const lastUser = remoteUsers[remoteUsers.length - 1];
      showToast(`${lastUser.avatar || '🦊'} ${lastUser.name} joined`, 'success');
    }
  }, [remoteUsers.length]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleEditorReady = useCallback((editor, monaco) => {
    bindEditor(editor, monaco);
  }, [bindEditor]);

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

  if (!roomId) return null;

  const allUsers = [
    { clientId, name: userName, color: userColor, avatar: userAvatar || '🦊', isYou: true },
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
              <div className="editor-logo-icon">⚡</div>
              <span>CodeSync</span>
            </div>
            <span className="editor-room-name" title={roomId}>
              {roomName || roomId}
            </span>
          </div>

          <div className="editor-header-right">
            {/* Connection Status */}
            <div className="connection-status">
              <span className={`connection-dot ${connectionStatus}`} />
              <span>{connectionStatus === 'connected' ? 'Live' : connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}</span>
            </div>

            {/* Connected Users with Avatars */}
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
              className="btn-copy-room"
              onClick={() => setShowSidebar(!showSidebar)}
              title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
            >
              {showSidebar ? '◨' : '◧'}
            </button>
          </div>
        </header>

        {/* Editor + Sidebar */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Editor */}
          <div style={{ flex: 1, position: 'relative' }}>
            {!isReady && connectionStatus === 'connecting' && (
              <div className="editor-loading">
                <div className="loading-spinner" />
                <div className="loading-text">Connecting to room...</div>
              </div>
            )}
            <CollabEditor language={language} onEditorReady={handleEditorReady} />
          </div>

          {/* Sidebar */}
          {showSidebar && (
            <aside className="editor-sidebar">
              <div className="sidebar-section">
                <h4>Connected Users ({allUsers.length})</h4>
                <div className="sidebar-user-list">
                  {allUsers.map((user) => (
                    <div key={user.clientId} className="sidebar-user">
                      <span className="sidebar-user-avatar">{user.avatar}</span>
                      <div className="sidebar-user-info">
                        <span className="sidebar-user-name" style={{ color: user.color }}>
                          {user.name} {user.isYou && <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>(You)</span>}
                        </span>
                        {user.cursor && (
                          <span className="sidebar-user-line">Ln {user.cursor.lineNumber}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sidebar-section">
                <h4>Room Info</h4>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Room ID:</span>
                    <br />
                    <code className="mono" style={{ fontSize: '0.75rem' }}>{roomId}</code>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Language:</span>
                    <br />
                    <span>{LANGUAGES.find(l => l.value === language)?.label || language}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Your name:</span>
                    <br />
                    <span style={{ color: userColor }}>{userAvatar} {userName}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Sync:</span>
                    <br />
                    <span>CRDT (Yjs/YATA)</span>
                  </div>
                </div>
              </div>

              <div className="sidebar-section" style={{ marginTop: 'auto' }}>
                <h4>How it Works</h4>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  <p>Every character gets a unique ID. Edits are conflict-free — 
                  applying them in any order produces the same result (CRDT guarantee).</p>
                  <p style={{ marginTop: '0.5rem' }}>Cursors sync separately as lightweight 
                  ephemeral messages.</p>
                </div>
              </div>
            </aside>
          )}
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
