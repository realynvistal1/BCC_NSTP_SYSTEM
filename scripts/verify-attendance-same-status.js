const assert=require('node:assert/strict');
const db=require('../config/database');
const rotc=require('../controllers/rotcVerifierController');
const cwts=require('../controllers/cwtsInstructorController');
const attendance=require('../services/attendanceService');
attendance.getEffectiveStatus=()=> 'open';
async function check(controller,program,status,target=status){
 let writes=0,rollback=false,commit=false,released=false;
 const previous={id:9,student_id:7,status,record_version:4,claimed_present:0,false_present:0};
 db.getConnection=async()=>({
  beginTransaction:async()=>{},rollback:async()=>{rollback=true},commit:async()=>{commit=true},release:()=>{released=true},
  execute:async sql=>{
   if(/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)){writes++;return [{affectedRows:1,insertId:9}]}
   if(sql.includes('SELECT id,email FROM cwts_instructors'))return [[{id:1,email:'test@example.invalid'}]];
   if(sql.includes('SELECT ses.*'))return [[{id:3,mi_number:1,mi_type:'in'}]];
   if(sql.includes('SELECT * FROM attendance_records'))return [[previous]];
   if(sql.includes('SELECT ar.id,ar.record_version'))return [[previous]];
   return [[{student_id:7,id:7}]];
  }
 });
 let code=200,body;
 await controller.verify({user:{id:1,email:'test@example.invalid',session_version:1},params:{id:program==='ROTC'?9:2,studentId:7},body:{assignment_id:2,status:target,reason:'Unchanged status attempt',expected_version:4}}, {status(n){code=n;return this},json(b){body=b}});
 if(target!==status){assert.equal(code,200,JSON.stringify(body));assert(writes>0);assert(commit);assert(!rollback);assert(released);console.log(`PASS: ${program} ${status} -> ${target} still saves`);return;}
 assert.equal(code,400,JSON.stringify(body));assert.match(body.message,/already marked/);assert.equal(writes,0);assert(rollback);assert(!commit);assert(released);
 console.log(`PASS: ${program} ${status} -> ${status} rejected; no attendance, version, history or offense writes`);
}
(async()=>{try{for(const status of ['present','absent','late']){await check(rotc,'ROTC',status);await check(cwts,'CWTS',status)}await check(rotc,'ROTC','absent','present');await check(cwts,'CWTS','absent','present');}finally{await db.end()}})().catch(e=>{console.error(e);process.exitCode=1});
