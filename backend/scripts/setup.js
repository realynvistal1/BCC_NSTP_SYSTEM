// First-time setup. Preserve existing MySQL credentials and never overwrite user secrets.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const file=path.join(__dirname,'../.env');
const template=path.join(__dirname,'../.env.example');
let created=false;
if(!fs.existsSync(file)){
 fs.copyFileSync(template,file);
 created=true;
}
let text=fs.readFileSync(file,'utf8');
let n=0;
for(const key of ['JWT_SECRET','CODE_PEPPER']){
 const re=new RegExp('^'+key+'=(.*)$','m');
 const m=text.match(re);
 const val=m?.[1]?.trim()??'';
 if(val.length<32 || val.startsWith('replace-with-') || val.startsWith('REPLACE_WITH_') || val.startsWith('PASTE_')){
  const secret=crypto.randomBytes(32).toString('hex');
  if(m)text=text.replace(re,`${key}=${secret}`);
  else text+=`\n${key}=${secret}\n`;
  n++;
 }
}
if(n){
 if(!created)fs.copyFileSync(file,file+'.backup-'+Date.now());
 fs.writeFileSync(file,text,{mode:0o600});
}
console.log(created?'Created backend/.env using XAMPP defaults.':'Existing backend/.env preserved.');
console.log(n?`Generated ${n} private random secret(s).`:'Existing secrets were left unchanged.');
console.log('Next: Start MySQL + Apache in XAMPP, import database/schema.sql using phpMyAdmin, then run npm run doctor.');
