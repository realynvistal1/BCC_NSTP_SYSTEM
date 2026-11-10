// All instructor profiles, assignments, and logs created by this check are rolled back.
require('dotenv').config({quiet:true});
const assert=require('node:assert/strict'),db=require('../config/database'),service=require('../services/gradeInstructorService');
(async()=>{
 await require('../database/migrate-grade-instructors').ensureGradeInstructors(db);
 const connection=await db.getConnection();await connection.beginTransaction();
 const facade={execute:connection.execute.bind(connection),getConnection:async()=>({execute:connection.execute.bind(connection),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}})};
 const stamp=Date.now(),actor='instructor-test@example.invalid';
 try{
  const cycles={};
  for(const program of ['ROTC','CWTS']){
   const [insert]=await connection.execute('INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline,cwts_company_setup) VALUES(?,?,?,?,?,?)',
    [program,'1','T-'+stamp,'2026-01-01','2026-12-31',program==='CWTS'?JSON.stringify([{name:'Alpha',capacity:60},{name:'Bravo',capacity:60}]):null]);
   cycles[program]=insert.insertId;
  }
  const rotc1=await service.create(facade,'ROTC',{first_name:'Test',last_name:'One',email:`rotc1-${stamp}@example.invalid`},actor);
  const rotc2=await service.create(facade,'ROTC',{first_name:'Test',last_name:'Two',email:`rotc2-${stamp}@example.invalid`},actor);
  const cwts1=await service.create(facade,'CWTS',{first_name:'Test',last_name:'Three',email:`cwts1-${stamp}@example.invalid`},actor);
  // Assignment requires account approval in the shared Instructor Portal.
  await connection.execute("UPDATE rotc_instructors SET status='active',review_status='approved' WHERE id IN (?,?)",[rotc1.id,rotc2.id]);
  await connection.execute("UPDATE cwts_instructors SET status='active',review_status='approved' WHERE id=?",[cwts1.id]);
  await service.assign(facade,'ROTC',{schedule_id:cycles.ROTC,instructor_id:rotc1.id},actor);
  await service.assign(facade,'ROTC',{schedule_id:cycles.ROTC,instructor_id:rotc2.id},actor);
  const rotc=await service.management(facade,'ROTC',cycles.ROTC);assert.equal(rotc.assignments.length,1);assert.equal(rotc.assignments[0].instructor_id,rotc2.id);
  const alpha=await service.assign(facade,'CWTS',{schedule_id:cycles.CWTS,instructor_id:cwts1.id,company:'Alpha'},actor);
  await service.assign(facade,'CWTS',{schedule_id:cycles.CWTS,instructor_id:cwts1.id,company:'Bravo'},actor);
  const cwts=await service.management(facade,'CWTS',cycles.CWTS);assert.equal(cwts.assignments.length,2);
  await assert.rejects(service.assign(facade,'CWTS',{schedule_id:cycles.ROTC,instructor_id:cwts1.id,company:'Alpha'},actor),error=>error.status===404);
  await assert.rejects(service.remove(facade,'ROTC',alpha,actor),error=>error.status===404);
  await service.remove(facade,'CWTS',alpha,actor);
  assert.equal((await service.management(facade,'CWTS',cycles.CWTS)).assignments.length,1);
  console.log('PASS: MySQL instructor creation, one ROTC scope, CWTS company scopes, replacement, removal, and program isolation. Test records rolled back.');
 }finally{await connection.rollback();connection.release();}
})().catch(error=>{console.error(error.code||error.message);process.exitCode=1;}).finally(()=>db.end());
