import { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

// ICE servers for WebRTC NAT traversal
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * RoomChat — text chat + voice/video calling (requires auth)
 */
export default function RoomChat({ roomId, token, user, avatar, isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [activeCall, setActiveCall] = useState(null); // { type: 'voice'|'video', participants: [] }
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Connect WebSocket when panel opens
  useEffect(() => {
    if (!isOpen || !token || !roomId) return;

    const wsUrl = `${WS_URL}/chat?room=${roomId}&token=${encodeURIComponent(token)}${avatar ? `&avatar=${encodeURIComponent(avatar)}` : ''}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('💬 Chat connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleIncomingMessage(msg);
      } catch (e) {}
    };

    ws.onclose = () => {
      console.log('💬 Chat disconnected');
    };

    return () => {
      ws.close();
      wsRef.current = null;
      cleanupCall();
    };
  }, [isOpen, token, roomId]);

  // Handle incoming messages
  const handleIncomingMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'chat':
        setMessages(prev => [...prev, msg]);
        break;

      case 'system':
        setMessages(prev => [...prev, { ...msg, isSystem: true }]);
        break;

      case 'participants':
        setParticipants(msg.participants || []);
        break;

      case 'typing':
        setTypingUsers(prev => {
          if (prev.find(u => u.userId === msg.userId)) return prev;
          return [...prev, msg];
        });
        // Clear typing after 3s
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.userId !== msg.userId));
        }, 3000);
        break;

      case 'call-start':
        setActiveCall(prev => ({
          type: msg.callType || 'voice',
          startedBy: msg.username,
          participants: [{ id: msg.userId, username: msg.username, avatar: msg.avatar }],
        }));
        setMessages(prev => [...prev, {
          isSystem: true,
          text: `${msg.username} started a ${msg.callType || 'voice'} call`,
          timestamp: Date.now(),
        }]);
        break;

      case 'call-accept':
        setActiveCall(prev => {
          if (!prev) return prev;
          const exists = prev.participants.find(p => p.id === msg.userId);
          if (exists) return prev;
          return { ...prev, participants: [...prev.participants, { id: msg.userId, username: msg.username, avatar: msg.avatar }] };
        });
        break;

      case 'call-end':
        setMessages(prev => [...prev, {
          isSystem: true,
          text: `${msg.username} ended the call`,
          timestamp: Date.now(),
        }]);
        setActiveCall(null);
        cleanupCall();
        break;

      case 'peer-left':
        // Remove peer from active call
        setActiveCall(prev => {
          if (!prev) return prev;
          const filtered = prev.participants.filter(p => p.id !== msg.userId);
          if (filtered.length === 0) return null;
          return { ...prev, participants: filtered };
        });
        // Close peer connection
        const pc = peerConnectionsRef.current.get(msg.userId);
        if (pc) {
          pc.close();
          peerConnectionsRef.current.delete(msg.userId);
          setRemoteStreams(prev => {
            const next = new Map(prev);
            next.delete(msg.userId);
            return next;
          });
        }
        break;

      // WebRTC signaling
      case 'webrtc-offer':
        handleWebRTCOffer(msg);
        break;
      case 'webrtc-answer':
        handleWebRTCAnswer(msg);
        break;
      case 'webrtc-ice-candidate':
        handleWebRTCIceCandidate(msg);
        break;

      default:
        break;
    }
  }, []);

  // Send text message
  const handleSendMessage = useCallback((e) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !wsRef.current) return;

    wsRef.current.send(JSON.stringify({ type: 'chat', text }));
    setInputText('');
  }, [inputText]);

  // Send typing indicator
  const handleTyping = useCallback(() => {
    if (!wsRef.current) return;
    clearTimeout(typingTimerRef.current);
    wsRef.current.send(JSON.stringify({ type: 'typing' }));
    typingTimerRef.current = setTimeout(() => {}, 3000);
  }, []);

  // === Voice / Video Call ===
  const startCall = useCallback(async (callType) => {
    try {
      const constraints = {
        audio: true,
        video: callType === 'video',
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Notify room
      wsRef.current?.send(JSON.stringify({ type: 'call-start', callType }));

      setActiveCall({
        type: callType,
        startedBy: user?.username,
        participants: [{ id: user?.id, username: user?.username, avatar: user?.avatar || '🦊' }],
      });
    } catch (err) {
      console.error('Failed to start call:', err);
      setMessages(prev => [...prev, {
        isSystem: true,
        text: `Failed to access ${callType === 'video' ? 'camera/microphone' : 'microphone'}: ${err.message}`,
        timestamp: Date.now(),
      }]);
    }
  }, [user]);

  const joinCall = useCallback(async () => {
    if (!activeCall) return;

    try {
      const constraints = {
        audio: true,
        video: activeCall.type === 'video',
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Notify room
      wsRef.current?.send(JSON.stringify({ type: 'call-accept' }));

      // Create peer connections to existing participants
      for (const participant of activeCall.participants) {
        if (participant.id === user?.id) continue;
        await createPeerConnection(participant.id, true, stream);
      }
    } catch (err) {
      console.error('Failed to join call:', err);
    }
  }, [activeCall, user]);

  const endCall = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'call-end' }));
    cleanupCall();
    setActiveCall(null);
  }, []);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsMuted(prev => !prev);
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsVideoOff(prev => !prev);
    }
  }, []);

  // WebRTC Peer Connection management
  const createPeerConnection = useCallback(async (targetUserId, isInitiator, stream) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionsRef.current.set(targetUserId, pc);

    // Add local tracks
    const localStr = stream || localStreamRef.current;
    if (localStr) {
      localStr.getTracks().forEach(track => {
        pc.addTrack(track, localStr);
      });
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(targetUserId, event.streams[0]);
        return next;
      });
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsRef.current?.send(JSON.stringify({
          type: 'webrtc-ice-candidate',
          targetUserId,
          candidate: event.candidate,
        }));
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(JSON.stringify({
        type: 'webrtc-offer',
        targetUserId,
        sdp: offer,
      }));
    }

    return pc;
  }, []);

  const handleWebRTCOffer = useCallback(async (msg) => {
    const pc = await createPeerConnection(msg.userId, false, localStreamRef.current);
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsRef.current?.send(JSON.stringify({
      type: 'webrtc-answer',
      targetUserId: msg.userId,
      sdp: answer,
    }));
  }, [createPeerConnection]);

  const handleWebRTCAnswer = useCallback(async (msg) => {
    const pc = peerConnectionsRef.current.get(msg.userId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    }
  }, []);

  const handleWebRTCIceCandidate = useCallback(async (msg) => {
    const pc = peerConnectionsRef.current.get(msg.userId);
    if (pc && msg.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
  }, []);

  const cleanupCall = useCallback(() => {
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setIsMuted(false);
    setIsVideoOff(false);

    // Close all peer connections
    for (const [, pc] of peerConnectionsRef.current) {
      pc.close();
    }
    peerConnectionsRef.current.clear();
    setRemoteStreams(new Map());
  }, []);

  // Time formatting
  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  const isInCall = localStream !== null;

  return (
    <div className="chat-panel">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Chat</span>
          <span className="chat-badge">{participants.length}</span>
        </div>
        <div className="chat-header-right">
          {/* Voice Call */}
          {!isInCall && (
            <button className="chat-action-btn" onClick={() => startCall('voice')} title="Voice call">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </button>
          )}
          {/* Video Call */}
          {!isInCall && (
            <button className="chat-action-btn" onClick={() => startCall('video')} title="Video call">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </button>
          )}
          <button className="chat-close-btn" onClick={onClose} title="Close chat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Active Call Banner */}
      {activeCall && (
        <div className="chat-call-banner">
          <div className="call-info">
            <span className="call-pulse" />
            <span>{activeCall.type === 'video' ? '📹' : '🎙️'} {activeCall.startedBy}&apos;s {activeCall.type} call</span>
            <span className="call-count">{activeCall.participants.length} in call</span>
          </div>
          <div className="call-actions">
            {!isInCall ? (
              <button className="call-join-btn" onClick={joinCall}>Join</button>
            ) : (
              <>
                <button className={`call-control-btn ${isMuted ? 'active' : ''}`} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                  {isMuted ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.49-.34 2.18" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                  )}
                </button>
                {activeCall.type === 'video' && (
                  <button className={`call-control-btn ${isVideoOff ? 'active' : ''}`} onClick={toggleVideo} title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}>
                    {isVideoOff ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                    )}
                  </button>
                )}
                <button className="call-end-btn" onClick={endCall} title="End call">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Hidden Audio for All Calls */}
      {isInCall && (
        <div style={{ display: 'none' }}>
          {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
            <audio
              key={userId}
              ref={(el) => { if (el) el.srcObject = stream; }}
              autoPlay
            />
          ))}
        </div>
      )}

      {/* Video Streams */}
      {isInCall && activeCall?.type === 'video' && (
        <div className="chat-video-grid">
          {/* Local video */}
          <div className="video-tile">
            <video
              ref={(el) => { if (el && localStream) el.srcObject = localStream; }}
              autoPlay
              playsInline
              muted
              className="video-stream"
            />
            <span className="video-label">You {isMuted && '🔇'}</span>
          </div>
          {/* Remote videos */}
          {Array.from(remoteStreams.entries()).map(([userId, stream]) => {
            const p = activeCall?.participants.find(x => x.id === userId);
            return (
              <div key={userId} className="video-tile">
                <video
                  ref={(el) => { if (el) el.srcObject = stream; }}
                  autoPlay
                  playsInline
                  muted
                  className="video-stream"
                />
                <span className="video-label">{p?.username || 'User'}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Start a conversation with your team</span>
            <span className="chat-empty-sub">Messages are room-scoped and live only during the session</span>
          </div>
        ) : (
          messages.map((msg, i) => (
            msg.isSystem ? (
              <div key={i} className="chat-msg-system">
                {msg.text}
              </div>
            ) : (
              <div key={i} className={`chat-msg ${msg.userId === user?.id ? 'chat-msg-own' : ''}`}>
                <div className="chat-msg-header">
                  <span className="chat-msg-avatar">
                    {msg.userId === user?.id 
                      ? (avatar || user?.avatar || '🦊') 
                      : (participants.find(p => p.id === msg.userId)?.avatar || msg.avatar || '🦊')}
                  </span>
                  <span className="chat-msg-name">{msg.userId === user?.id ? 'You' : msg.username}</span>
                  <span className="chat-msg-time">{formatTime(msg.timestamp)}</span>
                </div>
                <div className="chat-msg-text">{msg.text}</div>
              </div>
            )
          ))
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="chat-typing">
            {typingUsers.map(u => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form className="chat-input-bar" onSubmit={handleSendMessage}>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => { setInputText(e.target.value); handleTyping(); }}
          maxLength={2000}
          autoFocus
        />
        <button type="submit" className="chat-send-btn" disabled={!inputText.trim()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
