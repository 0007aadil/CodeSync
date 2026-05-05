import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { nanoid } from 'nanoid';
import { LANGUAGES, AVATARS } from '@/constants';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function Home() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🦊');
  const [roomName, setRoomName] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [joinCode, setJoinCode] = useState('');
  const [rooms, setRooms] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [tab, setTab] = useState('create');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  useEffect(() => {
    try {
      const savedName = sessionStorage.getItem('collab-user-name');
      const savedAvatar = sessionStorage.getItem('collab-user-avatar');
      if (savedName) setUserName(savedName);
      if (savedAvatar) setSelectedAvatar(savedAvatar);
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchRooms() {
    try {
      const res = await fetch(`${API_URL}/api/rooms`);
      if (res.ok) {
        const data = await res.json();
        setRooms(data.filter(r => r.active && r.clients > 0));
      }
    } catch (err) {}
  }

  function saveIdentity() {
    try {
      const uName = userName.trim();
      if (uName) sessionStorage.setItem('collab-user-name', uName);
      sessionStorage.setItem('collab-user-avatar', selectedAvatar);
    } catch (e) {}
  }

  function handleCreateRoom(e) {
    e.preventDefault();
    setIsCreating(true);
    saveIdentity();
    const roomId = nanoid(10);
    const rName = roomName.trim() || `Room ${roomId.slice(0, 4)}`;
    const uName = userName.trim();
    const params = new URLSearchParams({ lang: language, name: rName, avatar: selectedAvatar });
    if (uName) params.set('uname', uName);
    router.push(`/room/${roomId}?${params.toString()}`);
  }

  function handleJoinRoom(e) {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) return;
    saveIdentity();
    const match = code.match(/\/room\/([a-zA-Z0-9_-]+)/);
    const roomId = match ? match[1] : code;
    const uName = userName.trim();
    const params = new URLSearchParams({ avatar: selectedAvatar });
    if (uName) params.set('uname', uName);
    router.push(`/room/${roomId}?${params.toString()}`);
  }

  return (
    <>
      <Head>
        <title>CodeSync — Real-time Collaborative Code Editor</title>
        <meta name="description" content="A full-stack collaborative IDE featuring real-time CRDT sync, live terminal execution, WebRTC video chat, and cloud saves." />
        <meta name="keywords" content="collaborative code editor, real-time IDE, online code editor, pair programming, WebRTC video chat, live code execution, Yjs, CRDT, monaco editor, CodeSync" />
        <meta property="og:title" content="CodeSync — Collaborative Code Editor" />
        <meta property="og:description" content="Code together in real-time. A modern collaborative IDE featuring live cursors, an interactive terminal, and WebRTC video calling." />
        <meta property="og:type" content="website" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />
      </Head>

      <div className="landing-page">
        <div className="landing-bg" />

        {/* Nav */}
        <nav className="landing-nav">
          <div className="landing-nav-logo">
            <svg className="landing-logo-svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="url(#lg)" />
              <path d="M7 8h10M7 12h6M7 16h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              <defs><linearGradient id="lg" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#ff6363" /><stop offset="1" stopColor="#ffb347" /></linearGradient></defs>
            </svg>
            <span>CodeSync</span>
          </div>
          <div className="landing-nav-links">
            <Link href="/about" className="landing-nav-link">About</Link>
            <Link href="/feedback" className="landing-nav-link">Feedback</Link>
            <a href="https://github.com/0007aadil/CodeSync" target="_blank" rel="noopener noreferrer" className="landing-nav-link">GitHub</a>
          </div>
        </nav>

        {/* Main */}
        <div className="landing-main">
          {/* Left: Hero */}
          <div className="landing-hero">
            <h1>Code together,<br /><span className="gradient-text">in real time.</span></h1>
            <p className="hero-subtitle">
              Collaborative code editor with live cursors, conflict-free CRDT sync, and VS Code-grade editing. No signup required.
            </p>
            <div className="hero-pills">
              <span className="hero-pill">Real-time sync</span>
              <span className="hero-pill">Live cursors</span>
              <span className="hero-pill">Monaco editor</span>
              <span className="hero-pill">Persistent code</span>
            </div>
          </div>

          {/* Right: Action Panel */}
          <div className="landing-panel">
            {/* Avatar + Name */}
            <div className="panel-identity">
              <div className="avatar-big" onClick={() => setAvatarPickerOpen(p => !p)} style={{ cursor: 'pointer' }}>{selectedAvatar}</div>
              <button className="avatar-toggle-btn" onClick={() => setAvatarPickerOpen(p => !p)} title="Change avatar">
                ⋯
              </button>
              <input
                id="user-name-input"
                type="text"
                className="input-field panel-name-input"
                placeholder="Your display name..."
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                maxLength={30}
              />
            </div>

            {/* Avatar Grid — collapsible */}
            {avatarPickerOpen && (
              <div className="avatar-picker">
                {AVATARS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    className={`avatar-option ${selectedAvatar === av ? 'selected' : ''}`}
                    onClick={() => { setSelectedAvatar(av); setAvatarPickerOpen(false); }}
                  >
                    {av}
                  </button>
                ))}
              </div>
            )}

            {/* Tab Switcher */}
            <div className="panel-tabs">
              <button
                className={`panel-tab ${tab === 'create' ? 'active' : ''}`}
                onClick={() => setTab('create')}
              >
                Create Room
              </button>
              <button
                className={`panel-tab ${tab === 'join' ? 'active' : ''}`}
                onClick={() => setTab('join')}
              >
                Join Room
              </button>
            </div>

            {/* Create Tab */}
            {tab === 'create' && (
              <form className="panel-form" onSubmit={handleCreateRoom}>
                <div className="input-row">
                  <input
                    id="room-name-input"
                    type="text"
                    className="input-field"
                    placeholder="Room name (optional)"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    maxLength={50}
                  />
                  <select
                    id="language-select"
                    className="select-field"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    {LANGUAGES.map(lang => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button id="create-room-btn" type="submit" className="btn-primary" disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create Room'}
                </button>
              </form>
            )}

            {/* Join Tab */}
            {tab === 'join' && (
              <form className="panel-form" onSubmit={handleJoinRoom}>
                <input
                  id="join-room-input"
                  type="text"
                  className="input-field"
                  placeholder="Paste room URL or ID..."
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                />
                <button id="join-room-btn" type="submit" className="btn-primary">
                  Join Room
                </button>
              </form>
            )}

            {/* Active Rooms */}
            {rooms.length > 0 && (
              <div className="panel-rooms">
                <div className="panel-rooms-label">Active Rooms</div>
                {rooms.map((room) => (
                  <div key={room.id} className="room-item" onClick={() => { saveIdentity(); router.push(`/room/${room.id}?avatar=${selectedAvatar}${userName.trim() ? '&uname=' + userName.trim() : ''}`); }}>
                    <div className="room-item-info">
                      <span className="room-item-name">{room.name || room.id}</span>
                      <span className="room-item-lang">{room.language || 'js'}</span>
                    </div>
                    <div className="room-item-users">
                      <span className="room-item-dot" />
                      {room.clients}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="landing-footer">
          <span>&copy; {new Date().getFullYear()} CodeSync. All rights reserved.</span>
          <span style={{ margin: '0 10px', opacity: 0.5 }}>|</span>
          <a href="https://github.com/0007aadil/CodeSync" target="_blank" rel="noopener noreferrer">Source Code</a>
        </footer>
      </div>
    </>
  );
}
