const db = require('../config/database');
const roster = require('../services/rotcRosterService');
const { readLevel, readSchoolYear } = require('../services/requestValidationService');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

async function students(connection, scheduleId) {
  const [rows] = await connection.execute(`SELECT s.id,s.student_id,s.first_name,s.middle_name,s.last_name,s.sex,s.course,s.year_level,
    s.has_medical_condition,s.willing_to_be_medics,s.willing_to_be_military_police,s.willing_to_take_advance_course,
    r.id record_id,r.assignment_battalion,r.assignment_company,r.assignment_platoon,r.assignment_special_unit,r.assignment_is_advance
    FROM student_ms_records r JOIN students s ON s.id=r.student_id
    WHERE r.program='ROTC' AND CAST(r.schedule_id AS UNSIGNED)=? AND r.status='approved'
      AND r.id=(SELECT MAX(x.id) FROM student_ms_records x WHERE x.student_id=s.id AND x.program='ROTC' AND x.ms_level=r.ms_level)
    ORDER BY s.last_name,s.first_name,s.middle_name,s.id`, [scheduleId]);
  return rows;
}
async function cycle(connection, req, lock = false) {
  const input = req.method === 'GET' ? req.query : req.body;
  const level = readLevel(input.ms_level), year = readSchoolYear(input.school_year);
  if (!level || !year) roster.fail('Select an MS level and school year.');
  const [[schedule]] = await connection.execute(`SELECT * FROM enrollment_schedules WHERE program='ROTC' AND ms_level=? AND year=? ORDER BY id DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [level, year]);
  if (!schedule) roster.fail('No enrollment schedule exists for this cycle.');
  return schedule;
}
async function draft(connection, scheduleId) {
  const [[row]] = await connection.execute('SELECT * FROM rotc_roster_drafts WHERE schedule_id=?', [scheduleId]);
  if (row) {
    const configuration = roster.automaticHQ(parse(row.configuration));
    return { revision:Number(row.revision), editing:false, configuration, published_configuration:parse(row.published_configuration), assignments:parse(row.assignments), companies:parse(row.companies) || inferCompanies(configuration) };
  }
  const [[schedule]] = await connection.execute('SELECT platoons_assigned_at FROM enrollment_schedules WHERE id=?', [scheduleId]);
  // Older finalized cycles retain their original structure. New drafts start empty.
  const configuration = schedule?.platoons_assigned_at ? roster.defaults() : roster.automaticHQ([]);
  return { revision:0, editing:false, configuration, companies:inferCompanies(configuration), assignments:null };
}
function inferCompanies(slots) {
  return [...new Map(slots.filter(slot=>!slot.unit).map(slot=>[slot.company,{name:slot.company,battalion:slot.battalion}])).values()];
}
function validateCompanies(value, slots, previous) {
  const companies = value === undefined ? inferCompanies(slots) : value;
  if (!Array.isArray(companies) || companies.length > 8) roster.fail('Choose up to eight ROTC companies.');
  const seen = new Set();
  for (const company of companies) {
    if (!['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'].includes(company.name) || ![1,2].includes(company.battalion) || seen.has(company.name)) roster.fail('Each company needs one battalion and a unique name.');
    seen.add(company.name);
  }
  for (const slot of slots.filter(slot=>!slot.unit)) {
    if (!companies.some(company=>company.name === slot.company && company.battalion === slot.battalion)) roster.fail('Add each company to its battalion before adding platoons.');
  }
  roster.validateCompanyOrder(companies, previous);
  return companies;
}
exports.editor = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const schedule = await cycle(connection, req, true);
    const state = await draft(connection, schedule.id);
    if(schedule.platoons_assigned_at && state.published_configuration) state.configuration=state.published_configuration;
    const rows = await students(connection, schedule.id);
    if (!schedule.platoons_assigned_at) {
      state.configuration = roster.configuration(state.configuration);
      // Split existing draft special-group members by sex, retaining their group.
      for (const assignment of state.assignments || []) {
        const slot=state.configuration.find(slot=>slot.key===assignment.slot);
        if (!['MP','Medics'].includes(slot?.unit)) continue;
        const student=rows.find(row=>Number(row.record_id)===Number(assignment.record_id));
        const platoon=student?.sex==='Male'?1:student?.sex==='Female'?2:0;
        const target=state.configuration.find(target=>target.unit===slot.unit&&target.platoon===platoon);
        if(target)assignment.slot=target.key;
      }
      roster.expandTransferCapacity(state.configuration,state.assignments);
    }
    const [[review]] = await connection.execute("SELECT COUNT(*) total FROM student_ms_records WHERE program='ROTC' AND CAST(schedule_id AS UNSIGNED)=? AND status='pending'", [schedule.id]);
    const pendingCount = Number(review.total);
    const deadline = new Date(schedule.deadline).getTime();
    const enrollmentClosed = Number.isFinite(deadline) && Date.now() > deadline;
    let setupNeedsCapacity=false;
    if(!schedule.platoons_assigned_at&&state.assignments===null){try{roster.assign(rows,state.configuration);}catch(error){setupNeedsCapacity=Boolean(error.status);}}
    if (req.method === 'GET') {
      await connection.commit();
      return res.json({ schedule, ...state, students: rows, pending_count:pendingCount, enrollment_closed:enrollmentClosed, setup_needs_capacity:setupNeedsCapacity });
    }
    if(schedule.platoons_assigned_at) roster.fail('This roster is finalized and cannot be edited. Only approved Advance Course withdrawals can change assignments.');
    if (Number(req.body.revision) !== state.revision) roster.fail('Another administrator changed this draft. Reload before continuing.');
    const slots = roster.configuration(req.body.configuration || state.configuration);
    const companies = validateCompanies(req.body.companies, slots, state.companies);
    let assignments = req.body.assignments === undefined ? state.assignments : req.body.assignments;
    const action = req.body.action;
    if (!['configure','assign','save','finalize'].includes(action)) roster.fail('Invalid roster action.');
    if (action==='configure' && state.revision>0 && !setupNeedsCapacity) roster.fail('Platoon setup has already been saved and is now locked for this enrollment cycle.');
    if (action==='assign' && state.assignments!==null) roster.fail('Students have already been assigned. Use Move to adjust the draft roster.');
    if (action==='assign' && state.revision===0) roster.fail('Save the platoon setup before assigning students.');
    if (state.revision>0 && !(action==='configure'&&setupNeedsCapacity)) {
      const structure=items=>JSON.stringify(items.map(({capacity,...slot})=>slot));
      if(structure(slots)!==structure(state.configuration)||JSON.stringify(companies)!==JSON.stringify(state.companies)) roster.fail('Platoon setup is locked. You can only move students in the draft roster.');
      for(const slot of slots) {
        const original=state.configuration.find(item=>item.key===slot.key);
        if(slot.unit!=='HQ'&&slot.capacity<original.capacity) roster.fail('Saved platoon capacity cannot be reduced.');
      }
    }
    roster.validateSetup(slots, companies, { requirePlatoon:action==='configure' });
    if (['save','finalize'].includes(action) && (!Array.isArray(assignments) || !assignments.length)) roster.fail('Assign students before saving the roster.');
    if (action === 'configure') {
      roster.assign(rows,slots); // Reject insufficient capacity before saving and locking setup.
      assignments = null;
    }
    if (action === 'assign' || action === 'finalize') {
      if (!enrollmentClosed) roster.fail('Wait until enrollment closes before assigning or finalizing.');
      if (pendingCount) roster.fail('Approve or reject all pending enrollments before assigning or finalizing.');
      if (!rows.length) roster.fail('No approved students to assign. Approve enrollments first.');
      if (!slots.length) roster.fail('Add platoons and their capacities before assigning students.');
    }
    if (action === 'assign') assignments = roster.assign(rows, slots);
    if (['save','finalize'].includes(action)) roster.expandTransferCapacity(slots, assignments);
    if (assignments !== null) roster.validate(rows, slots, assignments);
    if (action === 'finalize') {
      if (req.body.confirm !== true) roster.fail('Confirm publishing these roster assignments.');
      if (!assignments || !rows.length) roster.fail('Assign approved students before finalizing.');
      roster.validate(rows, slots, assignments);
      for (const assignment of assignments) {
        const student = rows.find(row => Number(row.record_id) === Number(assignment.record_id));
        const slot = slots.find(row => row.key === assignment.slot);
        const values = [slot?.battalion || null, slot?.company || null, slot?.platoon || null, slot?.unit || null, slot ? 0 : 1, roster.label(slot)];
        await connection.execute(`UPDATE student_ms_records SET assignment_battalion=?,assignment_company=?,assignment_platoon=?,assignment_special_unit=?,assignment_is_advance=?,assignment_label=? WHERE id=?`, [...values, student.record_id]);
        await require('../services/rotcAssignmentHistoryService').append(connection, { id:student.record_id, assignment_battalion:values[0],assignment_company:values[1],assignment_platoon:values[2],assignment_special_unit:values[3],assignment_is_advance:values[4] }, 'Roster finalized', req.user.email, true);
        // Student columns are the current assignment cache. Older cycles must not overwrite a newer enrollment.
        const [[latest]] = await connection.execute('SELECT id FROM student_ms_records WHERE student_id=? ORDER BY id DESC LIMIT 1', [student.id]);
        if (Number(latest.id) === Number(student.record_id)) {
          await connection.execute(`UPDATE students SET battalion=?,rotc_company=?,rotc_platoon=?,special_unit=?,willing_to_take_advance_course=?,platoon=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [...values, student.id]);
        }
      }
      await connection.execute('UPDATE enrollment_schedules SET platoons_assigned_at=CURRENT_TIMESTAMP WHERE id=?', [schedule.id]);
    }
    await connection.execute(`INSERT INTO rotc_roster_drafts(schedule_id,revision,configuration,assignments,companies,editing) VALUES(?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE revision=VALUES(revision),configuration=VALUES(configuration),assignments=VALUES(assignments),companies=VALUES(companies),editing=VALUES(editing)`,
    [schedule.id, state.revision + 1, JSON.stringify(slots), assignments === null ? null : JSON.stringify(assignments), JSON.stringify(companies), 0]);
    if(action==='finalize') await connection.execute('UPDATE rotc_roster_drafts SET published_configuration=? WHERE schedule_id=?',[JSON.stringify(slots),schedule.id]);
    await connection.commit();
    return res.json({ message: action === 'finalize' ? 'Roster finalized and locked. Only approved Advance Course withdrawals can change assignments.' : action === 'assign' ? 'Students assigned alphabetically. Review before finalizing.' : 'Draft saved. Student assignments have not changed.', revision: state.revision + 1 });
  } catch (error) {
    if (connection) await connection.rollback();
    if (!error.status) console.error('ROTC roster:', error.message);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to update the roster. Please try again.' });
  } finally { if (connection) connection.release(); }
};
exports.assign = (req, res) => { req.body.action = 'assign'; return exports.editor(req, res); };
exports.students = students;
exports.draft = draft;
