const path = require('path');
const XLSX = require('xlsx');
const db = require('../config/database');
const certificateService = require('../services/certificateService');
const gradesService = require('../services/gradesService');
const offenseService = require('../services/offenseService');
const platoonService = require('../services/platoonService');
const attendanceService = require('../services/attendanceService');
const {
  parsePositiveInt,
  parseIdList,
  readLevel,
  readSchoolYear,
  readSearchTerm,
  readLimitedText,
} = require('../services/requestValidationService');
const uploadValidation = require('../services/uploadValidationService');

function program(req) {
  const routeProgram = String(req.params.program || '').toUpperCase();
  if (routeProgram === 'ROTC' || routeProgram === 'CWTS') {
    return routeProgram;
  }

  return /cwts/i.test(req.user.portal) ? 'CWTS' : 'ROTC';
}

function levelPrefix(programCode) {
  return programCode === 'CWTS' ? 'CWTS' : 'MS';
}

function hasSettingValue(value) {
  return String(value || '').trim().length > 0;
}

function certificateSettingsComplete(settings, programCode) {
  return programCode === 'ROTC'
    ? Boolean(
      hasSettingValue(settings?.academic_year)
      && hasSettingValue(settings?.ceremony_date)
      && hasSettingValue(settings?.commandant || settings?.signatory_1_name)
      && hasSettingValue(settings?.school_registrar || settings?.signatory_2_name)
    )
    : Boolean(
      hasSettingValue(settings?.academic_year)
      && hasSettingValue(settings?.ceremony_date)
      && hasSettingValue(settings?.nstp_coordinator || settings?.signatory_1_name)
      && hasSettingValue(settings?.municipal_mayor || settings?.signatory_3_name)
      && hasSettingValue(settings?.bcc_president || settings?.signatory_2_name)
    );
}

function serialSignatories(settings, programCode) {
  return {
    signatoryOneName: programCode === 'ROTC' ? settings.commandant : settings.nstp_coordinator,
    signatoryOnePosition: programCode === 'ROTC' ? 'Commandant' : 'NSTP Coordinator',
    signatoryTwoName: programCode === 'ROTC' ? settings.school_registrar : settings.bcc_president,
    signatoryTwoPosition: programCode === 'ROTC' ? 'School Registrar' : 'BCC President',
    signatoryThreeName: programCode === 'ROTC' ? null : settings.municipal_mayor,
    signatoryThreePosition: programCode === 'ROTC' ? null : 'Municipal Mayor',
  };
}

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeText(value) {
  if (value == null) {
    return '';
  }

  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeKeyName(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeSex(value) {
  const normalized = normalizeText(value).toLowerCase();

  if (normalized === 'male' || normalized === 'm') {
    return 'Male';
  }

  if (normalized === 'female' || normalized === 'f') {
    return 'Female';
  }

  return '';
}

function parseWorksheetRows(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, {
    type: 'buffer',
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return [];
  }

  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });
}

function mapImportHeaders(headerRow) {
  const headerMap = {};

  headerRow.forEach((cell, index) => {
    const header = normalizeHeader(cell);

    if (!header) {
      return;
    }

    if (header.includes('serial number')) {
      headerMap.serial_number = index;
      return;
    }

    if (header === 'surname' || header === 'last name') {
      headerMap.last_name = index;
      return;
    }

    if (header === 'first name' || header === 'firstname') {
      headerMap.first_name = index;
      return;
    }

    if (header === 'middle name' || header === 'middlename') {
      headerMap.middle_name = index;
      return;
    }

    if (header === 'course') {
      headerMap.course = index;
      return;
    }

    if (header === 'platoon') {
      headerMap.platoon = index;
      return;
    }

    if (header === 'id no' || header === 'id no.' || header === 'id number' || header === 'student id') {
      headerMap.student_id = index;
      return;
    }

    if (header === 'birthdate') {
      headerMap.birthdate = index;
      return;
    }

    if (header === 'sex') {
      headerMap.sex = index;
      return;
    }

    if (header === 'barangay') {
      headerMap.barangay = index;
      return;
    }

    if (header === 'present address' || header === 'address') {
      headerMap.present_address = index;
      return;
    }
  });

  return headerMap;
}

function extractImportRows(sheetRows) {
  const headerIndex = sheetRows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell)).filter(Boolean);
    return normalized.includes('serial number') && normalized.some((cell) => cell === 'id no' || cell === 'id no.' || cell === 'id number' || cell === 'student id');
  });

  if (headerIndex < 0) {
    throw new Error('Excel headers were not recognized. Include Serial Number and ID No. columns.');
  }

  const headerMap = mapImportHeaders(sheetRows[headerIndex] || []);
  if (headerMap.serial_number == null || headerMap.student_id == null) {
    throw new Error('Excel file must include Serial Number and ID No. columns.');
  }

  return sheetRows.slice(headerIndex + 1).map((row, index) => {
    const get = (key) => {
      const columnIndex = headerMap[key];
      return columnIndex == null ? '' : normalizeText(row[columnIndex]);
    };

    return {
      excel_row: headerIndex + index + 2,
      serial_number: get('serial_number').toUpperCase(),
      student_id: get('student_id'),
      last_name: get('last_name'),
      first_name: get('first_name'),
      middle_name: get('middle_name'),
      course: get('course'),
      platoon: get('platoon'),
      birthdate: get('birthdate'),
      sex: normalizeSex(get('sex')),
      barangay: get('barangay'),
      present_address: get('present_address'),
    };
  }).filter((row) => (
    row.serial_number
    || row.student_id
    || row.last_name
    || row.first_name
  ));
}

function namesMatch(student, row) {
  const firstMatches = !row.first_name || normalizeKeyName(student.first_name) === normalizeKeyName(row.first_name);
  const lastMatches = !row.last_name || normalizeKeyName(student.last_name) === normalizeKeyName(row.last_name);
  const middleMatches = !row.middle_name
    || !student.middle_name
    || normalizeKeyName(student.middle_name) === normalizeKeyName(row.middle_name);

  return firstMatches && lastMatches && middleMatches;
}

function updateStudentFromImport(student, row) {
  return {
    first_name: row.first_name || student.first_name,
    middle_name: row.middle_name || student.middle_name,
    last_name: row.last_name || student.last_name,
    course: row.course || student.course,
    birthdate: row.birthdate || student.birthdate,
    sex: row.sex || student.sex,
    temporary_barangay: row.barangay || student.temporary_barangay,
    platoon: row.platoon || student.platoon,
  };
}

