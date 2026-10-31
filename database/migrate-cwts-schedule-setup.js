// Additive only: existing enrollment and student assignment records stay intact.
async function ensureCwtsScheduleSetup(db) {
  const [columns] = await db.execute("SHOW COLUMNS FROM enrollment_schedules LIKE 'cwts_company_setup'");
  if (!columns.length) {
    await db.execute('ALTER TABLE enrollment_schedules ADD COLUMN cwts_company_setup LONGTEXT NULL');
  }
}
module.exports = { ensureCwtsScheduleSetup };
