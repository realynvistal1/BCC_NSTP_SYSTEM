const { test } = require('node:test');
const assert = require('node:assert/strict');
const roster = require('../services/rotcRosterService');

const student = (id, name, extra = {}) => ({ id, record_id:id, last_name:name, first_name:'Test', sex:'Male', ...extra });
test('companies must be created in order and earlier companies cannot be removed first', () => {
  const company = name => ({name,battalion:1});
  assert.doesNotThrow(()=>roster.validateCompanyOrder([company('Alpha')]));
  assert.doesNotThrow(()=>roster.validateCompanyOrder([company('Alpha'),company('Bravo')],[company('Alpha')]));
  assert.throws(()=>roster.validateCompanyOrder([company('Bravo')]),/Alpha.*before Bravo/);
  assert.throws(()=>roster.validateCompanyOrder([company('Alpha'),company('Charlie')]),/Bravo.*before Charlie/);
  assert.throws(()=>roster.validateCompanyOrder([company('Bravo')],[company('Alpha'),company('Bravo')]),/later companies/);
  assert.doesNotThrow(()=>roster.validateCompanyOrder([company('Alpha')],[company('Alpha'),company('Bravo')]));
});
test('setup saving requires a platoon and each company must contain a platoon', () => {
  const hq=roster.configuration([]);
  assert.throws(()=>roster.validateSetup(hq,[],{requirePlatoon:true}),/Add at least one platoon/);
  assert.throws(()=>roster.validateSetup(hq,[{name:'Alpha',battalion:1}],{requirePlatoon:true}),/Alpha Company/);
  const slots=roster.configuration([{key:'alpha',company:'Alpha',battalion:1,platoon:1,capacity:20}]);
  assert.doesNotThrow(()=>roster.validateSetup(slots,[{name:'Alpha',battalion:1}],{requirePlatoon:true}));
  assert.throws(()=>roster.validateSetup(slots,[{name:'Alpha',battalion:1},{name:'Bravo',battalion:1}],{requirePlatoon:true}),/Bravo Company/);
  assert.doesNotThrow(()=>roster.validateSetup(hq,[]));
});
test('alphabetical assignment honors company order, capacities, special choices and HQ separation', () => {
  const slots = roster.configuration([
    {key:'charlie',battalion:1,company:'Charlie',platoon:1,capacity:1},
    {key:'delta',battalion:1,company:'Delta',platoon:1,capacity:2},
    {key:'medics',unit:'Medics',platoon:1,capacity:37},
    {key:'mp',unit:'MP',platoon:1,capacity:37},
    {key:'hq-m',unit:'HQ',platoon:1,capacity:10},
    {key:'hq-f',unit:'HQ',platoon:2,capacity:10},
  ]);
  const rows = [student(1,'Zulu'),student(2,'Alpha'),student(3,'Medic',{willing_to_be_medics:1}),student(4,'Police',{willing_to_be_military_police:1}),student(5,'HQ male',{has_medical_condition:1}),student(6,'HQ female',{has_medical_condition:1,sex:'Female'}),student(7,'Advance',{willing_to_take_advance_course:1})];
  const assignments = roster.assign(rows,slots);
  const target = id => assignments.find(row => row.record_id === id).slot;
  assert.equal(target(2),'charlie'); assert.equal(target(1),'delta');
  assert.equal(target(3),'medics'); assert.equal(target(4),'mp');
  assert.equal(target(5),'hq-m'); assert.equal(target(6),'hq-f'); assert.equal(target(7),'advance');
  roster.validate(rows,slots,assignments);
  assert.throws(() => roster.validate(rows,slots,assignments.map(row => row.record_id === 6 ? {...row,slot:'hq-m'} : row)), /HQ/);
});
test('admin transfer can create a 38-member special group within configured capacity', () => {
  const slots = roster.configuration([{key:'mp',unit:'MP',platoon:1,capacity:38}]);
  const rows = Array.from({length:38},(_,index) => student(index+1,String(index),{willing_to_be_military_police:index<37 ? 1 : 0}));
  const assignments = rows.map(row => ({record_id:row.record_id,slot:'mp'}));
  roster.validate(rows,slots,assignments);
  assert.throws(() => roster.validate(rows,[{...slots[0],capacity:37}],assignments), /capacity/);
  assert.throws(() => roster.validate(rows,slots,[...assignments.slice(1),assignments[1]]), /duplicate/);
});
test('HQ is automatic and unlimited, separates medical students by sex and keeps alphabetical order', () => {
  const slots=roster.configuration([{key:'old-hq',unit:'HQ',platoon:1,capacity:1}]);
  assert.equal(slots.filter(slot=>slot.unit==='HQ').length,2);
  assert.ok(slots.every(slot=>slot.capacity===null));
  const rows=Array.from({length:2402},(_,index)=>student(index+1,String(2402-index).padStart(4,'0'),{has_medical_condition:1,sex:index%2?'Female':'Male'}));
  const assignments=roster.assign(rows,slots);
  roster.validate(rows,slots,assignments);
  const male=slots.find(slot=>slot.unit==='HQ'&&slot.platoon===1);
  const female=slots.find(slot=>slot.unit==='HQ'&&slot.platoon===2);
  assert.equal(assignments.filter(row=>row.slot===male.key).length,1201);
  assert.equal(assignments.filter(row=>row.slot===female.key).length,1201);
  assert.equal(assignments[0].record_id,2402);
  const regular={key:'regular',company:'Alpha',battalion:1,platoon:1,capacity:37};
  assert.throws(()=>roster.validate(rows,[...slots,regular],assignments.map((row,index)=>index===0?{...row,slot:'regular'}:row)),/HQ/);
  assert.doesNotThrow(()=>roster.validate([student(1,'Regular')],slots,[{record_id:1,slot:male.key}]));
  assert.throws(()=>roster.validate([student(1,'Regular')],slots,[{record_id:1,slot:female.key}]),/HQ/);
  assert.doesNotThrow(()=>roster.validate([student(1,'Regular')],slots,[{record_id:1,slot:'advance'}]));
});
test('manual transfer expands destination capacity and removes student from source', () => {
  const slots = roster.configuration([{key:'source',company:'Alpha',battalion:1,platoon:1,capacity:1},{key:'mp',unit:'MP',platoon:1,capacity:21}]);
  const rows = Array.from({length:22},(_,i)=>student(i+1,'Student '+i));
  const assignments = rows.map((row,i)=>({record_id:row.record_id,slot:i===21?'source':'mp'}));
  assignments[21].slot='mp';
  roster.expandTransferCapacity(slots,assignments);
  assert.equal(slots.find(slot=>slot.key==='mp').capacity,22);
  assert.equal(assignments.filter(row=>row.slot==='source').length,0);
  assert.equal(assignments.filter(row=>row.slot==='mp').length,22);
  assert.equal(slots.find(slot=>slot.key==='source').capacity,1);
  assert.doesNotThrow(()=>roster.validate(rows,slots,assignments));
});

