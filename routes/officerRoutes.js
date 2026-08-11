const router = require("express").Router();
const controller = require("../controllers/officerController");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

router.use(requireAuth, requireRole("officer"));

router.get("/dashboard", controller.dashboard);
router.get("/enrollments", controller.enrollments);
router.get("/records", controller.records);
router.get("/records/:studentId", controller.recordDetail);
router.get("/roster/:group", controller.roster);

router.get("/attendance/progress", controller.attendanceProgress);
router.get("/attendance/sessions", controller.sessions);
router.post("/attendance/sessions", controller.createAttendance);
router.get("/attendance/sessions/:id/records", controller.sessionRecords);
router.post("/attendance/sessions/:id/records", controller.setAttendance);
router.patch("/attendance/records/:id", controller.updateAttendance);

module.exports = router;
