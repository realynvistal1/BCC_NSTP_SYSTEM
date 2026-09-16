// Connection-local temporary tables: no real accounts, passwords, or lockouts are changed.
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const authService = require('../services/authService');

async function main() {
  const connection = await db.getConnection();
  const originalExecute = db.execute;
  const captcha = require('../services/captchaService');
  const originalCaptcha = captcha.verifyToken;
  try {
    for (const table of ['admins', 'students']) {
      await connection.execute(`CREATE TEMPORARY TABLE ${table} (
        id INT PRIMARY KEY, email VARCHAR(255), username VARCHAR(255), password VARCHAR(255),
        role VARCHAR(20), program VARCHAR(20), nstp_component VARCHAR(20)
      ) ENGINE=InnoDB`);
    }
    const password = 'PortalVerification123!';
    const hash = await authService.hashPassword(password);
    const accounts = [
      { id: 1, table: 'students', role: 'student', program: 'ROTC', portal: 'student' },
      { id: 2, table: 'admins', role: 'admin', program: 'ROTC', portal: 'rotc-admin' },
      { id: 3, table: 'admins', role: 'admin', program: 'CWTS', portal: 'cwts-admin' },
      { id: 4, table: 'admins', role: 'director', program: 'BOTH', portal: 'officer' },
    ];
    for (const account of accounts) {
      account.email = `test${account.id}@example.test`;
      await connection.execute(`INSERT INTO ${account.table}(id,email,username,password,role,program,nstp_component) VALUES(?,?,?,?,?,?,?)`,
        [account.id, account.email, `test${account.id}`, hash, account.role, account.program, account.program]);
    }
    db.execute = (sql, params) => connection.execute(sql.replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMPORARY TABLE IF NOT EXISTS'), params);
    captcha.verifyToken = async () => ({ ok: true });
    const controller = require('../controllers/authController');
    async function login(body) {
      const res = { code: 200, cookies: [], status(code) { this.code = code; return this; },
        json(body) { this.body = body; return this; }, clearCookie() {}, cookie(name, token) { this.cookies.push({ name, token }); } };
      await controller.login({ body, headers: {}, hostname: 'localhost', secure: false }, res);
      return res;
    }
    for (const account of accounts) {
      for (const portal of accounts.map(row => row.portal)) {
        const result = await login({ email: account.email, password, portal });
        if (portal === account.portal) {
          assert.equal(result.code, 200, `${account.portal} should accept its own account`);
          assert.equal(result.cookies.length, 1);
          const claims = jwt.verify(result.cookies[0].token, process.env.JWT_SECRET, { audience: 'bcc-nstp-app', issuer: 'bcc-nstp-system' });
          assert.equal(claims.portal, portal);
          assert.equal(claims.role, account.role === 'director' ? 'officer' : account.role);
        } else {
          assert.equal(result.code, 401, `${account.portal} must not enter ${portal}`);
          assert.equal(result.cookies.length, 0, 'Wrong-portal login must not issue a session');
          assert.equal(result.body.redirect, undefined);
        }
        await connection.execute('DELETE FROM login_attempt_locks');
      }
    }
    for (const portal of [undefined, '', 'admin', 'director', { role: 'student' }]) {
      const result = await login({ email: accounts[0].email, password, portal });
      assert.equal(result.code, 400);
      assert.equal(result.cookies.length, 0);
    }
    const wrongPassword = await login({ email: accounts[0].email, password: 'WrongPassword', portal: 'student' });
    assert.equal(wrongPassword.code, 401);
    assert.equal(wrongPassword.cookies.length, 0);
    // Same identifier in both tables must authenticate only against the selected portal's table.
    await connection.execute('UPDATE admins SET email=? WHERE id=2', [accounts[0].email]);
    const student = await login({ email: accounts[0].email, password, portal: 'student' });
    assert.equal(student.body.user.id, 1);
    const admin = await login({ email: accounts[0].email, password, portal: 'rotc-admin' });
    assert.equal(admin.body.user.id, 2);
    // A malformed admin program has no implicit ROTC fallback.
    await connection.execute("UPDATE admins SET program='BOTH' WHERE id=2");
    const unsupported = await login({ email: accounts[0].email, password, portal: 'rotc-admin' });
    assert.equal(unsupported.code, 401);
    assert.equal(unsupported.cookies.length, 0);
    const { requireRole, requirePortal } = require('../middleware/authMiddleware');
    for (const account of accounts) {
      for (const portal of accounts.map(row => row.portal)) {
        const roles = { student: 'student', officer: 'officer', 'rotc-admin': 'admin', 'cwts-admin': 'admin' };
        let allowed = false;
        const req = { user: { portal: account.portal, role: roles[account.portal] } };
        const res = { status() { return this; }, json() {} };
        requireRole(roles[portal])(req, res, () => requirePortal(portal)(req, res, () => { allowed = true; }));
        assert.equal(allowed, account.portal === portal);
      }
    }
    console.log('PASS: all 16 portal/account combinations, wrong passwords, invalid portals, identifier collisions, unknown admin program, JWT claims, and role/portal guards.');
  } finally {
    db.execute = originalExecute;
    captcha.verifyToken = originalCaptcha;
    connection.release();
    await db.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
