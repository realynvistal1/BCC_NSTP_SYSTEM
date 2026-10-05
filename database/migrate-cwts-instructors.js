async function ensureCwtsInstructorTables(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS cwts_instructors (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,password VARCHAR(255) DEFAULT NULL,
    status ENUM('pending','active','disabled') NOT NULL DEFAULT 'pending',
    session_version INT UNSIGNED NOT NULL DEFAULT 0,
    invitation_hash CHAR(64) DEFAULT NULL,invitation_expires BIGINT NOT NULL DEFAULT 0,
    invitation_sent_at BIGINT NOT NULL DEFAULT 0,
    delivery_status ENUM('not_sent','sent','failed','accepted') NOT NULL DEFAULT 'not_sent',
    created_by VARCHAR(255) NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cwts_invitation(invitation_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.execute(`CREATE TABLE IF NOT EXISTS cwts_instructor_assignments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,instructor_id INT UNSIGNED NOT NULL,
    attendance_session_id INT UNSIGNED NOT NULL,company VARCHAR(30) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,assigned_by VARCHAR(255) NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cwts_instructor_scope(attendance_session_id,company),
    FOREIGN KEY(instructor_id) REFERENCES cwts_instructors(id),
    FOREIGN KEY(attendance_session_id) REFERENCES attendance_sessions(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.execute(`CREATE TABLE IF NOT EXISTS cwts_attendance_verification_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,record_id INT UNSIGNED NOT NULL,
    assignment_id INT UNSIGNED NOT NULL,instructor_id INT UNSIGNED NOT NULL,
    previous_status VARCHAR(10) NOT NULL,status VARCHAR(10) NOT NULL,reason VARCHAR(500) NOT NULL,
    record_version INT UNSIGNED NOT NULL,verified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_cwts_log_record(record_id),
    FOREIGN KEY(record_id) REFERENCES attendance_records(id),
    FOREIGN KEY(assignment_id) REFERENCES cwts_instructor_assignments(id),
    FOREIGN KEY(instructor_id) REFERENCES cwts_instructors(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
module.exports={ensureCwtsInstructorTables};
if(require.main===module){
  const db=require('../config/database');
  require('./migrate-rotc-verifiers').ensureRotcVerifierTables(db)
    .then(()=>ensureCwtsInstructorTables(db)).then(()=>console.log('CWTS instructor tables ready.'))
    .catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.end());
}
