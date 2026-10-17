const { test } = require('node:test');
const assert = require('node:assert/strict');
const samples = require('../services/sampleEnrollmentService');

test('100 distinct sample profiles cover the selected groups without exceeding enrollment limits', () => {
  const profiles = Array.from({ length:100 }, (_,index) => samples.profile('ROTC',{id:101,ms_level:'1'},index));
  assert.equal(new Set(profiles.map(({student}) => student.lastName + ' ' + student.firstName)).size,100);
  assert.equal(new Set(profiles.map(({student}) => student.studentId)).size,100);
  assert.equal(new Set(profiles.map(({student}) => student.email)).size,100);
  const groups = profiles.reduce((result,{group}) => { result[group] = (result[group] || 0) + 1; return result; },{});
  assert.deepEqual(groups,{Regular:50,Medics:15,MP:15,HQ:10,'Advance Course':10});
  for(const {student} of profiles) {
    assert.match(student.studentId,/^SAMPLE-ROTC-101-/);
    assert.match(student.email,/@example\.invalid$/);
    assert.ok(student.willingToBeMedics + student.willingToBeMilitaryPolice + student.willingToTakeAdvanceCourse <= 1);
    if(student.hasMedicalCondition) assert.equal(student.willingToBeMedics + student.willingToBeMilitaryPolice + student.willingToTakeAdvanceCourse,0);
  }
  const hq = profiles.filter(row => row.group === 'HQ');
  assert.equal(hq.filter(({student}) => student.sex === 'Male').length,5);
  assert.equal(hq.filter(({student}) => student.sex === 'Female').length,5);
  assert.notEqual(profiles[0].student.email,samples.profile('ROTC',{id:102,ms_level:'1'},0).student.email);
});

test('schedule creation generates 100 pending samples in the correct level and rolls back on failure', async () => {
  const db = require('../config/database');
  const {schedules} = require('../controllers/sharedAdminController');
  const connection = await db.getConnection();
  const original = {execute:db.execute,getConnection:db.getConnection,enabled:process.env.SAMPLE_ENROLLMENTS_ENABLED,nodeEnv:process.env.NODE_ENV};
  const command = connection.connection.promise();
  let savepoint = false, failInsert = false, failureInsertCount = 0;
  const fixtureSchedules = [];
  const wrapped = {
    execute: async (sql,params) => {
      if (failInsert && sql.includes('INSERT INTO students(') && ++failureInsertCount === 3) throw new Error('Simulated sample insert failure');
      const result = await connection.execute(sql,params);
      if(sql.startsWith('INSERT INTO enrollment_schedules')) fixtureSchedules.push(result[0].insertId);
      return result;
    },
    beginTransaction: async () => { await command.query('SAVEPOINT sample_action'); savepoint = true; },
    commit: async () => { await command.query('RELEASE SAVEPOINT sample_action'); savepoint = false; },
    rollback: async () => { if(savepoint) { await command.query('ROLLBACK TO SAVEPOINT sample_action'); await command.query('RELEASE SAVEPOINT sample_action'); savepoint = false; } },
    release() {},
  };
  await connection.beginTransaction();
  db.getConnection = async () => wrapped;
  db.execute = async (sql,params) => {
    const result = await connection.execute(sql,params);
    // Isolate progression validation from the user's real schedules.
    if(sql.includes('FROM enrollment_schedules WHERE program=?')) result[0] = result[0].filter(row => fixtureSchedules.includes(Number(row.id)));
    return result;
  };
  process.env.SAMPLE_ENROLLMENTS_ENABLED = 'true'; process.env.NODE_ENV = 'development';
  async function create(level,year) {
    const response = {code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};
    await schedules({method:'POST',params:{program:'rotc'},body:{ms_level:level,year,open_date:'2000-01-01T08:00:00',deadline:'2000-02-01T17:00:00'}},response);
    return response;
  }
  try {
    const year = '2096-2097';
    const [[existing]] = await connection.execute("SELECT COUNT(*) total FROM enrollment_schedules WHERE program='ROTC' AND year=?",[year]);
    assert.equal(Number(existing.total),0,'Sample verification year must be unused.');
    const first = await create('1',year);
    assert.equal(first.code,200,JSON.stringify(first.body));
    assert.equal(first.body.sample_students,100);
    const firstId = fixtureSchedules.at(-1);
    const [[counts]] = await connection.execute(`SELECT COUNT(*) total,SUM(r.status='pending') pending,SUM(r.ms_level='1') correct_level,
      SUM(s.willing_to_be_medics) medics,SUM(s.willing_to_be_military_police) mp,SUM(s.has_medical_condition) hq,
      SUM(s.willing_to_take_advance_course) advance,SUM(r.assignment_company IS NOT NULL OR r.assignment_special_unit IS NOT NULL) assigned
      FROM student_ms_records r JOIN students s ON s.id=r.student_id WHERE CAST(r.schedule_id AS UNSIGNED)=?`,[firstId]);
    for(const field of ['total','pending','correct_level']) assert.equal(Number(counts[field]),100);
    assert.equal(Number(counts.medics),15); assert.equal(Number(counts.mp),15);
    assert.equal(Number(counts.hq),10); assert.equal(Number(counts.advance),10); assert.equal(Number(counts.assigned),0);
    const second = await create('2',year);
    assert.equal(second.code,200,JSON.stringify(second.body));
    const secondId = fixtureSchedules.at(-1);
    const [[secondCounts]] = await connection.execute(`SELECT COUNT(*) total,SUM(r.ms_level='2') correct_level,
      SUM(g.status='Passed' AND g.midterm IS NOT NULL AND g.final_term IS NOT NULL) prerequisites
      FROM student_ms_records r LEFT JOIN student_grades g ON g.student_id=r.student_id AND g.program=r.program AND g.ms_level='1'
      WHERE CAST(r.schedule_id AS UNSIGNED)=?`,[secondId]);
    for(const field of ['total','correct_level','prerequisites']) assert.equal(Number(secondCounts[field]),100);
    failInsert = true;
    const failed = await create('1','2097-2098');
    assert.equal(failed.code,500);
    const [[rolledBack]] = await connection.execute("SELECT COUNT(*) total FROM enrollment_schedules WHERE program='ROTC' AND year='2097-2098'");
    assert.equal(Number(rolledBack.total),0);
    const [[noOrphans]] = await connection.execute('SELECT COUNT(*) total FROM students WHERE email LIKE ?', [`sample.rotc.${fixtureSchedules.at(-1)}.%@example.invalid`]);
    assert.equal(Number(noOrphans.total),0);
    failInsert = false;
    process.env.NODE_ENV = 'production';
    assert.equal(samples.settings().enabled,false);
    const noSamples = await samples.create({execute(){throw new Error('Production must not generate samples');}},{id:999,program:'ROTC',ms_level:'1'});
    assert.equal(noSamples.count,0);
    process.env.NODE_ENV = 'development'; process.env.SAMPLE_ENROLLMENTS_ENABLED = 'false';
    assert.equal(samples.settings().enabled,false);
  } finally {
    db.execute = original.execute; db.getConnection = original.getConnection;
    if(original.enabled === undefined) delete process.env.SAMPLE_ENROLLMENTS_ENABLED; else process.env.SAMPLE_ENROLLMENTS_ENABLED = original.enabled;
    if(original.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.nodeEnv;
    await connection.rollback(); connection.release(); await db.end();
  }
});
