const shared = require('./sharedAdminController');

function withProgram(handler) {
  return (req, res, next) => {
    req.params.program = 'cwts';
    return handler(req, res, next);
  };
}

module.exports = {
  dashboard: withProgram(shared.dashboard),
  schedules: withProgram(shared.schedules),
  enrollments: withProgram(shared.enrollments),
  enrollmentDetail: withProgram(shared.enrollmentDetail),
  updateEnrollment: withProgram(shared.updateEnrollment),
  bulkApprove: withProgram(shared.bulkApprove),
  bulkReject: withProgram(shared.bulkReject),
  roster: withProgram(shared.roster),
  autoAssign: withProgram(shared.autoAssign),
  grades: withProgram(shared.grades),
  offenses: withProgram(shared.offenses),
  serials: withProgram(shared.serials),
  certificateSettings: withProgram(shared.certificateSettings),
  certificate: withProgram(shared.certificate),
  records: withProgram(shared.records),
  recordDetail: withProgram(shared.recordDetail),
  attendanceSummary: withProgram(shared.attendanceSummary),
  verifyAttendance: withProgram(shared.verifyAttendance),
  withdrawals: shared.withdrawals,
};
