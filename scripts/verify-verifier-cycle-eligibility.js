const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const db=require('../config/database'),controller=require('../controllers/rotcVerifierController');
const ui=fs.readFileSync('public/js/shared/rotc-verifiers.js','utf8');const context={document:{addEventListener(){}}};vm.createContext(context);vm.runInContext(ui,context);
const cycle={ms_level:'2',school_year:'2026-2027'};
assert(!context.verifierCandidateMatchesCycle({ms_level:'1',school_year:'2026-2027'},cycle));
assert(!context.verifierCandidateMatchesCycle({ms_level:'2',school_year:'2025-2026'},cycle));
assert(context.verifierCandidateMatchesCycle({ms_level:'2',school_year:'2026-2027'},cycle));
assert(!context.verifierCandidateMatchesCycle({ms_level:'2',school_year:'2026-2027'},null));
const source=fs.readFileSync('controllers/rotcVerifierController.js','utf8');const eligible=source.slice(source.indexOf('const eligible ='),source.indexOf('let scope ='));
assert(eligible.includes('vr.ms_level=a.ms_level'));assert(eligible.includes('ves.year=a.school_year'));assert(eligible.includes("vr.status='approved'"));
const body={verifier_id:7,battalion:1,company:'Alpha',platoon:1,ms_level:'2',school_year:'2026-2027',mi_number:1,mi_type:'in'};
const response=()=>({code:200,status(n){this.code=n;return this},json(b){this.body=b}});
(async()=>{try{
 db.execute=async(sql,params)=>{assert(sql.includes('smr.ms_level=? AND es.year=?'));assert(sql.includes("smr.status='approved'"));assert.deepEqual(params,[7,'2','2026-2027']);return [[]]};
 let res=response();await controller.assign({body,user:{email:'test@example.invalid'}},res);assert.equal(res.code,400);
 db.execute=async sql=>sql.includes('SELECT s.id,s.sex')?[[{id:7,sex:'Male'}]]:[[{id:1}]];
 let writes=0,rolledBack=false;
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{throw Error('Must not commit stale eligibility')},rollback:async()=>{rolledBack=true},release(){},execute:async(sql,params)=>{
 if(sql.includes('SELECT s.id FROM students s JOIN')){assert(sql.includes('smr.ms_level=?'));assert(sql.includes('es.year=?'));assert.deepEqual(params,[7,'2','2026-2027']);return [[]]}
 if(sql.includes('active=1 FOR UPDATE'))return [[]];if(sql.startsWith('INSERT'))writes++;return [[{id:1}]];
 }});
 res=response();await controller.assign({body,user:{email:'test@example.invalid'}},res);assert.equal(res.code,409);assert.equal(writes,0);assert(rolledBack);
 console.log('PASS: MS1 excluded from MS2 picker; wrong year excluded; matching cycle included; server rejects missing/unapproved enrollment and rechecks eligibility before assignment.');
 }finally{await db.end()}})().catch(e=>{console.error(e);process.exitCode=1});
