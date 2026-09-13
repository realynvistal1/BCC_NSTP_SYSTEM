const router = require('express').Router();
const controller = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.post('/forgot-password/request-code-student', controller.requestStudentResetCode);
router.post('/forgot-password/reset-student', controller.resetStudentPassword);
router.post('/forgot-password/request-code', controller.requestAdminResetCode);
router.post('/forgot-password/reset-admin', controller.resetAdminPassword);
router.get('/captcha-config', controller.captchaConfig);
router.get('/me', requireAuth, controller.me);
router.post('/change-password/request-code', requireAuth, controller.requestPasswordChangeCode);
router.post('/change-password', requireAuth, controller.changePassword);
router.get('/change-email', requireAuth, requireRole('admin', 'officer'), controller.currentAdminEmail);
router.post('/change-email/:step', requireAuth, requireRole('admin', 'officer'), controller.changeAdminEmail);

module.exports = router;
