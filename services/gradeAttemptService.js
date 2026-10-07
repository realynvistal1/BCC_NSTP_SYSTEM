async function history(db, studentId, program) {
  const clauses = [], values = [];
  if (studentId != null) { clauses.push('r.student_id=?'); values.push(studentId); }
  if (program) { clauses.push('r.program=?'); values.push(program); }
  const [rows] = await db.execute(`SELECT r.id enrollment_record_id,r.student_id,r.ms_level,r.program,
    r.status enrollment_status,r.status_reason,r.enrollment_kind,r.absence_years,r.schedule_id,r.assignment_label,r.assignment_battalion,
    r.assignment_company,r.assignment_platoon,r.assignment_special_unit,
    es.year school_year,a.midterm,a.final_term,a.grade,a.status,a.updated_at,
    (1 + (SELECT COUNT(*) FROM student_ms_records prior WHERE prior.student_id=r.student_id
      AND prior.program=r.program AND prior.ms_level=r.ms_level
      AND prior.status IN ('approved','withdrawn','dropped') AND prior.id<r.id)) attempt_number
    FROM student_ms_records r LEFT JOIN enrollment_schedules es ON es.id=CAST(r.schedule_id AS UNSIGNED)
    LEFT JOIN student_grade_attempts a ON a.enrollment_record_id=r.id
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY r.id`, values);
  return rows;
}

async function save(db, record, midterm, finalTerm, grade, status) {
  await db.execute(`INSERT INTO student_grade_attempts
    (enrollment_record_id,student_id,ms_level,program,midterm,final_term,grade,status)
    VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE midterm=VALUES(midterm),
    final_term=VALUES(final_term),grade=VALUES(grade),status=VALUES(status),updated_at=CURRENT_TIMESTAMP`,
  [record.id,record.student_id,record.ms_level,record.program,midterm,finalTerm,grade,status]);
}

module.exports = { history, save };
