const jwt = require('jsonwebtoken');
const db = require('../config/database');
const authService = require('../services/authService');
const emailService = require('../services/emailService');

function adminPortal(program, storedRole) {
  if (storedRole === 'director' || storedRole === 'officer') return 'officer';
  if (program === 'CWTS') return 'cwts-admin';
  return 'rotc-admin';
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

function adminResetWhere(portal) {
  if (portal === 'officer') {
    return {
      clause: "email=? AND role IN ('director','officer')",
      params: (email) => [email],
    };
  }
  if (portal === 'cwts-admin') {
    return {
      clause: "email=? AND role='admin' AND program IN ('CWTS','BOTH')",
      params: (email) => [email],
    };
  }
  return {
    clause: "email=? AND role='admin' AND program IN ('ROTC','BOTH')",
    params: (email) => [email],
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

async function findAdmin(identifier) {
  const [rows] = await db.execute(
    `SELECT id, email, username, password, role, program
     FROM admins
     WHERE email = ? OR username = ?
     LIMIT 1`,
    [identifier, identifier]
  );

  return rows[0] || null;
}

async function findStudent(identifier) {
  const [rows] = await db.execute(
    `SELECT id, email, username, password, role, nstp_component
     FROM students
     WHERE email = ? OR username = ?
     LIMIT 1`,
    [identifier, identifier]
  );

  return rows[0] || null;
}

exports.login = async (req, res) => {
  try {
    const { identifier, username, email, password } = req.body;
    const loginValue = String(identifier || username || email || '').trim();
    const plainPassword = String(password || '');

    if (!loginValue || !plainPassword) {
      return res.status(400).json({ message: 'Email/username and password are required.' });
    }

    let source = 'admin';
    let user = await findAdmin(loginValue);

    if (!user) {
      source = 'student';
      user = await findStudent(loginValue);
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid login credentials.' });
    }

    const match = await authService.comparePassword(plainPassword, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid login credentials.' });
    }

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

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });

    clearAuthCookies(res);

    res.cookie('nstp_token', token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
      maxAge: 12 * 60 * 60 * 1000,
    });

    return res.json({
      message: 'Login successful.',
      portal,
      redirect: redirectForPortal(portal),
      user: payload,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.logout = async (_req, res) => {
  clearAuthCookies(res);
  res.json({ message: 'Logged out successfully.' });
};

exports.me = async (req, res) => {
  res.json({ ...req.user, user: req.user });
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required.' });
    }

    const validationMessage = authService.newPasswordValidationMessage(newPassword);
    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const isStudent = req.user.role === 'student';
    const table = isStudent ? 'students' : 'admins';
    const [rows] = await db.execute(
      `SELECT id, password FROM ${table} WHERE id = ? LIMIT 1`,
      [req.user.id]
    );

    const account = rows[0];
    if (!account) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const match = await authService.comparePassword(currentPassword, account.password);
    if (!match) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    const hashedPassword = await authService.hashPassword(newPassword);
    await db.execute(`UPDATE ${table} SET password = ? WHERE id = ?`, [hashedPassword, req.user.id]);

    return res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const {
      portal,
      student_id: studentId,
      email,
      birthdate,
      newPassword,
      confirmPassword,
    } = req.body;

    if (String(portal || '') !== 'student') {
      return res.status(400).json({
        message: 'Self-service password reset is currently available only for student accounts.',
      });
    }

    if (!studentId || !email || !birthdate || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: 'Student ID, email, birthdate, and new password are required.',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const validationMessage = authService.newPasswordValidationMessage(newPassword);
    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const [rows] = await db.execute(
      `SELECT id, password
       FROM students
       WHERE student_id=? AND email=? AND birthdate=?
       LIMIT 1`,
      [String(studentId).trim(), String(email).trim(), String(birthdate).trim()]
    );

    const account = rows[0];
    if (!account) {
      return res.status(404).json({
        message: 'No student account matched the provided Student ID, email, and birthdate.',
      });
    }

    const isSamePassword = await authService.comparePassword(newPassword, account.password);
    if (isSamePassword) {
      return res.status(400).json({
        message: 'Your new password must be different from your current password.',
      });
    }

    const hashedPassword = await authService.hashPassword(newPassword);
    await db.execute('UPDATE students SET password=? WHERE id=?', [hashedPassword, account.id]);

    return res.json({
      message: 'Password reset successful. You can now sign in with your new password.',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.requestAdminResetCode = async (req, res) => {
  try {
    const portal = String(req.body.portal || '').trim();
    const email = String(req.body.email || '').trim();

    if (!['rotc-admin', 'cwts-admin', 'officer'].includes(portal)) {
      return res.status(400).json({ message: 'Select a valid admin portal.' });
    }

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    if (!emailService.hasEmailConfig()) {
      return res.status(500).json({
        message: 'Gmail SMTP is not configured yet. Add GMAIL_USER and GMAIL_APP_PASSWORD in .env first.',
      });
    }

    const lookup = adminResetWhere(portal);
    const [rows] = await db.execute(
      `SELECT id,email FROM admins WHERE ${lookup.clause} LIMIT 1`,
      lookup.params(email)
    );

    if (!rows[0]) {
      return res.status(404).json({
        message: 'No admin account matched that email for the selected portal.',
      });
    }

    await ensureAdminResetTable();

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const expiry = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

    await db.execute(
      `INSERT INTO admin_password_reset_codes(admin_id,email,portal,verification_code,expires_at)
       VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         email=VALUES(email),
         portal=VALUES(portal),
         verification_code=VALUES(verification_code),
         expires_at=VALUES(expires_at)`,
      [rows[0].id, rows[0].email, portal, code, expiry]
    );

    await emailService.sendPasswordResetCode({
      to: rows[0].email,
      code,
      portalLabel: portalLabel(portal),
    });

    return res.json({
      message: `A verification code was sent to ${rows[0].email}.`,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.resetAdminPassword = async (req, res) => {
  try {
    const portal = String(req.body.portal || '').trim();
    const email = String(req.body.email || '').trim();
    const code = String(req.body.verification_code || '').trim();
    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!['rotc-admin', 'cwts-admin', 'officer'].includes(portal)) {
      return res.status(400).json({ message: 'Select a valid admin portal.' });
    }

    if (!email || !code || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: 'Email, verification code, and new password are required.',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const validationMessage = authService.newPasswordValidationMessage(newPassword);
    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    await ensureAdminResetTable();

    const lookup = adminResetWhere(portal);
    const [admins] = await db.execute(
      `SELECT id,email,password FROM admins WHERE ${lookup.clause} LIMIT 1`,
      lookup.params(email)
    );

    const admin = admins[0];
    if (!admin) {
      return res.status(404).json({
        message: 'No admin account matched that email for the selected portal.',
      });
    }

    const [rows] = await db.execute(
      `SELECT id,verification_code,expires_at
       FROM admin_password_reset_codes
       WHERE admin_id=? AND email=? AND portal=?
       LIMIT 1`,
      [admin.id, admin.email, portal]
    );

    const reset = rows[0];
    if (!reset) {
      return res.status(400).json({
        message: 'Request a verification code first.',
      });
    }

    if (reset.verification_code !== code) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    if (new Date(reset.expires_at).getTime() < Date.now()) {
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

    return res.json({
      message: 'Password reset successful. You can now sign in with your new password.',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
