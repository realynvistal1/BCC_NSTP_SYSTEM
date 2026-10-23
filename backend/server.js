'use strict';
require('dotenv').config({path:require('node:path').resolve(__dirname,'.env')});
const express=require('express');
const path=require('node:path');
const crypto=require('node:crypto');
const bcrypt=require('bcrypt');
const jwt=require('jsonwebtoken');
const db=require('./config/database');

if(!process.env.JWT_SECRET || process.env.JWT_SECRET.length<32 || process.env.JWT_SECRET.startsWith('replace-with-') || process.env.JWT_SECRET.startsWith('REPLACE_WITH_')){
 console.error('Missing JWT_SECRET. Open backend/.env and set JWT_SECRET to a unique random value of at least 32 characters.');
 console.error('Generate one with: node -e "console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))"');
 process.exit(1);
}
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'3mb'}));
app.use((req,res,next)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Cache-Control',req.path.startsWith('/api/')?'no-store':'public, max-age=60');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
 next();
});
const front=path.resolve(__dirname,'../frontend');
app.get('/',(req,res)=>res.sendFile(path.join(front,'index.html')));
app.get('/admin',(req,res)=>res.redirect('/admin/login.html'));
app.get('/faculty',(req,res)=>res.redirect('/faculty/login.html'));
app.get('/evaluate/:token',(req,res)=>res.sendFile(path.join(front,'evaluate.html')));
app.use(express.static(front,{index:false,dotfiles:'deny'}));

const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const invalid=(res,message,status=400)=>res.status(status).json({message});
const str=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
const validEmail=v=>/^\S+@\S+\.\S+$/.test(v)&&v.length<=190;
const DEPARTMENTS=['IT DEPARTMENT','CRIMINOLOGY DEPARTMENT','HM DEPARTMENT','EDUCATION DEPARTMENT','TOURISM DEPARTMENT','ICT DEPARTMENT'];
const cleanProfile=(v)=>({
 firstName:str(v.firstName,65),middleName:str(v.middleName,65),lastName:str(v.lastName,65),suffix:str(v.suffix,20),
 employeeId:str(v.employeeId,40),department:str(v.department,150),designation:str(v.designation,90),
 employmentStatus:str(v.employmentStatus,40),contactNumber:str(v.contactNumber,25),officeLocation:str(v.officeLocation,120),
 highestEducation:str(v.highestEducation,150),specialization:str(v.specialization,200),bio:str(v.bio,600)
});
function parsePhoto(input){
 if(!input)return null;
 if(typeof input!=='string')throw Error('Photo must be a JPEG, PNG or WebP image.');
 const m=/^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=]+)$/i.exec(input);
 if(!m)throw Error('Use a JPEG, PNG or WebP photo.');
 const bytes=Buffer.from(m[2],'base64');
 if(!bytes.length||bytes.length>800000)throw Error('Photo is too large. Choose a smaller image.');
 const b=bytes.toString('hex').toLowerCase();const type=m[1].toLowerCase();
 if(!(type==='jpeg'&&b.startsWith('ffd8ff')||type==='png'&&b.startsWith('89504e470d0a1a0a')||type==='webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'))throw Error('The photo file is invalid.');
 return {bytes,mime:'image/'+type};
}

const schoolYearFromStart=(v)=>{const y=Number(v);return Number.isInteger(y)&&y>=2015&&y<=2150?`${y}-${y+1}`:null;};
const dateInput=v=>{const s=str(v,32);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(s))return null;const dt=new Date(s+':00Z');return !Number.isNaN(dt.getTime())&&dt.toISOString().slice(0,16)===s?s.replace('T',' ')+':00':null;};
const roleGuard=role=>asyncRoute(async(req,res,next)=>{
 const match=/^Bearer (.+)$/.exec(req.headers.authorization||'');
 if(!match)return invalid(res,'Please sign in to continue.',401);
 let payload;try{payload=jwt.verify(match[1],process.env.JWT_SECRET);}catch{return invalid(res,'Session expired. Please sign in again.',401);}
 const [[user]]=await db.query('SELECT id,full_name,email,department,role,status FROM users WHERE id=?',[payload.id]);
 if(!user||user.status!=='approved')return invalid(res,'This account is not approved or has been suspended.',403);
 if(user.role!==role)return invalid(res,'You do not have permission to access this area.',403);
 req.user=user;next();
});
const admin=roleGuard('admin'),faculty=roleGuard('faculty');
const getPeriod=async periodId=>{const [[p]]=await db.query('SELECT * FROM periods WHERE id=?',[periodId]);return p;};
const freeToSetUp=p=>p&&p.status==='open';
const reportingSql=`SELECT a.id,a.faculty_id,a.period_id,a.subject_code,a.subject_name,a.year_level,a.section_name,a.status,a.requires_code,a.public_token,a.created_at,u.full_name AS faculty_name,u.department,p.title AS period_title,p.school_year AS school_year,p.status AS period_status,p.required_students,p.semester,
 (SELECT COUNT(*) FROM evaluations e WHERE e.assignment_id=a.id) AS response_count,
 (SELECT ROUND(AVG(ans.rating),2) FROM answers ans JOIN evaluations e ON ans.evaluation_id=e.id WHERE e.assignment_id=a.id) AS average_rating
 FROM assignments a JOIN users u ON u.id=a.faculty_id JOIN periods p ON p.id=a.period_id`;
const sampleQuestions=Object.entries(require('../frontend/assets/questionnaire-template.json')).flatMap(([category,questions])=>questions.map(text=>[category,text]));

