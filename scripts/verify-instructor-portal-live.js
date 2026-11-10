// Exercise the real database with one outer transaction; all test records are rolled back.
require('dotenv').config({quiet:true});
const assert=require('node:assert/strict'),db=require('../config/database'),accounts=require('../services/instructorPortalService'),assignments=require('../services/gradeInstructorService'),grades=require('../services/instructorGradeService');
(async()=>{
 const c=await db.getConnection();await c.beginTransaction();
 const facade={execute:c.execute.bind(c),getConnection:async()=>({execute:c.execute.bind(c),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}})};
 const stamp=Date.now(),actor='portal-test@example.invalid';
 try{
  const buffer=await require('sharp')({create:{width:100,height:130,channels:3,background:'#aacccc'}}).png().toBuffer();
  const firstYear=7000+(stamp%1000),schoolYear=`${firstYear}-${firstYear+1}`;
  const cycles={};
  for(const program of ['ROTC','CWTS']){
   const [added]=await c.execute('INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline,cwts_company_setup) VALUES(?,?,?,?,?,?)',[program,'1',schoolYear,'2026-01-01','2026-12-31',program==='CWTS'?JSON.stringify([{name:'Alpha',capacity:10},{name:'Bravo',capacity:10}]):null]);cycles[program]=added.insertId;
  }
  const body={first_name:'Test',middle_name:'Portal',last_name:'Instructor',email:`cwts-${stamp}@example.invalid`,program:'CWTS',school_year:schoolYear,level:'1',password:'Testing123!',confirm_password:'Testing123!',profile_photo:'data:image/png;base64,'+buffer.toString('base64')};
  assert((await accounts.registrationYears(facade,'CWTS','1')).includes(schoolYear));
  assert(!(await accounts.registrationYears(facade,'CWTS','2')).includes(schoolYear));
  await assert.rejects(accounts.register(facade,{...body,level:'2'}),e=>e.status===400);
  await assert.rejects(accounts.register(facade,{...body,school_year:'1000-1001'}),e=>e.status===400);
  const cwts=await accounts.register(facade,body),rotc=await accounts.register(facade,{...body,program:'ROTC',email:`rotc-${stamp}@example.invalid`});
  assert.equal((await accounts.findLogin(facade,body.email)).status,'pending');
  assert((await accounts.findLogin(facade,body.email)).password!==body.password);
  await assert.rejects(accounts.register(facade,{...body,program:'ROTC'}),e=>e.status===409);
  await assert.rejects(assignments.assign(facade,'CWTS',{schedule_id:cycles.CWTS,instructor_id:cwts.id,company:'Alpha'},actor),/approved/);
  for(const [program,a] of [['CWTS',cwts],['ROTC',rotc]])await accounts.review(facade,program,a.id,{decision:'approved'},actor);
  await assert.rejects(accounts.review(facade,'CWTS',cwts.id,{decision:'approved'},actor),e=>e.status===409);
  const cwtsUser={id:cwts.id,program:'CWTS',session_version:1,email:body.email},rotcUser={id:rotc.id,program:'ROTC',session_version:1,email:`rotc-${stamp}@example.invalid`};
  assert.equal((await grades.assignments(facade,cwtsUser)).length,0);
  const alpha=await assignments.assign(facade,'CWTS',{schedule_id:cycles.CWTS,instructor_id:cwts.id,company:'Alpha'},actor);
  const rotcAssignment=await assignments.assign(facade,'ROTC',{schedule_id:cycles.ROTC,instructor_id:rotc.id},actor);
  const records={};
  for(const [scope,program,company] of [['alpha','CWTS','Alpha'],['bravo','CWTS','Bravo'],['rotc','ROTC',null]]){
   const [s]=await c.execute('INSERT INTO students(student_id,first_name,last_name,email,password,nstp_component,course) VALUES(?,?,?,?,?,?,?)',[`test-${scope}-${stamp}`,'Test',scope,`${scope}-${stamp}@example.invalid`,'test-only-hash',program,'BS Information Technology']);
   const [r]=await c.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program,assignment_company) VALUES(?,?,'1','approved',?,?)",[s.insertId,String(cycles[program]),program,company]);records[scope]={id:r.insertId,student:s.insertId};
  }
  await c.execute('UPDATE students SET photo=? WHERE id=?',[body.profile_photo,records.alpha.student]);
  assert.equal((await accounts.studentPortrait(facade,cwtsUser,records.alpha.student)).mimeType,'image/png');
  await assert.rejects(accounts.studentPortrait(facade,cwtsUser,records.bravo.student),e=>e.status===403);
  await assert.rejects(accounts.studentPortrait(facade,rotcUser,records.alpha.student),e=>e.status===403);
  await assert.rejects(accounts.studentPortrait(facade,rotcUser,records.rotc.student),e=>e.status===404);
  const attendance=require('../services/instructorAttendanceService');
  const now=Date.now();
  const makeSession=async(level,year,open,close)=>{const [session]=await c.execute('INSERT INTO attendance_sessions(program,ms_level,school_year,mi_number,mi_type,open_date,close_date,latitude,longitude,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',['CWTS',level,year,1,'in',new Date(open).toISOString(),new Date(close).toISOString(),0,0,actor]);return session.insertId;};
  const sessionId=await makeSession('1',schoolYear,now-300000,now+1800000);
  await makeSession('2',schoolYear,now-300000,now+1800000);
  await makeSession('1','1000-1001',now-300000,now+1800000);
  await makeSession('1',schoolYear,now+3600000,now+7200000);
  const available=await attendance.list(facade,cwtsUser);assert.equal(available.length,1);assert.equal(available[0].id,alpha+'-'+sessionId);
  const attendanceId=available[0].id;
  assert.equal((await attendance.records(facade,cwtsUser,attendanceId)).length,1);
  const [[manualBefore]]=await c.execute('SELECT COUNT(*) total FROM cwts_instructor_assignments WHERE attendance_session_id=?',[sessionId]);assert.equal(Number(manualBefore.total),0);
  await assert.rejects(attendance.verify(facade,cwtsUser,attendanceId,records.bravo.student,{status:'present',reason:'Wrong company',expected_version:null}),e=>e.status===403);
  await assert.rejects(attendance.records(facade,cwtsUser,rotcAssignment+'-'+sessionId),e=>e.status===403);
  await attendance.verify(facade,cwtsUser,attendanceId,records.alpha.student,{status:'present',reason:'Physically present in company formation.',expected_version:null});
  let [[marked]]=await c.execute('SELECT * FROM attendance_records WHERE student_id=? AND attendance_session_id=?',[records.alpha.student,sessionId]);assert.equal(marked.status,'present');
  await assert.rejects(attendance.verify(facade,cwtsUser,attendanceId,records.alpha.student,{status:'absent',reason:'Stale form',expected_version:null}),e=>e.status===409);
  await attendance.verify(facade,cwtsUser,attendanceId,records.alpha.student,{status:'absent',reason:'Corrected after checking the company roster.',expected_version:Number(marked.record_version)});
  [[marked]]=await c.execute('SELECT * FROM attendance_records WHERE id=?',[marked.id]);assert.equal(marked.status,'absent');assert.equal(Number(marked.false_present),1);
  await attendance.verify(facade,cwtsUser,attendanceId,records.alpha.student,{status:'present',reason:'Student confirmed present; earlier absence was incorrect.',expected_version:Number(marked.record_version)});
  const [history]=await c.execute('SELECT reason FROM cwts_attendance_verification_log WHERE record_id=?',[marked.id]);assert.equal(history.length,3);assert(history.every(r=>r.reason.length>0));
  const [[offense]]=await c.execute('SELECT offend FROM attendance_offenses WHERE student_id=?',[records.alpha.student]);assert.equal(Number(offense.offend),0);
  const roster=await grades.records(facade,cwtsUser,alpha);assert.equal(roster.students.length,1);assert.equal(roster.students[0].enrollment_record_id,records.alpha.id);
  await assert.rejects(grades.records(facade,rotcUser,alpha),e=>e.status===403);
  await assert.rejects(grades.save(facade,cwtsUser,alpha,records.bravo.id,{midterm:'2.00',final_term:'2.50',action:'submitted',expected_version:null}),e=>e.status===403);
  await grades.save(facade,cwtsUser,alpha,records.alpha.id,{midterm:'1.00',final_term:'3.00',action:'draft',expected_version:null});
  await assert.rejects(grades.save(facade,cwtsUser,alpha,records.alpha.id,{midterm:'1.00',final_term:'3.00',action:'submitted',expected_version:null}),e=>e.status===409);
  await grades.save(facade,cwtsUser,alpha,records.alpha.id,{midterm:'1.00',final_term:'3.00',action:'submitted',expected_version:1});
  let [pending]=await grades.reviewList(facade,'CWTS');
  assert.equal((await c.execute('SELECT * FROM student_grade_attempts WHERE enrollment_record_id=?',[records.alpha.id]))[0].length,0);
  await assert.rejects(grades.save(facade,cwtsUser,alpha,records.alpha.id,{midterm:'1.00',final_term:'2.00',action:'draft',expected_version:2}),e=>e.status===409);
  await assert.rejects(grades.review(facade,'ROTC',pending.id,{action:'approve',expected_version:2},actor),e=>e.status===404);
  await grades.review(facade,'CWTS',pending.id,{action:'return',note:'Please check the Final grade.',expected_version:2},actor);
  await grades.save(facade,cwtsUser,alpha,records.alpha.id,{midterm:'1.00',final_term:'2.75',action:'submitted',expected_version:3});
  [pending]=await grades.reviewList(facade,'CWTS');
  await grades.review(facade,'CWTS',pending.id,{action:'approve',expected_version:4},actor);
  const [[published]]=await c.execute('SELECT * FROM student_grade_attempts WHERE enrollment_record_id=?',[records.alpha.id]);
  assert.equal(Number(published.grade),1.88);assert.equal(Number(published.midterm),1);assert.equal(published.status,'Passed');
  await assert.rejects(grades.review(facade,'CWTS',pending.id,{action:'approve',expected_version:4},actor),e=>e.status===409);
  await grades.save(facade,rotcUser,rotcAssignment,records.rotc.id,{midterm:'2.00',final_term:'5.00',action:'submitted',expected_version:null});
  const [rotcGrade]=await grades.reviewList(facade,'ROTC');await grades.review(facade,'ROTC',rotcGrade.id,{action:'approve',expected_version:1},actor);
  const [[failed]]=await c.execute('SELECT grade,status FROM student_grade_attempts WHERE enrollment_record_id=?',[records.rotc.id]);assert.equal(Number(failed.grade),3.5);assert.equal(failed.status,'Failed');
  await assignments.remove(facade,'CWTS',alpha,actor);assert.equal((await attendance.list(facade,cwtsUser)).length,0);await assert.rejects(attendance.records(facade,cwtsUser,attendanceId),e=>e.status===403);await assert.rejects(grades.records(facade,cwtsUser,alpha),e=>e.status===403);
  const rejected=await accounts.register(facade,{...body,email:`rejected-${stamp}@example.invalid`});await accounts.review(facade,'CWTS',rejected.id,{decision:'rejected',note:'Please contact the office.'},actor);assert.equal((await accounts.findLogin(facade,`rejected-${stamp}@example.invalid`)).review_status,'rejected');
  console.log('PASS: automatic company attendance, open session detection, level/year/company isolation, reason audit history, stale corrections, offense reconciliation, revoked access, real MySQL registration/photo/hash, approval/rejection, pending assignment denial, component/company isolation, draft/submit/return/approve, stale version denial, locked submissions, Midterm/Final average published, and revoked assignment denial. All test records rolled back.');
 }finally{await c.rollback();c.release();}
})().catch(e=>{console.error(e.stack||e.code);process.exitCode=1;}).finally(()=>db.end());
