async function ensureRotcRoster(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS rotc_roster_drafts (
    schedule_id INT UNSIGNED NOT NULL PRIMARY KEY,
    revision INT UNSIGNED NOT NULL DEFAULT 0,
    configuration JSON NOT NULL,
    assignments JSON DEFAULT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_rotc_roster_schedule FOREIGN KEY (schedule_id) REFERENCES enrollment_schedules(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  const [companyColumns] = await db.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rotc_roster_drafts' AND COLUMN_NAME='companies'");
  if (!companyColumns.length) await db.execute('ALTER TABLE rotc_roster_drafts ADD COLUMN companies JSON DEFAULT NULL');
  const [editColumns] = await db.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rotc_roster_drafts' AND COLUMN_NAME='editing'");
  if (!editColumns.length) await db.execute('ALTER TABLE rotc_roster_drafts ADD COLUMN editing TINYINT(1) NOT NULL DEFAULT 0');
  const [publishedColumns]=await db.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rotc_roster_drafts' AND COLUMN_NAME='published_configuration'");
  if(!publishedColumns.length) {
    await db.execute('ALTER TABLE rotc_roster_drafts ADD COLUMN published_configuration JSON DEFAULT NULL');
    await db.execute('UPDATE rotc_roster_drafts d JOIN enrollment_schedules es ON es.id=d.schedule_id SET d.published_configuration=d.configuration WHERE es.platoons_assigned_at IS NOT NULL AND d.editing=0');
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS rotc_assignment_history (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    record_id INT UNSIGNED NOT NULL,
    effective_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    assignment JSON NOT NULL,
    reason VARCHAR(100) NOT NULL,
    actor VARCHAR(255) DEFAULT NULL,
    KEY idx_record_time (record_id,effective_at),
    CONSTRAINT fk_rotc_history_record FOREIGN KEY (record_id) REFERENCES student_ms_records(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}
module.exports = { ensureRotcRoster };
if (require.main === module) {
  const db = require('../config/database');
  ensureRotcRoster(db).then(() => console.log('ROTC roster migration complete.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
}
