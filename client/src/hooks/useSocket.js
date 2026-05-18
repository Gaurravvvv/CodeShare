import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/**
 * Custom hook for managing Socket.io connection.
 * Returns socket instance and helper functions.
 */
export function useSocket(roomId, adminToken, username) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!roomId) return;

    let isMounted = true;
    let newSocket = null;

    // Delay connection slightly to prevent React 18 Strict Mode double-invocation
    // from instantly creating and destroying the socket (which causes the WebSocket error).
    const connectTimer = setTimeout(() => {
      if (!isMounted) return;

      newSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('[Socket] Connected:', newSocket.id);
        newSocket.emit('join-room', { roomId, adminToken, username });
      });

      newSocket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
      });

      newSocket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
      });
    }, 50);

    return () => {
      isMounted = false;
      clearTimeout(connectTimer);
      if (newSocket) {
        newSocket.disconnect();
      }
      setSocket(null);
    };
  }, [roomId, adminToken, username]);

  const emit = useCallback((event, data) => {
    if (socket?.connected) {
      socket.emit(event, data);
    }
  }, [socket]);

  return { socket, emit };
}

