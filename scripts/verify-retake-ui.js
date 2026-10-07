const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

async function verify(program) {
  let poll, render;
  const notice = { innerHTML: '' };
  const content = { innerHTML: '', isConnected: true, querySelector: selector => selector === '#enrollmentNotice' ? notice : null };
  const dashboard = { student: { nstp_component: program }, record: { ms_level:'2',status:'approved' },
    re_enrollment: { mode:'retake',eligible:false,target_level:'2',message:'Wait for the next enrollment.' } };
  const history = [
    { ms_level:'1',status:'Passed',grade:2,school_year:'2026-2027',enrollment_status:'approved',attempt_number:1 },
    { ms_level:'2',status:'Failed',grade:4,school_year:'2026-2027',enrollment_status:'approved',attempt_number:1,assignment_label:'<old assignment>' },
    { ms_level:'2',status:'Passed',grade:2,school_year:'2027-2028',enrollment_status:'approved',attempt_number:2 },
  ];
  const context = { console, esc, displayNamePart:esc, icon:()=>'',badge:esc,
    dashCard:(_name,value,_help,href)=>`<a href="${href}">${value}</a>`,
    API: { get: async url => url.includes('changes=1') ? [] : url.includes('history=1') ? history : url.endsWith('/grades') ? [history[0],history[2]] : dashboard },
    window: { addEventListener(){},setInterval(fn){poll=fn;return 1;},clearInterval(){} },
    document: { hidden:false,querySelector:()=>null,addEventListener(_type,fn){fn();} },
    bootstrapPortalPage(options){render=options.render;},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('public/js/student/_pages.js','utf8'),context);
  await context.studentPage('dashboard',content);
  assert.match(content.innerHTML,/Wait for the next enrollment/);
  assert(!content.innerHTML.includes('Enroll for MS 2 Retake'));
  dashboard.re_enrollment.eligible=true;
  dashboard.re_enrollment.message='Enrollment is now open.';
  await poll();
  assert.match(notice.innerHTML,new RegExp(`Enroll for ${program==='CWTS'?'CWTS':'MS'} 2 Retake`));
  assert.match(notice.innerHTML,/href="\/student\/re-enrollment"/);
  vm.runInContext(fs.readFileSync('public/js/student/grades.js','utf8'),context);
  await render(content);
  assert(!content.innerHTML.includes('Enrollment and Grade History'));
  assert(!content.innerHTML.includes('Grade Correction History'));
  assert.match(content.innerHTML,/Current Results/);
  assert.match(content.innerHTML,/Passed/);
  dashboard.completion={completed:true,status:'awaiting-serial',message:'Completion recorded.'};
  dashboard.re_enrollment={};
  await poll();
  assert.equal(notice.innerHTML,'');
  context.API.get=async url=>url.includes('changes=1')?[]:url.includes('history=1')?[{ms_level:'1',enrollment_kind:'return',attempt_number:2,enrollment_status:'withdrawn',school_year:'2025-2026'}]:url.endsWith('/grades')?[]:dashboard;
  await render(content);
  assert.match(content.innerHTML,/No grades released yet/);
  assert(!content.innerHTML.includes('Enrollment and Grade History'));
  const nodes = new Map();
  const element = selector => {
    if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',dataset:{},classList:{add(){},remove(){}},
      addEventListener(){},querySelector:()=>element('.backdrop')});
    return nodes.get(selector);
  };
  const studentRow = { student_id:7,student_no:'TEST',first_name:'Test',last_name:'Retake',course:'BS Information Technology',
    approved_ms1:1,approved_ms2:1,ms1_record_id:10,ms2_record_id:20,ms1_year:'2026-2027',ms2_year:'2027-2028',ms2_attempts:2 };
  const adminHistory = history.map((row,index)=>({...row,student_id:7,enrollment_record_id:[10,15,20][index]}));
  Object.assign(adminHistory[2],{grade:null,status:null});
  const gradeButton = {dataset:{gradeStudent:'7'}};
  let savedBody;
  context.$=element;
  context.$$=selector=>selector==='[data-grade-student]'?[gradeButton]:[];
  context.toast=()=>{};
  context.API={get:async()=>({students:[studentRow],grades:[{...history[0],student_id:7}],history:adminHistory}),
    post:async(_url,body)=>{savedBody=body;return{grade:2,status:'Passed',enrollment_record_id:20};}};
  vm.runInContext(fs.readFileSync(`public/js/admin/${program.toLowerCase()}/grades.js`,'utf8'),context);
  await context.renderAdminGrades(program,content);
  assert.match(element('#gradeRows').innerHTML,/Ungraded/,'A retake without grades is ungraded even when MS 1 is passed');
  gradeButton.onclick();
  assert(!element('#gradeModalBody').innerHTML.includes('Enrollment and grade history'));
  assert(!content.innerHTML.includes('Retake and Return Monitoring'));
  assert(!element('#gradeModalBody').innerHTML.includes('Reason for grade correction'));
  assert.match(element('#gradeModalBody').innerHTML,/2027-2028/);
  element('#mid2').value='2';element('#fin2').value='2';
  await element('#saveGrades').onclick();
  assert.equal(savedBody.enrollment_record_id,20);
  assert.equal(savedBody.ms_level,'2');
  assert.equal(adminHistory[1].status,'Failed','Saving a retake must leave the old history intact');
  assert.equal(savedBody.correction_reason,undefined);
  const legacyStudent={...studentRow,approved_ms2:0,ms2_record_id:null};
  context.API={get:async()=>({students:[legacyStudent],grades:[{...history[0],student_id:7},{student_id:7,ms_level:'2',midterm:3,final_term:4,grade:3.5,status:'Failed'}]})};
  await context.renderAdminGrades(program,content);
  assert.match(element('#gradeRows').innerHTML,/Failed/,'Saved failed grades count even when an old enrollment is closed');
  assert.equal(element('#gradeFailed').textContent,1);
  assert.equal(element('#gradePassed').textContent,0);
  element('#gradeLevel').value='2';
  await context.renderAdminGrades(program,content);
  assert.match(element('#gradeRows').innerHTML,/Failed/,'Level filters retain students with saved grades');
  element('#gradeLevel').value='';
  context.API={get:async url=>url.endsWith('/serial-number')?[]:{completion:{completed:true,status:'awaiting-serial'}}};
  vm.runInContext(fs.readFileSync('public/js/shared/serial-certificate.js','utf8'),context);
  await context.renderStudentSerial(content);
  assert.match(content.innerHTML,/Certificate is not yet available/);
  assert(!content.innerHTML.includes('Completed — Awaiting Serial Number'));
  console.log(`PASS: ${program} basic retake UI, removed extra panels, and current-attempt grade submission.`);
}
(async()=>{await verify('ROTC');await verify('CWTS');})().catch(error=>{console.error(error);process.exitCode=1;});
