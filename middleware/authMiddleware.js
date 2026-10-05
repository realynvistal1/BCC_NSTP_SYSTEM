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

async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Please log in again.' });
    }

    req.user = jwt.verify(token, process.env.JWT_SECRET, jwtVerifyOptions());
    if(req.user.role==='instructor'){
      if(req.user.portal!=='cwts-admin'||req.user.program!=='CWTS')return res.status(403).json({message:'Access denied.'});
      const [[account]]=await require('../config/database').execute("SELECT email,first_name,last_name,session_version FROM cwts_instructors WHERE id=? AND status='active'",[req.user.id]);
      if(!account||Number(account.session_version)!==req.user.session_version)return res.status(401).json({message:'Your instructor access has changed. Please sign in again.'});
      req.user.email=account.email;
      req.user.name=[account.first_name,account.last_name].join(' ');
    }
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
