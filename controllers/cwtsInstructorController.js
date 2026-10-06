const db=require('../config/database');
const service=require('../services/cwtsInstructorService');
const offenses=require('../services/offenseService');
const attendance=require('../services/attendanceService');
const {decorateAttendanceUpdates}=require('../services/attendanceUpdateService');
const {parsePositiveInt,isReasonableEmail}=require('../services/requestValidationService');
const companies=['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot'];
const endpoint=handler=>async(req,res)=>{try{await handler(req,res);}catch(error){
  if(!error.status)console.error('CWTS instructor:',error.code||error.message);
  res.status(error.status||500).json({message:error.status?error.message:'Unable to complete this request. Please refresh and try again.'});
}};
const fail=service.fail;
const rosterScope=`EXISTS (SELECT 1 FROM student_ms_records smr
  JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
  WHERE smr.student_id=s.id AND smr.program='CWTS' AND smr.status='approved'
  AND smr.ms_level=ses.ms_level AND es.year=ses.school_year AND smr.assignment_company=a.company)
  AND s.role='student' AND s.nstp_component='CWTS'`;
exports.management=endpoint(async(req,res)=>{
  const [instructors]=await db.execute('SELECT id,first_name,last_name,email,status,delivery_status,invitation_expires,invitation_sent_at FROM cwts_instructors ORDER BY last_name,first_name');
  const [sessions]=await db.execute("SELECT id,ms_level,school_year,mi_number,mi_type,open_date,close_date FROM attendance_sessions WHERE program='CWTS' ORDER BY open_date DESC,id DESC");
  const [assignments]=await db.execute(`SELECT a.*,i.first_name,i.last_name,i.status instructor_status,
    ses.mi_number,ses.mi_type,ses.ms_level,ses.school_year,ses.open_date
    FROM cwts_instructor_assignments a JOIN cwts_instructors i ON i.id=a.instructor_id
    JOIN attendance_sessions ses ON ses.id=a.attendance_session_id ORDER BY a.updated_at DESC,a.id DESC`);
  res.json({instructors,sessions,assignments,companies,email_ready:service.invitationReady()});
});
exports.create=endpoint(async(req,res)=>{
  const first=String(req.body.first_name||'').trim(),last=String(req.body.last_name||'').trim(),email=String(req.body.email||'').trim().toLowerCase();
  if(!first||!last||first.length>100||last.length>100||!isReasonableEmail(email))fail(400,'Enter the instructor’s first name, last name and a valid email address.');
  const [existing]=await db.execute('SELECT email FROM admins WHERE email=? UNION ALL SELECT email FROM students WHERE email=? UNION ALL SELECT email FROM cwts_instructors WHERE email=?',[email,email,email]);
  if(existing.length)fail(409,'This email already belongs to an account. Use the existing instructor account or enter a different email.');
  const [result]=await db.execute('INSERT INTO cwts_instructors(first_name,last_name,email,created_by) VALUES(?,?,?,?)',[first,last,email,req.user.email]);
  const response=await service.sendInvitation(result.insertId);
  res.status(201).json({...response,id:result.insertId});
});
exports.invite=endpoint(async(req,res)=>{
  const id=parsePositiveInt(req.params.id);if(!id)fail(400,'Invalid instructor.');
  res.json(await service.sendInvitation(id));
});
exports.accept=endpoint(async(req,res)=>{
  res.json(await service.acceptInvitation(req.body.token,req.body.password));
});
exports.setStatus=endpoint(async(req,res)=>{
  const id=parsePositiveInt(req.params.id),status=String(req.body.status||'');
  if(!id||!['active','disabled'].includes(status))fail(400,'Select a valid account action.');
  const [result]=await db.execute(`UPDATE cwts_instructors SET status=IF(?='disabled','disabled',IF(password IS NULL,'pending','active')),
    session_version=session_version+1,invitation_hash=NULL,invitation_expires=0 WHERE id=?`,[status,id]);
  if(!result.affectedRows)fail(404,'Instructor not found.');
  res.json({message:status==='disabled'?'Instructor access disabled immediately.':'Account enabled. If the instructor has not set a password, send a new invitation.'});
});
exports.assign=endpoint(async(req,res)=>{
  const instructorId=parsePositiveInt(req.body.instructor_id),sessionId=parsePositiveInt(req.body.session_id),company=String(req.body.company||'');
  if(!instructorId||!sessionId||!companies.includes(company))fail(400,'Select an instructor, company and CWTS session.');
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    const [[instructor]]=await connection.execute("SELECT id FROM cwts_instructors WHERE id=? AND status<>'disabled' FOR UPDATE",[instructorId]);
    const [[session]]=await connection.execute("SELECT id FROM attendance_sessions WHERE id=? AND program='CWTS' FOR UPDATE",[sessionId]);
    if(!instructor||!session)fail(400,'Select an enabled instructor and an existing CWTS attendance session.');
    const [activeAssignments]=await connection.execute('SELECT id FROM cwts_instructor_assignments WHERE instructor_id=? AND active=1 FOR UPDATE',[instructorId]);
    if(activeAssignments.length)fail(409,'This instructor already has an active assignment. Revoke all active assignments before assigning this instructor again.');
    const [occupied]=await connection.execute('SELECT id FROM cwts_instructor_assignments WHERE attendance_session_id=? AND company=? AND active=1 FOR UPDATE',[sessionId,company]);
    if(occupied.length)fail(409,'This company already has an instructor for this session. Choose another company or revoke the current assignment first.');
    await connection.execute(`INSERT INTO cwts_instructor_assignments(instructor_id,attendance_session_id,company,assigned_by)
      VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE instructor_id=VALUES(instructor_id),active=1,assigned_by=VALUES(assigned_by)`,[instructorId,sessionId,company,req.user.email]);
    await connection.commit();res.json({message:'Instructor assigned.'});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
});
exports.revoke=endpoint(async(req,res)=>{
  const id=parsePositiveInt(req.params.id);if(!id)fail(400,'Invalid assignment.');
  await db.execute('UPDATE cwts_instructor_assignments SET active=0,assigned_by=? WHERE id=?',[req.user.email,id]);
  res.json({message:'Assignment revoked. The instructor can no longer access this company and session.'});
});
exports.mine=endpoint(async(req,res)=>{
  const [rows]=await db.execute(`SELECT a.id,a.company,ses.id session_id,ses.mi_number,ses.mi_type,ses.ms_level,ses.school_year,ses.open_date,ses.close_date
    FROM cwts_instructor_assignments a JOIN attendance_sessions ses ON ses.id=a.attendance_session_id AND ses.program='CWTS'
    WHERE a.instructor_id=? AND a.active=1 ORDER BY ses.open_date DESC,a.company`,[req.user.id]);
  res.json(rows);
});
exports.records=endpoint(async(req,res)=>{
  const id=parsePositiveInt(req.params.id);if(!id)fail(400,'Invalid assignment.');
  const [[assignment]]=await db.execute('SELECT id FROM cwts_instructor_assignments WHERE id=? AND instructor_id=? AND active=1',[id,req.user.id]);
  if(!assignment)fail(403,'This assignment is no longer available to your account. Refresh your assignments.');
  const [rows]=await db.execute(`SELECT s.id student_internal_id,s.student_id,s.first_name,s.last_name,
    ar.id,COALESCE(ar.status,'unmarked') status,ar.record_version,ar.claimed_present,ar.false_present,ar.verified_by,ar.verified_at,
    ses.id session_id,ses.mi_number,ses.mi_type,ses.open_date FROM cwts_instructor_assignments a
    JOIN attendance_sessions ses ON ses.id=a.attendance_session_id AND ses.program='CWTS'
    JOIN students s ON ${rosterScope}
    LEFT JOIN attendance_records ar ON ar.student_id=s.id AND ar.attendance_session_id=ses.id
    WHERE a.id=? AND a.instructor_id=? AND a.active=1 ORDER BY s.last_name,s.first_name`,[id,req.user.id]);
  res.json(await decorateAttendanceUpdates(rows));
});
exports.verify=endpoint(async(req,res)=>{
  const id=parsePositiveInt(req.params.id),studentId=parsePositiveInt(req.params.studentId);
  const status=String(req.body.status||''),reason=String(req.body.reason||'').trim();
  if(!id||!studentId||!['present','late','absent'].includes(status)||!reason||reason.length>500)fail(400,'Choose Present, Late or Absent and give a reason of up to 500 characters.');
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    const [[instructor]]=await connection.execute("SELECT id,email FROM cwts_instructors WHERE id=? AND status='active' AND session_version=? FOR UPDATE",[req.user.id,req.user.session_version]);
    if(!instructor)fail(403,'Your instructor access has changed. Please sign in again.');
    const [[allowed]]=await connection.execute(`SELECT ses.* FROM cwts_instructor_assignments a
      JOIN attendance_sessions ses ON ses.id=a.attendance_session_id AND ses.program='CWTS'
      JOIN students s ON s.id=? AND ${rosterScope}
      WHERE a.id=? AND a.instructor_id=? AND a.active=1 FOR UPDATE`,[studentId,id,req.user.id]);
    if(!allowed)fail(403,'You may update only students in your assigned company and session. Refresh your assignments.');
    if(attendance.getEffectiveStatus(allowed)==='scheduled')fail(400,'This attendance session has not opened yet.');
    const [[before]]=await connection.execute('SELECT * FROM attendance_records WHERE student_id=? AND attendance_session_id=? FOR UPDATE',[studentId,allowed.id]);
    if(before ? (!Number.isSafeInteger(req.body.expected_version)||req.body.expected_version!==Number(before.record_version)) : req.body.expected_version!==null)
      fail(409,'This record has changed. Refresh and review it before saving.');
    const falseClaim=status==='absent'&&(offenses.isAttendanceClaim(before)||Number(before?.false_present)===1);
    const newFalseClaim=falseClaim&&!Number(before?.false_present);
    let recordId=before?.id;
    if(before){
      await connection.execute('UPDATE attendance_records SET status=?,false_present=?,verified_by=?,verified_at=NOW(),record_version=record_version+1,updated_at=NOW() WHERE id=?',[status,Number(falseClaim),instructor.email,recordId]);
    }else{
      const [insert]=await connection.execute(`INSERT INTO attendance_records(student_id,attendance_session_id,status,mi_number,mi_type,verified_by,verified_at,record_version)
        VALUES(?,?,?,?,?,?,NOW(),1)`,[studentId,allowed.id,status,allowed.mi_number,allowed.mi_type,instructor.email]);recordId=insert.insertId;
    }
    await connection.execute(`INSERT INTO cwts_attendance_verification_log(record_id,assignment_id,instructor_id,previous_status,status,reason,record_version,verified_at)
      SELECT ?,?,?,?,?,?,record_version,verified_at FROM attendance_records WHERE id=?`,[recordId,id,instructor.id,before?.status||'unmarked',status,reason,recordId]);
    const offense=offenses.isAttendanceClaim(before)||before?.false_present ? await offenses.reconcile(studentId,connection,newFalseClaim):null;
    await connection.commit();
    res.json({message:newFalseClaim?`Attendance updated. False-attendance offense recorded.${Number(offense?.offend)>=2?' Settlement is required.':' First-offense warning recorded.'}`
      :falseClaim?'Attendance updated. The offense was already recorded; no duplicate added.'
        :Number(before?.false_present)?'Attendance corrected. The false-attendance offense was removed.'
          :'Attendance saved. No punishment offense recorded.',offense_recorded:newFalseClaim});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
});
exports.audit=endpoint(async(req,res)=>{
  const [rows]=await db.execute(`SELECT l.*,s.student_id,s.first_name,s.last_name,i.first_name verifier_first_name,i.last_name verifier_last_name,
    a.company,ses.mi_number,ses.mi_type,ses.ms_level,ses.school_year,'CWTS' program,'Instructor' verifier_role
    FROM cwts_attendance_verification_log l JOIN attendance_records ar ON ar.id=l.record_id
    JOIN students s ON s.id=ar.student_id JOIN cwts_instructors i ON i.id=l.instructor_id
    JOIN cwts_instructor_assignments a ON a.id=l.assignment_id
    JOIN attendance_sessions ses ON ses.id=ar.attendance_session_id ORDER BY l.id DESC LIMIT 200`);
  res.json(rows);
});
