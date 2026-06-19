import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// ─── Helmet: HTTP Security Headers ─────────────────────────────────────────────
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.filebase.com"],
      connectSrc: ["'self'", "ws:", "wss:", "https://*.filebase.com", "https://api.groq.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for loading cross-origin media
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow CORS resources
});

// ─── Rate Limiters ──────────────────────────────────────────────────────────────

/** General API rate limit: 100 requests per 15 minutes per IP */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

/** Room creation: 10 rooms per 15 minutes per IP */
export const roomCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many rooms created. Please try again later.' },
});

/** Upload URL generation: 30 per 15 minutes per IP */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many upload requests. Please try again later.' },
});

/** AI Summarization: 10 per 15 minutes per IP */
export const summarizeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Summarization rate limit exceeded. Please try again later.' },
});

/** Cron cleanup: 5 per 15 minutes per IP */
export const cronLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many cron requests.' },
});

// ─── Input Sanitization Helpers ─────────────────────────────────────────────────

/**
 * Strip HTML tags and dangerous characters from a string.
 */
export function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')       // Strip HTML tags
    .replace(/[<>"'`]/g, '')       // Strip dangerous chars
    .slice(0, maxLength)
    .trim();
}

/**
 * Validate and sanitize a username.
 * Allows: letters, numbers, underscore, hyphen, period, space.
 */
export function sanitizeUsername(name) {
  if (typeof name !== 'string') return '';
  const cleaned = name.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim();
  return cleaned.slice(0, 20);
}

/**
 * Sanitize object to only allow specific known keys (prevents prototype pollution).
 */
export function pickSafeKeys(obj, allowedKeys) {
  if (!obj || typeof obj !== 'object') return {};
  const safe = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      safe[key] = obj[key];
    }
  }
  return safe;
}
