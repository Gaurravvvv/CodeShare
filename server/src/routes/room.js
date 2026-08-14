import express from 'express';
import axios from 'axios';
import * as roomService from '../services/roomService.js';
import * as filebaseService from '../services/filebaseService.js';
import { roomCreationLimiter, cronLimiter } from '../middleware/security.js';

const router = express.Router();
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

/**
 * POST /api/rooms/cron/cleanup
 * Cron job endpoint to clean up orphaned S3 files.
 * Proxies the request to the FastAPI microservice.
 */
router.post('/cron/cleanup', cronLimiter, async (req, res) => {
  try {
    const { secret } = req.body;
    
    const response = await axios.post(`${FASTAPI_URL}/api/rooms/cron/cleanup`, {
      secret
    }, { timeout: 120000 }); // 2 min timeout for heavy S3 cleanup
    
    res.json(response.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    console.error('[Room Proxy] Cron cleanup proxy error:', err.message);
    res.status(500).json({ error: 'Failed to execute cron cleanup (Microservice Unavailable)' });
  }
});

/**
 * POST /api/rooms
 * Create a new room. Returns { roomId, adminToken }
 */
router.post('/', roomCreationLimiter, async (req, res) => {
  try {
    const { roomId, adminToken } = await roomService.createRoom();
    res.status(201).json({ roomId, adminToken });
  } catch (err) {
    console.error('[Room] Creation error:', err.message);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

/**
 * GET /api/rooms/:id
 * Get room data. Resets TTL on access.
 */
router.get('/:id', async (req, res) => {
  try {
    const roomId = req.params.id;
    
    // Validate room ID format (alphanumeric, 4-10 chars)
    if (!/^[A-Z0-9]{4,10}$/i.test(roomId)) {
      return res.status(400).json({ error: 'Invalid room ID format' });
    }
    
    const room = await roomService.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }
    await roomService.resetTTL(roomId);
    res.json(room);
  } catch (err) {
    console.error('[Room] Fetch error:', err.message);
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
    if (!adminToken || typeof adminToken !== 'string') {
      return res.status(400).json({ error: 'adminToken is required' });
    }

    const room = await roomService.getRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }

    const isAdmin = await roomService.verifyAdmin(req.params.id, adminToken);
    res.json({ isAdmin });
  } catch (err) {
    console.error('[Room] Admin verify error:', err.message);
    res.status(500).json({ error: 'Failed to verify admin' });
  }
});

export default router;
