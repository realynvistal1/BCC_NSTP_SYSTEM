// Read-only database checks: synthetic membership matrix and real portal queries.
const assert=require('node:assert/strict');
const db=require('../config/database');
const scope=require('../services/instructorScopeService');
const management=require('../services/gradeInstructorService');
const grades=require('../services/instructorGradeService');
const records=require('../services/instructorRecordService');
const attendance=require('../services/rotcInstructorAttendanceService');
async function main(){
  const students=[
    ...scope.groups.slice(0,8).map(company=>({company,unit:null,advance:0,expected:company})),
    ...['Medics','MP','HQ'].map(unit=>({company:null,unit,advance:0,expected:unit})),
    {company:null,unit:null,advance:1,expected:'Advance Course'},
    {company:'Alpha',unit:'HQ',advance:0,expected:'HQ'},
    {company:'Alpha',unit:null,advance:1,expected:'Advance Course'},
    {company:null,unit:null,advance:0,expected:null},
  ];
  let checks=0;
  for(const assigned of [...scope.groups,'']){
    for(const student of students){
      const [[result]]=await db.execute(`SELECT ${scope.matches()} allowed
        FROM (SELECT ? assignment_company,? assignment_special_unit,? assignment_is_advance) r
        CROSS JOIN (SELECT ? company) a`,[student.company,student.unit,student.advance,assigned]);
      assert.equal(Number(result.allowed),Number(assigned!==''&&student.expected===assigned),JSON.stringify({assigned,student}));
      checks++;
    }
  }
  const data=await management.management(db,'ROTC');
  if(data.schedule){
    const [membership]=await db.execute("SELECT id,assignment_company,assignment_special_unit,assignment_is_advance FROM student_ms_records WHERE program='ROTC' AND CAST(schedule_id AS UNSIGNED)=?",[data.schedule.id]);
    for(const company of scope.groups){
      // Substitute assignment lookup only; exercise the real roster SQL without writing assignments.
      const facade={execute:async(sql,params)=>{
        if(sql.startsWith('SELECT a.*,es.ms_level'))return [[{id:1,program:'ROTC',company,schedule_id:data.schedule.id}]];
        if(sql.startsWith('SELECT id,enrollment_record_id'))return [[]];
        return db.execute(sql,params);
      }};
      const result=await grades.records(facade,{program:'ROTC',id:1},1);
      for(const student of result.students){
        const r=membership.find(r=>Number(r.id)===Number(student.enrollment_record_id));
        const group=Number(r.assignment_is_advance)?'Advance Course':r.assignment_special_unit||r.assignment_company;
        assert.equal(group,company);
      }
    }
    const legacy={execute:async()=>[[{id:1,program:'ROTC',company:'',schedule_id:data.schedule.id}]]};
    await assert.rejects(grades.records(legacy,{program:'ROTC',id:1},1),error=>error.status===403);
  }
  for(const instructor of data.instructors){
    const user={program:'ROTC',id:instructor.id};
    const assignments=await grades.assignments(db,user);
    assert(assignments.every(a=>scope.groups.includes(a.company)));
    for(const assignment of assignments)await grades.records(db,user,assignment.id);
    await records.list(db,user);
    const result=await attendance.overview(db,user);
    assert.equal(result.read_only,true);
    if(!assignments.length){assert.equal(result.records.length,0);assert.equal((await records.list(db,user)).length,0);}
  }
  console.log(`Passed ${checks} ROTC membership checks and read-only portal queries for ${data.instructors.length} instructors.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.end());
