const db = require('../config/database');

(async () => {
  const [rows] = await db.execute(
    `SELECT smr.program,smr.ms_level,es.year,
            COUNT(*) AS total_students,
            SUM(smr.assignment_battalion=1) AS battalion_one,
            SUM(smr.assignment_battalion=2) AS battalion_two,
            SUM(COALESCE(smr.assignment_is_advance,0)=1) AS advance_course,
            SUM(smr.assignment_special_unit IS NOT NULL) AS special_platoon,
            SUM(smr.assignment_is_advance IS NULL) AS missing_snapshots
     FROM student_ms_records smr
     JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
     WHERE smr.status='approved' AND es.platoons_assigned_at IS NOT NULL
     GROUP BY smr.program,smr.ms_level,es.year
     ORDER BY smr.program,es.year,smr.ms_level`
  );

  const missing = rows.reduce((sum, row) => sum + Number(row.missing_snapshots || 0), 0);
  if (missing) throw new Error(`${missing} assigned enrollment record(s) are missing cycle assignment snapshots.`);

  console.table(rows);
  const [unassignedCycles] = await db.execute(
    `SELECT smr.program,smr.ms_level,es.year,COUNT(*) AS approved_students,
            SUM(
              smr.assignment_battalion IS NOT NULL
              OR smr.assignment_company IS NOT NULL
              OR smr.assignment_platoon IS NOT NULL
              OR smr.assignment_special_unit IS NOT NULL
              OR COALESCE(smr.assignment_is_advance,0)=1
            ) AS premature_assignments
     FROM student_ms_records smr
     JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
     WHERE smr.status='approved' AND es.platoons_assigned_at IS NULL
     GROUP BY smr.program,smr.ms_level,es.year
     ORDER BY smr.program,es.year,smr.ms_level`
  );
  const premature = unassignedCycles.reduce(
    (sum, row) => sum + Number(row.premature_assignments || 0),
    0
  );
  if (premature) throw new Error(`${premature} student(s) appear assigned before the cycle assignment action.`);

  console.table(unassignedCycles);
  console.log('Roster cycle assignment verification passed.');
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
