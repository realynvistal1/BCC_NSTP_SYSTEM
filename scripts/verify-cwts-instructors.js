const assert=require('node:assert/strict');
const express=require('express'),jwt=require('jsonwebtoken');
const db=require('../config/database');
const email=require('../services/emailService'),captcha=require('../services/captchaService');
const stamp=`cwts-instructor-test-${Date.now()}`;
const students=[],sessions=[],schedules=[],instructors=[];
let server,base;const messages=[];
const originalEmail=email.sendInstructorInvitation,originalConfig=email.hasEmailConfig,originalCaptcha=captcha.verifyToken,originalOrigin=process.env.PUBLIC_APP_URL;
const tokenFor=(id,role,portal,extra={})=>jwt.sign({id,role,portal,email:`${stamp}@example.invalid`,...extra},process.env.JWT_SECRET,{audience:'bcc-nstp-app',issuer:'bcc-nstp-system',expiresIn:'5m'});
const directorToken=tokenFor(1,'officer','officer');
async function request(path,method='GET',body,token=directorToken){
  const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
}
function inviteToken(index=messages.length-1){return new URLSearchParams(new URL(messages[index].url).hash.slice(1)).get('token');}
async function createInstructor(name){
  const result=await request('/api/officer/cwts-instructors','POST',{first_name:name,last_name:'Instructor Test',email:`${stamp}-${name}@example.invalid`});
  assert.equal(result.status,201,JSON.stringify(result.data));instructors.push(result.data.id);return result.data.id;
}
async function student(name,company,year,scheduleId,program='CWTS'){
  const [result]=await db.execute('INSERT INTO students(student_id,first_name,last_name,email,password,nstp_component,company) VALUES(?,?,?,?,?,?,?)',[`${stamp}-${name}`,name,'Attendance Test',`${stamp}-student-${name}@example.invalid`,'not-a-password',program,company]);
  students.push(result.insertId);
  await db.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,program,status,assignment_company) VALUES(?,?,'1',?,'approved',?)",[result.insertId,String(scheduleId),program,company]);
  return result.insertId;
}
async function session(year,type='in',program='CWTS'){
  const [result]=await db.execute("INSERT INTO attendance_sessions(program,ms_level,school_year,mi_number,mi_type,open_date,close_date,latitude,longitude,created_by) VALUES(?,'1',?,1,?,'2026-01-01 08:00:00','2026-01-01 10:00:00',8,125,?)",[program,year,type,stamp]);sessions.push(result.insertId);return result.insertId;
}
(async()=>{
  email.hasEmailConfig=()=>true;email.sendInstructorInvitation=async message=>{messages.push(message);};captcha.verifyToken=async()=>({ok:true});process.env.PUBLIC_APP_URL='https://school.example';
  const app=express();app.use(express.json());
  app.use('/api/auth',require('../routes/authRoutes'));
  app.use('/api/officer',require('../routes/officerRoutes'));
  app.use('/api/admin/cwts/instructor',require('../routes/cwtsInstructorRoutes'));
  app.use('/api/admin/cwts',require('../routes/cwtsAdminRoutes'));
  app.use('/api/student',require('../routes/studentRoutes'));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
  const instructor=await createInstructor('Maria'),firstToken=inviteToken();
  const [[pending]]=await db.execute('SELECT * FROM cwts_instructors WHERE id=?',[instructor]);
  assert.equal(pending.status,'pending');assert.equal(pending.password,null);assert.notEqual(pending.invitation_hash,firstToken);assert(!messages[0].url.includes('password'));
  assert.equal((await request('/api/auth/login','POST',{portal:'cwts-admin',email:pending.email,password:'Test-password-123'},null)).status,401);
  assert.equal((await request(`/api/officer/cwts-instructors/${instructor}/invitation`,'POST',{})).status,429);
  await db.execute('UPDATE cwts_instructors SET invitation_sent_at=0 WHERE id=?',[instructor]);
  assert.equal((await request(`/api/officer/cwts-instructors/${instructor}/invitation`,'POST',{})).status,200);
  assert.equal((await request('/api/auth/cwts-instructor/accept-invitation','POST',{token:firstToken,password:'Test-password-123'},null)).status,400,'Resending invalidates the older link');
  const acceptanceToken=inviteToken();
  const accepted=await Promise.all([request('/api/auth/cwts-instructor/accept-invitation','POST',{token:acceptanceToken,password:'Test-password-123'},null),request('/api/auth/cwts-instructor/accept-invitation','POST',{token:acceptanceToken,password:'Test-password-123'},null)]);
  assert.deepEqual(accepted.map(r=>r.status).sort(),[200,400],'Only one use of an invitation can succeed');
  const login=await request('/api/auth/login','POST',{portal:'cwts-admin',email:pending.email,password:'Test-password-123'},null);
  assert.equal(login.status,200,JSON.stringify(login.data));assert.equal(login.data.user.role,'instructor');assert.equal(login.data.redirect,'/admin/cwts/my-attendance');
  const teacherToken=login.cookie.match(/nstp_token=([^;]+)/)[1];
  assert.equal((await request('/api/auth/me','GET',undefined,teacherToken)).data.user.name,'Maria Instructor Test');
  for(const path of ['/api/admin/cwts/dashboard','/api/admin/cwts/enrollments','/api/admin/cwts/grades','/api/admin/cwts/records','/api/officer/cwts-instructors','/api/student/attendance']){
    assert.equal((await request(path,'GET',undefined,teacherToken)).status,403,path);
  }
  assert.equal((await request('/api/admin/cwts/grades','POST',{student_id:1,grade:100},teacherToken)).status,403);
  assert.equal((await request('/api/auth/change-password/request-code','POST',{currentPassword:'Test-password-123'},teacherToken)).status,403,'Instructor cannot reach another account table through generic password endpoints');
  assert.equal((await request('/api/auth/change-email','GET',undefined,teacherToken)).status,403);
  assert.equal((await request('/api/admin/cwts/instructor/assignments','GET',undefined,null)).status,401);
  assert.equal((await request('/api/admin/cwts/instructor/assignments')).status,403);
  let year,scheduleId;
  for(let n=8700;n<8790;n++){
    year=`${n}-${n+1}`;if((await db.execute("SELECT id FROM enrollment_schedules WHERE program='CWTS' AND year=?",[year]))[0].length)continue;
    const [r]=await db.execute("INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline) VALUES('CWTS','1',?,'2026-01-01','2026-01-31')",[year]);scheduleId=r.insertId;schedules.push(scheduleId);break;
  }assert(scheduleId);
  const ordinary=await session(year),out=await session(year,'out'),rotc=await session(year,'in','ROTC');
  const presentStudent=await student('Present','Alpha',year,scheduleId),missingStudent=await student('Missing','Alpha',year,scheduleId),outside=await student('Other','Bravo',year,scheduleId);
  const [record]=await db.execute("INSERT INTO attendance_records(student_id,attendance_session_id,status,claimed_present,latitude) VALUES(?,?,'present',1,8)",[presentStudent,ordinary]);
  assert.equal((await request('/api/officer/cwts-instructor-assignments','POST',{instructor_id:instructor,session_id:rotc,company:'Alpha'})).status,400);
  assert.equal((await request('/api/officer/cwts-instructor-assignments','POST',{instructor_id:instructor,session_id:ordinary,company:'Alpha'})).status,200);
  const mine=(await request('/api/admin/cwts/instructor/assignments','GET',undefined,teacherToken)).data;assert.equal(mine.length,1);const assignment=mine[0].id;
  const roster=(await request(`/api/admin/cwts/instructor/assignments/${assignment}/records`,'GET',undefined,teacherToken)).data;
  assert.deepEqual(roster.map(r=>r.student_internal_id).sort((a,b)=>a-b),[presentStudent,missingStudent].sort((a,b)=>a-b));
  assert.equal((await db.execute('SELECT verified_at FROM attendance_records WHERE id=?',[record.insertId]))[0][0].verified_at,null,'Reading a truthful Present record leaves it unchanged');
  const change=(studentId,body,token=teacherToken)=>request(`/api/admin/cwts/instructor/assignments/${assignment}/records/${studentId}`,'PATCH',body,token);
  assert.equal((await change(outside,{status:'present',reason:'Outside scope',expected_version:null})).status,403);
  assert.equal((await change(presentStudent,{status:'absent',reason:'',expected_version:0})).status,400);
  // A failed audit insert must roll back attendance and offense changes.
  const originalConnection=db.getConnection;
  db.getConnection=async()=>{const conn=await originalConnection();const execute=conn.execute.bind(conn);conn.execute=(sql,params)=>sql.startsWith('INSERT INTO cwts_attendance_verification_log')?Promise.reject(Object.assign(new Error('Injected test audit failure'),{status:503})):execute(sql,params);return conn;};
  try{assert.equal((await change(presentStudent,{status:'absent',reason:'Rollback check',expected_version:0})).status,503);}finally{db.getConnection=originalConnection;}
  assert.equal((await db.execute('SELECT status FROM attendance_records WHERE id=?',[record.insertId]))[0][0].status,'present');
  const saved=await change(presentStudent,{status:'absent',reason:'Submitted Present but not physically attending in the required area',expected_version:0});
  assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.offense_recorded,true);
  assert.equal((await change(presentStudent,{status:'present',reason:'Outdated form',expected_version:0})).status,409);
  const repeat=await change(presentStudent,{status:'absent',reason:'Still absent',expected_version:1});assert.equal(repeat.status,200);assert.equal(repeat.data.offense_recorded,false);
  assert.equal((await db.execute('SELECT offend FROM attendance_offenses WHERE student_id=?',[presentStudent]))[0][0].offend,1);
  assert.equal((await change(missingStudent,{status:'present',reason:'Physically attending; unable to submit GPS',expected_version:null})).status,200);
  assert.equal((await change(missingStudent,{status:'present',reason:'Duplicate creation',expected_version:null})).status,409);
  assert.equal((await db.execute('SELECT id FROM attendance_offenses WHERE student_id=?',[missingStudent]))[0].length,0);
  const decorated=await require('../services/attendanceUpdateService').decorateAttendanceUpdates((await db.execute('SELECT * FROM attendance_records WHERE student_id=?',[missingStudent]))[0]);
  assert.equal(decorated[0].verified_by_name,'Maria Instructor Test');assert.equal(decorated[0].update_reason,'Physically attending; unable to submit GPS');
  const history=(await request('/api/officer/cwts-verification-log')).data;
  assert(history.some(r=>r.instructor_id===instructor&&r.program==='CWTS'&&r.reason==='Physically attending; unable to submit GPS'));
  const secondInstructor=await createInstructor('Jose');
  assert.equal((await request('/api/auth/cwts-instructor/accept-invitation','POST',{token:inviteToken(),password:'Test-password-456'},null)).status,200);
  assert.equal((await request('/api/officer/cwts-instructor-assignments','POST',{instructor_id:secondInstructor,session_id:ordinary,company:'Alpha'})).status,200);
  assert.equal((await request(`/api/admin/cwts/instructor/assignments/${assignment}/records`,'GET',undefined,teacherToken)).status,403,'Reassignment immediately removes previous access');
  assert.equal((await change(presentStudent,{status:'present',reason:'Old instructor',expected_version:2})).status,403);
  assert.equal((await request(`/api/officer/cwts-instructors/${instructor}/status`,'PATCH',{status:'disabled'})).status,200);
  assert.equal((await request('/api/auth/me','GET',undefined,teacherToken)).status,401,'Disabling invalidates an existing session');
  const failedInstructorEmail=`${stamp}-failed@example.invalid`;email.sendInstructorInvitation=async()=>{throw new Error('SMTP test failure');};
  assert.equal((await request('/api/officer/cwts-instructors','POST',{first_name:'Failed',last_name:'Delivery',email:failedInstructorEmail})).status,502);
  const [[failedAccount]]=await db.execute('SELECT id,status,delivery_status,invitation_hash FROM cwts_instructors WHERE email=?',[failedInstructorEmail]);instructors.push(failedAccount.id);
  assert.equal(failedAccount.status,'pending');assert.equal(failedAccount.delivery_status,'failed');assert.equal(failedAccount.invitation_hash,null);
  email.sendInstructorInvitation=async message=>messages.push(message);
  assert.equal((await request(`/api/officer/cwts-instructors/${failedAccount.id}/invitation`,'POST',{})).status,200);
  await db.execute('UPDATE cwts_instructors SET invitation_expires=0 WHERE id=?',[failedAccount.id]);
  assert.equal((await request('/api/auth/cwts-instructor/accept-invitation','POST',{token:inviteToken(),password:'Test-password-789'},null)).status,400);
  // Exercise the shared CWTS Forgot Password HTTP flow with mocked delivery.
  const originalResetEmail=email.sendPasswordResetCode;
  let resetCode;
  email.sendPasswordResetCode=async message=>{resetCode=message.code;};
  try {
    const [[account]]=await db.execute('SELECT email FROM cwts_instructors WHERE id=?',[secondInstructor]);
    const loginBefore=await request('/api/auth/login','POST',{portal:'cwts-admin',email:account.email,password:'Test-password-456'},null);
    const oldToken=loginBefore.cookie.match(/nstp_token=([^;]+)/)[1];
    const requestCode=()=>request('/api/auth/forgot-password/request-code','POST',{portal:'cwts-admin',email:account.email},null);
    assert.equal((await requestCode()).status,200);
    assert.equal((await requestCode()).status,429);
    const resetBody={portal:'cwts-admin',email:account.email,verification_code:resetCode,newPassword:'Changed-password-987',confirmPassword:'Changed-password-987'};
    const reset=()=>request('/api/auth/forgot-password/reset-admin','POST',resetBody,null);
    assert.equal((await request('/api/auth/forgot-password/reset-admin','POST',{...resetBody,verification_code:'000000'},null)).status,400);
    const resets=await Promise.all([reset(),reset()]);
    assert.deepEqual(resets.map(r=>r.status).sort(),[200,400]);
    assert.equal((await request('/api/auth/me','GET',undefined,oldToken)).status,401);
    const loginAfter=await request('/api/auth/login','POST',{portal:'cwts-admin',email:account.email,password:resetBody.newPassword},null);
    assert.equal(loginAfter.status,200);assert.equal(loginAfter.data.user.role,'instructor');
    assert.equal((await request('/api/auth/forgot-password/request-code','POST',{portal:'rotc-admin',email:account.email},null)).status,404);
    assert.equal((await request('/api/officer/cwts-instructor-assignments/'+assignment+'/revoke','PATCH',{})).status,200);
    const newToken=loginAfter.cookie.match(/nstp_token=([^;]+)/)[1];
    assert.equal((await request(`/api/admin/cwts/instructor/assignments/${assignment}/records`,'GET',undefined,newToken)).status,403);
    assert.equal((await request(`/api/admin/cwts/instructor/assignments/${assignment}/records/${presentStudent}`,'PATCH',{status:'present',reason:'Revoked',expected_version:2},newToken)).status,403);
  } finally { email.sendPasswordResetCode=originalResetEmail; }
  console.log('PASS: invitations, login, role boundaries, scope/replacement/revocation, stale saves, rollback, false-claim offenses, named history and CWTS password reset API with one-time codes and session invalidation. No real emails sent.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  email.sendInstructorInvitation=originalEmail;email.hasEmailConfig=originalConfig;captcha.verifyToken=originalCaptcha;
  if(originalOrigin===undefined)delete process.env.PUBLIC_APP_URL;else process.env.PUBLIC_APP_URL=originalOrigin;
  try{
    const [created]=await db.execute('SELECT id FROM cwts_instructors WHERE email LIKE ?',[`${stamp}%`]);
    for(const row of created)await db.execute('DELETE FROM cwts_attendance_verification_log WHERE instructor_id=?',[row.id]);
    for(const row of created)await db.execute('DELETE FROM cwts_instructor_assignments WHERE instructor_id=?',[row.id]);
    for(const id of students){await db.execute('DELETE FROM attendance_records WHERE student_id=?',[id]);await db.execute('DELETE FROM attendance_offenses WHERE student_id=?',[id]);await db.execute('DELETE FROM student_ms_records WHERE student_id=?',[id]);await db.execute('DELETE FROM students WHERE id=?',[id]);}
    for(const id of sessions)await db.execute('DELETE FROM attendance_sessions WHERE id=?',[id]);
    for(const id of schedules)await db.execute('DELETE FROM enrollment_schedules WHERE id=?',[id]);
    await db.execute('DELETE FROM cwts_instructors WHERE email LIKE ?',[`${stamp}%`]);
    await db.execute('DELETE FROM login_attempt_locks WHERE login_key LIKE ?',[`${stamp}%`]);
    await db.execute('DELETE FROM login_attempt_locks WHERE login_key LIKE ?',[`%:${stamp}%`]);
  }finally{await db.end();}
});
