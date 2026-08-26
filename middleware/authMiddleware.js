const jwt = require('jsonwebtoken');

function readToken(req) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;

  return req.cookies?.nstp_token || bearer;
}

function requireAuth(req, res, next) {
  try {
    req.user = jwt.verify(readToken(req), process.env.JWT_SECRET);
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
