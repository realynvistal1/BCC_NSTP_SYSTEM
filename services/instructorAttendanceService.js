const {id,fail}=require('./instructorPortalService');
const attendance=require('./attendanceService');
const offenses=require('./offenseService');

function scopeIds(value){
  const match=/^([1-9]\d*)-([1-9]\d*)$/.exec(String(value));
  if(!match)fail('Refresh attendance and choose a company session.');
  return [id(match[1]),id(match[2])];
}
function requireCwts(user){if(user.program!=='CWTS')fail('This attendance page is for CWTS instructors.',403);}
const scopeJoin=`FROM grade_instructor_assignments a
  JOIN enrollment_schedules es ON es.id=a.schedule_id AND es.program='CWTS'
  JOIN attendance_sessions ses ON ses.program='CWTS' AND ses.ms_level=es.ms_level AND ses.school_year=es.year`;
const studentScope=`EXISTS (SELECT 1 FROM student_ms_records r
  WHERE r.student_id=s.id AND r.program='CWTS' AND r.status='approved'
    AND CAST(r.schedule_id AS UNSIGNED)=a.schedule_id AND r.assignment_company=a.company)
  AND s.role='student' AND s.nstp_component='CWTS'`;
async function list(db,user,now=new Date()){
  requireCwts(user);
  const [rows]=await db.execute(`SELECT a.id company_assignment_id,a.company,ses.id session_id,
    ses.mi_number,ses.mi_type,ses.ms_level,ses.school_year,ses.open_date,ses.close_date
    ${scopeJoin} WHERE a.program='CWTS' AND a.cwts_instructor_id=? AND a.active=1
    ORDER BY ses.open_date DESC,a.company`,[user.id]);
  return rows.map(row=>({...row,id:`${row.company_assignment_id}-${row.session_id}`,effective_status:attendance.getEffectiveStatus(row,now)}))
    .filter(row=>row.effective_status!=='scheduled')
    .sort((a,b)=>Number(['open','late'].includes(b.effective_status))-Number(['open','late'].includes(a.effective_status)));
}
async function allowed(db,user,value,lock=false){
  requireCwts(user);const [assignmentId,sessionId]=scopeIds(value);
  const [[row]]=await db.execute(`SELECT ses.*,a.id company_assignment_id,a.company,a.schedule_id ${scopeJoin}
    WHERE a.id=? AND ses.id=? AND a.program='CWTS' AND a.active=1 AND a.cwts_instructor_id=? ${lock?'FOR UPDATE':''}`,[assignmentId,sessionId,user.id]);
  if(!row)fail('This company or attendance session is not assigned to your account. Refresh attendance.',403);
  if(attendance.getEffectiveStatus(row)==='scheduled')fail('This attendance session has not opened yet.');
  return row;
}
async function records(db,user,value){
  await allowed(db,user,value);const [assignmentId,sessionId]=scopeIds(value);
  const [rows]=await db.execute(`SELECT s.id student_internal_id,s.student_id,s.first_name,s.middle_name,s.last_name,
    ar.id,COALESCE(ar.status,'unmarked') status,ar.record_version,ar.claimed_present,ar.false_present,ar.verified_by,ar.verified_at,
    ses.id session_id,ses.mi_number,ses.mi_type,ses.open_date ${scopeJoin}
    JOIN students s ON ${studentScope}
    LEFT JOIN attendance_records ar ON ar.student_id=s.id AND ar.attendance_session_id=ses.id
    WHERE a.id=? AND ses.id=? AND a.program='CWTS' AND a.cwts_instructor_id=? AND a.active=1 ORDER BY s.last_name,s.first_name`,[assignmentId,sessionId,user.id]);
  return rows;
}
async function verify(db,user,value,studentId,body){
  requireCwts(user);studentId=id(studentId);const status=String(body.status||''),reason=String(body.reason||'').trim();
  if(!['present','late','absent'].includes(status)||!reason||reason.length>500)fail('Choose Present, Late or Absent and give a reason of up to 500 characters.');
  const c=await db.getConnection();
  try{
    await c.beginTransaction();
    const [[instructor]]=await c.execute("SELECT id,email FROM cwts_instructors WHERE id=? AND status='active' AND review_status='approved' AND session_version=? FOR UPDATE",[user.id,user.session_version]);
    if(!instructor)fail('Your instructor access has changed. Please sign in again.',401);
    const session=await allowed(c,user,value,true);
    const [[student]]=await c.execute(`SELECT s.id FROM grade_instructor_assignments a JOIN students s ON ${studentScope}
      WHERE a.id=? AND a.cwts_instructor_id=? AND a.program='CWTS' AND a.active=1 AND s.id=? FOR UPDATE`,[session.company_assignment_id,user.id,studentId]);
    if(!student)fail('You may update only students in your assigned company.',403);
    const [[before]]=await c.execute('SELECT * FROM attendance_records WHERE student_id=? AND attendance_session_id=? FOR UPDATE',[studentId,session.id]);
    if(before?(!Number.isSafeInteger(body.expected_version)||body.expected_version!==Number(before.record_version)):body.expected_version!==null)fail('This attendance record changed. Refresh and review it before saving.',409);
    if(before?.status===status)fail('Attendance is already marked with this status.');
    const falseClaim=status==='absent'&&(offenses.isAttendanceClaim(before)||Number(before?.false_present)===1),newFalseClaim=falseClaim&&!Number(before?.false_present);
    let recordId=before?.id;
    if(before)await c.execute('UPDATE attendance_records SET status=?,false_present=?,verified_by=?,verified_at=NOW(),record_version=record_version+1,updated_at=NOW() WHERE id=?',[status,Number(falseClaim),instructor.email,recordId]);
    else{const [added]=await c.execute(`INSERT INTO attendance_records(student_id,attendance_session_id,status,mi_number,mi_type,verified_by,verified_at,record_version) VALUES(?,?,?,?,?,?,NOW(),1)`,[studentId,session.id,status,session.mi_number,session.mi_type,instructor.email]);recordId=added.insertId;}
    // Keep the existing audit history format. Access is checked against the company assignment above.
    await c.execute(`INSERT INTO cwts_instructor_assignments(instructor_id,attendance_session_id,company,assigned_by)
      VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE instructor_id=VALUES(instructor_id),active=1,assigned_by=VALUES(assigned_by)`,[user.id,session.id,session.company,'company-assignment']);
    const [[auditScope]]=await c.execute('SELECT id FROM cwts_instructor_assignments WHERE attendance_session_id=? AND company=?',[session.id,session.company]);
    await c.execute(`INSERT INTO cwts_attendance_verification_log(record_id,assignment_id,instructor_id,previous_status,status,reason,record_version,verified_at)
      SELECT ?,?,?,?,?,?,record_version,verified_at FROM attendance_records WHERE id=?`,[recordId,auditScope.id,user.id,before?.status||'unmarked',status,reason,recordId]);
    const offense=offenses.isAttendanceClaim(before)||before?.false_present?await offenses.reconcile(studentId,c,newFalseClaim):null;
    await c.commit();
    return {message:newFalseClaim?`Attendance updated. False-attendance offense recorded.${Number(offense?.offend)>=2?' Settlement is required.':''}`:Number(before?.false_present)&&!falseClaim?'Attendance corrected. The false-attendance offense was removed.':'Attendance saved.',offense_recorded:newFalseClaim};
  }catch(e){await c.rollback();throw e;}finally{c.release();}
}
module.exports={scopeIds,list,records,verify};
