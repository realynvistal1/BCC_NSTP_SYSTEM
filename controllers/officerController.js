const path = require('path');
const db = require('../config/database');
const { decorateAttendanceUpdates } = require('../services/attendanceUpdateService');
const attendance = require('../services/attendanceService');
const certificateService = require('../services/certificateService');
const offenseService = require('../services/offenseService');
const platoonService = require('../services/platoonService');
const {
  parsePositiveInt,
  readLevel,
  readSchoolYear,
  readSearchTerm,
  readLimitedText,
} = require('../services/requestValidationService');

async function officerApprovedRecordRows(programCode, filters = {}) {
  const msLevel = readLevel(filters.msLevel, { allowBlank: true });
  const schoolYear = readSchoolYear(filters.schoolYear, { allowBlank: true });
  const search = readSearchTerm(filters.search, { allowBlank: true });
  const company = readLimitedText(filters.company, 30);
  const photoColumn = filters.includePhoto ? ',s.photo' : '';

  if (msLevel === null || schoolYear === null || search === null || company === null) {
    return [];
  }

  const query = `%${String(search || '').replace(/[!%_]/g, '!$&')}%`;
  const [rows] = await db.execute(
    `SELECT smr.id record_id,smr.ms_level,smr.status,smr.program,smr.created_at,
            COALESCE(es.year,'') school_year,
            s.id student_db_id,s.student_id,s.first_name,s.middle_name,s.last_name,s.suffix,
            s.course,s.year_level,s.nstp_component,s.sex,s.birthdate,s.email,s.contact_number,
            s.place_of_birth,s.religion,s.height,s.weight,s.blood_type,s.complexion${photoColumn},
            s.temporary_barangay,s.temporary_municipality,s.temporary_province,
            s.permanent_barangay,s.permanent_municipality,s.permanent_province,
            s.father_name,s.father_occupation,s.mother_name,s.mother_occupation,
            s.emergency_contact_name,s.emergency_contact_address,s.emergency_contact_relationship,s.emergency_contact_contact_number,
            s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,s.willing_to_take_advance_course,
            s.serial_number,
            g.midterm,g.final_term,g.grade,g.status grade_status
     FROM student_ms_records smr
     JOIN students s ON s.id=smr.student_id
     LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
     LEFT JOIN student_grades g ON g.student_id=s.id AND g.program=smr.program AND g.ms_level=smr.ms_level
     WHERE smr.program=?
       AND smr.status='approved'
       AND s.role='student'
       AND (?='' OR smr.ms_level=?)
       AND (?='' OR COALESCE(es.year,'')=?)
       AND (
         ?=''
         OR s.student_id LIKE ? ESCAPE '!'
         OR s.first_name LIKE ? ESCAPE '!'
         OR s.middle_name LIKE ? ESCAPE '!'
         OR s.last_name LIKE ? ESCAPE '!'
         OR s.course LIKE ? ESCAPE '!'
       )
     ORDER BY s.last_name,s.first_name,smr.ms_level`,
    [programCode, msLevel, msLevel, schoolYear, schoolYear, search, query, query, query, query, query]
  );

  return rows.filter((row) => (
    !company || String(programCode === 'CWTS' ? row.company : row.rotc_company || '') === company
  ));
}

function readAttendanceProgram(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (['ROTC', 'CWTS', 'ADVANCE_COURSE'].includes(normalized)) {
    return normalized;
  }
  return null;
}

function sessionLabel(session) {
  const unit = session.program === 'CWTS' ? 'CS' : 'MI';
  return `${unit} ${session.mi_number || '-'} ${(session.mi_type || '').toUpperCase()}`.trim();
}

function rosterScope(group) {
  if (group === 'cwts') {
    return { group: 'cwts', recordProgram: 'CWTS' };
  }

  if (group === 'advance-course') {
    return { group: 'advance-course', recordProgram: 'ROTC' };
  }

  if (group === 'special-platoon') {
    return { group: 'special-platoon', recordProgram: 'ROTC' };
  }

  if (group === 'battalion-1') {
    return { group: 'battalion-1', recordProgram: 'ROTC' };
  }

  if (group === 'battalion-2') {
    return { group: 'battalion-2', recordProgram: 'ROTC' };
  }

  return { group: 'rotc', recordProgram: 'ROTC' };
}

