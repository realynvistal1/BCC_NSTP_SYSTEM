// Check Node.js, .env, MySQL connection, and all required database tables.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const envFile=path.resolve(__dirname,'../.env');
if(!fs.existsSync(envFile)){
 console.error('FAIL: backend/.env is missing. Copy backend/.env.example to backend/.env and fill it in.');
 process.exit(1);
}
require('dotenv').config({path:envFile});
const major=Number(process.versions.node.split('.')[0]);
console.log(`Node.js version: ${process.version} ${major>=20?'OK':'(requires 20 or newer)'}`);
const missing=[];
const secret=process.env.JWT_SECRET||'';
if(secret.length<32||secret.startsWith('replace-with-')||secret.startsWith('REPLACE_WITH_'))missing.push('JWT_SECRET: generate a unique 32+ character value');
const pepper=process.env.CODE_PEPPER||'';
if(pepper.length<20||pepper.startsWith('replace-with-')||pepper.startsWith('REPLACE_WITH_'))missing.push('CODE_PEPPER: generate a separate unique value for anonymous one-time codes');
if(major<20)missing.push('Node.js 20 or newer is required');
if(missing.length){console.error('Configuration problems:\n- '+missing.join('\n- '));process.exit(1);}
(async()=>{
 const mysql=require('mysql2/promise');
 const config={host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),
  user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'faculty_evaluation'};
 console.log(`Checking MySQL on ${config.host}:${config.port}, database ${config.database} (password hidden)...`);
 let con;
 try{
  con=await mysql.createConnection({...config,connectTimeout:7000});
  console.log('PASS: MySQL connection successful.');
  const [rows]=await con.execute('SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  const found=new Set(rows.map(r=>r.table_name));
  const tables=['users','periods','questions','faculty_periods','assignments','access_codes','evaluations','answers','password_reset_requests','password_resets'];
  const missingTables=tables.filter(n=>!found.has(n));
  if(missingTables.length)throw Error('Missing tables: '+missingTables.join(', ')+'. Import database/schema.sql into phpMyAdmin.');
  console.log('PASS: All 10 required MySQL tables are present.');
  const requiredColumns={
   users:['id','full_name','email','password_hash','role','status','first_name','department','photo_data'],
   periods:['id','starts_at','ends_at','status'],
   questions:['id','period_id','question_text','sort_order'],
   faculty_periods:['faculty_id','period_id'],
   assignments:['id','faculty_id','period_id','subject_code','section_name','status','public_token'],
   access_codes:['assignment_id','code_hash','used_at'],
   evaluations:['id','assignment_id'],
   answers:['evaluation_id','question_id','rating']
  };
  const [columns]=await con.execute('SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
  const got=new Set(columns.map(c=>`${c.table_name}.${c.column_name}`));
  const missingColumns=[];
  for(const [table,names] of Object.entries(requiredColumns))for(const column of names)
   if(!got.has(`${table}.${column}`))missingColumns.push(`${table}.${column}`);
  if(missingColumns.length)throw Error('Your MySQL schema is incomplete or outdated. Missing columns: '+missingColumns.join(', ')+'. Back up existing records before correcting the database.');
  console.log('PASS: Important MySQL columns are present.');
  console.log('PASS: Setup looks good. Run npm run create-admin, then npm start.');
 }catch(e){
  const hints={ECONNREFUSED:'Start MySQL in XAMPP; verify port 3306 (or your configured port).',
   ER_ACCESS_DENIED_ERROR:'Check DB_USER and DB_PASSWORD in backend/.env.',
   ER_BAD_DB_ERROR:'Import database/schema.sql into phpMyAdmin to create the faculty_evaluation database.',
   ENOTFOUND:'Check DB_HOST in backend/.env.'};
  console.error('FAIL:',e.message);
  if(hints[e.code])console.error('Fix:',hints[e.code]);
  process.exitCode=1;
 }finally{await con?.end().catch(()=>{});}
})();
