const test=require('node:test'),assert=require('node:assert/strict');
const accounts=require('../services/instructorPortalService'),grades=require('../services/instructorGradeService');
const valid={first_name:'Ana',middle_name:'',last_name:'Cruz',email:'ana@example.invalid',program:'CWTS',school_year:'2026-2027',level:'1',password:'Example123!',confirm_password:'Example123!'};
test('registration validates component, consecutive school year, level, password and names',()=>{
  assert.equal(accounts.details(valid).program,'CWTS');assert.equal(accounts.details({...valid,program:'ROTC',level:'2'}).level,'2');
  for(const change of [{program:'BOTH'},{school_year:'2026-2029'},{level:'3'},{email:'invalid'},{first_name:''},{password:'short'},{confirm_password:'different'}])assert.throws(()=>accounts.details({...valid,...change}));
});
test('grade entry rejects blanks, coercion, out-of-range and excess precision',()=>{
  for(const v of ['',null,undefined,true,[],{},0,5.1,'2.555','2e0','1 OR 1=1'])assert.throws(()=>grades.grade(v));
  assert.equal(grades.grade('1.00'),1);assert.equal(grades.grade(5),5);assert.equal(grades.grade('2.75'),2.75);
});
test('SQL identifiers and record IDs come only from allowlists and valid integers',()=>{
  assert.equal(accounts.table('ROTC'),'rotc_instructors');assert.equal(accounts.table('CWTS'),'cwts_instructors');
  assert.throws(()=>accounts.table('cwts_instructors; DROP TABLE students'));for(const v of ['1 OR 1=1',0,-1,'9007199254740993'])assert.throws(()=>accounts.id(v));
});
test('profile photos are decoded and resized; invalid file content is rejected',async()=>{
  const sharp=require('sharp');const png=await sharp({create:{width:100,height:140,channels:3,background:'#c7e5da'}}).png().toBuffer();
  const output=await accounts.photo('data:image/png;base64,'+png.toString('base64'));assert(output.startsWith('data:image/jpeg;base64,'));
  const meta=await sharp(Buffer.from(output.split(',')[1],'base64')).metadata();assert.equal(meta.width,480);assert.equal(meta.height,600);
  await assert.rejects(accounts.photo('data:image/png;base64,'+Buffer.from('<script>alert(1)</script>').toString('base64')));
  await assert.rejects(accounts.photo(''));
});
test('registration school years use only the selected component and NSTP level',async()=>{
  const calls=[];const db={execute:async(sql,values)=>{calls.push({sql,values});return [[{year:'2027-2028'},{year:'2026-2027'}]];}};
  assert.deepEqual(await accounts.registrationYears(db,'CWTS','1'),['2027-2028','2026-2027']);
  assert.deepEqual(calls[0].values,['CWTS','1']);assert(calls[0].sql.includes('DISTINCT year'));
  await assert.rejects(accounts.registrationYears(db,'BOTH','1'));
  await assert.rejects(accounts.registrationYears(db,'CWTS','3'));
  assert.equal(calls.length,1);
});
test('registration rejects a missing or mismatched schedule and rechecks the exact combination under lock',async()=>{
  const data={program:'ROTC',level:'2',year:'2026-2027'};const calls=[];
  const db={execute:async(sql,values)=>{calls.push({sql,values});return [[]];}};
  await assert.rejects(accounts.requireRegistrationSchedule(db,data,true),e=>e.status===400);
  assert.deepEqual(calls[0].values,['ROTC','2','2026-2027']);assert(calls[0].sql.endsWith('FOR UPDATE'));
  await accounts.requireRegistrationSchedule({execute:async()=>[[{id:1}]]},data);
});