test('manual moves preserve male and female battalion separation', () => {
  const slots=roster.configuration([{key:'male',company:'Alpha',battalion:1,platoon:1,capacity:10},{key:'female',company:'Bravo',battalion:2,platoon:1,capacity:10}]);
  const male=student(1,'Male'), female=student(2,'Female',{sex:'Female'});
  assert.doesNotThrow(()=>roster.validate([male,female],slots,[{record_id:1,slot:'male'},{record_id:2,slot:'female'}]));
  assert.throws(()=>roster.validate([male],slots,[{record_id:1,slot:'female'}]),/Battalion 1/);
  assert.throws(()=>roster.validate([female],slots,[{record_id:2,slot:'male'}]),/Battalion 2/);
});

test('MP and Medics split alphabetically into male platoon 1 and female platoon 2', () => {
  for(const unit of ['MP','Medics']) {
    const slots=roster.configuration([{key:'special',unit,platoon:1,capacity:37}]);
    const flags=unit==='MP'?{willing_to_be_military_police:1}:{willing_to_be_medics:1};
    const rows=[student(1,'Zulu',flags),student(2,'Alpha',{...flags,sex:'Female'}),student(3,'Bravo',flags)];
    const assignments=roster.assign(rows,slots);
    assert.equal(assignments[0].record_id,2);
    for(const assignment of assignments) assert.equal(slots.find(slot=>slot.key===assignment.slot).platoon,assignment.record_id===2?2:1);
    assert.doesNotThrow(()=>roster.validate(rows,slots,assignments));
    assert.throws(()=>roster.validate(rows,slots,assignments.map(row=>row.record_id===2?{...row,slot:'special'}:row)),/separation/);
  }
});

