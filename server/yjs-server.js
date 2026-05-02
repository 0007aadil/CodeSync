import * as Y from 'yjs';
import {
  storeDocState,
  loadDocState,
  loadCachedDocState,
  cacheDocState,
  ensureDocument,
  appendOpLog,
} from './persistence.js';

/**
 * YjsServer — handles Yjs document synchronization over WebSocket
 * 
 * Implements the Yjs sync protocol manually for full control:
 *   - Sync Step 1: Client sends state vector → server responds with missing updates
 *   - Sync Step 2: Server sends its state vector → client responds with missing updates
 *   - Update: Incremental updates from either side
 *   - Awareness: Cursor position and user presence
 */

// Message types (matching y-protocols)
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// Sync sub-types
const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
const SYNC_UPDATE = 2;

// Active rooms: Map<roomName, { doc: Y.Doc, clients: Set<ws>, awareness: Map<clientId, state>, idleTimer }>
const rooms = new Map();

// Idle timeout — save and unload after 5 minutes of no connections
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// Debounce persistence writes
const SAVE_DEBOUNCE_MS = 2000;
const saveTimers = new Map();

/**
 * Get or create a room (Yjs document + connected clients)
 */
async function getOrCreateRoom(roomName) {
  if (rooms.has(roomName)) {
    const room = rooms.get(roomName);
    // Clear idle timer if someone is joining
    if (room.idleTimer) {
      clearTimeout(room.idleTimer);
      room.idleTimer = null;
    }
    return room;
  }

  console.log(`📂 Creating room: ${roomName}`);
  const doc = new Y.Doc();
  
  // Try to load from Redis cache first, then PostgreSQL
  let state = await loadCachedDocState(roomName);
  if (!state) {
    state = await loadDocState(roomName);
  }
  if (state) {
    Y.applyUpdate(doc, state);
    console.log(`📄 Loaded existing document for room: ${roomName}`);
  }

  // Ensure document exists in DB
  await ensureDocument(roomName);

  const room = {
    doc,
    clients: new Set(),
    awareness: new Map(),
    idleTimer: null,
  };

  // Listen for document updates to persist
  doc.on('update', (update, origin) => {
    debouncedSave(roomName, doc);
  });

  rooms.set(roomName, room);
  return room;
}

/**
 * Debounced save to avoid hammering the DB on every keystroke
 */
function debouncedSave(roomName, doc) {
  if (saveTimers.has(roomName)) {
    clearTimeout(saveTimers.get(roomName));
  }
  saveTimers.set(roomName, setTimeout(async () => {
    saveTimers.delete(roomName);
    await storeDocState(roomName, doc);
    await cacheDocState(roomName, doc);
  }, SAVE_DEBOUNCE_MS));
}

/**
 * Encode a message with type prefix
 */
function encodeMessage(type, data) {
  const msg = new Uint8Array(1 + data.length);
  msg[0] = type;
  msg.set(data, 1);
  return msg;
}

/**
 * Encode sync step 1 message (send our state vector)
 */
function encodeSyncStep1(doc) {
  const sv = Y.encodeStateVector(doc);
  const data = new Uint8Array(1 + sv.length);
  data[0] = SYNC_STEP1;
  data.set(sv, 1);
  return encodeMessage(MSG_SYNC, data);
}

/**
 * Encode sync step 2 message (send update based on received state vector)
 */
function encodeSyncStep2(doc, receivedSV) {
  const update = Y.encodeStateAsUpdate(doc, receivedSV);
  const data = new Uint8Array(1 + update.length);
  data[0] = SYNC_STEP2;
  data.set(update, 1);
  return encodeMessage(MSG_SYNC, data);
}

/**
 * Encode a sync update message
 */
function encodeSyncUpdate(update) {
  const data = new Uint8Array(1 + update.length);
  data[0] = SYNC_UPDATE;
  data.set(update, 1);
  return encodeMessage(MSG_SYNC, data);
}

/**
 * Read a variable-length encoded unsigned integer from a Uint8Array
 */
function readVarUint(data, offset) {
  let num = 0;
  let mult = 1;
  let len = 0;
  while (true) {
    const r = data[offset + len];
    num += (r & 0x7f) * mult;
    len++;
    mult *= 128;
    if (r < 0x80) break;
    if (len > 5) throw new Error('VarUint too long');
  }
  return { value: num, length: len };
}

/**
 * Write a variable-length encoded unsigned integer
 */
function writeVarUint(num) {
  const bytes = [];
  while (num > 0x7f) {
    bytes.push((num & 0x7f) | 0x80);
    num = Math.floor(num / 128);
  }
  bytes.push(num & 0x7f);
  return new Uint8Array(bytes);
}

/**
 * Handle a new WebSocket connection for a room
 */
