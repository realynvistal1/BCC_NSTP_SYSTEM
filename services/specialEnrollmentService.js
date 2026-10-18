const LIMIT = 37;
async function availability(db, scheduleId, lock = false, excludeStudent = 0) {
  const [rows] = await db.execute(`SELECT r.id,s.willing_to_be_medics,s.willing_to_be_military_police
    FROM student_ms_records r JOIN students s ON s.id=r.student_id
    WHERE r.program='ROTC' AND CAST(r.schedule_id AS UNSIGNED)=? AND r.status IN ('pending','approved')
      AND s.id<>? AND r.id=(SELECT MAX(x.id) FROM student_ms_records x WHERE x.student_id=s.id AND x.program='ROTC' AND x.schedule_id=r.schedule_id)
    ${lock ? 'FOR UPDATE' : ''}`, [scheduleId, excludeStudent]);
  return Object.fromEntries([['Medics','willing_to_be_medics'],['MP','willing_to_be_military_police']].map(([unit,flag]) => {
    const count = rows.filter(row => Number(row[flag]) === 1).length;
    return [unit, { count, limit: LIMIT, full: count >= LIMIT }];
  }));
}
async function check(db, scheduleId, body, excludeStudent = 0) {
  if (['willing_to_take_advance_course','willing_to_be_medics','willing_to_be_military_police'].reduce((total, flag) => total + (Number(body[flag]) === 1 ? 1 : 0), 0) > 1) {
    const error = new Error('Choose only one ROTC preference.'); error.status = 400; throw error;
  }
  // Serialize enrollment submissions on the cycle row. Use locking reads for current counts.
  const [[schedule]] = await db.execute('SELECT * FROM enrollment_schedules WHERE id=? FOR UPDATE', [scheduleId]);
  if (!schedule || schedule.platoons_assigned_at || Date.now() < new Date(schedule.open_date).getTime() || Date.now() > new Date(schedule.deadline).getTime()) {
    const error = new Error('Enrollment is closed for this cycle.'); error.status = 409; throw error;
  }
  if(schedule.program==='CWTS') {
    const [members]=await db.execute(`SELECT id FROM student_ms_records
      WHERE program='CWTS' AND CAST(schedule_id AS UNSIGNED)=? AND status IN ('pending','approved') AND student_id<>? FOR UPDATE`,[scheduleId,excludeStudent]);
    if(members.length>=360){const error=new Error('CWTS enrollment is full (360/360). No more applications can be accepted for this schedule.');error.status=409;throw error;}
    return;
  }
  if (schedule.program !== 'ROTC') return;
  const counts = await availability(db, scheduleId, true, excludeStudent);
  for (const [unit, flag] of [['Medics','willing_to_be_medics'],['MP','willing_to_be_military_police']]) {
    if (Number(body[flag]) === 1 && counts[unit].full) {
      const error = new Error(`${unit} is full (37/37). Please select another option.`); error.status = 409; throw error;
    }
  }
}
module.exports = { availability, check, LIMIT };
