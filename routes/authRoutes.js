const router = require('express').Router();
const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.me);
router.post('/change-password', requireAuth, controller.changePassword);

module.exports = router;
