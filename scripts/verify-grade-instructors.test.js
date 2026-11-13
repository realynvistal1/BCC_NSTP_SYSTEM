const test=require('node:test'),assert=require('node:assert/strict');
const service=require('../services/gradeInstructorService');
const companies=require('../services/cwtsCompanyService');
function fixture({program='ROTC',schedule=true,status='active',reviewStatus='approved',previous=null,failure=false}={}){
 const state={writes:[],committed:false,rolledBack:false,released:false};
 const db={getConnection:async()=>({beginTransaction:async()=>{},commit:async()=>{state.committed=true;},rollback:async()=>{state.rolledBack=true;},release(){state.released=true;},execute:async(sql,params)=>{
   if(sql.includes('FROM rotc_roster_drafts'))return [[{configuration:[{company:'Alpha'},{company:'Bravo'}]}]];
   if(sql.includes('FROM student_ms_records'))return [[]];
   if(sql.includes('FROM enrollment_schedules'))return [schedule&&params[1]===program?[{id:1}]:[]];
   if(sql.includes('FROM rotc_instructors')||sql.includes('FROM cwts_instructors'))return [[{id:2,status,review_status:reviewStatus}]];
   if(sql.includes('FROM grade_instructor_assignments'))return [sql.includes('active,rotc')?(previous?[previous]:[]):[{id:7}]];
   if(failure)throw Error('Simulated failure');
   state.writes.push({sql,params});return [{insertId:7}];
 }})};
 return {db,state};
}
test('ROTC assigns instructors by company and rejects overall access',async()=>{
 const {db,state}=fixture();
 assert.equal(await service.assign(db,'ROTC',{schedule_id:1,instructor_id:2,company:'Alpha'},'admin@example.test'),7);
 assert.equal(state.writes.length,2);assert.deepEqual(state.writes[0].params,['ROTC',1,'Alpha',2,null,'admin@example.test']);
 assert(state.committed);assert(state.released);
 await assert.rejects(service.assign(db,'ROTC',{schedule_id:1,instructor_id:2,company:''},'admin@example.test'),/company or group/);
});
test('CWTS scopes each assignment to a configured company and keeps ROTC column empty',async()=>{
 const original=companies.details;companies.details=async()=>[{name:'Alpha',capacity:60}];
 try{
   const {db,state}=fixture({program:'CWTS'});
   await service.assign(db,'CWTS',{schedule_id:1,instructor_id:2,company:'Alpha'},'admin@example.test');
   assert.deepEqual(state.writes[0].params,['CWTS',1,'Alpha',null,2,'admin@example.test']);
   const other=fixture({program:'CWTS'});
   await assert.rejects(service.assign(other.db,'CWTS',{schedule_id:1,instructor_id:2,company:'Bravo'},'admin@example.test'),/configured/);
   assert.equal(other.state.writes.length,0);assert(other.state.rolledBack);
 }finally{companies.details=original;}
});

test('ROTC special groups and companies use distinct assignment scopes',async()=>{
 for(const company of ['Alpha','Bravo','Medics','MP','HQ','Advance Course']){
   const {db,state}=fixture();
   await service.assign(db,'ROTC',{schedule_id:1,instructor_id:2,company},'admin@example.test');
   assert.deepEqual(state.writes[0].params,['ROTC',1,company,2,null,'admin@example.test']);
   assert(state.committed);
 }
 const {db,state}=fixture();
 await assert.rejects(service.assign(db,'ROTC',{schedule_id:1,instructor_id:2,company:'Charlie'},'admin@example.test'),/configured/);
 assert.equal(state.writes.length,0);
 assert(state.rolledBack);
});
test('cross-program schedules and disabled instructors cannot be assigned',async()=>{
 for(const options of [{schedule:false},{status:'disabled'},{status:'pending',reviewStatus:'pending'},{reviewStatus:'rejected'}]){
   const {db,state}=fixture(options);
   await assert.rejects(service.assign(db,'ROTC',{schedule_id:1,instructor_id:2,company:'Alpha'},'admin@example.test'));
   assert.equal(state.writes.length,0);assert(state.rolledBack);assert(state.released);
 }
});
test('replacement records the old instructor and database failures roll back',async()=>{
 const {db,state}=fixture({previous:{id:7,active:1,rotc_instructor_id:9}});
 await service.assign(db,'ROTC',{schedule_id:1,instructor_id:2,company:'Alpha'},'admin@example.test');
 assert.deepEqual(state.writes[1].params,[7,9,2,'admin@example.test']);
 const broken=fixture({failure:true});
 await assert.rejects(service.assign(broken.db,'ROTC',{schedule_id:1,instructor_id:2,company:'Alpha'},'admin@example.test'),/Simulated/);
 assert(!broken.state.committed);assert(broken.state.rolledBack);assert(broken.state.released);
});
test('invalid IDs and program values are rejected before database work',async()=>{
 const db={getConnection:()=>{throw Error('Must not connect');}};
 for(const body of [{schedule_id:'1 OR 1=1',instructor_id:2},{schedule_id:1,instructor_id:-1}])await assert.rejects(service.assign(db,'ROTC',body,'admin@example.test'));
 await assert.rejects(service.assign(db,'OTHER',{schedule_id:1,instructor_id:2,company:'Alpha'},'admin@example.test'),/Invalid program/);
});
