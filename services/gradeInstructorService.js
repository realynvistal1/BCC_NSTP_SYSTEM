const scope=require('./instructorScopeService');
const companies=require('./cwtsCompanyService');
const {isReasonableEmail}=require('./requestValidationService');
const tables={ROTC:'rotc_instructors',CWTS:'cwts_instructors'};
const columns={ROTC:'rotc_instructor_id',CWTS:'cwts_instructor_id'};
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function programTable(program){if(!tables[program])fail('Invalid program.');return tables[program];}
function id(value){if(!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value)))fail('Select a valid record.');return Number(value);}
async function management(db,program,scheduleId){
  const table=programTable(program);
  const [schedules]=await db.execute('SELECT id,program,ms_level,year,open_date,deadline FROM enrollment_schedules WHERE program=? ORDER BY id DESC',[program]);
  const selected=scheduleId? schedules.find(cycle=>Number(cycle.id)===id(scheduleId)):schedules[0];
  if(scheduleId&&!selected)fail('Enrollment schedule not found.',404);
  const [instructors]=await db.execute(`SELECT id,first_name,middle_name,last_name,email,status,review_status,review_note,requested_year,requested_level,profile_photo IS NOT NULL has_photo,created_at FROM ${table} ORDER BY last_name,first_name`);
  if(!selected)return {schedules,instructors,schedule:null,companies:[],assignments:[],approved_students:0};
  const [assignments]=await db.execute(`SELECT a.id,a.company,a.active,a.updated_at,COALESCE(a.rotc_instructor_id,a.cwts_instructor_id) instructor_id,
    i.first_name,i.last_name,i.email,i.status instructor_status,
    f.id latest_attachment_id,f.original_name latest_attachment_name,f.created_at latest_attachment_created_at
    FROM grade_instructor_assignments a
    JOIN ${table} i ON i.id=a.${columns[program]}
    LEFT JOIN instructor_grade_attachments f ON f.id=(
      SELECT MAX(upload.id) FROM instructor_grade_attachments upload
      WHERE upload.assignment_id=a.id AND upload.program=a.program AND upload.instructor_id=a.${columns[program]}
    ) WHERE a.schedule_id=? AND a.program=? AND a.active=1 ORDER BY a.company`,[selected.id,program]);
  const [[count]]=await db.execute("SELECT COUNT(*) total FROM student_ms_records WHERE program=? AND CAST(schedule_id AS UNSIGNED)=? AND status='approved'",[program,selected.id]);
  return {schedules,instructors,schedule:selected,companies:program==='CWTS'?(await companies.details(db,selected.id)).map(row=>row.name):await scope.available(db,selected.id),assignments,approved_students:Number(count.total)};
}
async function create(db,program,body,actor){
  const table=programTable(program);
  const first=String(body.first_name||'').trim(),last=String(body.last_name||'').trim(),email=String(body.email||'').trim().toLowerCase();
  if(!first||!last||first.length>100||last.length>100||!isReasonableEmail(email))fail('Enter the instructor’s first name, last name, and valid email.');
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    const [existing]=await connection.execute('SELECT email FROM admins WHERE email=? UNION ALL SELECT email FROM students WHERE email=? UNION ALL SELECT email FROM cwts_instructors WHERE email=? UNION ALL SELECT email FROM rotc_instructors WHERE email=?',[email,email,email,email]);
    if(existing.length)fail('This email already belongs to an account. Select the existing instructor or use another email.',409);
    const [added]=await connection.execute(`INSERT INTO ${table}(first_name,last_name,email,created_by) VALUES(?,?,?,?)`,[first,last,email,actor]);
    await connection.commit();return {id:added.insertId,first_name:first,last_name:last,email,status:'pending'};
  }catch(error){await connection.rollback();if(error.code==='ER_DUP_ENTRY')fail('An instructor with this email already exists.',409);throw error;}finally{connection.release();}
}
async function assign(db,program,body,actor){
  const table=programTable(program),scheduleId=id(body.schedule_id),instructorId=id(body.instructor_id);
  const company=String(body.company||'').trim();
  if(program==='ROTC'&&!scope.groups.includes(company))fail('Select a ROTC company or group.');
  if(program==='CWTS'&&(!company||company.length>30))fail('Select a company.');
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    const [[cycle]]=await connection.execute('SELECT id FROM enrollment_schedules WHERE id=? AND program=? FOR UPDATE',[scheduleId,program]);
    if(!cycle)fail('Enrollment schedule not found.',404);
    if(program==='ROTC'&&!(await scope.available(connection,scheduleId)).includes(company))fail('Select a company or group configured for this semester.');
    if(program==='CWTS'&&!(await companies.details(connection,scheduleId)).some(row=>row.name===company))fail('Select a company configured for this enrollment schedule.');
    const [[instructor]]=await connection.execute(`SELECT id,status,review_status FROM ${table} WHERE id=? FOR UPDATE`,[instructorId]);
    if(!instructor||instructor.status!=='active'||instructor.review_status!=='approved')fail('Select an approved, active instructor.');
    const [[before]]=await connection.execute('SELECT id,active,rotc_instructor_id,cwts_instructor_id FROM grade_instructor_assignments WHERE schedule_id=? AND company=? FOR UPDATE',[scheduleId,company]);
    const previous=before?.active?(before.rotc_instructor_id||before.cwts_instructor_id):null;
    await connection.execute(`INSERT INTO grade_instructor_assignments(program,schedule_id,company,rotc_instructor_id,cwts_instructor_id,assigned_by)
      VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE rotc_instructor_id=VALUES(rotc_instructor_id),cwts_instructor_id=VALUES(cwts_instructor_id),active=1,assigned_by=VALUES(assigned_by),updated_at=CURRENT_TIMESTAMP`,
    [program,scheduleId,company,program==='ROTC'?instructorId:null,program==='CWTS'?instructorId:null,actor]);
    const [[saved]]=await connection.execute('SELECT id FROM grade_instructor_assignments WHERE schedule_id=? AND company=?',[scheduleId,company]);
    await connection.execute('INSERT INTO grade_instructor_assignment_log(assignment_id,previous_instructor_id,instructor_id,changed_by) VALUES(?,?,?,?)',[saved.id,previous,instructorId,actor]);
    await connection.commit();return saved.id;
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
async function remove(db,program,assignmentId,actor){
  programTable(program);assignmentId=id(assignmentId);
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    const [[row]]=await connection.execute('SELECT * FROM grade_instructor_assignments WHERE id=? AND program=? AND active=1 FOR UPDATE',[assignmentId,program]);
    if(!row)fail('Instructor assignment not found.',404);
    await connection.execute('UPDATE grade_instructor_assignments SET active=0,assigned_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND program=?',[actor,assignmentId,program]);
    await connection.execute('INSERT INTO grade_instructor_assignment_log(assignment_id,previous_instructor_id,instructor_id,changed_by) VALUES(?,?,NULL,?)',[assignmentId,row.rotc_instructor_id||row.cwts_instructor_id,actor]);
    await connection.commit();
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
module.exports={management,create,assign,remove};
