// Add a labeled ROTC demonstration dataset without changing existing records.
require('dotenv').config({quiet:true});
const fs=require('fs'),path=require('path'),crypto=require('crypto'),bcrypt=require('bcryptjs'),sharp=require('sharp');
const db=require('../config/database'),accounts=require('../services/instructorPortalService'),instructors=require('../services/gradeInstructorService'),grades=require('../services/instructorGradeService');
const backup=path.join(__dirname,'../.local-backups'),manifestPath=path.join(backup,'rotc-demo-data.json');
const localDate=date=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);
async function avatar(initials,color){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="210"><rect width="180" height="210" fill="${color}"/><circle cx="90" cy="85" r="52" fill="#ffffff" fill-opacity=".6"/><text x="90" y="101" text-anchor="middle" font-family="Arial" font-size="44" font-weight="bold" fill="#254d60">${initials}</text><text x="90" y="177" text-anchor="middle" font-family="Arial" font-size="18" fill="#254d60">SAMPLE</text></svg>`;return 'data:image/png;base64,'+(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');}
(async()=>{
 fs.mkdirSync(backup,{recursive:true});
 if(fs.existsSync(manifestPath)){const previous=JSON.parse(fs.readFileSync(manifestPath));const [[row]]=await db.execute('SELECT id FROM enrollment_schedules WHERE id=?',[previous.schedule_id]);if(row){console.log('ROTC demo already exists. Schedule '+row.id+'. See .local-backups/ROTC-DEMO-LOGINS.md');await db.end();return;}}
 const c=await db.getConnection();await c.beginTransaction();
 const facade={execute:c.execute.bind(c),getConnection:async()=>({execute:c.execute.bind(c),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}})};
 const password='Demo!'+crypto.randomBytes(9).toString('base64url')+'8a',hash=await bcrypt.hash(password,12),actor='rotc-demo-seed@example.invalid';
 const manifest={created_at:new Date().toISOString(),schedule_id:null,students:[],instructors:[],sessions:[],verifier_assignments:[]};
 try{
  const [existing]=await c.execute("SELECT id FROM enrollment_schedules WHERE program='ROTC' AND year='2026-2027' AND ms_level='1'");if(existing.length)throw Error('A ROTC schedule already exists. No demo records were added.');
  const now=Date.now(),[schedule]=await c.execute("INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline,platoons_assigned_at) VALUES('ROTC','1','2026-2027',?,?,?)",[localDate(new Date(now-7*86400000)),localDate(new Date(now-86400000)),localDate(new Date(now-12*3600000))]);manifest.schedule_id=schedule.insertId;
  const rows=[
   ['Miguel','Santos','Male','BS Criminology',1,'Alpha',1,'',0],['Daniel','Reyes','Male','BS Information Technology',1,'Alpha',1,'',0],['Carlo','Cruz','Male','BS Hospitality Management',1,'Alpha',1,'',0],
   ['Joshua','Garcia','Male','Bachelor of Elementary Education',1,'Alpha',2,'',0],['Adrian','Flores','Male','BS Tourism Management',1,'Alpha',2,'',0],
   ['Sofia','Ramos','Female','BS Information Technology',2,'Bravo',1,'',0],['Isabella','Torres','Female','BS Criminology',2,'Bravo',1,'',0],
   ['Camille','Mendoza','Female','Bachelor of Secondary Education',2,'Bravo',2,'',0],['Nicole','Castillo','Female','BS Hospitality Management',2,'Bravo',2,'',0],
   ['Andrea','Rivera','Female','BS Information Technology',null,null,null,'HQ',0],['Paolo','Aquino','Male','BS Criminology',null,null,null,'Medics',0],['Julia','Navarro','Female','BS Tourism Management',null,null,null,'MP',0],
   ['Marco','Villanueva','Male','BS Criminology',null,null,null,'',1],['Gabriel','Dizon','Male','BS Information Technology',null,null,null,'',1],['Luis','Fernandez','Male','BS Hospitality Management',null,null,null,'',1],['Rafael','Domingo','Male','BS Tourism Management',null,null,null,'',1],
   ['Alyssa','Mercado','Female','Bachelor of Elementary Education',null,null,null,'',1],['Bianca','Lopez','Female','BS Criminology',null,null,null,'',1],['Hannah','Perez','Female','BS Information Technology',null,null,null,'',1]
  ];
  for(const [index,row] of rows.entries()){
   const [first,last,sex,course,battalion,company,platoon,special,advance]=row,studentNo='DEMO-ROTC-'+String(index+1).padStart(3,'0'),email='demo.rotc.student'+String(index+1).padStart(2,'0')+'@example.invalid';
   const photo=await avatar(first[0]+last[0],sex==='Male'?'#bcd6ee':'#d2c9e9');
   const [student]=await c.execute("INSERT INTO students(student_id,first_name,last_name,email,password,nstp_component,course,year_level,sex,photo,willing_to_take_advance_course,battalion,rotc_company,rotc_platoon,special_unit,role,birthdate,contact_number) VALUES(?,?,?,?,?,'ROTC',?,'1st Year',?,?,?,?,?,?,?,'student','2007-01-15','09000000000')",[studentNo,'Sample '+first,last,email,hash,course,sex,photo,advance,battalion,company,platoon,special||null]);
   const label=advance?'Advance Course':special||'Battalion '+battalion+' / '+company+' / Platoon '+platoon;
   const [record]=await c.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,program,status,assignment_battalion,assignment_company,assignment_platoon,assignment_special_unit,assignment_is_advance,assignment_label) VALUES(?,?,'1','ROTC','approved',?,?,?,?,?,?)",[student.insertId,String(schedule.insertId),battalion,company,platoon,special||null,advance,label]);
   manifest.students.push({id:student.insertId,record_id:record.insertId,student_no:studentNo,email,name:'Sample '+first+' '+last,sex,advance:Boolean(advance),group:label});
  }
  for(const [index,person] of [['approved',['Alex','Instructor']],['pending',['Jamie','Instructor']]]){
   const email='demo.rotc.'+index+'@example.invalid';
   const result=await accounts.register(facade,{first_name:'Sample '+person[0],last_name:person[1],email,program:'ROTC',school_year:'2026-2027',level:'1',password,confirm_password:password,profile_photo:await avatar(person[0][0]+'I','#b9d9cd')});
   if(index==='approved'){await accounts.review(facade,'ROTC',result.id,{decision:'approved'},actor);const assignment=await instructors.assign(facade,'ROTC',{schedule_id:schedule.insertId,instructor_id:result.id},actor);manifest.grade_assignment_id=assignment;}
   manifest.instructors.push({id:result.id,email,status:index});
  }
  for(const [mi,type,start,end,status] of [[1,'in',now-2*86400000,now-2*86400000+3600000,'closed'],[1,'out',now-2*86400000+4*3600000,now-2*86400000+5*3600000,'closed'],[2,'in',now-15*60000,now+2*3600000,'open']]){
   const [session]=await c.execute("INSERT INTO attendance_sessions(program,ms_level,school_year,is_advance_course,mi_number,mi_type,open_date,close_date,latitude,longitude,radius_meters,status,created_by) VALUES('ROTC','1','2026-2027',0,?,?,?,?,8.973,125.411,500,?,?)",[mi,type,localDate(new Date(start)),localDate(new Date(end)),status,actor]);manifest.sessions.push({id:session.insertId,mi_number:mi,type,status});
   for(const [i,student] of manifest.students.filter(s=>!s.advance).entries()){const attendance=['present','late','absent','unmarked'][i%4];if(attendance==='unmarked')continue;await c.execute('INSERT INTO attendance_records(student_id,attendance_session_id,status,created_at,claimed_present) VALUES(?,?,?,?,0)',[student.id,session.insertId,attendance,localDate(new Date(start+5*60000))]);}
  }
  const verifier=manifest.students.find(s=>s.advance&&s.sex==='Male');const [assigned]=await c.execute("INSERT INTO rotc_verifier_assignments(verifier_id,battalion,company,platoon,special_unit,ms_level,school_year,mi_number,mi_type,active,assigned_by) VALUES(?,1,'Alpha',1,'','1','2026-2027',0,'',1,?)",[verifier.id,actor]);manifest.verifier_assignments.push(assigned.insertId);
  const teacher=manifest.instructors.find(i=>i.status==='approved'),user={id:teacher.id,email:teacher.email,program:'ROTC',session_version:1};
  const roster=await grades.records(facade,user,manifest.grade_assignment_id);
  for(const [i,student] of roster.students.slice(0,5).entries())await grades.save(facade,user,manifest.grade_assignment_id,student.enrollment_record_id,{midterm:i===0?'2.50':'2.00',final_term:i===0?'3.00':'2.50',action:i<3?'submitted':'draft',expected_version:null});
  await c.commit();fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  const lines=['# ROTC demo logins','','School year: 2026-2027 | NSTP 1','',`Password for these demo accounts: ${password}`,'','## Instructors','',...manifest.instructors.map(i=>`- ${i.email} (${i.status})`),'','Instructor login: http://localhost:3000/instructor/login','','## Students','',...manifest.students.map(s=>`- ${s.student_no} | ${s.email} | ${s.name} | ${s.group}`),'','Student login: http://localhost:3000/student/login','','All names and emails are sample data. The pending instructor must be approved before login.'];
  fs.writeFileSync(path.join(backup,'ROTC-DEMO-LOGINS.md'),lines.join('\n'));
  console.log(JSON.stringify({school_year:'2026-2027',level:1,schedule_id:manifest.schedule_id,regular_students:manifest.students.filter(s=>!s.advance).length,advance_students:manifest.students.filter(s=>s.advance).length,instructors:manifest.instructors.length,sessions:manifest.sessions.length,semester_verifiers:manifest.verifier_assignments.length,grade_submissions:3,grade_drafts:2,credentials:'.local-backups/ROTC-DEMO-LOGINS.md'}));
 }catch(e){await c.rollback();throw e;}finally{c.release();await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
