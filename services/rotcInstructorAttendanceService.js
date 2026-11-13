const {readAccess}=require('./instructorAssignmentHistoryService');
const scope=require('./instructorScopeService');
const {fail}=require('./instructorPortalService');
const attendance=require('./attendanceService');
const {decorateAttendanceUpdates}=require('./attendanceUpdateService');
async function overview(db,user,now=new Date()){
  if(user.program!=='ROTC')fail('ROTC instructor access is required.',403);
  const [sessions]=await db.execute(`SELECT DISTINCT ses.id,ses.mi_number,ses.mi_type,ses.ms_level,ses.school_year,ses.open_date,ses.close_date,ses.is_advance_course
    FROM attendance_sessions ses JOIN enrollment_schedules es ON es.program='ROTC' AND es.ms_level=ses.ms_level AND es.year=ses.school_year
    WHERE ses.program='ROTC' AND EXISTS(SELECT 1 FROM grade_instructor_assignments a WHERE a.schedule_id=es.id AND a.program='ROTC' AND ${readAccess('a','rotc_instructor_id')} AND a.company<>'' AND COALESCE(ses.is_advance_course,0)=IF(a.company='Advance Course',1,0))
    ORDER BY ses.open_date DESC,ses.mi_number,ses.mi_type`,[user.id]);
  const visible=sessions.map(s=>({...s,effective_status:attendance.getEffectiveStatus(s,now)})).filter(s=>s.effective_status!=='scheduled');
  const [rows]=await db.execute(`SELECT r.id enrollment_record_id,s.id student_internal_id,s.student_id,s.first_name,s.middle_name,s.last_name,s.course,
    r.assignment_battalion battalion,r.assignment_company company,r.assignment_platoon platoon,r.assignment_special_unit special_unit,r.assignment_is_advance is_advance_course,
    ses.id session_id,ses.mi_number,ses.mi_type,ses.school_year,ses.ms_level,ses.open_date,
    ar.id,COALESCE(ar.status,'unmarked') status,ar.created_at,ar.verified_by,ar.verified_at
    FROM student_ms_records r JOIN students s ON s.id=r.student_id AND s.role='student' AND s.nstp_component='ROTC'
    JOIN enrollment_schedules es ON es.id=CAST(r.schedule_id AS UNSIGNED) AND es.program='ROTC'
    JOIN attendance_sessions ses ON ses.program='ROTC' AND ses.ms_level=es.ms_level AND ses.school_year=es.year AND COALESCE(ses.is_advance_course,0)=COALESCE(r.assignment_is_advance,0)
    LEFT JOIN attendance_records ar ON ar.student_id=s.id AND ar.attendance_session_id=ses.id
    WHERE r.program='ROTC' AND r.status='approved'
    AND EXISTS(SELECT 1 FROM grade_instructor_assignments a WHERE a.schedule_id=es.id AND a.program='ROTC' AND ${readAccess('a','rotc_instructor_id')} AND ${scope.matches()})
    ORDER BY ses.open_date DESC,s.last_name,s.first_name`,[user.id]);
  const allowed=new Set(visible.map(s=>Number(s.id)));
  return {sessions:visible,records:await decorateAttendanceUpdates(rows.filter(r=>allowed.has(Number(r.session_id)))),read_only:true};
}
module.exports={overview};
