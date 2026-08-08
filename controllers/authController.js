const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const db=require('../config/database');
const {
  studentPublic
}
=require('../services/systemService');
function portalFor(row){
  if(row.role==='student') return 'student';
  if(row.role==='officer') return 'officer';
  return /cwts/i.test(row.username||row.email) ? 'cwts-admin':'rotc-admin';
}
exports.login=async(req,res)=>{
  try{
    const {
      email,password,portal
    }
    =req.body;
    const [rows]=await db.execute('SELECT * FROM students WHERE email=? OR username=? LIMIT 1',[email,email]);
    const u=rows[0];
    if(!u||!(await bcrypt.compare(password,u.password))) return res.status(401).json({message:'Invalid email/username or password.'});
    const actual=portalFor(u);
    if(portal&&portal!==actual) return res.status(403).json({message:`This account belongs to the ${actual.replace('-',' ')} portal.`});
    const token=jwt.sign({id:u.id,role:u.role,portal:actual,email:u.email},process.env.JWT_SECRET,{expiresIn:'12h'});
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
    if(!rows[0]||!(await bcrypt.compare(currentPassword,rows[0].password))) return res.status(400).json({message:'Current password is incorrect.'});
    if(!newPassword||newPassword.length<8)return res.status(400).json({message:'New password must be at least 8 characters.'});
    await db.execute('UPDATE students SET password=? WHERE id=?',[await bcrypt.hash(newPassword,10),req.user.id]);
    res.json({message:'Password updated.'});
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
