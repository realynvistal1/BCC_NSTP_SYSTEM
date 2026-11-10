const jwt = require('jsonwebtoken');

// Accept tokens intended for this application and issued by this system.
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

// Protect API routes: verify the token's signature and claims before allowing access.
// Missing, expired, or invalid tokens receive HTTP 401 (login required).
async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Please log in again.' });
    }

    req.user = jwt.verify(token, process.env.JWT_SECRET, jwtVerifyOptions());
    // Recheck instructor access in the database so revoked or changed sessions stop working.
    if(req.user.role==='instructor'){
      if(!['ROTC','CWTS'].includes(req.user.program)||!['instructor','cwts-admin'].includes(req.user.portal)||(req.user.portal==='cwts-admin'&&req.user.program!=='CWTS'))return res.status(403).json({message:'Access denied.'});
      const table=require('../services/instructorPortalService').table(req.user.program);
      const [[account]]=await require('../config/database').execute(`SELECT email,first_name,middle_name,last_name,session_version FROM ${table} WHERE id=? AND status='active' AND review_status='approved'`,[req.user.id]);
      if(!account||Number(account.session_version)!==req.user.session_version)return res.status(401).json({message:'Your instructor access has changed. Please sign in again.'});
      req.user.email=account.email;
      req.user.name=[account.first_name,account.last_name].join(' ');
    }
    next();
  } catch {
    return res.status(401).json({ message: 'Please log in again.' });
  }
}

// Allow only the listed account roles; HTTP 403 means access is denied.
function requireRole(...roles) {
  return (req, res, next) => (
    roles.includes(req.user?.role)
      ? next()
      : res.status(403).json({ message: 'Access denied.' })
  );
}

// Allow only sessions belonging to one of the listed login portals.
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
