require('dotenv').config({quiet:true});
const assert=require('node:assert/strict'),express=require('express'),jwt=require('jsonwebtoken'),db=require('../config/database');
const app=express();for(const program of ['rotc','cwts'])app.use('/api/admin/'+program,require('../routes/'+program+'AdminRoutes'));app.use('/api/officer',require('../routes/officerRoutes'));
let server;
(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
const token=(role,portal)=>jwt.sign({id:1,role,portal},process.env.JWT_SECRET,{audience:'bcc-nstp-app',issuer:'bcc-nstp-system',expiresIn:'2m'});
const get=async(url,auth)=>{const r=await fetch(base+url,{headers:auth?{Authorization:'Bearer '+auth}:{}});return r};
for(const program of ['ROTC','CWTS']){
 const key=program.toLowerCase(),auth=token('admin',key+'-admin');
 const [[row]]=await db.query("SELECT smr.id record_id,s.id student_id,smr.ms_level,smr.status,OCTET_LENGTH(COALESCE(s.photo,''))+OCTET_LENGTH(COALESCE(s.medical_certificate,''))+OCTET_LENGTH(COALESCE(s.xray_file,''))+OCTET_LENGTH(COALESCE(s.cor_file,'')) upload_bytes FROM student_ms_records smr JOIN students s ON s.id=smr.student_id WHERE smr.program=? ORDER BY (smr.status='approved') DESC,upload_bytes DESC LIMIT 1",[program]);
 if(!row){console.log('No '+program+' records to test');continue;}
 const response=await get('/api/admin/'+key+'/enrollments/'+row.record_id,auth);assert.equal(response.status,200);const text=await response.text(),detail=JSON.parse(text);assert(!('password' in detail));assert(!text.includes('data:image/'));assert(Buffer.byteLength(text)<30000);
 for(const field of ['photo','medical_certificate','xray_file','cor_file'])if(detail[field]){
  assert(detail[field].startsWith('/api/admin/'+key+'/students/'));
  const file=await get(detail[field],auth);assert.equal(file.status,200,field);assert((await file.arrayBuffer()).byteLength>0);assert.equal(file.headers.get('cache-control'),'private, no-store');
  assert.equal((await get(detail[field])).status,401);assert.equal((await get(detail[field],token('admin',key==='rotc'?'cwts-admin':'rotc-admin'))).status,403);
 }
 assert.equal((await get('/api/admin/'+key+'/students/'+row.student_id+'/files/password',auth)).status,400);
 if(row.status==='approved'){
 const record=await get('/api/admin/'+key+'/records/'+row.student_id+'?ms_level='+row.ms_level,auth);assert.equal(record.status,200);const r=await record.json();assert(!('password' in r.student));assert(!JSON.stringify(r).includes('data:image/'));
 const officer=await get('/api/officer/records/'+row.student_id+'?ms_level='+row.ms_level+'&program='+program,token('officer','officer'));assert.equal(officer.status,200);const o=await officer.json();assert(!('password' in o.student));if(o.student.photo)assert.equal((await get(o.student.photo,token('officer','officer'))).status,200);
 }
 console.log(JSON.stringify({program,detailBytes:Buffer.byteLength(text),previousEmbeddedUploadBytes:Number(row.upload_bytes),filesAndAccessChecks:'passed',recordDetails:'passed'}));
}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(server)await new Promise(r=>server.close(r));await db.end()});
