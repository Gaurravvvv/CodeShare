/**
 * Authentication & Session Middleware
 * Tracks socket sessions and provides HTTP endpoint verification.
 */

// In-memory socket session registry: socketId → { roomId, connectedAt }
const socketSessions = new Map();

// Per-socket event rate limiting: socketId → { count, windowStart }
const socketRates = new Map();
const SOCKET_RATE_LIMIT = 60;       // max events per window
const SOCKET_RATE_WINDOW = 10000;   // 10 second window

/**
 * Register a socket session (called when a socket joins a room).
 */
export function registerSocketSession(socketId, roomId) {
  socketSessions.set(socketId, { roomId, connectedAt: Date.now() });
}

/**
 * Unregister a socket session (called on disconnect).
 */
export function unregisterSocketSession(socketId) {
  socketSessions.delete(socketId);
  socketRates.delete(socketId);
}

/**
 * Get the room a socket is currently in.
 */
export function getSocketRoom(socketId) {
  return socketSessions.get(socketId)?.roomId || null;
}

/**
 * Verify that a socketId is real and belongs to a specific room.
 * Used by HTTP endpoints to validate client claims.
 */
export function verifySocketInRoom(socketId, roomId) {
  const session = socketSessions.get(socketId);
  if (!session) return false;
  return session.roomId === roomId;
}

/**
 * Check socket event rate limit.
 * Returns true if within limit, false if rate exceeded.
 */
export function checkSocketRate(socketId) {
  const now = Date.now();
  let entry = socketRates.get(socketId);

  if (!entry || (now - entry.windowStart) > SOCKET_RATE_WINDOW) {
    // New window
    entry = { count: 1, windowStart: now };
    socketRates.set(socketId, entry);
    return true;
  }

  entry.count++;
  if (entry.count > SOCKET_RATE_LIMIT) {
    return false;
  }
  return true;
}

/**
 * Socket.io connection middleware.
 * Validates basic connection parameters.
 */
export function socketAuthMiddleware(socket, next) {
  // For now, allow all connections but log origin
  // In production, you could verify tokens or origin here
  const origin = socket.handshake.headers.origin;
  const ip = socket.handshake.address;
  
  console.log(`[Auth] Socket connection from ${ip} (origin: ${origin})`);
  
  next();
}

// ─── Blocked File Extensions ────────────────────────────────────────────────────

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'ps1', 'msi', 'dll', 'scr',
  'com', 'vbs', 'vbe', 'wsf', 'wsh', 'cpl', 'inf', 'reg',
  'pif', 'hta', 'jar', 'app',
]);

/**
 * Check if a filename has a blocked extension.
 */
export function isBlockedFileType(filename) {
  if (!filename || typeof filename !== 'string') return true;
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return BLOCKED_EXTENSIONS.has(ext);
}

/**
 * Validate a filename for safety.
 */
export function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return { valid: false, error: 'Filename is required' };
  }
  if (filename.length > 255) {
    return { valid: false, error: 'Filename too long (max 255 chars)' };
  }
  // Block path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { valid: false, error: 'Invalid filename: path traversal detected' };
  }
  if (isBlockedFileType(filename)) {
    return { valid: false, error: `File type not allowed: .${filename.split('.').pop()}` };
  }
  return { valid: true };
}
