const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('controllers/sharedAdminController.js', 'utf8');
const handler = source.slice(source.indexOf('exports.schedules ='), source.indexOf('exports.enrollments ='));
const writes = [];
const connection = {
  beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
  execute: async (sql, values) => { writes.push({ sql, values }); return [{ insertId: 1 }]; },
};
const context = vm.createContext({
  exports: {}, process: { env: { AUTO_SEED_LEVEL1_TEST_STUDENTS: 'true' } },
  program: req => req.program, levelPrefix: p => p === 'ROTC' ? 'MS' : 'CWTS',
  db: { execute: async () => [[]], getConnection: async () => connection },
});
vm.runInContext(handler, context);
(async () => {
  for (const program of ['ROTC', 'CWTS']) {
    let result;
    const res = { status(code) { throw Error(`Unexpected HTTP ${code}`); }, json(value) { result = value; } };
    await context.exports.schedules({ method: 'POST', program, body: {
      ms_level: '1', year: '2026-2027', open_date: '2026-10-15T08:00', deadline: '2026-10-20T17:00',
    } }, res);
    assert.match(result.message, /created successfully/);
  }
  assert.equal(writes.length, 2);
  assert(writes.every(write => write.sql.startsWith('INSERT INTO enrollment_schedules')));
  console.log('PASS: ROTC and CWTS schedule creation writes only schedules even with the old auto-seed flag enabled.');
})().catch(error => { console.error(error); process.exitCode = 1; });
