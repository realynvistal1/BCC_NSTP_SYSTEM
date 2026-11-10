function fail(message, status = 400) {
  const error = new Error(message); error.status = status; throw error;
}
const assignmentCondition = `(COALESCE(assignment_battalion,0)>0
  OR NULLIF(assignment_company,'') IS NOT NULL
  OR COALESCE(assignment_platoon,0)>0
  OR NULLIF(assignment_special_unit,'') IS NOT NULL
  OR COALESCE(assignment_is_advance,0)=1
  OR NULLIF(assignment_label,'') IS NOT NULL)`;

// Both programs use the same deadline rules. Opening dates and existing records stay intact.
async function extend(db, { program, id, deadline, expectedDeadline }) {
  if (!['ROTC', 'CWTS'].includes(program) || !/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) fail('Select a valid enrollment schedule.');
  if (typeof deadline !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(deadline)) fail('Enter the new deadline date and time.');
  const end = new Date(deadline).getTime();
  if (!Number.isFinite(end) || end <= Date.now()) fail('The new deadline must be in the future.');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // Lock this program's cycles in the same order as schedule creation.
    const [cycles] = await connection.execute('SELECT * FROM enrollment_schedules WHERE program=? ORDER BY id DESC FOR UPDATE', [program]);
    const cycle = cycles.find(row => Number(row.id) === Number(id));
    if (!cycle) fail('Enrollment schedule not found.', 404);
    if (Number(cycles[0].id) !== Number(id)) fail('A newer enrollment schedule exists. Extend the latest schedule instead.', 409);
    if (cycle.platoons_assigned_at) fail(`Enrollment cannot be reopened after ${program === 'ROTC' ? 'platoon' : 'company'} assignments are finalized.`, 409);
    const [assigned] = await connection.execute(`SELECT id FROM student_ms_records
      WHERE program=? AND CAST(schedule_id AS UNSIGNED)=? AND ${assignmentCondition} LIMIT 1 FOR UPDATE`, [program, Number(id)]);
    if (assigned.length) fail(`Enrollment cannot be extended because students already have ${program === 'ROTC' ? 'platoon' : 'company'} assignments.`, 409);
    if (expectedDeadline !== cycle.deadline) fail('The deadline has changed. Refresh the page and try again.', 409);
    if (end <= new Date(cycle.deadline).getTime()) fail('Choose a deadline later than the current deadline.');
    if (end <= new Date(cycle.open_date).getTime()) fail('The deadline must be after the opening date.');
    await connection.execute('UPDATE enrollment_schedules SET deadline=? WHERE id=? AND program=?', [deadline, Number(id), program]);
    await connection.commit();
    return { ...cycle, deadline };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
module.exports = { extend, assignmentCondition };
