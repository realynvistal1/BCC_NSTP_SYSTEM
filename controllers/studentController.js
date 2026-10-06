const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('../config/database');
const { decorateAttendanceUpdates } = require('../services/attendanceUpdateService');
const { latestRecord, studentById, studentPublic } = require('../services/systemService');
const authService = require('../services/authService');
const attendanceService = require('../services/attendanceService');
const certificateService = require('../services/certificateService');
const enrollmentService = require('../services/enrollmentService');
const gradesService = require('../services/gradesService');
const offenseService = require('../services/offenseService');
const platoonService = require('../services/platoonService');
const captchaService = require('../services/captchaService');
const {
  parsePositiveInt,
  readLevel,
  isValidStudentId,
  readLimitedText,
} = require('../services/requestValidationService');
const uploadValidation = require('../services/uploadValidationService');

function levelLabelFor(program, level) {
  return program === 'ROTC' ? `MS ${level}` : `CWTS ${level}`;
}

function isCriminologyCourse(course) {
  return /criminology/i.test(String(course || ''));
}

async function findBestSchedule(program, level) {
  const [rows] = await db.execute(
    'SELECT * FROM enrollment_schedules WHERE program=? AND ms_level=? ORDER BY id DESC',
    [program, level]
  );

  if (!rows.length) return null;

  const now = Date.now();
  const active = rows.find((schedule) => enrollmentService.nowWithin(schedule, now));
  if (active) return active;

  const upcoming = rows.find((schedule) => {
    const open = new Date(schedule.open_date).getTime();
    return Number.isFinite(open) && now < open;
  });
  if (upcoming) return upcoming;

  return rows[0];
}

async function studentAssignmentView(student, record) {
  let assignmentAssigned = false;

  if (student?.nstp_component && record?.schedule_id && record.status === 'approved') {
    const [scheduleRows] = await db.execute(
      `SELECT platoons_assigned_at
       FROM enrollment_schedules
       WHERE id=? AND program=?
       LIMIT 1`,
      [record.schedule_id, student.nstp_component]
    );
    assignmentAssigned = Boolean(scheduleRows[0]?.platoons_assigned_at);
  }

  const safeStudent = studentPublic(student);
  if (safeStudent && !assignmentAssigned) {
    safeStudent.company = null;
    safeStudent.battalion = null;
    safeStudent.rotc_company = null;
    safeStudent.rotc_platoon = null;
    safeStudent.special_unit = null;
  }

  return { safeStudent, assignmentAssigned };
}

