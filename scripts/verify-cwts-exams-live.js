// Creates the two additive exam tables, then rolls back all test records.
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const db = require('../config/database');
const exam = require('../services/cwtsExamService');
const exams = require('../controllers/cwtsExamController');
const students = require('../controllers/studentController');
const admins = require('../controllers/sharedAdminController');
const captcha = require('../services/captchaService');
const response = () => ({ code:200, status(code){this.code=code;return this;}, json(body){this.body=body;return this;} });
async function invoke(handler, req) { const res=response();await handler(req,res);return res; }
async function main() {
  await require('../database/migrate-cwts-exam-results').ensureCwtsExamResults(db);
  const connection=await db.getConnection();
  const originalExecute=db.execute, originalConnection=db.getConnection, originalCaptcha=captcha.verifyToken;
  await connection.beginTransaction();
  const facade={execute:connection.execute.bind(connection),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}};
  db.execute=facade.execute;db.getConnection=async()=>facade;captcha.verifyToken=async()=>({ok:true});
  const stamp=Date.now();
  try {
    const [insert]=await db.execute("INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline,cwts_company_setup) VALUES('CWTS','1',?,?,?,?)",
      [`EXAM-${stamp}`,new Date(stamp-60000).toISOString(),new Date(stamp+3600000).toISOString(),JSON.stringify([{name:'Alpha',capacity:60}])]);
    const id=insert.insertId;
    let studentId;
    for(let attempt=0;attempt<20;attempt++) {
      studentId=`${require('node:crypto').randomInt(100000,999999)}-2099`;
      const [existing]=await db.execute('SELECT id FROM students WHERE student_id=?',[studentId]);
      if(!existing.length)break;
      studentId=null;
    }
    assert(studentId);
    const body={student_id:studentId,first_name:'Exam Test',last_name:'Rollback',course:'BS Information Technology',
      email:`exam-${stamp}@example.invalid`,password:'Test-password123!',confirm_password:'Test-password123!',
      nstp_component:'CWTS',year_level:'1st Year',sex:'Male',birthdate:'2005-01-01',height:'170',weight:'60',blood_type:'O+',
      has_medical_condition:0,contact_number:'09123456789',emergency_contact_contact_number:'09123456789',
      photo:'data:image/png;base64,aGVsbG8=',medical_certificate:'data:application/pdf;base64,aGVsbG8=',cor_file:'data:application/pdf;base64,aGVsbG8='};
    for(const key of ['religion','place_of_birth','temporary_barangay','temporary_municipality','temporary_province','permanent_barangay','permanent_municipality','permanent_province','father_name','father_occupation','mother_name','mother_occupation','emergency_contact_name','emergency_contact_address','emergency_contact_relationship','complexion'])body[key]='Test';
    const missing=await invoke(students.register,{body});assert.equal(missing.code,409,JSON.stringify(missing.body));
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
      ['Student ID','First Name','Middle Name','Last Name','Sex','Course','Result'],[studentId,body.first_name,body.middle_name || '',body.last_name,body.sex,'BSIT','Passed']]),'Results');
    const buffer=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
    const file={buffer,size:buffer.length,originalname:'exam-test.xlsx',mimetype:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
    const req={params:{id},file,user:{email:'exam-test@example.invalid'}};
    const preview=await invoke(exams.preview,req);assert.equal(preview.code,200);
    const imported=await invoke(exams.import,{...req,body:{revision:preview.body.revision}});assert.equal(imported.code,200,JSON.stringify(imported.body));
    const submitted=await invoke(students.register,{body});assert.equal(submitted.code,201,JSON.stringify(submitted.body));
    const [[record]]=await db.execute('SELECT r.id,r.student_id FROM student_ms_records r JOIN students s ON s.id=r.student_id WHERE s.student_id=?',[studentId]);
    const detail=await invoke(admins.enrollmentDetail,{params:{id:record.id,program:'cwts'}});
    assert.equal(detail.code,200);assert.equal(detail.body.exam_eligibility.eligible,true);
    await db.execute("UPDATE cwts_exam_results SET result='failed' WHERE schedule_id=? AND student_id=?",[id,studentId]);
    const refused=await invoke(admins.updateEnrollment,{params:{id:record.id,program:'cwts'},body:{status:'approved'}});assert.equal(refused.code,409);
    await db.execute("UPDATE cwts_exam_results SET result='passed' WHERE schedule_id=? AND student_id=?",[id,studentId]);
    const approved=await invoke(admins.updateEnrollment,{params:{id:record.id,program:'cwts'},body:{status:'approved'}});assert.equal(approved.code,200,JSON.stringify(approved.body));
    const [[saved]]=await db.execute('SELECT status FROM student_ms_records WHERE id=?',[record.id]);assert.equal(saved.status,'approved');
    // A missing exam record in another schedule must never inherit this schedule's passing result.
    assert.equal((await exam.eligibility(db,id+1000000,body)).eligible,false);
    console.log('PASS: real MySQL import, registration gate, successful submission, admin comparison, approval recheck and schedule isolation. All fixtures rolled back.');
  } finally {
    db.execute=originalExecute;db.getConnection=originalConnection;captcha.verifyToken=originalCaptcha;
    await connection.rollback();connection.release();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.end());
