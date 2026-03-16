import express from 'express';
import * as roomService from '../services/roomService.js';
import * as filebaseService from '../services/filebaseService.js';

const router = express.Router();

/**
 * POST /api/rooms/:id/upload-url
 * Generate a pre-signed upload URL for Filebase. Admin-only.
 */
router.post('/:id/upload-url', async (req, res) => {
  try {
    const { adminToken, filename, fileType } = req.body;

    // DEBUG LOG: See exactly what the frontend sent
    console.log(`[Upload] Requesting URL for ${filename} | Type: ${fileType}`);

    // STRICT VALIDATION: Force the frontend to provide the fileType
    if (!adminToken || !filename || !fileType) {
      return res.status(400).json({ error: 'adminToken, filename, and fileType are required' });
    }

    // Verify admin
    const isAdmin = await roomService.verifyAdmin(req.params.id, adminToken);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: invalid admin token' });
    }

    // Check if Storage is configured
    if (!filebaseService.isConfigured()) {
      return res.status(503).json({ error: 'File storage not configured. Set Filebase credentials in .env' });
    }

    const { uploadUrl, fileKey, downloadUrl } = await filebaseService.generateUploadUrl(
      req.params.id,
      filename,
      fileType
    );

    await roomService.resetTTL(req.params.id);

    res.json({ uploadUrl, fileKey, downloadUrl });
  } catch (err) {
    console.error('[Upload] URL generation error:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

/**
 * POST /api/rooms/:id/files
 * Register an uploaded file in the room's file list. Admin-only.
 */
router.post('/:id/files', async (req, res) => {
  try {
    const { adminToken, name, size, key, downloadUrl } = req.body;

    if (!adminToken || !name) {
      return res.status(400).json({ error: 'adminToken and file data are required' });
    }

    const isAdmin = await roomService.verifyAdmin(req.params.id, adminToken);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: invalid admin token' });
    }

    const files = await roomService.addFile(req.params.id, { name, size, key, downloadUrl });

    res.json({ files });
  } catch (err) {
    console.error('[Upload] File registration error:', err);
    res.status(500).json({ error: 'Failed to register file' });
  }
});

/**
 * DELETE /api/rooms/:id/files/:key
 * Delete a file from Filebase and the room's file list. Admin-only.
 */
router.delete('/:id/files/:key(*)', async (req, res) => {
  try {
    const { adminToken } = req.query;
    const { id, key } = req.params;

    if (!adminToken) {
      return res.status(400).json({ error: 'adminToken is required' });
    }

    const isAdmin = await roomService.verifyAdmin(id, adminToken);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: invalid admin token' });
    }

    // 1. Delete from Filebase
    try {
      await filebaseService.deleteFile(key);
    } catch (s3Err) {
      console.warn(`[Upload] File already missing from S3 or error: ${key}`, s3Err);
    }

    // 2. Remove from Redis
    const files = await roomService.removeFile(id, key);

    res.json({ success: true, files });
  } catch (err) {
    console.error('[Upload] File deletion error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});


export default router;