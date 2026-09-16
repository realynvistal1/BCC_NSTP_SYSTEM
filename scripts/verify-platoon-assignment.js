const assert = require('node:assert/strict');
const db = require('../config/database');
const { autoAssign } = require('../controllers/sharedAdminController');

const closed = { id: 11, year: '2026-2027', deadline: '2020-01-01', platoons_assigned_at: null };
async function run(schedule, { fail = false, year = '2026-2027' } = {}) {
  const events = [];
  db.getConnection = async () => ({
    beginTransaction: async () => events.push('begin'),
    commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'),
    release: () => events.push('release'),
    execute: async (sql) => {
      if (sql.startsWith('SELECT * FROM enrollment_schedules')) {
        assert.match(sql, /FOR UPDATE/);
        return [schedule ? [schedule] : []];
      }
      if (sql.includes('FROM students s')) return [[{ id: 1, sex: 'Male', last_name: 'Test' }]];
      if (sql.startsWith('UPDATE students')) {
        events.push('assign');
        if (fail) throw new Error('Simulated write failure');
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE enrollment_schedules')) { events.push('mark'); return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await autoAssign({ params: { program: 'rotc' }, body: { ms_level: '1', school_year: year }, query: {} }, res);
  return { ...res, events };
}

(async () => {
  for (const schedule of [null, { ...closed, deadline: '2999-01-01' }, { ...closed, deadline: 'invalid' }]) {
    const result = await run(schedule);
    assert.equal(result.code, 400);
    assert.deepEqual(result.events, ['begin', 'rollback', 'release']);
  }
  const repeated = await run({ ...closed, platoons_assigned_at: '2026-09-13' });
  assert.equal(repeated.code, 409);
  assert.ok(!repeated.events.includes('assign'));
  const missingYear = await run(closed, { year: '' });
  assert.equal(missingYear.code, 400);
  assert.deepEqual(missingYear.events, []);
  const success = await run(closed);
  assert.equal(success.code, 200);
  assert.equal(success.body.assigned, 1);
  assert.deepEqual(success.events, ['begin', 'assign', 'mark', 'commit', 'release']);
  const log = console.error;
  let failure;
  try { console.error = () => {}; failure = await run(closed, { fail: true }); } finally { console.error = log; }
  assert.equal(failure.code, 500);
  assert.deepEqual(failure.events, ['begin', 'assign', 'rollback', 'release']);
  console.log('PASS: closed-only assignment, missing/invalid schedule, repeat prevention, required year, atomic success, and failure rollback.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
