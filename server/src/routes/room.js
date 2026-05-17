import express from 'express';
import * as roomService from '../services/roomService.js';
import * as filebaseService from '../services/filebaseService.js';

const router = express.Router();

/**
 * POST /api/rooms/cron/cleanup
 * Cron job endpoint to clean up orphaned S3 files.
 * Protected by CRON_SECRET environment variable.
 */
router.post('/cron/cleanup', async (req, res) => {
  try {
    const { secret } = req.body;
    
    // Check if secret is configured and matches
    if (!process.env.CRON_SECRET) {
      return res.status(500).json({ error: 'CRON_SECRET is not configured on the server' });
    }
    
    if (secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET' });
    }

    const result = await filebaseService.cleanupOrphanedFiles(roomService.roomExists);
    res.json(result);
  } catch (err) {
    console.error('[Room] Cron cleanup error:', err);
    res.status(500).json({ error: 'Failed to execute cron cleanup' });
  }
});

/**
 * POST /api/rooms
 * Create a new room. Returns { roomId, adminToken }
 */
router.post('/', async (req, res) => {
  try {
    const { roomId, adminToken } = await roomService.createRoom();
    res.status(201).json({ roomId, adminToken });
  } catch (err) {
    console.error('[Room] Creation error:', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

/**
 * GET /api/rooms/:id
 * Get room data. Resets TTL on access.
 */
router.get('/:id', async (req, res) => {
  try {
    const room = await roomService.getRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }
    await roomService.resetTTL(req.params.id);
    res.json(room);
  } catch (err) {
    console.error('[Room] Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

/**
 * POST /api/rooms/:id/verify-admin
 * Verify admin token for a room.
 */
router.post('/:id/verify-admin', async (req, res) => {
  try {
    const { adminToken } = req.body;
    if (!adminToken) {
      return res.status(400).json({ error: 'adminToken is required' });
    }

    const room = await roomService.getRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }

    const isAdmin = await roomService.verifyAdmin(req.params.id, adminToken);
    res.json({ isAdmin });
  } catch (err) {
    console.error('[Room] Admin verify error:', err);
    res.status(500).json({ error: 'Failed to verify admin' });
  }
});

export default router;
