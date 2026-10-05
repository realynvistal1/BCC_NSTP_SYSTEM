const assert=require('node:assert/strict');
const db=require('../config/database');
const controller=require('../controllers/rotcVerifierController');
const stamp=`verifier-test-${Date.now()}`;
const students=[],sessions=[],records=[];
let scheduleId,assignmentId,httpServer;
async function call(handler,user,body={},params={},query={}) {
  if(handler===controller.verify && Number(params.id)>0 && !Object.hasOwn(body,'expected_version')) {
    const [[record]]=await db.execute('SELECT record_version FROM attendance_records WHERE id=?',[params.id]);
    body={...body,expected_version:record?.record_version};
  }
  let status=200,payload;
  await handler({user,body,params,query},{status(code){status=code;return this;},json(data){payload=data;}});
  return {status,payload};
}
async function student(name,advance=false,sex='Male') {
  const [result]=await db.execute(`INSERT INTO students(student_id,first_name,last_name,email,password,nstp_component,willing_to_take_advance_course,sex)
    VALUES(?,?,?,?,?,'ROTC',?,?)`,[`${stamp}-${name}`,name,'Verifier Test',`${stamp}-${name}@example.invalid`,'not-a-login-password',Number(advance),sex]);
  students.push(result.insertId);return result.insertId;
}
async function enrollment(id,advance=false,platoon=1) {
  await db.execute(`INSERT INTO student_ms_records(student_id,schedule_id,ms_level,program,status,assignment_battalion,assignment_company,assignment_platoon,assignment_is_advance)
    VALUES(?,?,'1','ROTC','approved',1,'Alpha',?,?)`,[id,String(scheduleId),platoon,Number(advance)]);
}
async function session(program,year,advance=0,level='1') {
  const [result]=await db.execute(`INSERT INTO attendance_sessions(program,ms_level,school_year,is_advance_course,mi_number,mi_type,open_date,close_date,latitude,longitude,created_by)
    VALUES(?,?,?,?,1,'in','2026-10-04 08:00:00','2026-10-04 10:00:00',8,125,?)`,[program,level,year,advance,stamp]);
  sessions.push(result.insertId);return result.insertId;
}
async function attendance(id,sessionId,submitted=true) {
  const [result]=await db.execute(`INSERT INTO attendance_records(student_id,attendance_session_id,status,latitude,claimed_present)
    VALUES(?,?,'present',?,?)`,[id,sessionId,submitted?8:null,Number(submitted)]);
  records.push(result.insertId);return result.insertId;
}
(async()=>{
  const valid={mi_number:1,mi_type:'in',verifier_id:1,battalion:1,company:'Alpha',platoon:1,ms_level:'1',school_year:'2026-2027'};
  assert(controller.validAssignment(valid));
  for(const change of [{company:'Echo'},{platoon:5},{ms_level:'3'},{school_year:'2026-2028'},{verifier_id:'1 OR 1=1'},{special_unit:'Unknown'},{mi_number:0},{mi_number:1.5},{mi_type:'both'},{mi_type:''}]) assert.equal(controller.validAssignment({...valid,...change}),null);
  // Use a dedicated, otherwise unused school year and remove every fixture afterward.
  let year;
  for(let start=8800;start<9998;start++){
    year=`${start}-${start+1}`;
    const [existing]=await db.execute("SELECT id FROM enrollment_schedules WHERE program='ROTC' AND year=?",[year]);
    if(existing.length)continue;
    const [result]=await db.execute("INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline) VALUES('ROTC','1',?,'2026-10-01','2026-10-31')",[year]);scheduleId=result.insertId;break;
  }
  assert(scheduleId);
  const verifier=await student('Advance',true),target=await student('Assigned'),outsider=await student('OtherPlatoon'),other=await student('Unassigned');
  await enrollment(verifier,true);await enrollment(target);await enrollment(outsider,false,2);
  const director={id:1,email:`${stamp}-director@example.invalid`},user={id:verifier,email:`${stamp}-Advance@example.invalid`};
  assert.equal((await call(controller.assign,director,{...valid,verifier_id:target,school_year:year})).status,400);
  assert.equal((await call(controller.assign,director,{...valid,verifier_id:verifier,school_year:year})).status,400,'Cannot assign an MI before attendance is created');
  const ordinary=await session('ROTC',year),wrongYear=await session('ROTC','8798-8799'),cwts=await session('CWTS',year),advance=await session('ROTC',year,1),wrongLevel=await session('ROTC',year,0,'2');
  const female=await student('FemaleAdvance',true,'Female');await enrollment(female,true);
  const femaleUser={id:female,email:`${stamp}-FemaleAdvance@example.invalid`};
  assert.equal((await call(controller.assign,director,{...valid,verifier_id:female,school_year:year})).status,400);
  assert.equal((await call(controller.assign,director,{...valid,verifier_id:verifier,school_year:year,battalion:2,company:'Echo'})).status,400);
  assert.equal((await call(controller.assign,director,{...valid,verifier_id:female,school_year:year,battalion:2,company:'Echo'})).status,200);
  const femaleAssignment=(await call(controller.mine,femaleUser)).payload[0];assert(femaleAssignment);
  await call(controller.revoke,director,{}, {id:femaleAssignment.id});
  for(const change of [{mi_number:16},{mi_number:15},{mi_type:'out'}]) {
    assert.equal((await call(controller.assign,director,{...valid,...change,verifier_id:verifier,school_year:year})).status,400,'Reject out-of-range or uncreated MI/type');
  }
  assert.equal((await call(controller.assign,director,{...valid,verifier_id:verifier,school_year:year})).status,200);
  const mine=await call(controller.mine,user);assert.equal(mine.payload.length,1);assignmentId=mine.payload[0].id;
  const allowed=await attendance(target,ordinary),own=await attendance(verifier,ordinary),outside=await attendance(outsider,ordinary);
  const manual=await session('ROTC',year);
  const secondMi=await session('ROTC',year),outSession=await session('ROTC',year);
  await db.execute('UPDATE attendance_sessions SET mi_number=2 WHERE id=?',[secondMi]);
  await db.execute("UPDATE attendance_sessions SET mi_type='out' WHERE id=?",[outSession]);
  const secondMiRecord=await attendance(target,secondMi),outRecord=await attendance(target,outSession);
  const forbidden=[own,outside,secondMiRecord,outRecord,await attendance(target,wrongYear),await attendance(target,cwts),await attendance(target,advance),await attendance(target,wrongLevel)];
  const manualRecord=await attendance(target,manual,false);
  const [[unchangedBefore]]=await db.execute('SELECT * FROM attendance_records WHERE id=?',[allowed]);
  const list=await call(controller.records,user,{}, {id:assignmentId});assert.equal(list.status,200);
  assert.deepEqual(list.payload.map(r=>r.id).sort((a,b)=>a-b),[allowed,manualRecord].sort((a,b)=>a-b));
  const [[unchangedAfter]]=await db.execute('SELECT * FROM attendance_records WHERE id=?',[allowed]);
  assert.deepEqual(unchangedAfter,unchangedBefore,'Opening the roster must leave a truthful Present record unchanged');
  assert.equal((await db.execute('SELECT id FROM rotc_attendance_verification_log WHERE record_id=?',[allowed]))[0].length,0,'No action must not create a verification entry');
  for(const status of ['present','late','absent']) {
    await db.execute('UPDATE attendance_records SET status=? WHERE id=?',[status,manualRecord]);
    const visible=(await call(controller.records,user,{}, {id:assignmentId})).payload.find(row=>row.id===manualRecord);
    assert.equal(visible.status,status,'Records without GPS must be visible for every attendance status');
  }
  assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'present',reason:'Confirmed attendance without GPS'},{id:manualRecord})).status,200);

  assert.equal((await call(controller.records,{id:other},{},{id:assignmentId})).status,403);
  for(const id of forbidden) assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'absent',reason:'Test unauthorized'},{id})).status,403);
  assert.equal((await call(controller.verify,{id:other,email:'other@example.invalid'},{assignment_id:assignmentId,status:'present',reason:'Unauthorized'},{id:allowed})).status,403);
  assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'present',reason:''},{id:allowed})).status,400);
  assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'late',reason:'Confirmed late arrival in field'},{id:allowed})).status,200);
  const [[saved]]=await db.execute('SELECT status,verified_by,verified_at FROM attendance_records WHERE id=?',[allowed]);assert.equal(saved.status,'late');assert.equal(saved.verified_by,user.email);assert(saved.verified_at);
  for(let i=0;i<2;i++) assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'absent',reason:'Not physically present'},{id:allowed})).status,200);
  const [[offense]]=await db.execute('SELECT offend FROM attendance_offenses WHERE student_id=?',[target]);assert.equal(offense.offend,1,'Repeated absent verification must not duplicate offenses');
  const [logs]=await db.execute('SELECT * FROM rotc_attendance_verification_log WHERE record_id=?',[allowed]);assert.equal(logs.length,3);assert.equal(logs[0].previous_status,'present');assert.equal(logs[0].verifier_id,verifier);
  const studentController = require('../controllers/studentController');
  const history = await call(studentController.attendance, { id: target });
  assert.equal(history.status, 200);
  assert.equal(history.payload.find(row => row.id === allowed).status, 'absent', 'Student history reads the corrected record');
  assert.equal(history.payload.find(row => row.id === allowed).verified_by_name, 'Advance Verifier Test');
  assert.equal(history.payload.find(row => row.id === allowed).update_reason, 'Not physically present');
  const updatedRecords = (await call(controller.records, user, {}, { id: assignmentId })).payload;
  assert.equal(updatedRecords.find(row=>row.id===allowed).verified_by_name, 'Advance Verifier Test');
  assert.equal(updatedRecords.find(row=>row.id===allowed).update_reason, 'Not physically present');
  const [staffUpdate] = await require('../services/attendanceUpdateService').decorateAttendanceUpdates([{ ...updatedRecords[0], verified_by: 'historical-staff@example.invalid' }]);
  assert.equal(staffUpdate.update_reason, null, 'A staff update must not inherit an Advance Course reason');
  assert.equal(staffUpdate.verified_by_name, 'Attendance staff', 'An unknown staff account must not be relabeled as the verifier');
  const warning = await call(studentController.attendanceOffense, { id: target });
  assert.equal(warning.payload.offend, 1, 'Student warning is available immediately');
  const summary = await call(require('../controllers/rotcAdminController').attendanceSummary, director, {}, {}, { session_id: ordinary, group: 'overall' });
  assert.equal(summary.status, 200);
  assert.equal(summary.payload.students.find(row => row.id === target).attendance_status, 'absent', 'ROTC summary reads the corrected record');
  assert.equal(summary.payload.counts.absent, 1, 'ROTC summary absent total includes the correction');
  assert.equal(summary.payload.students.find(row => row.id === target).verified_by_name, 'Advance Verifier Test');
  assert.equal(summary.payload.students.find(row => row.id === target).update_reason, 'Not physically present');
  const audit = await call(controller.audit, director);
  assert(audit.payload.some(row => row.record_id === allowed && row.status === 'absent' && row.verifier_id === verifier), 'Director receives the correction audit');
  const unitRecords=[];
  // Correcting and restoring the same absence must never count it twice.
  const offenses=require('../services/offenseService');
  // Exact field flow: a false Present claim updates the existing row, rather than adding another.
  const falseStudent=await student('FalsePresent');await enrollment(falseStudent);
  const falseRecord=await attendance(falseStudent,ordinary);
  assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'absent',reason:'Student marked Present but was not attending in the required field area'},{id:falseRecord})).status,200);
  const [falseRows]=await db.execute('SELECT id,status,false_present,verified_by FROM attendance_records WHERE student_id=? AND attendance_session_id=?',[falseStudent,ordinary]);
  assert.equal(falseRows.length,1);assert.equal(falseRows[0].id,falseRecord);
  assert.equal(falseRows[0].status,'absent');assert.equal(falseRows[0].false_present,1);
  assert.equal(falseRows[0].verified_by,user.email);assert.equal((await offenses.get(falseStudent)).offend,1);
  const repeatResult=await call(controller.verify,user,{assignment_id:assignmentId,status:'absent',reason:'Checked again; still absent'},{id:falseRecord});
  assert.match(repeatResult.payload.message,/already recorded; no duplicate/);
  assert.equal(repeatResult.payload.offense_recorded,false);
  const [[opened]]=await db.execute('SELECT record_version FROM attendance_records WHERE id=?',[falseRecord]);
  const [[ordinaryForConflict]]=await db.execute('SELECT * FROM attendance_sessions WHERE id=?',[ordinary]);
  await offenses.saveAttendance(falseStudent,ordinaryForConflict,'absent',director.email);
  const [[beforeConflict]]=await db.execute('SELECT * FROM attendance_records WHERE id=?',[falseRecord]);
  const [beforeConflictLogs]=await db.execute('SELECT id FROM rotc_attendance_verification_log WHERE record_id=?',[falseRecord]);
  const staleResult=await call(controller.verify,user,{assignment_id:assignmentId,status:'present',reason:'Old form must not overwrite admin',expected_version:opened.record_version},{id:falseRecord});
  assert.equal(staleResult.status,409);assert.match(staleResult.payload.message,/Refresh and review/);
  assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'present',reason:'Legacy form',expected_version:undefined},{id:falseRecord})).status,409);
  assert.deepEqual((await db.execute('SELECT * FROM attendance_records WHERE id=?',[falseRecord]))[0][0],beforeConflict);
  assert.deepEqual((await db.execute('SELECT id FROM rotc_attendance_verification_log WHERE record_id=?',[falseRecord]))[0],beforeConflictLogs);
  assert.equal((await offenses.get(falseStudent)).offend,1);
  const concurrentBody={assignment_id:assignmentId,status:'absent',reason:'Concurrent form',expected_version:beforeConflict.record_version};
  const concurrent=await Promise.all([call(controller.verify,user,concurrentBody,{id:falseRecord}),call(controller.verify,user,concurrentBody,{id:falseRecord})]);
  assert.deepEqual(concurrent.map(result=>result.status).sort(),[200,409],'Only one form with the same record version may save');
  // Exact field flow: physically attending without a submission is recorded Present with a reason.
  const presentStudent=await student('PresentWithoutGPS');await enrollment(presentStudent);
  const presentBody={assignment_id:assignmentId,student_id:presentStudent,session_id:ordinary,status:'present',reason:'Physically attending in the required field area; could not submit attendance'};
  assert.equal((await call(controller.verify,user,{...presentBody,reason:''},{id:0})).status,400);
  const presentSave=await call(controller.verify,user,presentBody,{id:0});
  assert.equal(presentSave.status,200);assert.match(presentSave.payload.message,/No punishment offense recorded/);
  const [presentRows]=await db.execute('SELECT id,status,claimed_present,false_present,verified_by FROM attendance_records WHERE student_id=? AND attendance_session_id=?',[presentStudent,ordinary]);
  assert.equal(presentRows.length,1);records.push(presentRows[0].id);
  assert.equal(presentRows[0].status,'present');assert.equal(presentRows[0].claimed_present,0);
  assert.equal(presentRows[0].false_present,0);assert.equal(presentRows[0].verified_by,user.email);
  assert.equal(await offenses.get(presentStudent),null);
  const presentHistory=await call(studentController.attendance,{id:presentStudent});
  assert.equal(presentHistory.payload.find(r=>r.id===presentRows[0].id).status,'present');
  assert.equal(presentHistory.payload.find(r=>r.id===presentRows[0].id).update_reason,presentBody.reason);
  assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'present',reason:'Correction confirmed'},{id:allowed})).status,200);
  assert.equal((await offenses.get(target)).offend,0);
  assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'absent',reason:'Absence confirmed again'},{id:allowed})).status,200);
  assert.equal((await offenses.get(target)).offend,1);
  // The full roster includes a student who never submitted GPS attendance.
  const unmarked=await student('Unmarked');await enrollment(unmarked);
  const roster=(await call(controller.records,user,{}, {id:assignmentId})).payload;
  assert(roster.some(row=>row.student_internal_id===unmarked && row.id===null && row.status==='unmarked'));
  const missing={assignment_id:assignmentId,student_id:unmarked,session_id:ordinary,status:'absent',reason:'Physically checked; no submission'};
  assert.equal((await call(controller.verify,user,{...missing,student_id:verifier},{id:0})).status,403);
  assert.equal((await call(controller.verify,user,{...missing,session_id:secondMi},{id:0})).status,403);
  const futureSession=await session('ROTC',year);
  await db.execute('UPDATE attendance_sessions SET open_date=DATE_ADD(NOW(),INTERVAL 1 DAY),close_date=DATE_ADD(NOW(),INTERVAL 2 DAY) WHERE id=?',[futureSession]);
  assert.equal((await call(controller.verify,user,{...missing,session_id:futureSession},{id:0})).status,400,'Cannot mark physical attendance before a session opens');
  const futureRecord=await attendance(unmarked,futureSession);
  assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'absent',reason:'Future existing record'},{id:futureRecord})).status,400,'Existing records also cannot be corrected before a session opens');
  assert.equal((await call(controller.verify,user,missing,{id:0})).status,200);
  const [[created]]=await db.execute('SELECT id FROM attendance_records WHERE student_id=? AND attendance_session_id=?',[unmarked,ordinary]);
  records.push(created.id);
  assert.equal(await offenses.get(unmarked),null,'An Unmarked student has not made a false Present claim');
  assert.equal((await call(controller.verify,user,missing,{id:0})).status,409);
  const [[createdLog]]=await db.execute('SELECT previous_status FROM rotc_attendance_verification_log WHERE record_id=?',[created.id]);
  assert.equal(createdLog.previous_status,'unmarked');
  // Automatic closure rolls back records, offenses, and completion on failure.
  const fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
  const closing=await session('ROTC',year);
  const closureStudent=await student('Closure');await enrollment(closureStudent);
  let failClosure=true;
  const realGetConnection=db.getConnection;
  const closureDb={...db,getConnection:async()=>{
    const connection=await realGetConnection();const execute=connection.execute.bind(connection);
    connection.execute=async(sql,params)=>{
      if(failClosure && sql.includes('attendance_finalized_at=NOW()')) throw new Error('Injected closure failure');
      return execute(sql,params);
    };return connection;
  }};
  const localRequire=createRequire(require('node:path').resolve('controllers/officerController.js'));
  const context={require:name=>name==='../config/database'?closureDb:localRequire(name),exports:{},console,Buffer,process,__dirname:require('node:path').resolve('controllers')};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('controllers/officerController.js','utf8')+'\napprovedStudentsForSession=async()=>[{id:'+closureStudent+'}];exports.testClosure=markMissingAbsent;',context);
  const [[closingSession]]=await db.execute('SELECT * FROM attendance_sessions WHERE id=?',[closing]);
  await assert.rejects(context.exports.testClosure(closingSession),/Injected closure failure/);
  const [[failed]]=await db.execute('SELECT attendance_finalized_at FROM attendance_sessions WHERE id=?',[closing]);
  assert.equal(failed.attendance_finalized_at,null);
  assert.equal((await db.execute('SELECT id FROM attendance_records WHERE student_id=?',[closureStudent]))[0].length,0);
  assert.equal(await offenses.get(closureStudent),null);
  failClosure=false;await context.exports.testClosure(closingSession);
  const [[autoRecord]]=await db.execute('SELECT id FROM attendance_records WHERE student_id=?',[closureStudent]);records.push(autoRecord.id);
  assert.equal(await offenses.get(closureStudent),null,'Automatic absence must not punish a student');
  await context.exports.testClosure(closingSession);
  assert.equal(await offenses.get(closureStudent),null,'Closure retries must not create an offense');
  assert.equal((await db.execute('SELECT id FROM attendance_records WHERE student_id=?',[closureStudent]))[0].length,1);
  const [[ordinarySession]]=await db.execute('SELECT * FROM attendance_sessions WHERE id=?',[ordinary]);
  // Simulate two student Present submissions, then physical verification finding neither claim true.
  await db.execute("UPDATE attendance_records SET status='present',claimed_present=1 WHERE id=?",[autoRecord.id]);
  await offenses.saveAttendance(closureStudent,closingSession,'absent',user.email);
  assert.equal((await offenses.get(closureStudent)).offend,1);
  await offenses.saveAttendance(closureStudent,ordinarySession,'present',user.email);
  await db.execute('UPDATE attendance_records SET claimed_present=1 WHERE student_id=? AND attendance_session_id=?',[closureStudent,ordinary]);
  await offenses.saveAttendance(closureStudent,ordinarySession,'absent',user.email);
  const [[secondAbsence]]=await db.execute('SELECT id FROM attendance_records WHERE student_id=? AND attendance_session_id=?',[closureStudent,ordinary]);records.push(secondAbsence.id);
  assert.equal((await offenses.get(closureStudent)).offend,2);
  await offenses.settle(closureStudent);
  await offenses.saveAttendance(closureStudent,ordinarySession,'absent',user.email);
  assert.equal((await offenses.get(closureStudent)).settled,1,'Repeated absent saves preserve settlement');
  await offenses.saveAttendance(closureStudent,ordinarySession,'late',user.email);
  assert.equal((await offenses.get(closureStudent)).offend,1);
  assert.equal((await offenses.get(closureStudent)).settled,0);
  for(const unit of ['Medics','HQ','MP']) {
    const member=await student(unit);await enrollment(member);
    await db.execute(`UPDATE student_ms_records SET assignment_special_unit=?,assignment_battalion=NULL,
      assignment_company=NULL,assignment_platoon=NULL WHERE student_id=?`,[unit,member]);
    unitRecords.push({unit,id:await attendance(member,ordinary),wrongYearId:await attendance(member,wrongYear)});
  }
  for(const unitRecord of unitRecords) {
    assert.equal((await call(controller.assign,director,{...valid,verifier_id:verifier,school_year:year,special_unit:unitRecord.unit})).status,200);
    const mineUnits=(await call(controller.mine,user)).payload;
    const special=mineUnits.find(a=>a.special_unit===unitRecord.unit);assert(special);
    assert.equal(special.battalion,0);assert.equal(special.company,'');assert.equal(special.platoon,0);
    const listed=await call(controller.records,user,{}, {id:special.id});assert.deepEqual(listed.payload.filter(r=>r.id).map(r=>r.id),[unitRecord.id]);
    assert.equal(new Set(listed.payload.map(r=>r.student_internal_id)).size,1,'Special unit roster cannot include other students');
    assert.equal((await call(controller.verify,user,{assignment_id:special.id,status:'present',reason:'Special unit physically confirmed'},{id:unitRecord.id})).status,200);
    for(const id of [allowed,unitRecord.wrongYearId,...unitRecords.filter(r=>r.unit!==unitRecord.unit).map(r=>r.id)]) {
      assert.equal((await call(controller.verify,user,{assignment_id:special.id,status:'present',reason:'Wrong unit or cycle'},{id})).status,403);
    }
    assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'present',reason:'Regular verifier cannot verify special unit'},{id:unitRecord.id})).status,403);
    // Assigning the same scope updates it instead of creating a duplicate.
    await call(controller.assign,director,{...valid,verifier_id:verifier,school_year:year,special_unit:unitRecord.unit});
    assert.equal((await call(controller.mine,user)).payload.filter(a=>a.special_unit===unitRecord.unit).length,1);
    await call(controller.revoke,director,{}, {id:special.id});
    assert.equal((await call(controller.verify,user,{assignment_id:special.id,status:'present',reason:'Revoked special verifier'},{id:unitRecord.id})).status,403);
    assert.equal((await call(controller.assign,director,{...valid,verifier_id:female,school_year:year,special_unit:unitRecord.unit})).status,200);
    assert.equal((await call(controller.verify,femaleUser,{assignment_id:special.id,status:'present',reason:'Female special unit verifier'},{id:unitRecord.id})).status,200);
    await call(controller.revoke,director,{}, {id:special.id});
  }
  for(const separate of [{mi_number:2,mi_type:'in',record:secondMiRecord},{mi_number:1,mi_type:'out',record:outRecord}]) {
    assert.equal((await call(controller.assign,director,{...valid,...separate,verifier_id:verifier,school_year:year})).status,200);
    const entry=(await call(controller.mine,user)).payload.find(a=>a.mi_number===separate.mi_number&&a.mi_type===separate.mi_type);
    assert(entry);assert.notEqual(entry.id,assignmentId);
    assert.deepEqual((await call(controller.records,user,{}, {id:entry.id})).payload.filter(r=>r.id).map(r=>r.id),[separate.record]);
    assert.equal((await call(controller.verify,user,{assignment_id:entry.id,status:'present',reason:'Matching MI and type'},{id:separate.record})).status,200);
    assert.equal((await call(controller.verify,user,{assignment_id:entry.id,status:'present',reason:'Wrong MI or type'},{id:allowed})).status,403);
    await call(controller.revoke,director,{}, {id:entry.id});
  }
  assert.equal((await call(controller.management,director)).status,200);assert.equal((await call(controller.audit,director)).status,200);
  const express=require('express'),jwt=require('jsonwebtoken');
  const app=express();app.use(express.json());
  app.use('/api/student',require('../routes/studentRoutes'));
  app.use('/api/officer',require('../routes/officerRoutes'));
  httpServer=app.listen(0,'127.0.0.1');await new Promise(resolve=>httpServer.once('listening',resolve));
  const base=`http://127.0.0.1:${httpServer.address().port}`;
  const token=(role,portal)=>jwt.sign({id:verifier,email:user.email,role,portal},process.env.JWT_SECRET,{audience:'bcc-nstp-app',issuer:'bcc-nstp-system',expiresIn:'1m'});
  const studentToken=token('student','student'),directorToken=token('officer','officer');
  assert.equal((await fetch(base+'/api/student/rotc-verifier/assignments')).status,401);
  assert.equal((await fetch(base+'/api/student/rotc-verifier/assignments',{headers:{Authorization:`Bearer ${studentToken}`}})).status,200);
  assert.equal((await fetch(base+'/api/officer/rotc-verifiers',{headers:{Authorization:`Bearer ${studentToken}`}})).status,403);
  assert.equal((await fetch(base+'/api/student/rotc-verifier/assignments',{headers:{Authorization:`Bearer ${directorToken}`}})).status,403);
  assert.equal((await fetch(base+'/api/officer/rotc-verifiers',{headers:{Authorization:`Bearer ${directorToken}`}})).status,200);
  assert.equal((await fetch(base+'/api/student/rotc-verifier/assignments',{headers:{Authorization:`Bearer ${token('student','officer')}`}})).status,403);
  await db.execute('UPDATE students SET willing_to_take_advance_course=0 WHERE id=?',[verifier]);
  assert.equal((await call(controller.mine,user)).payload.length,0);
  assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'present',reason:'No longer eligible'},{id:allowed})).status,403);
  await db.execute('UPDATE students SET willing_to_take_advance_course=1 WHERE id=?',[verifier]);
  await call(controller.revoke,director,{}, {id:assignmentId});
  assert.equal((await call(controller.mine,user)).payload.length,0);
  assert.equal((await call(controller.verify,user,{assignment_id:assignmentId,status:'present',reason:'Revoked'},{id:allowed})).status,403);
  console.log('ROTC verifier integration checks passed: false Present claims punished once, automatic and Unmarked absences not punished, corrections, settlement, closure rollback/retry, scope, access and audit.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  try {
    if(httpServer) await new Promise(resolve=>httpServer.close(resolve));
    for(const id of records) await db.execute('DELETE FROM rotc_attendance_verification_log WHERE record_id=?',[id]);
    for(const id of students) await db.execute('DELETE FROM rotc_verifier_assignments WHERE verifier_id=?',[id]);
    for(const id of records) await db.execute('DELETE FROM attendance_records WHERE id=?',[id]);
    for(const id of sessions) await db.execute('DELETE FROM attendance_sessions WHERE id=?',[id]);
    for(const id of students){await db.execute('DELETE FROM attendance_offenses WHERE student_id=?',[id]);await db.execute('DELETE FROM student_ms_records WHERE student_id=?',[id]);await db.execute('DELETE FROM students WHERE id=?',[id]);}
    if(scheduleId) await db.execute('DELETE FROM enrollment_schedules WHERE id=?',[scheduleId]);
  } finally {await db.end();}
});
