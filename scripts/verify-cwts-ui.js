const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const context={esc,icon:()=>'',attendanceUpdateDate:()=> 'Session date',document:{addEventListener(){}}};
vm.createContext(context);
const sharedApiSource=fs.readFileSync('public/js/shared/api.js','utf8');
vm.runInContext(sharedApiSource.slice(sharedApiSource.indexOf('function attendanceStatusFilters(')),context);
vm.runInContext(fs.readFileSync('public/js/admin/cwts/instructor-attendance.js','utf8'),context);
const assignment={id:1,company:'Alpha',mi_number:1,mi_type:'in',ms_level:1,school_year:'2026-2027'};
let html=context.cwtsInstructorView([assignment],assignment,[{status:'present'},{status:'absent'},{status:'unmarked'}]);
assert(!html.includes('<select'));assert.equal((html.match(/Company Alpha/g)||[]).length,1);
assert(!html.includes('verifier-summary'),'Status counts should appear only once in the filters');
assert.match(html,/data-attendance-status="all"[^>]*>All students<span>3<\/span>/);
for(const status of ['present','absent','unmarked'])assert.match(html,new RegExp('data-attendance-status="'+status+'"[^>]*>[^<]+<span>1</span>'));
html=context.cwtsInstructorView([assignment,{...assignment,id:2,company:'Bravo'}],assignment,[]);
assert.match(html,/data-cwts-assignment="2" aria-pressed="false"/);
assert.match(context.cwtsInstructorView([],undefined,[]),/No active assignments yet/);
const historyNode={};Object.assign(context,{$:()=>historyNode,fmtA:()=>'',fmtT:()=>'',badge:s=>s,table:(_,rows)=>rows.join(''),window:{addEventListener(){}}});
vm.runInContext(fs.readFileSync('public/js/shared/layout.js','utf8'),context);
const studentSource=fs.readFileSync('public/js/student/attendance.js','utf8');
vm.runInContext(studentSource.slice(studentSource.indexOf('function renderStudentAttendanceHistory('),studentSource.indexOf('function markStudentAttendance(')),context);
for(const program of ['CWTS','ROTC']){
  context.renderStudentAttendanceHistory([{program,status:'absent',verified_at:'2026-10-05T10:00:00Z',verified_by_name:'Verifier Name',update_reason:'Checked <area>'}],program);
  assert.match(historyNode.innerHTML,/Updated by <strong>Verifier Name/);assert.match(historyNode.innerHTML,/Reason: Checked &lt;area&gt;/);
}
const storage=new Map();
const source=fs.readFileSync('public/js/auth/cwts-invitation.js','utf8');
function invitation(hash){
  const submit={},eye={textContent:'eye'},message={classList:{add(){}}};
  const form={hidden:false,elements:{password:{value:'Example-password'},confirm:{value:'Example-password'}},reset(){},querySelector:s=>s==='button[type="submit"]'?submit:eye};
  const c={URLSearchParams,Date,location:{hash,pathname:'/invite'},history:{replaceState(){}},
    sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{getElementById:id=>id==='instructorPasswordForm'?form:id==='invitationMessage'?message:{},querySelector:()=>({classList:{add(){}}})},
    API:{post:async()=>({message:'Password set'})}};
  vm.runInNewContext(source,c);return {form,submit,eye};
}
(async()=>{
  assert.equal(invitation('#token='+'a'.repeat(64)).form.hidden,false);
  const reloaded=invitation('');assert.equal(reloaded.form.hidden,false);
  await reloaded.form.onsubmit({preventDefault(){}});
  assert.equal(reloaded.submit.textContent,'Set password');assert.equal(reloaded.eye.textContent,'eye');
  assert.equal(storage.size,0);assert.equal(invitation('').form.hidden,true);
  invitation('#token='+'b'.repeat(64));assert.equal(invitation('#token=broken').form.hidden,true);assert.equal(storage.size,0);
  console.log('PASS: assignment cards, selection controls, totals, empty state, CWTS/ROTC student attribution, invitation refresh and submit with eye buttons.');
})().catch(error=>{console.error(error);process.exitCode=1;});
