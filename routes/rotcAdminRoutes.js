const router = require('express').Router();
const multer = require('multer');
const controller = require('../controllers/rotcAdminController');
const { requireAuth, requireRole, requirePortal } = require('../middleware/authMiddleware');
const uploadValidation = require('../services/uploadValidationService');
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter(req, file, cb) {
    try {
      uploadValidation.validateExcelFile({
        ...file,
        buffer: Buffer.alloc(1),
        size: file.size || 1,
      });
      cb(null, true);
    } catch (error) {
      cb(error);
    }
  },
});

router.use(requireAuth, requireRole('admin'), requirePortal('rotc-admin'));

router.get('/dashboard', controller.dashboard);
router.get('/enrollment-schedule', controller.schedules);
router.post('/enrollment-schedule', controller.schedules);
router.get('/enrollments', controller.enrollments);
router.get('/enrollments/:id', controller.enrollmentDetail);
router.patch('/enrollments/:id/student', controller.editEnrollmentStudent);
router.delete('/enrollments/:id/student', controller.deleteEnrollmentStudent);
router.patch('/enrollments/:id', controller.updateEnrollment);
router.post('/enrollments/bulk-approve', controller.bulkApprove);
router.post('/enrollments/bulk-reject', controller.bulkReject);
router.get('/roster', controller.roster);
router.post('/auto-assign', controller.autoAssign);
router.get('/grades', controller.grades);
router.post('/grades', controller.grades);
router.get('/offenses', controller.offenses);
router.post('/offenses', controller.offenses);
router.get('/serial-numbers', controller.serials);
router.post('/serial-numbers', controller.serials);
router.post('/serial-numbers/import', excelUpload.single('file'), controller.bulkImportSerials);
router.get('/certificate-settings', controller.certificateSettings);
router.post('/certificate-settings', controller.certificateSettings);
router.get('/certificates/:studentId', controller.certificate);
router.get('/records', controller.records);
router.get('/records/download/profiles', controller.downloadRecordProfiles);
router.get('/records/:studentId', controller.recordDetail);
router.get('/attendance-summary', controller.attendanceSummary);
router.patch('/attendance-summary/:sessionId/verify', controller.verifyAttendance);
router.get('/withdrawals', controller.withdrawals);
router.patch('/withdrawals/:id', controller.withdrawals);

module.exports = router;
