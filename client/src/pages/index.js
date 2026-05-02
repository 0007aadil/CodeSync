import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { nanoid } from 'nanoid';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'yaml', label: 'YAML' },
];

export default function Home() {
  const router = useRouter();
  const [roomName, setRoomName] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [joinCode, setJoinCode] = useState('');
  const [rooms, setRooms] = useState([]);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch active rooms
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
    } catch (err) {
      // Server might not be running yet
    }
  }

  function handleCreateRoom(e) {
    e.preventDefault();
    setIsCreating(true);
    const roomId = nanoid(10);
    const name = roomName.trim() || `Room ${roomId.slice(0, 4)}`;
    router.push(`/room/${roomId}?lang=${language}&name=${encodeURIComponent(name)}`);
  }

  function handleJoinRoom(e) {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) return;
    
    // Support full URL or just room ID
    const match = code.match(/\/room\/([a-zA-Z0-9_-]+)/);
    const roomId = match ? match[1] : code;
    router.push(`/room/${roomId}`);
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
              A collaborative code editor where multiple people can edit the same file 
              simultaneously. See each other&apos;s cursors live, with conflict-free 
              merging powered by Yjs CRDT.
            </p>
          </div>

          {/* Create Room */}
          <form className="create-room" onSubmit={handleCreateRoom}>
            <div className="create-room-card">
              <div className="input-group">
                <label className="input-label">Room Settings</label>
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
              </div>
              
              <button id="create-room-btn" type="submit" className="btn-primary" disabled={isCreating}>
                {isCreating ? '⏳ Creating...' : '⚡ Create New Room'}
              </button>
            </div>
          </form>

          {/* Divider */}
          <div className="divider-or">or join an existing room</div>

          {/* Join Room */}
          <form className="join-room" onSubmit={handleJoinRoom}>
            <input
              id="join-room-input"
              type="text"
              className="input-field"
              placeholder="Paste room URL or room ID..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <button id="join-room-btn" type="submit" className="btn-secondary">
              Join →
            </button>
          </form>

          {/* Active Rooms */}
          {rooms.length > 0 && (
            <div className="active-rooms">
              <h3>🟢 Active Rooms</h3>
              <div className="room-list">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="room-item"
                    onClick={() => router.push(`/room/${room.id}`)}
                  >
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
          <div className="features">
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <div className="feature-title">Real-time Sync</div>
              <div className="feature-desc">CRDT-powered conflict-free editing with instant local feedback</div>
            </div>
            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <div className="feature-title">Live Cursors</div>
              <div className="feature-desc">See where other users are typing and selecting in real time</div>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🎨</div>
              <div className="feature-title">Monaco Editor</div>
              <div className="feature-desc">VS Code-grade editor with syntax highlighting and IntelliSense</div>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <div className="feature-title">Persistent</div>
              <div className="feature-desc">Documents saved to PostgreSQL with Redis caching for speed</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