// Faculty profile photos: public only for approved instructors. No directory browsing or file uploads on disk.
app.get('/api/public/faculty/:id/photo',asyncRoute(async(req,res)=>{
 const [[row]]=await db.query("SELECT photo_data,photo_mime FROM users WHERE id=? AND role='faculty' AND status='approved'",[id(req.params.id)]);
 if(!row||!row.photo_data)return res.status(404).end();
 res.setHeader('Content-Type',row.photo_mime||'image/jpeg');res.setHeader('Cache-Control','no-store');
 res.send(row.photo_data);
}));
// AUTHENTICATION: Admins are created via CLI; public registration is only for faculty.
app.post('/api/auth/register',asyncRoute(async(req,res)=>{
 const d=cleanProfile(req.body||{}),email=str(req.body.email,190).toLowerCase(),password=req.body.password;
 if(!d.firstName||!d.lastName||!DEPARTMENTS.includes(d.department)||!validEmail(email)||typeof password!=='string'||password.length<8||password.length>128)
  return invalid(res,'Complete your first name, last name, department, email, and a password of at least 8 characters.');
 const fullName=[d.firstName,d.middleName,d.lastName,d.suffix].filter(Boolean).join(' ');
 let photo;try{photo=parsePhoto(req.body.imageDataUrl);}catch(e){return invalid(res,e.message);}
 try{
  await db.query(`INSERT INTO users(full_name,first_name,middle_name,last_name,suffix,employee_id,email,password_hash,department,designation,employment_status,contact_number,office_location,highest_education,specialization,bio,photo_data,photo_mime,role,status)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'faculty','pending')`,
   [fullName,d.firstName,d.middleName,d.lastName,d.suffix,d.employeeId||null,email,await bcrypt.hash(password,12),d.department,d.designation,d.employmentStatus,d.contactNumber,d.officeLocation,d.highestEducation,d.specialization,d.bio,photo?.bytes||null,photo?.mime||null]);
  res.status(201).json({message:'Registration submitted. An administrator will review your instructor profile.'});
 }catch(e){if(e.code==='ER_DUP_ENTRY')return invalid(res,'This email or employee ID is already registered.',409);throw e;}
}));
const loginAttempts=new Map();
app.post('/api/auth/login',asyncRoute(async(req,res)=>{
 const throttleKey=crypto.createHash('sha256').update(`${req.ip}:${str(req.body?.email,190).toLowerCase()}`).digest('hex');
 const current=Date.now(),attempt=loginAttempts.get(throttleKey)||{count:0,until:current+900000};
 if(attempt.until<current){attempt.count=0;attempt.until=current+900000;}
 attempt.count++;loginAttempts.set(throttleKey,attempt);
 if(loginAttempts.size>6000)for(const [k,v] of loginAttempts){if(v.until<current)loginAttempts.delete(k);}
 if(attempt.count>25)return invalid(res,'Too many sign-in attempts. Try again in 15 minutes.',429);
 
 const email=str(req.body.email,190).toLowerCase();const password=req.body.password;const portal=str(req.body.portal,20);
 if(!validEmail(email)||typeof password!=='string')return invalid(res,'Enter your email and password.');
 const [[u]]=await db.query('SELECT id,full_name,email,password_hash,role,status FROM users WHERE email=?',[email]);
 const ok=u?await bcrypt.compare(password,u.password_hash):false;
 if(!ok)return invalid(res,'Incorrect email or password.',401);
 if(portal&&portal!==u.role)return invalid(res,'Please use your correct portal to sign in.',403);
 if(u.status!=='approved')return invalid(res,u.status==='pending'?'Your account is waiting for admin approval.':`Your account status is ${u.status}.`,403);
 loginAttempts.delete(throttleKey);
 const token=jwt.sign({id:u.id,role:u.role},process.env.JWT_SECRET,{expiresIn:'12h'});
 res.json({token,user:{id:u.id,fullName:u.full_name,role:u.role}});
}));
// Password recovery: a faculty or administrator can request a reset; an admin issues
// a short-lived one-time link, so no email or SMTP service is required for local use.
const resetAttempts=new Map();
app.post('/api/auth/forgot-password',asyncRoute(async(req,res)=>{
 const message='If this account exists, the reset request has been sent to the administrator.';
 const email=str(req.body?.email,190).toLowerCase();
 if(!validEmail(email))return invalid(res,'Enter a valid account email address.');
 const key=crypto.createHash('sha256').update(`${req.ip}:${email}`).digest('hex');
 const now=Date.now(),entry=resetAttempts.get(key)||{count:0,until:now+3600000};
 if(entry.until<now){entry.count=0;entry.until=now+3600000;}
 entry.count++;resetAttempts.set(key,entry);
 if(resetAttempts.size>10000){for(const [k,v] of resetAttempts){if(v.until<now)resetAttempts.delete(k);}}
 if(entry.count>5)return res.json({message});
 const [[u]]=await db.query("SELECT id FROM users WHERE email=? AND status='approved'",[email]);
 if(u)await db.query(`INSERT INTO password_reset_requests(user_id,status) SELECT ?,'pending' WHERE NOT EXISTS(SELECT 1 FROM password_reset_requests WHERE user_id=? AND status IN ('pending','issued'))`,[u.id,u.id]);
 res.json({message});
}));
app.post('/api/auth/reset-password',asyncRoute(async(req,res)=>{
 const token=str(req.body?.token,128),password=req.body?.password;
 if(!/^[a-f0-9]{64}$/.test(token)||typeof password!=='string'||password.length<10||password.length>128)
  return invalid(res,'Enter a valid reset link and a new password of at least 10 characters.');
 const hash=crypto.createHash('sha256').update(token).digest('hex'),c=await db.getConnection();
 try{
  await c.beginTransaction();
  const [[row]]=await c.query(`SELECT r.id,r.user_id FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at>NOW() AND u.status='approved' FOR UPDATE`,[hash]);
  if(!row){await c.rollback();return invalid(res,'This password reset link has expired or has already been used.',410);}
  await c.query('UPDATE users SET password_hash=? WHERE id=?',[await bcrypt.hash(password,12),row.user_id]);
  await c.query('UPDATE password_resets SET used_at=NOW() WHERE user_id=? AND used_at IS NULL',[row.user_id]);
  await c.query("UPDATE password_reset_requests SET status='completed' WHERE user_id=? AND status IN ('pending','issued')",[row.user_id]);
  await c.commit();res.json({message:'Password updated. You can now sign in with your new password.'});
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}));
app.get('/api/admin/password-requests',admin,asyncRoute(async(req,res)=>{
 const [rows]=await db.query(`SELECT r.id,r.status,r.requested_at,u.full_name,u.email,u.role FROM password_reset_requests r JOIN users u ON r.user_id=u.id ORDER BY FIELD(r.status,'pending','issued','completed'),r.requested_at DESC LIMIT 150`);
 res.json(rows);
}));
app.post('/api/admin/password-requests/:id/issue',admin,asyncRoute(async(req,res)=>{
 const c=await db.getConnection();
 try{
  await c.beginTransaction();
  const [[request]]=await c.query(`SELECT r.id,r.user_id,r.status FROM password_reset_requests r JOIN users u ON u.id=r.user_id WHERE r.id=? AND r.status IN ('pending','issued') AND u.status='approved' FOR UPDATE`,[id(req.params.id)]);
  if(!request){await c.rollback();return invalid(res,'Pending password request not found.',404);}
  const token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex');
  await c.query('UPDATE password_resets SET used_at=NOW() WHERE user_id=? AND used_at IS NULL',[request.user_id]);
  await c.query('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))',[request.user_id,hash]);
  await c.query("UPDATE password_reset_requests SET status='issued' WHERE id=?",[request.id]);
  await c.commit();
  // Return once to this authenticated admin. No token is sent to general faculty APIs.
  res.json({message:'One-time link created. Copy and send it privately to the account owner within 30 minutes.',link:'/reset-password.html?token='+token});
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}));
app.get('/api/admin/me',admin,(req,res)=>res.json(req.user));
app.get('/api/faculty/me',faculty,(req,res)=>res.json(req.user));
app.get('/api/faculty/profile',faculty,asyncRoute(async(req,res)=>{
 const [[row]]=await db.query(`SELECT id,full_name,first_name,middle_name,last_name,suffix,employee_id,email,department,designation,employment_status,contact_number,office_location,highest_education,specialization,bio,photo_data IS NOT NULL AS has_photo FROM users WHERE id=?`,[req.user.id]);
 if(!row)return invalid(res,'Profile not found.',404);
 res.json(row);
}));
app.patch('/api/faculty/profile',faculty,(req,res)=>{
 return invalid(res,'Your registration profile is read-only.',403);
});

// Administrators may view a pending instructor's photo before approving the account.
app.get('/api/admin/faculty/:id/photo',admin,asyncRoute(async(req,res)=>{
 const [[row]]=await db.query("SELECT photo_data,photo_mime FROM users WHERE id=? AND role='faculty'",[id(req.params.id)]);
 if(!row||!row.photo_data)return res.status(404).end();
 res.setHeader('Content-Type',row.photo_mime||'image/jpeg');res.send(row.photo_data);
}));

// ADMIN FACULTY APPROVAL
app.get('/api/admin/faculty',admin,asyncRoute(async(req,res)=>{
 const [rows]=await db.query("SELECT id,full_name,first_name,middle_name,last_name,suffix,email,department,employee_id,designation,employment_status,contact_number,office_location,highest_education,specialization,bio,photo_data IS NOT NULL AS has_photo,status,created_at FROM users WHERE role='faculty' ORDER BY FIELD(status,'pending','approved','rejected','suspended'),created_at DESC");res.json(rows);
}));
app.patch('/api/admin/faculty/:id/status',admin,asyncRoute(async(req,res)=>{
 const status=str(req.body.status);if(!['approved','rejected','suspended'].includes(status))return invalid(res,'Choose approve, reject or suspend.');
 const [r]=await db.query("UPDATE users SET status=? WHERE id=? AND role='faculty'",[status,id(req.params.id)]);
 if(!r.affectedRows)return invalid(res,'Faculty account not found.',404);
 res.json({message:`Faculty account ${status}.`});
}));

// ADMIN EVALUATION PERIODS: one shared questionnaire per period.
app.get('/api/admin/periods',admin,asyncRoute(async(req,res)=>{
 const [rows]=await db.query('SELECT * FROM periods ORDER BY created_at DESC,id DESC');res.json(rows);
}));
app.post('/api/admin/periods',admin,asyncRoute(async(req,res)=>{
 const title=str(req.body.title,150),schoolYear=schoolYearFromStart(req.body.startYear)||str(req.body.schoolYear,20),semester=str(req.body.semester||'Full Year',50);
 const requiredStudents=Number(req.body.requiredStudents);
 if(!Number.isInteger(requiredStudents)||requiredStudents<1||requiredStudents>10000)return invalid(res,'Enter a required student count from 1 to 10,000.');
 if(!['1st Semester','2nd Semester','Summer','Full Year'].includes(semester))return invalid(res,'Choose a valid semester.');
 const startsAt=dateInput(req.body.startsAt),endsAt=dateInput(req.body.endsAt);
 if(!title||!/^\d{4}-\d{4}$/.test(schoolYear)||!semester||!startsAt||!endsAt||startsAt>=endsAt)return invalid(res,'Enter a title, a school year starting year and valid start/end dates.');
 const c=await db.getConnection();try{
  await c.beginTransaction();
  const [r]=await c.query("INSERT INTO periods(title,school_year,semester,starts_at,ends_at,required_students,status) VALUES(?,?,?,?,?,?,'draft')",[title,schoolYear,semester,startsAt,endsAt,requiredStudents]);
  const [[previous]]=await c.query('SELECT id FROM periods WHERE id<>? ORDER BY id DESC LIMIT 1',[r.insertId]);
  let q=sampleQuestions;if(previous){const [past]=await c.query('SELECT category,question_text FROM questions WHERE period_id=? ORDER BY sort_order',[previous.id]);if(past.length)q=past.map(x=>[x.category,x.question_text]);}
  for(let i=0;i<q.length;i++)await c.query('INSERT INTO questions(period_id,category,question_text,sort_order) VALUES(?,?,?,?)',[r.insertId,...q[i],i+1]);
  await c.commit();res.status(201).json({message:'Draft evaluation created with shared questions.',id:r.insertId});
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}));
// Update timing/title of a draft or open evaluation without touching past answers.
app.patch('/api/admin/periods/:id',admin,asyncRoute(async(req,res)=>{
 const periodId=id(req.params.id),title=str(req.body.title,150),schoolYear=schoolYearFromStart(req.body.startYear)||str(req.body.schoolYear,20),semester=str(req.body.semester||'Full Year',50);
 if(!['1st Semester','2nd Semester','Summer','Full Year'].includes(semester))return invalid(res,'Choose a valid semester.');
 const startsAt=dateInput(req.body.startsAt),endsAt=dateInput(req.body.endsAt);
 if(!title||!/^\d{4}-\d{4}$/.test(schoolYear)||!semester||!startsAt||!endsAt||startsAt>=endsAt)return invalid(res,'Enter a valid title, school year and start/end dates.');
 const current=await getPeriod(periodId);
 if(!current)return invalid(res,'Evaluation not found.',404);
 const requiredStudents=Number(req.body.requiredStudents??current.required_students);
 if(!Number.isInteger(requiredStudents)||requiredStudents<1||requiredStudents>10000)return invalid(res,'Enter a required student count from 1 to 10,000.');
 if(Number(current.required_students)!==requiredStudents&&current.status!=='draft')return invalid(res,'The student count is locked after opening. Create a new evaluation to use a different count.',409);
 const [r]=await db.query("UPDATE periods SET title=?,school_year=?,semester=?,starts_at=?,ends_at=?,required_students=? WHERE id=? AND status IN ('draft','open') AND (status='draft' OR required_students=?)",[title,schoolYear,semester,startsAt,endsAt,requiredStudents,periodId,requiredStudents]);
 if(!r.affectedRows)return invalid(res,'This period is not editable.',409);
 res.json({message:'Evaluation period details updated.'});
}));
app.get('/api/admin/periods/:id/questions',admin,asyncRoute(async(req,res)=>{
 const [rows]=await db.query('SELECT id,category,question_text,sort_order FROM questions WHERE period_id=? ORDER BY sort_order',[id(req.params.id)]);res.json(rows);
}));
app.put('/api/admin/periods/:id/questions',admin,asyncRoute(async(req,res)=>{
 const periodId=id(req.params.id),q=req.body.questions,p=await getPeriod(periodId);
 if(!p)return invalid(res,'Evaluation period not found.',404);
 if(p.status!=='draft')return invalid(res,'Questions can only be changed while the period is in draft.',409);
 if(!Array.isArray(q)||q.length<1||q.length>60||q.some(x=>!str(x.text,500)||str(x.text,500).length<5||!str(x.category,80)))return invalid(res,'Provide 1–60 questions with a category and at least five characters of text.');
 const c=await db.getConnection();try{await c.beginTransaction();
  // Lock the period to prevent an admin concurrently opening it.
  const [[locked]]=await c.query('SELECT status FROM periods WHERE id=? FOR UPDATE',[periodId]);
  if(!locked||locked.status!=='draft'){await c.rollback();return invalid(res,'This period is no longer editable.',409);}
  await c.query('DELETE FROM questions WHERE period_id=?',[periodId]);
  for(let i=0;i<q.length;i++)await c.query('INSERT INTO questions(period_id,category,question_text,sort_order) VALUES(?,?,?,?)',[periodId,str(q[i].category,80),str(q[i].text,500),i+1]);
  await c.commit();res.json({message:'The shared questionnaire has been saved.'});
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}));
app.patch('/api/admin/periods/:id/status',admin,asyncRoute(async(req,res)=>{
 const periodId=id(req.params.id),status=str(req.body.status);
 if(!['open','closed'].includes(status))return invalid(res,'Choose Open or Closed.');
 const p=await getPeriod(periodId);if(!p)return invalid(res,'Period not found.',404);
 if(p.status==='closed')return invalid(res,'Closed periods are archived and cannot be reopened.',409);
 if(p.status==='draft'&&status==='closed')return invalid(res,'Open the draft first.',409);
 const [[n]]=await db.query('SELECT COUNT(*) AS n FROM questions WHERE period_id=?',[periodId]);
 if(status==='open'&&!n.n)return invalid(res,'Add at least one question before opening.');
 await db.query('UPDATE periods SET status=? WHERE id=?',[status,periodId]);res.json({message:`Evaluation period ${status}.`});
}));
app.get('/api/admin/overview',admin,asyncRoute(async(req,res)=>{
 const [[u]]=await db.query("SELECT COUNT(*) AS faculty_count,COALESCE(SUM(status='pending'),0) AS pending_count FROM users WHERE role='faculty'");
 const [[p]]=await db.query("SELECT COUNT(*) AS period_count,COALESCE(SUM(status='open'),0) AS open_count FROM periods");
 const [[a]]=await db.query("SELECT COUNT(*) AS assignment_count,COALESCE(SUM(status='pending'),0) AS pending_count FROM assignments");
 const [[e]]=await db.query('SELECT COUNT(*) AS response_count FROM evaluations');
 const [ratingRows]=await db.query('SELECT an.rating,COUNT(*) AS n FROM answers an GROUP BY an.rating ORDER BY an.rating');
 const [[average]]=await db.query('SELECT ROUND(AVG(rating),2) AS average_rating FROM answers');
 res.json({...u,...p,assignment_count:a.assignment_count,pending_assignments:a.pending_count,response_count:e.response_count,average_rating:average.average_rating,rating_distribution:ratingRows});
}));
// Historical records and chart values aggregated server-side from actual submissions.
app.get('/api/admin/analytics',admin,asyncRoute(async(req,res)=>{
 const [rows]=await db.query(`SELECT p.id,p.title,p.school_year,p.status,COUNT(DISTINCT a.id) AS subjects,COUNT(DISTINCT e.id) AS responses,ROUND(AVG(ans.rating),2) AS average_rating
 FROM periods p LEFT JOIN assignments a ON a.period_id=p.id LEFT JOIN evaluations e ON e.assignment_id=a.id LEFT JOIN answers ans ON ans.evaluation_id=e.id
 GROUP BY p.id,p.title,p.school_year,p.status ORDER BY p.id DESC`);
 const [byYear]=await db.query(`SELECT p.school_year,COUNT(DISTINCT e.id) AS responses,ROUND(AVG(ans.rating),2) AS average_rating
 FROM periods p LEFT JOIN assignments a ON a.period_id=p.id LEFT JOIN evaluations e ON e.assignment_id=a.id LEFT JOIN answers ans ON ans.evaluation_id=e.id
 GROUP BY p.school_year ORDER BY p.school_year DESC LIMIT 12`);
 res.json({periods:rows,schoolYears:byYear});
}));
app.get('/api/admin/assignments',admin,asyncRoute(async(req,res)=>{
 let query=reportingSql;const params=[];
 if(id(req.query.periodId)){query+=' WHERE a.period_id=?';params.push(id(req.query.periodId));}
 const [rows]=await db.query(query+' ORDER BY a.created_at DESC,a.id DESC',params);res.json(rows);
}));
app.patch('/api/admin/assignments/:id/status',admin,asyncRoute(async(req,res)=>{
 const status=str(req.body.status);if(!['approved','rejected'].includes(status))return invalid(res,'Choose approved or rejected.');
 const [r]=await db.query("UPDATE assignments a JOIN periods p ON p.id=a.period_id SET a.status=? WHERE a.id=? AND a.status='pending' AND p.status='open'",[status,id(req.params.id)]);
 if(!r.affectedRows)return invalid(res,'Pending assignment in an open period not found.',409);
 res.json({message:`Teaching assignment ${status}.`});
}));
app.get('/api/admin/reports',admin,asyncRoute(async(req,res)=>{
 const params=[];let query=reportingSql;
 if(id(req.query.periodId)){query+=' WHERE a.period_id=?';params.push(id(req.query.periodId));}
 const [rows]=await db.query(query+' ORDER BY p.id DESC,u.full_name,a.subject_code',params);
 res.json(rows);
}));
app.get('/api/admin/results/:id',admin,asyncRoute(async(req,res)=>{res.json(await detailedResults(id(req.params.id),null,res));}));

// FACULTY: ONE account for many school years, must accept each new period.
app.get('/api/faculty/periods',faculty,asyncRoute(async(req,res)=>{
 const [rows]=await db.query(`SELECT p.*,fp.accepted_at FROM periods p LEFT JOIN faculty_periods fp ON fp.period_id=p.id AND fp.faculty_id=? WHERE p.status IN ('open','closed') ORDER BY p.id DESC`,[req.user.id]);res.json(rows);
}));
app.post('/api/faculty/periods/:id/accept',faculty,asyncRoute(async(req,res)=>{
 const periodId=id(req.params.id),p=await getPeriod(periodId);
 if(!freeToSetUp(p))return invalid(res,'Only open evaluation periods can be accepted.',409);
 await db.query('INSERT IGNORE INTO faculty_periods(faculty_id,period_id) VALUES(?,?)',[req.user.id,periodId]);res.json({message:'Evaluation accepted. Add the subjects you teach this period.'});
}));
app.get('/api/faculty/analytics',faculty,asyncRoute(async(req,res)=>{
 const [rows]=await db.query(`SELECT p.id,p.title,p.school_year,COUNT(DISTINCT a.id) AS subjects,COUNT(DISTINCT e.id) AS responses,ROUND(AVG(ans.rating),2) AS average_rating
 FROM periods p INNER JOIN assignments a ON a.period_id=p.id AND a.faculty_id=? LEFT JOIN evaluations e ON e.assignment_id=a.id LEFT JOIN answers ans ON ans.evaluation_id=e.id
 GROUP BY p.id,p.title,p.school_year ORDER BY p.id DESC`,[req.user.id]);
 res.json(rows);
}));
app.get('/api/faculty/assignments',faculty,asyncRoute(async(req,res)=>{
 const params=[req.user.id];let query=reportingSql+' WHERE a.faculty_id=?';
 if(id(req.query.periodId)){query+=' AND a.period_id=?';params.push(id(req.query.periodId));}
 const [rows]=await db.query(query+' ORDER BY a.period_id DESC,a.id DESC',params);
 res.json(rows.map(({public_token,...r})=>({...r,link:r.status==='approved'?`/evaluate/${public_token}`:null})));
}));
app.post('/api/faculty/assignments',faculty,asyncRoute(async(req,res)=>{
 const periodId=id(req.body.periodId),subjectCode=str(req.body.subjectCode,35).toUpperCase(),subjectName=str(req.body.subjectName,170),yearLevel=str(req.body.yearLevel,45),section=str(req.body.section,70);
 if(!periodId||!subjectCode||!subjectName||!yearLevel||!section)return invalid(res,'Complete subject code, subject name, year level and section.');
 const [[accepted]]=await db.query("SELECT fp.id FROM faculty_periods fp JOIN periods p ON p.id=fp.period_id WHERE fp.faculty_id=? AND fp.period_id=? AND p.status='open'",[req.user.id,periodId]);
 if(!accepted)return invalid(res,'Accept an open evaluation period before adding subjects.',409);
 try{
  const [r]=await db.query("INSERT INTO assignments(faculty_id,period_id,subject_code,subject_name,year_level,section_name,public_token) VALUES(?,?,?,?,?,?,?)",[req.user.id,periodId,subjectCode,subjectName,yearLevel,section,crypto.randomBytes(24).toString('hex')]);
  res.status(201).json({message:'Teaching assignment submitted for admin approval.',id:r.insertId});
 }catch(e){if(e.code==='ER_DUP_ENTRY')return invalid(res,'This subject, year level and section are already added for this period.',409);throw e;}
}));
// Instructors can correct or delete a pending/rejected assignment in the open period.
app.patch('/api/faculty/assignments/:id',faculty,asyncRoute(async(req,res)=>{
 const assignmentId=id(req.params.id),subjectCode=str(req.body.subjectCode,35).toUpperCase(),subjectName=str(req.body.subjectName,170),yearLevel=str(req.body.yearLevel,45),section=str(req.body.section,70);
 if(!subjectCode||!subjectName||!yearLevel||!section)return invalid(res,'Complete every teaching assignment field.');
 try{
  const [r]=await db.query(`UPDATE assignments a JOIN periods p ON p.id=a.period_id
   SET a.subject_code=?,a.subject_name=?,a.year_level=?,a.section_name=?,a.status='pending'
   WHERE a.id=? AND a.faculty_id=? AND a.status IN ('pending','rejected') AND p.status='open'`,
   [subjectCode,subjectName,yearLevel,section,assignmentId,req.user.id]);
  if(!r.affectedRows)return invalid(res,'Only pending or rejected subjects in an open period may be edited.',409);
  res.json({message:'Subject updated and submitted for administrator review.'});
 }catch(e){if(e.code==='ER_DUP_ENTRY')return invalid(res,'You already have this subject in that class for this period.',409);throw e;}
}));
app.delete('/api/faculty/assignments/:id',faculty,asyncRoute(async(req,res)=>{
 const [r]=await db.query(`DELETE a FROM assignments a JOIN periods p ON p.id=a.period_id
   WHERE a.id=? AND a.faculty_id=? AND a.status IN ('pending','rejected') AND p.status='open'`,[id(req.params.id),req.user.id]);
 if(!r.affectedRows)return invalid(res,'Only pending or rejected subjects in open periods may be deleted.',409);
 res.json({message:'Teaching assignment removed.'});
}));
app.get('/api/faculty/results/:id',faculty,asyncRoute(async(req,res)=>{res.json(await detailedResults(id(req.params.id),req.user.id,res));}));
async function detailedResults(assignmentId,facultyId,res){
 const where=facultyId?' AND a.faculty_id=?':'';const args=facultyId?[assignmentId,facultyId]:[assignmentId];
 const [[assignment]]=await db.query(reportingSql+' WHERE a.id=?'+where,args);
 if(!assignment){res.status(404);return {message:'Assignment not found.'};}
 const [correctQuestions]=await db.query(`SELECT q.id,q.category,q.question_text,
 (SELECT ROUND(AVG(an.rating),2) FROM answers an JOIN evaluations ev ON ev.id=an.evaluation_id WHERE ev.assignment_id=? AND an.question_id=q.id) AS average_rating,
 (SELECT COUNT(*) FROM answers an JOIN evaluations ev ON ev.id=an.evaluation_id WHERE ev.assignment_id=? AND an.question_id=q.id) AS ratings
 FROM questions q WHERE q.period_id=? ORDER BY q.sort_order`,[assignmentId,assignmentId,assignment.period_id]);
 const [comments]=await db.query("SELECT comment_text,created_at FROM evaluations WHERE assignment_id=? AND comment_text IS NOT NULL AND comment_text<>'' ORDER BY id DESC",[assignmentId]);
 const [studentScores]=await db.query('SELECT AVG(an.rating) AS score FROM evaluations ev JOIN answers an ON an.evaluation_id=ev.id WHERE ev.assignment_id=? GROUP BY ev.id',[assignmentId]);
 const summary=require('./lib/rating-summary')(assignment,studentScores);
 return {assignment,questions:correctQuestions,comments,summary};
}
// Optional one-time codes: anonymous students, stronger duplicate prevention.
app.patch('/api/faculty/assignments/:id/code-mode',faculty,asyncRoute(async(req,res)=>{
 const assignmentId=id(req.params.id),enabled=req.body.enabled;
 if(typeof enabled!=='boolean')return invalid(res,'enabled must be true or false.');
 const [r]=await db.query(`UPDATE assignments a SET a.requires_code=? WHERE a.id=? AND a.faculty_id=? AND a.status='approved'
 AND NOT EXISTS(SELECT 1 FROM evaluations e WHERE e.assignment_id=a.id)`,[enabled?1:0,assignmentId,req.user.id]);
 if(!r.affectedRows)return invalid(res,'Code mode can only be changed on your approved assignment before responses arrive.',409);
 res.json({message:enabled?'One-time access codes enabled.':'Open link mode enabled.'});
}));
app.post('/api/faculty/assignments/:id/codes',faculty,asyncRoute(async(req,res)=>{
 if(!process.env.CODE_PEPPER||process.env.CODE_PEPPER.length<20||process.env.CODE_PEPPER.startsWith('replace-with-')||process.env.CODE_PEPPER.startsWith('REPLACE_WITH_'))return invalid(res,'Configure CODE_PEPPER on the server first.',503);
 const assignmentId=id(req.params.id),count=Number(req.body.count);
 if(!Number.isSafeInteger(count)||count<1||count>100)return invalid(res,'Choose 1–100 one-time codes.');
 const [[a]]=await db.query("SELECT a.id,a.requires_code FROM assignments a JOIN periods p ON p.id=a.period_id WHERE a.id=? AND a.faculty_id=? AND a.status='approved' AND p.status='open'",[assignmentId,req.user.id]);
 if(!a||!a.requires_code)return invalid(res,'Enable access codes on an approved assignment first.',409);
 const codes=[];
 for(let i=0;i<count;i++){
  const code=crypto.randomBytes(9).toString('hex').toUpperCase();codes.push(code);
  await db.query('INSERT INTO access_codes(assignment_id,code_hash) VALUES(?,?)',[assignmentId,hashCode(assignmentId,code)]);
 }
 res.status(201).json({message:'Save or distribute these codes now; they are not stored in readable form.',codes});
}));
const hashCode=(assignmentId,code)=>crypto.createHmac('sha256',process.env.CODE_PEPPER||'').update(`${assignmentId}:${code.toUpperCase()}`).digest('hex');

// PUBLIC STUDENT FORM: no student account or portal.
app.get('/api/public/evaluate/:token',asyncRoute(async(req,res)=>{
 const token=str(req.params.token,60);if(!/^[a-f0-9]{48}$/.test(token))return invalid(res,'Invalid evaluation link.',404);
 const [[a]]=await db.query(`SELECT a.id,a.subject_code,a.subject_name,a.year_level,a.section_name,a.requires_code,p.required_students,u.full_name AS faculty_name,u.id AS faculty_id,p.id AS period_id,p.title AS period_title,p.school_year,p.semester,
 (p.status='open' AND p.starts_at<=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) AND p.ends_at>=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) AS available
 FROM assignments a JOIN users u ON u.id=a.faculty_id JOIN periods p ON p.id=a.period_id JOIN faculty_periods fp ON fp.faculty_id=a.faculty_id AND fp.period_id=a.period_id
 WHERE a.public_token=? AND a.status='approved' AND u.status='approved'`,[token]);
 if(!a)return invalid(res,'This evaluation link is unavailable or not yet approved.',404);
 const [[submitted]]=await db.query('SELECT COUNT(*) AS n FROM evaluations WHERE assignment_id=?',[a.id]);
 if(Number(submitted.n)>=Number(a.required_students))return invalid(res,'This subject has received all required responses. The final rating is complete.',409);
 if(!a.available)return invalid(res,'The evaluation link is valid, but the evaluation is outside its scheduled dates. Ask your instructor when it opens.',403);
 const [q]=await db.query('SELECT id,category,question_text FROM questions WHERE period_id=? ORDER BY sort_order',[a.period_id]);
 res.json({facultyName:a.faculty_name,facultyId:a.faculty_id,subjectCode:a.subject_code,subjectName:a.subject_name,yearLevel:a.year_level,section:a.section_name,periodTitle:a.period_title,requiresCode:Boolean(a.requires_code),questions:q});
}));
// Lightweight per-process abuse limiter; reverse proxy should add edge rate limits in production.
const limits=new Map();
function studentRateLimit(req,res,next){
 const now=Date.now(),key=req.ip+':'+req.params.token;
 if(limits.size>3000){for(const [k,v] of limits){if(v.until<now)limits.delete(k);}}
 let rate=limits.get(key);if(!rate||rate.until<now)rate={n:0,until:now+60*60*1000};
 rate.n++;limits.set(key,rate);
 if(rate.n>600)return invalid(res,'Too many attempts from this network. Please try again later.',429);
 next();
}
app.post('/api/public/evaluate/:token',studentRateLimit,asyncRoute(async(req,res)=>{
 const token=str(req.params.token,60),payload=req.body||{};
 if(!/^[a-f0-9]{48}$/.test(token))return invalid(res,'Invalid evaluation link.',404);
 if(payload.website)return invalid(res,'Invalid evaluation submission.',400); // spam honeypot
 if(!Array.isArray(payload.answers)||payload.answers.length<1||payload.answers.length>60)return invalid(res,'Please rate every question.');
 const comment=str(payload.comment,1500),c=await db.getConnection();
 try{
  await c.beginTransaction();
  const [[a]]=await c.query(`SELECT a.id,a.period_id,a.requires_code,p.required_students FROM assignments a JOIN users u ON u.id=a.faculty_id JOIN periods p ON p.id=a.period_id JOIN faculty_periods fp ON fp.period_id=p.id AND fp.faculty_id=a.faculty_id
  WHERE a.public_token=? AND a.status='approved' AND u.status='approved' AND p.status='open' AND p.starts_at<=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) AND p.ends_at>=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) FOR UPDATE`,[token]);
  if(!a){await c.rollback();return invalid(res,'The evaluation is closed or the link is not approved.',409);}
  const [[submitted]]=await c.query('SELECT COUNT(*) AS n FROM evaluations WHERE assignment_id=?',[a.id]);
  if(Number(submitted.n)>=Number(a.required_students)){await c.rollback();return invalid(res,'All required responses have been received. This subject is complete.',409);}
  const [qs]=await c.query('SELECT id FROM questions WHERE period_id=? ORDER BY sort_order',[a.period_id]);
  const expected=new Set(qs.map(x=>Number(x.id)));const received=new Set();
  for(const item of payload.answers){const qid=id(item?.questionId);if(!expected.has(qid)||received.has(qid)||!Number.isInteger(item?.rating)||item.rating<1||item.rating>5){await c.rollback();return invalid(res,'Invalid ratings. Please answer every question once.');}received.add(qid);}
  if(received.size!==expected.size){await c.rollback();return invalid(res,'Please rate every question.');}
  let codeId=null;
  if(a.requires_code){
   if(!process.env.CODE_PEPPER||process.env.CODE_PEPPER.length<20||process.env.CODE_PEPPER.startsWith('replace-with-')||process.env.CODE_PEPPER.startsWith('REPLACE_WITH_')){await c.rollback();return invalid(res,'Evaluation codes are not configured.',503);}
   const code=str(payload.accessCode,40).toUpperCase();if(!/^[A-F0-9]{18}$/.test(code)){await c.rollback();return invalid(res,'Enter your valid one-time evaluation code.');}
   const [[access]]=await c.query('SELECT id,used_at FROM access_codes WHERE assignment_id=? AND code_hash=? FOR UPDATE',[a.id,hashCode(a.id,code)]);
   if(!access||access.used_at){await c.rollback();return invalid(res,'This code is invalid or has already been used.',409);}
   codeId=access.id;
  }
  const [r]=await c.query('INSERT INTO evaluations(assignment_id,comment_text) VALUES(?,?)',[a.id,comment||null]);
  for(const item of payload.answers)await c.query('INSERT INTO answers(evaluation_id,question_id,rating) VALUES(?,?,?)',[r.insertId,item.questionId,item.rating]);
  if(codeId)await c.query('UPDATE access_codes SET used_at=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) WHERE id=?',[codeId]);
  await c.commit();res.status(201).json({message:'Thank you! Your anonymous evaluation has been submitted.'});
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}));

app.get('/api/health',asyncRoute(async(req,res)=>{await db.query('SELECT 1');res.json({ok:true,database:'mysql'});}));
app.use('/api',(req,res)=>invalid(res,'API endpoint not found.',404));
app.use((req,res)=>res.status(404).sendFile(path.join(front,'404.html')));
app.use((err,req,res,next)=>{
 console.error('[server]',err);
 if(err.type==='entity.too.large')return invalid(res,'Request is too large.',413);
 if(err instanceof SyntaxError && 'body' in err)return invalid(res,'Malformed request.',400);
 res.status(500).json({message:'Unexpected server error. Check the Node.js logs and database connection.'});
});
const PORT=Number(process.env.PORT||5000);
if(require.main===module){
 (async()=>{
  try {
   await db.query('SELECT 1');
   const [tables]=await db.query('SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
   const present=new Set(tables.map(t=>t.table_name));
   const required=['users','periods','questions','faculty_periods','assignments','access_codes','evaluations','answers','password_reset_requests','password_resets'];
   const missing=required.filter(t=>!present.has(t));
   if(missing.length)throw Error('Database tables missing: '+missing.join(', ')+'. Import database/schema.sql into phpMyAdmin.');
   const [columns]=await db.query('SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
   const presentColumns=new Set(columns.map(c=>`${c.table_name}.${c.column_name}`));
   const essentials=['users.password_hash','users.status','users.first_name','users.photo_data','periods.starts_at','periods.ends_at','periods.required_students','questions.period_id','assignments.public_token','assignments.requires_code','evaluations.assignment_id','answers.rating'];
   const absent=essentials.filter(c=>!presentColumns.has(c));
   if(absent.length)throw Error('Database schema is outdated/incomplete: '+absent.join(', ')+'. Back up your data before fixing the tables.');
   const server=app.listen(PORT,()=>{
    console.log('MySQL connected and all required tables found.');
    console.log(`Faculty Evaluation System: http://localhost:${PORT}`);
    console.log('Administrator: /admin/login.html | Faculty: /faculty/login.html');
   });
   server.on('error',error=>{
    console.error('Cannot start web server:',error.code==='EADDRINUSE'?`Port ${PORT} is already in use. Stop the old server or choose another PORT in backend/.env.`:error.message);
    process.exitCode=1;
    db.end().catch(()=>{});
   });
  }catch(error){
   console.error('STARTUP FAILED:',error.message);
   console.error('Check: MySQL is started in XAMPP, backend/.env has the correct credentials, and database/schema.sql was imported.');
   console.error('Run: npm run doctor');
   process.exitCode=1;
   await db.end().catch(()=>{});
  }
 })();
}
module.exports=app;
