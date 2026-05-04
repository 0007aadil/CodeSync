import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { nanoid } from 'nanoid';
import { exec } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initPersistence, listDocuments, closePersistence, getPool } from './persistence.js';
import { handleConnection, getRoomStats, cleanupRooms } from './yjs-server.js';
import { registerAuthRoutes, registerFileRoutes } from './auth.js';
import { handleChatConnection } from './chat.js';

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
    // Allow configured production origins (comma-separated)
    const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowedOrigins.some(allowed => origin === allowed || origin.endsWith(allowed))) {
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

// === Code Execution ===
const RUNNERS = {
  javascript: { ext: '.js', buildCmd: (file) => `node ${file}` },
  typescript: { ext: '.ts', buildCmd: (file) => `npx tsx ${file}` },
  python:     { ext: '.py', buildCmd: (file) => `python3 ${file}` },
  java:       { ext: '.java', buildCmd: (file) => `java ${file}` },
  cpp:        { ext: '.cpp', buildCmd: (file) => `g++ ${file} -o ${file}.out && ${file}.out` },
  csharp:     { ext: '.cs', buildCmd: (file) => `csc ${file} && mono ${file.replace('.cs', '.exe')}` },
  go:         { ext: '.go', buildCmd: (file) => `GO111MODULE=off go run ${file}` },
  ruby:       { ext: '.rb', buildCmd: (file) => `ruby ${file}` },
  swift:      { ext: '.swift', buildCmd: (file) => `swift ${file}` },
};

const RUN_TIMEOUT = 10000; // 10 seconds max
const RUN_SANDBOX = join(tmpdir(), 'codesync-sandbox');
try { mkdirSync(RUN_SANDBOX, { recursive: true }); } catch (e) {}

app.post('/api/run', (req, res) => {
  const { code, language } = req.body;
  if (!code || !language) {
    return res.status(400).json({ error: 'Missing code or language' });
  }

  const runner = RUNNERS[language];
  if (!runner) {
    return res.status(400).json({
      error: `Language "${language}" is not supported for execution. Supported: ${Object.keys(RUNNERS).join(', ')}`,
    });
  }

  const fileId = nanoid(8);
  const filePath = join(RUN_SANDBOX, `${fileId}${runner.ext}`);
  const startTime = Date.now();

  try {
    writeFileSync(filePath, code, 'utf-8');
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write temporary file' });
  }

  const command = runner.buildCmd(filePath);

  exec(command, {
    timeout: RUN_TIMEOUT,
    maxBuffer: 1024 * 512, // 512KB output max
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  }, (error, stdout, stderr) => {
    // Cleanup temp file
    try { unlinkSync(filePath); } catch (e) {}
    try { unlinkSync(`${filePath}.out`); } catch (e) {}
    try { unlinkSync(filePath.replace('.cs', '.exe')); } catch (e) {}

    const duration = Date.now() - startTime;

    if (error && error.killed) {
      return res.json({
        stdout: stdout || '',
        stderr: `Execution timed out after ${RUN_TIMEOUT / 1000}s`,
        exitCode: 1,
        duration,
      });
    }

    res.json({
      stdout: stdout || '',
      stderr: stderr || (error ? error.message : ''),
      exitCode: error ? error.code || 1 : 0,
      duration,
    });
  });
});

// === HTTP Server ===
const server = http.createServer(app);

// === WebSocket Server (Yjs sync) ===
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

// === WebSocket Server (Chat + WebRTC signaling) ===
const chatWss = new WebSocketServer({ server, path: '/chat' });

chatWss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const roomId = url.searchParams.get('room');
  const token = url.searchParams.get('token');

  if (!roomId) {
    ws.close(4001, 'Missing room parameter');
    return;
  }
  if (!token) {
    ws.close(4003, 'Authentication required');
    return;
  }

  handleChatConnection(ws, roomId, token);
});

// === Startup ===
async function start() {
  await initPersistence();

  // Register auth & file routes (need pool from persistence)
  const pool = getPool();
  registerAuthRoutes(app, pool);
  registerFileRoutes(app, pool);
  server.listen(PORT, '0.0.0.0', () => {
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
║   POST /api/run                              ║
║   POST /api/auth/register                    ║
║   POST /api/auth/login                       ║
║   GET  /api/auth/me                          ║
║   CRUD /api/files                            ║
║   DB:   ${pool ? 'PostgreSQL' : 'In-Memory (dev)'}                      ║
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