test('insufficient capacity fails without silently moving special students to regular groups', () => {
  assert.deepEqual(roster.configuration([]).filter(slot=>slot.unit!=='HQ'), []);
  const slots = roster.configuration([{key:'mp',unit:'MP',platoon:1,capacity:1}]);
  assert.throws(() => roster.assign([student(1,'A',{willing_to_be_military_police:1}),student(2,'B',{willing_to_be_military_police:1})],slots), /capacity/);
  assert.throws(() => roster.configuration([{key:'a',battalion:1,company:'Charlie',platoon:1,capacity:1},{key:'b',battalion:2,company:'Charlie',platoon:2,capacity:1}]), /one battalion/);
});

test('Director dashboard totals use actual published setup without fixed capacities', () => {
  const {summarize}=require('../services/rotcDashboardService');
  const slots=[{battalion:1,company:'Alpha',capacity:21},{battalion:1,company:'Bravo',capacity:20},{battalion:2,company:'Charlie',capacity:40}];
  const rows=[{assignment_battalion:1},{assignment_battalion:2},{assignment_is_advance:1,sex:'Male'},{assignment_special_unit:'MP'},{assignment_special_unit:'HQ'}];
  const totals=summarize(slots,rows);
  assert.equal(totals.battalions[1].capacity,41);assert.equal(totals.battalions[2].capacity,40);
  assert.equal(totals.battalions[1].companies,2);assert.equal(totals.battalions[1].platoons,2);
  assert.equal(totals.advance.male,1);assert.equal(totals.special.count,2);assert.equal(totals.special.units.MP,1);
  assert.equal(summarize(null,rows).battalions[1].capacity,null);
});

test('serial filters use published cycle assignments and actual special platoons', () => {
  const vm=require('node:vm'),fs=require('node:fs');
  const source=fs.readFileSync(require('node:path').join(__dirname,'../public/js/shared/serial-certificate.js'),'utf8');
  const context={program:'rotc',state:{level:'1',sy:'2026-2027',battalion:'2',company:'',platoon:'',q:'',elig:'All'},rows:[{student_id:1,student_no:'sample',ms1_schedule:1,ms1_school_year:'2026-2027',assignment_cycles:[{student_id:1,ms_level:'1',school_year:'2026-2027',battalion:2,rotc_company:'Charlie',rotc_platoon:1},{student_id:1,ms_level:'1',school_year:'2025-2026',battalion:1,rotc_company:'Alpha',rotc_platoon:3}]},{student_id:2,ms1_schedule:1,ms1_school_year:'2026-2027',assignment_cycles:[{student_id:2,ms_level:'1',school_year:'2026-2027',special_unit:'MP',rotc_platoon:2}]}]};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const ROTC_SPECIAL_BATTALION'),source.indexOf('function serialCourseCode'))+source.slice(source.indexOf('  const cycleSchoolYears'),source.indexOf('  function scheduleYearsForLevel'))+source.slice(source.indexOf('  function isAdvanceRow'),source.indexOf('  function draw()')),context);
  assert.equal(JSON.stringify(context.filterOptions().rotcCompanies),JSON.stringify(['Charlie']));
  assert.equal(context.filtered()[0].rotc_company,'Charlie');
  context.state.sy='2025-2026';context.state.battalion='1';assert.equal(context.filtered()[0].rotc_company,'Alpha');
  context.state.sy='2026-2027';context.state.battalion='special';context.state.company='MP';context.state.platoon='2';assert.equal(context.filtered().length,1);
  assert.equal(JSON.stringify(context.filterOptions().rotcPlatoons),JSON.stringify(['2']));
  context.state.platoon='1';assert.equal(context.filtered().length,0);
});

