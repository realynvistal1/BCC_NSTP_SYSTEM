const db = require('../config/database');
const roster = require('../services/rotcRosterService');
const editor = require('./rotcRosterController');
const history = require('../services/rotcAssignmentHistoryService');
exports.update = async (req,res) => {
  let connection;
  try {
    const id = Number(req.params.id), status = req.body.status, remarks = String(req.body.admin_remarks || '').trim();
    if (!Number.isSafeInteger(id) || id < 1 || !['approved','rejected'].includes(status) || remarks.length > 1000 || (status === 'rejected' && !remarks)) roster.fail('Enter a valid withdrawal action and remarks.');
    connection = await db.getConnection(); await connection.beginTransaction();
    // Find the cycle first, then lock it before locking the request, matching roster finalization lock order.
    const [[candidate]] = await connection.execute(`SELECT r.schedule_id FROM advance_course_withdrawals w
      JOIN student_ms_records r ON r.student_id=w.student_id AND r.program='ROTC' AND r.status='approved'
      WHERE w.id=? ORDER BY r.id DESC LIMIT 1`, [id]);
    if (!candidate) roster.fail('No approved ROTC enrollment found for this request.');
    const [[schedule]] = await connection.execute('SELECT * FROM enrollment_schedules WHERE id=? FOR UPDATE', [candidate.schedule_id]);
    const [[request]] = await connection.execute(`SELECT w.*,s.sex FROM advance_course_withdrawals w JOIN students s ON s.id=w.student_id WHERE w.id=? AND w.status='pending' FOR UPDATE`, [id]);
    if (!request) roster.fail('Withdrawal request already processed or not found.');
    if (status === 'approved') {
      if (!schedule?.platoons_assigned_at) roster.fail('Finalize the roster before processing an Advance Course transfer.');
      const [[record]] = await connection.execute("SELECT * FROM student_ms_records WHERE student_id=? AND program='ROTC' AND status='approved' ORDER BY id DESC LIMIT 1 FOR UPDATE", [request.student_id]);
      if (Number(record.assignment_is_advance) !== 1 || record.assignment_special_unit) roster.fail('This student is no longer assigned to Advance Course.');
      const state = await editor.draft(connection, schedule.id);
      const battalion=request.sex==='Male'?1:request.sex==='Female'?2:0;
      if(!battalion)roster.fail('Student sex must be Male or Female before approving this transfer.');
      const publishedSlots=state.published_configuration||state.configuration;
      const slots = publishedSlots.filter(slot => !slot.unit && slot.battalion === battalion);
      const [members] = await connection.execute(`SELECT assignment_battalion,assignment_company,assignment_platoon FROM student_ms_records WHERE program='ROTC' AND CAST(schedule_id AS UNSIGNED)=? AND status='approved' AND assignment_special_unit IS NULL AND COALESCE(assignment_is_advance,0)=0 FOR UPDATE`, [schedule.id]);
      const slot = slots.find(slot => members.filter(member => Number(member.assignment_battalion) === slot.battalion && member.assignment_company === slot.company && Number(member.assignment_platoon) === slot.platoon).length < slot.capacity);
      if (!slot) roster.fail('No regular platoon has available capacity. Withdrawal remains pending.');
      await history.append(connection, record, 'Before Advance Course withdrawal', req.user.email, true);
      await connection.execute(`UPDATE student_ms_records SET assignment_battalion=?,assignment_company=?,assignment_platoon=?,assignment_special_unit=NULL,assignment_is_advance=0,assignment_label=? WHERE id=?`, [slot.battalion,slot.company,slot.platoon,roster.label(slot),record.id]);
      if(state.assignments) {
        const assignment=state.assignments.find(row=>Number(row.record_id)===Number(record.id));
        if(assignment)assignment.slot=slot.key;
        await connection.execute('UPDATE rotc_roster_drafts SET assignments=?,revision=revision+1 WHERE schedule_id=?',[JSON.stringify(state.assignments),schedule.id]);
      }
      await history.append(connection, {...record,assignment_battalion:slot.battalion,assignment_company:slot.company,assignment_platoon:slot.platoon,assignment_special_unit:null,assignment_is_advance:0}, 'Approved Advance Course withdrawal',req.user.email);
      const [[latest]] = await connection.execute('SELECT id FROM student_ms_records WHERE student_id=? ORDER BY id DESC LIMIT 1', [request.student_id]);
      if (Number(latest.id) === Number(record.id)) await connection.execute(`UPDATE students SET battalion=?,rotc_company=?,rotc_platoon=?,special_unit=NULL,willing_to_take_advance_course=0,platoon=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [slot.battalion,slot.company,slot.platoon,roster.label(slot),request.student_id]);
    }
    await connection.execute('UPDATE advance_course_withdrawals SET status=?,admin_remarks=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [status,remarks || null,id]);
    await connection.commit();
    return res.json({message:status === 'approved' ? 'Withdrawal approved. Student transferred to an available regular platoon. Published roster updated.' : 'Withdrawal rejected.'});
  } catch(error) {
    if(connection) await connection.rollback();
    if(!error.status) console.error('ROTC withdrawal:',error.message);
    return res.status(error.status || 500).json({message:error.status ? error.message : 'Unable to process withdrawal.'});
  } finally { if(connection) connection.release(); }
};
