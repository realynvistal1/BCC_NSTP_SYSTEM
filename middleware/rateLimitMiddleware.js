const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;

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
  const raw = String(process.env.TRUST_PROXY_HOPS || '').trim();
  if (!raw) return 0;

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function readClientIp(req) {
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
  const safeWindowMs = readPositiveInt(windowMs, 10000);
  const safeMaxRequests = readPositiveInt(maxRequests, 200);
  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = keyPrefix + ':' + readClientIp(req);
    let current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      if (!current && buckets.size >= MAX_TRACKED_CLIENTS) {
        res.set('Retry-After', '60');
        return res.status(503).json({ message: 'Server is busy. Please try again shortly.' });
      }
      current = { count: 0, resetAt: now + safeWindowMs };
      buckets.set(key, current);
    }
    if (current.count >= safeMaxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / ONE_SECOND_MS));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ message, retry_after_seconds: retryAfterSeconds });
    }
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
  let totalActive = 0;

  return function concurrencyLimit(req, res, next) {
    const clientIp = readClientIp(req);
    const key = `${keyPrefix}:${clientIp}`;
    const current = Number(activeRequests.get(key) || 0);

    if (current >= safeMaxConcurrent) {
      res.set('Retry-After', '1');
      return res.status(429).json({
        message,
      });
    }

    if (totalActive >= safeMaxTotalConcurrent) {
      res.set('Retry-After', '1');
      return res.status(503).json({ message: 'Server is busy. Please try again shortly.' });
    }
    totalActive += 1;
    activeRequests.set(key, current + 1);

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

const generalApiRateLimit = createRateLimit({
  keyPrefix: 'api',
  windowMs: readPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 10000),
  maxRequests: readPositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 200),
  message: 'Too many requests. Please try again shortly.',
});

const authRateLimit = createRateLimit({
  keyPrefix: 'auth',
  windowMs: readPositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10000),
  maxRequests: readPositiveInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 50),
  message: 'Too many authentication requests. Please wait a moment and try again.',
});

const generalApiConcurrencyLimit = createConcurrencyLimit({
  keyPrefix: 'api-concurrency',
  maxTotalConcurrent: readPositiveInt(process.env.RATE_LIMIT_MAX_TOTAL_CONCURRENT, 30),
  maxConcurrent: readPositiveInt(process.env.RATE_LIMIT_MAX_CONCURRENT, 30),
  message: 'Too many simultaneous requests from this IP. Please slow down and try again.',
});

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
