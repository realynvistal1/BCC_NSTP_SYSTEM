// Offline regression tests: no database module, credentials, or real records are loaded.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function fixture(){
  const cycles=[
    {id:1,ms_level:'1',year:'2026-2027',deadline:'2000-01-01',platoons_assigned_at:'2000-01-02',cwts_company_setup:JSON.stringify([{name:'Alpha',capacity:60}])},
    {id:2,ms_level:'2',year:'2026-2027',deadline:'2000-01-01',platoons_assigned_at:null,cwts_company_setup:null},
    {id:3,ms_level:'1',year:'2027-2028',deadline:'2000-01-01',platoons_assigned_at:null,cwts_company_setup:null},
  ];
  const calls=[],assignments=[];
  const connection={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},execute:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT name,capacity FROM cwts_companies'))return [[{name:'Alpha',capacity:60}]];
    if(sql.startsWith('SELECT id,ms_level,year,cwts_company_setup'))return [cycles];
    if(sql.includes('SELECT DISTINCT assignment_company'))return [[{name:'Alpha'}]];
    if(sql.startsWith('SELECT id,ms_level,year,platoons_assigned_at'))return [cycles.filter(row=>row.id===params[0])];
    if(sql.startsWith('UPDATE enrollment_schedules SET cwts_company_setup=')){cycles.find(row=>row.id===params[1]).cwts_company_setup=params[0];return [{affectedRows:1}];}
    if(sql.includes('NULLIF(assignment_company'))return [[{total:0}]];
    if(sql.includes('SELECT * FROM enrollment_schedules'))return [cycles.filter(row=>row.ms_level===params[1]&&row.year===params[3]&&(!params[4]||row.id===params[4]))];
    if(sql.includes("SUM(status='pending')"))return [[{pending:0}]];
    if(sql.includes('SELECT s.id,s.last_name,s.first_name,s.middle_name,s.student_id'))return [[{id:101},{id:102}]];
    if(sql.startsWith('UPDATE students')){assignments.push(params);return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE enrollment_schedules SET platoons_assigned_at=')){cycles.find(row=>row.id===params[0]).platoons_assigned_at='2000-01-02';return [{affectedRows:1}];}
    throw Error('Unexpected offline query: '+sql);
  }};
  const db={execute:connection.execute,getConnection:async()=>connection};
  const serviceContext={module:{exports:{}},require:name=>{assert.equal(name,'../config/database');return db;}};
  vm.runInNewContext(read('services/cwtsCompanyService.js'),serviceContext);
  const service=serviceContext.module.exports;
  const context={exports:{},db,cwtsCompanies:service,program:()=> 'CWTS',readLevel:value=>String(value),readSchoolYear:value=>String(value),snapshotCycleAssignments:async()=>{},console};
  const controller=read('controllers/sharedAdminController.js');
  vm.runInNewContext(controller.slice(controller.indexOf('function cwtsSetupScheduleId(')),context);
  vm.runInNewContext(controller.slice(controller.indexOf('exports.autoAssign ='),controller.indexOf('exports.grades =')),context);
  const invoke=async(name,{id=2,body={},company='Alpha',query={}}={})=>{
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    await context.exports[name]({query:{schedule_id:String(id),...query},body,params:{name:company}},res);return res;
  };
  return {service,cycles,calls,assignments,invoke,connection};
}
test('new MS level and school year start empty; an older assignment only locks itself',async()=>{
  const f=fixture();assert.equal((await f.service.details(f.connection,1))[0].capacity,60);
  assert.equal((await f.service.details(f.connection,2)).length,0);
  assert.equal((await f.service.details(f.connection,3)).length,0);
  assert.equal((await f.invoke('cwtsCompanyList',{query:{configuration:'1'}})).body.locked,false);
  assert.equal((await f.invoke('addCwtsCompany',{id:1,body:{name:'Bravo',capacity:25}})).statusCode,409);
});
test('save, edit, and delete change only the selected schedule; global definitions stay untouched',async()=>{
  const f=fixture(),old=f.cycles[0].cwts_company_setup;
  assert.equal((await f.invoke('addCwtsCompany',{body:{name:'Bravo',capacity:25}})).statusCode,201);
  assert.equal((await f.invoke('updateCwtsCompanyCapacity',{company:'Bravo',body:{capacity:35}})).statusCode,200);
  assert.equal((await f.service.details(f.connection,2))[0].capacity,35);
  assert.equal((await f.invoke('addCwtsCompany',{body:{name:'bravo',capacity:10}})).statusCode,409);
  assert.equal((await f.invoke('addCwtsCompany',{body:{name:'Delta',capacity:0}})).statusCode,400);
  assert.equal((await f.invoke('deleteCwtsCompany',{company:'Bravo'})).statusCode,200);
  assert.equal(f.cycles[0].cwts_company_setup,old);assert.equal(f.cycles[2].cwts_company_setup,null);
  assert(!f.calls.some(({sql})=>/^(UPDATE|DELETE FROM|INSERT INTO) cwts_companies/.test(sql)));
  assert(f.calls.some(({sql})=>sql.endsWith('FOR UPDATE')));
});
test('assignment requires setup and sufficient capacity, then locks only its own schedule',async()=>{
  const f=fixture(),body={ms_level:'2',school_year:'2026-2027'};
  assert.equal((await f.invoke('autoAssign',{body})).statusCode,409);
  assert(f.calls.some(({sql,params})=>sql.includes('AND (? IS NULL OR id=?)')&&params[4]===2));
  await f.invoke('addCwtsCompany',{body:{name:'Bravo',capacity:1}});
  assert.equal((await f.invoke('autoAssign',{body})).statusCode,409);
  assert.equal(f.assignments.length,0);
  await f.invoke('updateCwtsCompanyCapacity',{company:'Bravo',body:{capacity:2}});
  assert.equal((await f.invoke('autoAssign',{body})).statusCode,200);
  assert.equal(f.assignments.length,2);assert(f.assignments.every(params=>params[0]==='Bravo'));
  assert.equal((await f.invoke('updateCwtsCompanyCapacity',{company:'Bravo',body:{capacity:3}})).statusCode,409);
  assert.equal((await f.invoke('addCwtsCompany',{body:{name:'Delta',capacity:3}})).statusCode,409);
  assert.equal((await f.invoke('deleteCwtsCompany',{company:'Bravo'})).statusCode,409);
  assert.equal((await f.invoke('autoAssign',{body})).statusCode,409);
  assert.equal((await f.invoke('addCwtsCompany',{id:3,body:{name:'Alpha',capacity:40}})).statusCode,201);
});
test('older assigned schedules without a saved setup stay readable and locked',async()=>{
  const f=fixture();f.cycles[0].cwts_company_setup=null;
  assert.equal((await f.service.details(f.connection,1))[0].name,'Alpha');
  await assert.rejects(f.service.lockConfiguration(f.connection,1),error=>error.status===409);
});
test('missing or invalid schedule IDs cannot edit configuration',async()=>{
  const f=fixture();assert.equal((await f.invoke('addCwtsCompany',{id:'',body:{name:'Alpha',capacity:10}})).statusCode,400);
  assert.equal((await f.invoke('addCwtsCompany',{id:99,body:{name:'Alpha',capacity:10}})).statusCode,404);
});
test('additive migration is idempotent and does not update historical records',async()=>{
  const {ensureCwtsScheduleSetup}=require('../database/migrate-cwts-schedule-setup');let exists=false;const sqls=[];
  const db={execute:async sql=>{sqls.push(sql);if(sql.startsWith('SHOW'))return [exists?[{}]:[]];exists=true;return [{}];}};
  await ensureCwtsScheduleSetup(db);await ensureCwtsScheduleSetup(db);
  assert.equal(sqls.filter(sql=>sql.startsWith('ALTER')).length,1);
  assert(!sqls.some(sql=>/UPDATE|DELETE|INSERT/.test(sql)));
});
test('UI reloads the selected schedule setup when switching level or school year',async()=>{
  const schedules=[
    {id:1,ms_level:'1',year:'2026-2027',deadline:'2000-01-01',platoons_assigned_at:'2000-01-02'},
    {id:2,ms_level:'2',year:'2026-2027',deadline:'2000-01-01',platoons_assigned_at:null},
    {id:3,ms_level:'1',year:'2027-2028',deadline:'2000-01-01',platoons_assigned_at:null},
  ];
  const requests=[],controls={},errors=[];
  const heading={firstChild:null,append(){}};
  const c={innerHTML:'',classList:{add(){}},querySelectorAll:()=>[],querySelector:selector=>selector==='.section-card'?{classList:{add(){}},querySelector:()=>heading}:null};
  const context={console,Date,CSS:{escape:String},esc:String,rosterSummary:(name,value)=>name+':'+value,
    expanderCard:(_key,name)=>name,rosterRows:()=>'',bindRosterExpanders(){},toast:error=>errors.push(error),
    $:selector=>controls[selector]??= {},document:{createElement:()=>({appendChild(){}})},
    API:{get:async url=>{
      requests.push(url);
      if(url.includes('/enrollment-schedule'))return schedules;
      if(url.includes('/enrollments')||url.includes('/roster?'))return [];
      const id=Number(new URL(url,'http://offline.test').searchParams.get('schedule_id'));
      assert([1,2,3].includes(id));
      if(url.includes('configuration=1'))return {locked:id===1};
      return id===1?[{name:'Alpha',capacity:60}]:id===2?[{name:'Bravo',capacity:25}]:[];
    }},
  };
  const source=read('public/js/shared/ui.js');const start=source.indexOf('async function renderCWTSCompanyRoster(c) {');
  let end=source.indexOf('\nasync function ',start+1);if(end<0)end=source.length;
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  await context.renderCWTSCompanyRoster(c);
  assert(c.innerHTML.includes('Total Capacity:0'));
  assert(c.innerHTML.includes('Set Up Companies First'));
  await controls['#cwtsRosterLevel'].onchange({target:{value:'2'}});
  assert(c.innerHTML.includes('Total Capacity:25'));assert(c.innerHTML.includes('Bravo'));
  assert(!c.innerHTML.includes('Capacity locked'));
  await controls['#cwtsRosterLevel'].onchange({target:{value:'1'}});
  assert(c.innerHTML.includes('Companies Already Assigned'));
  await controls['#cwtsRosterYear'].onchange({target:{value:'2027-2028'}});
  assert(c.innerHTML.includes('Total Capacity:0'));assert(!c.innerHTML.includes('Companies Already Assigned'));
  assert.equal(c.inert,false);assert.equal(errors.length,0);
  assert(requests.some(url=>url.includes('schedule_id=2')));
});
test('all changed executable files parse',()=>{
  const {execFileSync}=require('node:child_process');
  for(const file of ['public/js/shared/ui.js','public/js/officer/_pages.js','controllers/sharedAdminController.js','controllers/officerController.js','services/cwtsCompanyService.js','services/specialEnrollmentService.js','database/migrate-cwts-schedule-setup.js','database/setup.js','server.js']){
    execFileSync(process.execPath,['--check',path.join(__dirname,'..',file)],{stdio:'pipe'});
  }
});