test('finalized roster UI stays read-only even if an older editing flag remains', async () => {
  const vm=require('node:vm'),fs=require('node:fs');
  const source=fs.readFileSync(require('node:path').join(__dirname,'../public/js/admin/rotc/roster-editor.js'),'utf8');
  for(const editing of [false,true]) {
    const schedule={id:1,ms_level:'1',year:'2098-2099',deadline:'2000-01-01',platoons_assigned_at:'2026-01-01'};
    const state={schedule,editing,revision:4,pending_count:0,companies:[{name:'Alpha',battalion:1}],configuration:roster.configuration([{key:'regular',company:'Alpha',battalion:1,platoon:1,capacity:37}]),assignments:[{record_id:1,slot:'regular'}],students:[student(1,'Test',{student_id:'sample',assignment_company:'Alpha',assignment_battalion:1,assignment_platoon:1})]};
    const nodes=new Map(),actions=[];
    const container={classList:{add(){},toggle(){}},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:'',open:false,focus(){},showModal(){},close(){}});return nodes.get(selector)},querySelectorAll(selector){return selector==='[data-action]'?actions:[]}};
    Object.defineProperty(container,'innerHTML',{get(){return this.html},set(html){this.html=html;actions.length=0;for(const match of html.matchAll(/data-action="([^"]+)"/g))actions.push({dataset:{action:match[1]}})}});
    const context={API:{get:async url=>url.includes('enrollment-schedule')?[schedule]:state},esc:String,rosterSummary:(label,value)=>label+':'+value,rosterRows:()=>'',expanderCard:()=>'',bindRosterExpanders(){}};
    vm.createContext(context);vm.runInContext(source,context);await context.renderROTCRosterEditor(container);
    assert.ok(!container.html.includes('data-action="edit"'));
    assert.ok(!container.html.includes('data-action="update"'));
    assert.ok(!container.html.includes('data-move-student'));
    assert.equal(actions.length,0);
  }
});