async function approvedStudentsForSession(session, { includeCompleted = false } = {}) {
  const schoolYear = String(session.school_year || '').trim();
  const isAdvanceCourse = Number(session.program === 'ROTC' && Number(session.is_advance_course || 0) === 1 ? 1 : 0);

  const [rows] = await db.execute(
    `SELECT s.id,s.student_id,s.first_name,s.middle_name,s.last_name,s.course,s.year_level,s.sex,
            s.nstp_component,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,
            s.willing_to_take_advance_course,s.serial_number
     FROM students s
     WHERE s.role='student'
       AND s.nstp_component=?
       AND EXISTS (
         SELECT 1
         FROM student_ms_records smr
         LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
         WHERE smr.student_id=s.id
           AND smr.program=?
           AND smr.ms_level=?
           AND smr.status='approved'
           AND (?='' OR es.year=? OR es.year IS NULL)
       )
       AND (
         ?<>'ROTC'
         OR (?=1 AND s.willing_to_take_advance_course=1 AND s.special_unit IS NULL AND COALESCE(s.has_medical_condition,0)=0)
         OR (?=0 AND NOT (s.willing_to_take_advance_course=1 AND s.special_unit IS NULL AND COALESCE(s.has_medical_condition,0)=0))
       )
     ORDER BY s.last_name,s.first_name`,
    [
      session.program,
      session.program,
      String(session.ms_level || '1'),
      schoolYear,
      schoolYear,
      session.program,
      isAdvanceCourse,
      isAdvanceCourse,
    ]
  );

  // Keep completed students out of automatic absence/offense processing, but
  // allow the Director's historical attendance view to include them.
  return includeCompleted
    ? rows
    : rows.filter((student) => !student.serial_number);
}

