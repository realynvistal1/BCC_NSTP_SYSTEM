const db=require('../config/database');
const {
  studentPublic
}
=require('../services/systemService');
const authService=require('../services/authService');
exports.login=async(req,res)=>{
  try{
    const {
      email,password,portal
    }
    =req.body;
    const [rows]=await db.execute('SELECT * FROM students WHERE email=? OR username=? LIMIT 1',[email,email]);
    const u=rows[0];
    if(!u||!(await authService.comparePassword(password,u.password))) return res.status(401).json({message:'Invalid email/username or password.'});
    const actual=authService.portalFor(u);
    if(portal&&portal!==actual) return res.status(403).json({message:`This account belongs to the ${actual.replace('-',' ')} portal.`});
    const token=authService.signLoginToken(u,actual);
    res.cookie('nstp_token',token,{httpOnly:true,sameSite:'lax',maxAge:12*60*60*1000});
    res.json({user:studentPublic(u),portal:actual});
  }   catch(e){
    console.error(e);
    res.status(500).json({message:'Login failed.'})
  }
}
;
exports.me=async(req,res)=>{
  try{
    const [rows]=await db.execute('SELECT * FROM students WHERE id=?',[req.user.id]);
    if(!rows[0])return res.status(404).json({message:'Account not found'});
    res.json({user:studentPublic(rows[0]),portal:req.user.portal});
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.logout=(req,res)=>{
  res.clearCookie('nstp_token');
  res.json({message:'Logged out'});
}
;
exports.changePassword=async(req,res)=>{
  try{
    const {
      currentPassword,newPassword
    }
    =req.body;
    const [rows]=await db.execute('SELECT password FROM students WHERE id=?',[req.user.id]);
    if(!rows[0]||!(await authService.comparePassword(currentPassword,rows[0].password))) return res.status(400).json({message:'Current password is incorrect.'});
    const passwordError=authService.newPasswordValidationMessage(newPassword);
    if(passwordError)return res.status(400).json({message:passwordError});
    await db.execute('UPDATE students SET password=? WHERE id=?',[await authService.hashPassword(newPassword),req.user.id]);
    res.json({message:'Password updated.'});
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
