require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const db = require('../config/database');
const grades = require('../services/gradesService');

async function run() {
  if (!process.argv.includes('--confirm-reset-500')) {
    throw new Error('This replaces local student data. Run with --confirm-reset-500 only after approval.');
  }
  const host = process.env.DB_HOST || 'localhost';
  const database = process.env.DB_NAME || 'bcc_nstp_database';
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || database !== 'bcc_nstp_database') {
    throw new Error('Reset is restricted to the approved local bcc_nstp_database database.');
  }
  const root = path.resolve(__dirname, '..');
  const backupDirectory = path.join(root, '.local-backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDirectory, `before-demo-reset-${timestamp}.sql`);
  const photoBuffer = await sharp(path.join(root, 'public/images/ID.png'))
    .rotate().resize(600, 600, { fit: 'contain', background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
  const photo = `data:image/jpeg;base64,${photoBuffer.toString('base64')}`;
  const password = `Demo-${crypto.randomBytes(9).toString('base64url')}!`;
  const passwordHash = await bcrypt.hash(password, 10);
  execFileSync('C:/xampp/mysql/bin/mysqldump.exe', [
    '--host=127.0.0.1', `--port=${process.env.DB_PORT || 3306}`,
    `--user=${process.env.DB_USER || 'root'}`, '--single-transaction', '--hex-blob',
    '--default-character-set=utf8mb4', `--result-file=${backupFile}`, database,
  ], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' }, windowsHide: true });
  assert.ok(fs.statSync(backupFile).size > 100);
  assert.ok(fs.readFileSync(backupFile, 'utf8').includes('Dump completed'));
  console.log(`Verified backup: ${backupFile}`);

  const connection = await db.getConnection();
  const credentials = [];
  try {
    await connection.beginTransaction();
    const [staffBefore] = await connection.execute('SELECT * FROM admins ORDER BY id FOR UPDATE');
    const [legacyStaff] = await connection.execute("SELECT * FROM students WHERE role<>'student' ORDER BY id FOR UPDATE");
    const [[oldCount]] = await connection.execute("SELECT COUNT(*) total FROM students WHERE role='student'");
    await connection.execute("DELETE codes FROM password_change_codes codes JOIN students student ON codes.account_id=student.id WHERE codes.account_type='student' AND student.role='student'");
    await connection.execute("DELETE FROM students WHERE role='student'");
    await connection.execute('DELETE FROM attendance_sessions');
    await connection.execute('DELETE FROM enrollment_schedules');

    const now = new Date();
    const year = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
    const schoolYear = `${year}-${year + 1}`;
    const schedules = new Map();
    for (const program of ['ROTC', 'CWTS']) {
      await connection.execute(
        `INSERT IGNORE INTO serial_number_settings
          (program,academic_year,ceremony_date,commandant,school_registrar,nstp_coordinator,municipal_mayor,bcc_president)
         VALUES(?,?,?,?,?,?,?,?)`,
        [program, schoolYear, now.toISOString().slice(0, 10), 'Sample Commandant', 'Sample Registrar',
          'Sample Coordinator', 'Sample Mayor', 'Sample President']
      );
      for (const level of ['1', '2']) {
        const [schedule] = await connection.execute(
          'INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline,platoons_assigned_at) VALUES(?,?,?,?,?,NOW())',
          [program, level, schoolYear, `${year}-06-01T08:00:00`, `${year}-06-30T17:00:00`]
        );
        schedules.set(`${program}-${level}`, schedule.insertId);
      }
    }

    const maleNames = ['Adrian', 'Carlo', 'Daniel', 'Ethan', 'Gabriel', 'Ian', 'Jerome', 'Kevin', 'Lance', 'Nathan'];
    const femaleNames = ['Angela', 'Bianca', 'Camille', 'Diana', 'Elaine', 'Faith', 'Grace', 'Hannah', 'Isabel', 'Jasmine'];
    const surnames = ['Abad', 'Aguilar', 'Aquino', 'Bautista', 'Cabrera', 'Castillo', 'Cruz', 'Diaz', 'Flores', 'Garcia', 'Gonzales', 'Hernandez', 'Jimenez', 'Luna', 'Mendoza', 'Morales', 'Navarro', 'Ocampo', 'Pascual', 'Reyes', 'Rivera', 'Ramos', 'Santos', 'Torres', 'Villanueva'];
    const companies = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
    const courses = ['BS Information Technology', 'BS Hospitality Management', 'BS Business Administration', 'BEEd', 'BSEd'];
    for (const program of ['ROTC', 'CWTS']) {
      const regularCounts = { Male: 0, Female: 0 };
      for (let index = 0; index < 250; index += 1) {
        const number = String(index + 1).padStart(3, '0');
        const sex = index % 2 === 0 ? 'Male' : 'Female';
        const isRotc = program === 'ROTC';
        const specialUnit = isRotc && index < 30 ? ['HQ', 'Medics', 'MP'][Math.floor(index / 10)] : null;
        const advance = isRotc && index >= 30 && index < 50;
        const regular = isRotc && !specialUnit && !advance;
        const position = regular ? regularCounts[sex]++ : 0;
        const battalion = regular ? (sex === 'Male' ? 1 : 2) : null;
        const rotcCompany = regular ? companies[(battalion - 1) * 4 + position % 4] : null;
        const platoon = regular ? Math.floor(position / 4) % 4 + 1 : null;
        const username = `demo_${program.toLowerCase()}_${number}`;
        const serial = `DEMO-${program}-${year}-${number}`;
        const firstName = (sex === 'Male' ? maleNames : femaleNames)[Math.floor(index / 2) % 10];
        const lastName = surnames[Math.floor(index / 10)];
        const student = {
          student_id: `${isRotc ? '910' : '920'}${number}-${year}`,
          first_name: firstName, last_name: lastName, middle_name: 'Sample',
          religion: 'Roman Catholic', birthdate: `${year - 19}-01-${String(index % 28 + 1).padStart(2, '0')}`,
          sex, contact_number: `09${String(index + (isRotc ? 100000000 : 200000000))}`,
          place_of_birth: 'Buenavista, Bohol', temporary_barangay: 'Cangawa',
          temporary_municipality: 'Buenavista', temporary_province: 'Bohol',
          permanent_barangay: 'Cangawa', permanent_municipality: 'Buenavista', permanent_province: 'Bohol',
          father_name: `Sample Father ${lastName}`, father_occupation: 'Farmer',
          mother_name: `Sample Mother ${lastName}`, mother_occupation: 'Vendor',
          emergency_contact_name: `Sample Guardian ${lastName}`, emergency_contact_address: 'Cangawa, Buenavista, Bohol',
          emergency_contact_relationship: 'Parent', emergency_contact_contact_number: '09000000000',
          willing_to_take_advance_course: Number(advance), willing_to_be_medics: Number(specialUnit === 'Medics'),
          willing_to_be_military_police: Number(specialUnit === 'MP'),
          course: courses[index % courses.length], year_level: '2nd Year', nstp_component: program,
          height: `${155 + index % 25} cm`, weight: `${50 + index % 25} kg`, blood_type: 'O+', complexion: 'Fair',
          has_medical_condition: Number(specialUnit === 'HQ'), medical_condition: specialUnit === 'HQ' ? 'Sample medical assignment' : '',
          email: `${username}@example.test`, username, password: passwordHash, photo,
          company: isRotc ? null : companies[index % 6], battalion, rotc_company: rotcCompany,
          rotc_platoon: platoon, special_unit: specialUnit, role: 'student', serial_number: serial,
        };
        const fields = Object.keys(student);
        const [inserted] = await connection.execute(
          `INSERT INTO students (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, Object.values(student)
        );
        for (const level of ['1', '2']) {
          await connection.execute(
            "INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program) VALUES(?,?,?,'approved',?)",
            [inserted.insertId, String(schedules.get(`${program}-${level}`)), level, program]
          );
          const midterm = 1 + ((index + Number(level)) % 7) * 0.25;
          const finalTerm = 1 + ((index + Number(level) + 1) % 7) * 0.25;
          const grade = grades.calculateGrade(midterm, finalTerm);
          await connection.execute(
            'INSERT INTO student_grades(student_id,ms_level,midterm,final_term,grade,status,program) VALUES(?,?,?,?,?,?,?)',
            [inserted.insertId, level, midterm, finalTerm, grade, grades.statusFromGrade(grade), program]
          );
        }
        await connection.execute('INSERT INTO serial_numbers(student_id,serial_number,program) VALUES(?,?,?)', [inserted.insertId, serial, program]);
        credentials.push({ student_id: student.student_id, username, program, password });
      }
      console.log(`Prepared 250 ${program} students with both levels completed.`);
    }
    const [[counts]] = await connection.execute(`SELECT
      (SELECT COUNT(*) FROM students WHERE role='student') students,
      (SELECT COUNT(*) FROM student_ms_records WHERE status='approved') enrollments,
      (SELECT COUNT(*) FROM student_grades WHERE status='Passed') grades,
      (SELECT COUNT(*) FROM serial_numbers) serials,
      (SELECT COUNT(*) FROM students WHERE role='student' AND photo=?) photos`, [photo]);
    assert.deepEqual(counts, {students: 500, enrollments: 1000, grades: 1000, serials: 500, photos: 500});
    const [staffAfter] = await connection.execute('SELECT * FROM admins ORDER BY id');
    const [legacyAfter] = await connection.execute("SELECT * FROM students WHERE role<>'student' ORDER BY id");
    assert.deepEqual(staffAfter, staffBefore);
    assert.deepEqual(legacyAfter, legacyStaff);
    const credentialsFile = path.join(backupDirectory, `demo-logins-${timestamp}.json`);
    fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2), { flag: 'wx' });
    await connection.commit();
    console.log(JSON.stringify({removedStudents: oldCount.total, ...counts, staffPreserved: staffAfter.length + legacyAfter.length, schoolYear, backupFile, credentialsFile}));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.end());
