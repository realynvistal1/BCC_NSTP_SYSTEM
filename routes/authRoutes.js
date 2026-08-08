const r=require('express').Router();
const c=require('../controllers/authController');
const {
  requireAuth
}
=require('../middleware/authMiddleware');
r.post('/login',c.login);
r.post('/logout',c.logout);
r.get('/me',requireAuth,c.me);
r.post('/change-password',requireAuth,c.changePassword);
module.exports=r;
