const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function select(){let value='',options=[];return {disabled:false,get options(){return options},get value(){return value},set value(v){value=options.some(o=>o.value===String(v))?String(v):''},set innerHTML(html){options=[...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)/g)].map(m=>({value:m[1],textContent:m[2],disabled:false}));value=options[0]?.value||''},closest(){return {after(){}}}}}
const nodes={};for(const id of ['Level','Year','Number','Type'])nodes['#cwtsAssign'+id]=select();nodes['#cwtsAssignSession']={value:''};
const instructor=select(),company=select(),button={};company.innerHTML='<option value="">Company</option>';
nodes['#cwtsAssignForm']={elements:{instructor_id:instructor,company},querySelector:()=>button};
for(const id of ['cwtsInstructorSearch','cwtsInstructorMatches','cwtsSessionHint'])nodes['#'+id]={value:'',textContent:'',hidden:false};
const ctx={$:s=>nodes[s],esc:String,attendanceUpdateDate:()=>'',document:{addEventListener(){},createElement:()=>({setAttribute(){}})}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/js/officer/cwts-instructors.js','utf8'),ctx);
const events=[],sessions=[{id:1,ms_level:'1',school_year:'2026-2027',mi_number:1,mi_type:'in',open_date:'2026-10-01'},{id:2,ms_level:'1',school_year:'2026-2027',mi_number:1,mi_type:'out',open_date:'2026-10-01'}];
ctx.bindCwtsSessionFilters(sessions,false,[],[],s=>events.push(s),{ms_level:'1',school_year:'2026-2027',mi_number:'1',mi_type:'in'});
assert.equal(events.at(-1).mi_type,'in');assert.equal(nodes['#cwtsAssignSession'].value,'1');
nodes['#cwtsAssignType'].value='out';nodes['#cwtsAssignType'].onchange();assert.equal(events.at(-1).mi_type,'out');assert.equal(nodes['#cwtsAssignSession'].value,'2');
nodes['#cwtsAssignNumber'].value='';nodes['#cwtsAssignNumber'].onchange();assert.equal(events.at(-1).mi_type,'');assert.equal(nodes['#cwtsAssignSession'].value,'');
console.log('PASS: CWTS filter change callbacks, saved selection restoration, IN/OUT switching and clearing dependent filters.');
