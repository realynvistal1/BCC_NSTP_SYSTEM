async function append(connection, record, reason, actor, initial = false) {
  const assignment = {
    battalion: record.assignment_battalion || null,
    rotc_company: record.assignment_company || null,
    rotc_platoon: record.assignment_platoon || null,
    special_unit: record.assignment_special_unit || null,
    willing_to_take_advance_course: Number(record.assignment_is_advance || 0),
  };
  if (initial) {
    await connection.execute(`INSERT INTO rotc_assignment_history(record_id,effective_at,assignment,reason,actor)
      SELECT ?, '1970-01-01 00:00:00', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM rotc_assignment_history WHERE record_id=?)`,
    [record.id, JSON.stringify(assignment), reason, actor || null, record.id]);
  } else {
    await connection.execute('INSERT INTO rotc_assignment_history(record_id,assignment,reason,actor) VALUES(?,?,?,?)', [record.id, JSON.stringify(assignment), reason, actor || null]);
  }
}
// Resolve membership when the session opened, preserving old session filters after transfers.
async function forSession(connection, session) {
  const [rows] = await connection.execute(`SELECT r.student_id,r.assignment_battalion,r.assignment_company,r.assignment_platoon,r.assignment_special_unit,r.assignment_is_advance,
    (SELECT h.assignment FROM rotc_assignment_history h WHERE h.record_id=r.id AND h.effective_at<=?
      ORDER BY h.effective_at DESC,h.id DESC LIMIT 1) historical_assignment
    FROM student_ms_records r JOIN enrollment_schedules es ON es.id=CAST(r.schedule_id AS UNSIGNED)
    WHERE r.program='ROTC' AND r.status='approved' AND r.ms_level=? AND (?='' OR es.year=?)
      AND es.platoons_assigned_at IS NOT NULL
      AND r.id=(SELECT MAX(x.id) FROM student_ms_records x WHERE x.student_id=r.student_id AND x.program='ROTC' AND x.ms_level=r.ms_level AND x.schedule_id=r.schedule_id)`,
  [session.open_date, String(session.ms_level || '1'), session.school_year || '', session.school_year || '']);
  return new Map(rows.map(row => [Number(row.student_id), row.historical_assignment
    ? (typeof row.historical_assignment === 'string' ? JSON.parse(row.historical_assignment) : row.historical_assignment)
    : { battalion: row.assignment_battalion, rotc_company: row.assignment_company, rotc_platoon: row.assignment_platoon, special_unit: row.assignment_special_unit, willing_to_take_advance_course: Number(row.assignment_is_advance || 0) }]));
}
module.exports = { append, forSession };
