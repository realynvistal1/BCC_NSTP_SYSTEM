const router = require("express").Router();
const controller = require("../controllers/rotcAdminController");
const {
  requireAuth, requireRole
}
= require("../middleware/authMiddleware");
router.use(requireAuth, requireRole("admin"));
router.get("/dashboard", controller.dashboard);
router.get("/enrollment-schedule", controller.schedules);
router.post("/enrollment-schedule", controller.schedules);
router.get("/enrollments", controller.enrollments);
router.get("/enrollments/:id", controller.enrollmentDetail);
router.patch("/enrollments/:id", controller.updateEnrollment);
router.post("/enrollments/bulk-approve", controller.bulkApprove);
router.post("/enrollments/bulk-reject", controller.bulkReject);
router.get("/roster", controller.roster);
router.post("/auto-assign", controller.autoAssign);
router.get("/grades", controller.grades);
router.post("/grades", controller.grades);
router.get("/offenses", controller.offenses);
router.post("/offenses", controller.offenses);
router.get("/serial-numbers", controller.serials);
router.post("/serial-numbers", controller.serials);
router.get("/certificate-settings", controller.certificateSettings);
router.post("/certificate-settings", controller.certificateSettings);
router.get("/certificates/:studentId", controller.certificate);
router.get("/records", controller.records);
router.get("/records/:studentId", controller.recordDetail);
router.get("/attendance-summary", controller.attendanceSummary);
router.patch("/attendance-summary/:sessionId/verify", controller.verifyAttendance);
router.get("/withdrawals", controller.withdrawals);
router.patch("/withdrawals/:id", controller.withdrawals);
module.exports = router;
