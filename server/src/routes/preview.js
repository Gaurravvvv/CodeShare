import express from 'express';
import { execFile } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { safeFetch } from '../utils/urlValidator.js';

const router = express.Router();

// Maximum file size for PPTX conversion (50MB)
const MAX_PPTX_SIZE = 50 * 1024 * 1024;

/**
 * POST /api/preview/pptx
 * Accepts a presigned S3 URL, fetches the PPTX file,
 * converts it to PDF using LibreOffice headless, and returns the PDF buffer.
 */
router.post('/pptx', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required in request body' });
  }

  let tempDir = null;

  try {
    // 1. Create a temporary directory for this conversion
    tempDir = await mkdtemp(path.join(tmpdir(), 'pptx-preview-'));
    const inputPath = path.join(tempDir, 'input.pptx');

    // 2. Fetch the PPTX file from the presigned URL (SSRF protected)
    const response = await safeFetch(url, { maxSizeBytes: MAX_PPTX_SIZE });
    if (!response.ok) {
      throw new Error(`Failed to fetch PPTX: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Verify actual size
    if (buffer.length > MAX_PPTX_SIZE) {
      throw new Error('File too large for conversion');
    }
    
    await writeFile(inputPath, buffer);

    // 3. Convert PPTX → PDF using LibreOffice headless
    let command = 'libreoffice';
    if (process.platform === 'win32') {
      const { existsSync } = await import('fs');
      const defaultPath = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
      command = existsSync(defaultPath) ? defaultPath : 'soffice';
    }

    const profileUrl = `file:///${tempDir.replace(/\\/g, '/')}/profile`;
    
    await new Promise((resolve, reject) => {
      execFile(
        command,
        [
          `-env:UserInstallation=${profileUrl}`,
          '--headless',
          '--convert-to', 'pdf',
          '--outdir', tempDir,
          inputPath,
        ],
        { timeout: 45000 }, // 45 second timeout
        (error, stdout, stderr) => {
          if (error) {
            console.error('[Preview] LibreOffice error:', error.message);
            reject(new Error('File conversion failed'));
          } else {
            resolve(stdout);
          }
        }
      );
    });

    // 4. Read the generated PDF
    const pdfPath = path.join(tempDir, 'input.pdf');
    const pdfBuffer = await readFile(pdfPath);

    // 5. Send the PDF back
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length,
      'Content-Disposition': 'inline; filename="preview.pdf"',
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[Preview] PPTX conversion error:', err.message);
    // Don't leak internal error details
    const safeMessage = err.message.startsWith('SSRF blocked')
      ? 'Invalid file URL'
      : 'Failed to convert PPTX to PDF';
    res.status(err.message.startsWith('SSRF blocked') ? 400 : 500).json({ error: safeMessage });
  } finally {
    // 6. Cleanup temp files
    if (tempDir) {
      try {
        const { rm } = await import('fs/promises');
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
});

export default router;
