# ⚡ CodeSync — Real-time Collaborative Code Editor

A fully-featured collaborative code editing environment. Work together in real-time with live cursors, integrated voice/video calling, real-time chat, and an interactive code execution terminal.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Client (Browser)                    │
│  ┌─────────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │   Monaco     │  │  Yjs     │  │  WebSocket Client   │ │
│  │   Editor     │◄►│  CRDT    │◄►│  + Awareness        │ │
│  └─────────────┘  └──────────┘  └──────────┬──────────┘ │
└──────────────────────────────────────────────┼────────────┘
                                               │ ws://
┌──────────────────────────────────────────────┼────────────┐
│                   Server (Node.js)           │            │
│  ┌─────────────┐  ┌──────────────┐  ┌───────┴─────────┐ │
│  │  Express     │  │ Room Manager │  │ WebSocket Server│ │
│  │  REST API    │  │ + Broadcast  │  │ + Sync Protocol │ │
│  └─────────────┘  └──────┬───────┘  └─────────────────┘ │
│                          │                                │
│  ┌─────────────┐  ┌──────┴───────┐                       │
│  │   Redis      │  │ PostgreSQL   │                       │
│  │ (doc cache)  │  │ (snapshots)  │                       │
│  └─────────────┘  └──────────────┘                       │
└──────────────────────────────────────────────────────────┘
```

## Core Features

- **⚡ Conflict-Free Real-time Sync:** Powered by Yjs (CRDT) for sub-millisecond collaboration.
- **✦ VS Code-Grade Editor:** Built on Monaco Editor with syntax highlighting and language support.
- **🎙️ WebRTC Voice & Video:** Built-in peer-to-peer video conferencing without leaving the editor.
- **💬 Real-time Chat:** Integrated text chat synced seamlessly across the room.
- **💻 Live Code Execution:** Run JavaScript, TypeScript, and Python directly in an interactive, resizable terminal inside the browser.
- **🔒 Authentication & Cloud Saves:** Create an account to securely save your code files to the cloud using PostgreSQL and JWT auth.
- **🎨 Modern Dark Mode UI:** A gorgeous, responsive, Raycast-inspired minimalist interface.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, React, Vanilla CSS |
| Code Editor | Monaco Editor |
| Real-time Sync | Yjs CRDT |
| Communication | WebSockets + WebRTC |
| Code Execution | Piston API Engine |
| Backend | Node.js, Express, jsonwebtoken |
| Database | PostgreSQL |
| Containers | Docker Compose |

## Quick Start

### 1. Install dependencies

```bash
# Install all dependencies (server + client)
npm run install:all
```

### 2. Start infrastructure (optional — app works without Redis/PostgreSQL)

```bash
docker-compose up -d
```

### 3. Start development servers

```bash
# Start both server and client
npm run dev

# Or start them separately:
npm run dev:server   # Backend on http://localhost:4000
npm run dev:client   # Frontend on http://localhost:3000
```

### 4. Open in browser

1. Go to `http://localhost:3000`
2. Create a room
3. Copy the room URL and open it in another browser tab
4. Start typing — changes sync in real-time!

## How CRDT Works

1. **Every character gets a unique ID** — not positional index
2. **Operations are insert/delete by ID** — "Insert 'X' after id:42"
3. **Merge is commutative & idempotent** — any order produces same result
4. **Deletes are tombstones** — keeps IDs for reference anchoring

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/rooms` | Create new room |
| GET | `/api/rooms` | List active rooms |
| GET | `/api/rooms/:id/stats` | Room statistics |
| WS | `/ws?room=ID&clientId=ID` | WebSocket connection |

## Project Structure

```
FullStack/
├── server/
│   ├── index.js           # Express + WebSocket server
│   ├── yjs-server.js      # Yjs sync protocol + room management
│   ├── persistence.js     # PostgreSQL + Redis persistence
│   ├── init.sql           # Database schema
│   └── package.json
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.js       # Landing page
│   │   │   └── room/[id].js   # Editor room
│   │   ├── components/
│   │   │   └── CollabEditor.js # Monaco + Yjs binding
│   │   ├── hooks/
│   │   │   └── useCollaboration.js  # CRDT + WebSocket hook
│   │   └── styles/
│   │       └── globals.css    # Design system
│   └── package.json
├── docker-compose.yml     # Redis + PostgreSQL
└── package.json           # Root workspace scripts
```