async function resolveReEnrollContext(studentId) {
  const student = await studentById(studentId);
  const latest = await latestRecord(studentId);

  if (!student) {
    return { status: 404, message: 'Student record not found.' };
  }

  const [serialRows] = await db.execute(
    "SELECT id FROM serial_numbers WHERE student_id=? AND TRIM(serial_number)<>'' LIMIT 1",
    [studentId]
  );
  if (String(student.serial_number || '').trim() || serialRows.length) {
    return {
      status: 403,
      reason: 'nstp-completed',
      message: 'You have already completed NSTP and have an assigned serial number. You cannot enroll again.',
    };
  }

  const [ms1Grades] = await db.execute(
    "SELECT * FROM student_grades WHERE student_id=? AND ms_level='1' AND program=? ORDER BY id DESC LIMIT 1",
    [studentId, student.nstp_component]
  );
  const levelOneGrade = ms1Grades[0];
  const hasCompleteLevelOneGrades = levelOneGrade
    && levelOneGrade.midterm !== null
    && levelOneGrade.final_term !== null;
  const passedLevelOne = hasCompleteLevelOneGrades
    && gradesService.statusFromGrade(levelOneGrade.grade, student.course) === 'Passed';

  if (latest && latest.status === 'rejected') {
    const retryLevel = String(latest.ms_level || '1');

    if (retryLevel === '2') {
      const schedule = await findBestSchedule(student.nstp_component, '2');
      if (!schedule || !enrollmentService.nowWithin(schedule)) {
        return {
          status: 400,
          message: `${levelLabelFor(student.nstp_component, '2')} enrollment is not open at this time.`,
        };
      }
    }

    if (retryLevel === '2' && !hasCompleteLevelOneGrades) {
      return {
        status: 403,
        reason: 'grades-incomplete',
        targetLevel: '2',
        message: `Not qualified for ${levelLabelFor(student.nstp_component, '2')}: your complete level 1 grades have not been encoded.`,
      };
    }

    if (retryLevel === '2' && !passedLevelOne) {
      return {
        status: 403,
        reason: 'failed-grade',
        targetLevel: '2',
        message: `Not qualified for ${levelLabelFor(student.nstp_component, '2')}: your level 1 grade is Failed. Only students who passed level 1 can enroll.`,
      };
    }

    const [pendingRetry] = await db.execute(
      "SELECT id FROM student_ms_records WHERE student_id=? AND ms_level=? AND status='pending' LIMIT 1",
      [studentId, retryLevel]
    );

    if (pendingRetry.length) {
      return {
        status: 409,
        message: 'You already have a pending enrollment request for review.',
      };
    }

    const allowedPrograms = retryLevel === '1' && !isCriminologyCourse(student.course)
      ? ['ROTC', 'CWTS']
      : [student.nstp_component];
    const availableSchedules = [];

    for (const programCode of allowedPrograms) {
      const candidate = await findBestSchedule(programCode, retryLevel);
      if (candidate && enrollmentService.nowWithin(candidate)) {
        availableSchedules.push(candidate);
      }
    }

    if (!availableSchedules.length) {
      return {
        status: 400,
        message: `${levelLabelFor(student.nstp_component, retryLevel)} enrollment is not open at this time.`,
      };
    }

    const retrySchedule = availableSchedules.find(
      (candidate) => candidate.program === student.nstp_component
    ) || availableSchedules[0];

    return {
      status: 200,
      mode: 'retry',
      student,
      latest,
      targetLevel: retryLevel,
      schedule: retrySchedule,
      availableSchedules,
      message: `Review your saved information, choose an available NSTP component, and submit your ${levelLabelFor(retrySchedule.program, retryLevel)} enrollment again.`,
    };
  }

  if (latest && latest.status === 'pending') {
    return {
      status: 400,
      message: `Your ${levelLabelFor(student.nstp_component, String(latest.ms_level || '2'))} enrollment form is waiting for approval.`,
    };
  }

  if (!latest || String(latest.ms_level) !== '1' || latest.status !== 'approved') {
    return {
      status: 400,
      message: `You can apply for ${levelLabelFor(student.nstp_component, '2')} only after your level 1 enrollment is approved.`,
    };
  }

  const schedule = await findBestSchedule(student.nstp_component, '2');
  if (!schedule || !enrollmentService.nowWithin(schedule)) {
    return {
      status: 400,
      message: `${levelLabelFor(student.nstp_component, '2')} enrollment is not open at this time.`,
    };
  }

  if (!hasCompleteLevelOneGrades) {
    return {
      status: 403,
      reason: 'grades-incomplete',
      targetLevel: '2',
      message: `Not qualified for ${levelLabelFor(student.nstp_component, '2')}: your complete level 1 grades have not been encoded.`,
    };
  }

  if (!passedLevelOne) {
    return {
      status: 403,
      reason: 'failed-grade',
      targetLevel: '2',
      message: `Not qualified for ${levelLabelFor(student.nstp_component, '2')}: your level 1 grade is Failed. Only students who passed level 1 can enroll.`,
    };
  }

  const [duplicates] = await db.execute(
    "SELECT id,status FROM student_ms_records WHERE student_id=? AND ms_level='2' AND status IN ('pending','approved') LIMIT 1",
    [studentId]
  );

  if (duplicates.length) {
    return {
      status: 409,
      message: duplicates[0].status === 'pending'
        ? `Your ${levelLabelFor(student.nstp_component, '2')} enrollment form is waiting for approval.`
        : 'You already have a level 2 enrollment request.',
    };
  }

  return {
    status: 200,
    mode: 'next-level',
    student,
    latest,
    targetLevel: '2',
    schedule,
    message: `Review your saved information and submit your ${levelLabelFor(student.nstp_component, '2')} enrollment.`,
  };
}

function normalizeBooleanFlag(value) {
  return Number(value === true || value === '1' || value === 1 || value === 'true');
}

async function ensureCaptcha(req, res, token, action) {
  const verification = await captchaService.verifyToken(token, action, {
    hostname: req.hostname,
  });

  if (!verification.ok) {
    res.status(400).json({ message: verification.message });
    return false;
  }

  return true;
}

