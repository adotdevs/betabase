/**
 * Middleware for public lead form API (e.g. takebackanalytics.com).
 * - Validates API key (X-API-Key header or Authorization: Bearer <key>)
 * - Rate limits by IP to prevent spam
 * - Optional: honeypot check (reject if _hp or _website is filled)
 */

const PUBLIC_LEAD_API_KEY = process.env.PUBLIC_LEAD_FORM_API_KEY || process.env.CRM_PUBLIC_LEAD_API_KEY;

// In-memory rate limit: IP -> { count, resetAt }
const rateLimitStore = new Map();
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX_REQUESTS = 10; // max 10 submissions per 15 min per IP

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.connection?.remoteAddress || 'unknown';
}

/**
 * Require valid API key for public lead submission.
 * Key can be sent as: X-API-Key: <key>  OR  Authorization: Bearer <key>
 */
function requirePublicLeadApiKey(req, res, next) {
  if (!PUBLIC_LEAD_API_KEY || PUBLIC_LEAD_API_KEY === 'your_crm_api_key_here') {
    return res.status(503).json({
      success: false,
      msg: 'Public lead form is not configured. Set PUBLIC_LEAD_FORM_API_KEY in server config.',
    });
  }
  const apiKey = req.headers['x-api-key'] || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!apiKey || apiKey !== PUBLIC_LEAD_API_KEY) {
    return res.status(401).json({
      success: false,
      msg: 'Invalid or missing API key',
    });
  }
  next();
}

/**
 * Rate limit by IP to prevent spam (no extra dependency).
 */
function rateLimitPublicLead(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  let entry = rateLimitStore.get(ip);
  if (!entry) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimitStore.set(ip, entry);
  }
  if (now >= entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW_MS;
  }
  entry.count += 1;
  if (entry.count > RATE_MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      msg: 'Too many submissions. Please try again later.',
    });
  }
  next();
}

/**
 * Honeypot: reject if bot-filled hidden field (e.g. _hp or _website).
 * Form should include a hidden input that humans leave empty.
 */
function honeypotPublicLead(req, res, next) {
  const hp = req.body._hp || req.body._website;
  if (hp && String(hp).trim() !== '') {
    return res.status(400).json({
      success: false,
      msg: 'Invalid submission',
    });
  }
  next();
}

module.exports = {
  requirePublicLeadApiKey,
  rateLimitPublicLead,
  honeypotPublicLead,
};
