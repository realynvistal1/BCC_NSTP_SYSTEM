const db = require('../config/database');
const offenseService = require('../services/offenseService');
const attendanceService = require('../services/attendanceService');
const { decorateAttendanceUpdates } = require('../services/attendanceUpdateService');
const { parsePositiveInt } = require('../services/requestValidationService');

const companies = { 1: ['Alpha','Bravo','Charlie','Delta'], 2: ['Echo','Foxtrot','Golf','Hotel'] };
const specialUnits = ['Medics','HQ','MP'];
const eligible = `EXISTS (SELECT 1 FROM student_ms_records vr
  WHERE vr.student_id=a.verifier_id AND vr.program='ROTC' AND vr.status='approved'
    AND vr.assignment_is_advance=1 AND vr.assignment_special_unit IS NULL
    )
  AND EXISTS (SELECT 1 FROM students vs WHERE vs.id=a.verifier_id
    AND vs.role='student' AND vs.nstp_component='ROTC'
    AND vs.willing_to_take_advance_course=1
    AND (a.special_unit IN ('Medics','HQ','MP')
      OR (a.battalion=1 AND vs.sex='Male') OR (a.battalion=2 AND vs.sex='Female')))`;
const scope = `ses.program='ROTC' AND COALESCE(ses.is_advance_course,0)=0
  AND ses.ms_level=a.ms_level AND ses.school_year=a.school_year
  AND (a.mi_number=0 OR ses.mi_number=a.mi_number)
  AND (a.mi_type='' OR ses.mi_type=a.mi_type)
  AND ar.student_id<>a.verifier_id
  AND EXISTS (SELECT 1 FROM student_ms_records smr
    JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
    WHERE smr.student_id=ar.student_id AND smr.program='ROTC' AND smr.status='approved'
      AND smr.ms_level=a.ms_level AND es.year=a.school_year
      AND ((a.special_unit='' AND smr.assignment_battalion=a.battalion
        AND smr.assignment_company=a.company AND smr.assignment_platoon=a.platoon
        AND smr.assignment_special_unit IS NULL)
        OR (a.special_unit IN ('Medics','HQ','MP') AND smr.assignment_special_unit=a.special_unit))
      AND COALESCE(smr.assignment_is_advance,0)=0)`;
