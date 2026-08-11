const db = require('../config/database');
const attendance = require('../services/attendanceService');
const offenseService = require('../services/offenseService');
const platoonService = require('../services/platoonService');

function sessionLabel(session) {
  const unit = session.program === 'CWTS' ? 'CS' : 'MI';
  return `${unit} ${session.mi_number || '-'} ${(session.mi_type || '').toUpperCase()}`.trim();
}

async function approvedStudentsForSession(session) {
  const values = [session.program, String(session.ms_level || '1')];
  let extra = '';

  if (session.school_year) {
    extra += ` AND EXISTS (
      SELECT 1
      FROM student_ms_records smr
      LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
      WHERE smr.student_id=s.id
        AND smr.program=?
        AND smr.ms_level=?
        AND smr.status='approved'
        AND (es.year=? OR es.year IS NULL)
    )`;
    values.push(session.school_year);
  } else {
    extra += ` AND EXISTS (
      SELECT 1 FROM student_ms_records smr
      WHERE smr.student_id=s.id
        AND smr.program=?
        AND smr.ms_level=?
        AND smr.status='approved'
    )`;
  }

  if (session.program === 'ROTC') {
    if (Number(session.is_advance_course || 0) === 1) {
      extra += ' AND s.willing_to_take_advance_course=1 AND s.special_unit IS NULL AND COALESCE(s.has_medical_condition,0)=0';
    } else {
      extra += ' AND NOT (s.willing_to_take_advance_course=1 AND s.special_unit IS NULL AND COALESCE(s.has_medical_condition,0)=0)';
    }
  }

  const [rows] = await db.execute(
    `SELECT s.id,s.student_id,s.first_name,s.middle_name,s.last_name,s.course,s.year_level,s.sex,
            s.nstp_component,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,
            s.willing_to_take_advance_course,s.serial_number
     FROM students s
     WHERE s.role='student' AND s.nstp_component=? ${extra}
     ORDER BY s.last_name,s.first_name`,
    [session.program, ...values]
  );

  return rows.filter((student) => !student.serial_number);
}

async function markMissingAbsent(session) {
  const students = await approvedStudentsForSession(session);
  if (!students.length) return;

  const [records] = await db.execute(
    'SELECT student_id FROM attendance_records WHERE attendance_session_id=?',
    [session.id]
  );
  const marked = new Set(records.map((row) => Number(row.student_id)));

  for (const student of students) {
    if (marked.has(Number(student.id))) continue;

    await db.execute(
      `INSERT IGNORE INTO attendance_records
       (student_id,attendance_session_id,status,mi_number,mi_type)
       VALUES(?,?,'absent',?,?)`,
      [student.id, session.id, session.mi_number, session.mi_type]
    );
  }
}