exports.checkSchedule = async (req, res) => {
  try {
    const program = String(req.query.program || '').toUpperCase();
    const msLevel = readLevel(req.query.ms_level || '1');

    if (!['ROTC', 'CWTS'].includes(program) || !msLevel) {
      return res.status(400).json({ message: 'Select a valid NSTP component and level.' });
    }

    const schedule = await findBestSchedule(program, msLevel);
    if (!schedule) {
      return res.json({
        open: false,
        schedule: null,
        message: `${enrollmentService.levelLabel(program, msLevel)} is not yet open for enrollment.`,
      });
    }

    return res.json(enrollmentService.statusMessageForClosedSchedule(schedule, program));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.checkStudentId = async (req, res) => {
  try {
    const studentId = String(req.query.student_id || '').trim();

     if (!isValidStudentId(studentId)) {
      return res.status(400).json({
        message: 'Student ID must use format 000000-0000.',
      });
    }

    const [rows] = await db.execute(
      `SELECT s.id, CASE WHEN TRIM(COALESCE(s.serial_number,''))<>''
         OR EXISTS (SELECT 1 FROM serial_numbers sn WHERE sn.student_id=s.id AND TRIM(sn.serial_number)<>'')
         THEN 1 ELSE 0 END AS completed
       FROM students s WHERE s.student_id=? LIMIT 1`,
      [studentId]
    );

    return res.json({
      exists: rows.length > 0,
      completed: Boolean(Number(rows[0]?.completed)),
      message: Number(rows[0]?.completed) ? 'You have already completed NSTP and have an assigned serial number. You cannot enroll again.' : undefined,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.register = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const body = req.body;

    if (!await ensureCaptcha(req, res, body.recaptcha_token, 'student_enrollment')) {
      return;
    }

    const required = [
      'student_id',
      'first_name',
      'last_name',
      'contact_number',
      'religion',
      'birthdate',
      'sex',
      'place_of_birth',
      'temporary_barangay',
      'temporary_municipality',
      'temporary_province',
      'permanent_barangay',
      'permanent_municipality',
      'permanent_province',
      'father_name',
      'father_occupation',
      'mother_name',
      'mother_occupation',
      'emergency_contact_name',
      'emergency_contact_address',
      'emergency_contact_relationship',
      'emergency_contact_contact_number',
      'course',
      'year_level',
      'nstp_component',
      'height',
      'weight',
      'blood_type',
      'complexion',
      'medical_certificate',
      'email',
      'password',
      'photo',
      'cor_file',
    ];

    for (const key of required) {
      if (!body[key]) {
        return res.status(400).json({
          message: `${key.replaceAll('_', ' ')} is required.`,
        });
      }
    }

    if (!/^\d{6}-\d{4}$/.test(body.student_id)) {
      return res.status(400).json({ message: 'Student ID must use format 000000-0000.' });
    }

    if (
      String(body.contact_number).length !== 11
      || String(body.emergency_contact_contact_number).length !== 11
    ) {
      return res.status(400).json({ message: 'Contact numbers must contain 11 digits.' });
    }

    if (!['ROTC', 'CWTS'].includes(body.nstp_component)) {
      return res.status(400).json({ message: 'Select ROTC or CWTS.' });
    }

    const msLevel = '1';
    const [scheduleRows] = await connection.execute(
      "SELECT * FROM enrollment_schedules WHERE program=? AND ms_level='1' ORDER BY id DESC LIMIT 1",
      [body.nstp_component]
    );

    const schedule = scheduleRows[0];
    if (!schedule) {
      return res.status(400).json({
        message: `${body.nstp_component} ${body.nstp_component === 'ROTC' ? 'MS' : 'CWTS'} 1 is not yet open for enrollment.`,
      });
    }

    if (!enrollmentService.nowWithin(schedule)) {
      return res.status(400).json({
        message: 'Enrollment is currently unavailable for the selected component.',
      });
    }

    const [duplicates] = await connection.execute(
      'SELECT id FROM students WHERE email=? OR student_id=?',
      [body.email, body.student_id]
    );

    if (duplicates.length) {
      return res.status(409).json({
        message: 'Student ID or email is already registered.',
      });
    }

    if (body.password !== body.confirm_password) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const passwordError = authService.passwordValidationMessage(body.password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    if (body.nstp_component === 'ROTC' && !body.xray_file) {
      return res.status(400).json({ message: 'X-ray is required for ROTC enrollment.' });
    }

    const skipMedicalQuestion = isCriminologyCourse(body.course)
      || (body.nstp_component === 'ROTC' && Number(body.willing_to_take_advance_course) === 1);
    const hasMedicalCondition = skipMedicalQuestion ? 0 : enrollmentService.normalizeMedicalCondition(body.has_medical_condition);
    if (hasMedicalCondition === 1 && !String(body.medical_condition || '').trim()) {
      return res.status(400).json({
        message: 'Enter your medical condition after selecting Yes.',
      });
    }

    const hashedPassword = await bcrypt.hash(body.password, 10);
    const medicalCertificate = uploadValidation.validateDocumentUpload(body.medical_certificate, {
      label: 'Medical certificate',
      required: true,
    });
    const xrayFile = uploadValidation.validateDocumentUpload(body.xray_file, {
      label: 'X-ray',
      required: body.nstp_component === 'ROTC',
    });
    const photo = uploadValidation.validateImageUpload(body.photo, {
      label: '2x2 photo',
      required: true,
    });
    const corFile = uploadValidation.validateDocumentUpload(body.cor_file, {
      label: 'Certificate of Registration',
      required: true,
    });

    await connection.beginTransaction();

    const insertStudentSql = `
      INSERT INTO students (
        student_id,last_name,first_name,middle_name,suffix,religion,birthdate,sex,contact_number,
        place_of_birth,temporary_barangay,temporary_municipality,temporary_province,permanent_barangay,
        permanent_municipality,permanent_province,father_name,father_occupation,mother_name,mother_occupation,
        emergency_contact_name,emergency_contact_address,emergency_contact_relationship,
        emergency_contact_contact_number,willing_to_take_advance_course,willing_to_be_medics,
        willing_to_be_military_police,course,year_level,nstp_component,height,weight,blood_type,complexion,
        has_medical_condition,medical_condition,medical_certificate,xray_file,email,password,photo,
        cor_file,role
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'student')
    `;

    const insertStudentValues = [
      body.student_id,
      body.last_name,
      body.first_name,
      body.middle_name || '',
      body.suffix || null,
      body.religion,
      body.birthdate,
      body.sex,
      body.contact_number,
      body.place_of_birth,
      body.temporary_barangay,
      body.temporary_municipality,
      body.temporary_province,
      body.permanent_barangay,
      body.permanent_municipality,
      body.permanent_province,
      body.father_name,
      body.father_occupation,
      body.mother_name,
      body.mother_occupation,
      body.emergency_contact_name,
      body.emergency_contact_address,
      body.emergency_contact_relationship,
      body.emergency_contact_contact_number,
      Number(body.willing_to_take_advance_course || 0),
      Number(body.willing_to_be_medics || 0),
      Number(body.willing_to_be_military_police || 0),
      body.course,
      body.year_level,
      body.nstp_component,
      body.height,
      body.weight,
      body.blood_type,
      body.complexion,
      hasMedicalCondition,
      hasMedicalCondition ? String(body.medical_condition || '').trim() : '',
      medicalCertificate,
      xrayFile,
      body.email,
      hashedPassword,
      photo,
      corFile,
    ];

    const [result] = await connection.execute(insertStudentSql, insertStudentValues);

    await connection.execute(
      "INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program) VALUES(?,?,?,'pending',?)",
      [result.insertId, String(schedule.id), msLevel, body.nstp_component]
    );

    await connection.commit();

    return res.status(201).json({
      message: 'Enrollment submitted successfully. Your record is pending administrator verification.',
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors after the main failure.
    }

    console.error(error);
    return res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
};

exports.dashboard = async (req, res) => {
  try {
    const student = await studentById(req.user.id);
    const record = await latestRecord(req.user.id);
    const { safeStudent, assignmentAssigned } = await studentAssignmentView(student, record);
    const [gradeRows] = await db.execute(
      'SELECT * FROM student_grades WHERE student_id=? ORDER BY id DESC LIMIT 1',
      [req.user.id]
    );
    const [serialRows] = await db.execute(
      'SELECT * FROM serial_numbers WHERE student_id=? ORDER BY id DESC LIMIT 1',
      [req.user.id]
    );
    const [attendanceRows] = await db.execute(
      "SELECT COUNT(*) total,SUM(status='present') present,SUM(status='late') late,SUM(status='absent') absent FROM attendance_records WHERE student_id=?",
      [req.user.id]
    );
    const reEnrollmentContext = await resolveReEnrollContext(req.user.id);

    return res.json({
      student: safeStudent,
      assignment_assigned: assignmentAssigned,
      record,
      grade: gradeRows[0] || null,
      serial: serialRows[0] || null,
      attendance: attendanceRows[0],
      re_enrollment: {
        eligible: reEnrollmentContext.status === 200,
        reason: reEnrollmentContext.reason || null,
        message: reEnrollmentContext.message || '',
        target_level: reEnrollmentContext.targetLevel || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.profile = async (req, res) => {
  try {
    const student = await studentById(req.user.id);
    const [records] = await db.execute(
      'SELECT * FROM student_ms_records WHERE student_id=? ORDER BY created_at DESC,id DESC',
      [req.user.id]
    );
    const { safeStudent, assignmentAssigned } = await studentAssignmentView(
      student,
      records[0] || null
    );

    return res.json({
      student: safeStudent,
      assignment_assigned: assignmentAssigned,
      records,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.reEnrollForm = async (req, res) => {
  try {
    const context = await resolveReEnrollContext(req.user.id);
    if (context.status !== 200) {
      return res.status(context.status).json({ message: context.message });
    }

    const {
      student,
      latest,
      targetLevel,
      schedule,
      availableSchedules = schedule ? [schedule] : [],
      mode,
      message,
    } = context;
    const safeStudent = studentPublic(student);

    delete safeStudent.password;
    delete safeStudent.medical_certificate;
    delete safeStudent.xray_file;
    delete safeStudent.photo;
    delete safeStudent.cor_file;

    return res.json({
      mode,
      message,
      target_level: targetLevel,
      level_label: levelLabelFor(schedule?.program || student.nstp_component, targetLevel),
      available_components: availableSchedules.map((candidate) => candidate.program),
      available_schedules: availableSchedules.map((candidate) => ({
        id: candidate.id,
        program: candidate.program,
        ms_level: String(candidate.ms_level),
        year: candidate.year,
        open_date: candidate.open_date,
        deadline: candidate.deadline,
      })),
      student: safeStudent,
      latest_record: latest,
      schedule: schedule
        ? {
          id: schedule.id,
          program: schedule.program,
          ms_level: String(schedule.ms_level),
          year: schedule.year,
          open_date: schedule.open_date,
          deadline: schedule.deadline,
        }
        : null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.grades = async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM student_grades WHERE student_id=? ORDER BY ms_level',
    [req.user.id]
  );
  res.json(rows);
};

exports.serial = async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM serial_numbers WHERE student_id=? ORDER BY id DESC',
    [req.user.id]
  );
  res.json(rows);
};

exports.attendance = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT ar.*,ses.open_date,ses.close_date,ses.program,ses.ms_level,ses.school_year,
              ses.mi_number,ses.mi_type,ses.is_advance_course
       FROM attendance_records ar
       JOIN attendance_sessions ses ON ses.id=ar.attendance_session_id
       WHERE ar.student_id=?
       ORDER BY COALESCE(ses.ms_level,99) ASC,
                ses.school_year ASC,
                ses.mi_number ASC,
                FIELD(LOWER(ses.mi_type),'in','out') ASC,
                ar.created_at ASC`,
      [req.user.id]
    );

    res.json(await decorateAttendanceUpdates(rows));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.openSessions = async (req, res) => {
  try {
    const student = await studentById(req.user.id);
    const latest = await latestRecord(req.user.id);

    if (!latest || latest.status !== 'approved' || student.serial_number) {
      return res.json([]);
    }

    const [rows] = await db.execute(
      `SELECT * FROM attendance_sessions
       WHERE program=? AND (ms_level IS NULL OR ms_level=?)
       ORDER BY created_at DESC,id DESC`,
      [student.nstp_component, latest.ms_level]
    );

    const isAdvance = platoonService.isAdvanceCourseCadet(student);
    const eligible = rows
      .filter((session) => {
        if (student.nstp_component === 'ROTC') {
          return Boolean(Number(session.is_advance_course || 0)) === isAdvance;
        }
        return true;
      })
      .map((session) => ({
        ...session,
        effective_status: attendanceService.getEffectiveStatus(session),
        late_deadline: attendanceService.lateDeadline(session.close_date),
      }))
      .filter((session) => ['scheduled', 'open', 'late'].includes(session.effective_status));

    return res.json(eligible);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markAttendance = async (req, res) => {
  try {
    const sessionId = parsePositiveInt(req.body.sessionId);
    const { latitude, longitude } = req.body;

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

    const student = await studentById(req.user.id);
    if (student.serial_number) {
      return res.status(400).json({
        message: 'You have already completed NSTP and cannot record attendance.',
      });
    }

    if (student.nstp_component !== session.program) {
      return res.status(403).json({
        message: 'This attendance session is not for your NSTP program.',
      });
    }

    const latest = await latestRecord(req.user.id);
    if (!latest || latest.status !== 'approved') {
      return res.status(403).json({
        message: 'Your enrollment must be approved before you can mark attendance.',
      });
    }

    if (session.ms_level && String(latest.ms_level) !== String(session.ms_level)) {
      return res.status(403).json({
        message: `This session is for ${session.program === 'ROTC' ? 'MS' : 'CWTS'} ${session.ms_level}.`,
      });
    }

    if (session.program === 'ROTC') {
      const isAdvance = platoonService.isAdvanceCourseCadet(student);
      if (Boolean(Number(session.is_advance_course || 0)) !== isAdvance) {
        return res.status(403).json({
          message: isAdvance
            ? 'Use the Advance Course attendance session.'
            : 'This session is for Advance Course students only.',
        });
      }
    }

    const markStatus = attendanceService.attendanceStatusForMark(session);
    const effectiveStatus = attendanceService.getEffectiveStatus(session);

    if (!markStatus) {
      if (effectiveStatus === 'scheduled') {
        return res.status(400).json({
          message: 'This attendance session has not opened yet.',
        });
      }

      return res.status(400).json({
        message: 'This attendance session has already ended.',
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const meters = attendanceService.haversineMeters(
      lat,
      lng,
      session.latitude,
      session.longitude
    );

    if (!Number.isFinite(meters)) {
      return res.status(400).json({ message: 'A valid device location is required.' });
    }

    const allowedRadius = Number(
      session.radius_meters || attendanceService.ATTENDANCE_RADIUS_METERS
    );

    if (meters > allowedRadius) {
      return res.status(400).json({
        message: `You are outside the attendance area (${Math.round(meters)}m away). Move within the ${allowedRadius}m radius.`,
      });
    }

    const [existing] = await db.execute(
      'SELECT id,status FROM attendance_records WHERE student_id=? AND attendance_session_id=? LIMIT 1',
      [req.user.id, sessionId]
    );

    if (existing.length) {
      return res.status(409).json({
        message: `Attendance already marked as ${existing[0].status}.`,
      });
    }

    await db.execute(
      `INSERT INTO attendance_records
       (student_id,attendance_session_id,status,mi_number,mi_type,latitude,longitude,distance_meters,claimed_present)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [
        req.user.id,
        sessionId,
        markStatus,
        session.mi_number,
        session.mi_type,
        lat,
        lng,
        Math.round(meters * 100) / 100,
        Number(markStatus === 'present'),
      ]
    );

    return res.json({
      message: markStatus === 'late'
        ? 'Attendance marked as Late.'
        : 'Attendance marked successfully.',
      status: markStatus,
      distance: Math.round(meters),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.reEnroll = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const context = await resolveReEnrollContext(req.user.id);
    if (context.status !== 200) {
      return res.status(context.status).json({ message: context.message });
    }

    const { student, targetLevel, mode } = context;
    const body = req.body || {};
    const requestedProgram = String(body.nstp_component || student.nstp_component).toUpperCase();
    let selectedProgram = student.nstp_component;
    let schedule = context.schedule;

    if (mode === 'retry' && String(targetLevel) === '1') {
      if (!['ROTC', 'CWTS'].includes(requestedProgram)) {
        return res.status(400).json({ message: 'Select ROTC or CWTS.' });
      }
      if (isCriminologyCourse(student.course) && requestedProgram !== 'ROTC') {
        return res.status(400).json({ message: 'BS Criminology students are required to enroll in ROTC.' });
      }

      schedule = (context.availableSchedules || []).find(
        (candidate) => candidate.program === requestedProgram
      );
      if (!schedule || !enrollmentService.nowWithin(schedule)) {
        return res.status(400).json({
          message: `${levelLabelFor(requestedProgram, targetLevel)} enrollment is not open at this time.`,
        });
      }
      selectedProgram = requestedProgram;
    } else if (requestedProgram !== student.nstp_component) {
      return res.status(400).json({
        message: 'NSTP component can only be changed when correcting a rejected MS 1 enrollment.',
      });
    }
    const required = [
      'contact_number',
      'religion',
      'temporary_barangay',
      'temporary_municipality',
      'temporary_province',
      'permanent_barangay',
      'permanent_municipality',
      'permanent_province',
      'emergency_contact_name',
      'emergency_contact_address',
      'emergency_contact_relationship',
      'emergency_contact_contact_number',
      'year_level',
      'height',
      'weight',
      'blood_type',
      'complexion',
      'course',
    ];

    for (const key of required) {
      if (!String(body[key] || '').trim()) {
        return res.status(400).json({ message: `${key.replaceAll('_', ' ')} is required.` });
      }
    }

    if (
      String(body.contact_number).length !== 11
      || String(body.emergency_contact_contact_number).length !== 11
    ) {
      return res.status(400).json({ message: 'Contact numbers must contain 11 digits.' });
    }

    if (String(body.course).trim() !== String(student.course).trim()) {
      return res.status(400).json({ message: 'Course cannot be changed during re-enrollment.' });
    }

    const allowedYearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
    if (!allowedYearLevels.includes(String(body.year_level))) {
      return res.status(400).json({ message: 'Select a valid year level.' });
    }

    if (selectedProgram === 'ROTC' && !String(body.xray_file || student.xray_file || '').trim()) {
      return res.status(400).json({ message: 'X-ray is required for ROTC re-enrollment.' });
    }

    const hasMedicalCondition = enrollmentService.normalizeMedicalCondition(body.has_medical_condition);
    const medicalCertificate = body.medical_certificate == null || String(body.medical_certificate).trim() === ''
      ? (student.medical_certificate || null)
      : uploadValidation.validateDocumentUpload(body.medical_certificate, {
        label: 'Medical certificate',
        required: true,
      });
    const xrayFile = selectedProgram === 'ROTC'
      ? (body.xray_file == null || String(body.xray_file).trim() === ''
        ? (student.xray_file || null)
        : uploadValidation.validateDocumentUpload(body.xray_file, {
          label: 'X-ray',
          required: true,
        }))
      : null;
    const corFile = body.cor_file == null || String(body.cor_file).trim() === ''
      ? (student.cor_file || null)
      : uploadValidation.validateDocumentUpload(body.cor_file, {
        label: 'Certificate of Registration',
        required: true,
      });

    await connection.beginTransaction();

    await connection.execute(
      `UPDATE students SET
        religion=?,contact_number=?,temporary_barangay=?,temporary_municipality=?,temporary_province=?,
        permanent_barangay=?,permanent_municipality=?,permanent_province=?,emergency_contact_name=?,
        emergency_contact_address=?,emergency_contact_relationship=?,emergency_contact_contact_number=?,
        course=?,year_level=?,nstp_component=?,height=?,weight=?,blood_type=?,complexion=?,has_medical_condition=?,
        medical_condition=?,medical_certificate=?,xray_file=?,cor_file=?,
        willing_to_take_advance_course=?,willing_to_be_medics=?,willing_to_be_military_police=?,
        company=NULL,battalion=NULL,rotc_company=NULL,rotc_platoon=NULL,special_unit=NULL,platoon=NULL
       WHERE id=?`,
      [
        body.religion,
        body.contact_number,
        body.temporary_barangay,
        body.temporary_municipality,
        body.temporary_province,
        body.permanent_barangay,
        body.permanent_municipality,
        body.permanent_province,
        body.emergency_contact_name,
        body.emergency_contact_address,
        body.emergency_contact_relationship,
        body.emergency_contact_contact_number,
        body.course,
        body.year_level,
        selectedProgram,
        body.height,
        body.weight,
        body.blood_type,
        body.complexion,
        hasMedicalCondition,
        hasMedicalCondition ? (body.medical_condition || '') : '',
        medicalCertificate,
        xrayFile,
        corFile,
        selectedProgram === 'ROTC'
          ? normalizeBooleanFlag(body.willing_to_take_advance_course ?? student.willing_to_take_advance_course)
          : 0,
        selectedProgram === 'ROTC'
          ? normalizeBooleanFlag(body.willing_to_be_medics ?? student.willing_to_be_medics)
          : 0,
        selectedProgram === 'ROTC'
          ? normalizeBooleanFlag(body.willing_to_be_military_police ?? student.willing_to_be_military_police)
          : 0,
        req.user.id,
      ]
    );

    await connection.execute(
      "INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program,rejection_reason) VALUES(?,?,?,'pending',?,NULL)",
      [req.user.id, String(schedule.id), targetLevel, selectedProgram]
    );

    await connection.commit();

    return res.json({
      message: mode === 'retry'
        ? `Your ${levelLabelFor(selectedProgram, targetLevel)} enrollment has been submitted again for administrator review.`
        : `${levelLabelFor(selectedProgram, targetLevel)} enrollment submitted successfully and is now pending administrator review.`,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors after the main failure.
    }

    return res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
};

exports.withdrawal = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const [rows] = await db.execute(
        'SELECT id,reason,status,admin_remarks,created_at FROM advance_course_withdrawals WHERE student_id=? ORDER BY created_at DESC LIMIT 1',
        [req.user.id]
      );

      return res.json(rows[0] || null);
    }

    const student = await studentById(req.user.id);
    if (
      student.nstp_component !== 'ROTC'
      || !Number(student.willing_to_take_advance_course)
    ) {
      return res.status(400).json({
        message: 'Withdrawal requests are available only to Advance Course students.',
      });
    }

    const reason = readLimitedText(req.body.reason, 2000);

    if (reason === null) {
      return res.status(400).json({
        message: 'Withdrawal reason is too long.',
      });
    }

    if (!reason || reason.length < 5) {
      return res.status(400).json({
        message: 'Please enter your reason for withdrawal.',
      });
    }

    const [pending] = await db.execute(
      "SELECT id FROM advance_course_withdrawals WHERE student_id=? AND status='pending' LIMIT 1",
      [req.user.id]
    );

    if (pending.length) {
      return res.status(409).json({
        message: 'You already have a pending withdrawal request.',
      });
    }

    await db.execute(
      'INSERT INTO advance_course_withdrawals(student_id,reason) VALUES(?,?)',
      [req.user.id, reason]
    );

    return res.json({ message: 'Withdrawal request submitted.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.certificateSettings = async (req, res) => {
  try {
    const [studentRows] = await db.execute(
      'SELECT nstp_component FROM students WHERE id=?',
      [req.user.id]
    );
    const program = studentRows[0]?.nstp_component;
    const [rows] = await db.execute(
      'SELECT * FROM serial_number_settings WHERE program=?',
      [program]
    );

    return res.json(rows[0] || {});
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.certificate = async (req, res) => {
  try {
    const [studentRows] = await db.execute(
      'SELECT * FROM students WHERE id=?',
      [req.user.id]
    );
    const student = studentRows[0];

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const [serialRows] = await db.execute(
      'SELECT * FROM serial_numbers WHERE student_id=? AND program=?',
      [req.user.id, student.nstp_component]
    );

    if (!serialRows[0]) {
      return res.status(404).json({ message: 'Certificate is not yet available.' });
    }

    const [settingsRows] = await db.execute(
      'SELECT * FROM serial_number_settings WHERE program=?',
      [student.nstp_component]
    );

    return await certificateService.certificatePdf(res, {
      student,
      serial: serialRows[0],
      settings: settingsRows[0] || {},
      program: student.nstp_component,
      assets: path.join(__dirname, '../public/images'),
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }
  }
};

exports.attendanceOffense = async (req, res) => {
  try {
    const offense = await offenseService.get(req.user.id);
    if (!offense) return res.json(null);
    const [records] = await db.execute(`SELECT ar.*,ses.program,ses.mi_number,ses.mi_type
      FROM attendance_records ar JOIN attendance_sessions ses ON ses.id=ar.attendance_session_id
      WHERE ar.student_id=? AND ar.status='absent' AND ar.false_present=1
      ORDER BY ar.verified_at DESC,ar.id DESC`, [req.user.id]);
    const updates = await decorateAttendanceUpdates(records);
    return res.json({ ...offense, updates: updates.map(row => ({
      program: row.program, mi_number: row.mi_number, mi_type: row.mi_type,
      verified_by_name: row.verified_by_name, verified_at: row.verified_at,
      reason: row.update_reason,
    })) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.acknowledgeAttendanceWarning = async (req, res) => {
  try {
    const offense = await offenseService.get(req.user.id);

    if (!offense || Number(offense.offend || 0) !== 1) {
      return res.status(400).json({ message: 'There is no warning to acknowledge.' });
    }

    const updated = await offenseService.acknowledge(req.user.id);
    return res.json({
      message: 'Attendance warning acknowledged.',
      offense: updated,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
