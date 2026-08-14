import express from 'express';
import axios from 'axios';
import { summarizeLimiter } from '../middleware/security.js';

const router = express.Router();

// Route to the FastAPI microservice
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

/**
 * POST /api/summarize
 * Proxies the request to the FastAPI microservice for processing.
 */
router.post('/', summarizeLimiter, async (req, res) => {
  try {
    const { fileUrl, fileName, inlineCode } = req.body;
    
    // Forward the request to FastAPI
    const response = await axios.post(`${FASTAPI_URL}/api/summarize`, {
      fileUrl,
      fileName,
      inlineCode
    }, {
      timeout: 60000 // 60s timeout for heavy AI processing
    });
    
    // Return FastAPI's response back to the client
    res.json(response.data);
  } catch (err) {
    if (err.response) {
      // Forward FastAPI error if available
      return res.status(err.response.status).json(err.response.data);
    }
    console.error('[Summarize Proxy] Error connecting to FastAPI:', err.message);
    res.status(500).json({ error: 'Failed to generate summary (Microservice Unavailable)' });
  }
});

export default router;
