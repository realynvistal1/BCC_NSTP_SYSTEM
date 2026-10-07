async function ensureEnrollmentLifecycle(db) {
  const [[status]] = await db.execute("SHOW COLUMNS FROM student_ms_records LIKE 'status'");
  if (!status.Type.includes("'withdrawn'")) {
    await db.execute("ALTER TABLE student_ms_records MODIFY status ENUM('pending','approved','rejected','withdrawn','dropped') NOT NULL DEFAULT 'pending'");
  }
  const [columns] = await db.execute('SHOW COLUMNS FROM student_ms_records');
  for (const [name, definition] of [
    ['status_reason', 'VARCHAR(1000) DEFAULT NULL'],
    ['status_reviewed_by', 'VARCHAR(255) DEFAULT NULL'],
    ['status_reviewed_at', 'DATETIME DEFAULT NULL'],
    ['enrollment_kind', "ENUM('initial','progression','retake','return') NOT NULL DEFAULT 'initial'"],
    ['prior_enrollment_id', 'INT UNSIGNED DEFAULT NULL'],
    ['absence_years', 'INT UNSIGNED NOT NULL DEFAULT 0'],
  ]) {
    if (!columns.some(column => column.Field === name)) {
      await db.execute(`ALTER TABLE student_ms_records ADD COLUMN ${name} ${definition}`);
    }
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS grade_change_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    enrollment_record_id INT UNSIGNED NOT NULL,
    student_id INT UNSIGNED NOT NULL,
    program ENUM('ROTC','CWTS') NOT NULL,
    ms_level ENUM('1','2') NOT NULL,
    previous_midterm DECIMAL(5,2) DEFAULT NULL,
    previous_final_term DECIMAL(5,2) DEFAULT NULL,
    previous_grade DECIMAL(5,2) DEFAULT NULL,
    previous_status VARCHAR(10) DEFAULT NULL,
    midterm DECIMAL(5,2) NOT NULL,
    final_term DECIMAL(5,2) NOT NULL,
    grade DECIMAL(5,2) NOT NULL,
    status VARCHAR(10) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_grade_change_student (student_id,program),
    FOREIGN KEY (enrollment_record_id) REFERENCES student_ms_records(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
module.exports = { ensureEnrollmentLifecycle };
if (require.main === module) {
  const db = require('../config/database');
  ensureEnrollmentLifecycle(db).then(()=>console.log('Enrollment lifecycle and grade correction history ready.'))
    .catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.end());
}
