const test=require('node:test'),assert=require('node:assert/strict');
const {extend}=require('../services/enrollmentScheduleService');
const base={id:12,program:'CWTS',ms_level:'1',year:'2026-2027',open_date:'2020-01-01T08:00:00',deadline:'2020-01-02T17:00:00',platoons_assigned_at:null};
const future='2035-01-01T23:00:00';
function database(cycles,failWrite=false) {
  const state={committed:false,rolledBack:false,released:false,queries:[],writes:[]};
  return {state,getConnection:async()=>({
    beginTransaction:async()=>{},commit:async()=>{state.committed=true;},rollback:async()=>{state.rolledBack=true;},release(){state.released=true;},
    execute:async(sql,params)=>{
      state.queries.push({sql,params});
      if(sql.includes('FROM student_ms_records'))return [state.assigned?[{id:1}]:[]];
      if(sql.startsWith('SELECT'))return [cycles.filter(cycle=>cycle.program===params[0])];
      if(failWrite)throw Error('Simulated database failure');
      state.writes.push({sql,params});return [{affectedRows:1}];
    },
  })};
}
for(const program of ['ROTC','CWTS'])test(`${program}: a closed schedule reopens by changing only its deadline`,async()=>{
  const cycle={...base,program},db=database([cycle]);
  const result=await extend(db,{program,id:12,deadline:future,expectedDeadline:cycle.deadline});
  assert.deepEqual(result,{...cycle,deadline:future});
  assert.equal(db.state.writes.length,1);
  assert.deepEqual(db.state.writes[0].params,[future,12,program]);
  assert.match(db.state.writes[0].sql,/SET deadline=\?/);
  assert.match(db.state.queries[0].sql,/FOR UPDATE/);
  assert(db.state.committed);assert(db.state.released);assert(!db.state.rolledBack);
});
test('open and upcoming schedules can extend without changing their opening dates',async()=>{
  for(const open_date of ['2020-01-01T08:00:00','2030-01-01T08:00:00']){
    const cycle={...base,open_date,deadline:'2031-01-01T08:00:00'},db=database([cycle]);
    const result=await extend(db,{program:'CWTS',id:12,deadline:future,expectedDeadline:cycle.deadline});
    assert.equal(result.open_date,open_date);assert(db.state.committed);
  }
});
test('rejects earlier, past, malformed and stale deadlines with no writes',async()=>{
  for(const [deadline,expectedDeadline] of [
    ['not-a-date',base.deadline],['2020-01-01T08:00:00',base.deadline],
    [future,'stale'],
  ]){
    const db=database([base]);
    await assert.rejects(extend(db,{program:'CWTS',id:12,deadline,expectedDeadline}));
    assert.equal(db.state.writes.length,0);assert(!db.state.committed);
  }
  const cycle={...base,deadline:future},db=database([cycle]);
  await assert.rejects(extend(db,{program:'CWTS',id:12,deadline:'2034-01-01T08:00:00',expectedDeadline:future}),/later than the current/);
  assert.equal(db.state.writes.length,0);
});
test('blocks finalized assignments, older cycles and access through the other program',async()=>{
  for(const cycles of [
    [{...base,platoons_assigned_at:'2026-01-01'}],
    [{...base,id:13,ms_level:'2'},base],
    [{...base,program:'ROTC'}],
  ]){
    const db=database(cycles);
    await assert.rejects(extend(db,{program:'CWTS',id:12,deadline:future,expectedDeadline:base.deadline}));
    assert(db.state.rolledBack);assert(db.state.released);assert.equal(db.state.writes.length,0);
  }
});
test('database failures roll back and release the connection',async()=>{
  const db=database([base],true);
  await assert.rejects(extend(db,{program:'CWTS',id:12,deadline:future,expectedDeadline:base.deadline}),/Simulated database failure/);
  assert(db.state.rolledBack);assert(db.state.released);assert(!db.state.committed);
});
test('existing student assignments block extension even if the schedule was not marked finalized',async()=>{
  for(const program of ['ROTC','CWTS']){
    const db=database([{...base,program}]);db.state.assigned=true;
    await assert.rejects(extend(db,{program,id:12,deadline:future,expectedDeadline:base.deadline}),/students already have/);
    assert.equal(db.state.writes.length,0);assert(db.state.rolledBack);assert(!db.state.committed);
  }
});
