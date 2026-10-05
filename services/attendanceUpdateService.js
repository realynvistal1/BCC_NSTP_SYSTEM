const db = require('../config/database');

// Keep stored actor emails for audit compatibility; expose names separately.
async function decorateAttendanceUpdates(records) {
  const emails = [...new Set(records.filter(row => row.verified_by).map(row => row.verified_by))];
  if (!emails.length) return records;
  const placeholders = emails.map(() => '?').join(',');
  const [students] = await db.execute(`SELECT email,first_name,middle_name,last_name,suffix FROM students WHERE email IN (${placeholders})`, emails);
  const [admins] = await db.execute(`SELECT email,username,role,program FROM admins WHERE email IN (${placeholders})`, emails);
  const [instructors] = await db.execute(`SELECT email,first_name,last_name FROM cwts_instructors WHERE email IN (${placeholders})`,emails);
  const actors = new Map(admins.map(actor => [actor.email, actor.role === 'director' ? 'NSTP Director' : `${actor.program} Administrator`]));
  students.forEach(actor => actors.set(actor.email, [actor.first_name, actor.middle_name, actor.last_name, actor.suffix].filter(Boolean).join(' ')));
  instructors.forEach(actor=>actors.set(actor.email,[actor.first_name,actor.last_name].join(' ')));
  const ids = records.filter(row => row.verified_at).map(row => row.record_id || row.id).filter(Boolean);
  let logs = [];
  if (ids.length) {
    [logs] = await db.execute(`SELECT l.*,s.email FROM rotc_attendance_verification_log l
      JOIN students s ON s.id=l.verifier_id WHERE l.record_id IN (${ids.map(() => '?').join(',')}) ORDER BY l.id DESC`, ids);
    const [cwtsLogs]=await db.execute(`SELECT l.*,i.email FROM cwts_attendance_verification_log l
      JOIN cwts_instructors i ON i.id=l.instructor_id WHERE l.record_id IN (${ids.map(()=>'?').join(',')}) ORDER BY l.id DESC`,ids);
    logs.push(...cwtsLogs);
  }
  return records.map(row => {
    const log = logs.find(entry => Number(entry.record_id) === Number(row.record_id || row.id)
      && entry.email === row.verified_by && entry.status === (row.status || row.attendance_status)
      && new Date(entry.verified_at).getTime() === new Date(row.verified_at).getTime());
    return { ...row, verified_by_name: row.verified_by ? actors.get(row.verified_by) || 'Attendance staff' : null,
      update_reason: log?.reason || null, previous_status: log?.previous_status || null };
  });
}
module.exports = { decorateAttendanceUpdates };
