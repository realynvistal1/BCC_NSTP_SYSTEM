const router = require('express').Router();
const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.post('/forgot-password/request-code-student', controller.requestStudentResetCode);
router.post('/forgot-password/reset-student', controller.resetStudentPassword);
router.post('/forgot-password/request-code', controller.requestAdminResetCode);
router.post('/forgot-password/reset-admin', controller.resetAdminPassword);
router.get('/me', requireAuth, controller.me);
router.post('/change-password', requireAuth, controller.changePassword);

module.exports = router;
