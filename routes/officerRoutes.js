const router = require("express").Router();
const controller = require("../controllers/officerController");

const { requireAuth, requireRole, requirePortal } = require("../middleware/authMiddleware");

router.use(requireAuth, requireRole("officer"), requirePortal("officer"));
const cwtsInstructors=require('../controllers/cwtsInstructorController');
router.get('/cwts-instructors',cwtsInstructors.management);
router.post('/cwts-instructors',cwtsInstructors.create);
router.post('/cwts-instructors/:id/invitation',cwtsInstructors.invite);
router.patch('/cwts-instructors/:id/status',cwtsInstructors.setStatus);
const automaticCwtsAttendance=(req,res)=>res.status(410).json({message:'CWTS attendance access follows the instructor company assignment. Manage company assignments in the CWTS admin portal.'});
router.post('/cwts-instructor-assignments',automaticCwtsAttendance);
router.patch('/cwts-instructor-assignments/:id/revoke',automaticCwtsAttendance);
router.get('/cwts-verification-log',cwtsInstructors.audit);

router.get('/students/:studentId/files/:field', require('../services/studentDetailService').serveUpload);
router.get("/dashboard", controller.dashboard);
router.get("/cwts-companies", require("../controllers/sharedAdminController").cwtsCompanyList);
router.get("/enrollments", controller.enrollments);
router.get("/records", controller.records);
router.get("/records/filter-options", controller.recordFilterOptions);
router.get("/records/download/profiles", controller.downloadRecordProfiles);
router.get("/records/:studentId", controller.recordDetail);
router.get("/certificates/:studentId", controller.certificate);
router.get("/roster/:group", controller.roster);

router.get("/attendance/progress", controller.attendanceProgress);
router.get("/attendance/sessions", controller.sessions);
router.post("/attendance/sessions", controller.createAttendance);
router.get("/attendance/sessions/:id/records", controller.sessionRecords);
router.post("/attendance/sessions/:id/records", controller.setAttendance);
router.patch("/attendance/records/:id", controller.updateAttendance);

module.exports = router;
