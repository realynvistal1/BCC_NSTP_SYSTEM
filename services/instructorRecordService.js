const details=require('./studentDetailService');
const accounts=require('./instructorPortalService');
async function list(db,user,query={},includePhoto=false){
  accounts.table(user.program);
  const column=user.program==='CWTS'?'cwts_instructor_id':'rotc_instructor_id';
  const params=[user.program,user.id];
  let extra='';
  if(query.recordId){const id=accounts.id(query.recordId);extra=' AND r.id=?';params.push(id);}
  const [rows]=await db.execute(`SELECT ${details.projection('s')},s.id student_db_id,s.student_id student_no,
    r.id record_id,r.ms_level,r.status enrollment_status,es.year school_year,r.assignment_company company,
    r.assignment_battalion battalion,r.assignment_company rotc_company,r.assignment_platoon rotc_platoon,r.assignment_special_unit special_unit,
    g.midterm,g.final_term,g.status grade_status ${includePhoto?',s.photo profile_photo':''}
    FROM student_ms_records r JOIN students s ON s.id=r.student_id
    JOIN enrollment_schedules es ON es.id=CAST(r.schedule_id AS UNSIGNED) AND es.program=r.program
    LEFT JOIN student_grade_attempts g ON g.enrollment_record_id=r.id
    WHERE r.program=? AND r.status='approved' AND s.role='student'
    AND r.id=(SELECT MAX(latest.id) FROM student_ms_records latest WHERE latest.student_id=r.student_id AND latest.program=r.program AND latest.ms_level=r.ms_level AND latest.status IN ('approved','withdrawn','dropped'))
    AND EXISTS(SELECT 1 FROM grade_instructor_assignments a WHERE a.program=r.program AND a.schedule_id=es.id AND a.${column}=? AND a.active=1 ${user.program==='CWTS'?'AND a.company=r.assignment_company':''})${extra}
    ORDER BY s.last_name,s.first_name`,params);
  const search=String(query.search||'').trim().toLowerCase();
  return rows.filter(r=>(!query.year||r.school_year===query.year)&&(!query.level||String(r.ms_level)===String(query.level))&&(!query.company||r.company===query.company)&&(!query.course||r.course===query.course)&&(!query.sex||r.sex===query.sex)&&(!search||`${r.student_no} ${r.last_name} ${r.first_name} ${r.middle_name||''}`.toLowerCase().includes(search))).map(r=>{for(const key of ['photo','medical_certificate','xray_file','cor_file'])delete r[key];if(includePhoto){r.photo=r.profile_photo;delete r.profile_photo;}return r;});
}
async function detail(db,user,id){const rows=await list(db,user,{recordId:id});if(!rows.length)accounts.fail('This record is not in your assigned company or class.',403);const student=rows[0];
  const [[attendance],[grades],[serials],[settings],withdrawalResult]=await Promise.all([
    db.execute(`SELECT ar.status,ar.created_at,ses.mi_number,ses.mi_type FROM attendance_records ar JOIN attendance_sessions ses ON ses.id=ar.attendance_session_id WHERE ar.student_id=? AND ses.program=? AND (ses.ms_level=? OR ses.ms_level IS NULL) AND (ses.school_year=? OR ses.school_year IS NULL) ORDER BY ses.mi_number,FIELD(ses.mi_type,'in','out'),ar.created_at`,[student.student_db_id,user.program,student.ms_level,student.school_year]),
    db.execute('SELECT ms_level,midterm,final_term,grade,status FROM student_grades WHERE student_id=? AND program=? ORDER BY ms_level',[student.student_db_id,user.program]),
    db.execute('SELECT serial_number,created_at FROM serial_numbers WHERE student_id=? AND program=? ORDER BY id DESC LIMIT 1',[student.student_db_id,user.program]),
    db.execute('SELECT program FROM serial_number_settings WHERE program=? LIMIT 1',[user.program]),
    user.program==='ROTC'?db.execute('SELECT reason,status,admin_remarks,created_at FROM advance_course_withdrawals WHERE student_id=? ORDER BY created_at DESC',[student.student_db_id]):Promise.resolve([[]])
  ]);
  return {...student,attendance,grade_history:grades,certificate_serial:serials[0]||null,certificate_available:Boolean(serials.length&&settings.length),withdrawals:withdrawalResult[0]};
}
module.exports={list,detail};
