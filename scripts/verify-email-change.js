// Real SQL against connection-local temporary tables; email delivery is mocked.
const assert = require('node:assert/strict');
const db = require('../config/database');
const auth = require('../services/authService');

async function main() {
  const connection = await db.getConnection();
  let sent;
  let failMail = false;
  const mock = (path, exports) => { require.cache[require.resolve(path)] = { exports }; };
  try {
    await connection.execute('CREATE TEMPORARY TABLE admins (id INT PRIMARY KEY,email VARCHAR(255) UNIQUE,password VARCHAR(255),record_marker VARCHAR(30)) ENGINE=InnoDB');
    await connection.execute('CREATE TEMPORARY TABLE students (id INT PRIMARY KEY,email VARCHAR(255)) ENGINE=InnoDB');
    const hash = await auth.hashPassword('CurrentPassword123');
    await connection.execute('INSERT INTO admins VALUES(1,?,?,?),(2,?,?,?)', ['old@example.com', hash, 'keep-records', 'taken@example.com', hash, 'other-records']);
    await connection.execute("INSERT INTO students VALUES(1,'student@example.com')");
    mock('../config/database', {
      execute: (sql, values) => connection.execute(sql.replace('CREATE TABLE', 'CREATE TEMPORARY TABLE'), values),
      getConnection: async () => ({
        execute: connection.execute.bind(connection), beginTransaction: connection.beginTransaction.bind(connection),
        commit: connection.commit.bind(connection), rollback: connection.rollback.bind(connection), release() {},
      }),
    });
    mock('../services/emailService', {
      hasEmailConfig: () => true,
      async sendEmailChangeCode(message) { if (failMail) throw new Error('Mail failure'); sent = message; },
    });
    const service = require('../services/emailChangeService');
    const user = { id: 1, role: 'admin' };
    const body = { currentPassword: 'CurrentPassword123', newEmail: 'new@example.com' };
    let checks = 0;
    const expect = async (action, code, status, overrides = {}, account = user) => {
      const response = await service.run(account, { ...body, code, ...overrides }, action, 'Test Portal');
      assert.equal(response.status, status, response.message);
      checks++;
      return response;
    };
    const state = async () => JSON.parse((await connection.execute('SELECT state_json FROM admin_email_changes WHERE admin_id=1'))[0][0].state_json);
    const mutate = async changes => connection.execute('UPDATE admin_email_changes SET state_json=? WHERE admin_id=1', [JSON.stringify({ ...await state(), ...changes })]);
    await expect('request-old', undefined, 403, {}, { id: 1, role: 'student' });
    await expect('request-old', undefined, 400, { newEmail: 'invalid' });
    await expect('confirm', '123456', 400);
    await expect('request-new', undefined, 400);
    await expect('request-old', undefined, 400, { currentPassword: 'wrong' });
    await expect('request-old', undefined, 400, { newEmail: 'taken@example.com' });
    await expect('request-old', undefined, 400, { newEmail: 'student@example.com' });
    await expect('request-old', undefined, 400, { newEmail: 'OLD@example.com' });
    await expect('request-old', undefined, 200);
    assert.equal(sent.to, 'old@example.com');
    const oldCode = sent.code;
    assert.notEqual((await state()).codeHash, oldCode);
    await expect('request-old', undefined, 429);
    await expect('confirm', oldCode, 400);
    await expect('verify-old', '000000', 400);
    await expect('verify-old', oldCode, 400, { newEmail: 'swapped@example.com' });
    await expect('verify-old', oldCode, 400, {}, { id: 2, role: 'admin' });
    failMail = true;
    await expect('verify-old', oldCode, 503);
    assert.equal((await state()).phase, 'old');
    failMail = false;
    await mutate({ newSentAt: 0 });
    await expect('verify-old', oldCode, 200);
    assert.equal(sent.to, 'new@example.com');
    assert.equal((await connection.execute('SELECT email FROM admins WHERE id=1'))[0][0].email, 'old@example.com');
    await expect('verify-old', oldCode, 400);
    await expect('request-new', undefined, 429);
    await mutate({ newSentAt: 0 });
    await expect('request-new', undefined, 200);
    const newCode = sent.code;
    await expect('confirm', '000000', 400);
    await expect('confirm', newCode, 200);
    const [accounts] = await connection.execute('SELECT * FROM admins WHERE id=1');
    assert.deepEqual(accounts[0], { id: 1, email: 'new@example.com', password: hash, record_marker: 'keep-records' });
    assert.equal((await state()).codeHash, null);
    await expect('confirm', newCode, 400);

    await connection.execute("UPDATE admins SET email='old@example.com' WHERE id=1");
    await connection.execute('DELETE FROM admin_email_changes');
    await expect('request-old', undefined, 200, {}, { id: 1, role: 'officer' });
    await mutate({ expires: 0 });
    await expect('verify-old', sent.code, 400);
    await mutate({ oldSentAt: 0 });
    await expect('request-old', undefined, 200);
    for (let i = 0; i < 5; i++) await expect('verify-old', '000000', 400);
    await expect('verify-old', sent.code, 429);
    await expect('request-old', undefined, 429);
    await mutate({ window: 0, oldSentAt: 0 });
    await expect('request-old', undefined, 200);
    await connection.execute('UPDATE admins SET password=? WHERE id=1', [await auth.hashPassword('CurrentPassword123')]);
    await expect('verify-old', sent.code, 400);
    console.log(`Passed ${checks} email-change checks. Both inboxes required; account ID, password, and record marker preserved. No email sent.`);
  } finally {
    connection.destroy();
    await db.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
