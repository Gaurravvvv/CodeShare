import express from 'express';
import axios from 'axios';

const router = express.Router();

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

/**
 * POST /api/preview/pptx
 * Proxies the presigned S3 URL to FastAPI for LibreOffice conversion
 * and pipes the returned PDF buffer to the client.
 */
router.post('/pptx', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required in request body' });
    }

    // Forward to FastAPI requesting a stream back
    const response = await axios.post(`${FASTAPI_URL}/api/preview/pptx`, { url }, {
      responseType: 'stream',
      timeout: 60000
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="preview.pdf"',
    });

    // Pipe the PDF stream directly back to the client
    response.data.pipe(res);
  } catch (err) {
    if (err.response) {
      // Consume the error stream to get the JSON error message
      let errorData = '';
      err.response.data.on('data', chunk => errorData += chunk);
      err.response.data.on('end', () => {
        try {
          const parsed = JSON.parse(errorData);
          res.status(err.response.status).json(parsed);
        } catch {
          res.status(err.response.status).json({ error: 'Failed to convert PPTX to PDF' });
        }
      });
    } else {
      console.error('[Preview Proxy] Error connecting to FastAPI:', err.message);
      res.status(500).json({ error: 'Preview Microservice Unavailable' });
    }
  }
});

export default router;