test('database workflow: permanent finalization, withdrawal transfers, published downloads, attendance history and enrollment limits', async () => {
  const db = require('../config/database');
  const connection = await db.getConnection();
  const original = db.getConnection;
  const transactionCommands = connection.connection.promise();
  let savepoint = false;
  const wrapped = {
    execute: connection.execute.bind(connection),
    beginTransaction: async () => { await transactionCommands.query('SAVEPOINT roster_action'); savepoint = true; },
    commit: async () => { await transactionCommands.query('RELEASE SAVEPOINT roster_action'); savepoint = false; },
    rollback: async () => { if(savepoint) { await transactionCommands.query('ROLLBACK TO SAVEPOINT roster_action'); await transactionCommands.query('RELEASE SAVEPOINT roster_action'); savepoint = false; } },
    release() {},
  };
  await connection.beginTransaction();
  db.getConnection = async () => wrapped;
  try {
    const [[existing]] = await connection.execute("SELECT COUNT(*) total FROM enrollment_schedules WHERE program='ROTC' AND year='2098-2099'");
    assert.equal(Number(existing.total),0,'Verification cycle must be unused.');
    const [schedule] = await connection.execute("INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline) VALUES('ROTC','1','2098-2099','2000-01-01','2000-02-01')");
    const scheduleId = schedule.insertId;
    const ids = [], records = [];
    for (const [name,advance,medics] of [['Zulu',0,0],['Alpha',0,0],['Advance',1,0],['Medic',0,1],['AdvanceTwo',1,0]]) {
      const [result] = await connection.execute("INSERT INTO students(student_id,last_name,first_name,sex,nstp_component,email,password,willing_to_take_advance_course,willing_to_be_medics) VALUES(?,?,?,'Male','ROTC',?,'test',?,?)", [`verify-${name}-${scheduleId}`,name,'Test',`verify-${name}-${scheduleId}@invalid.test`,advance,medics]);
      ids.push(result.insertId);
      const [record] = await connection.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program) VALUES(?,?,'1','approved','ROTC')", [result.insertId,String(scheduleId)]);
      records.push(record.insertId);
    }
    const slots = roster.configuration([{key:'regular',battalion:1,company:'Alpha',platoon:1,capacity:2},{key:'medics',unit:'Medics',platoon:1,capacity:38}]);
    const controller = require('../controllers/rotcRosterController');
    async function call(body = {}, method = 'POST') {
      const res = { code:200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await controller.editor({method,body:{ms_level:'1',school_year:'2098-2099',...body},query:{ms_level:'1',school_year:'2098-2099'},user:{email:'verify@invalid.test'}},res);
      return res;
    }
    const blank = await call({}, 'GET');
    assert.deepEqual(blank.body.configuration.filter(slot=>slot.unit!=='HQ'), []);
    assert.equal(blank.body.configuration.filter(slot=>slot.unit==='HQ').length,2);
    assert.deepEqual(blank.body.companies, []);
    const noPlatoons=await call({action:'configure',revision:0,configuration:[],companies:[]});
    assert.equal(noPlatoons.code,409);
    assert.match(noPlatoons.body.message,/platoon/);
    assert.equal((await call({action:'configure',revision:0,configuration:slots})).code,200);
    const repeatedSetup=await call({action:'configure',revision:1,configuration:slots});
    assert.equal(repeatedSetup.code,409);
    assert.match(repeatedSetup.body.message,/already been saved/);
    await connection.execute('UPDATE enrollment_schedules SET deadline=? WHERE id=?',['2999-01-01',scheduleId]);
    const openState=await call({},'GET');
    assert.equal(openState.body.enrollment_closed,false);
    const openAssignment=await call({action:'assign',revision:1});
    assert.equal(openAssignment.code,409);
    assert.match(openAssignment.body.message,/enrollment closes/);
    await connection.execute('UPDATE enrollment_schedules SET deadline=? WHERE id=?',['2000-02-01',scheduleId]);
    await connection.execute("UPDATE student_ms_records SET status='pending' WHERE id=?",[records[0]]);
    const pendingState=await call({},'GET');
    assert.equal(pendingState.body.enrollment_closed,true);
    assert.equal(pendingState.body.pending_count,1);
    const pendingAssignment=await call({action:'assign',revision:1});
    assert.equal(pendingAssignment.code,409);
    assert.match(pendingAssignment.body.message,/Approve or reject all pending/);
    await connection.execute("UPDATE student_ms_records SET status='approved' WHERE id=?",[records[0]]);
    const notAssigned=await call({action:'save',revision:1});
    assert.equal(notAssigned.code,409);
    assert.match(notAssigned.body.message,/Assign students/);
    assert.equal((await call({action:'assign',revision:1})).code,200);
    const repeatedAssignment=await call({action:'assign',revision:2});
    assert.equal(repeatedAssignment.code,409);
    assert.match(repeatedAssignment.body.message,/already been assigned/);
    const state = (await call({},'GET')).body;
    assert.equal(state.assignments.length,5);
    assert.equal(state.pending_count,0);
    await connection.execute("UPDATE student_ms_records SET status='pending' WHERE id=?",[records[0]]);
    const pendingFinalization=await call({action:'finalize',revision:2,confirm:true});
    assert.equal(pendingFinalization.code,409);
    assert.match(pendingFinalization.body.message,/Approve or reject all pending/);
    await connection.execute("UPDATE student_ms_records SET status='approved' WHERE id=?",[records[0]]);
    const [[privateState]] = await connection.execute('SELECT assignment_company FROM student_ms_records WHERE id=?',[records[0]]);
    assert.equal(privateState.assignment_company,null);
    const [[privateStudent]] = await connection.execute('SELECT rotc_company FROM students WHERE id=?',[ids[0]]);
    assert.equal(privateStudent.rotc_company,null);
    assert.equal((await call({action:'save',revision:0})).code,409);
    assert.equal((await call({action:'finalize',revision:2})).code,409);
    state.assignments.find(row => row.record_id === records[0]).slot = 'medics';
    assert.equal((await call({action:'finalize',revision:2,assignments:state.assignments,confirm:true})).code,200);
    assert.equal((await call({action:'assign',revision:3})).code,409);
    await assert.rejects(require('../services/rotcEnrollmentReviewService').review(records[0], 'rejected', 'Test'), /finalized/);
    const [[published]] = await connection.execute('SELECT special_unit,rotc_platoon FROM students WHERE id=?',[ids[0]]);
    assert.equal(published.special_unit,'Medics'); assert.equal(Number(published.rotc_platoon),1);
    const [withdrawal] = await connection.execute("INSERT INTO advance_course_withdrawals(student_id,reason) VALUES(?,'Verification')",[ids[2]]);
    const response = {code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};
    await require('../controllers/rotcWithdrawalController').update({params:{id:withdrawal.insertId},body:{status:'approved'},user:{email:'verify@invalid.test'}},response);
    assert.equal(response.code,200,JSON.stringify(response.body));
    const repeat = {code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};
    await require('../controllers/rotcWithdrawalController').update({params:{id:withdrawal.insertId},body:{status:'approved'},user:{email:'verify@invalid.test'}},repeat);
    assert.equal(repeat.code,409);
    const [fullRequest] = await connection.execute("INSERT INTO advance_course_withdrawals(student_id,reason) VALUES(?,'No capacity verification')",[ids[4]]);
    const fullResponse = {code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};
    await require('../controllers/rotcWithdrawalController').update({params:{id:fullRequest.insertId},body:{status:'approved'},user:{email:'verify@invalid.test'}},fullResponse);
    assert.equal(fullResponse.code,409);
    const [[stillPending]] = await connection.execute('SELECT status FROM advance_course_withdrawals WHERE id=?',[fullRequest.insertId]);
    assert.equal(stillPending.status,'pending');
    const [[stillAdvance]] = await connection.execute('SELECT assignment_is_advance FROM student_ms_records WHERE id=?',[records[4]]);
    assert.equal(Number(stillAdvance.assignment_is_advance),1);
    const history = require('../services/rotcAssignmentHistoryService');
    const oldMembership = await history.forSession(connection,{open_date:'2001-01-01',ms_level:'1',school_year:'2098-2099'});
    assert.equal(oldMembership.get(ids[2]).willing_to_take_advance_course,1);
    const newMembership = await history.forSession(connection,{open_date:'2098-01-01',ms_level:'1',school_year:'2098-2099'});
    assert.equal(newMembership.get(ids[2]).rotc_company,'Alpha');
    assert.equal(newMembership.get(ids[2]).willing_to_take_advance_course,0);
    // Finalization blocks every manual mutation, including old edit/update clients.
    const lockedState=(await call({},'GET')).body;
    for(const action of ['edit','update','save','assign','configure','finalize']) {
      const denied=await call({action,revision:lockedState.revision,confirm:true});
      assert.equal(denied.code,409);assert.match(denied.body.message,/finalized/);
    }
    await connection.execute('UPDATE rotc_roster_drafts SET editing=1 WHERE schedule_id=?',[scheduleId]);
    assert.equal((await call({},'GET')).body.editing,false);
    assert.equal((await call({action:'update',revision:lockedState.revision,confirm:true})).code,409);
    const originalExecute=db.execute, certificates=require('../services/certificateService'),originalPdf=certificates.registrationFormsPdf;
    db.execute=connection.execute.bind(connection);
    const result=()=>({code:200,status(code){this.code=code;return this},json(body){this.body=body;return this},set(){return this}});
    try {
      const officer=require('../controllers/officerController');
      const serialList=result();await require('../controllers/sharedAdminController').serials({method:'GET',params:{program:'rotc'}},serialList);
      assert.equal(serialList.code,200);assert.equal(serialList.body.find(row=>Number(row.student_id)===ids[0]).assignment_cycles[0].special_unit,'Medics');
      const director=result();await officer.roster({params:{group:'special-platoon'}},director);
      assert.ok(director.body.some(row=>Number(row.id)===ids[0]&&row.special_unit==='Medics'));
      let downloaded=[];certificates.registrationFormsPdf=async(res,options)=>{downloaded=options.records};
      const query={program:'ROTC',ms_level:'1',school_year:'2098-2099',special:'Medics',platoon:'1',commandant_name:'Verification'};
      const pdf=result();await officer.downloadRecordProfiles({query},pdf);
      assert.equal(pdf.code,200);assert.ok(downloaded.some(row=>Number(row.student_db_id)===ids[0]));assert.ok(downloaded.every(row=>row.special_unit==='Medics'));
      const malePdf=result();downloaded=[];
      await officer.downloadRecordProfiles({query:{...query,special:'advance',platoon:'',sex:'Male'}},malePdf);
      assert.equal(malePdf.code,200);assert.ok(downloaded.length);assert.ok(downloaded.every(row=>row.sex==='Male'&&Number(row.willing_to_take_advance_course)===1));
      const femalePdf=result();await officer.downloadRecordProfiles({query:{...query,special:'advance',platoon:'',sex:'Female'}},femalePdf);
      assert.equal(femalePdf.code,404);
      const invalidSex=result();await officer.downloadRecordProfiles({query:{...query,sex:'invalid'}},invalidSex);assert.equal(invalidSex.code,400);
      const adminPdf=result();downloaded=[];await require('../controllers/sharedAdminController').downloadRecordProfiles({params:{program:'rotc'},query},adminPdf);
      assert.equal(adminPdf.code,200);assert.ok(downloaded.some(row=>Number(row.student_db_id)===ids[0]));
      // Both verifier session lists keep membership at opening time after republishing.
      for(const year of [2001,2098])await connection.execute("INSERT INTO attendance_sessions(program,ms_level,school_year,mi_number,mi_type,open_date,close_date,latitude,longitude,created_by) VALUES('ROTC','1','2098-2099',1,'in',?,? ,0,0,'verify@invalid.test')",[year+'-01-01',year+'-01-02']);
      const [grant]=await connection.execute("INSERT INTO rotc_verifier_assignments(verifier_id,battalion,company,platoon,ms_level,school_year,assigned_by) VALUES(?,1,'Alpha',1,'1','2098-2099','verify@invalid.test')",[ids[4]]);
      const verifier=result();await require('../controllers/rotcVerifierController').records({params:{id:grant.insertId},user:{id:ids[4]}},verifier);
      assert.equal(verifier.code,200,JSON.stringify(verifier.body));
      assert.ok(verifier.body.some(row=>Number(row.student_internal_id)===ids[1]&&String(row.open_date).startsWith('2001')));
      assert.ok(!verifier.body.some(row=>Number(row.student_internal_id)===ids[0]&&String(row.open_date).startsWith('2098')));
      const management=result();await require('../controllers/rotcVerifierController').management({},management);
      assert.equal(management.code,200);assert.ok(management.body.groups.some(group=>group.company==='Alpha'&&group.school_year==='2098-2099'));
    } finally {db.execute=originalExecute;certificates.registrationFormsPdf=originalPdf;}
    const [open] = await connection.execute("INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline) VALUES('ROTC','2','2098-2099','2000-01-01','2099-01-01')");
    for(let index=0;index<37;index++) {
      const [result] = await connection.execute("INSERT INTO students(student_id,last_name,first_name,sex,nstp_component,email,password,willing_to_be_military_police) VALUES(?,'Quota','Test','Male','ROTC',?,'test',1)", [`quota-${scheduleId}-${index}`,`quota-${scheduleId}-${index}@invalid.test`]);
      await connection.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program) VALUES(?,?,'2','pending','ROTC')",[result.insertId,String(open.insertId)]);
    }
    const enrollment = require('../services/specialEnrollmentService');
    assert.equal((await enrollment.availability(connection,open.insertId)).MP.full,true);
    await assert.rejects(enrollment.check(connection,open.insertId,{willing_to_be_military_police:1}),/full/);
    await enrollment.check(connection,open.insertId,{willing_to_be_medics:1});
    const companyOnly = {code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};
    await controller.editor({method:'POST',body:{ms_level:'2',school_year:'2098-2099',revision:0,action:'configure',configuration:[],companies:[{name:'Alpha',battalion:1}]},user:{email:'verify@invalid.test'}},companyOnly);
    assert.equal(companyOnly.code,409,JSON.stringify(companyOnly.body));
    assert.match(companyOnly.body.message,/Alpha Company/);
    const savedCompany = await controller.draft(connection,open.insertId);
    assert.deepEqual(savedCompany.configuration.filter(slot=>slot.unit!=='HQ'),[]);
    assert.deepEqual(savedCompany.companies,[]);
    const [requestState] = await connection.execute('SELECT status FROM advance_course_withdrawals WHERE id=?',[withdrawal.insertId]);
    assert.equal(requestState[0].status,'approved');
  } finally {
    db.getConnection = original;
    await connection.rollback(); connection.release(); await db.end();
  }
});
