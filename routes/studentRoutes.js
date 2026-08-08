const r=require('express').Router();
const c=require('../controllers/studentController');
const {
  requireAuth,requireRole
}
=require('../middleware/authMiddleware');
r.get('/enrollment-schedule',c.checkSchedule);
r.get('/check-student-id',c.checkStudentId);
r.post('/register',c.register);
r.use(requireAuth,requireRole('student'));
r.get('/dashboard',c.dashboard);
r.get('/profile',c.profile);
r.get('/grades',c.grades);
r.get('/serial-number',c.serial);
r.get('/certificate-settings',c.certificateSettings);
r.get('/certificate',c.certificate);
r.get('/attendance-offense',c.attendanceOffense);
r.post('/attendance-offense/acknowledge',c.acknowledgeAttendanceWarning);
r.get('/attendance',c.attendance);
r.get('/attendance/sessions',c.openSessions);
r.post('/attendance/mark',c.markAttendance);
r.post('/re-enroll',c.reEnroll);
r.get('/withdrawal',c.withdrawal);
r.post('/withdrawal',c.withdrawal);
module.exports=r;
