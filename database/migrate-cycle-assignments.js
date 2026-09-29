const ASSIGNMENT_COLUMNS = [
  ['assignment_battalion', 'TINYINT UNSIGNED DEFAULT NULL'],
  ['assignment_company', 'VARCHAR(30) DEFAULT NULL'],
  ['assignment_platoon', 'TINYINT UNSIGNED DEFAULT NULL'],
  ['assignment_special_unit', 'VARCHAR(50) DEFAULT NULL'],
  ['assignment_is_advance', 'TINYINT(1) DEFAULT NULL'],
  ['assignment_label', 'VARCHAR(100) DEFAULT NULL'],
];

function specialUnitForStudent(student) {
  if (Number(student.has_medical_condition || 0) === 1) return 'HQ';
  if (Number(student.willing_to_be_medics || 0) === 1) return 'Medics';
  if (Number(student.willing_to_be_military_police || 0) === 1) return 'MP';
  return null;
}

async function repairUnclassifiedAssignments(db) {
  const [rows] = await db.execute(
    `SELECT smr.id,smr.schedule_id,smr.program,smr.assignment_battalion,smr.assignment_company,
            smr.assignment_platoon,smr.assignment_special_unit,smr.assignment_is_advance,
            s.sex,s.has_medical_condition,s.willing_to_take_advance_course,
            s.willing_to_be_medics,s.willing_to_be_military_police,
            s.last_name,s.first_name,s.middle_name,s.student_id
     FROM student_ms_records smr
     JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
     JOIN students s ON s.id=smr.student_id
     WHERE smr.status='approved' AND es.platoons_assigned_at IS NOT NULL
     ORDER BY CAST(smr.schedule_id AS UNSIGNED),s.last_name,s.first_name,s.middle_name,s.student_id,s.id`
  );

  const schedules = new Map();
  for (const row of rows) {
    const key = `${row.program}|${row.schedule_id}`;
    if (!schedules.has(key)) schedules.set(key, []);
    schedules.get(key).push(row);
  }

  for (const scheduleRows of schedules.values()) {
    const program = scheduleRows[0]?.program;
    if (program === 'CWTS') {
      const companies = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
      const counts = Object.fromEntries(companies.map((company) => [company, 0]));
      scheduleRows.forEach((row) => {
        if (row.assignment_company in counts) counts[row.assignment_company] += 1;
      });

      for (const row of scheduleRows.filter((item) => !item.assignment_company)) {
        const company = companies.find((name) => counts[name] < 60);
        if (!company) continue;
        counts[company] += 1;
        await db.execute(
          `UPDATE student_ms_records
           SET assignment_battalion=NULL,assignment_company=?,assignment_platoon=NULL,
               assignment_special_unit=NULL,assignment_is_advance=0,assignment_label=?
           WHERE id=?`,
          [company, `${company} Company`, row.id]
        );
      }
      continue;
    }

    const maleCompanies = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
    const femaleCompanies = ['Echo', 'Foxtrot', 'Golf', 'Hotel'];
    const counts = new Map();
    [...maleCompanies, ...femaleCompanies].forEach((company) => {
      for (let platoon = 1; platoon <= 4; platoon += 1) counts.set(`${company}|${platoon}`, 0);
    });
    scheduleRows.forEach((row) => {
      const key = `${row.assignment_company}|${row.assignment_platoon}`;
      if (counts.has(key)) counts.set(key, counts.get(key) + 1);
    });

    const unclassified = scheduleRows.filter((row) => (
      !row.assignment_battalion
      && !row.assignment_special_unit
      && Number(row.assignment_is_advance || 0) !== 1
    ));

    for (const row of unclassified) {
      const specialUnit = specialUnitForStudent(row);
      if (specialUnit) {
        await db.execute(
          `UPDATE student_ms_records
           SET assignment_battalion=NULL,assignment_company=NULL,assignment_platoon=NULL,
               assignment_special_unit=?,assignment_is_advance=0,assignment_label=?
           WHERE id=?`,
          [specialUnit, specialUnit, row.id]
        );
        continue;
      }

      if (Number(row.willing_to_take_advance_course || 0) === 1) {
        await db.execute(
          `UPDATE student_ms_records
           SET assignment_battalion=NULL,assignment_company=NULL,assignment_platoon=NULL,
               assignment_special_unit=NULL,assignment_is_advance=1,assignment_label='Advance Course'
           WHERE id=?`,
          [row.id]
        );
        continue;
      }

      const battalion = row.sex === 'Male' ? 1 : 2;
      const companies = battalion === 1 ? maleCompanies : femaleCompanies;
      let assignment = null;
      for (const company of companies) {
        for (let platoon = 1; platoon <= 4; platoon += 1) {
          const key = `${company}|${platoon}`;
          if (counts.get(key) < 37) {
            assignment = { company, platoon, key };
            break;
          }
        }
        if (assignment) break;
      }
      if (!assignment) continue;
      counts.set(assignment.key, counts.get(assignment.key) + 1);
      await db.execute(
        `UPDATE student_ms_records
         SET assignment_battalion=?,assignment_company=?,assignment_platoon=?,
             assignment_special_unit=NULL,assignment_is_advance=0,assignment_label=?
         WHERE id=?`,
        [battalion, assignment.company, assignment.platoon, `${assignment.company} - Platoon ${assignment.platoon}`, row.id]
      );
    }
  }
}

async function ensureCycleAssignmentColumns(db) {
  const [existing] = await db.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student_ms_records'"
  );
  const existingNames = new Set(existing.map((column) => column.COLUMN_NAME));

  for (const [name, definition] of ASSIGNMENT_COLUMNS) {
    if (!existingNames.has(name)) {
      await db.execute(`ALTER TABLE student_ms_records ADD COLUMN ${name} ${definition}`);
    }
  }

  await db.execute(
    `UPDATE student_ms_records smr
     JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
     JOIN students s ON s.id=smr.student_id
     SET smr.assignment_battalion=CASE WHEN smr.program='ROTC' THEN s.battalion ELSE NULL END,
         smr.assignment_company=CASE WHEN smr.program='ROTC' THEN s.rotc_company ELSE s.company END,
         smr.assignment_platoon=CASE WHEN smr.program='ROTC' THEN s.rotc_platoon ELSE NULL END,
         smr.assignment_special_unit=CASE WHEN smr.program='ROTC' THEN s.special_unit ELSE NULL END,
         smr.assignment_is_advance=CASE
           WHEN smr.program='ROTC' AND s.special_unit IS NULL AND COALESCE(s.willing_to_take_advance_course,0)=1 THEN 1
           ELSE 0
         END,
         smr.assignment_label=s.platoon
     WHERE smr.status='approved'
       AND es.platoons_assigned_at IS NOT NULL
       AND smr.assignment_is_advance IS NULL`
  );

  await repairUnclassifiedAssignments(db);

  await db.execute(
    `UPDATE students s
     JOIN student_ms_records smr ON smr.student_id=s.id AND smr.status='approved'
     JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
     SET s.company=NULL,s.battalion=NULL,s.rotc_company=NULL,s.rotc_platoon=NULL,
         s.special_unit=NULL,s.platoon=NULL
     WHERE es.platoons_assigned_at IS NULL`
  );
}

module.exports = { ensureCycleAssignmentColumns };

if (require.main === module) {
  const db = require('../config/database');
  ensureCycleAssignmentColumns(db)
    .then(() => console.log('Per-cycle assignment migration complete.'))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.end());
}
