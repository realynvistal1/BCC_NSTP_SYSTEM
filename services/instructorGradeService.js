const {table,id,fail}=require('./instructorPortalService');
const grades=require('./gradesService');
const column=program=>program==='ROTC'?'rotc_instructor_id':'cwts_instructor_id';
function grade(value){
  if((typeof value!=='number'&&typeof value!=='string')||!/^\d(?:\.\d{1,2})?$/.test(String(value)))fail('Enter grades from 1.00 to 5.00, with up to two decimal places.');
  const n=Number(value);if(n<1||n>5)fail('Midterm and Final grades must be from 1.00 to 5.00.');return n;
}
async function activeAccount(c,user){
  const [[row]]=await c.execute(`SELECT id FROM ${table(user.program)} WHERE id=? AND status='active' AND review_status='approved' AND session_version=? FOR UPDATE`,[user.id,user.session_version]);
  if(!row)fail('Your instructor access has changed. Please sign in again.',401);
}
async function assignment(c,user,value,lock=false){
  const [[row]]=await c.execute(`SELECT a.*,es.ms_level,es.year FROM grade_instructor_assignments a
    JOIN enrollment_schedules es ON es.id=a.schedule_id AND es.program=a.program
    WHERE a.id=? AND a.program=? AND a.${column(user.program)}=? AND a.active=1 ${lock?'FOR UPDATE':''}`,[id(value),user.program,user.id]);
  if(!row)fail('This assignment is no longer available to your account.',403);return row;
}
async function roster(c,a,lock=false){
  // Access follows the saved enrollment attempt and company, never a student ID supplied alone.
  const [rows]=await c.execute(`SELECT r.id enrollment_record_id,r.student_id,s.student_id student_no,s.first_name,s.middle_name,s.last_name,s.course,
    g.midterm saved_midterm,g.final_term saved_final,g.status saved_status
    FROM student_ms_records r JOIN students s ON s.id=r.student_id
    LEFT JOIN student_grade_attempts g ON g.enrollment_record_id=r.id
    WHERE r.program=? AND CAST(r.schedule_id AS UNSIGNED)=? AND r.status='approved' AND s.role='student'
      AND r.id=(SELECT MAX(latest.id) FROM student_ms_records latest WHERE latest.student_id=r.student_id AND latest.program=r.program AND latest.ms_level=r.ms_level AND latest.status IN ('approved','withdrawn','dropped'))
      ${a.program==='CWTS'?'AND r.assignment_company=?':''} ORDER BY s.last_name,s.first_name ${lock?'FOR UPDATE':''}`,
    a.program==='CWTS'?[a.program,a.schedule_id,a.company]:[a.program,a.schedule_id]);
  return rows;
}
async function assignments(db,user){
  table(user.program);
  const [rows]=await db.execute(`SELECT a.id,a.company,a.schedule_id,es.ms_level,es.year FROM grade_instructor_assignments a
    JOIN enrollment_schedules es ON es.id=a.schedule_id AND es.program=a.program
    WHERE a.program=? AND a.${column(user.program)}=? AND a.active=1 ORDER BY es.id DESC,a.company`,[user.program,user.id]);return rows;
}
async function records(db,user,assignmentId){
  const a=await assignment(db,user,assignmentId),students=await roster(db,a);
  const [submissions]=await db.execute('SELECT id,enrollment_record_id,midterm,final_term,status,version,review_note FROM instructor_grade_submissions WHERE assignment_id=? AND program=?',[a.id,user.program]);
  return {assignment:a,students:students.map(s=>({...s,submission:submissions.find(g=>Number(g.enrollment_record_id)===Number(s.enrollment_record_id))||null}))};
}
async function log(c,s,action,actor,note=''){
  await c.execute('INSERT INTO instructor_grade_review_log(submission_id,action,midterm,final_term,version,note,actor) VALUES(?,?,?,?,?,?,?)',[s.id,action,s.midterm,s.final_term,s.version,note,actor]);
}
async function save(db,user,assignmentId,recordId,body){
  recordId=id(recordId);const mid=grade(body.midterm),fin=grade(body.final_term);
  if(!['draft','submitted'].includes(body.action))fail('Select Save Draft or Submit.');
  const c=await db.getConnection();
  try{
    await c.beginTransaction();await activeAccount(c,user);
    const a=await assignment(c,user,assignmentId,true),students=await roster(c,a,true);
    const student=students.find(s=>Number(s.enrollment_record_id)===recordId);
    if(!student)fail('You can enter grades only for students in your current assignment.',403);
    if(student.saved_final!==null)fail('Grades for this enrollment have already been approved.',409);
    const [[before]]=await c.execute('SELECT * FROM instructor_grade_submissions WHERE enrollment_record_id=? FOR UPDATE',[recordId]);
    if((before&&body.expected_version!==Number(before.version))||(!before&&body.expected_version!==null))fail('These grades changed. Refresh the page before saving.',409);
    if(before&&['submitted','approved'].includes(before.status))fail('Submitted grades are locked. The admin must return them before you can make corrections.',409);
    if(before){
      await c.execute(`UPDATE instructor_grade_submissions SET assignment_id=?,instructor_id=?,midterm=?,final_term=?,status=?,version=version+1,review_note='',reviewed_by=NULL,reviewed_at=NULL,submitted_at=IF(?='submitted',NOW(),NULL) WHERE id=?`,[a.id,user.id,mid,fin,body.action,body.action,before.id]);
    }else{
      await c.execute(`INSERT INTO instructor_grade_submissions(enrollment_record_id,assignment_id,instructor_id,program,midterm,final_term,status,submitted_at) VALUES(?,?,?,?,?,?,?,IF(?='submitted',NOW(),NULL))`,[recordId,a.id,user.id,user.program,mid,fin,body.action,body.action]);
    }
    const [[saved]]=await c.execute('SELECT * FROM instructor_grade_submissions WHERE enrollment_record_id=?',[recordId]);
    await log(c,saved,body.action,user.email);await c.commit();
    return {message:body.action==='submitted'?'Grades submitted for admin review.':'Draft saved.'};
  }catch(e){await c.rollback();throw e;}finally{c.release();}
}
async function reviewList(db,program){
  const t=table(program);
  const [rows]=await db.execute(`SELECT g.*,s.student_id student_no,s.first_name,s.middle_name,s.last_name,s.course,
    es.year,es.ms_level,a.company,i.first_name instructor_first_name,i.last_name instructor_last_name
    FROM instructor_grade_submissions g JOIN student_ms_records r ON r.id=g.enrollment_record_id
    JOIN students s ON s.id=r.student_id JOIN enrollment_schedules es ON es.id=CAST(r.schedule_id AS UNSIGNED)
    JOIN grade_instructor_assignments a ON a.id=g.assignment_id JOIN ${t} i ON i.id=g.instructor_id
    WHERE g.program=? AND g.status<>'draft' ORDER BY FIELD(g.status,'submitted','returned','approved'),g.updated_at DESC`,[program]);return rows;
}
async function review(db,program,submissionId,body,actor){
  table(program);submissionId=id(submissionId);
  const action=String(body.action||''),note=String(body.note||'').trim();
  if(!['approve','return'].includes(action)||note.length>500)fail('Select Approve or Return. Notes must be 500 characters or fewer.');
  if(action==='return'&&!note)fail('Enter what the instructor needs to correct.');
  const c=await db.getConnection();
  try{
    await c.beginTransaction();
    const [[g]]=await c.execute('SELECT * FROM instructor_grade_submissions WHERE id=? AND program=? FOR UPDATE',[submissionId,program]);
    if(!g)fail('Grade submission not found.',404);
    if(g.status!=='submitted'||body.expected_version!==Number(g.version))fail('This submission changed or was already reviewed. Refresh the page.',409);
    if(action==='approve'){
      const [[a]]=await c.execute('SELECT * FROM grade_instructor_assignments WHERE id=? AND program=? AND active=1 FOR UPDATE',[g.assignment_id,program]);
      if(!a||Number(a[column(program)])!==Number(g.instructor_id))fail('The instructor assignment changed. Return these grades for the assigned instructor to check.',409);
      const [[instructor]]=await c.execute(`SELECT id FROM ${table(program)} WHERE id=? AND status='active' AND review_status='approved' FOR UPDATE`,[g.instructor_id]);
      if(!instructor)fail('This instructor account is no longer approved and active.',409);
      const students=await roster(c,a,true),student=students.find(s=>Number(s.enrollment_record_id)===Number(g.enrollment_record_id));
      if(!student)fail('The student enrollment or company assignment changed. Return these grades for correction.',409);
      if(student.saved_final!==null)fail('This enrollment already has approved grades.',409);
      const [[record]]=await c.execute('SELECT * FROM student_ms_records WHERE id=?',[g.enrollment_record_id]);
      // Publish the rounded Midterm/Final average using the course passing threshold.
      const final=grades.calculateGrade(g.midterm,g.final_term),status=grades.statusFromGrade(final,student.course);
      await require('./gradeAttemptService').save(c,record,g.midterm,g.final_term,final,status);
      await c.execute(`INSERT INTO student_grades(student_id,ms_level,program,midterm,final_term,grade,status) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE midterm=VALUES(midterm),final_term=VALUES(final_term),grade=VALUES(grade),status=VALUES(status),updated_at=NOW()`,[record.student_id,record.ms_level,program,g.midterm,g.final_term,final,status]);
    }
    await c.execute('UPDATE instructor_grade_submissions SET status=?,review_note=?,reviewed_by=?,reviewed_at=NOW(),version=version+1 WHERE id=?',[action==='approve'?'approved':'returned',note,actor,g.id]);
    await log(c,{...g,version:Number(g.version)+1},action,actor,note);await c.commit();
    return {message:action==='approve'?'Grades approved and published.':'Grades returned to the instructor for correction.'};
  }catch(e){await c.rollback();throw e;}finally{c.release();}
}
module.exports={grade,assignments,records,save,reviewList,review};
