const {test}=require('node:test');
const assert=require('node:assert/strict');
const {check}=require('../services/specialEnrollmentService');
const schedule={program:'CWTS',open_date:'2000-01-01',deadline:'2999-01-01'};
function connection(count){return {execute:async(sql,params)=>{
  if(sql.includes('enrollment_schedules'))return [[schedule]];
  if(sql.includes('cwts_companies'))return [[{name:'Alpha',capacity:360}]];
  assert.ok(sql.includes("status IN ('pending','approved')"));assert.ok(sql.includes('FOR UPDATE'));
  return [Array.from({length:count},(_,id)=>({id}))];
}};}
test('CWTS accepts the 360th application but blocks the 361st',async()=>{
  await assert.doesNotReject(check(connection(359),1,{}));
  await assert.rejects(check(connection(360),1,{}),error=>error.status===409&&/360/.test(error.message));
  await assert.rejects(check(connection(400),1,{}),/full/);
});
test('CWTS excludes the same student when resubmitting',async()=>{
  const db={execute:async(sql,params)=>{
    if(sql.includes('enrollment_schedules'))return [[schedule]];
  if(sql.includes('cwts_companies'))return [[{name:'Alpha',capacity:360}]];
    assert.equal(params[1],42);return [Array.from({length:359},(_,id)=>({id}))];
  }};
  await assert.doesNotReject(check(db,1,{},42));
});
