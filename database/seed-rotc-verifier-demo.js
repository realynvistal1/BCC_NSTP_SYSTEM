const db=require('../config/database');
const bcrypt=require('bcryptjs');
const demoStudents=[
  ['990001-0001','Adam','Male',1,null,null,null,null],
  ['990001-0002','Anna','Female',1,null,null,null,null],
];
async function main(){
  const connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    const [schedules]=await connection.execute("SELECT id,ms_level FROM enrollment_schedules WHERE program='ROTC' AND year='2026-2027'");
    if(!['1','2'].every(level=>schedules.some(s=>s.ms_level===level))) throw new Error('Both ROTC schedules for SY 2026-2027 must exist.');
    const password=await bcrypt.hash('TestRotc2026!',10);
    for(const [studentId,first,sex,advance,battalion,company,platoon,special] of demoStudents){
      const email=`rotc-demo-${studentId}@example.invalid`;
      const [existing]=await connection.execute('SELECT id,student_id,email,last_name FROM students WHERE student_id=? OR email=?',[studentId,email]);
      if(existing.length && (existing.length!==1 || existing[0].email!==email || existing[0].student_id!==studentId || existing[0].last_name!=='ROTC Test')) throw new Error(`Existing unrelated student uses ${studentId}; no records changed.`);
      let id=existing[0]?.id;
      const label=advance?'Advance Course':special||`B${battalion} ${company} P${platoon}`;
      if(!id){
        const [created]=await connection.execute(`INSERT INTO students
          (student_id,first_name,last_name,email,password,sex,course,year_level,nstp_component,
           willing_to_take_advance_course,battalion,rotc_company,rotc_platoon,special_unit,platoon,has_medical_condition)
          VALUES(?,?,'ROTC Test',?,?,?,'BS Criminology','2nd Year','ROTC',?,?,?,?,?,?,0)`,
          [studentId,first,email,password,sex,advance,battalion,company,platoon,special,label]);
        id=created.insertId;
      }
      for(const schedule of schedules){
        const [enrolled]=await connection.execute("SELECT id FROM student_ms_records WHERE student_id=? AND program='ROTC' AND schedule_id=? AND ms_level=?",[id,String(schedule.id),schedule.ms_level]);
        if(!enrolled.length) await connection.execute(`INSERT INTO student_ms_records
          (student_id,schedule_id,ms_level,program,status,assignment_battalion,assignment_company,
           assignment_platoon,assignment_special_unit,assignment_is_advance,assignment_label)
          VALUES(?,?,?,'ROTC','approved',?,?,?,?,?,?)`,[id,String(schedule.id),schedule.ms_level,battalion,company,platoon,special,advance,label]);
      }
    }
    await connection.commit();
    console.log('Two Advance Course ROTC Test accounts ready with approved MS 1 and MS 2 enrollments for SY 2026-2027.');
  }catch(error){await connection.rollback();throw error;}
  finally{connection.release();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.end());