async function markMissingAbsent(session) {
  const students = await approvedStudentsForSession(session);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    students.sort((a,b) => Number(a.id)-Number(b.id));
    for (const student of students) {
      await connection.execute('SELECT id FROM students WHERE id=? FOR UPDATE', [student.id]);
      await connection.execute("INSERT IGNORE INTO attendance_records(student_id,attendance_session_id,status,mi_number,mi_type) VALUES(?,?,'absent',?,?)", [student.id,session.id,session.mi_number,session.mi_type]);
    }
    await connection.execute("UPDATE attendance_sessions SET status='closed',attendance_finalized_at=NOW() WHERE id=?", [session.id]);
    await connection.commit();
  } catch(error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function refreshSessionStatuses() {
  // Retry closed sessions too, repairing incomplete closures from older versions.
  const [rows] = await db.execute("SELECT * FROM attendance_sessions WHERE status<>'closed' OR attendance_finalized_at IS NULL");
  const now = new Date();
  for (const session of rows) {
    const effective = attendance.getEffectiveStatus(session, now);
    if (effective === 'closed') await markMissingAbsent(session);
    else {
      const status = effective === 'scheduled' ? 'scheduled' : 'open';
      if (status !== session.status) await db.execute('UPDATE attendance_sessions SET status=? WHERE id=?', [status,session.id]);
    }
  }
}

async function currentCycle(program) {
  const [schedules] = await db.execute(
    'SELECT * FROM enrollment_schedules WHERE program=? ORDER BY open_date ASC,id ASC',
    [program]
  );

  if (!schedules.length) {
    return {
      ms_level: null,
      school_year: attendance.normalizeCycleSchoolYear(null),
    };
  }

  const now = Date.now();
  const active = schedules.find((row) => {
    const start = new Date(row.open_date).getTime();
    const end = new Date(row.deadline).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
  });

  if (active) {
    return {
      ms_level: String(active.ms_level),
      school_year: active.year,
    };
  }

  const upcoming = schedules.find((row) => new Date(row.deadline).getTime() >= now);
  if (upcoming) {
    return {
      ms_level: String(upcoming.ms_level),
      school_year: upcoming.year,
    };
  }

  const latest = [...schedules].sort(
    (a, b) => new Date(b.deadline) - new Date(a.deadline)
  )[0];

  return {
    ms_level: String(latest.ms_level),
    school_year: latest.year,
  };
}

async function dashboardScheduleFor(program) {
  const [schedules] = await db.execute(
    `SELECT id, program, ms_level, year, open_date, deadline
     FROM enrollment_schedules
     WHERE program=?
     ORDER BY id DESC`,
    [program]
  );

  if (!schedules.length) return null;

  const now = Date.now();
  const active = schedules.find((schedule) => {
    const start = new Date(schedule.open_date).getTime();
    const end = new Date(schedule.deadline).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
  });

  if (active) return active;

  const upcoming = schedules.find((schedule) => {
    const end = new Date(schedule.deadline).getTime();
    return Number.isFinite(end) && end >= now;
  });

  if (upcoming) return upcoming;

  return schedules[0];
}

function sameAttendanceTrack(session, program, isAdvance, cycle) {
  if (session.program !== program) return false;

  if (
    program === 'ROTC'
    && Boolean(Number(session.is_advance_course || 0)) !== Boolean(isAdvance)
  ) {
    return false;
  }

  if (cycle.ms_level && String(session.ms_level || '') !== String(cycle.ms_level)) {
    return false;
  }

  if (cycle.school_year && String(session.school_year || '') !== String(cycle.school_year)) {
    return false;
  }

  return true;
}

exports.dashboard = async (req, res) => {
  try {
    await refreshSessionStatuses();

    const rotcSchedule = await dashboardScheduleFor('ROTC');
    const cwtsSchedule = await dashboardScheduleFor('CWTS');

    const rotcScheduleId = rotcSchedule ? Number(rotcSchedule.id) : null;
    const cwtsScheduleId = cwtsSchedule ? Number(cwtsSchedule.id) : null;

    const [[summary]] = await db.execute(`
      SELECT
        (SELECT COUNT(DISTINCT s.id)
         FROM students s
         WHERE s.role='student'
           AND s.nstp_component='ROTC'
           AND EXISTS (
             SELECT 1
             FROM student_ms_records smr
             WHERE smr.student_id=s.id
               AND smr.program='ROTC'
               AND smr.status='approved'
               AND (? IS NULL OR CAST(smr.schedule_id AS UNSIGNED)=?)
           )
        ) rotc,
        (SELECT COUNT(DISTINCT s.id)
         FROM students s
         WHERE s.role='student'
           AND s.nstp_component='CWTS'
           AND EXISTS (
             SELECT 1
             FROM student_ms_records smr
             WHERE smr.student_id=s.id
               AND smr.program='CWTS'
               AND smr.status='approved'
               AND (? IS NULL OR CAST(smr.schedule_id AS UNSIGNED)=?)
           )
        ) cwts,
        (SELECT COUNT(*) FROM attendance_sessions WHERE status='open') open_sessions,
        (SELECT COUNT(*) FROM attendance_records) attendance_records
    `, [rotcScheduleId, rotcScheduleId, cwtsScheduleId, cwtsScheduleId]);

    return res.json(summary);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
  }
};

exports.attendanceProgress = async (req, res) => {
  try {
    await refreshSessionStatuses();

    const rawProgram = readAttendanceProgram(req.query.program);
    const isAdvance = rawProgram === 'ADVANCE_COURSE';
    const program = isAdvance ? 'ROTC' : rawProgram;

    if (!program) {
      return res.status(400).json({
        message: 'Select ROTC, CWTS, or Advance Course.',
      });
    }

    const cycle = await currentCycle(program);
    const [sessions] = await db.execute(
      'SELECT * FROM attendance_sessions ORDER BY created_at ASC,id ASC'
    );
    const filtered = sessions.filter((session) => (
      sameAttendanceTrack(session, program, isAdvance, cycle)
    ));
    const nonClosedSessions = filtered
      .map((session) => ({
        ...session,
        effective_status: attendance.getEffectiveStatus(session),
      }))
      .filter((session) => session.effective_status !== 'closed');
    const blockingSession = nonClosedSessions.find((session) => (
      ['open', 'late'].includes(session.effective_status)
    )) || nonClosedSessions[0] || null;

    const progress = Array.from({ length: attendance.SESSION_COUNT }, (_, index) => {
      const mi = index + 1;
      const incoming = filtered.find(
        (session) => Number(session.mi_number) === mi && session.mi_type === 'in'
      );
      const outgoing = filtered.find(
        (session) => Number(session.mi_number) === mi && session.mi_type === 'out'
      );

      return {
        number: mi,
        in: incoming
          ? { ...incoming, effective_status: attendance.getEffectiveStatus(incoming) }
          : null,
        out: outgoing
          ? { ...outgoing, effective_status: attendance.getEffectiveStatus(outgoing) }
          : null,
      };
    });

    return res.json({
      program: rawProgram,
      actual_program: program,
      cycle,
      radius_meters: attendance.ATTENDANCE_RADIUS_METERS,
      late_minutes: attendance.LATE_THRESHOLD_MINUTES,
      blocking_session: blockingSession
        ? {
          id: blockingSession.id,
          program: blockingSession.program,
          is_advance_course: Number(blockingSession.is_advance_course || 0),
          mi_number: blockingSession.mi_number,
          mi_type: blockingSession.mi_type,
          effective_status: blockingSession.effective_status,
          open_date: blockingSession.open_date,
          close_date: blockingSession.close_date,
          late_deadline: attendance.lateDeadline(blockingSession.close_date),
        }
        : null,
      progress,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
  }
};

exports.createAttendance = async (req, res) => {
  try {
    await refreshSessionStatuses();

    const body = req.body;
    const rawProgram = readAttendanceProgram(body.program);
    const isAdvance = rawProgram === 'ADVANCE_COURSE' || Boolean(body.is_advance_course);
    const program = isAdvance ? 'ROTC' : rawProgram;

    if (!program) {
      return res.status(400).json({
        message: 'Select ROTC, CWTS, or Advance Course.',
      });
    }

    const miNumber = Number(body.mi_number);
    const miType = String(body.mi_type || '').toLowerCase();

    if (
      !Number.isInteger(miNumber)
      || miNumber < 1
      || miNumber > attendance.SESSION_COUNT
    ) {
      return res.status(400).json({
        message: `Select a valid ${program === 'CWTS' ? 'CS' : 'MI'} number from 1 to ${attendance.SESSION_COUNT}.`,
      });
    }

    if (!['in', 'out'].includes(miType)) {
      return res.status(400).json({ message: 'Select Time In or Time Out.' });
    }

    const open = new Date(body.open_date);
    const close = new Date(body.close_date);

    if (Number.isNaN(open.getTime()) || Number.isNaN(close.getTime()) || close <= open) {
      return res.status(400).json({
        message: 'Attendance closing time must be later than opening time.',
      });
    }

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({
        message: 'Capture or enter a valid attendance location.',
      });
    }

    const cycle = await currentCycle(program);
    const msLevel = body.ms_level == null || String(body.ms_level).trim() === ''
      ? cycle.ms_level
      : readLevel(body.ms_level);
    const schoolYear = body.school_year || cycle.school_year;

    if (msLevel === null) {
      return res.status(400).json({
        message: 'Select a valid MS/CWTS level.',
      });
    }

    const [nonClosedSessions] = await db.execute(
      `SELECT * FROM attendance_sessions
       WHERE status<>'closed' AND program=? AND COALESCE(is_advance_course,0)=?
       ORDER BY open_date ASC,id ASC`,
      [program, isAdvance ? 1 : 0]
    );
    const blockingSession = nonClosedSessions
      .map((session) => ({
        ...session,
        effective_status: attendance.getEffectiveStatus(session),
      }))
      .find((session) => session.effective_status !== 'closed');

    if (blockingSession) {
      const blockingProgram = Number(blockingSession.is_advance_course || 0) === 1
        ? 'Advance Course'
        : blockingSession.program;
      const blockingState = blockingSession.effective_status === 'scheduled'
        ? 'scheduled'
        : 'still active';
      return res.status(409).json({
        message: `${blockingProgram} ${sessionLabel(blockingSession)} attendance is ${blockingState}. It must close, including the 15-minute late period, before another ${blockingProgram} attendance can be created.`,
        blocking_session_id: blockingSession.id,
      });
    }

    const [existing] = await db.execute(
      `SELECT * FROM attendance_sessions
       WHERE program=? AND COALESCE(ms_level,'')=COALESCE(?, '') AND COALESCE(school_year,'')=COALESCE(?, '')
         AND COALESCE(is_advance_course,0)=? AND mi_number=?
       ORDER BY id ASC`,
      [program, msLevel, schoolYear, isAdvance ? 1 : 0, miNumber]
    );

    const inSession = existing.find((row) => row.mi_type === 'in');
    const outSession = existing.find((row) => row.mi_type === 'out');
    const unit = program === 'CWTS' ? 'CS' : 'MI';

    if (miType === 'in' && inSession) {
      return res.status(409).json({
        message: `${unit} ${miNumber} IN already exists.`,
      });
    }

    if (miType === 'out') {
      if (!inSession) {
        return res.status(400).json({
          message: `${unit} ${miNumber} OUT cannot be created before IN.`,
        });
      }

      if (attendance.getEffectiveStatus(inSession) !== 'closed') {
        return res.status(400).json({
          message: `${unit} ${miNumber} IN must finish, including the 15-minute late period, before OUT can be created.`,
        });
      }

      if (outSession) {
        return res.status(409).json({
          message: `${unit} ${miNumber} OUT already exists.`,
        });
      }
    }

    if (miNumber > 1) {
      const previous = miNumber - 1;
      const [prior] = await db.execute(
        `SELECT mi_type FROM attendance_sessions
         WHERE program=? AND COALESCE(ms_level,'')=COALESCE(?, '') AND COALESCE(school_year,'')=COALESCE(?, '')
           AND COALESCE(is_advance_course,0)=? AND mi_number=?`,
        [program, msLevel, schoolYear, isAdvance ? 1 : 0, previous]
      );

      const priorTypes = new Set(prior.map((row) => row.mi_type));
      if (!priorTypes.has('in') || !priorTypes.has('out')) {
        return res.status(400).json({
          message: `Complete ${unit} ${previous} IN and OUT before creating ${unit} ${miNumber}.`,
        });
      }
    }

    const effective = attendance.getEffectiveStatus({
      open_date: body.open_date,
      close_date: body.close_date,
    });

    const dbStatus = effective === 'scheduled'
      ? 'scheduled'
      : effective === 'closed'
        ? 'closed'
        : 'open';

    const [result] = await db.execute(
      `INSERT INTO attendance_sessions
       (program,ms_level,is_advance_course,school_year,mi_number,mi_type,open_date,close_date,latitude,longitude,radius_meters,status,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        program,
        msLevel || null,
        isAdvance ? 1 : 0,
        schoolYear || null,
        miNumber,
        miType,
        body.open_date,
        body.close_date,
        latitude,
        longitude,
        attendance.ATTENDANCE_RADIUS_METERS,
        dbStatus,
        req.user.email,
      ]
    );

    if (dbStatus === 'closed') {
      const [[created]] = await db.execute(
        'SELECT * FROM attendance_sessions WHERE id=?',
        [result.insertId]
      );
      await markMissingAbsent(created);
    }

    return res.status(201).json({
      message: `${unit} ${miNumber} ${miType.toUpperCase()} attendance created successfully.`,
      id: result.insertId,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
  }
};

exports.sessions = async (req, res) => {
  try {
    await refreshSessionStatuses();

    const [rows] = await db.execute(
      'SELECT * FROM attendance_sessions ORDER BY created_at DESC,id DESC'
    );

    return res.json(
      rows.map((session) => ({
        ...session,
        effective_status: attendance.getEffectiveStatus(session),
        late_deadline: attendance.lateDeadline(session.close_date),
      }))
    );
  } catch (error) {
    return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
  }
};

exports.sessionRecords = async (req, res) => {
  try {
    await refreshSessionStatuses();
    const sessionId = parsePositiveInt(req.params.id);

    if (!sessionId) {
      return res.status(400).json({ message: 'Select a valid attendance session.' });
    }

    const [[session]] = await db.execute(
      'SELECT * FROM attendance_sessions WHERE id=?',
      [sessionId]
    );

    if (!session) {
      return res.status(404).json({ message: 'Attendance session not found.' });
    }

    const students = await approvedStudentsForSession(session, { includeCompleted: true });
    const [records] = await db.execute(
      'SELECT * FROM attendance_records WHERE attendance_session_id=?',
      [session.id]
    );
    const recordByStudent = new Map(
      records.map((record) => [Number(record.student_id), record])
    );
    const effectiveStatus = attendance.getEffectiveStatus(session);
    const graceOver = effectiveStatus === 'closed';

    const output = await decorateAttendanceUpdates(students.map((student) => {
      const record = recordByStudent.get(Number(student.id));
      return {
        ...student,
        record_id: record?.id || null,
        attendance_status: record?.status || (graceOver ? 'absent' : 'unmarked'),
        attendance_time: record?.created_at || null,
        attendance_latitude: record?.latitude ?? null,
        attendance_longitude: record?.longitude ?? null,
        distance_meters: record?.distance_meters ?? null,
        verified_by: record?.verified_by ?? null,
        verified_at: record?.verified_at ?? null,
      };
    }));

    const counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
    output.forEach((student) => {
      counts[student.attendance_status] = (counts[student.attendance_status] || 0) + 1;
    });

    return res.json({
      session: {
        ...session,
        effective_status: effectiveStatus,
        late_deadline: attendance.lateDeadline(session.close_date),
      },
      students: output,
      counts,
      total: output.length,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
  }
};

exports.setAttendance = async (req, res) => {
  try {
    const sessionId = parsePositiveInt(req.params.id);
    const studentId = parsePositiveInt(req.body.student_id);
    const status = String(req.body.status || '').toLowerCase();

    if (!sessionId || !studentId || !['present', 'late', 'absent'].includes(status)) {
      return res.status(400).json({
        message: 'Select a student and valid attendance status.',
      });
    }

    const [[session]] = await db.execute(
      'SELECT * FROM attendance_sessions WHERE id=?',
      [sessionId]
    );

    if (!session) {
      return res.status(404).json({ message: 'Attendance session not found.' });
    }

    const offense = await offenseService.saveAttendance(studentId, session, status, req.user.email);

    return res.json({
      message: offense
        ? (
          Number(offense.offend) >= 2
            ? "Attendance updated to Absent. This is the student's second offense and requires settlement."
            : 'Attendance updated to Absent. A first-offense warning was recorded for the student.'
        )
        : 'Attendance status updated.',
      offense,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const recordId = parsePositiveInt(req.params.id);
    const status = String(req.body.status || '').toLowerCase();

    if (!recordId || !['present', 'late', 'absent'].includes(status)) {
      return res.status(400).json({ message: 'Invalid attendance status.' });
    }

    const [[before]] = await db.execute(
      'SELECT student_id,status FROM attendance_records WHERE id=?',
      [recordId]
    );

    if (!before) {
      return res.status(404).json({ message: 'Attendance record not found.' });
    }

    const [[session]] = await db.execute('SELECT ses.* FROM attendance_sessions ses JOIN attendance_records ar ON ar.attendance_session_id=ses.id WHERE ar.id=?', [recordId]);
    const offense = await offenseService.saveAttendance(before.student_id, session, status, req.user.email);

    return res.json({
      message: offense
        ? (
          Number(offense.offend) >= 2
            ? 'Attendance updated. Second offense recorded; settlement is required.'
            : 'Attendance updated. First-offense warning recorded.'
        )
        : 'Attendance status updated.',
      offense,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
  }
};

exports.roster = async (req, res) => {
  try {
    const scope = rosterScope(String(req.params.group || '').toLowerCase());

    const [records] = await db.execute(
      `SELECT s.id,s.student_id,s.first_name,s.last_name,s.course,s.year_level,s.sex,s.nstp_component,
              smr.id record_id,smr.ms_level,COALESCE(es.year,'') school_year,
              smr.assignment_company company,smr.assignment_battalion battalion,
              smr.assignment_company rotc_company,smr.assignment_platoon rotc_platoon,
              smr.assignment_special_unit special_unit,
              COALESCE(smr.assignment_is_advance,0) willing_to_take_advance_course
       FROM student_ms_records smr
       JOIN students s ON s.id=smr.student_id
       LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
       WHERE s.role='student' AND smr.program=? AND smr.status='approved'
         AND (
           (smr.program='CWTS' AND NULLIF(TRIM(smr.assignment_company),'') IS NOT NULL)
           OR (smr.program='ROTC' AND es.platoons_assigned_at IS NOT NULL AND (
             (smr.assignment_battalion IS NOT NULL
              AND NULLIF(TRIM(smr.assignment_company),'') IS NOT NULL
              AND smr.assignment_platoon IS NOT NULL)
             OR smr.assignment_is_advance=1
             OR smr.assignment_special_unit IN ('Medics','HQ','MP')
           ))
         )
         AND (
           ? IN ('cwts','rotc')
           OR (?='advance-course' AND smr.assignment_is_advance=1 AND smr.assignment_special_unit IS NULL)
           OR (?='special-platoon' AND smr.assignment_special_unit IN ('Medics','HQ','MP'))
           OR (?='battalion-1' AND smr.assignment_battalion=1 AND COALESCE(smr.assignment_is_advance,0)=0 AND smr.assignment_special_unit IS NULL)
           OR (?='battalion-2' AND smr.assignment_battalion=2 AND COALESCE(smr.assignment_is_advance,0)=0 AND smr.assignment_special_unit IS NULL)
         )
       ORDER BY s.last_name,s.first_name,s.id,smr.created_at DESC,smr.id DESC`,
      [scope.recordProgram,scope.group,scope.group,scope.group,scope.group,scope.group]
    );
    const students = new Map();
    for (const record of records) {
      if (!students.has(record.id)) students.set(record.id, { ...record, enrollments: [] });
      students.get(record.id).enrollments.push(record);
    }
    const rows = [...students.values()];

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
  }
};

exports.enrollments = async (req, res) => {
  try {
    const rotcSchedule = await dashboardScheduleFor('ROTC');
    const cwtsSchedule = await dashboardScheduleFor('CWTS');

    const [rows] = await db.execute(
      `SELECT smr.id record_id,smr.ms_level,smr.status,smr.program,smr.created_at,
              CAST(smr.schedule_id AS UNSIGNED) schedule_id,
              s.student_id,s.first_name,s.middle_name,s.last_name,s.course,s.year_level,
              s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,
              CASE
                WHEN s.nstp_component='CWTS' THEN COALESCE(CONCAT('Company ',s.company),'Not assigned')
                WHEN s.special_unit IS NOT NULL THEN s.special_unit
                WHEN s.battalion IS NOT NULL THEN CONCAT('Battalion ',s.battalion,' / ',COALESCE(s.rotc_company,''),' / Platoon ',COALESCE(s.rotc_platoon,''))
                 ELSE 'Not assigned'
               END assignment
         FROM student_ms_records smr
         JOIN students s ON s.id=smr.student_id
         WHERE s.role='student'
         ORDER BY smr.created_at DESC, s.last_name,s.first_name`
      );

    const filtered = rows.filter((row) => {
      if (row.program === 'ROTC') {
        return !rotcSchedule || Number(row.schedule_id || 0) === Number(rotcSchedule.id);
      }

      if (row.program === 'CWTS') {
        return !cwtsSchedule || Number(row.schedule_id || 0) === Number(cwtsSchedule.id);
      }

      return true;
    });

      return res.json({
        rotc: filtered.filter((row) => row.program === 'ROTC'),
        cwts: filtered.filter((row) => row.program === 'CWTS'),
      });
    } catch (error) {
      return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
    }
  };

exports.records = async (req, res) => {
  try {
    const [rotcRows, cwtsRows] = await Promise.all([
      officerApprovedRecordRows('ROTC'),
      officerApprovedRecordRows('CWTS'),
    ]);

    return res.json([...rotcRows, ...cwtsRows]);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
  }
};

exports.downloadRecordProfiles = async (req, res) => {
  try {
    const programCode = String(req.query.program || '').trim().toUpperCase();
    const msLevel = readLevel(req.query.ms_level, { allowBlank: true });
    const schoolYear = readSchoolYear(req.query.school_year, { allowBlank: true });
    const search = readSearchTerm(req.query.search, { allowBlank: true });
    const company = readLimitedText(req.query.company, 30);
    const commandantNameInput = readLimitedText(req.query.commandant_name, 100);
    const commandantName = commandantNameInput === null
      ? null
      : commandantNameInput.replace(/\s+/g, ' ');

    if (!['ROTC', 'CWTS'].includes(programCode)) {
      return res.status(400).json({ message: 'Select ROTC or CWTS before downloading.' });
    }
    if (msLevel === null) {
      return res.status(400).json({ message: 'Select a valid enrollment level.' });
    }
    if (schoolYear === null) {
      return res.status(400).json({ message: 'Select a valid school year.' });
    }
    if (search === null || company === null) {
      return res.status(400).json({ message: 'Search text is too long.' });
    }
    if (programCode === 'ROTC' && !commandantName) {
      return res.status(400).json({ message: 'Enter a valid commandant name before downloading.' });
    }

    const filters = { msLevel, schoolYear, search, company, commandantName, includePhoto: true };
    const rows = await officerApprovedRecordRows(programCode, filters);

    if (!rows.length) {
      return res.status(404).json({ message: 'No approved student records matched the selected filters.' });
    }

    return await certificateService.registrationFormsPdf(res, {
      records: rows,
      program: programCode,
      assets: path.join(__dirname, '../public/images'),
      filters,
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
    }
  }
};

exports.recordFilterOptions = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT program,ms_level,year
       FROM enrollment_schedules
       ORDER BY year DESC,program ASC,ms_level ASC,id DESC`
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
  }
};

exports.recordDetail = async (req, res) => {
  try {
    const programCode = String(req.query.program || '').toUpperCase();
    const studentId = parsePositiveInt(req.params.studentId);
    const level = readLevel(req.query.ms_level || '1');

    if (!['ROTC', 'CWTS'].includes(programCode)) {
      return res.status(400).json({ message: 'Valid program is required.' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Select a valid student.' });
    }

    if (!level) {
      return res.status(400).json({ message: 'Select a valid enrollment level.' });
    }

    const [[student]] = await db.execute(
      "SELECT * FROM students WHERE id=? AND nstp_component=? AND role='student' LIMIT 1",
      [studentId, programCode]
    );

    if (!student) {
      return res.status(404).json({ message: 'Student record not found.' });
    }

    const [[cycle]] = await db.execute(
      `SELECT smr.*,COALESCE(es.year,'') school_year
       FROM student_ms_records smr
       LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
       WHERE smr.student_id=? AND smr.program=? AND smr.ms_level=?
       ORDER BY smr.created_at DESC
       LIMIT 1`,
      [studentId, programCode, level]
    );

    if (!cycle) {
      return res.status(404).json({ message: 'Enrollment cycle not found.' });
    }

    const [grades] = await db.execute(
      'SELECT * FROM student_grades WHERE student_id=? AND program=? ORDER BY ms_level',
      [studentId, programCode]
    );

    const schoolYear = String(cycle.school_year || '').trim();

    const [attendance] = await db.execute(
      `SELECT ar.id,ar.status,ar.created_at,ar.distance_meters,ar.latitude,ar.longitude,
              ses.mi_number,ses.mi_type,ses.open_date,ses.close_date,ses.school_year,ses.ms_level
       FROM attendance_records ar
       JOIN attendance_sessions ses ON ses.id=ar.attendance_session_id
       WHERE ar.student_id=? AND ses.program=? AND (ses.ms_level=? OR ses.ms_level IS NULL)
         AND (?='' OR ses.school_year=? OR ses.school_year IS NULL)
       ORDER BY ses.mi_number,FIELD(ses.mi_type,'in','out'),ar.created_at`,
      [studentId, programCode, level, schoolYear, schoolYear]
    );

    const [serials] = await db.execute(
      'SELECT * FROM serial_numbers WHERE student_id=? AND program=? ORDER BY id DESC',
      [studentId, programCode]
    );

    const [withdrawals] = programCode === 'ROTC'
      ? await db.execute(
        'SELECT id,reason,status,admin_remarks,created_at,updated_at FROM advance_course_withdrawals WHERE student_id=? ORDER BY created_at DESC',
        [studentId]
      )
      : [[]];

    return res.json({
      student,
      cycle,
      grades,
      attendance,
      serial: serials[0] || null,
      withdrawals,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to complete this request. Please try again later.' });
  }
};
