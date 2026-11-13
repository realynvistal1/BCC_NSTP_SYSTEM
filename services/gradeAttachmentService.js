const {readAccess}=require('./instructorAssignmentHistoryService');
const XLSX=require('xlsx');
const {id,fail,table}=require('./instructorPortalService');
const metadata='id,assignment_id,original_name,file_size,created_at';
const instructorColumn=program=>program==='ROTC'?'rotc_instructor_id':'cwts_instructor_id';
function validate(file){
 if(!file||!Buffer.isBuffer(file.buffer)||!file.buffer.length)fail('Choose an Excel workbook first.');
 if(file.buffer.length>8*1024*1024)fail('The Excel workbook must be 8 MB or smaller.');
 if(file.buffer.length<4||!/\.xlsx$/i.test(file.originalname||'')||file.buffer.readUInt32LE(0)!==0x04034b50)fail('Upload a valid .xlsx Excel workbook.');
 // Bound expanded ZIP size before parsing the workbook; formulas are never executed.
 const b=file.buffer;let end=-1;
 for(let n=b.length-22;n>=Math.max(0,b.length-65557);n--)if(b.readUInt32LE(n)===0x06054b50){end=n;break;}
 if(end<0)fail('The Excel workbook is damaged. Save it as .xlsx and upload again.');
 const count=b.readUInt16LE(end+10);let offset=b.readUInt32LE(end+16),expanded=0;
 if(!count||count>2000)fail('The workbook contains too many parts. Upload a smaller workbook.');
 for(let n=0;n<count;n++){
   if(offset+46>b.length||b.readUInt32LE(offset)!==0x02014b50)fail('The Excel workbook is damaged.');
   expanded+=b.readUInt32LE(offset+24);
   if(expanded>40*1024*1024||(b.readUInt16LE(offset+8)&1))fail('Upload an unencrypted Excel workbook with a smaller size.');
   offset+=46+b.readUInt16LE(offset+28)+b.readUInt16LE(offset+30)+b.readUInt16LE(offset+32);
 }
 try{const workbook=XLSX.read(b,{type:'buffer',bookSheets:true,bookProps:true});if(!workbook.SheetNames?.length)throw Error();}
 catch{fail('The Excel workbook could not be read. Save it as .xlsx and upload again.');}
 return String(file.originalname).split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f"']/g,'').slice(0,180);
}
async function latest(db,user,assignmentId){
 const [[attachment]]=await db.execute(`SELECT ${metadata} FROM instructor_grade_attachments WHERE program=? AND assignment_id=? AND instructor_id=? ORDER BY id DESC LIMIT 1`,[user.program,assignmentId,user.id]);
 return attachment||null;
}
async function upload(db,user,assignmentId,file){
 table(user.program);assignmentId=id(assignmentId);const filename=validate(file),c=await db.getConnection();
 try{
   await c.beginTransaction();
   const [[account]]=await c.execute(`SELECT id FROM ${table(user.program)} WHERE id=? AND status='active' AND review_status='approved' AND session_version=? FOR UPDATE`,[user.id,user.session_version]);
   if(!account)fail('Your instructor access changed. Please sign in again.',401);
   const [[assignment]]=await c.execute(`SELECT id FROM grade_instructor_assignments WHERE id=? AND program=? AND ${instructorColumn(user.program)}=? AND active=1 AND company<>'' FOR UPDATE`,[assignmentId,user.program,user.id]);
   if(!assignment)fail('This teaching assignment is no longer available.',403);
   const [saved]=await c.execute('INSERT INTO instructor_grade_attachments(program,assignment_id,instructor_id,original_name,file_size,file_data) VALUES(?,?,?,?,?,?)',[user.program,assignmentId,user.id,filename,file.buffer.length,file.buffer]);
   const [[attachment]]=await c.execute(`SELECT ${metadata} FROM instructor_grade_attachments WHERE id=?`,[saved.insertId]);
   await c.commit();return {message:'Supporting Excel workbook uploaded.',attachment};
 }catch(error){await c.rollback();throw error;}finally{c.release();}
}
async function download(db,user,attachmentId,adminProgram){
 const program=adminProgram||user.program;table(program);
 const params=[id(attachmentId),program];
 let extra='';
 if(!adminProgram){extra=` AND f.instructor_id=? AND ${readAccess('a',instructorColumn(program))}`;params.push(user.id,user.id);}
 const [[file]]=await db.execute(`SELECT f.original_name,f.file_data FROM instructor_grade_attachments f JOIN grade_instructor_assignments a ON a.id=f.assignment_id WHERE f.id=? AND f.program=?${extra}`,params);
 if(!file)fail('This supporting workbook is not available to your account.',404);return file;
}
async function required(c,user,assignmentId,attachmentId){
 if(!attachmentId)fail('Upload the supporting Excel workbook for this company/group before submitting grades.');
 const [[file]]=await c.execute('SELECT id FROM instructor_grade_attachments WHERE id=? AND program=? AND assignment_id=? AND instructor_id=? FOR UPDATE',[id(attachmentId),user.program,assignmentId,user.id]);
 if(!file)fail('Select the supporting Excel workbook uploaded for this teaching assignment.',403);return file.id;
}
module.exports={validate,latest,upload,download,required};
