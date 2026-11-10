async function ensureInstructorPortal(db) {
  await require('./migrate-grade-instructors').ensureGradeInstructors(db);
  for (const table of ['rotc_instructors','cwts_instructors']) {
    const [columns]=await db.execute(`SHOW COLUMNS FROM ${table}`);
    const existing=new Set(columns.map(row=>row.Field));
    const additions={middle_name:"VARCHAR(100) NOT NULL DEFAULT ''",profile_photo:'MEDIUMTEXT DEFAULT NULL',
      requested_year:'VARCHAR(9) DEFAULT NULL',requested_level:"ENUM('1','2') DEFAULT NULL",
      review_status:"ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'",
      review_note:"VARCHAR(500) NOT NULL DEFAULT ''",reviewed_by:'VARCHAR(255) DEFAULT NULL',reviewed_at:'DATETIME DEFAULT NULL'};
    for(const [column,type] of Object.entries(additions)) if(!existing.has(column)) await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    // Existing activated accounts keep access; newly registered accounts require admin approval.
    if(!existing.has('review_status')) await db.execute(`UPDATE ${table} SET review_status='approved' WHERE status='active'`);
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS instructor_account_reviews (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,program ENUM('ROTC','CWTS') NOT NULL,
    instructor_id INT UNSIGNED NOT NULL,decision ENUM('approved','rejected') NOT NULL,
    note VARCHAR(500) NOT NULL DEFAULT '',reviewed_by VARCHAR(255) NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await db.execute(`CREATE TABLE IF NOT EXISTS instructor_grade_submissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,enrollment_record_id INT UNSIGNED NOT NULL,
    assignment_id INT UNSIGNED NOT NULL,instructor_id INT UNSIGNED NOT NULL,program ENUM('ROTC','CWTS') NOT NULL,
    midterm DECIMAL(5,2) NOT NULL,final_term DECIMAL(5,2) NOT NULL,
    status ENUM('draft','submitted','returned','approved') NOT NULL DEFAULT 'draft',
    version INT UNSIGNED NOT NULL DEFAULT 1,review_note VARCHAR(500) NOT NULL DEFAULT '',
    reviewed_by VARCHAR(255) DEFAULT NULL,submitted_at DATETIME DEFAULT NULL,reviewed_at DATETIME DEFAULT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_instructor_grade_enrollment(enrollment_record_id),
    FOREIGN KEY(enrollment_record_id) REFERENCES student_ms_records(id),
    FOREIGN KEY(assignment_id) REFERENCES grade_instructor_assignments(id)
  ) ENGINE=InnoDB`);
  await db.execute(`CREATE TABLE IF NOT EXISTS instructor_grade_review_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,submission_id INT UNSIGNED NOT NULL,
    action VARCHAR(20) NOT NULL,midterm DECIMAL(5,2) NOT NULL,final_term DECIMAL(5,2) NOT NULL,
    version INT UNSIGNED NOT NULL,note VARCHAR(500) NOT NULL DEFAULT '',actor VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(submission_id) REFERENCES instructor_grade_submissions(id)
  ) ENGINE=InnoDB`);
}
module.exports={ensureInstructorPortal};
if(require.main===module){const db=require('../config/database');ensureInstructorPortal(db).then(()=>console.log('Instructor portal tables ready.')).catch(e=>{console.error(e.code||e.message);process.exitCode=1;}).finally(()=>db.end());}
