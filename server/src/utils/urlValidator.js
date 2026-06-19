/**
 * URL Validator — SSRF Protection
 * Validates URLs before server-side fetch to prevent Server-Side Request Forgery.
 */

// Private/internal IP ranges that should never be fetched
const BLOCKED_IP_PATTERNS = [
  /^127\./,                     // Loopback
  /^10\./,                      // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./,                // Class C private
  /^169\.254\./,                // Link-local / AWS metadata
  /^0\./,                       // Current network
  /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./, // Carrier-grade NAT
  /^::1$/,                      // IPv6 loopback
  /^fc00:/,                     // IPv6 private
  /^fe80:/,                     // IPv6 link-local
  /^fd/,                        // IPv6 ULA
];

// Known dangerous hostnames
const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
  '169.254.169.254',            // AWS/GCP metadata endpoint
  '[::1]',
  '0.0.0.0',
];

// Allowed domain suffixes for file fetching (Filebase S3)
const ALLOWED_DOMAIN_SUFFIXES = [
  '.filebase.com',
  '.s3.filebase.com',
];

/**
 * Validate a URL for safe server-side fetching.
 * @param {string} url - The URL to validate.
 * @param {object} options
 * @param {boolean} options.strictDomain - If true, only allow ALLOWED_DOMAIN_SUFFIXES.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateUrl(url, { strictDomain = false } = {}) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Only allow http/https protocols
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: `Blocked protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known dangerous hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: 'Blocked hostname: internal/metadata endpoint' };
  }

  // Block private IP ranges
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, error: 'Blocked: private/internal IP address' };
    }
  }

  // Optional: strict domain allowlisting
  if (strictDomain) {
    const isDomainAllowed = ALLOWED_DOMAIN_SUFFIXES.some(
      suffix => hostname === suffix.slice(1) || hostname.endsWith(suffix)
    );
    if (!isDomainAllowed) {
      return { valid: false, error: `Domain not allowed: ${hostname}` };
    }
  }

  return { valid: true };
}

/**
 * Safe fetch wrapper with SSRF protection and response size limit.
 * @param {string} url - URL to fetch
 * @param {object} options
 * @param {boolean} options.strictDomain - Only allow known domains
 * @param {number} options.maxSizeBytes - Maximum response size (default: 50MB)
 * @returns {Promise<Response>}
 */
export async function safeFetch(url, { strictDomain = false, maxSizeBytes = 50 * 1024 * 1024 } = {}) {
  const validation = validateUrl(url, { strictDomain });
  if (!validation.valid) {
    throw new Error(`SSRF blocked: ${validation.error}`);
  }

  const response = await fetch(url);

  // Check Content-Length if available
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > maxSizeBytes) {
    // Abort by not reading the body
    throw new Error(`Response too large: ${contentLength} bytes (max: ${maxSizeBytes})`);
  }

  return response;
}
