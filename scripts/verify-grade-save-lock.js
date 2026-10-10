const assert = require('node:assert/strict');
const db = require('../config/database');
const controller = require('../controllers/sharedAdminController');

async function verify(program, alreadySaved) {
  const record = { id: 20, student_id: 7, ms_level: '2', program, status: 'approved', schedule_id: 5 };
  let writes = 0, rolledBack = false, committed = false, released = false;
  db.execute = async sql => {
    if (sql.includes('student_ms_records')) return [[record]];
    if (sql.includes('enrollment_schedules')) return [[{ year: '2027-2028' }]];
    return [[{ course: 'BS Information Technology' }]];
  };
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql, values) => {
      if (sql.includes('FROM student_ms_records')) return [[record]];
      if (sql.includes('FROM student_grade_attempts')) {
        assert.equal(values[0],20,'Lock belongs to this enrollment attempt');
        return [alreadySaved ? [{ id: 30 }] : []];
      }
      if (sql.includes('INSERT INTO')) {
        writes += 1;
        if (sql.includes('student_grade_attempts')) {
          assert(!sql.includes('ON DUPLICATE KEY UPDATE'),'Saved attempts must never be overwritten');
          assert.equal(values[0],20);
        }
        return [{ affectedRows: 1 }];
      }
      return [[{ id: 7 }]];
    },
    rollback: async () => { rolledBack = true; },
    commit: async () => { committed = true; },
    release: () => { released = true; },
  });
  let code = 200, body;
  const res = { status(value) { code = value; return this; }, json(value) { body = value; return this; } };
  await controller.grades({ method: 'POST', params: { program }, body: {
    student_id: 7, ms_level: '2', enrollment_record_id: 20,
    school_year: '2027-2028', midterm: 4, final_term: 4,
  } }, res);
  assert(released);
  if (alreadySaved) {
    assert.equal(code,409);
    assert.match(body.message,/cannot be edited/);
    assert.equal(writes,0);
    assert(rolledBack && !committed);
  } else {
    assert.equal(code,200);
    assert.equal(body.status,'Failed');
    assert.equal(writes,2);
    assert(committed && !rolledBack);
  }
}

(async () => {
  try {
    for (const program of ['ROTC','CWTS']) {
      await verify(program,false);
      await verify(program,true);
      console.log(`PASS: ${program} allows a new attempt and rejects changes to saved grades.`);
    }
  } finally { await db.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
