const router = require('express').Router();
const multer = require('multer');
const controller = require('../controllers/cwtsAdminController');
const { requireAuth, requireRole, requirePortal } = require('../middleware/authMiddleware');
const uploadValidation = require('../services/uploadValidationService');
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
    fields: 10,
    fieldSize: 64 * 1024,
    parts: 11,
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

router.use(requireAuth, requireRole('admin'), requirePortal('cwts-admin'));
const gradeInstructors=require('../controllers/gradeInstructorController').forProgram('CWTS');
router.get('/instructor-assignments',gradeInstructors.list);
const instructorPortal=require('../controllers/instructorPortalController').forProgram('CWTS');
router.patch('/instructors/:id/review',instructorPortal.reviewAccount);
router.get('/instructors/:id/photo',instructorPortal.photo);
router.get('/grade-submissions',instructorPortal.grades);
router.patch('/grade-submissions/:id/review',instructorPortal.reviewGrade);
// Instructors register through the shared Instructor Portal.
router.post('/instructor-assignments',gradeInstructors.assign);
router.patch('/instructor-assignments/:id/remove',gradeInstructors.remove);

router.get('/students/:studentId/files/:field', (req,res) => { req.params.program='cwts'; return require('../services/studentDetailService').serveUpload(req,res); });
router.get('/dashboard', controller.dashboard);
router.get('/enrollment-schedule', controller.schedules);
const exams = require('../controllers/cwtsExamController');
router.get('/enrollment-schedule/exam-template', exams.template);
router.post('/enrollment-schedule/exam-preview', excelUpload.single('file'), exams.prepare);
router.get('/enrollment-schedule/:id/exam-results', exams.list);
router.get('/enrollment-schedule/:id/exam-template', exams.template);
router.post('/enrollment-schedule/:id/exam-preview', excelUpload.single('file'), exams.preview);
router.post('/enrollment-schedule/:id/exam-import', excelUpload.single('file'), exams.import);
router.get('/sample-enrollment-settings', (req, res) => res.json(require('../services/sampleEnrollmentService').settings()));
router.post('/enrollment-schedule', excelUpload.single('file'), controller.schedules);
router.patch('/enrollment-schedule/:id/extend', controller.extendSchedule);
router.get('/enrollments', controller.enrollments);
router.get('/enrollments/:id/photo', controller.enrollmentPhoto);
router.get('/enrollments/:id', controller.enrollmentDetail);
router.get('/students/:id/photo', controller.studentPhoto);
router.patch('/enrollments/:id/student', controller.editEnrollmentStudent);
router.delete('/enrollments/:id/student', controller.deleteEnrollmentStudent);
router.patch('/enrollments/:id', controller.updateEnrollment);
router.post('/enrollments/bulk-approve', controller.bulkApprove);
router.post('/enrollments/bulk-reject', controller.bulkReject);
router.get('/roster', controller.roster);
router.post('/auto-assign', controller.autoAssign);
router.get('/companies', controller.cwtsCompanyList);
router.post('/companies', controller.addCwtsCompany);
router.patch('/companies/:name/capacity', controller.updateCwtsCompanyCapacity);
router.delete('/companies/:name', controller.deleteCwtsCompany);
router.get('/grades', controller.grades);
router.post('/grades', (req,res)=>res.status(403).json({message:'Grades must be submitted by the assigned instructor and reviewed by the admin.'}));
router.get('/offenses', controller.offenses);
router.post('/offenses', controller.offenses);
router.get('/serial-numbers', controller.serials);
router.post('/serial-numbers', controller.serials);
router.post('/serial-numbers/import', excelUpload.single('file'), controller.bulkImportSerials);
router.get('/certificate-settings', controller.certificateSettings);
router.post('/certificate-settings', controller.certificateSettings);
router.post('/certificates/download-all', controller.downloadCertificates);
router.get('/certificates/:studentId', controller.certificate);
router.get('/records', controller.records);
router.get('/records/download/profiles', controller.downloadRecordProfiles);
router.get('/records/:studentId', controller.recordDetail);
router.get('/attendance-summary', controller.attendanceSummary);
router.patch('/attendance-summary/:sessionId/verify', controller.verifyAttendance);

module.exports = router;
