import express from 'express';
import { execFile } from 'child_process';
import { writeFile, readFile, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import Groq from 'groq-sdk';
import { redis } from '../config/redis.js';
import { safeFetch } from '../utils/urlValidator.js';
import { summarizeLimiter } from '../middleware/security.js';

const router = express.Router();

const CACHE_TTL = 3600; // 1 hour in seconds
const MAX_WORDS = 1200; // Reduced to prevent Groq free-tier TPM limits
const MAX_INLINE_CODE_LENGTH = 100000; // 100KB max for inline code
const MAX_FETCH_SIZE = 50 * 1024 * 1024; // 50MB max file fetch

// ── Helpers ──────────────────────────────────────────────────────────

function truncateText(text, maxWords) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '…';
}

function getFileExtension(filename) {
  return (filename || '').split('.').pop().toLowerCase();
}

function isCodeFile(ext) {
  const codeExts = [
    'js', 'jsx', 'ts', 'tsx', 'py', 'cpp', 'c', 'java', 'go', 'rs',
    'rb', 'php', 'swift', 'kt', 'html', 'css', 'scss', 'json', 'yaml',
    'yml', 'xml', 'sql', 'sh', 'bat', 'ps1', 'r', 'lua', 'dart',
  ];
  return codeExts.includes(ext);
}

function isTextFile(ext) {
  return ['txt', 'md', 'markdown', 'log', 'csv'].includes(ext);
}

// ── Text Extraction ──────────────────────────────────────────────────

async function extractTextFromPdf(buffer) {
  // Use pdfjs-dist in Node.js to extract text
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join('\n');
}

async function extractTextFromDocx(buffer) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractTextFromXlsx(buffer) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    sheets.push(`[Sheet: ${name}]\n${csv}`);
  }
  return sheets.join('\n\n');
}

async function extractTextFromPptx(buffer) {
  // Convert PPTX to PDF via LibreOffice, then extract text from the PDF
  const tempDir = await mkdtemp(path.join(tmpdir(), 'pptx-summarize-'));
  const inputPath = path.join(tempDir, 'input.pptx');
  await writeFile(inputPath, buffer);

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
      [`-env:UserInstallation=${profileUrl}`, '--headless', '--convert-to', 'pdf', '--outdir', tempDir, inputPath],
      { timeout: 45000 },
      (error, stdout, stderr) => {
        if (error) reject(new Error('File conversion failed'));
        else resolve(stdout);
      }
    );
  });

  const pdfBuffer = await readFile(path.join(tempDir, 'input.pdf'));
  const text = await extractTextFromPdf(pdfBuffer);

  // Cleanup
  try {
    const { rm } = await import('fs/promises');
    await rm(tempDir, { recursive: true, force: true });
  } catch { /* ignore */ }

  return text;
}

// ── Main Route ───────────────────────────────────────────────────────

/**
 * POST /api/summarize
 * Accepts: { fileUrl: string, fileName: string }
 * Returns: { summary: string }
 */
