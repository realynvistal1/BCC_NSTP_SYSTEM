// Keep the effective grades in student_grades for prerequisites and certificates,
// and preserve a separate result for every approved enrollment attempt.
const createTable = `CREATE TABLE IF NOT EXISTS student_grade_attempts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enrollment_record_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  ms_level ENUM('1','2') NOT NULL,
  program ENUM('ROTC','CWTS') NOT NULL,
  midterm DECIMAL(5,2) DEFAULT NULL,
  final_term DECIMAL(5,2) DEFAULT NULL,
  grade DECIMAL(5,2) NOT NULL,
  status ENUM('Passed','Failed') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_grade_enrollment (enrollment_record_id),
  KEY idx_grade_attempt_student (student_id,program,ms_level),
  FOREIGN KEY (enrollment_record_id) REFERENCES student_ms_records(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

async function ensureGradeAttempts(db) {
  await db.execute(createTable);
  // Only migrate a legacy result once. Re-running must never attach an old
  // failed summary grade to a new, ungraded retake enrollment.
  await db.execute(`INSERT INTO student_grade_attempts
    (enrollment_record_id,student_id,ms_level,program,midterm,final_term,grade,status,created_at,updated_at)
    SELECT r.id,g.student_id,g.ms_level,g.program,g.midterm,g.final_term,g.grade,g.status,g.created_at,g.updated_at
    FROM student_grades g JOIN student_ms_records r ON r.id=(
      SELECT MAX(r2.id) FROM student_ms_records r2
      WHERE r2.student_id=g.student_id AND r2.program=g.program
        AND r2.ms_level=g.ms_level AND r2.status='approved')
    WHERE NOT EXISTS (SELECT 1 FROM student_grade_attempts a
      WHERE a.student_id=g.student_id AND a.program=g.program AND a.ms_level=g.ms_level)
    ON DUPLICATE KEY UPDATE enrollment_record_id=VALUES(enrollment_record_id)`);
}

module.exports = { ensureGradeAttempts, createTable };
if (require.main === module) {
  const db = require('../config/database');
  ensureGradeAttempts(db).then(() => console.log('Enrollment grade history ready.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.end());
}
