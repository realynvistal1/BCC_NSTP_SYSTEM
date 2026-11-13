const assert=require('node:assert/strict');
const db=require('../config/database'),controller=require('../controllers/rotcVerifierController');
async function call(handler,body={},params={},user={id:1,email:'semester-test@example.invalid'}){let status=200,data;await handler({body,params,user,query:{}},{status(n){status=n;return this},json(value){data=value}});return {status,data};}
(async()=>{const c=await db.getConnection(),originalExecute=db.execute,originalConnection=db.getConnection;await c.beginTransaction();const stamp='semester-'+Date.now();
try{
 db.execute=(...args)=>c.execute(...args);db.getConnection=async()=>({execute:(...args)=>c.execute(...args),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}});
 const [schedule]=await c.execute("INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline,platoons_assigned_at) VALUES('ROTC','1','7798-7799',NOW(),DATE_ADD(NOW(),INTERVAL 1 DAY),NOW())");
 async function student(suffix,advance,sex='Male'){const [s]=await c.execute("INSERT INTO students(student_id,first_name,last_name,email,password,nstp_component,willing_to_take_advance_course,sex) VALUES(?,?,?,?,?,'ROTC',?,?)",[stamp+suffix,suffix,'Test',stamp+suffix+'@example.invalid','not-login',advance,sex]);await c.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,program,status,assignment_battalion,assignment_company,assignment_platoon,assignment_is_advance) VALUES(?,?,'1','ROTC','approved',1,'Alpha',1,?)",[s.insertId,String(schedule.insertId),advance]);return s.insertId;}
 const verifier=await student('Verifier',1),other=await student('Other',1),target=await student('Target',0);
 const body={verifier_id:verifier,battalion:1,company:'Alpha',platoon:1,ms_level:'1',school_year:'7798-7799'};
 assert.equal(controller.validAssignment(body)[7],0);assert.equal(controller.validAssignment(body)[8],'');
 let response=await call(controller.assign,body);assert.equal(response.status,200,JSON.stringify(response.data));
 const [[assignment]]=await c.execute('SELECT * FROM rotc_verifier_assignments WHERE verifier_id=?',[verifier]);assert.equal(assignment.mi_number,0);assert.equal(assignment.mi_type,'');
 response=await call(controller.assign,{...body,verifier_id:other});assert.equal(response.status,409,'Duplicate group must be blocked');
 response=await call(controller.assign,body);assert.equal(response.status,409,'Duplicate verifier must be blocked');
 const sessions=[];
 for(const [mi,type,level,year,advance] of [[1,'in','1','7798-7799',0],[2,'out','1','7798-7799',0],[3,'in','2','7798-7799',0],[4,'in','1','7799-7800',0],[5,'in','1','7798-7799',1]]){const [session]=await c.execute("INSERT INTO attendance_sessions(program,ms_level,school_year,is_advance_course,mi_number,mi_type,open_date,close_date,latitude,longitude,created_by) VALUES('ROTC',?,?,?,?,?,NOW(),DATE_ADD(NOW(),INTERVAL 1 HOUR),8,125,?)",[level,year,advance,mi,type,stamp]);sessions.push(session.insertId);}
 response=await call(controller.records,{}, {id:assignment.id},{id:verifier});assert.equal(response.status,200);assert.deepEqual([...new Set(response.data.filter(r=>Number(r.student_internal_id)===target).map(r=>Number(r.session_id)))].sort((a,b)=>a-b),sessions.slice(0,2).sort((a,b)=>a-b));

 const readiness=require('../services/rotcVerifierCoverageService');
 for(const unit of ['Medics','MP','HQ']){
   const male=await student(unit+'MaleVerifier',1),female=await student(unit+'FemaleVerifier',1,'Female');
   const maleTarget=await student(unit+'Male',0),femaleTarget=await student(unit+'Female',0,'Female');
   for(const [id,platoon] of [[maleTarget,1],[femaleTarget,2]])await c.execute('UPDATE student_ms_records SET assignment_special_unit=?,assignment_company=NULL,assignment_battalion=NULL,assignment_platoon=? WHERE student_id=?',[unit,platoon,id]);
   assert.equal(controller.validAssignment({...body,special_unit:unit,platoon:0}),null);
   response=await call(controller.assign,{...body,special_unit:unit,platoon:2,verifier_id:male});assert.equal(response.status,400,'Wrong-sex special verifier must be rejected');
   for(const [verifierId,platoon,targetId,otherId] of [[male,1,maleTarget,femaleTarget],[female,2,femaleTarget,maleTarget]]){
     response=await call(controller.assign,{...body,special_unit:unit,platoon,verifier_id:verifierId});assert.equal(response.status,200,JSON.stringify(response.data));
     const [[grant]]=await c.execute('SELECT id FROM rotc_verifier_assignments WHERE verifier_id=?',[verifierId]);
     response=await call(controller.records,{}, {id:grant.id},{id:verifierId});assert.equal(response.status,200);
     assert(response.data.some(r=>Number(r.student_internal_id)===targetId));assert(!response.data.some(r=>Number(r.student_internal_id)===otherId),'Special verifier cannot access the other platoon');
   }
 }
 let ready=await readiness.coverage(db,'1','7798-7799');assert.equal(ready.ready,true,JSON.stringify(ready));
 await c.execute("UPDATE rotc_verifier_assignments SET active=0 WHERE school_year='7798-7799' AND special_unit='HQ' AND platoon=2");
 ready=await readiness.coverage(db,'1','7798-7799');assert.equal(ready.ready,false);assert.equal(ready.missing.length,1);assert.equal(Number(ready.missing[0].platoon),2);
 const blocked=await call(require('../controllers/officerController').createAttendance,{program:'ROTC',ms_level:'1',school_year:'7798-7799',mi_number:1,mi_type:'in',open_date:'2098-01-01T08:00:00',close_date:'2098-01-01T09:00:00',latitude:8,longitude:125});
 assert.equal(blocked.status,409);assert(blocked.data.message.includes('verifier'));
 console.log('PASS: special-unit male/female assignment and attendance isolation; Director creation blocked for missing verifier.');
 console.log('PASS: semester assignment without existing sessions, coverage of later MI IN/OUT sessions, duplicate verifier/group protection, and isolation from next level/year and Advance Course attendance. All fixtures rolled back.');
}finally{db.execute=originalExecute;db.getConnection=originalConnection;await c.rollback();c.release();await db.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