function validAssignment(body) {
  const verifierId=parsePositiveInt(body.verifier_id), battalion=Number(body.battalion), platoon=Number(body.platoon);
  const company=String(body.company||''), level=String(body.ms_level||''), year=String(body.school_year||'');
  const specialUnit=String(body.special_unit||'');
  const miNumber=parsePositiveInt(body.mi_number),miType=String(body.mi_type||'').toLowerCase();
  if (!verifierId || !miNumber || miNumber>15 || !['in','out'].includes(miType)
    || !['1','2'].includes(level) || !/^\d{4}-\d{4}$/.test(year)
    || Number(year.slice(5))!==Number(year.slice(0,4))+1) return null;
  if (specialUnit) return specialUnits.includes(specialUnit) ? [verifierId,0,'',0,level,year,specialUnit,miNumber,miType] : null;
  if (!companies[battalion]?.includes(company) || !Number.isInteger(platoon) || platoon<1 || platoon>4) return null;
  return [verifierId,battalion,company,platoon,level,year,'',miNumber,miType];
}
function endpoint(fn) {
  return async (req,res) => { try { await fn(req,res); } catch(error) {
    if (!error.status) console.error('ROTC verifier:', error.message);
    res.status(error.status||500).json({message:error.status ? error.message : 'Unable to process attendance verification.'});
  } };
}
exports.management = endpoint(async (req,res) => {
  const [assignments]=await db.execute(`SELECT a.*,s.student_id,s.first_name,s.last_name,
    (${eligible}) eligible FROM rotc_verifier_assignments a JOIN students s ON s.id=a.verifier_id
    ORDER BY a.school_year DESC,a.battalion,a.company,a.platoon`);
  const [candidates]=await db.execute(`SELECT DISTINCT s.id,s.student_id,s.first_name,s.last_name,s.sex
    FROM students s JOIN student_ms_records smr ON smr.student_id=s.id
    WHERE s.role='student' AND s.nstp_component='ROTC' AND s.willing_to_take_advance_course=1
      AND smr.program='ROTC' AND smr.status='approved' AND smr.assignment_is_advance=1
      AND smr.assignment_special_unit IS NULL ORDER BY s.last_name,s.first_name`);
  const [cycles]=await db.execute("SELECT ms_level,year school_year FROM enrollment_schedules WHERE program='ROTC' ORDER BY year DESC,ms_level");
  const [sessions]=await db.execute(`SELECT DISTINCT ms_level,school_year,mi_number,mi_type FROM attendance_sessions
    WHERE program='ROTC' AND COALESCE(is_advance_course,0)=0 AND mi_number BETWEEN 1 AND 15
      AND mi_type IN ('in','out') ORDER BY school_year DESC,ms_level,mi_number,mi_type`);
  res.json({assignments,candidates,companies,cycles,specialUnits,sessions});
});
exports.assign = endpoint(async (req,res) => {
  const values=validAssignment(req.body);
  if(!values) return res.status(400).json({message:'Select a verifier, valid group and cycle, MI number, and IN/OUT type.'});
  const [id, , , ,level,year]=values;
  const [candidates]=await db.execute(`SELECT s.id,s.sex FROM students s JOIN student_ms_records smr ON smr.student_id=s.id
    WHERE s.id=? AND s.role='student' AND s.nstp_component='ROTC' AND s.willing_to_take_advance_course=1
      AND smr.program='ROTC' AND smr.status='approved' AND smr.assignment_is_advance=1
      AND smr.assignment_special_unit IS NULL`,[id]);
  if(!candidates.length) return res.status(400).json({message:'The verifier must be an approved Advance Course student.'});
  if(!values[6] && candidates[0].sex!==(values[1]===1?'Male':'Female'))
    return res.status(400).json({message:values[1]===1?'Battalion 1 requires a male Advance Course verifier.':'Battalion 2 requires a female Advance Course verifier.'});
  const [cycles]=await db.execute("SELECT id FROM enrollment_schedules WHERE program='ROTC' AND ms_level=? AND year=?",[level,year]);
  if(!cycles.length) return res.status(400).json({message:'Select an existing ROTC enrollment level and school year.'});
  const [sessions]=await db.execute(`SELECT id FROM attendance_sessions WHERE program='ROTC'
    AND COALESCE(is_advance_course,0)=0 AND ms_level=? AND school_year=? AND mi_number=? AND mi_type=? LIMIT 1`,
    [level,year,values[7],values[8]]);
  if(!sessions.length) return res.status(400).json({message:'Create the matching ROTC attendance session before assigning its verifier.'});
  const connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    // Lock the student across cycles so one verifier cannot receive concurrent active assignments.
    await connection.execute('SELECT id FROM students WHERE id=? FOR UPDATE',[id]);
    const [activeAssignments]=await connection.execute('SELECT id FROM rotc_verifier_assignments WHERE verifier_id=? AND active=1 FOR UPDATE',[id]);
    if(activeAssignments.length) {
      await connection.rollback();
      return res.status(409).json({message:'This student already has an active verifier assignment. Revoke all active assignments before assigning this student again.'});
    }
    // Serialize assignments for this cycle so concurrent requests cannot replace active access.
    await connection.execute('SELECT id FROM enrollment_schedules WHERE id=? FOR UPDATE',[cycles[0].id]);
    const [existing]=await connection.execute(`SELECT id FROM rotc_verifier_assignments
      WHERE battalion=? AND company=? AND platoon=? AND ms_level=? AND school_year=?
        AND special_unit=? AND (mi_number=? OR mi_number=0) AND (mi_type=? OR mi_type='') AND active=1 FOR UPDATE`,values.slice(1));
    if(existing.length) {
      await connection.rollback();
      return res.status(409).json({message:'This group already has a verifier for this attendance session. Choose another group or revoke the current assignment first.'});
    }
    await connection.execute(`INSERT INTO rotc_verifier_assignments
    (verifier_id,battalion,company,platoon,ms_level,school_year,special_unit,mi_number,mi_type,assigned_by) VALUES(?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE verifier_id=VALUES(verifier_id),active=1,assigned_by=VALUES(assigned_by)`,[...values,req.user.email]);
    await connection.commit();
  } catch(error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json({message:'ROTC verifier assigned.'});
});
exports.revoke = endpoint(async (req,res) => {
  const id=parsePositiveInt(req.params.id);
  if(!id) return res.status(400).json({message:'Invalid assignment.'});
  await db.execute('UPDATE rotc_verifier_assignments SET active=0,assigned_by=? WHERE id=?',[req.user.email,id]);
  res.json({message:'Verifier access revoked.'});
});
exports.mine = endpoint(async (req,res) => {
  const [rows]=await db.execute(`SELECT a.* FROM rotc_verifier_assignments a
    WHERE a.verifier_id=? AND a.active=1 AND ${eligible} ORDER BY a.school_year DESC,a.company,a.platoon`,[req.user.id]);
  res.json(rows);
});
exports.records = endpoint(async (req,res) => {
  const id=parsePositiveInt(req.params.id);
  if(!id) return res.status(400).json({message:'Invalid assignment.'});
  const [assignments]=await db.execute(`SELECT a.id FROM rotc_verifier_assignments a
    WHERE a.id=? AND a.verifier_id=? AND a.active=1 AND ${eligible}`,[id,req.user.id]);
  if(!assignments.length) return res.status(403).json({message:'You do not have access to this assigned group.'});
  const rosterScope = scope.replaceAll('ar.student_id','s.id');
  const [records]=await db.execute(`SELECT ar.id,ar.record_version,COALESCE(ar.status,'unmarked') status,ar.claimed_present,ar.false_present,ar.created_at,ar.verified_by,ar.verified_at,
    s.id student_internal_id,s.student_id,s.first_name,s.last_name,ses.id session_id,ses.mi_number,ses.mi_type,ses.open_date,
    (SELECT vl.reason FROM rotc_attendance_verification_log vl WHERE vl.record_id=ar.id ORDER BY vl.id DESC LIMIT 1) reason
    FROM rotc_verifier_assignments a JOIN attendance_sessions ses ON ses.program='ROTC'
    JOIN students s ON s.role='student' AND s.nstp_component='ROTC'
    LEFT JOIN attendance_records ar ON ar.attendance_session_id=ses.id AND ar.student_id=s.id
    WHERE a.id=? AND a.verifier_id=? AND a.active=1 AND ${eligible} AND ${rosterScope}
    ORDER BY ses.open_date DESC,ses.id DESC,s.last_name,s.first_name`,[id,req.user.id]);
  res.json(await decorateAttendanceUpdates(records));
});
exports.verify = endpoint(async (req,res) => {
  const assignmentId=parsePositiveInt(req.body.assignment_id),recordId=parsePositiveInt(req.params.id);
  const status=String(req.body.status||''),reason=String(req.body.reason||'').trim();
  const studentId=parsePositiveInt(req.body.student_id),sessionId=parsePositiveInt(req.body.session_id);
  const missingRecord=Boolean(studentId && sessionId);
  if(!assignmentId || (!recordId && !missingRecord) || !['present','late','absent'].includes(status) || !reason || reason.length>500)
    return res.status(400).json({message:'Select a valid status and enter a reason for the attendance update (up to 500 characters).'});
  const connection=await db.getConnection();
  try {
    const [[owner]]=missingRecord ? [[]] : await connection.execute('SELECT student_id FROM attendance_records WHERE id=?',[recordId]);
    await connection.beginTransaction();
    let targetRecordId=recordId;
    let previous;
    if (missingRecord) {
      await connection.execute('SELECT id FROM students WHERE id=? FOR UPDATE',[studentId]);
      const rosterScope=scope.replaceAll('ar.student_id','s.id');
      const [allowed]=await connection.execute(`SELECT ses.id,ses.mi_number,ses.mi_type,ses.open_date,ses.close_date FROM rotc_verifier_assignments a
        JOIN attendance_sessions ses ON ses.id=? JOIN students s ON s.id=? AND s.role='student' AND s.nstp_component='ROTC'
        WHERE a.id=? AND a.verifier_id=? AND a.active=1 AND ${eligible} AND ${rosterScope} FOR UPDATE`,
        [sessionId,studentId,assignmentId,req.user.id]);
      if (!allowed.length) { const error=new Error('You may only update students in your assigned group and session.');error.status=403;throw error; }
      if (attendanceService.getEffectiveStatus(allowed[0])==='scheduled') { const error=new Error('This attendance session has not opened yet.');error.status=400;throw error; }
      const [[existing]]=await connection.execute('SELECT id FROM attendance_records WHERE student_id=? AND attendance_session_id=? FOR UPDATE',[studentId,sessionId]);
      if (existing) { const error=new Error('Attendance was already recorded. Refresh and review the latest status.');error.status=409;throw error; }
      const [insert]=await connection.execute(`INSERT INTO attendance_records(student_id,attendance_session_id,status,mi_number,mi_type)
        VALUES(?,?,?,?,?)`,[studentId,sessionId,status,allowed[0].mi_number,allowed[0].mi_type]);
      targetRecordId=insert.insertId;
      previous={student_id:studentId,status:'unmarked'};
    } else {
      if(owner) await connection.execute('SELECT id FROM students WHERE id=? FOR UPDATE',[owner.student_id]);
      const [rows]=await connection.execute(`SELECT ar.id,ar.record_version,ar.student_id,ar.status,ar.claimed_present,ar.false_present,ses.open_date,ses.close_date FROM rotc_verifier_assignments a
        JOIN attendance_records ar ON ar.id=? JOIN attendance_sessions ses ON ses.id=ar.attendance_session_id
        WHERE a.id=? AND a.verifier_id=? AND a.active=1 AND ${eligible} AND ${scope} FOR UPDATE`,[recordId,assignmentId,req.user.id]);
      if(!rows.length) { const error=new Error('You may only update attendance records in your assigned group and session.');error.status=403;throw error; }
      previous=rows[0];
      if (attendanceService.getEffectiveStatus(previous)==='scheduled') {
        const error=new Error('This attendance session has not opened yet.');error.status=400;throw error;
      }
      const expectedVersion=req.body.expected_version;
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion<0 || expectedVersion!==Number(previous.record_version)) {
        const error=new Error('This attendance record has changed or the form is outdated. Refresh and review it before saving.');error.status=409;throw error;
      }
    }
    await connection.execute('UPDATE attendance_records SET status=?,verified_by=?,verified_at=NOW(),updated_at=NOW(),record_version=record_version+1 WHERE id=?',[status,req.user.email,targetRecordId]);
    await connection.execute(`INSERT INTO rotc_attendance_verification_log
      (record_id,assignment_id,verifier_id,previous_status,status,reason,verified_at)
      SELECT ?,?,?,?,?,?,verified_at FROM attendance_records WHERE id=?`,[targetRecordId,assignmentId,req.user.id,previous.status,status,reason,targetRecordId]);
    const falseClaim=status==='absent' && (offenseService.isAttendanceClaim(previous) || Number(previous.false_present)===1);
    const newFalseClaim=falseClaim && !Number(previous.false_present);
    let offense=null;
    await connection.execute('UPDATE attendance_records SET false_present=? WHERE id=?',[Number(falseClaim),targetRecordId]);
    if (offenseService.isAttendanceClaim(previous) || previous.false_present) {
      offense=await offenseService.reconcile(previous.student_id,connection,newFalseClaim);
    }
    await connection.commit();
    const message=newFalseClaim
      ? `Attendance updated to Absent. False-attendance offense recorded.${Number(offense?.offend)>=2 && !Number(offense?.settled) ? ' Settlement is required.' : ' First-offense warning recorded.'}`
      : falseClaim
        ? 'Attendance updated to Absent. This false-attendance offense was already recorded; no duplicate offense added.'
        : Number(previous.false_present)
          ? 'Attendance corrected. The false-attendance offense was removed and the offense total was recalculated.'
          : 'Attendance updated successfully. No punishment offense recorded.';
    res.json({message,offense_recorded:newFalseClaim,offense});
  } catch(error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
});
exports.audit = endpoint(async(req,res) => {
  const [rows]=await db.execute(`SELECT l.*,s.student_id,s.first_name,s.last_name,
    v.first_name verifier_first_name,v.last_name verifier_last_name,
    a.battalion,a.company,a.platoon,a.special_unit,ses.ms_level,ses.school_year,ses.mi_number,ses.mi_type
    FROM rotc_attendance_verification_log l JOIN attendance_records ar ON ar.id=l.record_id
    JOIN students s ON s.id=ar.student_id JOIN students v ON v.id=l.verifier_id
    JOIN attendance_sessions ses ON ses.id=ar.attendance_session_id
    JOIN rotc_verifier_assignments a ON a.id=l.assignment_id ORDER BY l.id DESC LIMIT 200`);
  res.json(rows);
});
exports.validAssignment=validAssignment;
