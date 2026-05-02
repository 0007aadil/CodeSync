import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
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
        <meta name="description" content="Edit code together in real-time with live cursors, CRDT-powered sync, and Monaco editor. No signup required." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />
      </Head>

      <div className="landing-page">
        <div className="landing-bg" />

        <nav className="landing-nav">
          <div className="landing-nav-logo">
            <div className="landing-nav-logo-icon">⚡</div>
            <span>CodeSync</span>
          </div>
          <div className="landing-nav-links">
            <a href="https://github.com/0007aadil/CodeSync" target="_blank" rel="noopener noreferrer" className="landing-nav-link">GitHub</a>
            <a href="#features" className="landing-nav-link">Features</a>
          </div>
        </nav>

        <div className="landing-content">
          {/* Hero */}
          <div className="hero">
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              Real-time collaboration powered by CRDT
            </div>
            <h1>
              Code together,{' '}
              <span className="gradient-text">in real time</span>
            </h1>
            <p className="hero-subtitle">
              A collaborative code editor where multiple people can edit simultaneously.
              See each other&apos;s cursors live, with conflict-free merging powered by Yjs CRDT.
            </p>
          </div>

          {/* Main Card — Identity + Create + Join */}
          <div className="main-card">
            {/* Identity Section */}
            <div className="card-section">
              <label className="input-label">Your Identity</label>
              <div className="identity-row">
                <div className="avatar-preview" title="Your avatar">
                  {selectedAvatar}
                </div>
                <input
                  id="user-name-input"
                  type="text"
                  className="input-field"
                  placeholder="Your display name..."
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  maxLength={30}
                />
              </div>
              <div className="avatar-picker">
                {AVATARS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    className={`avatar-option ${selectedAvatar === av ? 'selected' : ''}`}
                    onClick={() => setSelectedAvatar(av)}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            <div className="card-divider" />

            {/* Create Room */}
            <form className="card-section" onSubmit={handleCreateRoom}>
              <label className="input-label">Create a New Room</label>
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
                {isCreating ? 'Creating...' : 'Create Room →'}
              </button>
            </form>

            <div className="card-divider" />

            {/* Join Room */}
            <form className="card-section" onSubmit={handleJoinRoom}>
              <label className="input-label">Join Existing Room</label>
              <div className="input-row">
                <input
                  id="join-room-input"
                  type="text"
                  className="input-field"
                  placeholder="Paste room URL or ID..."
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                />
                <button id="join-room-btn" type="submit" className="btn-secondary">
                  Join →
                </button>
              </div>
            </form>
          </div>

          {/* Active Rooms */}
          {rooms.length > 0 && (
            <div className="active-rooms">
              <h3>● Active Rooms</h3>
              <div className="room-list">
                {rooms.map((room) => (
                  <div key={room.id} className="room-item" onClick={() => router.push(`/room/${room.id}`)}>
                    <div className="room-item-info">
                      <span className="room-item-name">{room.name || room.id}</span>
                      <span className="room-item-lang">{room.language || 'javascript'}</span>
                    </div>
                    <div className="room-item-users">
                      <span className="room-item-dot" />
                      {room.clients} {room.clients === 1 ? 'user' : 'users'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Features */}
          <div className="features" id="features">
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <div className="feature-title">Real-time Sync</div>
              <div className="feature-desc">CRDT-powered conflict-free editing</div>
            </div>
            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <div className="feature-title">Live Cursors</div>
              <div className="feature-desc">See others typing in real time</div>
            </div>
            <div className="feature-card">
              <div className="feature-icon">✦</div>
              <div className="feature-title">Monaco Editor</div>
              <div className="feature-desc">VS Code-grade syntax highlighting</div>
            </div>
            <div className="feature-card">
              <div className="feature-icon">◆</div>
              <div className="feature-title">Persistent</div>
              <div className="feature-desc">PostgreSQL + Redis backed</div>
            </div>
          </div>
        </div>

        <footer className="landing-footer">
          Built with <a href="https://yjs.dev" target="_blank" rel="noopener noreferrer">Yjs CRDT</a> · <a href="https://microsoft.github.io/monaco-editor/" target="_blank" rel="noopener noreferrer">Monaco Editor</a> · <a href="https://nextjs.org" target="_blank" rel="noopener noreferrer">Next.js</a> · <a href="https://github.com/0007aadil/CodeSync" target="_blank" rel="noopener noreferrer">View Source</a>
        </footer>
      </div>
    </>
  );
}
