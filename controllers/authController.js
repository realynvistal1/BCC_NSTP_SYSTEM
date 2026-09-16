const jwt = require('jsonwebtoken');
const db = require('../config/database');
const authService = require('../services/authService');
const emailService = require('../services/emailService');
const captchaService = require('../services/captchaService');
const {
  MAX_LOGIN_IDENTIFIER_LENGTH,
  isReasonableEmail,
  isValidStudentId,
  isValidResetCode,
} = require('../services/requestValidationService');

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_LOCK_MINUTES = 5;
const RESET_REQUEST_LIMIT = 3;
const RESET_REQUEST_LOCK_MINUTES = 15;
const RESET_VERIFY_LIMIT = 5;
const RESET_VERIFY_LOCK_MINUTES = 15;

function jwtOptions() {
  return {
    audience: 'bcc-nstp-app',
    issuer: 'bcc-nstp-system',
  };
}

function serverError(res, error) {
  console.error(error);
  return res.status(500).json({ message: 'Unexpected server error.' });
}

async function ensureCaptcha(req, res, token, action) {
  const verification = await captchaService.verifyToken(token, action, {
    hostname: req.hostname,
  });
  if (!verification.ok) {
    res.status(400).json({ message: verification.message });
    return false;
  }

  return true;
}

function adminPortal(program, storedRole) {
  if (storedRole === 'director' || storedRole === 'officer') return 'officer';
  if (storedRole === 'admin' && program === 'CWTS') return 'cwts-admin';
  if (storedRole === 'admin' && program === 'ROTC') return 'rotc-admin';
  return null;
}

function runtimeRoleForAdmin(storedRole) {
  return storedRole === 'director' ? 'officer' : storedRole;
}

function clearAuthCookies(res) {
  res.clearCookie('nstp_token', { path: '/' });
  res.clearCookie('nstp_token', { path: '/api/auth' });
}

function redirectForPortal(portal) {
  if (portal === 'student') return '/student/dashboard';
  if (portal === 'officer') return '/officer/dashboard';
  if (portal === 'cwts-admin') return '/admin/cwts/dashboard';
  return '/admin/rotc/dashboard';
}

function portalLabel(portal) {
  if (portal === 'officer') return 'NSTP Director Portal';
  if (portal === 'cwts-admin') return 'CWTS Admin Portal';
  if (portal === 'rotc-admin') return 'ROTC Admin Portal';
  return 'Student Portal';
}

