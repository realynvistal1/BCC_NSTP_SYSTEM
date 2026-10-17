const db = require('../config/database');
const { fail } = require('./rotcRosterService');
async function review(recordId, status, reason) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[candidate]] = await connection.execute("SELECT schedule_id FROM student_ms_records WHERE id=? AND program='ROTC'", [recordId]);
    if (!candidate) fail('Enrollment not found.');
    const [[schedule]] = await connection.execute('SELECT platoons_assigned_at FROM enrollment_schedules WHERE id=? FOR UPDATE',[candidate.schedule_id]);
    const [[record]] = await connection.execute('SELECT * FROM student_ms_records WHERE id=? FOR UPDATE',[recordId]);
    if (schedule?.platoons_assigned_at && record.status !== status) fail('The roster is finalized. Enrollment review cannot change its membership.');
    if (['withdrawn','dropped'].includes(record.status) && record.status !== status) fail('This closed enrollment must remain in history.');
    await connection.execute('UPDATE student_ms_records SET status=?,rejection_reason=? WHERE id=?',[status,status === 'rejected' ? reason : null,recordId]);
    if (status === 'approved' && !schedule?.platoons_assigned_at) {
      const [[latest]] = await connection.execute('SELECT id FROM student_ms_records WHERE student_id=? ORDER BY id DESC LIMIT 1',[record.student_id]);
      if (Number(latest.id) === Number(recordId)) await connection.execute('UPDATE students SET special_unit=NULL,battalion=NULL,rotc_company=NULL,rotc_platoon=NULL,platoon=NULL WHERE id=?',[record.student_id]);
    }
    await connection.commit();
  } catch(error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
module.exports = { review };
