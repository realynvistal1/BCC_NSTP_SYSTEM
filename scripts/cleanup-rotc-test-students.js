const db = require('../config/database');
const apply = process.argv.includes('--apply');
const targets = ['990001-0003','990001-0004','990001-0005','990001-0006','990001-0007'];
async function main() {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(`SELECT id,student_id,email,first_name,last_name,willing_to_take_advance_course
      FROM students WHERE student_id IN (${targets.map(() => '?').join(',')}) FOR UPDATE`, targets);
    for (const row of rows) {
      if (row.email !== `rotc-demo-${row.student_id}@example.invalid` || row.last_name !== 'ROTC Test' || Number(row.willing_to_take_advance_course) !== 0) {
        throw new Error(`Student ${row.student_id} does not match the regular demo account; cleanup cancelled.`);
      }
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', remove: rows.map(row => ({ id: row.student_id, name: `${row.first_name} ${row.last_name}` })) }));
    if (apply) {
      for (const row of rows) {
        await connection.execute(`DELETE l FROM rotc_attendance_verification_log l
          JOIN attendance_records ar ON ar.id=l.record_id WHERE ar.student_id=?`, [row.id]);
        await connection.execute('DELETE FROM students WHERE id=?', [row.id]);
      }
    }
    const [kept] = await connection.execute("SELECT student_id,first_name,last_name FROM students WHERE student_id IN ('990001-0001','990001-0002') AND last_name='ROTC Test' AND willing_to_take_advance_course=1");
    console.log(JSON.stringify({ keptAdvanceCourse: kept }));
    if (apply) await connection.commit(); else await connection.rollback();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
