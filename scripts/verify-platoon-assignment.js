const assert = require('node:assert/strict');
const db = require('../config/database');
const { autoAssign, roster } = require('../controllers/sharedAdminController');

const closed = { id: 11, year: '2026-2027', deadline: '2020-01-01', platoons_assigned_at: null };
async function run(schedule, {
  fail = false,
  year = '2026-2027',
  students = [{ id: 1, sex: 'Male', last_name: 'Test' }],
} = {}) {
  const events = [];
  const assignments = [];
  db.getConnection = async () => ({
    beginTransaction: async () => events.push('begin'),
    commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'),
    release: () => events.push('release'),
    execute: async (sql, params) => {
      if (sql.startsWith('SELECT * FROM enrollment_schedules')) {
        assert.match(sql, /FOR UPDATE/);
        return [schedule ? [schedule] : []];
      }
      if (sql.includes("SUM(status='pending')")) return [[{ pending: 0 }]];
      if (sql.includes('FROM students s')) return [students];
      if (sql.startsWith('UPDATE students')) {
        assignments.push({ id: params.at(-1), unit: sql.includes('special_unit=?') ? params[0] : null });
        events.push(sql.includes('special_unit=?')
          ? 'special'
          : sql.includes("platoon='Advance Course'")
            ? 'advance'
            : 'battalion');
        if (fail) throw new Error('Simulated write failure');
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE student_ms_records smr')) return [{ affectedRows: 1 }];
      if (sql.startsWith('UPDATE enrollment_schedules')) { events.push('mark'); return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await autoAssign({ params: { program: 'rotc' }, body: { ms_level: '1', school_year: year }, query: {} }, res);
  return { ...res, events, assignments };
}

async function runCwts(schedule, { students = [], pending = 0, fail = false, companies = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot'] } = {}) {
  const events = [];
  const assignments = [];
  db.getConnection = async () => ({
    beginTransaction: async () => events.push('begin'),
    commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'),
    release: () => events.push('release'),
    execute: async (sql, params) => {
      if (sql.includes('FROM cwts_companies')) return [companies.map(name => ({name}))];
      if (sql.startsWith('SELECT * FROM enrollment_schedules')) return [schedule ? [schedule] : []];
      if (sql.includes("SUM(status='pending')")) return [[{ pending }]];
      if (sql.includes('FROM students s')) {
        assert.match(sql, /ORDER BY s\.last_name,s\.first_name,s\.middle_name,s\.student_id,s\.id/);
        return [students];
      }
      if (sql.startsWith('UPDATE students')) {
        if (fail) throw new Error('Simulated CWTS write failure');
        assignments.push({ company: params[0], studentId: params[2] });
        events.push('company');
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE student_ms_records smr')) return [{ affectedRows: 1 }];
      if (sql.startsWith('UPDATE enrollment_schedules')) { events.push('mark'); return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected CWTS SQL: ${sql}`);
    },
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await autoAssign({ params: { program: 'cwts' }, body: { ms_level: '1', school_year: '2026-2027' }, query: {} }, res);
  return { ...res, events, assignments };
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
  assert.deepEqual(success.events, ['begin', 'battalion', 'mark', 'commit', 'release']);

  const combined = await run(closed, { students: [
    { id: 1, sex: 'Male', last_name: 'Regular' },
    { id: 2, sex: 'Female', last_name: 'Regular' },
    { id: 3, sex: 'Female', last_name: 'Medic', willing_to_be_medics: 1 },
    { id: 4, sex: 'Male', last_name: 'Medical', has_medical_condition: 1 },
    { id: 5, sex: 'Male', last_name: 'Police', willing_to_be_military_police: 1 },
    { id: 6, sex: 'Female', last_name: 'Advance', willing_to_take_advance_course: 1 },
  ] });
  assert.equal(combined.code, 200);
  assert.equal(combined.body.assigned, 6);
  assert.equal(combined.body.battalionAssigned, 2);
  assert.equal(combined.body.advanceAssigned, 1);
  assert.equal(combined.body.specialAssigned, 3);
  assert.deepEqual(combined.events, [
    'begin', 'special', 'special', 'special', 'advance',
    'battalion', 'battalion', 'mark', 'commit', 'release',
  ]);
  for (const unit of ['Medics', 'MP']) {
    for (const count of [50, 51, 55]) {
      const students = Array.from({ length: count }, (_, i) => ({
        id: i + 1, sex: i % 2 ? 'Female' : 'Male',
        last_name: 'Student ' + String(i + 1).padStart(3, '0'),
        willing_to_be_medics: unit === 'Medics' ? 1 : 0,
        willing_to_be_military_police: unit === 'MP' ? 1 : 0,
        willing_to_take_advance_course: 1,
      })).reverse();
      const result = await run(closed, { students });
      assert.equal(result.code, 200);
      assert.equal(result.body.specialAssigned, 50);
      assert.equal(result.body.battalionAssigned, count - 50);
      assert.equal(result.body.advanceAssigned, 0);
      assert.equal(result.body.overflow[unit], count - 50);
      assert.deepEqual(result.assignments.filter(a => a.unit === unit).map(a => a.id), Array.from({ length: 50 }, (_, i) => i + 1));
      assert.deepEqual(result.assignments.filter(a => !a.unit).map(a => a.id).sort((a,b)=>a-b), Array.from({ length: count - 50 }, (_, i) => i + 51));
    }
  }
  const log = console.error;
  let failure;
  try { console.error = () => {}; failure = await run(closed, { fail: true }); } finally { console.error = log; }
  assert.equal(failure.code, 500);
  assert.deepEqual(failure.events, ['begin', 'battalion', 'rollback', 'release']);

  const cwtsStudents = Array.from({ length: 62 }, (_, index) => ({
    id: index + 1,
    student_id: String(index + 1).padStart(10, '0'),
    last_name: `Student ${String(index + 1).padStart(3, '0')}`,
    first_name: 'Test',
  }));
  const cwtsPending = await runCwts(closed, { students: cwtsStudents, pending: 1 });
  assert.equal(cwtsPending.code, 409);
  assert.deepEqual(cwtsPending.events, ['begin', 'rollback', 'release']);
  const cwtsSuccess = await runCwts(closed, { students: cwtsStudents });
  assert.equal(cwtsSuccess.code, 200);
  assert.equal(cwtsSuccess.body.assigned, 62);
  assert.deepEqual(cwtsSuccess.assignments.slice(0, 60).map((entry) => entry.company), Array(60).fill('Alpha'));
  assert.deepEqual(cwtsSuccess.assignments.slice(60).map((entry) => entry.company), ['Bravo', 'Bravo']);
  assert.deepEqual(cwtsSuccess.events, ['begin', ...Array(62).fill('company'), 'mark', 'commit', 'release']);

  const expanded = await runCwts(closed, { students:Array.from({length:361},(_,i)=>({id:i+1,last_name:'Student',first_name:String(i),student_id:String(i)})), companies:['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf'] });
  assert.equal(expanded.code,200);
  assert.equal(expanded.assignments.at(-1).company,'Golf');
  assert.equal(expanded.assignments.filter(a=>a.company==='Alpha').length,60);
  const originalExecute = db.execute;
  let rosterQueryChecked = false;
  db.execute = async (sql, params) => {
    if (sql.includes('FROM enrollment_schedules')) return [[closed]];
    if (sql.includes('FROM students s')) {
      assert.ok(sql.includes('smr.assignment_company AS rotc_company'));
      assert.equal(params[0], 'ROTC');
      assert.equal(params[1], 'ROTC');
      rosterQueryChecked = true;
      return [[]];
    }
    throw new Error(`Unexpected roster SQL: ${sql}`);
  };
  const rosterResponse = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await roster({ params: { program: 'rotc' }, query: { all_cycles: '1' } }, rosterResponse);
  db.execute = originalExecute;
  assert.equal(rosterResponse.code, 200);
  assert.ok(rosterQueryChecked);

  console.log('PASS: closed-only atomic assignment covers ROTC groups and alphabetical CWTS companies; cycle assignment snapshots are used; Medics/MP overflow follows alphabetical selection.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
