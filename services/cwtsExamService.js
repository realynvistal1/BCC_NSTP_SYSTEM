const XLSX = require('xlsx');
const { createHash } = require('node:crypto');
const { validateExcelFile } = require('./uploadValidationService');

const COURSES = ['BS Hospitality Management', 'BS Information Technology', 'BS Tourism Management',
  'BEED - Bachelor of Elementary Education', 'BSED - Major in English', 'BSED - Major in Mathematics'];
const normalize = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const aliases = { bshm: COURSES[0], bsit: COURSES[1], bstm: COURSES[2], beed: COURSES[3],
  'bsed english': COURSES[4], 'bsed mathematics': COURSES[5], 'bsed math': COURSES[5] };
function courseName(value) { return aliases[normalize(value)] || COURSES.find(course => normalize(course) === normalize(value)) || null; }
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function applies(program, level) { return program === 'CWTS' && String(level) === '1'; }
function revision(rows) { return createHash('sha256').update(JSON.stringify(rows)).digest('hex'); }

function parseFile(file) {
  try { validateExcelFile(file); } catch (error) { fail(error.message); }
  let workbook;
  try { workbook = XLSX.read(file.buffer, { type: 'buffer', sheetRows: 2002 }); }
  catch { fail('Unable to read the Excel file. Use the exam results template.'); }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) fail('The workbook has no worksheet.');
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
  const headers = (grid.shift() || []).map(normalize);
  const required = ['student id', 'first name', 'middle name', 'last name', 'sex', 'course', 'result'];
  if (required.some(key => headers.filter(header => header === key).length !== 1)) fail('Use these column headers exactly once: Student ID, First Name, Middle Name, Last Name, Sex, Course, Result.');
  if (!grid.length) fail('This file is empty. Add students below the column headings, then upload it again.');
  if (grid.length > 2000) fail('This file has too many students. Upload up to 2,000 at a time.');
  const seen = new Set(), errors = [], rows = [];
  grid.forEach((cells, index) => {
    const values = required.map(key => String(cells[headers.indexOf(key)] ?? '').trim());
    const [student_id, first_name, middle_name, last_name, sex, course, result] = values;
    const problems = [];
    if (!/^\d{6}-\d{4}$/.test(student_id)) problems.push('Student ID must use 000000-0000');
    if (seen.has(student_id)) problems.push('duplicate Student ID in this file');
    seen.add(student_id);
    if (!first_name || first_name.length > 100 || !last_name || last_name.length > 100) problems.push('first and last names are required (maximum 100 characters each)');
    if (middle_name.length > 100) problems.push('Middle Name must be 100 characters or fewer');
    if (!['male', 'female'].includes(normalize(sex))) problems.push('Sex must be Male or Female');
    const canonicalCourse = courseName(course);
    if (!canonicalCourse) problems.push('use a supported course; BSED must specify English or Mathematics');
    if (!['passed', 'failed'].includes(normalize(result))) problems.push('Result must be Passed or Failed');
    if (problems.length) errors.push(`Row ${index + 2}: ${problems.join('; ')}.`);
    rows.push({ student_id, first_name, middle_name, last_name, sex: normalize(sex) === 'male' ? 'Male' : normalize(sex) === 'female' ? 'Female' : sex, course: canonicalCourse || course, result: normalize(result) });
  });
  return { rows, errors };
}

async function schedule(db, id, lock = false) {
  if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) fail('Select a valid CWTS 1 schedule.');
  const [[row]] = await db.execute(`SELECT id,program,ms_level,year,open_date,deadline FROM enrollment_schedules WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [Number(id)]);
  if (!row || !applies(row.program, row.ms_level)) fail('Exam results are available only for CWTS 1 schedules.', 404);
  return row;
}
async function results(db, id) {
  const [rows] = await db.execute('SELECT student_id,first_name,middle_name,last_name,sex,course,result,updated_by,updated_at FROM cwts_exam_results WHERE schedule_id=? ORDER BY student_id', [id]);
  return rows;
}
async function eligibility(db, scheduleId, student, lock = false) {
  const [[record]] = await db.execute('SELECT student_id,first_name,middle_name,last_name,sex,course,result,updated_by,updated_at FROM cwts_exam_results WHERE schedule_id=? AND student_id=?' + (lock ? ' FOR UPDATE' : ''), [scheduleId, student.student_id]);
  const matches = Object.fromEntries(['student_id', 'first_name', 'middle_name', 'last_name', 'sex', 'course'].map(key => [key,
    Boolean(record) && normalize(key === 'course' ? courseName(student[key]) || student[key] : student[key]) === normalize(record?.[key])
  ]));
  const eligible = Boolean(record && record.result === 'passed' && Object.values(matches).every(Boolean));
  const message = !record ? 'Exam result pending verification. Contact the CWTS office.'
    : !record.sex ? 'Your exam record is missing the sex field. Contact the CWTS office to update it.'
    : !Object.values(matches).every(Boolean) ? 'Please check your first name, middle name, last name, sex, and course. They must match your exam results. If your details are correct, contact the CWTS office.'
      : record.result !== 'passed' ? 'Your exam result is Failed. You are not qualified to enroll in CWTS 1.'
        : 'Passed: your information matches the CWTS 1 exam record.';
  return { eligible, message, matches, record: record || null };
}
async function requireEligible(db, cycle, student, lock = false) {
  if (!applies(cycle.program, cycle.ms_level)) return;
  if (!student) fail('Student record not found for exam verification.', 409);
  const check = await eligibility(db, cycle.id, student, lock);
  if (!check.eligible) fail(check.message, 409);
  return check;
}
async function saveResults(connection, scheduleId, rows, user, filename, before = []) {
  for (const row of rows) {
    await connection.execute(`INSERT INTO cwts_exam_results(schedule_id,student_id,first_name,middle_name,last_name,sex,course,result,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE first_name=VALUES(first_name),middle_name=VALUES(middle_name),last_name=VALUES(last_name),sex=VALUES(sex),course=VALUES(course),result=VALUES(result),updated_by=VALUES(updated_by),updated_at=CURRENT_TIMESTAMP`,
    [scheduleId,row.student_id,row.first_name,row.middle_name,row.last_name,row.sex,row.course,row.result,user]);
  }
  await connection.execute('INSERT INTO cwts_exam_imports(schedule_id,imported_by,filename,before_results,imported_results) VALUES(?,?,?,?,?)',
    [scheduleId,user,String(filename).slice(0,255),JSON.stringify(before),JSON.stringify(rows)]);
}
module.exports = { COURSES, normalize, courseName, applies, revision, parseFile, schedule, results, eligibility, requireEligible, fail, saveResults };
