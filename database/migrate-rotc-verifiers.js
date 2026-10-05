const statements = [
  `CREATE TABLE IF NOT EXISTS rotc_verifier_assignments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    verifier_id INT UNSIGNED NOT NULL,
    battalion TINYINT UNSIGNED NOT NULL,
    company VARCHAR(30) NOT NULL,
    platoon TINYINT UNSIGNED NOT NULL,
    special_unit VARCHAR(20) NOT NULL DEFAULT '',
    ms_level VARCHAR(1) NOT NULL,
    school_year VARCHAR(20) NOT NULL,
    mi_number INT UNSIGNED NOT NULL DEFAULT 0,
    mi_type VARCHAR(3) NOT NULL DEFAULT '',
    active TINYINT(1) NOT NULL DEFAULT 1,
    assigned_by VARCHAR(255) NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_verifier_scope (battalion,company,platoon,special_unit,ms_level,school_year,mi_number,mi_type),
    KEY idx_verifier (verifier_id,active),
    FOREIGN KEY (verifier_id) REFERENCES students(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS rotc_attendance_verification_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    record_id INT UNSIGNED NOT NULL,
    assignment_id INT UNSIGNED NOT NULL,
    verifier_id INT UNSIGNED NOT NULL,
    previous_status VARCHAR(10) NOT NULL,
    status VARCHAR(10) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    verified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_verification_record (record_id),
    FOREIGN KEY (record_id) REFERENCES attendance_records(id),
    FOREIGN KEY (assignment_id) REFERENCES rotc_verifier_assignments(id),
    FOREIGN KEY (verifier_id) REFERENCES students(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];
async function ensureRotcVerifierTables(db) {
  const [finalizedColumns]=await db.execute("SHOW COLUMNS FROM attendance_sessions LIKE 'attendance_finalized_at'");
  if (!finalizedColumns.length) await db.execute('ALTER TABLE attendance_sessions ADD COLUMN attendance_finalized_at DATETIME DEFAULT NULL');
  for (const sql of statements) await db.execute(sql);
  const [versionColumns]=await db.execute("SHOW COLUMNS FROM attendance_records LIKE 'record_version'");
  if (!versionColumns.length) await db.execute('ALTER TABLE attendance_records ADD COLUMN record_version INT UNSIGNED NOT NULL DEFAULT 0');
  const [claimColumns]=await db.execute("SHOW COLUMNS FROM attendance_records LIKE 'claimed_present'");
  if (!claimColumns.length) {
    await db.execute('ALTER TABLE attendance_records ADD COLUMN claimed_present TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN false_present TINYINT(1) NOT NULL DEFAULT 0');
    await db.execute(`UPDATE attendance_records ar SET claimed_present=1
      WHERE ar.latitude IS NOT NULL AND (ar.status='present' OR EXISTS
        (SELECT 1 FROM rotc_attendance_verification_log l WHERE l.record_id=ar.id AND l.previous_status='present'))`);
    await db.execute("UPDATE attendance_records SET false_present=1 WHERE claimed_present=1 AND status='absent' AND verified_by IS NOT NULL");
  }
  const [columns]=await db.execute("SHOW COLUMNS FROM rotc_verifier_assignments LIKE 'special_unit'");
  if (!columns.length) await db.execute(`ALTER TABLE rotc_verifier_assignments
    ADD COLUMN special_unit VARCHAR(20) NOT NULL DEFAULT '',
    DROP INDEX uk_verifier_scope,
    ADD UNIQUE KEY uk_verifier_scope (battalion,company,platoon,special_unit,ms_level,school_year)`);
  const [miColumns]=await db.execute("SHOW COLUMNS FROM rotc_verifier_assignments LIKE 'mi_number'");
  if (!miColumns.length) await db.execute(`ALTER TABLE rotc_verifier_assignments
    ADD COLUMN mi_number INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN mi_type VARCHAR(3) NOT NULL DEFAULT '',
    DROP INDEX uk_verifier_scope,
    ADD UNIQUE KEY uk_verifier_scope (battalion,company,platoon,special_unit,ms_level,school_year,mi_number,mi_type)`);
  const [tables]=await db.execute(`SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('rotc_verifier_assignments','rotc_attendance_verification_log')
      AND TABLE_COLLATION<>'utf8mb4_unicode_ci'`);
  for (const table of tables) await db.execute(`ALTER TABLE ${table.TABLE_NAME} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
}
module.exports = { ensureRotcVerifierTables };
if (require.main === module) {
  const db = require('../config/database');
  ensureRotcVerifierTables(db)
    .then(() => console.log('ROTC verifier tables ready.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.end());
}
