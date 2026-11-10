const router=require('express').Router();
const {requireAuth,requireRole,requirePortal}=require('../middleware/authMiddleware');
const controller=require('../controllers/cwtsInstructorController');
router.use(requireAuth,requireRole('instructor'),requirePortal('cwts-admin','instructor'));
router.use((req,res,next)=>req.user.program==='CWTS'?next():res.status(403).json({message:'Access denied.'}));
router.get('/assignments',controller.mine);
router.get('/assignments/:id/records',controller.records);
router.patch('/assignments/:id/records/:studentId',controller.verify);
module.exports=router;