router.post('/', summarizeLimiter, async (req, res) => {
  const { fileUrl, fileName, inlineCode } = req.body;

  if ((!fileUrl && !inlineCode) || !fileName) {
    return res.status(400).json({ error: 'fileName and either fileUrl or inlineCode are required' });
  }

  // Validate fileName
  if (typeof fileName !== 'string' || fileName.length > 255) {
    return res.status(400).json({ error: 'Invalid fileName' });
  }

  // Validate inlineCode size
  if (inlineCode && (typeof inlineCode !== 'string' || inlineCode.length > MAX_INLINE_CODE_LENGTH)) {
    return res.status(400).json({ error: `Inline code too large (max ${MAX_INLINE_CODE_LENGTH / 1000}KB)` });
  }

  // Check if GROQ_API_KEY is configured
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: 'AI summarization not configured. Set GROQ_API_KEY in server .env' });
  }

  const ext = getFileExtension(fileName);
  const cacheKey = inlineCode
    ? `summary:inline:${fileName}:${Buffer.from(inlineCode).length}`
    : `summary:${fileName}:${fileUrl.split('?')[0]}`;

  try {
    // 1. Check Redis cache (skip for inline code blocks)
    if (!inlineCode) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[Summarize] Cache hit for ${fileName}`);
        try {
          const parsed = JSON.parse(cached);
          return res.json(parsed);
        } catch (err) {
          return res.json({ summary: cached, warnings: [] });
        }
      }
    }

    // 2. Extract text
    let extractedText = '';

    if (inlineCode) {
      // Inline code from the editor — no fetch needed
      extractedText = inlineCode;
    } else {
      // Fetch the file from the presigned URL (SSRF protected)
      console.log(`[Summarize] Fetching ${fileName} for summarization...`);
      const response = await safeFetch(fileUrl, { maxSizeBytes: MAX_FETCH_SIZE });
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }

      // 3. Extract text based on file type
      if (isCodeFile(ext) || isTextFile(ext)) {
        extractedText = await response.text();
      } else if (ext === 'pdf') {
        const buffer = Buffer.from(await response.arrayBuffer());
        extractedText = await extractTextFromPdf(buffer);
      } else if (ext === 'docx') {
        const buffer = Buffer.from(await response.arrayBuffer());
        extractedText = await extractTextFromDocx(buffer);
      } else if (['xlsx', 'xls'].includes(ext)) {
        const buffer = Buffer.from(await response.arrayBuffer());
        extractedText = await extractTextFromXlsx(buffer);
      } else if (ext === 'pptx') {
        const buffer = Buffer.from(await response.arrayBuffer());
        extractedText = await extractTextFromPptx(buffer);
      } else {
        return res.status(400).json({ error: `File type .${ext} is not supported for summarization` });
      }
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract any text from this file' });
    }

    // 4. Truncate to stay within token limits
    const truncated = truncateText(extractedText.trim(), MAX_WORDS);

    // 5. Choose the right prompt based on file type
    const isCode = isCodeFile(ext);
    const prompt = isCode
      ? `Analyze the following ${ext.toUpperCase()} code and return a JSON object with exactly two fields:
1. "summary" - one short paragraph explaining what this code does
2. "warnings" - an array of strings, each describing a potential error, bug, or security issue found in the code. If no issues found, return an empty array.
Return only raw JSON. No markdown, no explanation, no extra text.`
      : 'Summarize what this document is about in one short paragraph. Do not ask questions or offer further help.';

    // 6. Call Groq API
    console.log(`[Summarize] Sending ${truncated.split(/\s+/).length} words to Groq...`);
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    
    const groqParams = {
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: truncated },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 1024,
    };

    const completion = await groq.chat.completions.create(groqParams);

    const groqResponse = completion.choices[0]?.message?.content?.trim();
    if (!groqResponse) {
      throw new Error('Groq returned an empty response');
    }

    let result;
    if (isCode) {
      try {
        result = JSON.parse(groqResponse);
        if (!result.warnings) result.warnings = [];
      } catch (err) {
        const jsonMatch = groqResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            result = JSON.parse(jsonMatch[0]);
            if (!result.warnings) result.warnings = [];
          } catch (e2) {
            result = { summary: 'Failed to parse AI response.', warnings: [] };
          }
        } else {
          result = { summary: groqResponse, warnings: [] };
        }
      }
    } else {
      result = { summary: groqResponse, warnings: [] };
    }

    // 7. Cache in Redis (skip for inline code blocks)
    if (!inlineCode) {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
      console.log(`[Summarize] Cached summary for ${fileName}`);
    }

    res.json(result);
  } catch (err) {
    console.error('[Summarize] Error:', err.message);
    // SECURITY FIX: Never send err.stack or full err.message to client
    const safeMessage = err.message.startsWith('SSRF blocked')
      ? 'Invalid file URL'
      : 'Failed to generate summary';
    res.status(err.message.startsWith('SSRF blocked') ? 400 : 500).json({ error: safeMessage });
  }
});

export default router;
