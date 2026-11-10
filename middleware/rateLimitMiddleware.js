// These limits help protect the server from too many requests, including repeated login attempts.
// Rate limits count requests over time; concurrency limits count requests still being processed.
const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;

// Keep counters in this Node.js process's memory. Restarting it clears the counters.
// Separate server processes each have their own counters.
const buckets = new Map();
const activeRequests = new Map();
const MAX_TRACKED_CLIENTS = 10000;

// Periodic cleanup avoids scanning every client for each new IP.
const cleanupTimer = setInterval(() => {
  cleanupExpiredBuckets(Date.now());
}, ONE_MINUTE_MS);
cleanupTimer.unref();

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function trustProxyHop() {
  // Configure how many proxy servers Express should trust when identifying the client's IP.
  const raw = String(process.env.TRUST_PROXY_HOPS || '').trim();
  if (!raw) return 0;

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function readClientIp(req) {
  // Requests from the same IP share a limit, including users on the same network.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function cleanupExpiredBuckets(now) {
  for (const [key, entry] of buckets.entries()) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function createRateLimit({ keyPrefix, windowMs, maxRequests, message }) {
  // Allow up to maxRequests per IP during windowMs, starting with the first request.
  const safeWindowMs = readPositiveInt(windowMs, 10000);
  const safeMaxRequests = readPositiveInt(maxRequests, 200);
  return function rateLimit(req, res, next) {
    const now = Date.now();
    // The prefix gives API and authentication requests separate counters.
    const key = keyPrefix + ':' + readClientIp(req);
    let current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      // Stop adding new counters when storage is full to keep memory use bounded.
      if (!current && buckets.size >= MAX_TRACKED_CLIENTS) {
        res.set('Retry-After', '60');
        return res.status(503).json({ message: 'Server is busy. Please try again shortly.' });
      }
      current = { count: 0, resetAt: now + safeWindowMs };
      buckets.set(key, current);
    }
    // HTTP 429 means too many requests. Retry-After tells the client how long to wait.
    if (current.count >= safeMaxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / ONE_SECOND_MS));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ message, retry_after_seconds: retryAfterSeconds });
    }
    // Count the allowed request and pass it to the next middleware or route handler.
    current.count += 1;
    return next();
  };
}

function createConcurrencyLimit({
  keyPrefix,
  maxConcurrent,
  maxTotalConcurrent = 100,
  message,
}) {
  const safeMaxConcurrent = readPositiveInt(maxConcurrent, 20);
  const safeMaxTotalConcurrent = readPositiveInt(maxTotalConcurrent, 100);
  // Count all unfinished requests passing through this particular limiter.
  let totalActive = 0;

  return function concurrencyLimit(req, res, next) {
    const clientIp = readClientIp(req);
    const key = `${keyPrefix}:${clientIp}`;
    const current = Number(activeRequests.get(key) || 0);

    // Ask this IP to wait if it already has too many unfinished requests.
    if (current >= safeMaxConcurrent) {
      res.set('Retry-After', '1');
      return res.status(429).json({
        message,
      });
    }

    // HTTP 503 means this limiter is at capacity across all IPs.
    if (totalActive >= safeMaxTotalConcurrent) {
      res.set('Retry-After', '1');
      return res.status(503).json({ message: 'Server is busy. Please try again shortly.' });
    }
    totalActive += 1;
    activeRequests.set(key, current + 1);

    // Free the request's slot when it finishes or disconnects. Count it only once,
    // even if both events happen for the same response.
    let released = false;
    function release() {
      if (released) return;
      released = true;
      totalActive -= 1;

      const latest = Number(activeRequests.get(key) || 0);
      if (latest <= 1) {
        activeRequests.delete(key);
      } else {
        activeRequests.set(key, latest - 1);
      }
    }

    res.on('finish', release);
    res.on('close', release);
    next();
  };
}

// Defaults: 200 API requests per IP in 10 seconds. Environment settings can override these.
const generalApiRateLimit = createRateLimit({
  keyPrefix: 'api',
  windowMs: readPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 10000),
  maxRequests: readPositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 200),
  message: 'Too many requests. Please try again shortly.',
});

// Defaults: 50 authentication requests per IP in 10 seconds.
const authRateLimit = createRateLimit({
  keyPrefix: 'auth',
  windowMs: readPositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10000),
  maxRequests: readPositiveInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 50),
  message: 'Too many authentication requests. Please wait a moment and try again.',
});

// Defaults: up to 30 unfinished requests per IP and 30 total through this API limiter.
const generalApiConcurrencyLimit = createConcurrencyLimit({
  keyPrefix: 'api-concurrency',
  maxTotalConcurrent: readPositiveInt(process.env.RATE_LIMIT_MAX_TOTAL_CONCURRENT, 30),
  maxConcurrent: readPositiveInt(process.env.RATE_LIMIT_MAX_CONCURRENT, 30),
  message: 'Too many simultaneous requests from this IP. Please slow down and try again.',
});

// Defaults: up to 20 unfinished requests per IP and 20 total through this authentication limiter.
const authConcurrencyLimit = createConcurrencyLimit({
  keyPrefix: 'auth-concurrency',
  maxTotalConcurrent: readPositiveInt(process.env.AUTH_RATE_LIMIT_MAX_TOTAL_CONCURRENT, 20),
  maxConcurrent: readPositiveInt(process.env.AUTH_RATE_LIMIT_MAX_CONCURRENT, 20),
  message: 'Too many simultaneous authentication requests from this IP. Please try again shortly.',
});

module.exports = {
  createRateLimit,
  createConcurrencyLimit,
  trustProxyHop,
  generalApiRateLimit,
  authRateLimit,
  generalApiConcurrencyLimit,
  authConcurrencyLimit,
};
