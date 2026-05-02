import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { nanoid } from 'nanoid';
import { initPersistence, listDocuments, closePersistence } from './persistence.js';
import { handleConnection, getRoomStats, cleanupRooms } from './yjs-server.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    // Allow any localhost origin
    if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

// === REST API Routes ===

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Create a new room
app.post('/api/rooms', (req, res) => {
  const { name, language } = req.body;
  const roomId = nanoid(10);
  res.json({
    id: roomId,
    name: name || `Room ${roomId}`,
    language: language || 'javascript',
    url: `/room/${roomId}`,
  });
});

// List active rooms
app.get('/api/rooms', async (req, res) => {
  const stats = getRoomStats();
  const dbDocs = await listDocuments();
  
  // Merge: active rooms with stats, db docs without active stats
  const roomMap = new Map();
  for (const doc of dbDocs) {
    roomMap.set(doc.id, { ...doc, clients: 0, active: false });
  }
  for (const stat of stats) {
    const existing = roomMap.get(stat.name) || {};
    roomMap.set(stat.name, {
      ...existing,
      id: stat.name,
      clients: stat.clients,
      active: true,
      awareness: stat.awareness,
    });
  }

  res.json(Array.from(roomMap.values()));
});

// Room stats
app.get('/api/rooms/:id/stats', (req, res) => {
  const stats = getRoomStats().find(r => r.name === req.params.id);
  res.json(stats || { name: req.params.id, clients: 0, awareness: [] });
});

// === HTTP Server ===
const server = http.createServer(app);

// === WebSocket Server ===
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  // Parse room ID and client ID from URL params
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const roomId = url.searchParams.get('room');
  const clientId = url.searchParams.get('clientId') || nanoid(8);

  if (!roomId) {
    ws.close(4001, 'Missing room parameter');
    return;
  }

  handleConnection(ws, roomId, clientId);
});

// === Startup ===
async function start() {
  await initPersistence();

  server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║   🚀 Collaborative Editor Server            ║
║                                              ║
║   HTTP:  http://localhost:${PORT}              ║
║   WS:    ws://localhost:${PORT}/ws              ║
║                                              ║
║   API Endpoints:                             ║
║   GET  /api/health                           ║
║   POST /api/rooms                            ║
║   GET  /api/rooms                            ║
║   GET  /api/rooms/:id/stats                  ║
╚══════════════════════════════════════════════╝
    `);
  });
}

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down...');
  await cleanupRooms();
  await closePersistence();
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch(console.error);
