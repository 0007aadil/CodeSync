import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';

/**
 * Message types — must match server
 */
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
const SYNC_UPDATE = 2;

/**
 * Cursor colors for different users
 */
const CURSOR_COLORS = [
  '#ff6b6b', '#51cf66', '#339af0', '#fcc419',
  '#cc5de8', '#22b8cf', '#ff922b', '#f06595',
];

/**
 * Random user names for anonymous users
 */
const ADJECTIVES = ['Swift', 'Bright', 'Bold', 'Calm', 'Eager', 'Kind', 'Wise', 'Quick', 'Neat', 'Fair'];
const NOUNS = ['Fox', 'Owl', 'Bear', 'Wolf', 'Hawk', 'Deer', 'Lynx', 'Puma', 'Crane', 'Heron'];

function randomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}

function generateClientId() {
  return 'u_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Custom hook: useCollaboration
 * Manages Yjs document, WebSocket connection, and awareness (cursors)
 */
export function useCollaboration(roomId, overrides = {}, authUser = null) {
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [isReady, setIsReady] = useState(false);
  
  const ydocRef = useRef(null);
  const wsRef = useRef(null);
  const clientIdRef = useRef(null);
  const userNameRef = useRef(null);
  const userColorRef = useRef(null);
  const userAvatarRef = useRef(null);
  const awarenessRef = useRef(new Map());
  const reconnectTimerRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);
  const pendingOpsRef = useRef([]);
  
  // Flag to prevent echo loops: editor → yjs → editor
  const isLocalEditRef = useRef(false);
  // Flag to prevent echo loops: yjs observe → editor → yjs
  const isRemoteEditRef = useRef(false);
  // Typing indicator timer
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);

  // Initialize client identity (once)
  if (!clientIdRef.current) {
    let stored = null;
    try { stored = typeof window !== 'undefined' ? sessionStorage.getItem('collab-client-id') : null; } catch (e) {}
    
    if (stored) {
      clientIdRef.current = stored;
    } else {
      clientIdRef.current = generateClientId();
      try { if (typeof window !== 'undefined') sessionStorage.setItem('collab-client-id', clientIdRef.current); } catch (e) {}
    }
    
    // Overrides from URL params take priority over sessionStorage
    let storedName = overrides.name || null;
    try { if (!storedName) storedName = typeof window !== 'undefined' ? sessionStorage.getItem('collab-user-name') : null; } catch (e) {}
    userNameRef.current = storedName || randomName();
    try { if (typeof window !== 'undefined') sessionStorage.setItem('collab-user-name', userNameRef.current); } catch (e) {}
    
    let storedAvatar = overrides.avatar || null;
    try { if (!storedAvatar) storedAvatar = typeof window !== 'undefined' ? sessionStorage.getItem('collab-user-avatar') : null; } catch (e) {}
    userAvatarRef.current = storedAvatar || '🦊';
    try { if (typeof window !== 'undefined') sessionStorage.setItem('collab-user-avatar', userAvatarRef.current); } catch (e) {}
    
    // Assign color based on hash of client ID
    const hash = clientIdRef.current.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    userColorRef.current = CURSOR_COLORS[hash % CURSOR_COLORS.length];
  }

  // Synchronize username with logged-in user dynamically
  useEffect(() => {
    if (authUser && authUser.username) {
      if (userNameRef.current !== authUser.username) {
        userNameRef.current = authUser.username;
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          sendAwareness();
        }
        // Force a re-render so the local user's name updates in the sidebar
        setRemoteUsers(prev => [...prev]);
      }
    }
  }, [authUser, sendAwareness]);

  /**
   * Send a raw binary message, queue if disconnected
   */
  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    } else {
      pendingOpsRef.current.push(data);
    }
  }, []);

  /**
   * Send awareness state (cursor, user info)
   */
  const sendAwareness = useCallback((cursor, selection, isTyping) => {
    const state = {
      name: userNameRef.current,
      color: userColorRef.current,
      avatar: userAvatarRef.current,
      cursor: cursor || null,
      selection: selection || null,
      isTyping: isTyping !== undefined ? isTyping : isTypingRef.current,
    };
    
    const payload = new TextEncoder().encode(JSON.stringify(state));
    const msg = new Uint8Array(1 + payload.length);
    msg[0] = MSG_AWARENESS;
    msg.set(payload, 1);
    sendMessage(msg);
  }, [sendMessage]);

  /**
   * Inject dynamic CSS for remote cursor colors
   */
  const injectCursorStyles = useCallback((users) => {
    let styleEl = document.getElementById('remote-cursor-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'remote-cursor-styles';
      document.head.appendChild(styleEl);
    }

    let css = '';
    for (const user of users) {
      const safeId = user.clientId.replace(/[^a-zA-Z0-9_-]/g, '_');
      css += `
        .remote-cursor-before-${safeId}::before {
          content: '';
          position: absolute;
          width: 2px;
          height: 100%;
          background: ${user.color};
          z-index: 10;
        }
        .remote-cursor-before-${safeId}::after {
          content: '${user.name}';
          position: absolute;
          top: -18px;
          left: 0;
          padding: 1px 6px;
          border-radius: 3px 3px 3px 0;
          background: ${user.color};
          color: white;
          font-size: 11px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          white-space: nowrap;
          z-index: 11;
          pointer-events: none;
        }
        .remote-selection-${safeId} {
          background: ${user.color}22;
        }
      `;
    }
    styleEl.textContent = css;
  }, []);

  /**
   * Update Monaco cursor decorations for remote users
   */
  const updateCursorDecorations = useCallback((users) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const newDecorations = [];

    for (const user of users) {
      if (!user.cursor) continue;
      const safeId = user.clientId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const { lineNumber, column } = user.cursor;

      // Cursor decoration
      newDecorations.push({
        range: new monaco.Range(lineNumber, column, lineNumber, column + 1),
        options: {
          className: `remote-cursor-line-${safeId}`,
          beforeContentClassName: `remote-cursor-before-${safeId}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });

      // Selection decoration
      if (user.selection) {
        newDecorations.push({
          range: new monaco.Range(
            user.selection.startLineNumber,
            user.selection.startColumn,
            user.selection.endLineNumber,
            user.selection.endColumn
          ),
          options: {
            className: `remote-selection-${safeId}`,
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
      }
    }

    injectCursorStyles(users);
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  }, [injectCursorStyles]);

  /**
   * Handle awareness messages (cursor positions, user info)
   */
  const handleAwarenessMessage = useCallback((payload) => {
    try {
      const str = new TextDecoder().decode(payload);
      const parsed = JSON.parse(str);
      const clientId = parsed.clientId;
      const state = parsed.state;
      
      if (!clientId || clientId === clientIdRef.current) return; // Skip own

      if (state === null || state === undefined) {
        awarenessRef.current.delete(clientId);
      } else {
        awarenessRef.current.set(clientId, state);
      }

      // Update remote users list — filter out any null entries defensively
      const users = Array.from(awarenessRef.current.entries())
        .filter(([id, s]) => s != null && typeof s === 'object')
        .map(([id, s]) => ({
          clientId: id,
          name: s.name || 'Anonymous',
          color: s.color || '#888',
          avatar: s.avatar || '🦊',
          cursor: s.cursor || null,
          selection: s.selection || null,
          isTyping: s.isTyping || false,
        }));
      setRemoteUsers(users);
      updateCursorDecorations(users);
    } catch (err) {
      console.error('Error handling awareness:', err);
    }
  }, [updateCursorDecorations]);

  /**
   * Apply a Yjs update to local doc and update editor
   */
  const applyRemoteUpdate = useCallback((data) => {
    const ydoc = ydocRef.current;
    const editor = editorRef.current;
    if (!ydoc) return;

    // Apply the Yjs update
    Y.applyUpdate(ydoc, data, 'remote');

    // Now sync Yjs content → editor
    if (editor) {
      const ytext = ydoc.getText('monaco');
      const newContent = ytext.toString();
      const currentContent = editor.getValue();
      
      if (newContent !== currentContent) {
        isRemoteEditRef.current = true;
        const model = editor.getModel();
        if (model) {
          const fullRange = model.getFullModelRange();
          editor.executeEdits('yjs-remote', [{
            range: fullRange,
            text: newContent,
            forceMoveMarkers: false,
          }]);
        }
        isRemoteEditRef.current = false;
      }
    }
  }, []);

  /**
   * Handle sync protocol messages from server
   */
  const handleSyncMessage = useCallback((payload) => {
    if (!ydocRef.current || payload.length === 0) return;
    const syncType = payload[0];
    const data = payload.slice(1);

    switch (syncType) {
      case SYNC_STEP1: {
        // Server sent its state vector — respond with our missing updates
        const update = Y.encodeStateAsUpdate(ydocRef.current, data);
        const response = new Uint8Array(2 + update.length);
        response[0] = MSG_SYNC;
        response[1] = SYNC_STEP2;
        response.set(update, 2);
        sendMessage(response);
        break;
      }
      case SYNC_STEP2: {
        // Server sent full doc update
        applyRemoteUpdate(data);
        setIsReady(true);
        break;
      }
      case SYNC_UPDATE: {
        // Incremental update from another client
        applyRemoteUpdate(data);
        break;
      }
    }
  }, [sendMessage, applyRemoteUpdate]);

  // Store handlers in refs to avoid stale closure issues with connect
  const handleSyncRef = useRef(handleSyncMessage);
  handleSyncRef.current = handleSyncMessage;
  const handleAwarenessRef = useRef(handleAwarenessMessage);
  handleAwarenessRef.current = handleAwarenessMessage;

  /**
   * Connect to the WebSocket server
   */
  const connect = useCallback(() => {
    if (!roomId || !clientIdRef.current) return;
    
    // Don't reconnect if already connected or connecting
    if (wsRef.current) {
      const state = wsRef.current.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
      // Clean up dead connection
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      try { wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }

    // Cap reconnect attempts to prevent infinite loops
    if (reconnectAttempts.current > 15) {
      console.warn('⚠️ Max reconnect attempts reached, stopping');
      setConnectionStatus('disconnected');
      return;
    }
    
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000'}/ws?room=${roomId}&clientId=${clientIdRef.current}`;
    
    console.log(`🔌 Connecting to ${wsUrl}`);
    setConnectionStatus('connecting');

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;

      // Flush pending ops
      for (const op of pendingOpsRef.current) {
        ws.send(op);
      }
      pendingOpsRef.current = [];

      // Send initial awareness
      sendAwareness();
    };

    ws.onmessage = (event) => {
      try {
        const msg = new Uint8Array(event.data);
        if (msg.length === 0) return;

        const msgType = msg[0];
        const payload = msg.slice(1);

        switch (msgType) {
          case MSG_SYNC:
            handleSyncRef.current(payload);
            break;
          case MSG_AWARENESS:
            handleAwarenessRef.current(payload);
            break;
        }
      } catch (err) {
        console.error('Error processing message:', err);
      }
    };

    ws.onclose = (event) => {
      console.log(`🔌 WebSocket closed: ${event.code}`);
      setConnectionStatus('disconnected');
      
      // Only reconnect if this is still the active ws
      if (wsRef.current === ws) {
        wsRef.current = null;
        // Auto-reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
        reconnectAttempts.current++;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }, [roomId, sendAwareness]);

  // Store connect in a ref so bindEditor stays stable
  const connectRef = useRef(connect);
  connectRef.current = connect;

  /**
   * Bind Monaco editor to Yjs document
   */
  const bindEditor = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Create Yjs doc if not yet created
    if (!ydocRef.current) {
      ydocRef.current = new Y.Doc();
    }
    const ydoc = ydocRef.current;
    const ytext = ydoc.getText('monaco');

    // Set initial content from Yjs if any
    const currentContent = ytext.toString();
    if (currentContent) {
      editor.setValue(currentContent);
    }

    // Listen for editor changes → update Yjs
    editor.onDidChangeModelContent((event) => {
      // Skip if this change came from a remote Yjs update
      if (isRemoteEditRef.current) return;

      isLocalEditRef.current = true;
      
      ydoc.transact(() => {
        const currentYtext = ydoc.getText('monaco');
        // Process changes in reverse order to maintain correct offsets
        const sortedChanges = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
        
        for (const change of sortedChanges) {
          if (change.rangeLength > 0) {
            currentYtext.delete(change.rangeOffset, change.rangeLength);
          }
          if (change.text) {
            currentYtext.insert(change.rangeOffset, change.text);
          }
        }
      }, 'monaco');

      isLocalEditRef.current = false;

      // Mark as typing
      isTypingRef.current = true;
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false;
        // Send awareness with isTyping=false
        const pos = editor.getPosition();
        if (pos) sendAwareness({ lineNumber: pos.lineNumber, column: pos.column }, null, false);
      }, 2000);
    });

    // Listen for Yjs updates → send to server
    ydoc.on('update', (update, origin) => {
      // Only send local changes to server (not remote ones we received)
      if (origin === 'remote') return;
      
      const msg = new Uint8Array(2 + update.length);
      msg[0] = MSG_SYNC;
      msg[1] = SYNC_UPDATE;
      msg.set(update, 2);
      sendMessage(msg);
    });

    // Track cursor position changes → broadcast awareness
    editor.onDidChangeCursorPosition((event) => {
      const position = event.position;
      const selection = editor.getSelection();
      
      sendAwareness(
        { lineNumber: position.lineNumber, column: position.column },
        selection && !selection.isEmpty() ? {
          startLineNumber: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLineNumber: selection.endLineNumber,
          endColumn: selection.endColumn,
        } : null
      );
    });

    // Connect WebSocket after editor is bound
    connectRef.current();
  }, [sendMessage, sendAwareness]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
      if (ydocRef.current) ydocRef.current.destroy();
      
      // Clean up cursor styles
      const styleEl = document.getElementById('remote-cursor-styles');
      if (styleEl) styleEl.remove();
    };
  }, []);

  return {
    bindEditor,
    connectionStatus,
    remoteUsers,
    isReady,
    clientId: clientIdRef.current,
    userName: userNameRef.current,
    userColor: userColorRef.current,
    userAvatar: userAvatarRef.current,
  };
}
