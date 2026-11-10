async function ensureGradeInstructors(db) {
  await require('./migrate-cwts-instructors').ensureCwtsInstructorTables(db);
  // Reuse CWTS accounts; ROTC accounts have the same structure for the later login step.
  await db.execute('CREATE TABLE IF NOT EXISTS rotc_instructors LIKE cwts_instructors');
  await db.execute(`CREATE TABLE IF NOT EXISTS grade_instructor_assignments (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    program ENUM('ROTC','CWTS') NOT NULL,
    schedule_id INT UNSIGNED NOT NULL,
    company VARCHAR(30) NOT NULL DEFAULT '',
    rotc_instructor_id INT UNSIGNED DEFAULT NULL,
    cwts_instructor_id INT UNSIGNED DEFAULT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    assigned_by VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_grade_instructor_scope(schedule_id,company),
    FOREIGN KEY(schedule_id) REFERENCES enrollment_schedules(id),
    FOREIGN KEY(rotc_instructor_id) REFERENCES rotc_instructors(id),
    FOREIGN KEY(cwts_instructor_id) REFERENCES cwts_instructors(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.execute(`CREATE TABLE IF NOT EXISTS grade_instructor_assignment_log (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT UNSIGNED NOT NULL,
    previous_instructor_id INT UNSIGNED DEFAULT NULL,
    instructor_id INT UNSIGNED DEFAULT NULL,
    changed_by VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(assignment_id) REFERENCES grade_instructor_assignments(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
module.exports={ensureGradeInstructors};
if(require.main===module){const db=require('../config/database');ensureGradeInstructors(db).then(()=>console.log('Instructor assignment tables ready.')).catch(error=>{console.error(error.code||error.message);process.exitCode=1;}).finally(()=>db.end());}
