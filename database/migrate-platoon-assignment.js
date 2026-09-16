async function ensurePlatoonAssignmentColumn(db) {
  const [columns] = await db.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='enrollment_schedules' AND COLUMN_NAME='platoons_assigned_at'"
  );
  if (!columns.length) {
    await db.execute('ALTER TABLE enrollment_schedules ADD COLUMN platoons_assigned_at DATETIME DEFAULT NULL');
  }
}

module.exports = { ensurePlatoonAssignmentColumn };

if (require.main === module) {
  const db = require('../config/database');
  ensurePlatoonAssignmentColumn(db)
    .then(() => console.log('Platoon assignment migration complete.'))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.end());
}
