const test=require('node:test'),assert=require('node:assert/strict');
const service=require('../services/instructorAttendanceService');
test('company/session IDs reject direct old manual assignments and malformed IDs',()=>{
  assert.deepEqual(service.scopeIds('12-34'),[12,34]);
  for(const value of ['12','0-1','1 OR 1=1-2','1-2-3','1-9007199254740993'])assert.throws(()=>service.scopeIds(value));
});
test('attendance automatically matches assigned company, school year and level; future sessions stay hidden',async()=>{
  let query,params;const db={execute:async(sql,values)=>{query=sql;params=values;return [[
    {company_assignment_id:1,session_id:10,company:'Alpha',open_date:'2026-11-10T10:00:00+08:00',close_date:'2026-11-10T11:00:00+08:00'},
    {company_assignment_id:1,session_id:11,company:'Alpha',open_date:'2026-11-11T10:00:00+08:00',close_date:'2026-11-11T11:00:00+08:00'},
    {company_assignment_id:1,session_id:9,company:'Alpha',open_date:'2026-11-09T10:00:00+08:00',close_date:'2026-11-09T11:00:00+08:00'}
  ]];}};
  const list=await service.list(db,{id:3,program:'CWTS'},new Date('2026-11-10T10:30:00+08:00'));
  assert.deepEqual(list.map(row=>row.id),['1-10','1-9']);assert.equal(list[0].effective_status,'open');
  assert.deepEqual(params,[3]);assert(query.includes('ses.ms_level=es.ms_level'));assert(query.includes('ses.school_year=es.year'));assert(query.includes('a.active=1'));assert(!query.includes('cwts_instructor_assignments'));
  await assert.rejects(service.list(db,{id:3,program:'ROTC'}),e=>e.status===403);
});
test('attendance corrections require a reason before opening a database transaction',async()=>{
  const db={getConnection:()=>{throw Error('Must not connect');}};
  await assert.rejects(service.verify(db,{program:'CWTS'},'1-2',3,{status:'present',reason:''}),e=>e.status===400);
});
test('instructor tabs stay in the current portal when resolving URLs',()=>{
  const url=new URL('#grades','http://localhost:3000/instructor/dashboard#profile');
  assert.equal(url.pathname,'/instructor/dashboard');assert.equal(url.hash,'#grades');
  const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/js/shared/layout.js'),'utf8');
  assert(source.includes('new URL(href, window.location.href)'));assert(source.includes('nextUrl.pathname === window.location.pathname && nextUrl.search === window.location.search'));
});
