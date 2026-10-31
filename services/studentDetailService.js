const db = require('../config/database');
const { parsePositiveInt } = require('./requestValidationService');
const { parseDataUrl } = require('./uploadValidationService');
const fields = ["id","student_id","last_name","first_name","middle_name","suffix","religion","birthdate","sex","contact_number","place_of_birth","temporary_barangay","temporary_municipality","temporary_province","permanent_barangay","permanent_municipality","permanent_province","father_name","father_occupation","mother_name","mother_occupation","emergency_contact_name","emergency_contact_address","emergency_contact_relationship","emergency_contact_contact_number","willing_to_take_advance_course","willing_to_be_medics","willing_to_be_military_police","course","year_level","nstp_component","height","weight","blood_type","complexion","has_medical_condition","medical_condition","email","company","battalion","rotc_company","rotc_platoon","special_unit","platoon","grades","serial_number","role","created_at","updated_at"];
const uploads = ["photo","medical_certificate","xray_file","cor_file"];
// Return only small upload headers, never base64 file bodies, with student details.
function projection(alias = '') {
  const prefix = alias ? alias + '.' : '';
  return [...fields.map(name => prefix + '`' + name + '`'),
    ...uploads.map(name => 'SUBSTRING(' + prefix + '`' + name + '`,1,100) AS `' + name + '`')].join(',');
}
function linkUploads(student, base) {
  for (const name of uploads) {
    const header = String(student[name] || '');
    student[name] = header.startsWith('data:') ? base + '/' + name + (/^data:image\//i.test(header) ? '?preview=image' : '') : null;
  }
  delete student.password;
  return student;
}
async function serveUpload(req, res) {
  const studentId = parsePositiveInt(req.params.studentId);
  const name = req.params.field;
  const program = String(req.params.program || req.query.program || '').toUpperCase();
  if (!studentId || !uploads.includes(name) || !['ROTC','CWTS'].includes(program)) return res.status(400).json({message:'Invalid student file request.'});
  try {
    const [[row]] = await db.execute("SELECT `" + name + "` AS file FROM students WHERE id=? AND nstp_component=? AND role='student' LIMIT 1", [studentId, program]);
    const file = parseDataUrl(row?.file);
    if (!file || !['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(file.mimeType)) return res.status(404).json({message:'File not available.'});
    res.set('Cache-Control','private, no-store');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Content-Disposition','inline');
    return res.type(file.mimeType).send(file.buffer);
  } catch (error) { return res.status(500).json({message:'Unable to load this file. Please try again.'}); }
}
module.exports = {projection, linkUploads, serveUpload};
