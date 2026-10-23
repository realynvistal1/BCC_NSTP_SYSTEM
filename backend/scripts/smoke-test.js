// With `npm start` running and MySQL configured: `npm run smoke`
require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env')});
const root=process.env.PUBLIC_APP_URL || 'http://localhost:5000';
(async()=>{
 const checks=[
  ['Landing page','/',200,'FacultyEval'],
  ['Admin login','/admin/login.html',200,'Administrator Portal'],
  ['Faculty login','/faculty/login.html',200,'Faculty Portal'],
  ['Student form','/evaluate/'+'a'.repeat(48),200,'Evaluate your instructor'],
  ['MySQL connection','/api/health',200,'mysql'],
  ['No student login','/student/login.html',404,'Page not found'],
  ['Protected admin API','/api/admin/overview',401,'Please sign in']
 ];
 let passed=0;
 for(const [name,path,status,text] of checks){
  try{const res=await fetch(root+path);const body=await res.text();const ok=res.status===status&&body.includes(text);console.log(ok?'PASS':'FAIL',name);if(ok)passed++;}
  catch(e){console.log('FAIL',name,e.message);}
 }
 console.log(`Passed ${passed}/${checks.length} checks`);
 if(passed!==checks.length)process.exitCode=1;
})();
