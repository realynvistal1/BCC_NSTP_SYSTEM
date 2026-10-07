// Integration checks use real MySQL queries inside one rolled-back transaction.
// Controller commits are suppressed so no fixture or grade change is persisted.
const assert = require('node:assert/strict');
const db = require('../config/database');
const student = require('../controllers/studentController');
const admin = require('../controllers/sharedAdminController');
const gradesService = require('../services/gradesService');
const { ensureGradeAttempts } = require('../database/migrate-grade-attempts');

function response() {
  return { code: 200, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
}
async function invoke(handler, req) {
  const res = response(); await handler(req, res); return res;
}

async function main() {
  await require('../database/migrate-enrollment-lifecycle').ensureEnrollmentLifecycle(db);
  await ensureGradeAttempts(db);
  const connection = await db.getConnection();
  const originalExecute = db.execute, originalGetConnection = db.getConnection;
  const facade = { execute: connection.execute.bind(connection), beginTransaction: async () => {},
    commit: async () => {}, rollback: async () => {}, release() {} };
  await connection.beginTransaction();
  db.execute = facade.execute;
  db.getConnection = async () => facade;
  const stamp = Date.now();
  const at = offset => new Date(stamp + offset).toISOString();
  try {
    for (const program of ['ROTC', 'CWTS']) {
      const [insert] = await db.execute(`INSERT INTO students
        (student_id,last_name,first_name,email,password,course,year_level,nstp_component,xray_file)
        VALUES(?,?,?,?,?,?,?,?,?)`, [`TEST-${stamp}-${program}`,'Retake','Test',
        `retake-${stamp}-${program}@example.invalid`,'not-a-real-login','BS Information Technology','2nd Year',program,'saved-document']);
      const id = insert.insertId;
      const request = { user: { id, portal: 'student' }, query: {} };
      const schedule = async (level, year, open = at(-60000)) => {
        const [result] = await db.execute('INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline) VALUES(?,?,?,?,?)',
          [program,level,year,open,at(3600000)]);
        return result.insertId;
      };
      const oldSchedule = await schedule('2', `OLD-${stamp}`);
      const oneSchedule = await schedule('1', `ONE-${stamp}`);
      const record = async (level, scheduleId) => {
        const [result] = await db.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program,assignment_label) VALUES(?,?,?,'approved',?,?)",
          [id,String(scheduleId),level,program,`Original ${program} assignment`]);
        return result.insertId;
      };
      const oneRecord = await record('1',oneSchedule);
      const oldRecord = await record('2',oldSchedule);
      const encode = (level, midterm, recordId) => invoke(admin.grades, { method: 'POST', params: { program },
        body: { student_id:id,ms_level:level,midterm,final_term:midterm,enrollment_record_id:recordId,correction_reason:'Verification grade correction' } });
      assert.equal((await encode('1',2,oneRecord)).code,200);
      assert.equal((await invoke(student.dashboard,request)).body.re_enrollment.reason,'retake-grades-incomplete');
      assert.equal((await encode('2',4,oldRecord)).code,200);
      let dashboard = await invoke(student.dashboard, request);
      assert.equal(dashboard.body.re_enrollment.reason,'retake-waiting','An open MS 1 schedule must not cause MS 1 re-enrollment');
      assert.equal(dashboard.body.re_enrollment.target_level,'2');
      for (const legacyStatus of ['withdrawn','dropped']) {
        await db.execute('UPDATE student_ms_records SET status=? WHERE id=?',[legacyStatus,oldRecord]);
        const legacyDashboard=await invoke(student.dashboard,request);
        assert.equal(legacyDashboard.body.re_enrollment.mode,'retake');
        assert.equal(legacyDashboard.body.re_enrollment.target_level,'2');
        assert.equal(legacyDashboard.body.re_enrollment.reason,'retake-waiting');
        assert(!/withdrawn|dropped|return request/i.test(legacyDashboard.body.re_enrollment.message));
      }
      await db.execute("UPDATE student_ms_records SET status='approved' WHERE id=?",[oldRecord]);
      const newSchedule = await schedule('2',`NEW-${stamp}`,at(3600000));
      dashboard = await invoke(student.dashboard, request);
      assert.equal(dashboard.body.re_enrollment.eligible,false,'Upcoming enrollment is not open');
      await db.execute('UPDATE enrollment_schedules SET open_date=? WHERE id=?',[at(-60000),newSchedule]);
      assert.equal((await invoke(admin.grades,{method:'POST',params:{program},body:{student_id:id,ms_level:'1',midterm:4,final_term:4,enrollment_record_id:oneRecord}})).code,200,'Saved grades can be updated without an extra correction form');
      await encode('1',4,oneRecord);
      assert.equal((await invoke(student.dashboard,request)).body.re_enrollment.reason,'failed-grade','MS 1 must remain passed');
      await encode('1',2,oneRecord);
      await db.execute('UPDATE students SET serial_number=? WHERE id=?',['TEST-COMPLETED',id]);
      assert.equal((await invoke(student.dashboard,request)).body.re_enrollment.reason,'nstp-completed');
      await db.execute('UPDATE students SET serial_number=NULL WHERE id=?',[id]);
      dashboard = await invoke(student.dashboard,request);
      assert.equal(dashboard.body.re_enrollment.eligible,true);
      assert.equal(dashboard.body.re_enrollment.mode,'retake');
      const form = await invoke(student.reEnrollForm, request);
      assert.equal(form.body.schedule.id,newSchedule);
      assert.equal(form.body.target_level,'2');
      const body = Object.fromEntries(['religion','temporary_barangay','temporary_municipality','temporary_province',
        'permanent_barangay','permanent_municipality','permanent_province','emergency_contact_name',
        'emergency_contact_address','emergency_contact_relationship','complexion'].map(key=>[key,'Test']));
      Object.assign(body,{contact_number:'09123456789',emergency_contact_contact_number:'09123456789',
        year_level:'2nd Year',height:'170',weight:'60',blood_type:'O+',course:'BS Information Technology',nstp_component:program});
      await db.execute("UPDATE student_ms_records SET status='withdrawn' WHERE id=?",[oldRecord]);
      const legacyForm=await invoke(student.reEnrollForm,request);
      assert.equal(legacyForm.body.mode,'retake');
      assert.equal((await invoke(student.reEnroll,{...request,body})).code,200);
      await db.execute("UPDATE student_ms_records SET status='approved' WHERE id=?",[oldRecord]);
      assert.notEqual((await invoke(student.reEnroll,{...request,body})).code,200,'Duplicate retake submissions are blocked');
      const [[retake]] = await db.execute('SELECT * FROM student_ms_records WHERE student_id=? ORDER BY id DESC LIMIT 1',[id]);
      assert.equal(retake.status,'pending');
      assert.equal(String(retake.ms_level),'2');
      assert.equal(retake.schedule_id,String(newSchedule));
      assert.equal((await invoke(student.dashboard,request)).body.re_enrollment.eligible,false);
      await encode('2',2,oldRecord);
      await encode('2',4,oldRecord);
      const list = await invoke(admin.enrollments,{params:{program}});
      assert.equal(Number(list.body.find(row=>row.record_id===retake.id).is_retake),1);
      const approval = await invoke(admin.updateEnrollment,{params:{program,id:retake.id},body:{status:'approved'}});
      assert.equal(approval.code,200);
      dashboard = await invoke(student.dashboard,request);
      assert.equal(dashboard.body.re_enrollment.reason,'retake-grades-incomplete');
      assert.equal(dashboard.body.grade,null,'An ungraded retake must not display the previous failed result as its current grade');
      const session = async year => {
        const [result] = await db.execute(`INSERT INTO attendance_sessions
          (program,ms_level,school_year,mi_number,mi_type,open_date,close_date,latitude,longitude,created_by,is_advance_course)
          VALUES(?,'2',?,1,'in',?,?,0,0,'retake-test',0)`,[program,year,at(-60000),at(3600000)]);
        return result.insertId;
      };
      const oldSession = await session(`OLD-${stamp}`), newSession = await session(`NEW-${stamp}`);
      await db.execute("INSERT INTO attendance_records(student_id,attendance_session_id,status) VALUES(?,?,'absent')",[id,oldSession]);
      const sessions = await invoke(student.openSessions,request);
      assert(sessions.body.some(row=>row.id===newSession));
      assert(!sessions.body.some(row=>row.id===oldSession),'Retakes see only their enrollment school year');
      assert.equal((await invoke(student.markAttendance,{...request,body:{sessionId:oldSession,latitude:0,longitude:0}})).code,403);
      assert.equal((await invoke(student.markAttendance,{...request,body:{sessionId:newSession,latitude:0,longitude:0}})).code,200);
      const [[attendanceCount]] = await db.execute('SELECT COUNT(*) total FROM attendance_records WHERE student_id=?',[id]);
      assert.equal(attendanceCount.total,2,'Old attendance is preserved alongside new attendance');
      let adminGrades = await invoke(admin.grades,{method:'GET',params:{program}});
      assert(!adminGrades.body.grades.some(row=>row.student_id===id&&row.ms_level==='2'),'Approved retake starts ungraded');
      assert.equal(adminGrades.body.students.find(row=>row.student_id===id).ms2_record_id,retake.id);
      assert.equal(adminGrades.body.history.find(row=>row.enrollment_record_id===oldRecord).status,'Failed');
      assert.equal((await encode('2',2,oldRecord)).code,409,'A stale grade form cannot overwrite another attempt');
      const [[summary]] = await db.execute('SELECT * FROM student_grades WHERE student_id=? AND ms_level=2',[id]);
      assert.equal(summary.status,'Failed','Completion remains blocked before retake grades');
      assert.equal((await encode('2',2,retake.id)).code,200);
      const history = await invoke(student.grades,{...request,query:{history:'1'}});
      const attempts = history.body.filter(row=>String(row.ms_level)==='2');
      assert.deepEqual(attempts.map(row=>row.status),['Failed','Passed']);
      assert.equal(attempts[0].assignment_label,`Original ${program} assignment`);
      const [effective] = await db.execute('SELECT * FROM student_grades WHERE student_id=?',[id]);
      assert.equal(gradesService.isCertificateEligible(effective,'BS Information Technology'),true);
      dashboard = await invoke(student.dashboard,request);
      assert.equal(dashboard.body.re_enrollment.reason,'completed-awaiting-serial');
      assert.equal(dashboard.body.completion.completed,true);
      // A rerun must not overwrite/duplicate history or copy old failures to retakes.
      // Exercise the migration DML only (DDL would implicitly commit the fixture).
      const migrationDb = { execute: async sql => sql.startsWith('CREATE TABLE') ? [[]] : facade.execute(sql) };
      await ensureGradeAttempts(migrationDb);
      const [[count]] = await db.execute('SELECT COUNT(*) total FROM student_grade_attempts WHERE student_id=?',[id]);
      assert.equal(count.total,3);
      const [levelOneStudent] = await db.execute(`INSERT INTO students
        (student_id,last_name,first_name,email,password,course,year_level,nstp_component,xray_file)
        VALUES(?,?,?,?,?,?,?,?,?)`,[`LEVEL1-${stamp}-${program}`,'Retake','Level One',
        `level1-${stamp}-${program}@example.invalid`,'not-a-real-login','BS Information Technology','2nd Year',program,'saved-document']);
      const levelOneId=levelOneStudent.insertId;
      const oldOneSchedule=await schedule('1',`L1OLD-${stamp}`);
      const [firstOne]=await db.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program) VALUES(?,?,'1','approved',?)",[levelOneId,String(oldOneSchedule),program]);
      const encodeOne=(value,recordId)=>invoke(admin.grades,{method:'POST',params:{program},body:{student_id:levelOneId,ms_level:'1',midterm:value,final_term:value,enrollment_record_id:recordId,correction_reason:'Verification grade correction'}});
      await encodeOne(4,firstOne.insertId);
      const oneRequest={user:{id:levelOneId,portal:'student'},query:{}};
      let oneDashboard=await invoke(student.dashboard,oneRequest);
      assert.equal(oneDashboard.body.re_enrollment.target_level,'1');
      assert.equal(oneDashboard.body.re_enrollment.reason,'retake-waiting');
      const nextOneSchedule=await schedule('1',`L1NEW-${stamp}`);
      const [rejectedLevelTwo]=await db.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program,rejection_reason) VALUES(?,?,'2','rejected',?,'Failed level 1 prerequisite')",[levelOneId,String(newSchedule),program]);
      oneDashboard=await invoke(student.dashboard,oneRequest);
      assert.equal(oneDashboard.body.re_enrollment.eligible,true);
      assert.equal(oneDashboard.body.re_enrollment.target_level,'1');
      assert.equal((await invoke(student.reEnroll,{...oneRequest,body})).code,200);
      const [[oneRetake]]=await db.execute('SELECT * FROM student_ms_records WHERE student_id=? ORDER BY id DESC LIMIT 1',[levelOneId]);
      assert.equal(oneRetake.schedule_id,String(nextOneSchedule));
      assert.equal((await invoke(admin.updateEnrollment,{params:{program,id:oneRetake.id},body:{status:'approved'}})).code,200);
      oneDashboard=await invoke(student.dashboard,oneRequest);
      assert.equal(oneDashboard.body.re_enrollment.eligible,false,'Failed Level 1 summary cannot permit Level 2');
      await encodeOne(2,oneRetake.id);
      oneDashboard=await invoke(student.dashboard,oneRequest);
      assert.equal(oneDashboard.body.re_enrollment.target_level,'2');
      const oneHistory=await invoke(student.grades,{...oneRequest,query:{history:'1'}});
      assert.deepEqual(oneHistory.body.filter(row=>String(row.ms_level)==='1').map(row=>row.status),['Failed','Passed']);
      assert(oneHistory.body.some(row=>row.enrollment_record_id===rejectedLevelTwo.insertId&&row.enrollment_status==='rejected'),'The rejected Level 2 application remains in history');
      for (const removedStatus of ['withdrawn','dropped']) {
        assert.equal((await invoke(admin.updateEnrollment,{params:{program,id:oneRetake.id},body:{status:removedStatus,status_reason:'Test'}})).code,400,'Removed statuses must not be accepted');
      }
      console.log(`PASS: ${program} Level 1 retake, retained failed attempt and Level 2 prerequisite.`);
      console.log(`PASS: ${program} waiting/open notices, retake form, duplicate protection, approval, stale grade protection, preserved history and completion.`);
    }
  } finally {
    db.execute = originalExecute; db.getConnection = originalGetConnection;
    await connection.rollback(); connection.release();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
