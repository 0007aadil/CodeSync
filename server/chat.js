import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'codesync-dev-secret-change-in-production';

/**
 * Chat & WebRTC signaling server
 * 
 * Handles:
 *   - Text chat messages per room
 *   - WebRTC signaling (offer/answer/ice-candidate) for voice/video calls
 * 
 * All features require authentication (JWT token)
 */

// Active chat rooms: Map<roomId, Set<ws>>
const chatRooms = new Map();

/**
 * Verify JWT token from query string
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

/**
 * Handle a chat WebSocket connection
 */
export function handleChatConnection(ws, roomId, token) {
  const user = verifyToken(token);
  if (!user) {
    ws.close(4003, 'Authentication required for chat');
    return;
  }

  // Add to room
  if (!chatRooms.has(roomId)) {
    chatRooms.set(roomId, new Set());
  }
  const room = chatRooms.get(roomId);
  room.add(ws);

  ws._chatRoom = roomId;
  ws._chatUser = user;

  console.log(`💬 ${user.username} joined chat in room ${roomId}`);

  // Send join notification to others
  broadcastChat(room, ws, {
    type: 'system',
    text: `${user.username} joined the chat`,
    timestamp: Date.now(),
  });

  // Send current participant list to new user
  const participants = [];
  for (const client of room) {
    if (client._chatUser && client.readyState === 1) {
      participants.push({
        id: client._chatUser.id,
        username: client._chatUser.username,
        avatar: client._chatUser.avatar || '🦊',
      });
    }
  }
  ws.send(JSON.stringify({ type: 'participants', participants }));

  // Handle messages
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleChatMessage(ws, room, user, msg);
    } catch (err) {
      console.error('Chat message error:', err);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    room.delete(ws);
    console.log(`💬 ${user.username} left chat in room ${roomId}`);

    broadcastChat(room, null, {
      type: 'system',
      text: `${user.username} left the chat`,
      timestamp: Date.now(),
    });

    // Notify others to remove this peer from calls
    broadcastChat(room, null, {
      type: 'peer-left',
      userId: user.id,
      username: user.username,
    });

    // Cleanup empty rooms
    if (room.size === 0) {
      chatRooms.delete(roomId);
    }
  });
}

/**
 * Handle incoming chat messages
 */
function handleChatMessage(ws, room, user, msg) {
  switch (msg.type) {
    case 'chat': {
      // Text message
      const chatMsg = {
        type: 'chat',
        userId: user.id,
        username: user.username,
        avatar: user.avatar || '🦊',
        text: (msg.text || '').slice(0, 2000), // Limit length
        timestamp: Date.now(),
      };
      // Broadcast to ALL (including sender for confirmation)
      broadcastChat(room, null, chatMsg);
      break;
    }

    case 'typing': {
      broadcastChat(room, ws, {
        type: 'typing',
        userId: user.id,
        username: user.username,
      });
      break;
    }

    // === WebRTC Signaling ===
    case 'call-start': {
      // User wants to start a call (voice or video)
      broadcastChat(room, ws, {
        type: 'call-start',
        userId: user.id,
        username: user.username,
        avatar: user.avatar || '🦊',
        callType: msg.callType || 'voice', // 'voice' or 'video'
      });
      break;
    }

    case 'call-accept': {
      // User accepts/joins a call
      broadcastChat(room, ws, {
        type: 'call-accept',
        userId: user.id,
        username: user.username,
        avatar: user.avatar || '🦊',
      });
      break;
    }

    case 'call-end': {
      broadcastChat(room, null, {
        type: 'call-end',
        userId: user.id,
        username: user.username,
      });
      break;
    }

    case 'webrtc-offer':
    case 'webrtc-answer':
    case 'webrtc-ice-candidate': {
      // Forward signaling to the target peer
      const target = findClientByUserId(room, msg.targetUserId);
      if (target && target.readyState === 1) {
        target.send(JSON.stringify({
          type: msg.type,
          userId: user.id,
          username: user.username,
          sdp: msg.sdp,
          candidate: msg.candidate,
        }));
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Find a client WebSocket by user ID
 */
function findClientByUserId(room, userId) {
  for (const client of room) {
    if (client._chatUser && client._chatUser.id === userId) {
      return client;
    }
  }
  return null;
}

/**
 * Broadcast a message to all clients in a room
 */
function broadcastChat(room, excludeWs, message) {
  const data = JSON.stringify(message);
  for (const client of room) {
    if (client !== excludeWs && client.readyState === 1) {
      try {
        client.send(data);
      } catch (err) {
        console.error('Chat broadcast error:', err);
      }
    }
  }
}
