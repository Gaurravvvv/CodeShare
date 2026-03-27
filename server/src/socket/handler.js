import * as roomService from '../services/roomService.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Initialize Socket.io event handlers.
 */
export function initSocketHandlers(io) {
  // Track connected users per room (in-memory for user count)
  const roomUsers = new Map();

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    let currentRoom = null;
    let currentUsername = null;

    /**
     * join-room: Client joins a room and receives current state.
     */
    socket.on('join-room', async ({ roomId, adminToken, username }) => {
      try {
        const room = await roomService.getRoom(roomId);
        if (!room) {
          socket.emit('error', { message: 'Room not found or expired' });
          return;
        }

        // Join Socket.io room
        socket.join(roomId);
        currentRoom = roomId;
        currentUsername = username || `User-${socket.id.slice(0, 4)}`;

        // Track user count (in-memory)
        if (!roomUsers.has(roomId)) {
          roomUsers.set(roomId, new Set());
        }
        roomUsers.get(roomId).add(socket.id);

        // Store user in Redis Hash for identity tracking
        await roomService.addUser(roomId, socket.id, currentUsername);

        // Verify admin status
        const isAdmin = adminToken
          ? await roomService.verifyAdmin(roomId, adminToken)
          : false;

        // Send current room state
        socket.emit('room-state', {
          blocks: room.blocks,
          files: room.files,
          isAdmin,
          userCount: roomUsers.get(roomId).size,
        });

        // Send chat history (last 50 messages)
        const messages = await roomService.getMessages(roomId, 50);
        socket.emit('chat-history', { messages });

        // Send active users list to everyone in the room
        const users = await roomService.getUsers(roomId);
        const userList = Object.values(users);
        io.to(roomId).emit('users-updated', { users: userList });

        // Broadcast updated user count
        const count = roomUsers.get(roomId)?.size || 0;
        io.to(roomId).emit('user-count', { count });

        // Reset TTL on join
        await roomService.resetTTL(roomId);

        console.log(`[Socket] ${currentUsername} (${socket.id}) joined room ${roomId} (admin: ${isAdmin})`);
      } catch (err) {
        console.error('[Socket] join-room error:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    /**
     * send-message: User sends a chat message.
     */
    socket.on('send-message', async ({ roomId, text, replyTo }) => {
      try {
        if (!currentRoom || currentRoom !== roomId) return;
        if (!text || !text.trim()) return;

        const message = {
          id: uuidv4(),
          sender: currentUsername || `User-${socket.id.slice(0, 4)}`,
          text: text.trim(),
          replyTo: replyTo || null,
          timestamp: Date.now(),
        };

        // Persist to Redis
        await roomService.addMessage(roomId, message);

        // Broadcast to all clients in room (including sender)
        io.to(roomId).emit('new-message', { message });

        await roomService.resetTTL(roomId);
      } catch (err) {
        console.error('[Socket] send-message error:', err);
      }
    });

    /**
     * code-update: Admin sends code changes for a specific block.
     */
    socket.on('code-update', async ({ roomId, blockId, code, adminToken }) => {
      try {
        if (!adminToken) {
          socket.emit('error', { message: 'Admin token required' });
          return;
        }

        const isAdmin = await roomService.verifyAdmin(roomId, adminToken);
        if (!isAdmin) {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        // Save to Redis
        await roomService.updateCodeBlock(roomId, blockId, code);

        // Broadcast to all OTHER clients in the room
        socket.to(roomId).emit('code-updated', { blockId, code });
      } catch (err) {
        console.error('[Socket] code-update error:', err);
      }
    });

    /**
     * language-change: Admin changes the language for a specific block.
     */
    socket.on('language-change', async ({ roomId, blockId, language, adminToken }) => {
      try {
        if (!adminToken) {
          socket.emit('error', { message: 'Admin token required' });
          return;
        }

        const isAdmin = await roomService.verifyAdmin(roomId, adminToken);
        if (!isAdmin) {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        await roomService.updateLanguageBlock(roomId, blockId, language);
        socket.to(roomId).emit('language-changed', { blockId, language });
      } catch (err) {
        console.error('[Socket] language-change error:', err);
      }
    });

    /**
     * block-added: Admin requests a new code block.
     */
    socket.on('block-added', async ({ roomId, adminToken }) => {
      console.log(`[Socket] Received block-added request for room ${roomId}`);
      try {
        if (!adminToken) {
          console.log('[Socket] No adminToken provided');
          return;
        }
        const isAdmin = await roomService.verifyAdmin(roomId, adminToken);
        if (!isAdmin) {
          console.log('[Socket] verifyAdmin failed');
          return;
        }

        const newBlock = await roomService.addCodeBlock(roomId);
        console.log(`[Socket] Created new block:`, newBlock);
        if (newBlock) {
          // Send to sender with isOwner: true
          socket.emit('block-added', { block: newBlock, isOwner: true });
          // Send to others with isOwner: false
          socket.to(roomId).emit('block-added', { block: newBlock, isOwner: false });
          console.log(`[Socket] Broadcasted new block to room ${roomId}`);
        } else {
          console.log('[Socket] addCodeBlock returned null');
        }
      } catch (err) {
        console.error('[Socket] block-added error:', err);
      }
    });

    /**
     * block-deleted: Admin requests to delete a code block.
     */
    socket.on('block-deleted', async ({ roomId, blockId, adminToken }) => {
      try {
        if (!adminToken) return;
        const isAdmin = await roomService.verifyAdmin(roomId, adminToken);
        if (!isAdmin) return;

        await roomService.deleteCodeBlock(roomId, blockId);
        io.to(roomId).emit('block-deleted', { blockId });
      } catch (err) {
        console.error('[Socket] block-deleted error:', err);
      }
    });

    /**
     * block-rename: Admin requests to rename a code block.
     */
    socket.on('block-rename', async ({ roomId, blockId, name, adminToken }) => {
      try {
        if (!adminToken) return;
        const isAdmin = await roomService.verifyAdmin(roomId, adminToken);
        if (!isAdmin) return;

        await roomService.updateBlockName(roomId, blockId, name);
        io.to(roomId).emit('block-renamed', { blockId, name });
      } catch (err) {
        console.error('[Socket] block-rename error:', err);
      }
    });

    /**
     * file-uploaded: Admin notifies that a file was uploaded.
     */
    socket.on('file-uploaded', async ({ roomId, fileData, adminToken }) => {
      try {
        if (!adminToken) {
          socket.emit('error', { message: 'Admin token required' });
          return;
        }

        const isAdmin = await roomService.verifyAdmin(roomId, adminToken);
        if (!isAdmin) {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        // Broadcast new file to ALL clients in room (including sender for confirmation)
        io.to(roomId).emit('file-added', { fileData });

        await roomService.resetTTL(roomId);
      } catch (err) {
        console.error('[Socket] file-uploaded error:', err);
      }
    });

    /**
     * file-deleted: Admin notifies that a file was deleted.
     */
    socket.on('file-deleted', async ({ roomId, fileKey, adminToken }) => {
      try {
        if (!adminToken) {
          socket.emit('error', { message: 'Admin token required' });
          return;
        }

        const isAdmin = await roomService.verifyAdmin(roomId, adminToken);
        if (!isAdmin) {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        // Broadcast file deletion to ALL clients in room
        io.to(roomId).emit('file-deleted', { fileKey });

        await roomService.resetTTL(roomId);
      } catch (err) {
        console.error('[Socket] file-deleted error:', err);
      }
    });

    /**
     * disconnect: Clean up when client disconnects.
     */
    socket.on('disconnect', async () => {
      console.log(`[Socket] Client disconnected: ${socket.id} (${currentUsername})`);

      if (currentRoom) {
        // Remove from Redis users hash
        try {
          await roomService.removeUser(currentRoom, socket.id);
          const users = await roomService.getUsers(currentRoom);
          const userList = Object.values(users);
          io.to(currentRoom).emit('users-updated', { users: userList });
        } catch (err) {
          console.error('[Socket] disconnect user cleanup error:', err);
        }

        // Update in-memory count
        if (roomUsers.has(currentRoom)) {
          roomUsers.get(currentRoom).delete(socket.id);
          const count = roomUsers.get(currentRoom).size;

          if (count === 0) {
            roomUsers.delete(currentRoom);
          } else {
            io.to(currentRoom).emit('user-count', { count });
          }
        }
      }
    });
  });
}
