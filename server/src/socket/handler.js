import * as roomService from '../services/roomService.js';

/**
 * Initialize Socket.io event handlers.
 */
export function initSocketHandlers(io) {
  // Track connected users per room
  const roomUsers = new Map();

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    let currentRoom = null;

    /**
     * join-room: Client joins a room and receives current state.
     */
    socket.on('join-room', async ({ roomId, adminToken }) => {
      try {
        const room = await roomService.getRoom(roomId);
        if (!room) {
          socket.emit('error', { message: 'Room not found or expired' });
          return;
        }

        // Join Socket.io room
        socket.join(roomId);
        currentRoom = roomId;

        // Track user count
        if (!roomUsers.has(roomId)) {
          roomUsers.set(roomId, new Set());
        }
        roomUsers.get(roomId).add(socket.id);

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

        // Broadcast updated user count
        const count = roomUsers.get(roomId)?.size || 0;
        io.to(roomId).emit('user-count', { count });

        // Reset TTL on join
        await roomService.resetTTL(roomId);

        console.log(`[Socket] ${socket.id} joined room ${roomId} (admin: ${isAdmin})`);
      } catch (err) {
        console.error('[Socket] join-room error:', err);
        socket.emit('error', { message: 'Failed to join room' });
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
          io.to(roomId).emit('block-added', { block: newBlock });
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
    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);

      if (currentRoom && roomUsers.has(currentRoom)) {
        roomUsers.get(currentRoom).delete(socket.id);
        const count = roomUsers.get(currentRoom).size;

        if (count === 0) {
          roomUsers.delete(currentRoom);
        } else {
          io.to(currentRoom).emit('user-count', { count });
        }
      }
    });
  });
}
