const router = require('express').Router();
const controller = require('../controllers/studentController');
const verifiers = require('../controllers/rotcVerifierController');
const { requireApprovedAdvanceStudent } = require('../services/advanceCourseService');
const { requireAuth, requireRole, requirePortal } = require('../middleware/authMiddleware');

router.get('/enrollment-schedule', controller.checkSchedule);
router.get('/check-student-id', controller.checkStudentId);
router.post('/register', controller.register);

router.use(requireAuth, requireRole('student'), requirePortal('student'));

router.get('/dashboard', controller.dashboard);
router.get('/rotc-verifier/assignments', requireApprovedAdvanceStudent, verifiers.mine);
router.get('/rotc-verifier/assignments/:id/records', requireApprovedAdvanceStudent, verifiers.records);
router.patch('/rotc-verifier/records/:id', requireApprovedAdvanceStudent, verifiers.verify);
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
router.get('/re-enroll', controller.reEnrollForm);
router.post('/re-enroll', controller.reEnroll);
router.get('/withdrawal', controller.withdrawal);
router.post('/withdrawal', controller.withdrawal);

module.exports = router;
