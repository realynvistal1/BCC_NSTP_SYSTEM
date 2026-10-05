const router = require("express").Router();
const controller = require("../controllers/officerController");
const verifiers = require('../controllers/rotcVerifierController');
const { requireAuth, requireRole, requirePortal } = require("../middleware/authMiddleware");

router.use(requireAuth, requireRole("officer"), requirePortal("officer"));
const cwtsInstructors=require('../controllers/cwtsInstructorController');
router.get('/cwts-instructors',cwtsInstructors.management);
router.post('/cwts-instructors',cwtsInstructors.create);
router.post('/cwts-instructors/:id/invitation',cwtsInstructors.invite);
router.patch('/cwts-instructors/:id/status',cwtsInstructors.setStatus);
router.post('/cwts-instructor-assignments',cwtsInstructors.assign);
router.patch('/cwts-instructor-assignments/:id/revoke',cwtsInstructors.revoke);
router.get('/cwts-verification-log',cwtsInstructors.audit);

router.get("/dashboard", controller.dashboard);
router.get('/rotc-verifiers', verifiers.management);
router.post('/rotc-verifiers', verifiers.assign);
router.patch('/rotc-verifiers/:id/revoke', verifiers.revoke);
router.get('/rotc-verification-log', verifiers.audit);
router.get("/enrollments", controller.enrollments);
router.get("/records", controller.records);
router.get("/records/filter-options", controller.recordFilterOptions);
router.get("/records/download/profiles", controller.downloadRecordProfiles);
router.get("/records/:studentId", controller.recordDetail);
router.get("/roster/:group", controller.roster);

router.get("/attendance/progress", controller.attendanceProgress);
router.get("/attendance/sessions", controller.sessions);
router.post("/attendance/sessions", controller.createAttendance);
router.get("/attendance/sessions/:id/records", controller.sessionRecords);
router.post("/attendance/sessions/:id/records", controller.setAttendance);
router.patch("/attendance/records/:id", controller.updateAttendance);

module.exports = router;
