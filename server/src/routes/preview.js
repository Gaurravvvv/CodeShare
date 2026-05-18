import express from 'express';
import { execFile } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

const router = express.Router();

/**
 * POST /api/preview/pptx
 * Accepts a presigned S3 URL, fetches the PPTX file,
 * converts it to PDF using LibreOffice headless, and returns the PDF buffer.
 */
router.post('/pptx', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url is required in request body' });
  }

  let tempDir = null;

  try {
    // 1. Create a temporary directory for this conversion
    tempDir = await mkdtemp(path.join(tmpdir(), 'pptx-preview-'));
    const inputPath = path.join(tempDir, 'input.pptx');

    // 2. Fetch the PPTX file from the presigned URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PPTX: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
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
            console.error('[Preview] STDERR:', stderr);
            reject(new Error(`LibreOffice conversion failed. Is ${command} in your PATH?`));
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
    res.status(500).json({ error: 'Failed to convert PPTX to PDF' });
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
