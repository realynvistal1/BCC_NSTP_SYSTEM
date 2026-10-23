// Offline checks; does not claim to test against a live MySQL server.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const files=[
 'backend/server.js','backend/config/database.js','backend/scripts/create-admin.js',
 'backend/scripts/doctor.js','backend/scripts/setup.js','backend/scripts/smoke-test.js',
 'frontend/assets/admin.js','frontend/assets/common.js','frontend/assets/faculty.js',
 'frontend/assets/evaluate.js','frontend/assets/reset.js','frontend/assets/portal-login.js','frontend/assets/v4.css','frontend/assets/v5.css','frontend/assets/redesign.css','frontend/assets/avatar.svg','frontend/login.html','database/upgrade_existing.sql',
 'frontend/admin/login.html','frontend/admin/dashboard.html',
 'frontend/faculty/login.html','frontend/faculty/dashboard.html',
 'frontend/evaluate.html','frontend/forgot-password.html','frontend/reset-password.html','database/schema.sql','database/upgrade_v5.sql',
];
let errors=0;
for(const name of files){
 const full=path.join(root,name);
 if(!fs.existsSync(full)){console.error('MISSING',name);errors++;continue;}
 if(name.endsWith('.js')){
  const result=cp.spawnSync(process.execPath,['--check',full],{encoding:'utf8'});
  if(result.status!==0){console.error('SYNTAX ERROR',name,result.stderr);errors++;}
 }
}
const server=fs.readFileSync(path.join(root,'backend/server.js'),'utf8');
const requirements=['/api/auth/register','/api/auth/login','/api/admin/periods','/api/faculty/assignments','/api/public/evaluate/:token','/api/auth/forgot-password','/api/auth/reset-password','/api/admin/analytics','/api/faculty/analytics'];
for(const endpoint of requirements)if(!server.includes(endpoint)){console.error('MISSING API',endpoint);errors++;}
console.log(errors?`FAIL: ${errors} issues in project files.`:'PASS: All required project files, JavaScript syntax and core API routes checked.');
console.log('This check does not replace a real MySQL end-to-end test.');
if(errors)process.exitCode=1;
