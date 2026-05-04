import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useCollaboration } from '@/hooks/useCollaboration';
import CollabEditor from '@/components/CollabEditor';
import AuthModal from '@/components/AuthModal';
import SaveFileModal from '@/components/SaveFileModal';
import RoomChat from '@/components/RoomChat';
import { useAuth } from '@/context/AuthContext';
import { LANGUAGES } from '@/constants';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const LANG_EXT = {
  javascript: 'js', typescript: 'ts', python: 'py', java: 'java',
  cpp: 'cpp', csharp: 'cs', go: 'go', ruby: 'rb', swift: 'swift',
};

const RUNNABLE = LANGUAGES.map(l => l.value);

export default function RoomPage() {
  const router = useRouter();
  const { id: roomId, lang, name, avatar: urlAvatar, uname } = router.query;
  
  const [language, setLanguage] = useState('javascript');
  const [roomName, setRoomName] = useState('');
  const [copied, setCopied] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const prevUsersRef = useRef(0);
  const editorInstanceRef = useRef(null);

  // Terminal state
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [terminalOutput, setTerminalOutput] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const terminalEndRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Auth (from context — persists across pages)
  const { user: authUser, token: authToken, login: authLogin, logout: authLogout, isLoggedIn } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // My Files state
  const [myFiles, setMyFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);

  const {
    bindEditor,
    connectionStatus,
    remoteUsers,
    isReady,
    clientId,
    userName,
    userColor,
    userAvatar,
  } = useCollaboration(roomId, { name: uname || undefined, avatar: urlAvatar || undefined }, authUser);

  useEffect(() => {
    if (lang) setLanguage(lang);
    if (name) setRoomName(decodeURIComponent(name));
  }, [lang, name]);

  // Open sidebar by default on desktop only
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 768) {
      setSidebarOpen(true);
    }
  }, []);

  // Load My Files when logged in and files panel opened
  useEffect(() => {
    if (isLoggedIn && filesOpen) loadMyFiles();
  }, [isLoggedIn, filesOpen]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalOutput]);

  // Keyboard shortcut: Ctrl/Cmd + Enter to run
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunCode();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [language]);

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

  // === Run Code ===
  const handleRunCode = useCallback(async () => {
    const editor = editorInstanceRef.current;
    if (!editor || isRunning) return;
    const code = editor.getValue();
    if (!code.trim()) {
      showToast('Nothing to run — editor is empty', 'error');
      return;
    }

    if (!RUNNABLE.includes(language)) {
      setTerminalOpen(true);
      setTerminalOutput(prev => [...prev, {
        type: 'system',
        text: `⚠ Language "${language}" is not supported for execution.\nSupported: All available languages`,
        time: new Date(),
      }]);
      return;
    }

    setTerminalOpen(true);
    setIsRunning(true);
    setTerminalOutput(prev => [...prev, {
      type: 'command',
      text: `▶ Running ${language}...`,
      time: new Date(),
    }]);

    try {
      const res = await fetch(`${API_URL}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });

      const data = await res.json();

      if (data.error) {
        setTerminalOutput(prev => [...prev, {
          type: 'stderr',
          text: data.error,
          time: new Date(),
        }]);
      } else {
        if (data.stdout) {
          setTerminalOutput(prev => [...prev, {
            type: 'stdout',
            text: data.stdout,
            time: new Date(),
          }]);
        }
        if (data.stderr) {
          setTerminalOutput(prev => [...prev, {
            type: 'stderr',
            text: data.stderr,
            time: new Date(),
          }]);
        }
        if (!data.stdout && !data.stderr) {
          setTerminalOutput(prev => [...prev, {
            type: 'system',
            text: '(no output)',
            time: new Date(),
          }]);
        }
        setTerminalOutput(prev => [...prev, {
          type: 'info',
          text: `✓ Exit code: ${data.exitCode} | ${data.duration}ms`,
          time: new Date(),
        }]);
      }
    } catch (err) {
      setTerminalOutput(prev => [...prev, {
        type: 'stderr',
        text: `Failed to connect to execution server: ${err.message}`,
        time: new Date(),
      }]);
    } finally {
      setIsRunning(false);
    }
  }, [language, isRunning, showToast]);

  const handleClearTerminal = useCallback(() => {
    setTerminalOutput([]);
  }, []);

  // === Terminal resize drag ===
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startY = e.clientY || e.touches?.[0]?.clientY;
    const startH = terminalHeight;

    const onMove = (ev) => {
      const y = ev.clientY || ev.touches?.[0]?.clientY;
      const delta = startY - y;
      const newH = Math.max(100, Math.min(startH + delta, window.innerHeight - 200));
      setTerminalHeight(newH);
    };
    const onUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
  }, [terminalHeight]);

  // Download file locally
  const handleDownloadFile = useCallback(() => {
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
    showToast(`Downloaded ${filename}`, 'success');
  }, [language, roomName, roomId, showToast]);

  // Cloud save — opens auth modal if not logged in, or save modal if logged in
  const handleCloudSave = useCallback(() => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }
    setShowSaveModal(true);
  }, [isLoggedIn]);

  const handleAuthSuccess = useCallback((user, token) => {
    authLogin(user, token);
    setShowAuthModal(false);
    showToast(`Welcome, ${user.username}!`, 'success');
    // After login, open save modal
    setTimeout(() => setShowSaveModal(true), 300);
  }, [showToast, authLogin]);

  const handleFileSaved = useCallback((file) => {
    setShowSaveModal(false);
    showToast(`Saved "${file.filename}" to cloud ☁`, 'success');
    // Refresh file list if open
    if (filesOpen) loadMyFiles();
  }, [showToast, filesOpen]);

  const handleLogout = useCallback(() => {
    authLogout();
    setMyFiles([]);
    setFilesOpen(false);
    showToast('Logged out', 'success');
  }, [showToast, authLogout]);

  // === My Files ===
  const loadMyFiles = useCallback(async () => {
    if (!authToken) return;
    setFilesLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/files`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) setMyFiles(await res.json());
    } catch (e) {} finally {
      setFilesLoading(false);
    }
  }, [authToken]);

  const handleOpenFile = useCallback(async (fileId) => {
    if (!authToken || !editorInstanceRef.current) return;
    try {
      const res = await fetch(`${API_URL}/api/files/${fileId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) { showToast('Failed to load file', 'error'); return; }
      const file = await res.json();
      // Set editor content
      const editor = editorInstanceRef.current;
      const model = editor.getModel();
      editor.executeEdits('load-file', [{
        range: model.getFullModelRange(),
        text: file.content,
      }]);
      // Update language if different
      if (file.language && file.language !== language) {
        setLanguage(file.language);
        const url = new URL(window.location);
        url.searchParams.set('lang', file.language);
        window.history.replaceState({}, '', url);
      }
      showToast(`Opened "${file.filename}"`, 'success');
    } catch (e) {
      showToast('Failed to load file', 'error');
    }
  }, [authToken, language, showToast]);

  const handleDeleteFile = useCallback(async (fileId, filename) => {
    if (!authToken) return;
    try {
      const res = await fetch(`${API_URL}/api/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        setMyFiles(prev => prev.filter(f => f.id !== fileId));
        showToast(`Deleted "${filename}"`, 'success');
      }
    } catch (e) {}
  }, [authToken, showToast]);

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

  const canRun = RUNNABLE.includes(language);

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

              {/* Run Code */}
              <button
                id="run-code-btn"
                className={`btn-run ${isRunning ? 'running' : ''} ${!canRun ? 'disabled' : ''}`}
                onClick={handleRunCode}
                disabled={isRunning || !canRun}
                title={canRun ? `Run ${language} (Ctrl+Enter)` : `${language} execution not supported`}
              >
                {isRunning ? (
                  <><div className="run-spinner" /> Running...</>
                ) : (
                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg> <span className="btn-label-desktop">Run</span></>
                )}
              </button>

              {/* Toggle Terminal */}
              <button
                className={`btn-copy-room ${terminalOpen ? 'active' : ''}`}
                onClick={() => setTerminalOpen(p => !p)}
                title="Toggle terminal"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <span className="btn-label-desktop">Terminal</span>
              </button>

              {/* Download File */}
              <button
                id="download-file-btn"
                className="btn-copy-room"
                onClick={handleDownloadFile}
                title="Download code as file"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>

              {/* Cloud Save */}
              <button
                id="cloud-save-btn"
                className={`btn-cloud-save ${isLoggedIn ? 'logged-in' : ''}`}
                onClick={handleCloudSave}
                title={isLoggedIn ? 'Save to cloud' : 'Sign in to save online'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                <span className="btn-label-desktop">{isLoggedIn ? 'Save' : 'Sign in'}</span>
              </button>

              {/* Copy Room URL */}
              <button
                id="copy-room-btn"
                className={`btn-copy-room ${copied ? 'copied' : ''}`}
                onClick={handleCopyRoomUrl}
              >
                {copied ? '✓ Copied' : '🔗 Share'}
              </button>

              {/* Chat Toggle */}
              <button
                id="chat-toggle-btn"
                className={`btn-copy-room btn-chat-toggle ${chatOpen ? 'active' : ''}`}
                onClick={() => {
                  if (!isLoggedIn) {
                    setShowAuthModal(true);
                    showToast('Sign in to use chat', 'error');
                    return;
                  }
                  setChatOpen(p => !p);
                }}
                title={isLoggedIn ? 'Toggle chat' : 'Sign in to chat'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span className="btn-label-desktop">Chat</span>
              </button>

              {/* Toggle Sidebar */}
              <button
                id="toggle-sidebar-btn"
                className={`btn-copy-room btn-sidebar-toggle ${sidebarOpen ? 'active' : ''}`}
                onClick={() => { setSidebarOpen(prev => !prev); setMobileMenuOpen(false); }}
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
          {/* Editor + Terminal Column */}
          <div className="editor-main">
            <div className="editor-pane" style={terminalOpen ? { flex: `1 1 0`, minHeight: 0 } : { flex: 1 }}>
              {!isReady && connectionStatus === 'connecting' && (
                <div className="editor-loading">
                  <div className="loading-spinner" />
                  <div className="loading-text">Connecting to room...</div>
                </div>
              )}
              <CollabEditor language={language} onEditorReady={handleEditorReady} />
            </div>

            {/* Terminal Panel */}
            {terminalOpen && (
              <div className="terminal-panel" style={{ height: terminalHeight }}>
                {/* Resize Handle */}
                <div
                  className="terminal-resize-handle"
                  onMouseDown={handleResizeStart}
                  onTouchStart={handleResizeStart}
                />

                {/* Terminal Header */}
                <div className="terminal-header">
                  <div className="terminal-header-left">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                    <span>Output</span>
                    {isRunning && <div className="terminal-running-badge">Running</div>}
                  </div>
                  <div className="terminal-header-right">
                    <button className="terminal-action" onClick={handleClearTerminal} title="Clear">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      Clear
                    </button>
                    <button className="terminal-action" onClick={() => setTerminalOpen(false)} title="Close terminal">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                  </div>
                </div>

                {/* Terminal Body */}
                <div className="terminal-body">
                  {terminalOutput.length === 0 ? (
                    <div className="terminal-empty">
                      <span>Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> or click <strong>▶ Run</strong> to execute your code</span>
                      <span className="terminal-supported">Supported: All available languages</span>
                    </div>
                  ) : (
                    terminalOutput.map((entry, i) => (
                      <div key={i} className={`terminal-line terminal-${entry.type}`}>
                        <pre>{entry.text}</pre>
                      </div>
                    ))
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* Chat Panel (between editor and sidebar) */}
          {chatOpen && isLoggedIn && (
            <RoomChat
              roomId={roomId}
              token={authToken}
              user={authUser}
              avatar={userAvatar}
              isOpen={chatOpen}
              onClose={() => setChatOpen(false)}
            />
          )}

          {/* Sidebar backdrop (mobile) */}
          {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

          {/* Sidebar */}
          <aside className={`editor-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
            {/* Close button (mobile) */}
            <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
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

            {/* Account section */}
            <div className="sidebar-section">
              <h4>Account</h4>
              {isLoggedIn ? (
                <div className="sidebar-account">
                  <div className="sidebar-account-info">
                    <span className="sidebar-account-avatar">{userAvatar || authUser?.avatar || '🦊'}</span>
                    <div className="sidebar-account-details">
                      <span className="sidebar-account-name">{authUser?.username}</span>
                      <span className="sidebar-account-email">{authUser?.email}</span>
                    </div>
                  </div>
                  <button className="btn-logout" onClick={handleLogout}>Sign out</button>
                </div>
              ) : (
                <button className="btn-signin" onClick={() => setShowAuthModal(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  Sign in to save files
                </button>
              )}
            </div>

            {/* My Files section — only when logged in */}
            {isLoggedIn && (
              <div className="sidebar-section">
                <div className="sidebar-files-header">
                  <h4 onClick={() => setFilesOpen(p => !p)} style={{ cursor: 'pointer' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: filesOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 150ms', marginRight: '4px' }}>
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                    My Files ({myFiles.length})
                  </h4>
                  {filesOpen && (
                    <button className="sidebar-files-refresh" onClick={loadMyFiles} title="Refresh">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={filesLoading ? { animation: 'spin 0.6s linear infinite' } : {}}>
                        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                    </button>
                  )}
                </div>
                {filesOpen && (
                  <div className="sidebar-files-list">
                    {filesLoading && myFiles.length === 0 ? (
                      <div className="sidebar-files-empty">Loading...</div>
                    ) : myFiles.length === 0 ? (
                      <div className="sidebar-files-empty">No saved files yet</div>
                    ) : (
                      myFiles.map(f => (
                        <div key={f.id} className="sidebar-file-item">
                          <div className="sidebar-file-info" onClick={() => handleOpenFile(f.id)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            <div className="sidebar-file-meta">
                              <span className="sidebar-file-name">{f.filename}</span>
                              <span className="sidebar-file-lang">{f.language}</span>
                            </div>
                          </div>
                          <button className="sidebar-file-delete" onClick={() => handleDeleteFile(f.id, f.filename)} title="Delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

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

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuth={handleAuthSuccess}
        />
      )}

      {/* Save File Modal */}
      {showSaveModal && (
        <SaveFileModal
          onClose={() => setShowSaveModal(false)}
          language={language}
          defaultName={`${(roomName || roomId || 'code').replace(/[^a-zA-Z0-9_-]/g, '_')}.${LANG_EXT[language] || 'txt'}`}
          content={editorInstanceRef.current?.getValue() || ''}
          token={authToken}
          onSaved={handleFileSaved}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </>
  );
}
