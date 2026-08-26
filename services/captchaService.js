const DEFAULT_SCORE_THRESHOLD = 0.5;

function readEnabledFlag(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function isEnabled() {
  return readEnabledFlag(process.env.GOOGLE_RECAPTCHA_ENABLED)
    && String(process.env.GOOGLE_RECAPTCHA_SITE_KEY || '').trim().length > 0
    && String(process.env.GOOGLE_RECAPTCHA_SECRET_KEY || '').trim().length > 0;
}

function siteKey() {
  return String(process.env.GOOGLE_RECAPTCHA_SITE_KEY || '').trim();
}

function expectedHostname() {
  return String(process.env.GOOGLE_RECAPTCHA_EXPECTED_HOSTNAME || '').trim().toLowerCase();
}

function minScore() {
  const parsed = Number(process.env.GOOGLE_RECAPTCHA_MIN_SCORE);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_SCORE_THRESHOLD;
}

function publicConfig() {
  return {
    enabled: isEnabled(),
    provider: 'google-recaptcha-v3',
    siteKey: siteKey(),
    localhostBypass: readEnabledFlag(process.env.GOOGLE_RECAPTCHA_ALLOW_LOCALHOST_BYPASS),
  };
}

function isLocalHost(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['localhost', '127.0.0.1', '::1'].includes(normalized);
}

async function verifyToken(token, action, context = {}) {
  if (!isEnabled()) {
    return { ok: true, skipped: true };
  }

  const allowLocalhostBypass = readEnabledFlag(process.env.GOOGLE_RECAPTCHA_ALLOW_LOCALHOST_BYPASS);
  const requestHost = String(context.hostname || '').trim().toLowerCase();

  if (allowLocalhostBypass && (!requestHost || isLocalHost(requestHost))) {
    return {
      ok: true,
      skipped: true,
      localhostBypass: true,
    };
  }

  const normalizedToken = String(token || '').trim();

  if (!normalizedToken) {
    return {
      ok: false,
      reason: 'missing-token',
      message: 'Complete the security check and try again.',
    };
  }

  const body = new URLSearchParams({
    secret: String(process.env.GOOGLE_RECAPTCHA_SECRET_KEY || '').trim(),
    response: normalizedToken,
  });

  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json();

  if (!response.ok || !payload.success) {
    return {
      ok: false,
      reason: 'verification-failed',
      message: 'Security verification failed. Please try again.',
      payload,
    };
  }

  if (payload.action && payload.action !== action) {
    return {
      ok: false,
      reason: 'action-mismatch',
      message: 'Security verification failed. Please refresh and try again.',
      payload,
    };
  }

  const score = Number(payload.score);
  if (Number.isFinite(score) && score < minScore()) {
    return {
      ok: false,
      reason: 'low-score',
      message: 'Security verification failed. Please try again later.',
      payload,
    };
  }

  const requiredHostname = expectedHostname();
  if (requiredHostname && String(payload.hostname || '').trim().toLowerCase() !== requiredHostname) {
    return {
      ok: false,
      reason: 'hostname-mismatch',
      message: 'Security verification failed. Please refresh and try again.',
      payload,
    };
  }

  return {
    ok: true,
    payload,
  };
}

module.exports = {
  publicConfig,
  verifyToken,
};
