const { randomInt } = require('node:crypto');
const db = require('../config/database');
const auth = require('./authService');
const email = require('./emailService');
const { isReasonableEmail, isValidResetCode } = require('./requestValidationService');

const MINUTE = 60000;
let tableReady;
function ensureTable() {
  if (!tableReady) {
    tableReady = db.execute(`CREATE TABLE IF NOT EXISTS password_change_codes (
      account_type VARCHAR(10) NOT NULL,
      account_id INT UNSIGNED NOT NULL,
      code_hash VARCHAR(255) DEFAULT NULL,
      email VARCHAR(255) DEFAULT NULL,
      password_hash VARCHAR(255) DEFAULT NULL,
      expires_at BIGINT NOT NULL DEFAULT 0,
      sent_at BIGINT NOT NULL DEFAULT 0,
      window_started BIGINT NOT NULL DEFAULT 0,
      requests INT UNSIGNED NOT NULL DEFAULT 0,
      attempts INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (account_type, account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

// Account and challenge locks serialize resends, guesses, and code consumption.
async function run(user, body, sending, portalLabel) {
  const result = (status, message, extra = {}) => ({ status, message, ...extra });
  if (typeof body.currentPassword !== 'string' || !body.currentPassword) {
    return result(400, 'Current password is required.');
  }
  if (!sending) {
    if (typeof body.newPassword !== 'string') return result(400, 'New password is required.');
    const invalid = auth.newPasswordValidationMessage(body.newPassword);
    if (invalid) return result(400, invalid);
    if (typeof body.verification_code !== 'string' || !isValidResetCode(body.verification_code)) {
      return result(400, 'Enter the 6-digit verification code sent to your registered email.');
    }
  }
  if (sending && !email.hasEmailConfig()) {
    return result(503, 'Email delivery is unavailable. Please contact your administrator.');
  }
  await ensureTable();
  const connection = await db.getConnection();
  const type = user.role === 'student' ? 'student' : 'admin';
  // Table names come only from these fixed choices, never request input.
  const table = type === 'student' ? 'students' : 'admins';
  try {
    await connection.beginTransaction();
    const finish = async (response) => { await connection.commit(); return response; };
    const [accounts] = await connection.execute(
      `SELECT id,email,password FROM ${table} WHERE id=? FOR UPDATE`, [user.id]
    );
    const account = accounts[0];
    if (!account) return await finish(result(404, 'Account not found.'));
    await connection.execute(
      'INSERT IGNORE INTO password_change_codes(account_type,account_id) VALUES(?,?)', [type, user.id]
    );
    const [rows] = await connection.execute(
      'SELECT * FROM password_change_codes WHERE account_type=? AND account_id=? FOR UPDATE', [type, user.id]
    );
    const state = rows[0];
    const now = Date.now();
    if (now - Number(state.window_started) >= 15 * MINUTE) {
      state.window_started = now;
      state.requests = 0;
      state.attempts = 0;
    }
    const save = () => connection.execute(
      `UPDATE password_change_codes SET code_hash=?,email=?,password_hash=?,expires_at=?,sent_at=?,
       window_started=?,requests=?,attempts=? WHERE account_type=? AND account_id=?`,
      [state.code_hash, state.email, state.password_hash, state.expires_at, state.sent_at,
        state.window_started, state.requests, state.attempts, type, user.id]
    );
    if (sending) {
      if (state.requests >= 3) return await finish(result(429, 'Too many code requests. Try again in 15 minutes.'));
      const retryAfter = Math.ceil((Number(state.sent_at) + MINUTE - now) / 1000);
      if (retryAfter > 0) return await finish(result(429, `Wait ${retryAfter} seconds before requesting another code.`, { retryAfter }));
      state.requests += 1;
    } else {
      if (state.attempts >= 5) return await finish(result(429, 'Too many verification attempts. Try again in 15 minutes.'));
      state.attempts += 1;
    }
    await save();
    if (!await auth.comparePassword(body.currentPassword, account.password)) {
      return await finish(result(400, 'Current password is incorrect.'));
    }
    if (sending) {
      if (!isReasonableEmail(account.email)) return await finish(result(400, 'Your account needs a valid registered email. Please contact your administrator.'));
      const code = String(randomInt(100000, 1000000));
      state.code_hash = await auth.hashPassword(code);
      state.email = account.email;
      state.password_hash = account.password;
      state.expires_at = now + 10 * MINUTE;
      state.sent_at = now;
      try {
        await email.sendPasswordChangeCode({ to: account.email, code, portalLabel });
      } catch {
        // Persist the request limit, but never activate an undelivered code.
        state.code_hash = null;
        await save();
        return await finish(result(503, 'Could not send the verification code. Please try again later.'));
      }
      await save();
      const [local, domain] = account.email.split('@');
      return await finish(result(200, `A verification code was sent to ${local.slice(0, 1)}***@${domain}. It expires in 10 minutes.`, { retryAfter: 60 }));
    }
    if (!state.code_hash || Number(state.expires_at) <= now
        || state.email !== account.email || state.password_hash !== account.password) {
      return await finish(result(400, 'Request a new verification code. The previous code is expired or no longer valid.'));
    }
    if (!await auth.comparePassword(body.verification_code.trim(), state.code_hash)) {
      return await finish(result(400, 'Invalid verification code.'));
    }
    if (await auth.comparePassword(body.newPassword, account.password)) {
      return await finish(result(400, 'Your new password must be different from your current password.'));
    }
    const password = await auth.hashPassword(body.newPassword);
    await connection.execute(`UPDATE ${table} SET password=? WHERE id=?`, [password, user.id]);
    state.code_hash = null;
    await save();
    return await finish(result(200, 'Password changed successfully.'));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { run };
