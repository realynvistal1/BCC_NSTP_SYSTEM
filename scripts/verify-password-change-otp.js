// Uses connection-local temporary tables; no real accounts or email deliveries.
const assert = require('node:assert/strict');
const db = require('../config/database');
const auth = require('../services/authService');

async function main() {
  const connection = await db.getConnection();
  let sent;
  let failDelivery = false;
  let configured = true;
  const originalPassword = await auth.hashPassword('OriginalPassword123');
  const mock = (name, value) => {
    require.cache[require.resolve(name)] = { exports: value };
  };
  try {
    for (const table of ['students', 'admins']) {
      await connection.execute(`CREATE TEMPORARY TABLE ${table} (
        id INT PRIMARY KEY, email VARCHAR(255), password VARCHAR(255)
      ) ENGINE=InnoDB`);
    }
    mock('../config/database', {
      execute: (sql, params) => connection.execute(sql.replace('CREATE TABLE', 'CREATE TEMPORARY TABLE'), params),
      getConnection: async () => ({
        execute: connection.execute.bind(connection),
        beginTransaction: connection.beginTransaction.bind(connection),
        commit: connection.commit.bind(connection),
        rollback: connection.rollback.bind(connection),
        release() {},
      }),
    });
    mock('../services/emailService', {
      hasEmailConfig: () => configured,
      async sendPasswordChangeCode(message) {
        if (failDelivery) throw new Error('Simulated mail failure');
        sent = message;
      },
    });
    const service = require('../services/passwordChangeService');
    const request = { currentPassword: 'OriginalPassword123', email: 'attacker@example.com' };
    const change = (code) => ({ ...request, newPassword: 'NewPassword456', verification_code: code });
    let checks = 0;
    const expect = async (user, body, sending, status) => {
      const response = await service.run(user, body, sending, 'Test Portal');
      assert.equal(response.status, status, response.message);
      checks += 1;
      return response;
    };
    for (const role of ['student', 'admin', 'officer']) {
      const table = role === 'student' ? 'students' : 'admins';
      const type = role === 'student' ? 'student' : 'admin';
      const user = { id: 1, role };
      await connection.execute(`DELETE FROM ${table}`);
      await connection.execute(`INSERT INTO ${table} VALUES(1,?,?),(2,?,?)`,
        ['registered@example.com', originalPassword, 'second@example.com', originalPassword]);
      if (checks) await connection.execute('DELETE FROM password_change_codes');
      await expect(user, change(undefined), false, 400);
      await expect(user, { currentPassword: 'wrong' }, true, 400);
      assert.equal(sent, undefined);
      await expect(user, request, true, 200);
      assert.equal(sent.to, 'registered@example.com');
      assert.match(sent.code, /^\d{6}$/);
      let code = sent.code;
      const [stored] = await connection.execute('SELECT * FROM password_change_codes WHERE account_id=1');
      assert.notEqual(stored[0].code_hash, code);
      assert(await auth.comparePassword(code, stored[0].code_hash));
      await expect(user, request, true, 429);
      await expect({ id: 2, role }, change(code), false, 400);
      await expect(user, change('000000'), false, 400);
      await expect(user, change(code), false, 200);
      const [accounts] = await connection.execute(`SELECT password FROM ${table} WHERE id=1`);
      assert(await auth.comparePassword('NewPassword456', accounts[0].password));
      await expect(user, { ...change(code), currentPassword: 'NewPassword456', newPassword: 'ThirdPassword789' }, false, 400);

      // A resend invalidates the old code and cannot reset the guessing budget.
      await connection.execute(`UPDATE ${table} SET password=? WHERE id=1`, [originalPassword]);
      await connection.execute('DELETE FROM password_change_codes');
      await expect(user, request, true, 200);
      const oldHash = (await connection.execute('SELECT code_hash FROM password_change_codes'))[0][0].code_hash;
      await connection.execute('UPDATE password_change_codes SET sent_at=0');
      await expect(user, request, true, 200);
      code = sent.code;
      assert.notEqual((await connection.execute('SELECT code_hash FROM password_change_codes'))[0][0].code_hash, oldHash);
      for (let i = 0; i < 5; i++) await expect(user, change('000000'), false, 400);
      await connection.execute('UPDATE password_change_codes SET sent_at=0');
      await expect(user, request, true, 200);
      await expect(user, change(sent.code), false, 429);
      await connection.execute('UPDATE password_change_codes SET sent_at=0');
      await expect(user, request, true, 429);

      await connection.execute('UPDATE password_change_codes SET window_started=0,expires_at=0');
      await expect(user, change(sent.code), false, 400);
      await expect(user, request, true, 200);
      await connection.execute(`UPDATE ${table} SET email='changed@example.com' WHERE id=1`);
      await expect(user, change(sent.code), false, 400);
      await connection.execute(`UPDATE ${table} SET email='registered@example.com',password=? WHERE id=1`,
        [await auth.hashPassword('OriginalPassword123')]);
      await expect(user, change(sent.code), false, 400);

      await connection.execute('DELETE FROM password_change_codes');
      failDelivery = true;
      await expect(user, request, true, 503);
      const [failed] = await connection.execute('SELECT code_hash,requests FROM password_change_codes WHERE account_type=?', [type]);
      assert.equal(failed[0].code_hash, null);
      assert.equal(failed[0].requests, 1);
      failDelivery = false;
      configured = false;
      await expect(user, request, true, 503);
      configured = true;
      sent = undefined;
    }
    console.log(`Passed ${checks} OTP flow checks across student, admin, and officer accounts using temporary MySQL tables. No email sent.`);
  } finally {
    // Closing the connection automatically removes all temporary tables.
    connection.destroy();
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
