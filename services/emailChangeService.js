const { randomInt } = require('node:crypto');
const db = require('../config/database');
const auth = require('./authService');
const mail = require('./emailService');
const { isReasonableEmail, isValidResetCode } = require('./requestValidationService');

const MINUTE = 60000;
let ready;
function ensureTable() {
  if (!ready) ready = db.execute(`CREATE TABLE IF NOT EXISTS admin_email_changes (
    admin_id INT UNSIGNED NOT NULL PRIMARY KEY,
    state_json TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(error => { ready = null; throw error; });
  return ready;
}

async function run(user, body, action, portalLabel) {
  const result = (status, message, extra = {}) => ({ status, message, ...extra });
  if (!['admin', 'officer', 'director'].includes(user.role)) return result(403, 'Access denied.');
  if (!['request-old', 'verify-old', 'request-new', 'confirm'].includes(action)) return result(400, 'Invalid email change step.');
  const newEmail = typeof body.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';
  if (!isReasonableEmail(newEmail)) return result(400, 'Enter a valid new email address.');
  if (typeof body.currentPassword !== 'string' || !body.currentPassword) return result(400, 'Current password is required.');
  const verifying = action === 'verify-old' || action === 'confirm';
  if (verifying && (typeof body.code !== 'string' || !isValidResetCode(body.code))) return result(400, 'Enter a valid 6-digit verification code.');
  if (action !== 'confirm' && !mail.hasEmailConfig()) return result(503, 'Email delivery is unavailable. Please contact your administrator.');
  await ensureTable();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const finish = async response => { await connection.commit(); return response; };
    const [accounts] = await connection.execute('SELECT id,email,password FROM admins WHERE id=? FOR UPDATE', [user.id]);
    const account = accounts[0];
    if (!account) return await finish(result(404, 'Account not found.'));
    await connection.execute('INSERT IGNORE INTO admin_email_changes(admin_id,state_json) VALUES(?,?)', [user.id, '{}']);
    const [rows] = await connection.execute('SELECT state_json FROM admin_email_changes WHERE admin_id=? FOR UPDATE', [user.id]);
    const state = JSON.parse(rows[0].state_json);
    const now = Date.now();
    if (!state.window || now - state.window >= 15 * MINUTE) {
      state.window = now;
      state.requests = 0;
      state.attempts = 0;
    }
    const save = () => connection.execute('UPDATE admin_email_changes SET state_json=? WHERE admin_id=?', [JSON.stringify(state), user.id]);
    const deny = async (message, status = 400) => { await save(); return finish(result(status, message)); };
    if (state.attempts >= 5) return await deny('Too many verification attempts. Try again in 15 minutes.', 429);
    // Failed passwords also consume the attempt budget, including on send requests.
    if (!await auth.comparePassword(body.currentPassword, account.password)) {
      state.attempts++;
      return await deny('Current password is incorrect.');
    }
    if (newEmail === account.email.toLowerCase()) return await deny('Enter an email different from your current email.');
    const [duplicates] = await connection.execute(
      `SELECT id FROM admins WHERE email=? AND id<>? UNION ALL SELECT id FROM students WHERE email=? LIMIT 1`,
      [newEmail, user.id, newEmail]
    );
    if (duplicates.length) return await deny('That email is already in use. Choose another email.');
    if (action !== 'request-old' && (state.oldEmail !== account.email || state.newEmail !== newEmail
        || state.passwordHash !== account.password || !state.expires || state.expires <= now)) {
      return await deny('This email change has expired or the account details changed. Start again.');
    }
    if (action === 'request-old') {
      if (!isReasonableEmail(account.email)) return await deny('Your account needs a valid current email. Contact your administrator.');
    } else if (action === 'verify-old') {
      if (state.phase !== 'old' || !state.codeHash) return await deny('Request a code for your current email first.');
      if (!await auth.comparePassword(body.code.trim(), state.codeHash)) {
        state.attempts++;
        return await deny('Invalid verification code.');
      }
    } else if (state.phase !== 'new') {
      return await deny('Verify your current email first.');
    }
    if (action === 'confirm') {
      if (!state.codeHash || !await auth.comparePassword(body.code.trim(), state.codeHash)) {
        state.attempts++;
        return await deny('Invalid verification code.');
      }
      // Keep the account ID, password, roles, and all related records unchanged.
      await connection.execute('UPDATE admins SET email=? WHERE id=?', [newEmail, user.id]);
      state.phase = 'complete';
      state.codeHash = null;
      await save();
      return await finish(result(200, 'Email changed successfully. Use your new email for email login and verification codes.', { email: newEmail }));
    }
    if (state.requests >= 6) return await deny('Too many code requests. Try again in 15 minutes.', 429);
    const destination = action === 'request-old' ? 'old' : 'new';
    const lastSent = state[destination + 'SentAt'] || 0;
    const retryAfter = Math.ceil((lastSent + MINUTE - now) / 1000);
    if (retryAfter > 0) return await deny(`Wait ${retryAfter} seconds before requesting another code.`, 429);
    state.requests++;
    state[destination + 'SentAt'] = now;
    const code = String(randomInt(100000, 1000000));
    const hash = await auth.hashPassword(code);
    try {
      await mail.sendEmailChangeCode({ to: destination === 'old' ? account.email : newEmail, code, portalLabel, destination, newEmail });
    } catch {
      // Failed deliveries retain the previous step so the user can retry it.
      return await deny('Could not send the verification code. Please try again in one minute.', 503);
    }
    state.oldEmail = account.email;
    state.newEmail = newEmail;
    state.passwordHash = account.password;
    state.codeHash = hash;
    state.phase = destination;
    if (action !== 'request-new') state.expires = now + 10 * MINUTE;
    await save();
    const target = destination === 'old' ? account.email : newEmail;
    const [local, domain] = target.split('@');
    return await finish(result(200, `Code sent to ${local[0]}***@${domain}. ${destination === 'old' ? 'Verify your current email to continue.' : 'Enter the new email code, then save.'}`, {
      phase: destination, retryAfter: 60,
    }));
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return result(409, 'That email is already in use. Choose another email.');
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { run };
