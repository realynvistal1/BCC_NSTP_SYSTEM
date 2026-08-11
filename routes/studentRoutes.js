const router = require('express').Router();
const controller = require('../controllers/studentController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

router.get('/enrollment-schedule', controller.checkSchedule);
router.get('/check-student-id', controller.checkStudentId);
router.post('/register', controller.register);

router.use(requireAuth, requireRole('student'));

router.get('/dashboard', controller.dashboard);
router.get('/profile', controller.profile);
router.get('/grades', controller.grades);
router.get('/serial-number', controller.serial);
router.get('/certificate-settings', controller.certificateSettings);
router.get('/certificate', controller.certificate);
router.get('/attendance-offense', controller.attendanceOffense);
router.post('/attendance-offense/acknowledge', controller.acknowledgeAttendanceWarning);
router.get('/attendance', controller.attendance);
router.get('/attendance/sessions', controller.openSessions);
router.post('/attendance/mark', controller.markAttendance);
router.post('/re-enroll', controller.reEnroll);
router.get('/withdrawal', controller.withdrawal);
router.post('/withdrawal', controller.withdrawal);

module.exports = router;
