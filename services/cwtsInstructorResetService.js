const crypto=require('node:crypto');
const db=require('../config/database');
const auth=require('./authService');
const email=require('./emailService');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
async function ensureTable(){
  await db.execute(`CREATE TABLE IF NOT EXISTS cwts_instructor_reset_codes (
    instructor_id INT UNSIGNED PRIMARY KEY,code_hash CHAR(64) NOT NULL,
    expires_at BIGINT NOT NULL,sent_at BIGINT NOT NULL,attempts INT NOT NULL DEFAULT 0,
    session_version INT UNSIGNED NOT NULL,
    FOREIGN KEY(instructor_id) REFERENCES cwts_instructors(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}
async function handle(address,password,code){
  const [[candidate]]=await db.execute("SELECT id FROM cwts_instructors WHERE email=? AND status='active' AND password IS NOT NULL",[address]);
  if(!candidate)return null;
  await ensureTable();
  const c=await db.getConnection();
  try{
    await c.beginTransaction();
    const [[account]]=await c.execute("SELECT * FROM cwts_instructors WHERE id=? AND email=? AND status='active' FOR UPDATE",[candidate.id,address]);
    if(!account){await c.rollback();return null;}
    const [[reset]]=await c.execute('SELECT * FROM cwts_instructor_reset_codes WHERE instructor_id=? FOR UPDATE',[account.id]);
    let result;
    if(password===undefined){
      if(reset&&Date.now()-Number(reset.sent_at)<60000)result={status:429,message:'Wait one minute before requesting another code.'};
      else{
        const value=String(crypto.randomInt(100000,1000000));
        await c.execute(`INSERT INTO cwts_instructor_reset_codes(instructor_id,code_hash,expires_at,sent_at,attempts,session_version) VALUES(?,?,?,?,0,?)
          ON DUPLICATE KEY UPDATE code_hash=VALUES(code_hash),expires_at=VALUES(expires_at),sent_at=VALUES(sent_at),attempts=0,session_version=VALUES(session_version)`,[account.id,digest(value),Date.now()+600000,Date.now(),account.session_version]);
        await email.sendPasswordResetCode({to:account.email,code:value,portalLabel:'CWTS Instructor'});
        result={status:200,message:'A verification code was sent to your email. It expires in 10 minutes.'};
      }
    }else if(!reset||Number(reset.expires_at)<=Date.now()||Number(reset.session_version)!==Number(account.session_version)){
      result={status:400,message:'Request a new verification code. The previous code is expired or unavailable.'};
    }else if(reset.attempts>=5){result={status:429,message:'Too many incorrect codes. Request a new code.'};
    }else if(digest(code)!==reset.code_hash){
      await c.execute('UPDATE cwts_instructor_reset_codes SET attempts=attempts+1 WHERE instructor_id=?',[account.id]);
      result={status:400,message:'Invalid verification code.'};
    }else if(Buffer.byteLength(password,'utf8')>72){result={status:400,message:'Password must not exceed 72 bytes.'};
    }else if(await auth.comparePassword(password,account.password)){result={status:400,message:'Your new password must be different from your current password.'};
    }else{
      const hashed=await auth.hashPassword(password);
      await c.execute('UPDATE cwts_instructors SET password=?,session_version=session_version+1,invitation_hash=NULL,invitation_expires=0 WHERE id=?',[hashed,account.id]);
      await c.execute('DELETE FROM cwts_instructor_reset_codes WHERE instructor_id=?',[account.id]);
      result={status:200,message:'Password reset successful. Sign in to CWTS with your new password.'};
    }
    await c.commit();return result;
  }catch(error){await c.rollback();throw error;}finally{c.release();}
}
module.exports={handle};
