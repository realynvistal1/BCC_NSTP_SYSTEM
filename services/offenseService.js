const db = require('../config/database');

async function get(studentId) {
  const [rows] = await db.execute('SELECT * FROM attendance_offenses WHERE student_id=? LIMIT 1', [studentId]);
  return rows[0] || null;
}

async function record(studentId) {
  const existing = await get(studentId);
  if (existing) {
    const next = Math.min(Number(existing.offend || 0) + 1, 2);
    await db.execute(
      'UPDATE attendance_offenses SET offend=?, settled=?, updated_at=NOW() WHERE student_id=?',
      [next, next >= 2 ? 0 : Number(existing.settled || 0), studentId]
    );
    return { ...existing, offend: next, settled: next >= 2 ? 0 : Number(existing.settled || 0) };
  }
  await db.execute(
    'INSERT INTO attendance_offenses(student_id,offend,settled,created_at,updated_at) VALUES(?,1,0,NOW(),NOW())',
    [studentId]
  );
  return get(studentId);
}

async function settle(studentId) {
  const existing = await get(studentId);
  if (!existing || Number(existing.offend || 0) < 2) throw new Error('This student does not have an offense that requires settlement.');
  await db.execute('UPDATE attendance_offenses SET settled=1,updated_at=NOW() WHERE student_id=?', [studentId]);
  return get(studentId);
}

async function acknowledge(studentId) {
  await db.execute('UPDATE attendance_offenses SET warning_acknowledged_at=NOW(),updated_at=NOW() WHERE student_id=?', [studentId]);
  return get(studentId);
}

module.exports = { get, record, settle, acknowledge };
