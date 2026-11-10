const crypto=require('node:crypto');
const db=require('../config/database'),auth=require('./authService'),email=require('./emailService');
const accounts=require('./instructorPortalService');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
async function handle(address,password,code){
  const candidate=await accounts.findLogin(db,address);
  if(!candidate||candidate.status!=='active'||candidate.review_status!=='approved')return null;
  const table=accounts.table(candidate.program),resetTable=candidate.program==='ROTC'?'rotc_instructor_reset_codes':'cwts_instructor_reset_codes';
  await db.execute(`CREATE TABLE IF NOT EXISTS ${resetTable} (instructor_id INT UNSIGNED PRIMARY KEY,code_hash CHAR(64) NOT NULL,expires_at BIGINT NOT NULL,sent_at BIGINT NOT NULL,attempts INT NOT NULL DEFAULT 0,session_version INT UNSIGNED NOT NULL,FOREIGN KEY(instructor_id) REFERENCES ${table}(id) ON DELETE CASCADE) ENGINE=InnoDB`);
  const c=await db.getConnection();
  try{
    await c.beginTransaction();
    const [[a]]=await c.execute(`SELECT * FROM ${table} WHERE id=? AND email=? AND status='active' AND review_status='approved' FOR UPDATE`,[candidate.id,address]);
    if(!a){await c.rollback();return null;}
    const [[reset]]=await c.execute(`SELECT * FROM ${resetTable} WHERE instructor_id=? FOR UPDATE`,[a.id]);let result;
    if(password===undefined){
      if(reset&&Date.now()-Number(reset.sent_at)<60000)result={status:429,message:'Wait one minute before requesting another code.'};
      else{
        const value=String(crypto.randomInt(100000,1000000));
        await c.execute(`INSERT INTO ${resetTable}(instructor_id,code_hash,expires_at,sent_at,attempts,session_version) VALUES(?,?,?,?,0,?) ON DUPLICATE KEY UPDATE code_hash=VALUES(code_hash),expires_at=VALUES(expires_at),sent_at=VALUES(sent_at),attempts=0,session_version=VALUES(session_version)`,[a.id,digest(value),Date.now()+600000,Date.now(),a.session_version]);
        await email.sendPasswordResetCode({to:a.email,code:value,portalLabel:'Instructor Portal'});
        result={status:200,message:'A verification code was sent to your email. It expires in 10 minutes.'};
      }
    }else if(!reset||Number(reset.expires_at)<=Date.now()||Number(reset.session_version)!==Number(a.session_version))result={status:400,message:'Request a new verification code. The previous code is expired or unavailable.'};
    else if(reset.attempts>=5)result={status:429,message:'Too many incorrect codes. Request a new code.'};
    else if(typeof code!=='string'||digest(code)!==reset.code_hash){await c.execute(`UPDATE ${resetTable} SET attempts=attempts+1 WHERE instructor_id=?`,[a.id]);result={status:400,message:'Invalid verification code.'};}
    else if(typeof password!=='string'||Buffer.byteLength(password,'utf8')>72||auth.newPasswordValidationMessage(password))result={status:400,message:'Use a password of 8 to 72 bytes with a number and a symbol.'};
    else if(await auth.comparePassword(password,a.password))result={status:400,message:'Your new password must be different from your current password.'};
    else{
      const hashed=await auth.hashPassword(password);
      await c.execute(`UPDATE ${table} SET password=?,session_version=session_version+1,invitation_hash=NULL,invitation_expires=0 WHERE id=?`,[hashed,a.id]);await c.execute(`DELETE FROM ${resetTable} WHERE instructor_id=?`,[a.id]);
      result={status:200,message:'Password reset successful. Sign in with your new password.'};
    }
    await c.commit();return result;
  }catch(e){await c.rollback();throw e;}finally{c.release();}
}
module.exports={handle};
