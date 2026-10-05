const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let assignments=[{id:1},{id:2}],records=[],patchError,patchBody,dialog;
const requests=[];
const nodes={'#refreshVerifierRecords':{},'#verifierSearch':{}};
const roster={innerHTML:'',querySelectorAll(selector){
  if(selector!=='[data-update]')return [];
  return [...this.innerHTML.matchAll(/data-update="([^"]+)"/g)].map(match=>({dataset:{update:match[1]}}));
}};
// Retain the actual update buttons wired by the renderer.
let buttons=[];
const originalQuery=roster.querySelectorAll.bind(roster);
roster.querySelectorAll=selector=>selector==='[data-update]' ? (buttons=originalQuery(selector)) : [];
nodes['#verifierRecords']=roster;
const content={innerHTML:'',querySelectorAll(){return [];}};
const context={console,$:selector=>nodes[selector],esc:value=>String(value??''),icon:()=>'',
  attendanceAssignmentCard:a=>`Group-${a.id}`,attendanceUpdateDate:()=>'',attendanceUpdateDetails:()=>'',
  badge:status=>status,table:(_,rows)=>rows.join(''),toast(){},
  API:{get:async url=>{requests.push(url);return url.endsWith('/assignments')?assignments:records.map(r=>({...r}));},
    patch:async(_,body)=>{patchBody=body;if(patchError)throw patchError;return {message:'Saved'};}},
  document:{addEventListener(){},body:{appendChild(){}},createElement(){
    const submit={disabled:false},review={hidden:true},error={hidden:true},reason={value:'Physically absent',setCustomValidity(){}};
    const form={elements:{reason,status:{value:'absent'}},querySelector:s=>s==='[type="submit"]'?submit:error};
    const lookup={'form':form,'textarea':reason,'[data-review-latest]':review,'.attendance-dialog-footer':{insertAdjacentHTML(){}},'.attendance-dialog-close':{},'[data-cancel]':{}};
    dialog={open:false,innerHTML:'',setAttribute(){},addEventListener(){},remove(){},
      querySelector:s=>lookup[s],querySelectorAll:()=>[submit,review],showModal(){this.open=true;},close(){this.open=false;}};
    return dialog;
  }}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/js/shared/rotc-verifiers.js','utf8'),context);
(async()=>{
  await context.renderAssignedAttendance(content,'2');
  assert.equal(requests.at(-1),'/api/student/rotc-verifier/assignments/2/records');
  assignments=[{id:2},{id:3}];await nodes['#refreshVerifierRecords'].onclick();
  assert(!content.innerHTML.includes('Group-1'));assert(content.innerHTML.includes('Group-3'));
  assert.equal(requests.at(-1),'/api/student/rotc-verifier/assignments/2/records','Refresh preserves an active selection');
  assignments=[{id:3}];await nodes['#refreshVerifierRecords'].onclick();
  assert.equal(requests.at(-1),'/api/student/rotc-verifier/assignments/3/records');
  assignments=[];await nodes['#refreshVerifierRecords'].onclick();assert.match(content.innerHTML,/No active attendance assignment/);
  assignments=[{id:4}];records=[{id:10,record_version:7,status:'present',first_name:'Juan',last_name:'Cruz',student_id:'123',session_id:8,mi_number:1,mi_type:'in'}];
  await nodes['#refreshVerifierRecords'].onclick();assert(content.innerHTML.includes('Group-4'));
  buttons[0].onclick();patchError=Object.assign(new Error('Refresh and review'),{status:409});
  const form=dialog.querySelector('form');await form.onsubmit({preventDefault(){},target:form});
  assert.equal(patchBody.expected_version,7);assert.equal(form.querySelector('[type="submit"]').disabled,true);
  assert.equal(dialog.querySelector('[data-review-latest]').hidden,false);
  assert.equal(form.querySelector('.attendance-save-error').textContent,'Refresh and review');
  assignments=[{id:5}];records=[];await dialog.querySelector('[data-review-latest]').onclick();
  assert(content.innerHTML.includes('Group-5'));assert.equal(requests.at(-1),'/api/student/rotc-verifier/assignments/5/records');
  // An old roster request cannot repaint a refreshed page after access is revoked.
  let resolveOld;
  context.API.get=async url=>url.endsWith('/assignments')?assignments:new Promise(resolve=>{resolveOld=resolve;});
  const oldRender=context.renderAssignedAttendance(content);
  await new Promise(resolve=>setImmediate(resolve));
  assignments=[];await context.renderAssignedAttendance(content);roster.innerHTML='untouched';
  resolveOld([]);await oldRender;
  assert.match(content.innerHTML,/No active attendance assignment/);assert.equal(roster.innerHTML,'untouched');
  console.log('PASS: assignment refresh, selection preservation, revoked access, empty-state refresh, record-version payload, conflict review, and stale request protection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
