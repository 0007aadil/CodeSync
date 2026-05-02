# ⚡ CodeSync — Real-time Collaborative Code Editor

A web app where multiple people can edit the same file simultaneously and see each other's cursors live.

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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js + React |
| Code Editor | Monaco Editor (VS Code engine) |
| Real-time Sync | Yjs CRDT (YATA algorithm) |
| Backend | Node.js + Express |
| WebSocket | `ws` library |
| Cache | Redis |
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
