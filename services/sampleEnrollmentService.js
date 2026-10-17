const bcrypt = require('bcryptjs');
const { buildStudent, upsertStudent } = require('../database/seed-students');
const COUNT = 100;
function settings() {
  return {
    enabled: process.env.NODE_ENV !== 'production' && process.env.SAMPLE_ENROLLMENTS_ENABLED === 'true',
    count: COUNT,
  };
}
function profile(program, schedule, index) {
  const student = buildStudent(program, index);
  const group = program !== 'ROTC' || index < 50 ? 'Regular' : index < 65 ? 'Medics' : index < 80 ? 'MP' : index < 90 ? 'HQ' : 'Advance Course';
  student.studentId = `SAMPLE-${program}-${schedule.id}-${String(index + 1).padStart(3,'0')}`;
  student.email = `sample.${program.toLowerCase()}.${schedule.id}.${index + 1}@example.invalid`;
  student.willingToBeMedics = Number(group === 'Medics');
  student.willingToBeMilitaryPolice = Number(group === 'MP');
  student.willingToTakeAdvanceCourse = Number(group === 'Advance Course');
  student.hasMedicalCondition = Number(group === 'HQ');
  student.medicalCondition = group === 'HQ' ? (index % 2 ? 'Sample: asthma' : 'Sample: knee condition') : '';
  if (group !== 'Regular' && student.course === 'BS Criminology') student.course = 'BS Information Technology';
  if (program === 'CWTS' && student.course === 'BS Criminology') student.course = 'BS Hospitality Management';
  student.yearLevel = String(schedule.ms_level) === '2' ? '2nd Year' : '1st Year';
  student.religion = ['Roman Catholic','Christian','Iglesia ni Cristo','Islam'][index % 4];
  student.placeOfBirth = ['Buenavista','Butuan City','Cabadbaran','Nasipit'][index % 4];
  student.temporaryProvince = student.permanentProvince = 'Agusan del Norte';
  student.temporaryMunicipality = student.permanentMunicipality = 'Buenavista';
  student.emergencyContactAddress = `Sample Purok ${index % 10 + 1}, Buenavista, Agusan del Norte`;
  // Sample profiles use a placeholder photo and do not claim to contain uploaded documents.
  student.corFile = student.medicalCertificate = student.xrayFile = null;
  return { student, group };
}
async function create(connection, schedule) {
  if (!settings().enabled) return { count: 0, groups: {} };
  if (!['ROTC','CWTS'].includes(schedule.program) || !['1','2'].includes(String(schedule.ms_level))) throw new Error('Invalid sample enrollment cycle.');
  const [[existing]] = await connection.execute('SELECT COUNT(*) total FROM student_ms_records WHERE CAST(schedule_id AS UNSIGNED)=?', [schedule.id]);
  if (Number(existing.total)) throw new Error('Sample students can only be generated for a new, empty schedule.');
  const hash = await bcrypt.hash(process.env.SEED_STUDENT_PASSWORD || 'student123', 10);
  const groups = {};
  for (let index = 0; index < COUNT; index++) {
    const { student, group } = profile(schedule.program, schedule, index);
    const id = await upsertStudent(connection, hash, student, schedule.id, String(schedule.ms_level));
    if (String(schedule.ms_level) === '2') {
      // Synthetic prerequisite results let the admin exercise MS/CWTS 2 approval.
      // These are new sample accounts; no existing student's grades are changed.
      await connection.execute("INSERT INTO student_grades(student_id,ms_level,midterm,final_term,grade,status,program) VALUES(?,'1',2,2,2,'Passed',?)", [id, schedule.program]);
    }
    groups[group] = (groups[group] || 0) + 1;
  }
  return { count: COUNT, groups };
}
module.exports = { settings, profile, create };
