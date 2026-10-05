const crypto=require('node:crypto');
const db=require('../config/database');
const email=require('./emailService');
const auth=require('./authService');

function fail(status,message){const error=new Error(message);error.status=status;throw error;}
function publicOrigin(){
  let url;
  try{url=new URL(String(process.env.PUBLIC_APP_URL||''));}catch{fail(503,'Email invitations need the school website address configured. Contact the system administrator.');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/') fail(503,'The school website address configuration is invalid.');
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) fail(503,'The school website address must use HTTPS.');
  return url.origin;
}
function invitationReady(){try{return Boolean(publicOrigin()&&email.hasEmailConfig());}catch{return false;}}
function tokenHash(value){return crypto.createHash('sha256').update(value).digest('hex');}
async function sendInvitation(id){
  const origin=publicOrigin();
  if(!email.hasEmailConfig())fail(503,'Email delivery is not configured. Contact the system administrator.');
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    const [[account]]=await connection.execute('SELECT * FROM cwts_instructors WHERE id=? FOR UPDATE',[id]);
    if(!account)fail(404,'Instructor account not found.');
    if(account.status==='disabled')fail(400,'Enable this account before sending an invitation.');
    if(Date.now()-Number(account.invitation_sent_at)<60000)fail(429,'Wait one minute before sending another invitation.');
    const token=crypto.randomBytes(32).toString('hex');
    const expires=Date.now()+24*60*60*1000;
    await connection.execute('UPDATE cwts_instructors SET invitation_hash=?,invitation_expires=?,delivery_status=\'not_sent\' WHERE id=?',[tokenHash(token),expires,id]);
    try{
      await email.sendInstructorInvitation({to:account.email,name:account.first_name,url:`${origin}/admin/cwts/accept-invitation#token=${token}`});
    }catch{
      await connection.execute("UPDATE cwts_instructors SET invitation_hash=NULL,invitation_expires=0,delivery_status='failed' WHERE id=?",[id]);
      await connection.commit();
      fail(502,'The account is saved, but the invitation could not be sent. Check email delivery and use Send invitation again.');
    }
    await connection.execute("UPDATE cwts_instructors SET invitation_sent_at=?,delivery_status='sent' WHERE id=?",[Date.now(),id]);
    await connection.commit();
    return {message:'Invitation emailed. The link expires in 24 hours and can be used once.'};
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
async function acceptInvitation(token,password){
  if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))fail(400,'This invitation link is invalid. Ask the Director for a new invitation.');
  if(typeof password!=='string'||Buffer.byteLength(password,'utf8')>72)fail(400,'Choose a password of 8 to 72 bytes.');
  const invalid=auth.newPasswordValidationMessage(password);if(invalid)fail(400,invalid);
  const hash=tokenHash(token);
  const [[candidate]]=await db.execute('SELECT id FROM cwts_instructors WHERE invitation_hash=? AND invitation_expires>? AND status<>\'disabled\'',[hash,Date.now()]);
  if(!candidate)fail(400,'This invitation is expired, already used, or unavailable. Ask the Director for a new invitation.');
  const passwordHash=await auth.hashPassword(password);
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    const [[account]]=await connection.execute('SELECT id FROM cwts_instructors WHERE id=? AND invitation_hash=? AND invitation_expires>? AND status<>\'disabled\' FOR UPDATE',[candidate.id,hash,Date.now()]);
    if(!account)fail(400,'This invitation is expired, already used, or unavailable. Ask the Director for a new invitation.');
    await connection.execute("UPDATE cwts_instructors SET password=?,status='active',session_version=session_version+1,invitation_hash=NULL,invitation_expires=0,delivery_status='accepted' WHERE id=?",[passwordHash,account.id]);
    await connection.commit();
    return {message:'Your password is set. Sign in through the CWTS login with your email and new password.',redirect:'/admin/cwts/login'};
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
async function findLogin(emailAddress){
  const [[row]]=await db.execute("SELECT id,email,password,first_name,last_name,session_version,'instructor' role,'CWTS' program FROM cwts_instructors WHERE email=? AND status='active' AND password IS NOT NULL",[emailAddress]);
  return row||null;
}
module.exports={fail,publicOrigin,invitationReady,sendInvitation,acceptInvitation,findLogin};
