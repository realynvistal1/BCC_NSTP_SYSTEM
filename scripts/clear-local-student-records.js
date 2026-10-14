require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const db = require('../config/database');
const tables = [
  'cwts_attendance_verification_log', 'rotc_attendance_verification_log',
  'cwts_instructor_assignments', 'rotc_verifier_assignments', 'grade_change_log',
  'student_grade_attempts', 'student_grades', 'attendance_offenses',
  'attendance_records', 'advance_course_withdrawals', 'serial_numbers',
  'password_reset_codes', 'student_ms_records', 'students',
  'attendance_sessions', 'enrollment_schedules',
];
async function main() {
  if (!process.argv.includes('--confirm-clear-local')) throw Error('Explicit --confirm-clear-local required.');
  if (!['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST || 'localhost')) throw Error('Only a local database may be cleared.');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [engines] = await connection.execute('SELECT TABLE_NAME name, ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
    for (const table of tables) {
      if (!engines.some(row => row.name === table && row.engine === 'InnoDB')) throw Error(`Missing or nontransactional table: ${table}`);
    }
    const [adminsBefore] = await connection.execute('SELECT * FROM admins ORDER BY id');
    const snapshot = { database: process.env.DB_NAME || 'bcc_nstp_database', createdAt: new Date().toISOString(), tables: {} };
    for (const row of engines) {
      const [records] = await connection.execute('SELECT * FROM `' + row.name.replace(/`/g, '``') + '`');
      snapshot.tables[row.name] = records;
    }
    const backupDirectory = path.join(__dirname, '../.local-backups');
    fs.mkdirSync(backupDirectory, { recursive: true });
    const backup = path.join(backupDirectory, `before-student-clear-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify(snapshot), { flag: 'wx' });
    console.log('Recovery backup saved in .local-backups.');
    const removed = {};
    for (const table of tables) {
      const [result] = await connection.execute('DELETE FROM `' + table + '`');
      removed[table] = result.affectedRows;
    }
    await connection.execute("DELETE FROM password_change_codes WHERE account_type='student'");
    for (const table of tables) {
      const [[row]] = await connection.execute('SELECT COUNT(*) count FROM `' + table + '`');
      if (Number(row.count) !== 0) throw Error(`Records remain in ${table}; rolling back.`);
    }
    const [adminsAfter] = await connection.execute('SELECT * FROM admins ORDER BY id');
    if (JSON.stringify(adminsBefore) !== JSON.stringify(adminsAfter)) throw Error('Administrator accounts changed; rolling back.');
    await connection.commit();
    console.log(JSON.stringify({ cleared: removed, administratorsKept: adminsAfter.length }));
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
