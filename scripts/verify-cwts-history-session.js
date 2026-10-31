const assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs'),db=require('../config/database'),controller=require('../controllers/cwtsInstructorController');
const context={document:{addEventListener(){}}};vm.createContext(context);vm.runInContext(fs.readFileSync('public/js/officer/cwts-instructors.js','utf8'),context);
const chosen={ms_level:'1',school_year:'2026-2027',mi_number:'1',mi_type:'in'};
assert(context.cwtsMatchesHistorySession(chosen,chosen));
for(const [key,value] of [['ms_level','2'],['school_year','2025-2026'],['mi_number','2'],['mi_type','out']])assert(!context.cwtsMatchesHistorySession({...chosen,[key]:value},chosen));
assert(!context.cwtsMatchesHistorySession(chosen,{}));assert(!context.cwtsMatchesHistorySession(chosen,{...chosen,mi_type:''}));
(async()=>{try{
for(const type of ['in','out']){let code=200,rows;await controller.audit({query:{...chosen,mi_type:type}},{status(n){code=n;return this},json(v){rows=v}});assert.equal(code,200);assert(rows.every(r=>String(r.ms_level)==='1'&&r.school_year===chosen.school_year&&String(r.mi_number)==='1'&&r.mi_type===type));console.log('PASS CWTS history SQL: CS 1 '+type.toUpperCase()+', '+rows.length+' updates');}
let code;await controller.audit({query:{...chosen,mi_type:'invalid'}},{status(n){code=n;return this},json(){}});assert.equal(code,400);
console.log('PASS: CWTS level/year/CS/type isolation, incomplete selection and invalid type rejection.');
}finally{await db.end()}})().catch(e=>{console.error(e);process.exitCode=1});
