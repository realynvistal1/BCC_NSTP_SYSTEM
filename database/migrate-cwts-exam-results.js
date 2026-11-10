async function ensureCwtsExamResults(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS cwts_exam_results (
    schedule_id INT UNSIGNED NOT NULL,
    student_id VARCHAR(32) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) NOT NULL DEFAULT '',
    last_name VARCHAR(100) NOT NULL,
    sex VARCHAR(6) DEFAULT NULL,
    course VARCHAR(255) NOT NULL,
    result VARCHAR(10) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (schedule_id,student_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [columns] = await db.execute("SHOW COLUMNS FROM cwts_exam_results LIKE 'sex'");
  // Existing results keep an unknown sex until the admin uploads the updated file.
  if (!columns.length) await db.execute('ALTER TABLE cwts_exam_results ADD COLUMN sex VARCHAR(6) DEFAULT NULL AFTER last_name');
  const [middleColumns] = await db.execute("SHOW COLUMNS FROM cwts_exam_results LIKE 'middle_name'");
  if (!middleColumns.length) await db.execute("ALTER TABLE cwts_exam_results ADD COLUMN middle_name VARCHAR(100) NOT NULL DEFAULT '' AFTER first_name");
  await db.execute(`CREATE TABLE IF NOT EXISTS cwts_exam_imports (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT UNSIGNED NOT NULL,
    imported_by VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    before_results LONGTEXT NOT NULL,
    imported_results LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (schedule_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
module.exports = { ensureCwtsExamResults };
if (require.main === module) {
  const db = require('../config/database');
  ensureCwtsExamResults(db).then(() => console.log('CWTS exam result tables ready.'))
    .catch(error => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => db.end());
}
