const db = require('../config/database');
const exam = require('../services/cwtsExamService');
const XLSX = require('xlsx');
const endpoint = handler => async (req, res) => {
  try { await handler(req, res); }
  catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to process exam results. Please try again.' }); }
};
exports.list = endpoint(async (req, res) => {
  const schedule = await exam.schedule(db, req.params.id);
  res.json({ schedule, rows: await exam.results(db, schedule.id), courses: exam.COURSES });
});
exports.template = endpoint(async (req, res) => {
  if (req.params.id) await exam.schedule(db, req.params.id);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Student ID', 'First Name', 'Middle Name', 'Last Name', 'Sex', 'Course', 'Result']]), 'Exam Results');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Allowed courses'], ...exam.COURSES.map(course => [course]), [], ['Middle Name: leave blank if none'], ['Sex: Male or Female'], ['Result: Passed or Failed'], ['Student ID format: 000000-0000']]), 'Instructions');
  res.set('Content-Disposition', 'attachment; filename="cwts-1-exam-template.xlsx"');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
});
exports.preview = endpoint(async (req, res) => {
  const schedule = await exam.schedule(db, req.params.id);
  const parsed = exam.parseFile(req.file);
  const existing = await exam.results(db, schedule.id);
  res.json({ ...parsed, revision: exam.revision(existing), updates: parsed.rows.filter(row => existing.some(old => old.student_id === row.student_id)).length });
});
exports.prepare = endpoint(async (req, res) => {
  res.json(exam.parseFile(req.file));
});
exports.import = endpoint(async (req, res) => {
  const parsed = exam.parseFile(req.file);
  if (parsed.errors.length) exam.fail('Fix all preview errors before importing.');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const schedule = await exam.schedule(connection, req.params.id, true);
    const before = await exam.results(connection, schedule.id);
    if (req.body.revision !== exam.revision(before)) exam.fail('Exam results changed. Preview this file again before confirming.', 409);
    await exam.saveResults(connection,schedule.id,parsed.rows,req.user.email,req.file.originalname,before);
    await connection.commit();
    res.json({ message: `${parsed.rows.length} exam results saved. Existing enrollment decisions were retained; pending applications will use the updated results.` });
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
});
exports.check = endpoint(async (req, res) => {
  const student = req.body || {};
  if (student.middle_name != null && (typeof student.middle_name !== 'string' || student.middle_name.length > 100)) exam.fail('Middle Name must be 100 characters or fewer.');
  if (!/^\d{6}-\d{4}$/.test(String(student.student_id || '')) || ['first_name', 'last_name', 'course'].some(key => typeof student[key] !== 'string' || !student[key].trim() || student[key].length > 255) || !['male','female'].includes(exam.normalize(student.sex))) exam.fail('Enter your Student ID, first name, last name, sex, and course.');
  const [[schedule]] = await db.execute("SELECT * FROM enrollment_schedules WHERE program='CWTS' AND ms_level='1' ORDER BY id DESC LIMIT 1");
  if (!schedule || !require('../services/enrollmentService').nowWithin(schedule)) exam.fail('CWTS 1 enrollment is not currently open.', 409);
  const check = await exam.eligibility(db, schedule.id, student);
  // Public checks never return another student's imported information.
  res.json({ eligible: check.eligible, message: check.message });
});
