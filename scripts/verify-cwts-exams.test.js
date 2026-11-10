const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const exam = require('../services/cwtsExamService');
const db = require('../config/database');
const controller = require('../controllers/cwtsExamController');
const admin = require('../controllers/sharedAdminController');
const student = { student_id: '123456-2026', first_name: 'Juan', middle_name: 'Santos', last_name: 'Dela Cruz', sex: 'Male', course: 'BS Information Technology' };
const row = { ...student, result: 'passed', updated_by: 'admin@example.test', updated_at: '2026-11-04' };
const cycle = { id: 9, program: 'CWTS', ms_level: '1', year: '2026-2027', open_date: '2000-01-01', deadline: '2999-01-01' };
function file(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Student ID','First Name','Middle Name','Last Name','Sex','Course','Result'], ...rows]), 'Results');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return { originalname: 'results.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer, size: buffer.length };
}
const validFile = () => file([[student.student_id, student.first_name, student.middle_name, student.last_name, 'Male', 'BSIT', 'Passed']]);
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }

test('Excel validation accepts course aliases and rejects invalid/duplicate rows without dropping them', () => {
  const parsed = exam.parseFile(validFile());
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows[0].course, student.course);
  const bad = exam.parseFile(file([[student.student_id,'Juan','','Cruz','Male','BSIT','Passed'],[student.student_id,'Juan','','Cruz','Female','BSED','Unknown']]));
  assert.match(bad.errors.join(' '), /duplicate/);
  assert.match(bad.errors.join(' '), /BSED/);
  assert.match(bad.errors.join(' '), /Passed or Failed/);
  assert.throws(() => exam.parseFile(null), error => error.status === 400);
  assert.throws(() => exam.parseFile(file([])), /file is empty/);
  assert.equal(exam.parseFile(file([[student.student_id,'Juan','','Cruz',' female ','BSIT','Passed']])).rows[0].sex,'Female');
  assert.match(exam.parseFile(file([[student.student_id,'Juan','','Cruz','','BSIT','Passed']])).errors.join(' '),/Sex must be Male or Female/);
  assert.match(exam.parseFile(file([[student.student_id,'Juan','','Cruz','Other','BSIT','Passed']])).errors.join(' '),/Sex must be Male or Female/);
});
test('Eligibility requires correct schedule, passing result and matching identity/course; case and whitespace are normalized', async () => {
  const calls = [];
  const connection = { execute: async (sql, params) => { calls.push({sql, params}); return [[row]]; } };
  assert.equal((await exam.eligibility(connection, 9, {...student,first_name:' JUAN '})).eligible, true);
  assert.deepEqual(calls[0].params, [9, student.student_id]);
  assert.equal((await exam.eligibility(connection, 9, {...student,course:'BSTM'})).eligible, false);
  assert.equal((await exam.eligibility(connection, 9, {...student,sex:'Female'})).eligible, false);
  assert.equal((await exam.eligibility(connection, 9, {...student,middle_name:'Different'})).eligible, false);
  assert.equal((await exam.eligibility(connection, 9, {...student,middle_name:' SANTOS '})).eligible, true);
  assert.equal((await exam.eligibility({execute:async()=>[[{...row,middle_name:''}]]},9,{...student,middle_name:''})).eligible,true);
  assert.equal((await exam.eligibility({execute:async()=>[[{...row,result:'failed'}]]},9,student)).eligible,false);
  assert.equal((await exam.eligibility({execute:async()=>[[]]},9,student)).eligible,false);
  const injection = "' OR 1=1 --";
  await exam.eligibility(connection,9,{...student,student_id:injection});
  assert(!calls.at(-1).sql.includes(injection));
  assert.equal(calls.at(-1).params[1],injection);
});
test('CWTS 2 and ROTC bypass exam queries entirely', async () => {
  const connection = { execute: async () => { throw Error('Must not query exam results'); } };
  await exam.requireEligible(connection,{...cycle,ms_level:'2'},student);
  await exam.requireEligible(connection,{...cycle,program:'ROTC'},student);
});
test('Public eligibility response does not expose imported personal details', async () => {
  const original = db.execute;
  db.execute = async sql => sql.includes('enrollment_schedules') ? [[cycle]] : [[row]];
  try {
    const res = response(); await controller.check({body:student},res);
    assert.equal(res.body.eligible,true);
    assert.deepEqual(Object.keys(res.body).sort(),['eligible','message']);
  } finally { db.execute = original; }
});
test('CWTS 1 schedule and results save together; missing/empty files and failed result writes cannot leave a schedule', async () => {
  const originalExecute=db.execute,originalConnection=db.getConnection;
  const samples=require('../services/sampleEnrollmentService'),originalSamples=samples.create;
  samples.create=async()=>({count:0,groups:[]});
  try {
    for (const mode of ['missing','empty','valid','write-failure']) {
      let opened=false,committed=false,rolledBack=false;
      const writes=[];
      db.execute=async()=>[[]];
      db.getConnection=async()=>{opened=true;return {
        beginTransaction:async()=>{},commit:async()=>{committed=true;},rollback:async()=>{rolledBack=true;},release(){},
        execute:async(sql,params)=>{
          if(sql.startsWith('SELECT'))return [[]];
          if(mode==='write-failure'&&sql.startsWith('INSERT INTO cwts_exam_results'))throw Error('Simulated failure');
          writes.push({sql,params});return [{insertId:91,affectedRows:1}];
        }
      };};
      const res=response();await admin.schedules({method:'POST',params:{program:'cwts'},user:{email:'admin@example.test'},
        body:{ms_level:'1',year:'2030-2031',open_date:'2030-06-01T08:00:00',deadline:'2030-06-30T17:00:00'},
        file:mode==='missing'?undefined:mode==='empty'?file([]):validFile()},res);
      if(mode==='missing'||mode==='empty') {assert.equal(res.code,400);assert.equal(opened,false);}
      else if(mode==='valid') {
        assert.equal(res.code,200,JSON.stringify(res.body));assert(committed);assert(!rolledBack);
        assert(writes.some(write=>write.sql.includes('cwts_exam_results')&&write.params[0]===91));
        assert(writes.some(write=>write.sql.includes('cwts_exam_imports')));
      } else {assert.equal(res.code,500);assert(rolledBack);assert(!committed);}
    }
  } finally {db.execute=originalExecute;db.getConnection=originalConnection;samples.create=originalSamples;}
});
test('Import locks the CWTS 1 schedule, rejects stale previews, and logs confirmed corrections atomically', async () => {
  const original = db.getConnection;
  for (const stale of [true,false]) {
    const writes=[]; let committed=false,rolledBack=false,released=false;
    db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{committed=true;},rollback:async()=>{rolledBack=true;},release(){released=true;},execute:async(sql,params)=>{
      if(sql.includes('FROM enrollment_schedules')) { assert.match(sql,/FOR UPDATE/); return [[cycle]]; }
      if(sql.includes('FROM cwts_exam_results'))return [[row]];
      writes.push({sql,params});return [{}];
    }});
    try {
      const res=response();await controller.import({params:{id:9},body:{revision:stale?'stale':exam.revision([row])},file:validFile(),user:{email:'admin@example.test'}},res);
      assert.equal(res.code,stale?409:200);
      assert.equal(committed,!stale);assert.equal(rolledBack,stale);assert(released);
      assert.equal(writes.length,stale?0:2);
      if(!stale) { assert.match(writes[1].sql,/cwts_exam_imports/); assert.deepEqual(JSON.parse(writes[1].params[3]),[row]); }
    } finally { db.getConnection=original; }
  }
});
test('Single and bulk approval refuse missing, failed and mismatched CWTS 1 exam results', async () => {
  const originalExecute=db.execute,originalConnection=db.getConnection;
  for(const result of [null,{...row,result:'failed'},{...row,last_name:'Another'}]) {
    let writes=0;
    const record={id:1,student_id:3,schedule_id:9,ms_level:'1',status:'pending',program:'CWTS'};
    db.execute=async sql=>sql.includes('pendingSummary')||sql.includes('COUNT(*)')?[[{total:1}]]:[[record]];
    db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async sql=>{
      if(sql.includes('enrollment_schedules'))return [[cycle]];
      if(sql.includes('SELECT status'))return [[record]];
      if(sql.includes('FROM students s'))return [[student]];
      if(sql.includes('cwts_exam_results'))return [result?[result]:[]];
      if(sql.startsWith('UPDATE'))writes++;
      return [[]];
    }});
    try {
      const single=response();await admin.updateEnrollment({params:{program:'cwts',id:'1'},body:{status:'approved'}},single);
      assert.equal(single.code,409,JSON.stringify(single.body));assert.equal(writes,0);
      const bulk=response();await admin.bulkApprove({params:{program:'cwts'},body:{ids:[1]}},bulk);
      assert.equal(bulk.code,200,JSON.stringify(bulk.body));assert.equal(bulk.body.approved,0);assert.equal(writes,0);
    } finally {db.execute=originalExecute;db.getConnection=originalConnection;}
  }
});
