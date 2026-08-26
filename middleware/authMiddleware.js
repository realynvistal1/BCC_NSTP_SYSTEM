const jwt = require('jsonwebtoken');

function jwtVerifyOptions() {
  return {
    audience: 'bcc-nstp-app',
    issuer: 'bcc-nstp-system',
  };
}

function readToken(req) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;

  return req.cookies?.nstp_token || bearer;
}

function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Please log in again.' });
    }

    req.user = jwt.verify(token, process.env.JWT_SECRET, jwtVerifyOptions());
    next();
  } catch {
    return res.status(401).json({ message: 'Please log in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => (
    roles.includes(req.user?.role)
      ? next()
      : res.status(403).json({ message: 'Access denied.' })
  );
}

function requirePortal(...portals) {
  return (req, res, next) => (
    portals.includes(req.user?.portal)
      ? next()
      : res.status(403).json({ message: 'Access denied.' })
  );
}

module.exports = {
  requireAuth,
  requireRole,
  requirePortal,
};
