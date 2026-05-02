import { useState, useCallback, useEffect, useRef } from 'react';
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState(null);
  const prevUsersRef = useRef(0);

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
              className={`btn-copy-room ${sidebarOpen ? 'active' : ''}`}
              onClick={() => setSidebarOpen(prev => !prev)}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              ☰
            </button>

            {/* Leave Room */}
            <button
              id="leave-room-btn"
              className="btn-leave-room"
              onClick={handleLeaveRoom}
              title="Leave room"
            >
              ✕ Leave
            </button>
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
