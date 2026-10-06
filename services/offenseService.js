const db = require('../config/database');

async function get(studentId) {
  const [rows] = await db.execute('SELECT * FROM attendance_offenses WHERE student_id=? LIMIT 1', [studentId]);
  return rows[0] || null;
}

function isAttendanceClaim(record) {
  return Number(record?.claimed_present) === 1
    || ['present', 'late'].includes(String(record?.status || '').toLowerCase());
}

async function reconcile(studentId, connection = db, newFalseClaim = false) {
  // A locking read sees the latest committed corrections, including when closing
  // several students in a single transaction under MySQL's default isolation.
  const [absences] = await connection.execute("SELECT id FROM attendance_records WHERE student_id=? AND status='absent' AND false_present=1 FOR UPDATE", [studentId]);
  const count = Math.min(absences.length, 2);
  await connection.execute(`INSERT INTO attendance_offenses(student_id,offend,settled,created_at,updated_at)
    VALUES(?,?,0,NOW(),NOW()) ON DUPLICATE KEY UPDATE
    warning_acknowledged_at=IF(offend<>VALUES(offend) OR ?,NULL,warning_acknowledged_at),
    settled=IF(VALUES(offend)<2 OR ?,0,settled),offend=VALUES(offend),updated_at=NOW()`,
    [studentId,count,Number(newFalseClaim),Number(newFalseClaim)]);
  const [[row]] = await connection.execute('SELECT * FROM attendance_offenses WHERE student_id=?', [studentId]);
  return row;
}

async function record(studentId) { return reconcile(studentId); }

async function saveAttendance(studentId, session, status, actor) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM students WHERE id=? FOR UPDATE', [studentId]);
    const [[before]] = await connection.execute('SELECT status,claimed_present,false_present FROM attendance_records WHERE student_id=? AND attendance_session_id=? FOR UPDATE', [studentId,session.id]);
    await connection.execute(`INSERT INTO attendance_records(student_id,attendance_session_id,status,mi_number,mi_type,verified_by,verified_at)
      VALUES(?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE status=VALUES(status),verified_by=VALUES(verified_by),verified_at=NOW(),updated_at=NOW(),record_version=record_version+1`,
      [studentId,session.id,status,session.mi_number,session.mi_type,actor]);
    const falseClaim=status==='absent' && (isAttendanceClaim(before) || Number(before?.false_present)===1);
    await connection.execute('UPDATE attendance_records SET false_present=? WHERE student_id=? AND attendance_session_id=?',[Number(falseClaim),studentId,session.id]);
    const offense = isAttendanceClaim(before) || before?.false_present
      ? await reconcile(studentId,connection,falseClaim && !Number(before?.false_present)) : null;
    await connection.commit();
    return falseClaim ? offense : null;
  } catch(error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function settle(studentId) {
  const existing = await get(studentId);

  if (!existing || Number(existing.offend || 0) < 2) {
    throw new Error('This student does not have an offense that requires settlement.');
  }

  await db.execute('UPDATE attendance_offenses SET settled=1,updated_at=NOW() WHERE student_id=?', [studentId]);
  return get(studentId);
}

async function acknowledge(studentId) {
  await db.execute('UPDATE attendance_offenses SET warning_acknowledged_at=NOW(),updated_at=NOW() WHERE student_id=?', [studentId]);
  return get(studentId);
}

module.exports = {
  isAttendanceClaim,
  acknowledge,
  get,
  record,
  reconcile,
  saveAttendance,
  settle,
};