function selectDashboardSchedule(schedules) {
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

function approvedStudentExistsSql() {
  return `EXISTS(
    SELECT 1
    FROM student_ms_records smr
    WHERE smr.student_id=s.id
      AND smr.program=?
      AND smr.status='approved'
  )`;
}

function normalizedRosterGroup(group) {
  const value = String(group || '').toLowerCase();
  if (['battalion-1', 'battalion-2', 'advance-course', 'special-platoon'].includes(value)) {
    return value;
  }
  return 'overall';
}

async function approvedRecordRows(programCode, filters = {}) {
  const msLevel = readLevel(filters.msLevel, { allowBlank: true });
  const schoolYear = readSchoolYear(filters.schoolYear, { allowBlank: true });
  const search = readSearchTerm(filters.search, { allowBlank: true });

  if (msLevel === null || schoolYear === null || search === null) {
    return [];
  }

  const query = `%${String(search || '').replace(/[!%_]/g, '!$&')}%`;
  const params = [
    programCode,
    msLevel,
    msLevel,
    schoolYear,
    schoolYear,
    search,
    query,
    query,
    query,
    query,
    query,
  ];

  const [rows] = await db.execute(
    `SELECT smr.id record_id,smr.ms_level,smr.status,smr.created_at,
            COALESCE(es.year,'') school_year,
            s.id student_db_id,s.student_id,s.first_name,s.middle_name,s.last_name,s.suffix,
            s.course,s.year_level,s.nstp_component,s.sex,s.birthdate,s.email,s.contact_number,
            s.place_of_birth,s.religion,s.height,s.weight,s.blood_type,s.complexion,s.photo,
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
    params
  );

  return rows;
}

exports.dashboard = async (req, res) => {
  try {
    const programCode = program(req);
    const [schedules] = await db.execute(
      `SELECT id, program, ms_level, year, open_date, deadline
       FROM enrollment_schedules
       WHERE program=?
       ORDER BY id DESC`,
      [programCode]
    );

    const dashboardSchedule = selectDashboardSchedule(schedules);

    const scheduleId = dashboardSchedule ? Number(dashboardSchedule.id) : null;

    const [[counts]] = await db.execute(
      `SELECT COUNT(*) total,
              SUM(smr.status='pending') pending,
              SUM(smr.status='approved') approved,
              SUM(smr.status='rejected') rejected
       FROM student_ms_records smr
       JOIN students s ON s.id=smr.student_id
       WHERE smr.program=? AND s.role='student'
         AND (? IS NULL OR CAST(smr.schedule_id AS UNSIGNED)=?)`,
      [programCode, scheduleId, scheduleId]
    );

    const [[assigned]] = await db.execute(
      `SELECT
         SUM(
           CASE
             WHEN ?='CWTS' THEN s.company IS NOT NULL
              ELSE (s.rotc_company IS NOT NULL OR s.special_unit IS NOT NULL)
           END
         ) assigned,
         SUM(s.battalion=1 AND COALESCE(s.special_unit,'')='' AND COALESCE(s.willing_to_take_advance_course,0)<>1) battalion_1,
         SUM(s.battalion=2 AND COALESCE(s.special_unit,'')='' AND COALESCE(s.willing_to_take_advance_course,0)<>1) battalion_2,
         SUM(COALESCE(s.willing_to_take_advance_course,0)=1 AND COALESCE(s.special_unit,'')='') advance_course,
         SUM(COALESCE(s.special_unit,'')<>'') special_platoons,
         SUM(s.company='Alpha') company_alpha,
         SUM(s.company='Bravo') company_bravo,
         SUM(s.company='Charlie') company_charlie,
         SUM(s.company='Delta') company_delta,
         SUM(s.company='Echo') company_echo,
         SUM(s.company='Foxtrot') company_foxtrot
       FROM students s
       JOIN student_ms_records smr ON smr.student_id=s.id
       WHERE s.nstp_component=? AND s.role='student'
         AND smr.program=?
         AND smr.status='approved'
         AND (? IS NULL OR CAST(smr.schedule_id AS UNSIGNED)=?)
         AND smr.id=(
           SELECT MAX(x.id)
           FROM student_ms_records x
           WHERE x.student_id=s.id
             AND x.program=smr.program
             AND x.status='approved'
             AND (? IS NULL OR CAST(x.schedule_id AS UNSIGNED)=?)
         )`,
      [programCode, programCode, programCode, scheduleId, scheduleId, scheduleId, scheduleId]
    );

    return res.json({
      program: programCode,
      ...counts,
      assigned: assigned.assigned || 0,
      ...(programCode === 'ROTC' ? {
        distribution: {
          battalion_1: Number(assigned.battalion_1 || 0),
          battalion_2: Number(assigned.battalion_2 || 0),
          advance_course: Number(assigned.advance_course || 0),
          special_platoons: Number(assigned.special_platoons || 0),
        },
      } : {
        distribution: {
          Alpha: Number(assigned.company_alpha || 0),
          Bravo: Number(assigned.company_bravo || 0),
          Charlie: Number(assigned.company_charlie || 0),
          Delta: Number(assigned.company_delta || 0),
          Echo: Number(assigned.company_echo || 0),
          Foxtrot: Number(assigned.company_foxtrot || 0),
        },
      }),
      schedule: dashboardSchedule
        ? {
            id: dashboardSchedule.id,
            ms_level: String(dashboardSchedule.ms_level || ''),
            year: dashboardSchedule.year,
            open_date: dashboardSchedule.open_date,
            deadline: dashboardSchedule.deadline,
          }
        : null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.schedules = async (req, res) => {
  try {
    const programCode = program(req);

    if (req.method === 'GET') {
      const [rows] = await db.execute(
        'SELECT * FROM enrollment_schedules WHERE program=? ORDER BY year DESC, ms_level DESC, id DESC',
        [programCode]
      );
      return res.json(rows);
    }

    const {
      ms_level: msLevel,
      year,
      open_date: openDate,
      deadline,
    } = req.body;

    const normalizedLevel = String(msLevel || '');
    const normalizedYear = String(year || '').trim();

    if (!['1', '2'].includes(normalizedLevel)) {
      return res.status(400).json({ message: 'Select a valid enrollment level.' });
    }

    if (!normalizedYear || !openDate || !deadline) {
      return res.status(400).json({
        message: 'Complete the school year, opening date, and deadline.',
      });
    }

    const open = new Date(openDate);
    const end = new Date(deadline);

    if (Number.isNaN(open.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Enter valid enrollment dates and times.' });
    }

    if (end.getTime() <= open.getTime()) {
      return res.status(400).json({
        message: 'The closing date/time must be later than the opening date/time.',
      });
    }

    const now = Date.now();
    const [existing] = await db.execute(
      'SELECT id,ms_level,year,open_date,deadline FROM enrollment_schedules WHERE program=? ORDER BY year DESC, ms_level DESC, id DESC',
      [programCode]
    );
    const blocking = existing.find((schedule) => now <= new Date(schedule.deadline).getTime());

    if (blocking) {
      return res.status(409).json({
        message: `A current or upcoming ${programCode} enrollment schedule already exists. Wait until it closes before creating a new schedule.`,
      });
    }

    const [duplicates] = await db.execute(
      'SELECT id FROM enrollment_schedules WHERE program=? AND ms_level=? AND year=? LIMIT 1',
      [programCode, normalizedLevel, normalizedYear]
    );

    if (duplicates.length) {
      return res.status(409).json({
        message: `A ${levelPrefix(programCode)} ${normalizedLevel} schedule for SY ${normalizedYear} already exists.`,
      });
    }

    await db.execute(
      'INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline) VALUES(?,?,?,?,?)',
      [programCode, normalizedLevel, normalizedYear, openDate, deadline]
    );

    return res.json({ message: `${programCode} enrollment schedule created successfully.` });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.enrollments = async (req, res) => {
  try {
    const programCode = program(req);
    const [rows] = await db.execute(
      `SELECT
         smr.id record_id,smr.schedule_id,smr.status,smr.ms_level,smr.rejection_reason,smr.created_at,
         COALESCE(es.year,'') school_year,
         s.id,s.student_id,s.last_name,s.first_name,s.middle_name,s.suffix,s.email,s.contact_number,
         s.sex,s.course,s.year_level,s.nstp_component,s.has_medical_condition,s.medical_condition,
         s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,
         s.willing_to_take_advance_course,s.willing_to_be_medics,s.willing_to_be_military_police
       FROM student_ms_records smr
       JOIN students s ON s.id=smr.student_id
       LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
       WHERE smr.program=? AND s.role='student'
       ORDER BY smr.created_at DESC`,
      [programCode]
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.deleteEnrollmentStudent = async (req, res) => {
  const recordId = parsePositiveInt(req.params.id);
  if (!recordId) return res.status(400).json({ message: 'Select a valid enrollment record.' });

  let connection;
  try {
    const programCode = program(req);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [[student]] = await connection.execute(
      `SELECT s.id,s.student_id,smr.status FROM students s
       JOIN student_ms_records smr ON smr.student_id=s.id
       WHERE smr.id=? AND smr.program=? AND s.nstp_component=? AND s.role='student'
       FOR UPDATE`,
      [recordId, programCode, programCode]
    );
    if (!student) {
      await connection.rollback();
      return res.status(404).json({ message: 'Student enrollment not found in this program.' });
    }
    if (!['pending', 'rejected'].includes(student.status)) {
      await connection.rollback();
      return res.status(409).json({ message: 'Only pending or rejected students can be deleted.' });
    }
    const [approvedEnrollments] = await connection.execute(
      "SELECT id FROM student_ms_records WHERE student_id=? AND status='approved' LIMIT 1 FOR UPDATE",
      [student.id]
    );
    if (approvedEnrollments.length) {
      await connection.rollback();
      return res.status(409).json({ message: 'This student has an approved enrollment in another level. Their account cannot be deleted.' });
    }
    if (String(req.body?.confirm_student_id || '').trim() !== student.student_id) {
      await connection.rollback();
      return res.status(400).json({ message: 'Enter the matching Student ID to confirm deletion.' });
    }
    // Foreign keys cascade to the student's enrollments, attendance, grades,
    // offenses, serial numbers, reset codes, and withdrawal requests.
    await connection.execute(
      "DELETE FROM students WHERE id=? AND nstp_component=? AND role='student'",
      [student.id, programCode]
    );
    await connection.commit();
    return res.json({ message: 'Student account and linked records deleted.' });
  } catch (error) {
    if (connection) await connection.rollback();
    return res.status(500).json({ message: error.message });
  } finally {
    if (connection) connection.release();
  }
};

exports.editEnrollmentStudent = async (req, res) => {
  try {
    const recordId = parsePositiveInt(req.params.id);
    if (!recordId) return res.status(400).json({ message: 'Select a valid enrollment record.' });
    const fields = {
      first_name: 100, middle_name: 100, last_name: 100, suffix: 20,
      contact_number: 30, email: 255, course: 255, year_level: 20,
      temporary_barangay: 255, temporary_municipality: 255, temporary_province: 255,
      permanent_barangay: 255, permanent_municipality: 255, permanent_province: 255,
    };
    const updates = [];
    const values = [];
    for (const [field, limit] of Object.entries(fields)) {
      if (!Object.hasOwn(req.body || {}, field)) continue;
      if (typeof req.body[field] !== 'string') return res.status(400).json({ message: 'Enter valid student information.' });
      const value = req.body[field].trim();
      if (value.length > limit || (['first_name', 'last_name', 'email', 'course', 'year_level'].includes(field) && !value)) {
        return res.status(400).json({ message: `Enter a valid ${field.replace(/_/g, ' ')} (maximum ${limit} characters).` });
      }
      if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return res.status(400).json({ message: 'Enter a valid email address.' });
      if (field === 'year_level' && !['1st Year', '2nd Year', '3rd Year', '4th Year'].includes(value)) return res.status(400).json({ message: 'Select a valid year level.' });
      updates.push(`s.${field}=?`);
      values.push(value);
    }
    if (!updates.length) return res.status(400).json({ message: 'No editable information was provided.' });
    const programCode = program(req);
    const [result] = await db.execute(
      `UPDATE students s JOIN student_ms_records smr ON smr.student_id=s.id
       SET ${updates.join(',')},s.updated_at=CURRENT_TIMESTAMP
       WHERE smr.id=? AND smr.program=? AND s.nstp_component=? AND s.role='student'`,
      [...values, recordId, programCode, programCode]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Student enrollment not found in this program.' });
    return res.json({ message: 'Student information updated.' });
  } catch (error) {
    return res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ message: error.code === 'ER_DUP_ENTRY' ? 'That email address is already used by another account.' : error.message });
  }
};

exports.enrollmentDetail = async (req, res) => {
  try {
    const programCode = program(req);
    const recordId = parsePositiveInt(req.params.id);

    if (!recordId) {
      return res.status(400).json({ message: 'Select a valid enrollment record.' });
    }

    const [[row]] = await db.execute(
      `SELECT smr.id record_id,smr.schedule_id,smr.status,smr.ms_level,smr.rejection_reason,smr.created_at,
              COALESCE(es.year,'') school_year,s.*
       FROM student_ms_records smr
       JOIN students s ON s.id=smr.student_id
       LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
       WHERE smr.id=? AND smr.program=? AND s.role='student'
       LIMIT 1`,
      [recordId, programCode]
    );

    if (!row) {
      return res.status(404).json({ message: 'Enrollment record not found.' });
    }

    delete row.password;
    return res.json(row);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateEnrollment = async (req, res) => {
  try {
    const programCode = program(req);
    const recordId = parsePositiveInt(req.params.id);
    const { status, rejection_reason: rejectionReason } = req.body;
    const safeRejectionReason = readLimitedText(rejectionReason, 1000);

    if (!recordId) {
      return res.status(400).json({ message: 'Select a valid enrollment record.' });
    }

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    if (safeRejectionReason === null) {
      return res.status(400).json({ message: 'Rejection reason is too long.' });
    }

    const [[record]] = await db.execute(
      `SELECT smr.*,s.has_medical_condition,s.medical_condition,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit
       FROM student_ms_records smr
       JOIN students s ON s.id=smr.student_id
       WHERE smr.id=? AND smr.program=?`,
      [recordId, programCode]
    );

    if (!record) {
      return res.status(404).json({ message: 'Enrollment record not found.' });
    }

    await db.execute(
      'UPDATE student_ms_records SET status=?,rejection_reason=? WHERE id=?',
      [status, status === 'rejected' ? (safeRejectionReason || 'Please contact your NSTP administrator.') : null, recordId]
    );

    if (status !== 'approved') {
      return res.json({ message: `Enrollment ${status}.` });
    }

    if (
      String(record.ms_level) === '2'
      && (record.company || record.battalion || record.rotc_company || record.special_unit)
    ) {
      return res.json({ message: 'Enrollment approved. Existing assignment retained.' });
    }

    if (programCode === 'CWTS') {
      const companies = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
      const limit = 60;
      const [counts] = await db.execute(
        `SELECT company,COUNT(*) total
         FROM students s
         WHERE s.nstp_component='CWTS'
           AND s.company IS NOT NULL
           AND EXISTS(SELECT 1 FROM student_ms_records r WHERE r.student_id=s.id AND r.status='approved')
         GROUP BY company`
      );
      const map = Object.fromEntries(companies.map((company) => [company, 0]));
      counts.forEach((row) => {
        map[row.company] = Number(row.total);
      });

        const company = companies.find((item) => map[item] < limit);
      if (!company) {
        await db.execute("UPDATE student_ms_records SET status='pending' WHERE id=?", [recordId]);
        return res.status(409).json({
          message: 'All CWTS companies are full. Enrollment was left pending.',
        });
      }

      await db.execute('UPDATE students SET company=? WHERE id=?', [company, record.student_id]);
      return res.json({
        message: `Enrollment approved and automatically assigned to ${company} Company.`,
      });
    }

    const [[preference]] = await db.execute(
      'SELECT has_medical_condition,willing_to_be_medics,willing_to_be_military_police,willing_to_take_advance_course FROM students WHERE id=?',
      [record.student_id]
    );

    const unit = platoonService.specialUnitForStudent(preference);
    if (unit) {
      if (unit !== 'HQ') {
        const [[count]] = await db.execute(
          "SELECT COUNT(*) total FROM students s WHERE s.special_unit=? AND EXISTS(SELECT 1 FROM student_ms_records r WHERE r.student_id=s.id AND r.status='approved')",
          [unit]
        );

        if (Number(count.total || 0) >= 37) {
          await db.execute("UPDATE student_ms_records SET status='pending' WHERE id=?", [recordId]);
          return res.status(409).json({
            message: `${unit} is already full (37/37). Enrollment was left pending.`,
          });
        }
      }

      await db.execute(
        'UPDATE students SET special_unit=?,platoon=?,battalion=NULL,rotc_company=NULL,rotc_platoon=NULL WHERE id=?',
        [unit, unit, record.student_id]
      );

      return res.json({ message: `Enrollment approved. Cadet assigned to ${unit}.` });
    }

    await db.execute(
      'UPDATE students SET battalion=NULL,rotc_company=NULL,rotc_platoon=NULL,special_unit=NULL WHERE id=?',
      [record.student_id]
    );

    if (Number(preference?.willing_to_take_advance_course || 0) === 1) {
      return res.json({ message: 'Enrollment approved. Cadet added to the Advance Course list.' });
    }

    return res.json({
      message: 'Enrollment approved. Cadet is ready for automatic platoon assignment after enrollment closes.',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.bulkApprove = async (req, res) => {
  try {
    const programCode = program(req);
    const ids = parseIdList(req.body.ids);

    if (!ids.length) {
      return res.status(400).json({ message: 'No pending enrollment records selected.' });
    }

    let approved = 0;
    let skipped = 0;
    let failed = 0;
    const messages = [];

    for (const id of ids) {
      try {
        const [[record]] = await db.execute(
          `SELECT smr.*,s.has_medical_condition,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit
           FROM student_ms_records smr
           JOIN students s ON s.id=smr.student_id
           WHERE smr.id=? AND smr.program=?`,
          [id, programCode]
        );

        if (!record || record.status !== 'pending') {
          skipped += 1;
          continue;
        }

        if (programCode === 'CWTS') {
          const companies = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
          const limit = 60;
          const [counts] = await db.execute(
            `SELECT s.company,COUNT(DISTINCT s.id) total
             FROM students s
             WHERE s.nstp_component='CWTS'
               AND s.company IS NOT NULL
               AND EXISTS(SELECT 1 FROM student_ms_records r WHERE r.student_id=s.id AND r.status='approved')
             GROUP BY s.company`
          );
          const map = Object.fromEntries(companies.map((company) => [company, 0]));
          counts.forEach((row) => {
            map[row.company] = Number(row.total);
          });

          const company = companies.find((item) => map[item] < limit);
          if (!company) {
            failed += 1;
            messages.push('CWTS companies are full.');
            continue;
          }

          await db.execute(
            "UPDATE student_ms_records SET status='approved',rejection_reason=NULL WHERE id=?",
            [id]
          );

          if (String(record.ms_level) !== '2' || !record.company) {
            await db.execute('UPDATE students SET company=? WHERE id=?', [company, record.student_id]);
          }
        } else {
          await db.execute(
            "UPDATE student_ms_records SET status='approved',rejection_reason=NULL WHERE id=?",
            [id]
          );

          if (String(record.ms_level) !== '2') {
            const [[preference]] = await db.execute(
              'SELECT has_medical_condition,willing_to_be_medics,willing_to_be_military_police,willing_to_take_advance_course FROM students WHERE id=?',
              [record.student_id]
            );

            const unit = platoonService.specialUnitForStudent(preference);
            if (unit) {
              if (unit !== 'HQ') {
                const [[count]] = await db.execute(
                  "SELECT COUNT(*) total FROM students s WHERE s.special_unit=? AND EXISTS(SELECT 1 FROM student_ms_records r WHERE r.student_id=s.id AND r.status='approved')",
                  [unit]
                );

                if (Number(count.total || 0) >= 37) {
                  await db.execute("UPDATE student_ms_records SET status='pending' WHERE id=?", [id]);
                  failed += 1;
                  approved -= 1;
                  continue;
                }
              }

              await db.execute(
                'UPDATE students SET special_unit=?,platoon=?,battalion=NULL,rotc_company=NULL,rotc_platoon=NULL WHERE id=?',
                [unit, unit, record.student_id]
              );
            } else {
              await db.execute(
                'UPDATE students SET special_unit=NULL,battalion=NULL,rotc_company=NULL,rotc_platoon=NULL WHERE id=?',
                [record.student_id]
              );
            }
          }
        }

        approved += 1;
      } catch (error) {
        failed += 1;
        messages.push(error.message);
      }
    }

    return res.json({
      message: `Bulk review complete: ${approved} approved, ${skipped} skipped, ${failed} failed.`,
      approved,
      skipped,
      failed,
      details: messages.slice(0, 3),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.bulkReject = async (req, res) => {
  try {
    const programCode = program(req);
    const ids = parseIdList(req.body.ids);
    const rejectionReason = readLimitedText(req.body.rejection_reason, 1000);

    if (!ids.length) {
      return res.status(400).json({ message: 'No pending enrollment records selected.' });
    }

    if (rejectionReason === null) {
      return res.status(400).json({
        message: 'Rejection reason is too long.',
      });
    }

    if (!rejectionReason) {
      return res.status(400).json({
        message: 'Enter the reason for rejecting the selected enrollments.',
      });
    }

    let rejected = 0;
    let skipped = 0;
    let failed = 0;
    const messages = [];

    for (const id of ids) {
      try {
        const [[record]] = await db.execute(
          'SELECT id,status FROM student_ms_records WHERE id=? AND program=? LIMIT 1',
          [id, programCode]
        );

        if (!record || record.status !== 'pending') {
          skipped += 1;
          continue;
        }

        await db.execute(
          "UPDATE student_ms_records SET status='rejected',rejection_reason=? WHERE id=?",
          [rejectionReason, id]
        );
        rejected += 1;
      } catch (error) {
        failed += 1;
        messages.push(error.message);
      }
    }

    return res.json({
      message: `Bulk review complete: ${rejected} rejected, ${skipped} skipped, ${failed} failed.`,
      rejected,
      skipped,
      failed,
      details: messages.slice(0, 3),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.roster = async (req, res) => {
  try {
    const programCode = program(req);
    const requestedLevel = readLevel(req.query.ms_level, { allowBlank: true });
    const requestedYear = readSchoolYear(req.query.school_year, { allowBlank: true });
    const includeAllCycles = String(req.query.all_cycles || '').trim() === '1';

    if (requestedLevel === null) {
      return res.status(400).json({ message: 'Select a valid enrollment level.' });
    }

    if (requestedYear === null) {
      return res.status(400).json({ message: 'Select a valid school year.' });
    }

    const [schedules] = await db.execute(
      `SELECT id, program, ms_level, year, open_date, deadline
       FROM enrollment_schedules
       WHERE program=?
       ORDER BY id DESC`,
      [programCode]
    );

    let selectedSchedule = null;
    if (requestedLevel || requestedYear) {
      selectedSchedule = schedules.find((schedule) => (
        (!requestedLevel || String(schedule.ms_level || '') === requestedLevel)
        && (!requestedYear || String(schedule.year || '') === requestedYear)
      )) || null;
    } else {
      selectedSchedule = selectDashboardSchedule(schedules);
    }

    const selectedScheduleId = !includeAllCycles && selectedSchedule ? Number(selectedSchedule.id) : null;
    const levelFilter = selectedScheduleId == null ? requestedLevel : '';
    const yearFilter = selectedScheduleId == null ? requestedYear : '';
    const params = [programCode, programCode, selectedScheduleId, selectedScheduleId, levelFilter, levelFilter, yearFilter, yearFilter];

    const [rows] = await db.execute(
      `SELECT s.id,s.student_id,s.first_name,s.middle_name,s.last_name,s.suffix,s.sex,s.course,s.year_level,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,s.has_medical_condition,s.medical_condition,s.willing_to_take_advance_course,s.willing_to_be_medics,s.willing_to_be_military_police,smr.ms_level,COALESCE(es.year,'') school_year
       FROM students s
       LEFT JOIN (
         SELECT student_id,MAX(updated_at) AS approved_at
         FROM advance_course_withdrawals
         WHERE status='approved'
         GROUP BY student_id
       ) withdrawal_order ON withdrawal_order.student_id=s.id
         AND s.nstp_component='ROTC'
         AND COALESCE(s.willing_to_take_advance_course,0)=0
         AND s.special_unit IS NULL
       JOIN student_ms_records smr ON smr.student_id=s.id
       LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
       WHERE s.nstp_component=? AND smr.program=? AND smr.status='approved'
         AND (? IS NULL OR CAST(smr.schedule_id AS UNSIGNED)=?)
         AND (?='' OR smr.ms_level=?)
         AND (?='' OR COALESCE(es.year,'')=?)
         AND smr.id=(SELECT MAX(x.id) FROM student_ms_records x WHERE x.student_id=s.id AND x.program=smr.program AND x.ms_level=smr.ms_level)
       ORDER BY (withdrawal_order.approved_at IS NOT NULL),withdrawal_order.approved_at,
                CASE WHEN withdrawal_order.approved_at IS NOT NULL THEN s.id END,
                s.last_name,s.first_name,s.id`,
      params
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.autoAssign = async (req, res) => {
  try {
    const programCode = program(req);

    if (programCode === 'CWTS') {
      return res.status(400).json({
        message: 'CWTS company assignment happens automatically during approval, matching the system.',
      });
    }

    const msLevel = readLevel(req.body.ms_level || req.query.ms_level || '1');
    const requestedYear = readSchoolYear(req.body.school_year || req.query.school_year || '', { allowBlank: true });

    if (!msLevel) {
      return res.status(400).json({ message: 'Select a valid MS level.' });
    }

    if (requestedYear === null) {
      return res.status(400).json({ message: 'Select a valid school year.' });
    }

    const [scheduleRows] = await db.execute(
      `SELECT * FROM enrollment_schedules
       WHERE program='ROTC' AND ms_level=?
         AND (?='' OR year=?)
       ORDER BY id DESC LIMIT 1`,
      [msLevel, requestedYear, requestedYear]
    );
    const selectedSchedule = scheduleRows[0] || null;

    if (selectedSchedule && Date.now() <= new Date(selectedSchedule.deadline).getTime()) {
      return res.status(400).json({
        message: `Wait until the MS ${msLevel}${selectedSchedule.year ? ` (${selectedSchedule.year})` : ''} enrollment schedule closes before assigning platoons.`,
      });
    }

    if (requestedYear && !selectedSchedule) {
      return res.status(400).json({
        message: `No ROTC enrollment schedule found for MS ${msLevel} in school year ${requestedYear}.`,
      });
    }

    const selectedScheduleId = selectedSchedule ? Number(selectedSchedule.id) : null;
    const requestedYearFilter = selectedSchedule ? '' : requestedYear;
    const queryParams = [msLevel, selectedScheduleId, selectedScheduleId, requestedYearFilter, requestedYearFilter, msLevel];

    const [rows] = await db.execute(
      `SELECT s.id,s.last_name,s.first_name,s.middle_name,s.suffix,s.sex,s.rotc_company,s.rotc_platoon,s.special_unit,s.has_medical_condition,s.willing_to_take_advance_course,s.willing_to_be_medics,s.willing_to_be_military_police
       FROM students s
       JOIN student_ms_records r ON r.student_id=s.id
       LEFT JOIN enrollment_schedules es ON CAST(r.schedule_id AS UNSIGNED)=es.id
       WHERE s.nstp_component='ROTC' AND r.ms_level=? AND r.status='approved'
         AND (? IS NULL OR CAST(r.schedule_id AS UNSIGNED)=?)
         AND (?='' OR COALESCE(es.year,'')=?)
         AND r.id=(SELECT MAX(x.id) FROM student_ms_records x WHERE x.student_id=s.id AND x.ms_level=?)
       ORDER BY s.last_name,s.first_name,s.middle_name,s.id`,
      queryParams
    );

    const maleCompanies = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
    const femaleCompanies = ['Echo', 'Foxtrot', 'Golf', 'Hotel'];
    const platoons = 4;
    const slot = 37;

    const candidates = rows.filter((student) => (
      !student.rotc_company
      && !student.special_unit
      && !student.has_medical_condition
      && !student.willing_to_take_advance_course
      && !student.willing_to_be_medics
      && !student.willing_to_be_military_police
    ));

    const assignedExisting = rows.filter((student) => student.rotc_company && !student.special_unit);

    function countsFor(companies, sex) {
      const counts = {};
      for (const company of companies) {
        for (let platoon = 1; platoon <= platoons; platoon += 1) {
          counts[`${company}|${platoon}`] = 0;
        }
      }

      for (const student of assignedExisting.filter((row) => row.sex === sex)) {
        const key = `${student.rotc_company}|${student.rotc_platoon}`;
        if (key in counts) counts[key] += 1;
      }

      return counts;
    }

    async function assignGroup(list, battalion, companies, counts) {
      let assigned = 0;

      for (const student of [...list].sort((a, b) => {
        const last = String(a.last_name || '').localeCompare(String(b.last_name || ''), undefined, { sensitivity: 'base' });
        if (last) return last;

        const first = String(a.first_name || '').localeCompare(String(b.first_name || ''), undefined, { sensitivity: 'base' });
        if (first) return first;

        const middle = String(a.middle_name || '').localeCompare(String(b.middle_name || ''), undefined, { sensitivity: 'base' });
        if (middle) return middle;

        return Number(a.id) - Number(b.id);
      })) {
        let choice = null;

        outer:
        for (const company of companies) {
          for (let platoon = 1; platoon <= platoons; platoon += 1) {
            const key = `${company}|${platoon}`;
            if (counts[key] < slot) {
              choice = { company, platoon, key };
              break outer;
            }
          }
        }

        if (!choice) break;

        await db.execute(
          'UPDATE students SET battalion=?,rotc_company=?,rotc_platoon=?,platoon=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
          [battalion, choice.company, choice.platoon, `${choice.company} - Platoon ${choice.platoon}`, student.id]
        );

        counts[choice.key] += 1;
        assigned += 1;
      }

      return assigned;
    }

    const males = candidates.filter((student) => student.sex === 'Male');
    const females = candidates.filter((student) => student.sex === 'Female');
    const battalionOneAssigned = await assignGroup(
      males,
      1,
      maleCompanies,
      countsFor(maleCompanies, 'Male')
    );
    const battalionTwoAssigned = await assignGroup(
      females,
      2,
      femaleCompanies,
      countsFor(femaleCompanies, 'Female')
    );

    return res.json({
      message: `Automatic platoon assignment complete for MS ${msLevel}${selectedSchedule?.year ? ` (${selectedSchedule.year})` : requestedYear ? ` (${requestedYear})` : ''}. ${battalionOneAssigned + battalionTwoAssigned} cadet(s) assigned.`,
      assigned: battalionOneAssigned + battalionTwoAssigned,
      alreadyAssigned: rows.length - candidates.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
};

exports.grades = async (req, res) => {
  try {
    const programCode = program(req);

    if (req.method === 'GET') {
      const [students] = await db.execute(
        `SELECT s.id student_id,s.student_id student_no,s.first_name,s.middle_name,s.last_name,s.suffix,
                s.course,s.year_level,s.sex,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,
                s.willing_to_take_advance_course,
                MAX(CASE WHEN smr.ms_level='1' AND smr.status='approved' THEN 1 ELSE 0 END) approved_ms1,
                MAX(CASE WHEN smr.ms_level='2' AND smr.status='approved' THEN 1 ELSE 0 END) approved_ms2,
                MAX(CASE WHEN smr.ms_level='1' AND smr.status='approved' THEN es.year END) ms1_year,
                MAX(CASE WHEN smr.ms_level='2' AND smr.status='approved' THEN es.year END) ms2_year
         FROM students s
         JOIN student_ms_records smr ON smr.student_id=s.id AND smr.program=?
         LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
         WHERE s.nstp_component=? AND s.role='student'
         GROUP BY s.id
         HAVING approved_ms1=1 OR approved_ms2=1
         ORDER BY s.last_name,s.first_name`,
        [programCode, programCode]
      );
      const [grades] = await db.execute(
        'SELECT id,student_id,ms_level,midterm,final_term,grade,status,program,updated_at FROM student_grades WHERE program=?',
        [programCode]
      );

      return res.json({ students, grades });
    }

    const { student_id: rawStudentId, ms_level: msLevel, midterm, final_term: finalTerm } = req.body;
    const studentId = parsePositiveInt(rawStudentId);
    const level = readLevel(msLevel);

    if (!studentId) {
      return res.status(400).json({ message: 'Select a valid student.' });
    }

    if (!level) {
      return res.status(400).json({ message: 'Select a valid MS/CWTS level.' });
    }

    const [[approved]] = await db.execute(
      "SELECT COUNT(*) total FROM student_ms_records WHERE student_id=? AND program=? AND ms_level=? AND status='approved'",
      [studentId, programCode, level]
    );

    if (!Number(approved.total)) {
      return res.status(400).json({
        message: `This student does not have an approved ${levelPrefix(programCode)} ${level} enrollment.`,
      });
    }

    const mid = Number(midterm);
    const fin = Number(finalTerm);
    if (!Number.isFinite(mid) || !Number.isFinite(fin) || mid < 1 || mid > 5 || fin < 1 || fin > 5) {
      return res.status(400).json({
        message: 'Midterm and final grades must be from 1.00 to 5.00.',
      });
    }

    const grade = gradesService.calculateGrade(mid, fin);
    const status = gradesService.statusFromGrade(grade);

    await db.execute(
      `INSERT INTO student_grades(student_id,ms_level,midterm,final_term,grade,status,program)
       VALUES(?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         midterm=VALUES(midterm),
         final_term=VALUES(final_term),
         grade=VALUES(grade),
         status=VALUES(status),
         updated_at=CURRENT_TIMESTAMP`,
      [studentId, level, mid, fin, grade, status, programCode]
    );

    return res.json({
      message: 'Grades saved successfully.',
      grade,
      status,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.offenses = async (req, res) => {
  try {
    const programCode = program(req);

    if (req.method === 'GET') {
      const [rows] = await db.execute(
        `SELECT
           o.id,o.student_id,o.offend,o.settled,o.warning_acknowledged_at,o.created_at,o.updated_at,
           s.student_id AS student_no,s.first_name,s.middle_name,s.last_name,s.suffix,s.course,s.year_level,
           (
             SELECT smr.ms_level
             FROM student_ms_records smr
             WHERE smr.student_id=s.id AND smr.program=? AND smr.status='approved'
             ORDER BY smr.created_at DESC,smr.id DESC LIMIT 1
           ) AS ms_level,
           (
             SELECT es.year
             FROM student_ms_records smr2
             LEFT JOIN enrollment_schedules es ON CAST(smr2.schedule_id AS UNSIGNED)=es.id
             WHERE smr2.student_id=s.id AND smr2.program=? AND smr2.status='approved'
             ORDER BY smr2.created_at DESC,smr2.id DESC LIMIT 1
           ) AS school_year
         FROM attendance_offenses o
         JOIN students s ON s.id=o.student_id
         WHERE s.nstp_component=? AND s.role='student' AND o.offend>0
         ORDER BY o.updated_at DESC,s.last_name,s.first_name`,
        [programCode, programCode, programCode]
      );

      return res.json(rows);
    }

    const studentId = parsePositiveInt(req.body.student_id);
    const action = String(req.body.action || '').toLowerCase();

    if (!studentId) {
      return res.status(400).json({ message: 'Select a valid student.' });
    }

    if (action !== 'settle') {
      return res.status(400).json({
        message: 'Only second-offense settlement can be updated here.',
      });
    }

    const updated = await offenseService.settle(studentId);
    return res.json({
      message: 'Attendance offense marked as settled. The student may use the system again.',
      offense: updated,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.serials = async (req, res) => {
  try {
    const programCode = program(req);

    if (req.method === 'GET') {
      const [rows] = await db.execute(
        `SELECT s.id AS student_id,s.student_id AS student_no,s.first_name,s.middle_name,s.last_name,
                s.course,s.year_level,s.sex,s.company,s.battalion,s.rotc_company,s.rotc_platoon,
                s.special_unit,s.willing_to_take_advance_course,sn.serial_number,sn.created_at AS serial_created_at,
                MAX(CASE WHEN g.ms_level='1' THEN g.grade END) AS ms1_grade,
                MAX(CASE WHEN g.ms_level='1' THEN g.status END) AS ms1_status,
                MAX(CASE WHEN g.ms_level='2' THEN g.grade END) AS ms2_grade,
                MAX(CASE WHEN g.ms_level='2' THEN g.status END) AS ms2_status,
                MAX(CASE WHEN r.ms_level='1' AND r.status='approved' THEN r.schedule_id END) AS ms1_schedule,
                MAX(CASE WHEN r.ms_level='1' AND r.status='approved' THEN COALESCE(es.year,'') END) AS ms1_school_year,
                MAX(CASE WHEN r.ms_level='2' AND r.status='approved' THEN r.schedule_id END) AS ms2_schedule,
                MAX(CASE WHEN r.ms_level='2' AND r.status='approved' THEN COALESCE(es.year,'') END) AS ms2_school_year
         FROM students s
         LEFT JOIN serial_numbers sn ON sn.student_id=s.id AND sn.program=?
         LEFT JOIN student_grades g ON g.student_id=s.id AND g.program=?
         LEFT JOIN student_ms_records r ON r.student_id=s.id AND r.program=?
         LEFT JOIN enrollment_schedules es ON CAST(r.schedule_id AS UNSIGNED)=es.id
         WHERE s.nstp_component=? AND s.role='student'
           AND ${approvedStudentExistsSql()}
         GROUP BY s.id,s.student_id,s.first_name,s.middle_name,s.last_name,s.course,s.year_level,s.sex,s.company,
                  s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,s.willing_to_take_advance_course,
                  sn.serial_number,sn.created_at
         ORDER BY s.last_name,s.first_name`,
        [programCode, programCode, programCode, programCode, programCode]
      );

      return res.json(rows.map((row) => ({
        ...row,
        eligible: gradesService.isCertificateEligible([
          { ms_level: '1', grade: row.ms1_grade, status: row.ms1_status },
          { ms_level: '2', grade: row.ms2_grade, status: row.ms2_status },
        ]),
        eligibility_message: gradesService.certificateEligibilityMessage([
          { ms_level: '1', grade: row.ms1_grade, status: row.ms1_status },
          { ms_level: '2', grade: row.ms2_grade, status: row.ms2_status },
        ]),
      })));
    }

    const studentId = parsePositiveInt(req.body.student_id);
    const serialNumber = String(req.body.serial_number || '').trim();

    if (!studentId || !serialNumber) {
      return res.status(400).json({
        message: 'Student and serial number are required.',
      });
    }

    if (serialNumber.length > 100) {
      return res.status(400).json({
        message: 'Serial number is too long.',
      });
    }

    const [gradeRows] = await db.execute(
      'SELECT ms_level,grade,status FROM student_grades WHERE student_id=? AND program=?',
      [studentId, programCode]
    );

    if (!gradesService.hasRequiredGradeLevels(gradeRows)) {
      return res.status(400).json({
        message: 'The student is not yet eligible. Both Level 1 and Level 2 grades must be completed.',
      });
    }

    if (!gradesService.isCertificateEligible(gradeRows)) {
      return res.status(400).json({
        message: 'The student is not eligible. Both Level 1 and Level 2 grades must be passed.',
      });
    }

    const [settingsRows] = await db.execute(
      'SELECT * FROM serial_number_settings WHERE program=?',
      [programCode]
    );
    const settings = settingsRows[0];

    if (!certificateSettingsComplete(settings, programCode)) {
      return res.status(400).json({
        message: 'Complete Certificate Settings before assigning a serial number.',
      });
    }

    const serial = serialNumber.toUpperCase();
    const [duplicate] = await db.execute(
      'SELECT student_id FROM serial_numbers WHERE serial_number=? AND student_id<>?',
      [serial, studentId]
    );

    if (duplicate.length) {
      return res.status(400).json({
        message: 'That serial number is already assigned to another student.',
      });
    }

    const {
      signatoryOneName,
      signatoryOnePosition,
      signatoryTwoName,
      signatoryTwoPosition,
      signatoryThreeName,
      signatoryThreePosition,
    } = serialSignatories(settings, programCode);

    await db.execute(
      `INSERT INTO serial_numbers(
         student_id,serial_number,program,signatory_1_name,signatory_1_position,
         signatory_2_name,signatory_2_position,signatory_3_name,signatory_3_position
       )
       VALUES(?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         serial_number=VALUES(serial_number),
         program=VALUES(program),
         signatory_1_name=VALUES(signatory_1_name),
         signatory_1_position=VALUES(signatory_1_position),
         signatory_2_name=VALUES(signatory_2_name),
         signatory_2_position=VALUES(signatory_2_position),
         signatory_3_name=VALUES(signatory_3_name),
         signatory_3_position=VALUES(signatory_3_position),
         created_at=CURRENT_TIMESTAMP`,
      [
        studentId,
        serial,
        programCode,
        signatoryOneName,
        signatoryOnePosition,
        signatoryTwoName,
        signatoryTwoPosition,
        signatoryThreeName,
        signatoryThreePosition,
      ]
    );

    await db.execute('UPDATE students SET serial_number=? WHERE id=?', [serial, studentId]);

    return res.json({
      message: 'Serial number assigned and certificate is now available.',
      serial_number: serial,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.bulkImportSerials = async (req, res) => {
  try {
    const programCode = program(req);

    uploadValidation.validateExcelFile(req.file);

    const [settingsRows] = await db.execute(
      'SELECT * FROM serial_number_settings WHERE program=?',
      [programCode]
    );
    const settings = settingsRows[0];

    if (!certificateSettingsComplete(settings, programCode)) {
      return res.status(400).json({
        message: 'Complete Certificate Settings before importing serial numbers.',
      });
    }

    const sheetRows = parseWorksheetRows(req.file.buffer);
    const importRows = extractImportRows(sheetRows);

    if (!importRows.length) {
      return res.status(400).json({
        message: 'No student rows were found in the uploaded Excel file.',
      });
    }

    const seenSerials = new Set();
    const results = [];
    let assigned = 0;

    const {
      signatoryOneName,
      signatoryOnePosition,
      signatoryTwoName,
      signatoryTwoPosition,
      signatoryThreeName,
      signatoryThreePosition,
    } = serialSignatories(settings, programCode);

    for (const row of importRows) {
      const summary = {
        excel_row: row.excel_row,
        student_id: row.student_id,
        student_name: [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ').trim(),
        serial_number: row.serial_number,
      };

      if (!row.student_id || !row.serial_number) {
        results.push({
          ...summary,
          status: 'skipped',
          message: 'Missing ID No. or Serial Number.',
        });
        continue;
      }

      if (seenSerials.has(row.serial_number)) {
        results.push({
          ...summary,
          status: 'skipped',
          message: 'Duplicate serial number found in the uploaded file.',
        });
        continue;
      }
      seenSerials.add(row.serial_number);

      const [studentRows] = await db.execute(
        `SELECT id,student_id,first_name,middle_name,last_name,course,birthdate,sex,temporary_barangay,platoon,serial_number
         FROM students
         WHERE student_id=? AND nstp_component=? AND role='student'
         LIMIT 1`,
        [row.student_id, programCode]
      );
      const student = studentRows[0];

      if (!student) {
        results.push({
          ...summary,
          status: 'skipped',
          message: 'Student not found for this NSTP component.',
        });
        continue;
      }

      if (!namesMatch(student, row)) {
        results.push({
          ...summary,
          status: 'skipped',
          message: 'Student name does not match the existing record.',
        });
        continue;
      }

      const [gradeRows] = await db.execute(
        'SELECT ms_level,grade,status FROM student_grades WHERE student_id=? AND program=?',
        [student.id, programCode]
      );

      if (!gradesService.hasRequiredGradeLevels(gradeRows)) {
        results.push({
          ...summary,
          status: 'skipped',
          message: 'Skipped because the student has incomplete grades.',
        });
        continue;
      }

      if (!gradesService.isCertificateEligible(gradeRows)) {
        results.push({
          ...summary,
          status: 'skipped',
          message: 'Skipped because the student is not eligible for a certificate.',
        });
        continue;
      }

      const [duplicateRows] = await db.execute(
        'SELECT student_id FROM serial_numbers WHERE serial_number=? AND student_id<>?',
        [row.serial_number, student.id]
      );

      if (duplicateRows.length) {
        results.push({
          ...summary,
          status: 'skipped',
          message: 'Serial number is already assigned to another student.',
        });
        continue;
      }

      if (student.serial_number && String(student.serial_number).trim().toUpperCase() !== row.serial_number) {
        results.push({
          ...summary,
          status: 'skipped',
          message: 'Student already has a different assigned serial number.',
        });
        continue;
      }

      const studentUpdate = updateStudentFromImport(student, row);

      await db.execute(
        `UPDATE students
         SET first_name=?,middle_name=?,last_name=?,course=?,birthdate=?,sex=?,temporary_barangay=?,platoon=?
         WHERE id=?`,
        [
          studentUpdate.first_name,
          studentUpdate.middle_name,
          studentUpdate.last_name,
          studentUpdate.course,
          studentUpdate.birthdate,
          studentUpdate.sex,
          studentUpdate.temporary_barangay,
          studentUpdate.platoon,
          student.id,
        ]
      );

      await db.execute(
        `INSERT INTO serial_numbers(
           student_id,serial_number,program,signatory_1_name,signatory_1_position,
           signatory_2_name,signatory_2_position,signatory_3_name,signatory_3_position
         )
         VALUES(?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           serial_number=VALUES(serial_number),
           program=VALUES(program),
           signatory_1_name=VALUES(signatory_1_name),
           signatory_1_position=VALUES(signatory_1_position),
           signatory_2_name=VALUES(signatory_2_name),
           signatory_2_position=VALUES(signatory_2_position),
           signatory_3_name=VALUES(signatory_3_name),
           signatory_3_position=VALUES(signatory_3_position),
           created_at=CURRENT_TIMESTAMP`,
        [
          student.id,
          row.serial_number,
          programCode,
          signatoryOneName,
          signatoryOnePosition,
          signatoryTwoName,
          signatoryTwoPosition,
          signatoryThreeName,
          signatoryThreePosition,
        ]
      );

      await db.execute(
        'UPDATE students SET serial_number=? WHERE id=?',
        [row.serial_number, student.id]
      );

      assigned += 1;
      results.push({
        ...summary,
        status: 'assigned',
        message: 'Serial number assigned and certificate released.',
      });
    }

    return res.json({
      message: `Bulk import finished. ${assigned} certificate${assigned === 1 ? '' : 's'} assigned.`,
      summary: {
        total: importRows.length,
        assigned,
        skipped: results.filter((item) => item.status !== 'assigned').length,
      },
      results,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.certificateSettings = async (req, res) => {
  try {
    const programCode = program(req);

    if (req.method === 'GET') {
      const [rows] = await db.execute(
        'SELECT * FROM serial_number_settings WHERE program=?',
        [programCode]
      );
      return res.json(rows[0] || { program: programCode });
    }

    const body = req.body || {};
    const values = [
      programCode,
      body.academic_year || null,
      body.ceremony_date || null,
      body.commandant || null,
      body.school_registrar || null,
      body.nstp_coordinator || null,
      body.municipal_mayor || null,
      body.bcc_president || null,
      body.commandant_signature == null || String(body.commandant_signature).trim() === ''
        ? null
        : uploadValidation.validateImageUpload(body.commandant_signature, {
          label: 'Commandant signature',
          maxBytes: 1024 * 1024,
        }),
      body.school_registrar_signature == null || String(body.school_registrar_signature).trim() === ''
        ? null
        : uploadValidation.validateImageUpload(body.school_registrar_signature, {
          label: 'Registrar signature',
          maxBytes: 1024 * 1024,
        }),
      body.nstp_coordinator_signature == null || String(body.nstp_coordinator_signature).trim() === ''
        ? null
        : uploadValidation.validateImageUpload(body.nstp_coordinator_signature, {
          label: 'NSTP Coordinator signature',
          maxBytes: 1024 * 1024,
        }),
      body.municipal_mayor_signature == null || String(body.municipal_mayor_signature).trim() === ''
        ? null
        : uploadValidation.validateImageUpload(body.municipal_mayor_signature, {
          label: 'Municipal Mayor signature',
          maxBytes: 1024 * 1024,
        }),
      body.bcc_president_signature == null || String(body.bcc_president_signature).trim() === ''
        ? null
        : uploadValidation.validateImageUpload(body.bcc_president_signature, {
          label: 'BCC President signature',
          maxBytes: 1024 * 1024,
        }),
    ];

    await db.execute(
      `INSERT INTO serial_number_settings(
         program,academic_year,ceremony_date,commandant,school_registrar,nstp_coordinator,municipal_mayor,bcc_president,
         commandant_signature,school_registrar_signature,nstp_coordinator_signature,municipal_mayor_signature,bcc_president_signature
       )
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         academic_year=VALUES(academic_year),
         ceremony_date=VALUES(ceremony_date),
         commandant=VALUES(commandant),
         school_registrar=VALUES(school_registrar),
         nstp_coordinator=VALUES(nstp_coordinator),
         municipal_mayor=VALUES(municipal_mayor),
         bcc_president=VALUES(bcc_president),
         commandant_signature=COALESCE(VALUES(commandant_signature),commandant_signature),
         school_registrar_signature=COALESCE(VALUES(school_registrar_signature),school_registrar_signature),
         nstp_coordinator_signature=COALESCE(VALUES(nstp_coordinator_signature),nstp_coordinator_signature),
         municipal_mayor_signature=COALESCE(VALUES(municipal_mayor_signature),municipal_mayor_signature),
         bcc_president_signature=COALESCE(VALUES(bcc_president_signature),bcc_president_signature)`,
      values
    );

    const [rows] = await db.execute(
      'SELECT * FROM serial_number_settings WHERE program=?',
      [programCode]
    );

    return res.json({
      message: 'Certificate settings saved.',
      settings: rows[0],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.certificate = async (req, res) => {
  try {
    const programCode = program(req);
    const studentId = parsePositiveInt(req.params.studentId);

    if (!studentId) {
      return res.status(400).json({ message: 'Select a valid student.' });
    }

    const [students] = await db.execute(
      'SELECT * FROM students WHERE id=? AND nstp_component=?',
      [studentId, programCode]
    );
    const [serials] = await db.execute(
      'SELECT * FROM serial_numbers WHERE student_id=? AND program=?',
      [studentId, programCode]
    );
    const [settings] = await db.execute(
      'SELECT * FROM serial_number_settings WHERE program=?',
      [programCode]
    );

    if (!students[0] || !serials[0]) {
      return res.status(404).json({ message: 'Certificate is not yet available.' });
    }

    if (!settings[0]) {
      return res.status(400).json({ message: 'Certificate settings are not configured.' });
    }

    return certificateService.certificatePdf(res, {
      student: students[0],
      serial: serials[0],
      settings: settings[0],
      program: programCode,
      assets: path.join(__dirname, '../public/images'),
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }
  }
};

exports.records = async (req, res) => {
  try {
    const programCode = program(req);
    const rows = await approvedRecordRows(programCode);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.downloadRecordProfiles = async (req, res) => {
  try {
    const programCode = program(req);
    const msLevel = readLevel(req.query.ms_level, { allowBlank: true });
    const schoolYear = readSchoolYear(req.query.school_year, { allowBlank: true });
    const search = readSearchTerm(req.query.search, { allowBlank: true });

    if (msLevel === null) {
      return res.status(400).json({ message: 'Select a valid enrollment level.' });
    }

    if (schoolYear === null) {
      return res.status(400).json({ message: 'Select a valid school year.' });
    }

    if (search === null) {
      return res.status(400).json({ message: 'Search text is too long.' });
    }

    const filters = {
      msLevel,
      schoolYear,
      search,
    };

    const rows = await approvedRecordRows(programCode, filters);
    if (!rows.length) {
      return res.status(404).json({ message: 'No approved student records matched the selected filters.' });
    }

    return certificateService.registrationFormsPdf(res, {
      records: rows,
      program: programCode,
      assets: path.join(__dirname, '../public/images'),
      filters,
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }
  }
};

exports.recordDetail = async (req, res) => {
  try {
    const programCode = program(req);
    const studentId = parsePositiveInt(req.params.studentId);
    const level = readLevel(req.query.ms_level || '1');

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
       WHERE smr.student_id=? AND smr.program=? AND smr.ms_level=? AND smr.status='approved'
       ORDER BY smr.created_at DESC
       LIMIT 1`,
      [studentId, programCode, level]
    );

    if (!cycle) {
      return res.status(404).json({ message: 'Approved enrollment cycle not found.' });
    }

    const [grades] = await db.execute(
      'SELECT * FROM student_grades WHERE student_id=? AND program=? ORDER BY ms_level',
      [studentId, programCode]
    );

    const schoolYear = String(cycle.school_year || '').trim();
    const params = [studentId, programCode, level, schoolYear, schoolYear];

    const [attendance] = await db.execute(
      `SELECT ar.id,ar.status,ar.created_at,ar.distance_meters,ar.latitude,ar.longitude,
              ses.mi_number,ses.mi_type,ses.open_date,ses.close_date,ses.school_year,ses.ms_level
       FROM attendance_records ar
       JOIN attendance_sessions ses ON ses.id=ar.attendance_session_id
       WHERE ar.student_id=? AND ses.program=? AND (ses.ms_level=? OR ses.ms_level IS NULL)
         AND (?='' OR ses.school_year=? OR ses.school_year IS NULL)
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

exports.withdrawals = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const [rows] = await db.execute(
        `SELECT w.*,s.student_id student_no,s.first_name,s.middle_name,s.last_name,s.suffix,s.course,s.year_level,s.sex,s.battalion,s.rotc_company,s.rotc_platoon,
                (SELECT smr.ms_level FROM student_ms_records smr
                 WHERE smr.student_id=s.id AND smr.program='ROTC' AND smr.status='approved'
                 ORDER BY smr.created_at DESC,smr.id DESC LIMIT 1) AS ms_level
         FROM advance_course_withdrawals w
         JOIN students s ON s.id=w.student_id
         ORDER BY FIELD(w.status,'pending','rejected','approved'),w.created_at DESC`
      );

      return res.json(rows);
    }

    const id = parsePositiveInt(req.params.id);
    const status = String(req.body.status || '').toLowerCase();
    const remarks = readLimitedText(req.body.admin_remarks, 1000);

    if (!id) {
      return res.status(400).json({ message: 'Select a valid withdrawal request.' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid withdrawal action.' });
    }

    if (remarks === null) {
      return res.status(400).json({
        message: 'Admin remarks are too long.',
      });
    }

    const [[request]] = await db.execute(
      `SELECT w.*,s.sex
       FROM advance_course_withdrawals w
       JOIN students s ON s.id=w.student_id
       WHERE w.id=? AND w.status='pending'
       LIMIT 1`,
      [id]
    );

    if (!request) {
      return res.status(404).json({
        message: 'Withdrawal request not found or already processed.',
      });
    }

    if (status === 'rejected') {
      if (!remarks) {
        return res.status(400).json({
          message: 'Please enter remarks for a rejected request.',
        });
      }

      await db.execute(
        "UPDATE advance_course_withdrawals SET status='rejected',admin_remarks=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        [remarks, id]
      );

      return res.json({ message: 'Withdrawal request rejected.' });
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      await connection.execute(
        "UPDATE advance_course_withdrawals SET status='approved',admin_remarks=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        [remarks || null, id]
      );

      await connection.execute(
        'UPDATE students SET willing_to_take_advance_course=0,battalion=NULL,rotc_company=NULL,rotc_platoon=NULL,platoon=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?',
        [request.student_id]
      );

      const [[record]] = await connection.execute(
        "SELECT ms_level FROM student_ms_records WHERE student_id=? AND program='ROTC' AND status='approved' ORDER BY created_at DESC LIMIT 1",
        [request.student_id]
      );

      const msLevel = String(record?.ms_level || '1');
      const battalion = request.sex === 'Male' ? 1 : 2;
      const companies = request.sex === 'Male'
        ? ['Alpha', 'Bravo', 'Charlie', 'Delta']
        : ['Echo', 'Foxtrot', 'Golf', 'Hotel'];

      let choice = null;
      for (const company of companies) {
        for (let platoon = 1; platoon <= 4; platoon += 1) {
          const [[count]] = await connection.execute(
            `SELECT COUNT(*) total
             FROM students s
             JOIN student_ms_records r ON r.student_id=s.id
             WHERE s.nstp_component='ROTC' AND r.ms_level=? AND r.status='approved'
               AND s.rotc_company=? AND s.rotc_platoon=?
               AND s.special_unit IS NULL AND COALESCE(s.willing_to_take_advance_course,0)=0`,
            [msLevel, company, platoon]
          );

          if (Number(count.total) < 37) {
            choice = { company, platoon };
            break;
          }
        }

        if (choice) break;
      }

      if (choice) {
        await connection.execute(
          'UPDATE students SET battalion=?,rotc_company=?,rotc_platoon=?,platoon=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
          [
            battalion,
            choice.company,
            choice.platoon,
            `${choice.company} - Platoon ${choice.platoon}`,
            request.student_id,
          ]
        );
      }

      await connection.commit();

      return res.json({
        message: choice
          ? `Withdrawal approved. Student moved to Battalion ${battalion}, ${choice.company} Company, Platoon ${choice.platoon}.`
          : 'Withdrawal approved, but no regular platoon slot is currently available.',
        assignment: choice,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.attendanceSummary = async (req, res) => {
  try {
    const programCode = program(req);
    const rawSessionId = String(req.query.session_id || '').trim();
    const sessionId = rawSessionId ? parsePositiveInt(rawSessionId) : null;
    const group = String(req.query.group || 'overall').toLowerCase();

    if (rawSessionId && !sessionId) {
      return res.status(400).json({ message: 'Select a valid attendance session.' });
    }

    if (!sessionId) {
      const [sessions] = await db.execute(
        `SELECT * FROM attendance_sessions
         WHERE program=?
         ORDER BY school_year DESC,ms_level DESC,mi_number DESC,FIELD(mi_type,'out','in'),created_at DESC`,
        [programCode]
      );

      return res.json({
        sessions: sessions.map((session) => ({
          ...session,
          effective_status: attendanceService.getEffectiveStatus(session),
          late_deadline: attendanceService.lateDeadline(session.close_date),
        })),
        late_minutes: attendanceService.LATE_THRESHOLD_MINUTES,
      });
    }

    const [[session]] = await db.execute(
      'SELECT * FROM attendance_sessions WHERE id=? AND program=?',
      [sessionId, programCode]
    );

    if (!session) {
      return res.status(404).json({ message: 'Attendance session not found.' });
    }

    const rosterGroup = normalizedRosterGroup(group);
    const sessionSchoolYear = String(session.school_year || '').trim();
    const isAdvanceCourseSession = Number(programCode === 'ROTC' && Number(session.is_advance_course || 0) === 1 ? 1 : 0);
    const params = [
      session.id,
      programCode,
      programCode,
      String(session.ms_level || '1'),
      sessionSchoolYear,
      sessionSchoolYear,
      programCode,
      isAdvanceCourseSession,
      isAdvanceCourseSession,
      rosterGroup,
      rosterGroup,
      rosterGroup,
      rosterGroup,
      rosterGroup,
    ];

    const [students] = await db.execute(
      `SELECT
         s.id,s.student_id,s.first_name,s.middle_name,s.last_name,s.course,s.year_level,s.sex,
         s.nstp_component,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,
         s.willing_to_take_advance_course,
         ar.id record_id,ar.status attendance_status,ar.created_at attendance_time,
         ar.latitude attendance_latitude,ar.longitude attendance_longitude,ar.distance_meters,
         ar.verified_by,ar.verified_at
       FROM students s
       LEFT JOIN attendance_records ar ON ar.student_id=s.id AND ar.attendance_session_id=?
       WHERE s.role='student' AND s.nstp_component=?
         AND EXISTS (
           SELECT 1
           FROM student_ms_records smr
           LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
         WHERE smr.student_id=s.id AND smr.program=? AND smr.ms_level=? AND smr.status='approved'
             AND (?='' OR es.year=? OR es.year IS NULL)
         )
         AND (
           ?<>'ROTC'
           OR (?=1 AND s.willing_to_take_advance_course=1 AND s.special_unit IS NULL AND COALESCE(s.has_medical_condition,0)=0)
           OR (?=0 AND NOT (s.willing_to_take_advance_course=1 AND s.special_unit IS NULL AND COALESCE(s.has_medical_condition,0)=0))
         )
         AND (
           ?='overall'
           OR (?='battalion-1' AND s.battalion=1 AND s.special_unit IS NULL AND s.willing_to_take_advance_course=0)
           OR (?='battalion-2' AND s.battalion=2 AND s.special_unit IS NULL AND s.willing_to_take_advance_course=0)
           OR (?='advance-course' AND s.willing_to_take_advance_course=1 AND s.special_unit IS NULL AND COALESCE(s.has_medical_condition,0)=0)
           OR (?='special-platoon' AND s.special_unit IN ('Medics','HQ','MP'))
         )
       ORDER BY s.last_name,s.first_name`,
      params
    );

    const graceOver = attendanceService.getEffectiveStatus(session) === 'closed';
    const normalized = students.map((student) => ({
      ...student,
      attendance_status: student.attendance_status || (graceOver ? 'absent' : 'unmarked'),
    }));

    const counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
    normalized.forEach((student) => {
      counts[student.attendance_status] = (counts[student.attendance_status] || 0) + 1;
    });

    return res.json({
      session: {
        ...session,
        effective_status: attendanceService.getEffectiveStatus(session),
        late_deadline: attendanceService.lateDeadline(session.close_date),
      },
      group,
      students: normalized,
      counts,
      total: normalized.length,
      late_minutes: attendanceService.LATE_THRESHOLD_MINUTES,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.verifyAttendance = async (req, res) => {
  try {
    const programCode = program(req);
    const sessionId = parsePositiveInt(req.params.sessionId);
    const studentId = parsePositiveInt(req.body.student_id);
    const status = String(req.body.status || '').toLowerCase();

    if (!sessionId || !studentId || !['present', 'late', 'absent'].includes(status)) {
      return res.status(400).json({
        message: 'Select a valid student and attendance status.',
      });
    }

    const [[session]] = await db.execute(
      'SELECT id,program,mi_number,mi_type FROM attendance_sessions WHERE id=? AND program=?',
      [sessionId, programCode]
    );

    if (!session) {
      return res.status(404).json({ message: 'Attendance session not found.' });
    }

    const [beforeRows] = await db.execute(
      'SELECT id,status FROM attendance_records WHERE student_id=? AND attendance_session_id=? LIMIT 1',
      [studentId, sessionId]
    );
    const previousStatus = beforeRows[0]?.status || null;

    await db.execute(
      `INSERT INTO attendance_records(student_id,attendance_session_id,status,mi_number,mi_type,verified_by,verified_at)
       VALUES(?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE status=VALUES(status),verified_by=VALUES(verified_by),verified_at=NOW(),updated_at=NOW()`,
      [studentId, sessionId, status, session.mi_number, session.mi_type, req.user.email]
    );

    let offense = null;
    if (status === 'absent' && previousStatus !== 'absent') {
      offense = await offenseService.record(studentId);
    }

    return res.json({
      message: offense
        ? (
          Number(offense.offend) >= 2
            ? 'Attendance verified. Second offense recorded; settlement is required.'
            : 'Attendance verified. First-offense warning recorded.'
        )
        : 'Attendance verified and saved.',
      offense,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
