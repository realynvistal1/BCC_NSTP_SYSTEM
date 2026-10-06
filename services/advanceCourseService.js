const db = require('../config/database');

async function isApprovedAdvanceStudent(studentId) {
  const [rows] = await db.execute(`SELECT s.id FROM students s
    JOIN student_ms_records r ON r.id=(SELECT latest.id FROM student_ms_records latest
      WHERE latest.student_id=s.id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1)
    WHERE s.id=? AND s.role='student' AND s.nstp_component='ROTC'
      AND s.willing_to_take_advance_course=1 AND s.special_unit IS NULL
      AND r.program='ROTC' AND r.status='approved' AND r.assignment_is_advance=1
      AND r.assignment_special_unit IS NULL`, [studentId]);
  return rows.length > 0;
}

async function requireApprovedAdvanceStudent(req, res, next) {
  try {
    if (!await isApprovedAdvanceStudent(req.user.id)) {
      return res.status(403).json({ message: 'My Assigned Attendance is available only to approved Advance Course students.' });
    }
    next();
  } catch (error) {
    console.error('Advance Course eligibility:', error.message);
    res.status(500).json({ message: 'Unable to check Advance Course access.' });
  }
}

module.exports = { isApprovedAdvanceStudent, requireApprovedAdvanceStudent };