function shouldUseSecureCookies(req) {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;

  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function adminResetLookup(portal) {
  if (portal === 'officer') {
    return {
      selectByEmail: `SELECT id,email FROM admins
        WHERE email=? AND role IN ('director','officer')
        LIMIT 1`,
      selectAccount: `SELECT id,email,password FROM admins
        WHERE email=? AND role IN ('director','officer')
        LIMIT 1`,
    };
  }

  if (portal === 'cwts-admin') {
    return {
      selectByEmail: `SELECT id,email FROM admins
        WHERE email=? AND role='admin' AND program IN ('CWTS','BOTH')
        LIMIT 1`,
      selectAccount: `SELECT id,email,password FROM admins
        WHERE email=? AND role='admin' AND program IN ('CWTS','BOTH')
        LIMIT 1`,
    };
  }

  return {
    selectByEmail: `SELECT id,email FROM admins
      WHERE email=? AND role='admin' AND program IN ('ROTC','BOTH')
      LIMIT 1`,
    selectAccount: `SELECT id,email,password FROM admins
      WHERE email=? AND role='admin' AND program IN ('ROTC','BOTH')
      LIMIT 1`,
  };
}

async function ensureAdminResetTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_password_reset_codes (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      admin_id INT UNSIGNED NOT NULL,
      email VARCHAR(255) NOT NULL,
      portal VARCHAR(30) NOT NULL,
      verification_code VARCHAR(20) NOT NULL,
      expires_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_admin_reset (admin_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureStudentResetTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT UNSIGNED NOT NULL,
      email VARCHAR(255) NOT NULL,
      verification_code VARCHAR(20) NOT NULL,
      expires_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_student_reset (student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureLoginAttemptTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS login_attempt_locks (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      login_key VARCHAR(255) NOT NULL,
      failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
      locked_until DATETIME DEFAULT NULL,
      last_attempt_at DATETIME DEFAULT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_login_key (login_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureSecurityEventTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS security_event_locks (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      event_key VARCHAR(255) NOT NULL,
      failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
      locked_until DATETIME DEFAULT NULL,
      last_attempt_at DATETIME DEFAULT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_event_key (event_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function getLoginAttempt(loginKey) {
  await ensureLoginAttemptTable();
  const [rows] = await db.execute(
    `SELECT id, login_key, failed_attempts, locked_until, last_attempt_at
     FROM login_attempt_locks
     WHERE login_key=?
     LIMIT 1`,
    [loginKey]
  );
  return rows[0] || null;
}

function lockoutMessage(lockedUntil) {
  const unlockTime = new Date(lockedUntil);
  const diffMs = unlockTime.getTime() - Date.now();
  const remainingMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  return `Too many failed login attempts. Try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`;
}

async function recordFailedLogin(loginKey) {
  await ensureLoginAttemptTable();
  const attempt = await getLoginAttempt(loginKey);
  const now = new Date();

  if (!attempt) {
    const failedAttempts = 1;
    const lockedUntil = failedAttempts >= LOGIN_ATTEMPT_LIMIT
      ? new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60000)
      : null;

    await db.execute(
      `INSERT INTO login_attempt_locks(login_key, failed_attempts, locked_until, last_attempt_at)
       VALUES(?,?,?,?)`,
      [loginKey, failedAttempts, lockedUntil, now]
    );

    return {
      failed_attempts: failedAttempts,
      locked_until: lockedUntil,
    };
  }

  const currentlyLocked = attempt.locked_until && new Date(attempt.locked_until) > now;
  const failedAttempts = currentlyLocked ? attempt.failed_attempts : Number(attempt.failed_attempts || 0) + 1;
  const lockedUntil = failedAttempts >= LOGIN_ATTEMPT_LIMIT
    ? new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60000)
    : null;

  await db.execute(
    `UPDATE login_attempt_locks
     SET failed_attempts=?, locked_until=?, last_attempt_at=?
     WHERE login_key=?`,
    [failedAttempts, lockedUntil, now, loginKey]
  );

  return {
    failed_attempts: failedAttempts,
    locked_until: lockedUntil,
  };
}

async function clearFailedLogins(loginKey) {
  await ensureLoginAttemptTable();
  await db.execute(
    'DELETE FROM login_attempt_locks WHERE login_key=?',
    [loginKey]
  );
}

async function getSecurityEvent(eventKey) {
  await ensureSecurityEventTable();
  const [rows] = await db.execute(
    `SELECT id,event_key,failed_attempts,locked_until,last_attempt_at
     FROM security_event_locks
     WHERE event_key=?
     LIMIT 1`,
    [eventKey]
  );
  return rows[0] || null;
}

function securityLockMessage(lockedUntil) {
  const unlockTime = new Date(lockedUntil);
  const diffMs = unlockTime.getTime() - Date.now();
  const remainingMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  return `Too many reset attempts. Try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`;
}

async function recordSecurityEvent(eventKey, limit, lockMinutes) {
  await ensureSecurityEventTable();
  const current = await getSecurityEvent(eventKey);
  const now = new Date();

  if (!current) {
    const failedAttempts = 1;
    const lockedUntil = failedAttempts >= limit
      ? new Date(now.getTime() + lockMinutes * 60000)
      : null;

    await db.execute(
      `INSERT INTO security_event_locks(event_key,failed_attempts,locked_until,last_attempt_at)
       VALUES(?,?,?,?)`,
      [eventKey, failedAttempts, lockedUntil, now]
    );

    return { failed_attempts: failedAttempts, locked_until: lockedUntil };
  }

  const currentlyLocked = current.locked_until && new Date(current.locked_until) > now;
  const failedAttempts = currentlyLocked ? current.failed_attempts : Number(current.failed_attempts || 0) + 1;
  const lockedUntil = failedAttempts >= limit
    ? new Date(now.getTime() + lockMinutes * 60000)
    : null;

  await db.execute(
    `UPDATE security_event_locks
     SET failed_attempts=?, locked_until=?, last_attempt_at=?
     WHERE event_key=?`,
    [failedAttempts, lockedUntil, now, eventKey]
  );

  return { failed_attempts: failedAttempts, locked_until: lockedUntil };
}

async function clearSecurityEvent(eventKey) {
  await ensureSecurityEventTable();
  await db.execute(
    'DELETE FROM security_event_locks WHERE event_key=?',
    [eventKey]
  );
}

async function findAdmin(identifier, portal) {
  const scope = {
    'rotc-admin': "role='admin' AND program='ROTC'",
    'cwts-admin': "role='admin' AND program='CWTS'",
    officer: "role IN ('director','officer')",
  }[portal];
  if (!scope) return null;
  const [rows] = await db.execute(
    `SELECT id, email, username, password, role, program
     FROM admins
     WHERE (email = ? OR username = ?) AND ${scope}
     LIMIT 1`,
    [identifier, identifier]
  );

  return rows[0] || null;
}

async function findStudent(identifier) {
  const [rows] = await db.execute(
    `SELECT id, email, username, password, role, nstp_component
     FROM students
     WHERE (email = ? OR username = ?) AND role='student'
     LIMIT 1`,
    [identifier, identifier]
  );

  return rows[0] || null;
}

exports.login = async (req, res) => {
  try {
    const {
      identifier,
      username,
      email,
      password,
      portal: requestedPortal,
      recaptcha_token: recaptchaToken,
    } = req.body;
    const loginValue = String(identifier || username || email || '').trim();
    const plainPassword = String(password || '');

    if (typeof requestedPortal !== 'string'
      || !['student', 'rotc-admin', 'cwts-admin', 'officer'].includes(requestedPortal)) {
      return res.status(400).json({ message: 'Select a valid login portal and try again.' });
    }

    if (!await ensureCaptcha(req, res, recaptchaToken, 'login')) {
      return;
    }

    if (!loginValue || !plainPassword) {
      return res.status(400).json({ message: 'Email/username and password are required.' });
    }

    if (loginValue.length > MAX_LOGIN_IDENTIFIER_LENGTH) {
      return res.status(400).json({ message: 'Email/username is too long.' });
    }

    const loginKey = loginValue.toLowerCase();
    const attempt = await getLoginAttempt(loginKey);
    if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
      return res.status(429).json({
        message: lockoutMessage(attempt.locked_until),
        locked_until: attempt.locked_until,
      });
    }

    const source = requestedPortal === 'student' ? 'student' : 'admin';
    const user = source === 'student'
      ? await findStudent(loginValue)
      : await findAdmin(loginValue, requestedPortal);

    if (!user) {
      const failed = await recordFailedLogin(loginKey);
      return res.status(401).json({ message: 'Invalid credentials for this portal. Use your account’s designated login portal.' });
    }

    const match = await authService.comparePassword(plainPassword, user.password);
    if (!match) {
      const failed = await recordFailedLogin(loginKey);
      if (failed.locked_until) {
        return res.status(429).json({
          message: lockoutMessage(failed.locked_until),
          locked_until: failed.locked_until,
        });
      }
      const remaining = Math.max(0, LOGIN_ATTEMPT_LIMIT - Number(failed.failed_attempts || 0));
      return res.status(401).json({
        message: remaining > 0
          ? `Invalid login credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before a ${LOGIN_LOCK_MINUTES}-minute lock.`
          : 'Invalid login credentials.',
      });
    }

    const accountPortal = source === 'student' ? 'student' : adminPortal(user.program, user.role);
    if (accountPortal !== requestedPortal) {
      await recordFailedLogin(loginKey);
      return res.status(403).json({ message: 'This account cannot sign in to the selected portal.' });
    }
    await clearFailedLogins(loginKey);

    let payload;
    let portal;

    if (source === 'admin') {
      const runtimeRole = runtimeRoleForAdmin(user.role);
      portal = adminPortal(user.program, user.role);
      payload = {
        id: user.id,
        role: runtimeRole,
        portal,
        email: user.email,
        program: user.program,
        account_role: user.role,
      };
    } else {
      portal = 'student';
      payload = {
        id: user.id,
        role: 'student',
        portal,
        email: user.email,
        program: user.nstp_component,
      };
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '12h',
      ...jwtOptions(),
    });

    clearAuthCookies(res);

    res.cookie('nstp_token', token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: shouldUseSecureCookies(req),
      maxAge: 12 * 60 * 60 * 1000,
    });

    return res.json({
      message: 'Login successful.',
      portal,
      redirect: redirectForPortal(portal),
      user: payload,
    });
  } catch (error) {
    return serverError(res, error);
  }
};

exports.captchaConfig = async (req, res) => {
  res.json(captchaService.publicConfig());
};

exports.logout = async (req, res) => {
  clearAuthCookies(res);
  res.json({ message: 'Logged out successfully.' });
};

exports.me = async (req, res) => {
  res.json({ user: req.user });
};

async function handlePasswordChange(req, res, sending) {
  try {
    const { status, ...response } = await require('../services/passwordChangeService').run(
      req.user, req.body, sending, portalLabel(req.user.portal)
    );
    return res.status(status).json(response);
  } catch (error) {
    return serverError(res, error);
  }
}

exports.requestPasswordChangeCode = (req, res) => handlePasswordChange(req, res, true);
exports.changePassword = (req, res) => handlePasswordChange(req, res, false);

exports.currentAdminEmail = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT email FROM admins WHERE id=? LIMIT 1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Account not found.' });
    return res.json({ email: rows[0].email });
  } catch (error) { return serverError(res, error); }
};

exports.changeAdminEmail = async (req, res) => {
  try {
    const { status, ...response } = await require('../services/emailChangeService').run(
      req.user, req.body, req.params.step, portalLabel(req.user.portal)
    );
    if (status === 200 && response.email) {
      // Preserve the session's original expiration while refreshing its email.
      const token = jwt.sign({ ...req.user, email: response.email }, process.env.JWT_SECRET);
      clearAuthCookies(res);
      res.cookie('nstp_token', token, {
        httpOnly: true, path: '/', sameSite: 'lax', secure: shouldUseSecureCookies(req),
        maxAge: Math.max(0, req.user.exp * 1000 - Date.now()),
      });
    }
    return res.status(status).json(response);
  } catch (error) { return serverError(res, error); }
};

exports.requestStudentResetCode = async (req, res) => {
  try {
    const {
      portal,
      student_id: studentId,
      email,
      recaptcha_token: recaptchaToken,
    } = req.body;

    if (!await ensureCaptcha(req, res, recaptchaToken, 'student_reset_request')) {
      return;
    }

    if (String(portal || '') !== 'student') {
      return res.status(400).json({
        message: 'Self-service password reset is currently available only for student accounts.',
      });
    }

    if (!studentId || !email) {
      return res.status(400).json({
        message: 'Student ID and registered email are required.',
      });
    }

    if (!isValidStudentId(studentId)) {
      return res.status(400).json({
        message: 'Student ID must use format 000000-0000.',
      });
    }

    if (!isReasonableEmail(email)) {
      return res.status(400).json({
        message: 'Enter a valid registered email address.',
      });
    }

    const requestKey = `student-reset-request:${String(studentId).trim().toLowerCase()}:${String(email).trim().toLowerCase()}`;
    const requestAttempt = await getSecurityEvent(requestKey);
    if (requestAttempt?.locked_until && new Date(requestAttempt.locked_until) > new Date()) {
      return res.status(429).json({
        message: securityLockMessage(requestAttempt.locked_until),
        locked_until: requestAttempt.locked_until,
      });
    }

    if (!emailService.hasEmailConfig()) {
      return res.status(500).json({
        message: 'Gmail SMTP is not configured yet. Add GMAIL_USER and GMAIL_APP_PASSWORD in .env first.',
      });
    }

    const [rows] = await db.execute(
      `SELECT id, email
       FROM students
       WHERE student_id=? AND email=?
       LIMIT 1`,
      [String(studentId).trim(), String(email).trim()]
    );

    const account = rows[0];
    if (!account) {
      const failed = await recordSecurityEvent(requestKey, RESET_REQUEST_LIMIT, RESET_REQUEST_LOCK_MINUTES);
      return res.status(404).json({
        message: 'No student account matched the provided Student ID and email.',
        locked_until: failed.locked_until || null,
      });
    }

    await ensureStudentResetTable();

    const code = String(Math.floor(100000 + Math.random() * 900000));

    await db.execute(
      `INSERT INTO password_reset_codes(student_id,email,verification_code,expires_at)
       VALUES(?,?,?,DATE_ADD(NOW(), INTERVAL 10 MINUTE))
       ON DUPLICATE KEY UPDATE
         email=VALUES(email),
         verification_code=VALUES(verification_code),
         expires_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE)`,
      [account.id, account.email, code]
    );

    await emailService.sendPasswordResetCode({
      to: account.email,
      code,
      portalLabel: portalLabel('student'),
    });

    await clearSecurityEvent(requestKey);

    return res.json({
      message: `A verification code was sent to ${account.email}.`,
    });
  } catch (error) {
    return serverError(res, error);
  }
};

exports.resetStudentPassword = async (req, res) => {
  try {
    const {
      portal,
      student_id: studentId,
      email,
      verification_code: code,
      newPassword,
      confirmPassword,
      recaptcha_token: recaptchaToken,
    } = req.body;

    if (!await ensureCaptcha(req, res, recaptchaToken, 'student_reset_confirm')) {
      return;
    }

    if (String(portal || '') !== 'student') {
      return res.status(400).json({
        message: 'Self-service password reset is currently available only for student accounts.',
      });
    }

    if (!studentId || !email || !code || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: 'Student ID, email, verification code, and new password are required.',
      });
    }

    if (!isValidStudentId(studentId)) {
      return res.status(400).json({
        message: 'Student ID must use format 000000-0000.',
      });
    }

    if (!isReasonableEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid registered email address.' });
    }

    if (!isValidResetCode(code)) {
      return res.status(400).json({ message: 'Enter a valid 6-digit verification code.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const validationMessage = authService.newPasswordValidationMessage(newPassword);
    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const normalizedStudentId = String(studentId).trim();
    const normalizedEmail = String(email).trim();
    const resetKey = `student-reset-verify:${normalizedStudentId.toLowerCase()}:${normalizedEmail.toLowerCase()}`;
    const resetAttempt = await getSecurityEvent(resetKey);
    if (resetAttempt?.locked_until && new Date(resetAttempt.locked_until) > new Date()) {
      return res.status(429).json({
        message: securityLockMessage(resetAttempt.locked_until),
        locked_until: resetAttempt.locked_until,
      });
    }

    await ensureStudentResetTable();

    const [students] = await db.execute(
      `SELECT id,email,password
       FROM students
       WHERE student_id=? AND email=?
       LIMIT 1`,
      [normalizedStudentId, normalizedEmail]
    );

    const student = students[0];
    if (!student) {
      const failed = await recordSecurityEvent(resetKey, RESET_VERIFY_LIMIT, RESET_VERIFY_LOCK_MINUTES);
      return res.status(404).json({
        message: 'No student account matched the provided Student ID and email.',
        locked_until: failed.locked_until || null,
      });
    }

    const [rows] = await db.execute(
      `SELECT id,verification_code,expires_at,
              CASE WHEN expires_at > NOW() THEN 1 ELSE 0 END AS is_active
       FROM password_reset_codes
       WHERE student_id=? AND email=?
       LIMIT 1`,
      [student.id, student.email]
    );

    const reset = rows[0];
    if (!reset) {
      const failed = await recordSecurityEvent(resetKey, RESET_VERIFY_LIMIT, RESET_VERIFY_LOCK_MINUTES);
      return res.status(400).json({
        message: 'Request a verification code first.',
        locked_until: failed.locked_until || null,
      });
    }

    if (String(reset.verification_code) !== String(code).trim()) {
      const failed = await recordSecurityEvent(resetKey, RESET_VERIFY_LIMIT, RESET_VERIFY_LOCK_MINUTES);
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    if (!Number(reset.is_active)) {
      return res.status(400).json({
        message: 'This verification code has expired. Request a new one.',
      });
    }

    const isSamePassword = await authService.comparePassword(newPassword, student.password);
    if (isSamePassword) {
      return res.status(400).json({
        message: 'Your new password must be different from your current password.',
      });
    }

    const hashedPassword = await authService.hashPassword(newPassword);
    await db.execute('UPDATE students SET password=? WHERE id=?', [hashedPassword, student.id]);
    await db.execute('DELETE FROM password_reset_codes WHERE student_id=?', [student.id]);
    await clearSecurityEvent(resetKey);

    return res.json({
      message: 'Password reset successful. You can now sign in with your new password.',
    });
  } catch (error) {
    return serverError(res, error);
  }
};

exports.requestAdminResetCode = async (req, res) => {
  try {
    const portal = String(req.body.portal || '').trim();
    const email = String(req.body.email || '').trim();
    const recaptchaToken = req.body.recaptcha_token;

    if (!await ensureCaptcha(req, res, recaptchaToken, 'admin_reset_request')) {
      return;
    }

    if (!['rotc-admin', 'cwts-admin', 'officer'].includes(portal)) {
      return res.status(400).json({ message: 'Select a valid admin portal.' });
    }

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    if (!isReasonableEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid admin email address.' });
    }

    const requestKey = `admin-reset-request:${portal}:${String(email).trim().toLowerCase()}`;
    const requestAttempt = await getSecurityEvent(requestKey);
    if (requestAttempt?.locked_until && new Date(requestAttempt.locked_until) > new Date()) {
      return res.status(429).json({
        message: securityLockMessage(requestAttempt.locked_until),
        locked_until: requestAttempt.locked_until,
      });
    }

    if (!emailService.hasEmailConfig()) {
      return res.status(500).json({
        message: 'Gmail SMTP is not configured yet. Add GMAIL_USER and GMAIL_APP_PASSWORD in .env first.',
      });
    }

    const lookup = adminResetLookup(portal);
    const [rows] = await db.execute(lookup.selectByEmail, [email]);

    if (!rows[0]) {
      const failed = await recordSecurityEvent(requestKey, RESET_REQUEST_LIMIT, RESET_REQUEST_LOCK_MINUTES);
      return res.status(404).json({
        message: 'No admin account matched that email for the selected portal.',
        locked_until: failed.locked_until || null,
      });
    }

    await ensureAdminResetTable();

    const code = String(Math.floor(100000 + Math.random() * 900000));

    await db.execute(
      `INSERT INTO admin_password_reset_codes(admin_id,email,portal,verification_code,expires_at)
       VALUES(?,?,?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))
       ON DUPLICATE KEY UPDATE
         email=VALUES(email),
         portal=VALUES(portal),
         verification_code=VALUES(verification_code),
         expires_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE)`,
      [rows[0].id, rows[0].email, portal, code]
    );

    await emailService.sendPasswordResetCode({
      to: rows[0].email,
      code,
      portalLabel: portalLabel(portal),
    });

    await clearSecurityEvent(requestKey);

    return res.json({
      message: `A verification code was sent to ${rows[0].email}.`,
    });
  } catch (error) {
    return serverError(res, error);
  }
};

exports.resetAdminPassword = async (req, res) => {
  try {
    const portal = String(req.body.portal || '').trim();
    const email = String(req.body.email || '').trim();
    const code = String(req.body.verification_code || '').trim();
    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    const recaptchaToken = req.body.recaptcha_token;

    if (!await ensureCaptcha(req, res, recaptchaToken, 'admin_reset_confirm')) {
      return;
    }

    if (!['rotc-admin', 'cwts-admin', 'officer'].includes(portal)) {
      return res.status(400).json({ message: 'Select a valid admin portal.' });
    }

    if (!email || !code || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: 'Email, verification code, and new password are required.',
      });
    }

    if (!isReasonableEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid admin email address.' });
    }

    if (!isValidResetCode(code)) {
      return res.status(400).json({ message: 'Enter a valid 6-digit verification code.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const validationMessage = authService.newPasswordValidationMessage(newPassword);
    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const resetKey = `admin-reset-verify:${portal}:${email.toLowerCase()}`;
    const resetAttempt = await getSecurityEvent(resetKey);
    if (resetAttempt?.locked_until && new Date(resetAttempt.locked_until) > new Date()) {
      return res.status(429).json({
        message: securityLockMessage(resetAttempt.locked_until),
        locked_until: resetAttempt.locked_until,
      });
    }

    await ensureAdminResetTable();

    const lookup = adminResetLookup(portal);
    const [admins] = await db.execute(lookup.selectAccount, [email]);

    const admin = admins[0];
    if (!admin) {
      const failed = await recordSecurityEvent(resetKey, RESET_VERIFY_LIMIT, RESET_VERIFY_LOCK_MINUTES);
      return res.status(404).json({
        message: 'No admin account matched that email for the selected portal.',
        locked_until: failed.locked_until || null,
      });
    }

    const [rows] = await db.execute(
      `SELECT id,verification_code,expires_at,
              CASE WHEN expires_at > NOW() THEN 1 ELSE 0 END AS is_active
       FROM admin_password_reset_codes
       WHERE admin_id=? AND email=? AND portal=?
       LIMIT 1`,
      [admin.id, admin.email, portal]
    );

    const reset = rows[0];
    if (!reset) {
      const failed = await recordSecurityEvent(resetKey, RESET_VERIFY_LIMIT, RESET_VERIFY_LOCK_MINUTES);
      return res.status(400).json({
        message: 'Request a verification code first.',
        locked_until: failed.locked_until || null,
      });
    }

    if (reset.verification_code !== code) {
      await recordSecurityEvent(resetKey, RESET_VERIFY_LIMIT, RESET_VERIFY_LOCK_MINUTES);
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    if (!Number(reset.is_active)) {
      return res.status(400).json({
        message: 'This verification code has expired. Request a new one.',
      });
    }

    const isSamePassword = await authService.comparePassword(newPassword, admin.password);
    if (isSamePassword) {
      return res.status(400).json({
        message: 'Your new password must be different from your current password.',
      });
    }

    const hashedPassword = await authService.hashPassword(newPassword);
    await db.execute('UPDATE admins SET password=? WHERE id=?', [hashedPassword, admin.id]);
    await db.execute('DELETE FROM admin_password_reset_codes WHERE admin_id=?', [admin.id]);
    await clearSecurityEvent(resetKey);

    return res.json({
      message: 'Password reset successful. You can now sign in with your new password.',
    });
  } catch (error) {
    return serverError(res, error);
  }
};
