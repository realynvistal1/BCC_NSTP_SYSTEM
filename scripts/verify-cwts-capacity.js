const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const db=require('../config/database'),companies=require('../services/cwtsCompanyService'),controller=require('../controllers/sharedAdminController');
const enrollment=require('../services/specialEnrollmentService');
function response(){return {code:200,status(n){this.code=n;return this},json(b){this.body=b}}}
const settings=[{name:'Alpha',capacity:23},{name:'Bravo',capacity:40}];
(async()=>{try{
for(const v of [1,23,60,1000])assert(companies.validCapacity(v));for(const v of [0,-1,1.5,'abc','',1001])assert(!companies.validCapacity(v));
assert.equal(companies.total(settings),63);const slots=companies.assignmentSlots(settings);assert.equal(slots.length,63);assert.equal(slots[22],'Alpha');assert.equal(slots[23],'Bravo');assert.equal(slots[62],'Bravo');
let writes=[];db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:(...args)=>db.execute(...args)});db.execute=async(sql,values)=>{if(sql.includes('SELECT EXISTS'))return [[{locked:0}]];if(sql.startsWith('INSERT')){writes.push({sql,values});return [{insertId:1}]};return [settings]};
let res=response();await controller.addCwtsCompany({body:{name:'Bravo',capacity:40}},res);assert.equal(res.code,201);assert.deepEqual(writes[0].values,['Bravo',40]);
res=response();await controller.addCwtsCompany({body:{name:'Bad',capacity:0}},res);assert.equal(res.code,400);
for(const scenario of [{capacity:22,usage:23,over:false,code:409},{capacity:23,usage:23,over:false,code:200},{capacity:80,usage:23,over:false,code:200},{capacity:30,usage:23,over:true,code:409}]){
let committed=false;writes=[];
db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{committed=true},rollback:async()=>{},release(){},execute:async(sql,values)=>{
if(sql.includes('SELECT EXISTS'))return [[{locked:0}]];
if(sql.includes('SELECT name,capacity'))return [[{name:'Alpha',capacity:60}]];
if(sql.includes('MAX(total)'))return [[{total:scenario.usage}]];
if(sql.includes('HAVING'))return [scenario.over?[{schedule_id:1}]:[]];
if(sql.startsWith('UPDATE'))writes.push({sql,values});return [[]];
}});
res=response();await controller.updateCwtsCompanyCapacity({params:{name:'Alpha'},body:{capacity:scenario.capacity}},res);assert.equal(res.code,scenario.code,JSON.stringify(res.body));assert.equal(committed,scenario.code===200);assert(writes.every(w=>w.sql.startsWith('UPDATE cwts_companies')));assert.equal(writes.length,scenario.code===200?1:0);
}
const schedule={program:'CWTS',open_date:'2000-01-01',deadline:'2999-01-01'};
const connection=count=>({execute:async sql=>sql.includes('enrollment_schedules')?[[schedule]]:sql.includes('cwts_companies')?[settings]:[Array.from({length:count},(_,id)=>({id}))]});
await assert.doesNotReject(enrollment.check(connection(62),1,{}));await assert.rejects(enrollment.check(connection(63),1,{}),e=>e.status===409);
const source=fs.readFileSync('controllers/sharedAdminController.js','utf8');
const approveSource=source.slice(source.indexOf('async function approveCwtsWithinCapacity'),source.indexOf('exports.updateEnrollment ='));
for(const count of [62,63]){
let updates=0;const c={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql)=>{
if(sql.includes('SELECT status'))return [[{status:'pending'}]];if(sql.includes('COUNT(*)'))return [[{total:count}]];if(sql.startsWith('UPDATE')){updates++;return [{}]};return [[{id:1}]];
}};
const ctx={db:{getConnection:async()=>c},cwtsCompanies:{details:async()=>settings,total:companies.total}};vm.createContext(ctx);vm.runInContext(approveSource,ctx);const result=await ctx.approveCwtsWithinCapacity(1,1);assert.equal(result.capacity,63);assert.equal(result.approved,count<63);assert.equal(updates,count<63?1:0);
}
for(const handler of [controller.addCwtsCompany,controller.updateCwtsCompanyCapacity,controller.deleteCwtsCompany]){
 let blockedWrites=0,rolledBack=false;
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{throw Error('Must not commit locked settings')},rollback:async()=>{rolledBack=true},release(){},execute:async sql=>{
 if(sql.includes('SELECT EXISTS'))return [[{locked:1}]];
 if(/^(INSERT|UPDATE|DELETE)/.test(sql))blockedWrites++;
 return [[]];
 }});
 const responseBody=response();await handler({body:{name:'Bravo',capacity:80},params:{name:'Alpha'}},responseBody);
 assert.equal(responseBody.code,409,JSON.stringify(responseBody.body));assert.equal(blockedWrites,0);assert(rolledBack);
}
console.log('PASS: add, edit and delete blocked after assignment with zero writes.');
console.log('PASS: capacity validation, add company, edit safety, assigned/approved limits, unequal allocation, enrollment and approval limits; no student assignment writes.');
}finally{await db.end()}})().catch(e=>{console.error(e);process.exitCode=1});