export async function handleConnection(ws, roomName, clientId) {
  const room = await getOrCreateRoom(roomName);
  room.clients.add(ws);

  ws._roomName = roomName;
  ws._clientId = clientId;

  console.log(`👤 Client ${clientId} joined room ${roomName} (${room.clients.size} clients)`);

  // Send sync step 1 — our state vector so client can send us what we're missing
  const step1 = encodeSyncStep1(room.doc);
  ws.send(step1);

  // Also send the full doc state as step2 so client gets current content immediately
  const fullState = Y.encodeStateAsUpdate(room.doc);
  const step2Data = new Uint8Array(1 + fullState.length);
  step2Data[0] = SYNC_STEP2;
  step2Data.set(fullState, 1);
  ws.send(encodeMessage(MSG_SYNC, step2Data));

  // Send current awareness states to new client
  for (const [cid, state] of room.awareness) {
    const awarenessMsg = encodeAwarenessUpdate(cid, state);
    ws.send(awarenessMsg);
  }

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const msg = new Uint8Array(data);
      if (msg.length === 0) return;

      const msgType = msg[0];
      const payload = msg.slice(1);

      switch (msgType) {
        case MSG_SYNC:
          handleSyncMessage(ws, room, payload, clientId);
          break;
        case MSG_AWARENESS:
          handleAwarenessMessage(ws, room, payload, clientId);
          break;
        default:
          console.warn(`Unknown message type: ${msgType}`);
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    room.clients.delete(ws);
    room.awareness.delete(clientId);
    console.log(`👋 Client ${clientId} left room ${roomName} (${room.clients.size} clients)`);

    // Broadcast that this user left
    const leaveMsg = encodeAwarenessUpdate(clientId, null);
    broadcastToRoom(room, leaveMsg, ws);

    // If room is empty, start idle timer
    if (room.clients.size === 0) {
      room.idleTimer = setTimeout(async () => {
        console.log(`🗑️  Unloading idle room: ${roomName}`);
        await storeDocState(roomName, room.doc);
        await cacheDocState(roomName, room.doc);
        room.doc.destroy();
        rooms.delete(roomName);
      }, IDLE_TIMEOUT_MS);
    }
  });
}

/**
 * Handle sync protocol messages
 */
function handleSyncMessage(ws, room, payload, clientId) {
  if (payload.length === 0) return;
  const syncType = payload[0];
  const syncData = payload.slice(1);

  switch (syncType) {
    case SYNC_STEP1: {
      // Client sent state vector — respond with missing updates
      const response = encodeSyncStep2(room.doc, syncData);
      ws.send(response);
      break;
    }
    case SYNC_STEP2: {
      // Client sent update (response to our step 1)
      Y.applyUpdate(room.doc, syncData, clientId);
      break;
    }
    case SYNC_UPDATE: {
      // Incremental update from client
      Y.applyUpdate(room.doc, syncData, clientId);
      // Broadcast to all other clients
      const updateMsg = encodeSyncUpdate(syncData);
      broadcastToRoom(room, updateMsg, ws);
      // Log operation
      appendOpLog(room.doc._roomName || ws._roomName, syncData, clientId);
      break;
    }
  }
}

/**
 * Handle awareness (cursor/presence) messages
 */
function handleAwarenessMessage(ws, room, payload, clientId) {
  try {
    const stateStr = new TextDecoder().decode(payload);
    const state = JSON.parse(stateStr);
    
    if (state === null) {
      room.awareness.delete(clientId);
    } else {
      room.awareness.set(clientId, state);
    }

    // Broadcast to all other clients — wrap in {clientId, state} format
    const awarenessMsg = encodeAwarenessUpdate(clientId, state);
    broadcastToRoom(room, awarenessMsg, ws);
  } catch (err) {
    console.error('Error handling awareness:', err);
  }
}

/**
 * Encode an awareness update
 */
function encodeAwarenessUpdate(clientId, state) {
  const payload = JSON.stringify({ clientId, state });
  const encoded = new TextEncoder().encode(payload);
  return encodeMessage(MSG_AWARENESS, encoded);
}

/**
 * Broadcast a message to all clients in a room except the sender
 */
function broadcastToRoom(room, message, excludeWs) {
  for (const client of room.clients) {
    if (client !== excludeWs && client.readyState === 1) { // WebSocket.OPEN = 1
      try {
        client.send(message);
      } catch (err) {
        console.error('Error broadcasting to client:', err);
      }
    }
  }
}

/**
 * Get room stats for API
 */
export function getRoomStats() {
  const stats = [];
  for (const [name, room] of rooms) {
    stats.push({
      name,
      clients: room.clients.size,
      awareness: Array.from(room.awareness.entries()).map(([id, state]) => ({
        clientId: id,
        ...state,
      })),
    });
  }
  return stats;
}

/**
 * Clean up all rooms
 */
export async function cleanupRooms() {
  for (const [name, room] of rooms) {
    await storeDocState(name, room.doc);
    room.doc.destroy();
  }
  rooms.clear();
}
