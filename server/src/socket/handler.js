import * as roomService from '../services/roomService.js';
import { v4 as uuidv4 } from 'uuid';
import {
  registerSocketSession,
  unregisterSocketSession,
  checkSocketRate,
} from '../middleware/auth.js';
import {
  sanitizeString,
  sanitizeUsername,
  pickSafeKeys,
} from '../middleware/security.js';
import { activeSocketConnectionsGauge } from '../metrics.js';

// ─── Constants ──────────────────────────────────────────────────────────────────
const MAX_CHAT_MESSAGE_LENGTH = 2000;
const MAX_CODE_LENGTH = 100000;      // 100KB per code block
const MAX_BLOCK_NAME_LENGTH = 50;

async function checkPermission(roomId, adminToken, socketId, resourceType, resourceId) {
  const hostId = await roomService.getHost(roomId);
  const isAdmin = (socketId === hostId);
  if (isAdmin) return true;
  
  const room = await roomService.getRoom(roomId);
  if (!room) return false;

  if (resourceType === 'block') {
    const block = room.blocks.find(b => b.id === resourceId);
    if (block && block.ownerId === socketId) return true;
  } else if (resourceType === 'file') {
    const file = room.files.find(f => f.key === resourceId);
    if (file && file.ownerId === socketId) return true;
  }
  return false;
}

/**
 * Initialize Socket.io event handlers.
 */