async function refreshSessionStatuses() {
  const [rows] = await db.execute("SELECT * FROM attendance_sessions WHERE status!='closed'");
  const now = new Date();

  for (const session of rows) {
    const effective = attendance.getEffectiveStatus(session, now);
    const dbStatus = effective === 'scheduled'
      ? 'scheduled'
      : effective === 'closed'
        ? 'closed'
        : 'open';

    if (dbStatus !== session.status) {
      await db.execute('UPDATE attendance_sessions SET status=? WHERE id=?', [dbStatus, session.id]);
    }

    if (effective === 'closed') {
      await markMissingAbsent(session);
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

    const [[summary]] = await db.query(`
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
           )
        ) cwts,
        (SELECT COUNT(*) FROM attendance_sessions WHERE status='open') open_sessions,
        (SELECT COUNT(*) FROM attendance_records) attendance_records
    `);

    return res.json(summary);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.attendanceProgress = async (req, res) => {
  try {
    await refreshSessionStatuses();

    const rawProgram = String(req.query.program || '').toUpperCase();
    const isAdvance = rawProgram === 'ADVANCE_COURSE';
    const program = isAdvance ? 'ROTC' : rawProgram;

    if (!['ROTC', 'CWTS'].includes(program)) {
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
      progress,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createAttendance = async (req, res) => {
  try {
    await refreshSessionStatuses();

    const body = req.body;
    const rawProgram = String(body.program || '').toUpperCase();
    const isAdvance = rawProgram === 'ADVANCE_COURSE' || Boolean(body.is_advance_course);
    const program = isAdvance ? 'ROTC' : rawProgram;

    if (!['ROTC', 'CWTS'].includes(program)) {
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
    const msLevel = body.ms_level ? String(body.ms_level) : cycle.ms_level;
    const schoolYear = body.school_year || cycle.school_year;

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
    return res.status(500).json({ message: error.message });
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
    return res.status(500).json({ message: error.message });
  }
};

exports.sessionRecords = async (req, res) => {
  try {
    await refreshSessionStatuses();

    const [[session]] = await db.execute(
      'SELECT * FROM attendance_sessions WHERE id=?',
      [req.params.id]
    );

    if (!session) {
      return res.status(404).json({ message: 'Attendance session not found.' });
    }

    const students = await approvedStudentsForSession(session);
    const [records] = await db.execute(
      'SELECT * FROM attendance_records WHERE attendance_session_id=?',
      [session.id]
    );
    const recordByStudent = new Map(
      records.map((record) => [Number(record.student_id), record])
    );
    const effectiveStatus = attendance.getEffectiveStatus(session);
    const graceOver = effectiveStatus === 'closed';

    const output = students.map((student) => {
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
    });

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
    return res.status(500).json({ message: error.message });
  }
};

exports.setAttendance = async (req, res) => {
  try {
    const studentId = Number(req.body.student_id);
    const status = String(req.body.status || '').toLowerCase();

    if (!studentId || !['present', 'late', 'absent'].includes(status)) {
      return res.status(400).json({
        message: 'Select a student and valid attendance status.',
      });
    }

    const [[session]] = await db.execute(
      'SELECT * FROM attendance_sessions WHERE id=?',
      [req.params.id]
    );

    if (!session) {
      return res.status(404).json({ message: 'Attendance session not found.' });
    }

    const [beforeRows] = await db.execute(
      'SELECT id,status FROM attendance_records WHERE student_id=? AND attendance_session_id=? LIMIT 1',
      [studentId, session.id]
    );
    const previousStatus = beforeRows[0]?.status || null;

    await db.execute(
      `INSERT INTO attendance_records(student_id,attendance_session_id,status,mi_number,mi_type,verified_by,verified_at)
       VALUES(?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE status=VALUES(status),verified_by=VALUES(verified_by),verified_at=NOW(),updated_at=NOW()`,
      [studentId, session.id, status, session.mi_number, session.mi_type, req.user.email]
    );

    let offense = null;
    if (status === 'absent' && previousStatus !== 'absent') {
      offense = await offenseService.record(studentId);
    }

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
    return res.status(500).json({ message: error.message });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const status = String(req.body.status || '').toLowerCase();

    if (!['present', 'late', 'absent'].includes(status)) {
      return res.status(400).json({ message: 'Invalid attendance status.' });
    }

    const [[before]] = await db.execute(
      'SELECT student_id,status FROM attendance_records WHERE id=?',
      [req.params.id]
    );

    if (!before) {
      return res.status(404).json({ message: 'Attendance record not found.' });
    }

    await db.execute(
      'UPDATE attendance_records SET status=?,verified_by=?,verified_at=NOW(),updated_at=NOW() WHERE id=?',
      [status, req.user.email, req.params.id]
    );

    let offense = null;
    if (status === 'absent' && before.status !== 'absent') {
      offense = await offenseService.record(before.student_id);
    }

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
    return res.status(500).json({ message: error.message });
  }
};

exports.roster = async (req, res) => {
  try {
    const where = req.params.group === 'cwts'
      ? "s.nstp_component='CWTS'"
      : req.params.group === 'advance-course'
        ? "s.nstp_component='ROTC' AND s.willing_to_take_advance_course=1 AND s.special_unit IS NULL AND COALESCE(s.has_medical_condition,0)=0"
        : req.params.group === 'special-platoon'
          ? "s.nstp_component='ROTC' AND s.special_unit IN ('Medics','HQ','MP')"
          : req.params.group === 'battalion-1'
            ? "s.nstp_component='ROTC' AND s.battalion=1 AND s.willing_to_take_advance_course=0 AND s.special_unit IS NULL"
            : req.params.group === 'battalion-2'
              ? "s.nstp_component='ROTC' AND s.battalion=2 AND s.willing_to_take_advance_course=0 AND s.special_unit IS NULL"
              : "s.nstp_component='ROTC'";

    const [rows] = await db.query(
      `SELECT s.id,s.student_id,s.first_name,s.last_name,s.course,s.year_level,s.sex,s.nstp_component,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,s.willing_to_take_advance_course
       FROM students s
       WHERE s.role='student' AND ${where}
         AND EXISTS(SELECT 1 FROM student_ms_records smr WHERE smr.student_id=s.id AND smr.status='approved')
       ORDER BY s.last_name,s.first_name`
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.enrollments = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT smr.id record_id,smr.ms_level,smr.status,smr.program,smr.created_at,
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

    return res.json({
      rotc: rows.filter((row) => row.program === 'ROTC'),
      cwts: rows.filter((row) => row.program === 'CWTS'),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.records = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT smr.id record_id,smr.ms_level,smr.status,smr.program,smr.created_at,
              COALESCE(es.year,'') school_year,
              s.id student_db_id,s.student_id,s.first_name,s.middle_name,s.last_name,s.suffix,
              s.course,s.year_level,s.nstp_component,s.sex,s.birthdate,s.email,s.contact_number,
              s.permanent_barangay,s.permanent_municipality,s.permanent_province,
              s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,s.willing_to_take_advance_course,
              s.serial_number,
              g.midterm,g.final_term,g.grade,g.status grade_status
       FROM student_ms_records smr
       JOIN students s ON s.id=smr.student_id
       LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
       LEFT JOIN student_grades g ON g.student_id=s.id AND g.program=smr.program AND g.ms_level=smr.ms_level
       WHERE s.role='student'
       ORDER BY smr.program,s.last_name,s.first_name,smr.ms_level`
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.recordDetail = async (req, res) => {
  try {
    const programCode = String(req.query.program || '').toUpperCase();
    const studentId = Number(req.params.studentId);
    const level = String(req.query.ms_level || '1');

    if (!['ROTC', 'CWTS'].includes(programCode)) {
      return res.status(400).json({ message: 'Valid program is required.' });
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

    const params = [studentId, programCode, level];
    let schoolYearCondition = '';

    if (cycle.school_year) {
      schoolYearCondition = ' AND (ses.school_year=? OR ses.school_year IS NULL)';
      params.push(cycle.school_year);
    }

    const [attendance] = await db.execute(
      `SELECT ar.id,ar.status,ar.created_at,ar.distance_meters,ar.latitude,ar.longitude,
              ses.mi_number,ses.mi_type,ses.open_date,ses.close_date,ses.school_year,ses.ms_level
       FROM attendance_records ar
       JOIN attendance_sessions ses ON ses.id=ar.attendance_session_id
       WHERE ar.student_id=? AND ses.program=? AND (ses.ms_level=? OR ses.ms_level IS NULL) ${schoolYearCondition}
       ORDER BY ses.mi_number,FIELD(ses.mi_type,'in','out'),ar.created_at`,
      params
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
    return res.status(500).json({ message: error.message });
  }
};
