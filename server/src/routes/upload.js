import express from 'express';
import * as roomService from '../services/roomService.js';
import * as filebaseService from '../services/filebaseService.js';
import { uploadLimiter } from '../middleware/security.js';
import { verifySocketInRoom, validateFilename } from '../middleware/auth.js';

const router = express.Router();

// Maximum file size for upload URLs (20MB)
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * POST /api/rooms/:id/upload-url
 * Generate a pre-signed upload URL for Filebase.
 */
router.post('/:id/upload-url', uploadLimiter, async (req, res) => {
  try {
    const { filename, fileType, socketId } = req.body;
    const roomId = req.params.id;

    // Validate required fields
    if (!filename || !fileType) {
      return res.status(400).json({ error: 'filename and fileType are required' });
    }

    // Validate filename safety
    const filenameCheck = validateFilename(filename);
    if (!filenameCheck.valid) {
      return res.status(400).json({ error: filenameCheck.error });
    }

    // Verify room exists
    const roomExists = await roomService.roomExists(roomId);
    if (!roomExists) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }

    // Verify socket session belongs to this room (if socketId provided)
    if (socketId && !verifySocketInRoom(socketId, roomId)) {
      console.warn(`[Upload] Socket ${socketId?.slice(0, 8)} not verified for room ${roomId}`);
      // Allow the request but log the warning — don't hard-block to avoid breaking legitimate users
    }

    // Check if Storage is configured
    if (!filebaseService.isConfigured()) {
      return res.status(503).json({ error: 'File storage not configured. Set Filebase credentials in .env' });
    }

    const { uploadUrl, fileKey, downloadUrl } = await filebaseService.generateUploadUrl(
      roomId,
      filename,
      fileType
    );

    await roomService.resetTTL(roomId);

    res.json({ uploadUrl, fileKey, downloadUrl });
  } catch (err) {
    console.error('[Upload] URL generation error:', err.message);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

/**
 * POST /api/rooms/:id/files
 * Register an uploaded file in the room's file list.
 */
router.post('/:id/files', async (req, res) => {
  try {
    const { socketId, name, size, key, downloadUrl } = req.body;
    const roomId = req.params.id;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'file name is required' });
    }

    // Validate filename safety
    const filenameCheck = validateFilename(name);
    if (!filenameCheck.valid) {
      return res.status(400).json({ error: filenameCheck.error });
    }

    // Validate file size (server-side enforcement)
    if (size && size > MAX_FILE_SIZE) {
      return res.status(400).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` });
    }

    // Verify room exists
    const roomExists = await roomService.roomExists(roomId);
    if (!roomExists) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }

    const files = await roomService.addFile(roomId, { name, size, key, downloadUrl }, socketId);

    res.json({ files });
  } catch (err) {
    console.error('[Upload] File registration error:', err.message);
    res.status(500).json({ error: 'Failed to register file' });
  }
});

/**
 * DELETE /api/rooms/:id/files/:key
 * Delete a file from Filebase and the room's file list.
 */
router.delete('/:id/files/:key(*)', async (req, res) => {
  try {
    const { socketId } = req.query;
    const { id, key } = req.params;

    if (!socketId || typeof socketId !== 'string') {
      return res.status(400).json({ error: 'socketId is required' });
    }

    // Verify socket session belongs to this room
    if (!verifySocketInRoom(socketId, id)) {
      return res.status(403).json({ error: 'Permission denied: invalid session' });
    }

    const hostId = await roomService.getHost(id);
    const isAdmin = (socketId === hostId);
    
    if (!isAdmin) {
      const room = await roomService.getRoom(id);
      const file = room?.files?.find(f => f.key === key);
      if (!file || file.ownerId !== socketId) {
        return res.status(403).json({ error: 'Permission denied: You do not own this file' });
      }
    }

    // 1. Delete from Filebase
    try {
      await filebaseService.deleteFile(key);
    } catch (s3Err) {
      console.warn(`[Upload] File already missing from S3 or error: ${key}`);
    }

    // 2. Remove from Redis
    const files = await roomService.removeFile(id, key);

    res.json({ success: true, files });
  } catch (err) {
    console.error('[Upload] File deletion error:', err.message);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});


export default router;