export function initSocketHandlers(io) {
  // Track connected users per room (in-memory for user count)
  const roomUsers = new Map();

  io.on('connection', (socket) => {
    activeSocketConnectionsGauge.inc();
    console.log(`[Socket] Client connected: ${socket.id.slice(0, 8)}...`);

    let currentRoom = null;
    let currentUsername = null;

    // ─── Rate limit wrapper ─────────────────────────────────────────
    function withRateLimit(handler) {
      return async (...args) => {
        if (!checkSocketRate(socket.id)) {
          socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
          return;
        }
        try {
          await handler(...args);
        } catch (err) {
          console.error(`[Socket] Event handler error:`, err.message);
          socket.emit('error', { message: 'An error occurred' });
        }
      };
    }

    /**
     * join-room: Client joins a room and receives current state.
     */
    socket.on('join-room', withRateLimit(async ({ roomId, adminToken, username }) => {
      // Validate roomId format
      if (!roomId || typeof roomId !== 'string' || !/^[A-Z0-9]{4,10}$/i.test(roomId)) {
        socket.emit('error', { message: 'Invalid room ID' });
        return;
      }

      const room = await roomService.getRoom(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found or expired' });
        return;
      }

      // Join Socket.io room
      socket.join(roomId);
      currentRoom = roomId;
      currentUsername = sanitizeUsername(username) || `User-${socket.id.slice(0, 4)}`;

      // Register socket session for auth verification
      registerSocketSession(socket.id, roomId);

      // Track user count (in-memory)
      if (!roomUsers.has(roomId)) {
        roomUsers.set(roomId, new Set());
      }
      roomUsers.get(roomId).add(socket.id);

      // Store user in Redis Hash for identity tracking
      const transferred = await roomService.addUser(roomId, socket.id, currentUsername);
      
      // Always re-read from Redis after addUser — ownership may have been updated
      const freshRoom = await roomService.getRoom(roomId);
      const roomStateBlocks = freshRoom.blocks;
      const roomStateFiles = freshRoom.files;
      
      if (transferred) {
        socket.to(roomId).emit('ownership-transferred', { blocks: roomStateBlocks, files: roomStateFiles });
      }

      // Derive user count from Redis (source of truth)
      const allUsers = await roomService.getUsers(roomId);
      const userCount = Object.keys(allUsers).length;

      // Verify admin/host status
      const hostId = await roomService.getHost(roomId);
      const isAdmin = (socket.id === hostId);

      // Send current room state
      socket.emit('room-state', {
        blocks: roomStateBlocks,
        files: roomStateFiles,
        isAdmin,
        socketId: socket.id,
        hostId,
        userCount,
      });

      // Send chat history (last 50 messages)
      const messages = await roomService.getMessages(roomId, 50);
      socket.emit('chat-history', { messages });

      // Send active users list to everyone in the room
      const users = await roomService.getUsers(roomId);
      const userList = Object.values(users);
      io.to(roomId).emit('users-updated', { users: userList });

      // Broadcast updated user count from Redis
      io.to(roomId).emit('user-count', { count: userCount });

      // Broadcast current host
      io.to(roomId).emit('host-updated', { hostId });

      // Reset TTL on join
      await roomService.resetTTL(roomId);

      console.log(`[Socket] ${currentUsername} joined room ${roomId} (admin: ${isAdmin})`);
    }));

    /**
     * send-message: User sends a chat message.
     */
    socket.on('send-message', withRateLimit(async ({ roomId, text, replyTo }) => {
      if (!currentRoom || currentRoom !== roomId) return;
      if (!text || typeof text !== 'string') return;
      
      // Sanitize and limit message length
      const sanitizedText = text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
      if (!sanitizedText) return;

      const message = {
        id: uuidv4(),
        sender: currentUsername || `User-${socket.id.slice(0, 4)}`,
        text: sanitizedText,
        replyTo: replyTo ? pickSafeKeys(replyTo, ['id', 'sender', 'text']) : null,
        timestamp: Date.now(),
      };

      // Sanitize replyTo fields if present
      if (message.replyTo) {
        if (typeof message.replyTo.text === 'string') {
          message.replyTo.text = message.replyTo.text.slice(0, 100);
        }
        if (typeof message.replyTo.sender === 'string') {
          message.replyTo.sender = sanitizeString(message.replyTo.sender, 20);
        }
      }

      // Persist to Redis
      await roomService.addMessage(roomId, message);

      // Broadcast to all clients in room (including sender)
      io.to(roomId).emit('new-message', { message });

      await roomService.resetTTL(roomId);
    }));

    /**
     * code-update: Admin sends code changes for a specific block.
     */
    socket.on('code-update', withRateLimit(async ({ roomId, blockId, code, adminToken }) => {
      // Validate code size
      if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH) {
        socket.emit('error', { message: `Code too large (max ${MAX_CODE_LENGTH / 1000}KB)` });
        return;
      }

      const hasPerm = await checkPermission(roomId, adminToken, socket.id, 'block', blockId);
      if (!hasPerm) {
        socket.emit('error', { message: 'Permission denied: You do not own this block' });
        return;
      }

      // Save to Redis
      await roomService.updateCodeBlock(roomId, blockId, code);

      // Broadcast to all OTHER clients in the room
      socket.to(roomId).emit('code-updated', { blockId, code });
    }));

    /**
     * language-change: Admin changes the language for a specific block.
     */
    socket.on('language-change', withRateLimit(async ({ roomId, blockId, language, adminToken }) => {
      // Validate language (alphanumeric, max 30 chars)
      if (typeof language !== 'string' || language.length > 30 || !/^[a-zA-Z0-9+#]+$/.test(language)) {
        socket.emit('error', { message: 'Invalid language value' });
        return;
      }

      const hasPerm = await checkPermission(roomId, adminToken, socket.id, 'block', blockId);
      if (!hasPerm) {
        socket.emit('error', { message: 'Permission denied: You do not own this block' });
        return;
      }

      await roomService.updateLanguageBlock(roomId, blockId, language);
      socket.to(roomId).emit('language-changed', { blockId, language });
    }));

    /**
     * block-added: Admin requests a new code block.
     */
    socket.on('block-added', withRateLimit(async ({ roomId, adminToken }) => {
      if (!currentRoom || currentRoom !== roomId) return;

      const newBlock = await roomService.addCodeBlock(roomId, socket.id);
      if (newBlock) {
        // Send to sender with isOwner: true
        socket.emit('block-added', { block: newBlock, isOwner: true });
        // Send to others with isOwner: false
        socket.to(roomId).emit('block-added', { block: newBlock, isOwner: false });
      }
    }));

    /**
     * block-deleted: Admin requests to delete a code block.
     */
    socket.on('block-deleted', withRateLimit(async ({ roomId, blockId, adminToken }) => {
      const hasPerm = await checkPermission(roomId, adminToken, socket.id, 'block', blockId);
      if (!hasPerm) {
        socket.emit('error', { message: 'Permission denied: You do not own this block' });
        return;
      }

      await roomService.deleteCodeBlock(roomId, blockId);
      io.to(roomId).emit('block-deleted', { blockId });
    }));

    /**
     * block-rename: Admin requests to rename a code block.
     */
    socket.on('block-rename', withRateLimit(async ({ roomId, blockId, name, adminToken }) => {
      // Validate block name
      if (typeof name !== 'string' || name.length > MAX_BLOCK_NAME_LENGTH) {
        socket.emit('error', { message: `Block name too long (max ${MAX_BLOCK_NAME_LENGTH} chars)` });
        return;
      }
      // Sanitize: allow alphanumeric, dots, hyphens, underscores, spaces
      const sanitizedName = name.replace(/[^a-zA-Z0-9._\- ]/g, '').trim();
      if (!sanitizedName) {
        socket.emit('error', { message: 'Invalid block name' });
        return;
      }

      const hasPerm = await checkPermission(roomId, adminToken, socket.id, 'block', blockId);
      if (!hasPerm) {
        socket.emit('error', { message: 'Permission denied: You do not own this block' });
        return;
      }

      await roomService.updateBlockName(roomId, blockId, sanitizedName);
      io.to(roomId).emit('block-renamed', { blockId, name: sanitizedName });
    }));

    /**
     * file-uploaded: User notifies that a file was uploaded.
     */
    socket.on('file-uploaded', withRateLimit(async ({ roomId, fileData, adminToken }) => {
      if (!currentRoom || currentRoom !== roomId) return;

      // Sanitize fileData — only allow known safe keys (prevents prototype pollution)
      const safeFileData = pickSafeKeys(fileData, ['name', 'size', 'key', 'downloadUrl']);
      safeFileData.ownerId = socket.id;

      // Broadcast new file to ALL clients in room (including sender for confirmation)
      io.to(roomId).emit('file-added', { fileData: safeFileData });

      await roomService.resetTTL(roomId);
    }));

    /**
     * file-deleted: User notifies that a file was deleted.
     */
    socket.on('file-deleted', withRateLimit(async ({ roomId, fileKey, adminToken }) => {
      if (!currentRoom || currentRoom !== roomId) return;

      const hasPerm = await checkPermission(roomId, adminToken, socket.id, 'file', fileKey);
      if (!hasPerm) {
        socket.emit('error', { message: 'Permission denied: You do not own this file' });
        return;
      }

      // Broadcast file deletion to ALL clients in room
      io.to(roomId).emit('file-deleted', { fileKey });

      await roomService.resetTTL(roomId);
    }));

    /**
     * disconnect: Clean up when client disconnects.
     */
    socket.on('disconnect', async () => {
      activeSocketConnectionsGauge.dec();
      console.log(`[Socket] Client disconnected: ${socket.id.slice(0, 8)}... (${currentUsername})`);

      // Unregister socket session
      unregisterSocketSession(socket.id);

      if (currentRoom) {
        // Remove from Redis users hash
        try {
          const { nextOwner, transferred } = await roomService.removeUser(currentRoom, socket.id);
          const users = await roomService.getUsers(currentRoom);
          const userList = Object.values(users);
          io.to(currentRoom).emit('users-updated', { users: userList });
          
          if (nextOwner) {
            io.to(currentRoom).emit('host-updated', { hostId: nextOwner });
          }

          if (transferred) {
            const room = await roomService.getRoom(currentRoom);
            if (room) {
              io.to(currentRoom).emit('ownership-transferred', { blocks: room.blocks, files: room.files });
            }
          }
        } catch (err) {
          console.error('[Socket] disconnect user cleanup error:', err.message);
        }

        // Update user count from Redis (source of truth)
        const allUsers = await roomService.getUsers(currentRoom);
        const count = Object.keys(allUsers).length;
        if (count === 0) {
          roomUsers.delete(currentRoom);
        } else {
          io.to(currentRoom).emit('user-count', { count });
        }
      }
    });
  });
}
