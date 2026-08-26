const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;

const buckets = new Map();
const penalties = new Map();
const activeRequests = new Map();

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

function cleanupExpiredPenalties(now) {
  for (const [key, entry] of penalties.entries()) {
    if (entry.blockedUntil <= now && entry.violationResetAt <= now) {
      penalties.delete(key);
    }
  }
}

function violationPenaltyMs(violations, baseBlockMs, maxBlockMs) {
  const exponent = Math.max(0, violations - 1);
  return Math.min(maxBlockMs, baseBlockMs * (2 ** exponent));
}

function createRateLimit({
  keyPrefix,
  windowMs,
  maxRequests,
  message,
  blockMessage = 'Too many abusive requests. Please try again later.',
  baseBlockMs = 5 * ONE_MINUTE_MS,
  maxBlockMs = 60 * ONE_MINUTE_MS,
}) {
  const safeWindowMs = readPositiveInt(windowMs, ONE_MINUTE_MS);
  const safeMaxRequests = readPositiveInt(maxRequests, 60);
  const safeBaseBlockMs = readPositiveInt(baseBlockMs, 5 * ONE_MINUTE_MS);
  const safeMaxBlockMs = readPositiveInt(maxBlockMs, 60 * ONE_MINUTE_MS);

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const clientIp = readClientIp(req);
    const key = `${keyPrefix}:${clientIp}`;
    const penalty = penalties.get(key);
    if (penalty && penalty.blockedUntil > now) {
      const retryAfterSeconds = Math.max(1, Math.ceil((penalty.blockedUntil - now) / ONE_SECOND_MS));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        message: blockMessage,
        retry_after_seconds: retryAfterSeconds,
      });
    }

    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + safeWindowMs,
      });
      cleanupExpiredBuckets(now);
      cleanupExpiredPenalties(now);
      return next();
    }

    current.count += 1;

    if (current.count > safeMaxRequests) {
      const existingPenalty = penalties.get(key);
      const violations = existingPenalty && existingPenalty.violationResetAt > now
        ? existingPenalty.violations + 1
        : 1;
      const blockedUntil = now + violationPenaltyMs(violations, safeBaseBlockMs, safeMaxBlockMs);
      penalties.set(key, {
        violations,
        blockedUntil,
        violationResetAt: now + safeMaxBlockMs,
      });

      const retryAfterSeconds = Math.max(1, Math.ceil((blockedUntil - now) / ONE_SECOND_MS));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        message,
        retry_after_seconds: retryAfterSeconds,
      });
    }

    return next();
  };
}

function createConcurrencyLimit({
  keyPrefix,
  maxConcurrent,
  message,
}) {
  const safeMaxConcurrent = readPositiveInt(maxConcurrent, 20);

  return function concurrencyLimit(req, res, next) {
    const clientIp = readClientIp(req);
    const key = `${keyPrefix}:${clientIp}`;
    const current = Number(activeRequests.get(key) || 0);

    if (current >= safeMaxConcurrent) {
      return res.status(429).json({
        message,
      });
    }

    activeRequests.set(key, current + 1);

    let released = false;
    function release() {
      if (released) return;
      released = true;

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
  windowMs: readPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, ONE_MINUTE_MS),
  maxRequests: readPositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 120),
  message: 'Too many requests. Please try again shortly.',
  blockMessage: 'This IP has been temporarily blocked for abusive API traffic.',
  baseBlockMs: readPositiveInt(process.env.RATE_LIMIT_BLOCK_MS, 5 * ONE_MINUTE_MS),
  maxBlockMs: readPositiveInt(process.env.RATE_LIMIT_MAX_BLOCK_MS, 60 * ONE_MINUTE_MS),
});

const authRateLimit = createRateLimit({
  keyPrefix: 'auth',
  windowMs: readPositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, ONE_MINUTE_MS),
  maxRequests: readPositiveInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 20),
  message: 'Too many authentication requests. Please wait a moment and try again.',
  blockMessage: 'This IP has been temporarily blocked for abusive authentication traffic.',
  baseBlockMs: readPositiveInt(process.env.AUTH_RATE_LIMIT_BLOCK_MS, 10 * ONE_MINUTE_MS),
  maxBlockMs: readPositiveInt(process.env.AUTH_RATE_LIMIT_MAX_BLOCK_MS, 120 * ONE_MINUTE_MS),
});

const generalApiConcurrencyLimit = createConcurrencyLimit({
  keyPrefix: 'api-concurrency',
  maxConcurrent: readPositiveInt(process.env.RATE_LIMIT_MAX_CONCURRENT, 30),
  message: 'Too many simultaneous requests from this IP. Please slow down and try again.',
});

const authConcurrencyLimit = createConcurrencyLimit({
  keyPrefix: 'auth-concurrency',
  maxConcurrent: readPositiveInt(process.env.AUTH_RATE_LIMIT_MAX_CONCURRENT, 5),
  message: 'Too many simultaneous authentication requests from this IP. Please try again shortly.',
});

module.exports = {
  trustProxyHop,
  generalApiRateLimit,
  authRateLimit,
  generalApiConcurrencyLimit,
  authConcurrencyLimit,
};
