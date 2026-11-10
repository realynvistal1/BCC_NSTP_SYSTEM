const test=require('node:test'),assert=require('node:assert/strict');
const db=require('../config/database');
const admin=require('../controllers/sharedAdminController');
const enrollment=require('../services/specialEnrollmentService');
const student={student_id:'900001-2026',first_name:'Juan',middle_name:'Santos',last_name:'Cruz',sex:'Male',course:'BS Information Technology'};
const schedule={id:12,program:'CWTS',ms_level:'1',open_date:'2000-01-01T08:00:00',deadline:'2999-01-01T17:00:00'};
function response(){return {code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('CWTS submission needs no company setup and does not count company slots',async()=>{
  for(const setup of [null,'[]','[{"name":"Alpha","capacity":1}]']){
    const calls=[];
    await enrollment.check({execute:async(sql)=>{
      calls.push(sql);assert(sql.includes('FROM enrollment_schedules'));
      return [[{...schedule,cwts_company_setup:setup}]];
    }},12,{});
    assert.equal(calls.length,1);
  }
});
test('closed or already assigned schedules still reject submission',async()=>{
  for(const cycle of [{...schedule,deadline:'2000-01-02T17:00:00'},{...schedule,platoons_assigned_at:'2026-01-01'}]){
    await assert.rejects(enrollment.check({execute:async()=>[[cycle]]},12,{}),error=>error.status===409);
  }
});
test('single and bulk approvals do not depend on company capacity',async()=>{
  const originalExecute=db.execute,originalConnection=db.getConnection;
  const record={id:1,student_id:3,schedule_id:12,ms_level:'1',status:'pending',program:'CWTS'};
  try{
    for(const setup of [null,'[]','[{"name":"Alpha","capacity":1}]']){
      let writes=0;
      db.execute=async(sql)=>{
        assert(!sql.includes('cwts_companies'));
        if(sql.includes('COUNT(*)'))return [[{total:0}]];
        if(sql.startsWith('UPDATE students'))return [{affectedRows:1}];
        return [[record]];
      };
      db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql)=>{
        assert(!sql.includes('cwts_companies'));assert(!sql.includes('COUNT(*)'));
        if(sql.includes('FROM enrollment_schedules'))return [[{...schedule,cwts_company_setup:setup}]];
        if(sql.includes('SELECT status'))return [[record]];
        if(sql.includes('FROM students s'))return [[student]];
        if(sql.includes('FROM cwts_exam_results'))return [[{...student,result:'passed'}]];
        if(sql.startsWith('UPDATE student_ms_records')){writes++;return [{affectedRows:1}];}
        throw Error('Unexpected query: '+sql);
      }});
      const single=response();await admin.updateEnrollment({params:{program:'cwts',id:1},body:{status:'approved'}},single);
      assert.equal(single.code,200,JSON.stringify(single.body));assert(!single.body.message.includes('capacity'));assert.equal(writes,1);
      const bulk=response();await admin.bulkApprove({params:{program:'cwts'},body:{ids:[1]}},bulk);
      assert.equal(bulk.code,200,JSON.stringify(bulk.body));assert.equal(bulk.body.approved,1);assert.equal(writes,2);
      assert(!bulk.body.message.includes('capacity'));
    }
  }finally{db.execute=originalExecute;db.getConnection=originalConnection;}
});
