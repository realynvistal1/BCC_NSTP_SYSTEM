const {readAccess}=require('./instructorAssignmentHistoryService');
const instructorScope=require('./instructorScopeService');
const auth=require('./authService');
const sharp=require('sharp');
const {isReasonableEmail}=require('./requestValidationService');
const {parseDataUrl,validateImageUpload}=require('./uploadValidationService');
const TABLES=Object.freeze({ROTC:'rotc_instructors',CWTS:'cwts_instructors'});
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function table(program){if(typeof program!=='string'||!Object.hasOwn(TABLES,program))fail('Select ROTC or CWTS.');return TABLES[program];}
function id(value){if(!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value)))fail('Select a valid record.');return Number(value);}
function details(body){
  const first=String(body.first_name||'').trim(),middle=String(body.middle_name||'').trim(),last=String(body.last_name||'').trim();
  const email=String(body.email||'').trim().toLowerCase(),year=String(body.school_year||'').trim(),level=String(body.level||'');
  table(body.program);
  if(!first||!last||[first,middle,last].some(v=>v.length>100||/[\x00-\x1f]/.test(v)))fail('Enter your first name and last name. Names must be 100 characters or fewer.');
  if(!isReasonableEmail(email))fail('Enter a valid email address.');
  if(!/^\d{4}-\d{4}$/.test(year)||Number(year.slice(5))!==Number(year.slice(0,4))+1)fail('Enter a school year such as 2026-2027.');
  if(!['1','2'].includes(level))fail('Select NSTP 1 or NSTP 2.');
  if(typeof body.password!=='string'||Buffer.byteLength(body.password,'utf8')>72)fail('Password must not exceed 72 bytes.');
  const message=auth.passwordValidationMessage(body.password);if(message)fail(message);
  if(body.password!==body.confirm_password)fail('Passwords do not match.');
  return {first,middle,last,email,year,level,program:body.program};
}
async function photo(value){
  try{
    validateImageUpload(value,{label:'Profile photo',required:true,maxBytes:3*1024*1024});
    const parsed=parseDataUrl(value);
    const image=sharp(parsed.buffer,{limitInputPixels:16000000,animated:false});
    const meta=await image.metadata();
    if(!['jpeg','png','webp'].includes(meta.format)||meta.width<80||meta.height<80)fail('Choose a clear JPG, PNG, or WEBP portrait, at least 80 pixels wide and high.');
    const buffer=await image.rotate().resize(480,600,{fit:'cover',position:'attention'}).jpeg({quality:85}).toBuffer();
    // Re-encode the image, remove metadata, and store no executable file or public upload path.
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  }catch(error){if(error.status)throw error;fail(error.message.includes('Profile photo')?error.message:'Choose a valid JPG, PNG, or WEBP profile photo (up to 3 MB).');}
}
async function registrationYears(db,program,level){
  table(program);level=String(level||'');
  if(!['1','2'].includes(level))fail('Select NSTP 1 or NSTP 2.');
  const [rows]=await db.execute('SELECT DISTINCT year FROM enrollment_schedules WHERE program=? AND ms_level=? ORDER BY year DESC',[program,level]);
  return rows.map(row=>row.year);
}
async function requireRegistrationSchedule(db,data,lock=false){
  const [[schedule]]=await db.execute('SELECT id FROM enrollment_schedules WHERE program=? AND ms_level=? AND year=? LIMIT 1'+(lock?' FOR UPDATE':''),[data.program,data.level,data.year]);
  if(!schedule)fail('Select a school year with an enrollment schedule for your component and NSTP level. Refresh the school year list and try again.');
}
async function register(db,body){
  const data=details(body);
  await requireRegistrationSchedule(db,data);
  const portrait=await photo(body.profile_photo),password=await auth.hashPassword(body.password);
  const c=await db.getConnection();
  try{
    await c.beginTransaction();
    // Recheck while locked so a removed schedule cannot leave an invalid registration.
    await requireRegistrationSchedule(c,data,true);
    // Serialize registration across both component tables, which use independent primary keys.
    await c.execute("SELECT id FROM admins ORDER BY id FOR UPDATE");
    const [existing]=await c.execute('SELECT email FROM admins WHERE email=? UNION ALL SELECT email FROM students WHERE email=? UNION ALL SELECT email FROM cwts_instructors WHERE email=? UNION ALL SELECT email FROM rotc_instructors WHERE email=?',[data.email,data.email,data.email,data.email]);
    if(existing.length)fail('This email already has an account. Sign in with your existing account or contact the admin.',409);
    const [added]=await c.execute(`INSERT INTO ${table(data.program)}(first_name,middle_name,last_name,email,password,profile_photo,requested_year,requested_level,created_by,status,review_status) VALUES(?,?,?,?,?,?,?,?,?,'pending','pending')`,
      [data.first,data.middle,data.last,data.email,password,portrait,data.year,data.level,'self-registration']);
    await c.commit();return {id:added.insertId,message:'Registration submitted. Please wait for your '+data.program+' admin to approve your account.'};
  }catch(e){await c.rollback();if(e.code==='ER_DUP_ENTRY')fail('This email already has an account.',409);throw e;}finally{c.release();}
}
async function findLogin(db,address){
  for(const program of ['ROTC','CWTS']){
    const [[account]]=await db.execute(`SELECT id,email,password,first_name,middle_name,last_name,status,review_status,review_note,session_version,'instructor' role,? program FROM ${table(program)} WHERE email=? AND password IS NOT NULL`,[program,address]);
    if(account)return account;
  }
  return null;
}
async function review(db,program,accountId,body,actor){
  accountId=id(accountId);const decision=String(body.decision||''),note=String(body.note||'').trim();
  if(!['approved','rejected'].includes(decision)||note.length>500)fail('Select Approve or Reject. Notes must be 500 characters or fewer.');
  if(decision==='rejected'&&!note)fail('Enter a reason so the instructor knows why the account was rejected.');
  const c=await db.getConnection();
  try{
    await c.beginTransaction();
    const [[account]]=await c.execute(`SELECT * FROM ${table(program)} WHERE id=? FOR UPDATE`,[accountId]);
    if(!account)fail('Instructor not found.',404);
    if(account.review_status!=='pending')fail('This registration has already been reviewed. Refresh the page.',409);
    if(decision==='approved'&&(!account.password||!account.profile_photo||!account.requested_year||!account.requested_level))fail('The instructor must complete their account registration and upload a profile photo before approval.');
    await c.execute(`UPDATE ${table(program)} SET review_status=?,status=?,review_note=?,reviewed_by=?,reviewed_at=NOW(),session_version=session_version+1,invitation_hash=NULL,invitation_expires=0 WHERE id=?`,[decision,decision==='approved'?'active':'disabled',note,actor,accountId]);
    await c.execute('INSERT INTO instructor_account_reviews(program,instructor_id,decision,note,reviewed_by) VALUES(?,?,?,?,?)',[program,accountId,decision,note,actor]);
    await c.commit();return {message:decision==='approved'?'Account approved. You can now assign this instructor.':'Registration rejected.'};
  }catch(e){await c.rollback();throw e;}finally{c.release();}
}
async function profile(db,user){
  const [[row]]=await db.execute(`SELECT id,first_name,middle_name,last_name,email,requested_year,requested_level,status,review_status FROM ${table(user.program)} WHERE id=?`,[user.id]);
  return {...row,program:user.program,photo_url:'/api/instructor/profile/photo'};
}
async function portrait(db,program,accountId){
  const [[row]]=await db.execute(`SELECT profile_photo FROM ${table(program)} WHERE id=?`,[id(accountId)]);
  const parsed=parseDataUrl(row?.profile_photo);if(!parsed)fail('No profile photo uploaded.',404);return parsed;
}
async function studentPortrait(db,user,studentId){
  table(user.program);studentId=id(studentId);
  const column=user.program==='ROTC'?'rotc_instructor_id':'cwts_instructor_id';
  const [[student]]=await db.execute(`SELECT s.photo FROM students s
    WHERE s.id=? AND s.role='student' AND s.nstp_component=? AND EXISTS (
      SELECT 1 FROM grade_instructor_assignments a JOIN student_ms_records r
        ON CAST(r.schedule_id AS UNSIGNED)=a.schedule_id AND r.program=a.program AND r.status='approved'
      WHERE a.program=? AND ${readAccess('a',column)} AND a.company<>'' AND r.student_id=s.id
        ${user.program==='CWTS'?'AND r.assignment_company=a.company':'AND '+instructorScope.matches()})`,[studentId,user.program,user.program,user.id]);
  if(!student)fail('This student is not in your assigned company or class.',403);
  const parsed=parseDataUrl(student.photo);
  if(!parsed||!['image/jpeg','image/png','image/webp'].includes(parsed.mimeType))fail('No student profile photo available.',404);
  return parsed;
}
module.exports={table,id,fail,details,photo,register,findLogin,review,profile,portrait,registrationYears,requireRegistrationSchedule,studentPortrait};
