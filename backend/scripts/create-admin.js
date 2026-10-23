require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env')});
const readline = require('node:readline/promises');
const {stdin:input, stdout:output}=require('node:process');
const bcrypt=require('bcrypt');
const db=require('../config/database');
(async()=>{
 const rl=readline.createInterface({input,output});
 try {
  const name=(await rl.question('Admin full name: ')).trim();
  const email=(await rl.question('Admin email: ')).trim().toLowerCase();
  const password=await rl.question('Admin password (minimum 12 characters): ');
  if(!name||!/^\S+@\S+\.\S+$/.test(email)||password.length<12) throw Error('Valid name, email and a 12+ character password are required.');
  const [[existing]]=await db.query('SELECT id FROM users WHERE email=?',[email]);
  if(existing) throw Error('This email already exists; no changes were made.');
  await db.query("INSERT INTO users(full_name,email,password_hash,role,status) VALUES (?,?,?,'admin','approved')",[name,email,await bcrypt.hash(password,12)]);
  console.log('Admin account created. Open /admin/login.html');
 } catch(error){console.error(error.message);process.exitCode=1;} finally {rl.close();await db.end();}
})();
