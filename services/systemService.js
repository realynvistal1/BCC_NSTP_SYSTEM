const db = require('../config/database');

async function latestRecord(studentId) {
  const [rows] = await db.execute(
    'SELECT * FROM student_ms_records WHERE student_id=? ORDER BY created_at DESC LIMIT 1',
    [studentId]
  );

  return rows[0] || null;
}

async function studentById(id) {
  const [rows] = await db.execute('SELECT * FROM students WHERE id=?', [id]);
  return rows[0] || null;
}

function studentPublic(student) {
  if (!student) return null;

  const { password, ...safeStudent } = student;
  return safeStudent;
}

module.exports = {
  latestRecord,
  studentById,
  studentPublic,
};
