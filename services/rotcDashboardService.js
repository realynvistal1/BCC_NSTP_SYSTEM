function summarize(slots, records) {
  const battalions = Object.fromEntries([1, 2].map(number => {
    const configured = (slots || []).filter(slot => !slot.unit && Number(slot.battalion) === number);
    const members = records.filter(row => !row.assignment_special_unit && !Number(row.assignment_is_advance) && Number(row.assignment_battalion) === number);
    return [number, {
      count: members.length,
      capacity: slots ? configured.reduce((sum, slot) => sum + Number(slot.capacity || 0), 0) : null,
      companies: new Set((slots ? configured.map(slot => slot.company) : members.map(row => row.assignment_company)).filter(Boolean)).size,
      platoons: slots ? configured.length : new Set(members.map(row => row.assignment_company + '/' + row.assignment_platoon)).size,
    }];
  }));
  const advance = records.filter(row => Number(row.assignment_is_advance) && !row.assignment_special_unit);
  const special = records.filter(row => row.assignment_special_unit);
  return {
    battalions,
    advance: { count: advance.length, male: advance.filter(row => row.sex === 'Male').length, female: advance.filter(row => row.sex === 'Female').length },
    special: { count: special.length, units: Object.fromEntries(['Medics', 'HQ', 'MP'].map(unit => [unit, special.filter(row => row.assignment_special_unit === unit).length])) },
  };
}

async function forSchedule(db, schedule) {
  if (!schedule?.platoons_assigned_at) return summarize(null, []);
  const [[draft]] = await db.execute('SELECT published_configuration FROM rotc_roster_drafts WHERE schedule_id=?', [schedule.id]);
  const raw = draft?.published_configuration;
  const slots = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
  const [records] = await db.execute(`SELECT r.assignment_battalion,r.assignment_company,r.assignment_platoon,r.assignment_special_unit,r.assignment_is_advance,s.sex
    FROM student_ms_records r JOIN students s ON s.id=r.student_id
    WHERE r.program='ROTC' AND r.status='approved' AND s.role='student' AND CAST(r.schedule_id AS UNSIGNED)=?`, [schedule.id]);
  return summarize(slots, records);
}

module.exports = { summarize, forSchedule };
