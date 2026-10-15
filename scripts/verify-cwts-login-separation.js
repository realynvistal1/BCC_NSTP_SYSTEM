// Controller-level role separation checks; no database records or email are used.
const assert = require('node:assert/strict');
const db = require('../config/database');
const captcha = require('../services/captchaService');
const auth = require('../services/authService');
const email = require('../services/emailService');
const reset = require('../services/cwtsInstructorResetService');
const controller = require('../controllers/authController');

async function main() {
  const password = 'Login-test-password-123';
  const hash = await auth.hashPassword(password);
  const admin = { id: 1, email: 'admin@example.invalid', password: hash, role: 'admin', program: 'CWTS' };
  const instructor = { id: 2, email: 'teacher@example.invalid', password: hash, role: 'instructor', program: 'CWTS', first_name: 'Test', last_name: 'Instructor', session_version: 1 };
  const original = { execute: db.execute, captcha: captcha.verifyToken, config: email.hasEmailConfig, reset: reset.handle };
  let resetCalls = 0;
  try {
    captcha.verifyToken = async () => ({ ok: true });
    email.hasEmailConfig = () => true;
    db.execute = async (sql, values = []) => {
      if (sql.includes('FROM cwts_instructors')) return [[values[0] === instructor.email ? instructor : undefined].filter(Boolean)];
      if (sql.includes('FROM admins')) return [[values[0] === admin.email ? admin : undefined].filter(Boolean)];
      return [[]];
    };
    reset.handle = async address => {
      resetCalls++;
      return address === instructor.email ? { status: 200, message: 'Instructor reset handled.' } : null;
    };
    async function invoke(handler, body) {
      const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, clearCookie() {}, cookie() {} };
      await handler({ body, headers: {}, hostname: 'localhost', secure: false }, res);
      return res;
    }
    for (const [account, portal, expected] of [
      [admin, 'cwts-admin', 200], [instructor, 'cwts-instructor', 200],
      [instructor, 'cwts-admin', 401], [admin, 'cwts-instructor', 401],
    ]) {
      const result = await invoke(controller.login, { email: account.email, password, portal });
      assert.equal(result.code, expected, `${account.role} using ${portal}`);
      if (expected === 200) {
        assert.equal(result.body.user.role, account.role);
        assert.equal(result.body.redirect, account.role === 'instructor' ? '/admin/cwts/my-attendance' : '/admin/cwts/dashboard');
      }
    }
    assert.equal((await invoke(controller.login, { email: instructor.email, password: 'wrong', portal: 'cwts-instructor' })).code, 401);
    const resetBody = { portal: 'cwts-instructor', email: instructor.email, verification_code: '123456', newPassword: 'New-login-password-456', confirmPassword: 'New-login-password-456' };
    for (const handler of [controller.requestAdminResetCode, controller.resetAdminPassword]) {
      assert.equal((await invoke(handler, resetBody)).code, 200);
      const before = resetCalls;
      assert.equal((await invoke(handler, { ...resetBody, portal: 'cwts-admin' })).code, 404);
      assert.equal(resetCalls, before, 'Admin recovery must not invoke instructor recovery');
      assert.equal((await invoke(handler, { ...resetBody, email: admin.email })).code, 404);
    }
    console.log('PASS: separate CWTS login roles, destinations, wrong passwords, and isolated instructor password recovery.');
  } finally {
    db.execute = original.execute;
    captcha.verifyToken = original.captcha;
    email.hasEmailConfig = original.config;
    reset.handle = original.reset;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
