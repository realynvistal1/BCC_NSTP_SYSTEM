const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nodes={};
for(const id of ['verifierAssignmentResults','verifierHistoryResults','verifierAssignmentPagination','verifierHistoryPagination','verifierAccessFilter','verifierAssignmentSearch','verifierHistorySearch','verifierAssignmentsDisclosure','verifierHistoryDisclosure']) {
  nodes['#'+id]={innerHTML:'',value:'',buttons:{},querySelector(selector){return this.buttons[selector] ||= {};},querySelectorAll(selector){
    const attribute=selector==='[data-revoke]'?'revoke':selector==='[data-view-change]'?'view-change':null;
    if(!attribute)return [];
    return [...this.innerHTML.matchAll(new RegExp('data-'+attribute+'="([^"]+)"','g'))].map(match=>({dataset:attribute==='revoke'?{revoke:match[1]}:{viewChange:match[1]}}));
  }};
}
const context={console,$:selector=>nodes[selector],esc:value=>String(value??''),icon:()=>'',table:(_,rows)=>rows.join(''),attendanceUpdateDate:()=>'',document:{addEventListener(){}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('public/js/shared/rotc-verifiers.js','utf8'),context);
const assignments=Array.from({length:14},(_,i)=>({id:i+1,active:i<11?1:0,eligible:i===10?0:1,first_name:'Student',last_name:String(i+1),student_id:'ID-'+(i+1),battalion:1,company:'Alpha',platoon:1,ms_level:1,school_year:'2026-2027',mi_number:1,mi_type:'in'}));
assignments.forEach((a,i)=>{if(i%2===0){a.active=String(a.active);a.eligible=String(a.eligible);}});
const log=Array.from({length:12},(_,i)=>({id:i+1,first_name:'Student',last_name:String(i+1),student_id:'ID-'+(i+1),mi_number:1,mi_type:'in',previous_status:'present',status:'absent'}));
const state={access:'all',search:'',historySearch:'',assignmentPage:1,historyPage:1,assignmentsOpen:true,historyOpen:true};
context.renderVerifierManagementLists({},assignments,log,state);
const rows=()=>[...nodes['#verifierAssignmentResults'].innerHTML.matchAll(/class="verifier-assignment-row"/g)].length;
assert.equal(rows(),5);assert(!nodes['#verifierAssignmentResults'].innerHTML.includes('Revoked'));
assert.equal(nodes['#verifierAccessFilter'].value,'all');assert.match(nodes['#verifierAssignmentPagination'].innerHTML,/of 14/);
nodes['#verifierAssignmentPagination'].buttons['[data-page-next]'].onclick();
nodes['#verifierAssignmentPagination'].buttons['[data-page-next]'].onclick();
assert.equal(rows(),4);assert.match(nodes['#verifierAssignmentResults'].innerHTML,/Access blocked/);assert.match(nodes['#verifierAssignmentResults'].innerHTML,/Revoked/);
nodes['#verifierAccessFilter'].onchange({target:{value:'active'}});
assert.equal(state.assignmentPage,1);assert.match(nodes['#verifierAssignmentPagination'].innerHTML,/of 10/);
assert(!nodes['#verifierAssignmentResults'].innerHTML.includes('Revoked'));assert(!nodes['#verifierAssignmentResults'].innerHTML.includes('Access blocked'));
nodes['#verifierAssignmentPagination'].buttons['[data-page-next]'].onclick();assert.equal(state.assignmentPage,2);assert.equal(rows(),5);
nodes['#verifierAccessFilter'].onchange({target:{value:'revoked'}});assert.equal(rows(),3);assert.equal(state.assignmentPage,1);assert.match(nodes['#verifierAssignmentResults'].innerHTML,/Access removed/);
nodes['#verifierAccessFilter'].onchange({target:{value:'ineligible'}});assert.equal(rows(),1);assert.match(nodes['#verifierAssignmentResults'].innerHTML,/Access blocked/);
nodes['#verifierAccessFilter'].onchange({target:{value:'all'}});nodes['#verifierAssignmentSearch'].oninput({target:{value:'ID-14'}});assert.equal(rows(),1);assert.match(nodes['#verifierAssignmentResults'].innerHTML,/ID-14/);
nodes['#verifierAccessFilter'].onchange({target:{value:'active'}});assert.equal(rows(),0,'A revoked student search must never appear under Active');
nodes['#verifierAccessFilter'].onchange({target:{value:'revoked'}});assert.equal(rows(),1);
nodes['#verifierAssignmentSearch'].oninput({target:{value:'missing'}});assert.equal(rows(),0);assert.match(nodes['#verifierAssignmentResults'].innerHTML,/No matching assignments/);
assert.equal([...nodes['#verifierHistoryResults'].innerHTML.matchAll(/class="attendance-history-row"/g)].length,5);
nodes['#verifierHistoryPagination'].buttons['[data-page-next]'].onclick();assert.equal(state.historyPage,2);assert.match(nodes['#verifierHistoryResults'].innerHTML,/data-view-change="5"/);
nodes['#verifierHistorySearch'].oninput({target:{value:'ID-12'}});assert.equal(state.historyPage,1);assert.match(nodes['#verifierHistoryResults'].innerHTML,/data-view-change="11"/,'Filtered details retain the original log index');
nodes['#verifierAssignmentsDisclosure'].ontoggle({target:{open:false}});assert.equal(state.assignmentsOpen,false);
nodes['#verifierHistoryDisclosure'].ontoggle({target:{open:false}});assert.equal(state.historyOpen,false);
console.log('PASS: five-row assignment/history pagination, active/revoked/blocked filters, search, empty states, correct history indices and collapsed state.');
