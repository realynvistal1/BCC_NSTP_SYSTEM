require("dotenv").config();

const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const DB_NAME = process.env.DB_NAME || "bcc_nstp_database";
const PER_PROGRAM = Math.max(1, Number(process.env.SEED_STUDENTS_PER_PROGRAM || 500));
const PASSWORD = process.env.SEED_STUDENT_PASSWORD || "student123";

const config = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: DB_NAME,
  multipleStatements: false,
};

const FIRST_NAMES_MALE = [
  "Adrian", "Brandon", "Carlo", "Daniel", "Ethan", "Francis", "Gabriel", "Harold",
  "Ian", "Jerome", "Kevin", "Lance", "Mark", "Nathan", "Oscar", "Paolo",
  "Ralph", "Samuel", "Tristan", "Vincent",
];

const FIRST_NAMES_FEMALE = [
  "Angela", "Bianca", "Camille", "Diana", "Elaine", "Faith", "Grace", "Hannah",
  "Isabel", "Jasmine", "Katrina", "Lara", "Maria", "Nicole", "Olivia", "Patricia",
  "Queenie", "Rica", "Sophia", "Therese",
];

const LAST_NAMES = [
  "Abad", "Aguilar", "Aquino", "Bacani", "Bautista", "Bernardo", "Cabrera", "Castillo",
  "Cruz", "Dela Cruz", "Diaz", "Domingo", "Evangelista", "Fernandez", "Flores", "Garcia",
  "Gonzales", "Hernandez", "Jimenez", "Luna", "Mendoza", "Morales", "Navarro", "Ocampo",
  "Pascual", "Reyes", "Rivera", "Ramos", "Santos", "Torres",
];

const COURSES = [
  "BS Information Technology",
  "BS Criminology",
  "BS Hospitality Management",
  "BS Business Administration",
  "BEEd",
  "BSEd",
  "BS Civil Engineering",
  "BS Accountancy",
];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
function schoolYearFromDate(date = new Date()) {
  const year = date.getFullYear();
  return date.getMonth() >= 5 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function isoOffset(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function createScheduleWindow(now = new Date()) {
  const open = new Date(now);
  open.setDate(open.getDate() - 14);
  open.setHours(8, 0, 0, 0);

  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + 30);
  deadline.setHours(17, 0, 0, 0);

  return {
    openDate: isoOffset(open),
    deadline: isoOffset(deadline),
  };
}

function at(list, index) {
  return list[index % list.length];
}

function makeStudentId(component, index) {
  const base = component === "ROTC" ? 810000 : 820000;
  return `${String(base + index).padStart(6, "0")}-2026`;
}

function buildStudent(component, index) {
  const isRotc = component === "ROTC";
  const sex = isRotc ? (index % 2 === 0 ? "Male" : "Female") : (index % 3 === 0 ? "Male" : "Female");
  const firstName = sex === "Male" ? at(FIRST_NAMES_MALE, index) : at(FIRST_NAMES_FEMALE, index);
  const lastName = at(LAST_NAMES, index * 3);
  const middleName = at(LAST_NAMES, index * 5).replace(/\s+/g, "");
  const yearLevel = index % 4 === 0 ? "2nd Year" : "1st Year";
  const course = at(COURSES, index * 7);
  const studentNo = makeStudentId(component, index + 1);
  const email = `${component.toLowerCase()}.ms1.seed.${String(index + 1).padStart(4, "0")}@bcc.test`;
  const username = `${component.toLowerCase()}_ms1_seed_${String(index + 1).padStart(4, "0")}`;

  const hasMedicalCondition = isRotc && index % 25 === 0 ? 1 : 0;
  const willingToBeMedics = isRotc && !hasMedicalCondition && index % 18 === 0 ? 1 : 0;
  const willingToBeMilitaryPolice = isRotc && !hasMedicalCondition && !willingToBeMedics && index % 17 === 0 ? 1 : 0;
  const willingToTakeAdvanceCourse = isRotc && sex === "Male" && !hasMedicalCondition && !willingToBeMedics && !willingToBeMilitaryPolice && index % 11 === 0 ? 1 : 0;

  return {
    studentId: studentNo,
    lastName,
    firstName,
    middleName,
    religion: "Roman Catholic",
    birthdate: `200${index % 7}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
    sex,
    contactNumber: `09${String(100000000 + index).slice(-9)}`,
    placeOfBirth: "Bataan",
    temporaryBarangay: `Barangay ${String((index % 20) + 1).padStart(2, "0")}`,
    temporaryMunicipality: "Balanga",
    temporaryProvince: "Bataan",
    permanentBarangay: `Barangay ${String((index % 15) + 1).padStart(2, "0")}`,
    permanentMunicipality: "Balanga",
    permanentProvince: "Bataan",
    fatherName: `Mr. ${lastName}`,
    fatherOccupation: "Farmer",
    motherName: `Mrs. ${lastName}`,
    motherOccupation: "Vendor",
    emergencyContactName: `${firstName} Guardian`,
    emergencyContactAddress: `Purok ${String((index % 10) + 1)}, Balanga, Bataan`,
    emergencyRelationship: "Parent",
    emergencyContactNumber: `09${String(200000000 + index).slice(-9)}`,
    willingToTakeAdvanceCourse,
    willingToBeMedics,
    willingToBeMilitaryPolice,
    course,
    yearLevel,
    component,
    height: `${150 + (index % 25)} cm`,
    weight: `${45 + (index % 30)} kg`,
    bloodType: at(BLOOD_TYPES, index),
    complexion: index % 2 === 0 ? "Fair" : "Morena",
    hasMedicalCondition,
    medicalCondition: hasMedicalCondition ? "Asthma" : "",
    medicalCertificate: `/uploads/seed/medical-${component.toLowerCase()}-${index + 1}.pdf`,
    xrayFile: isRotc ? `/uploads/seed/xray-${index + 1}.pdf` : null,
    email,
    username,
    photo: `/uploads/seed/photo-${index + 1}.jpg`,
    corFile: `/uploads/seed/cor-${index + 1}.pdf`,
  };
}

async function ensureMs1Schedule(db, program) {
  const year = schoolYearFromDate();
  const { openDate, deadline } = createScheduleWindow();
  const [existing] = await db.execute(
    "SELECT * FROM enrollment_schedules WHERE program=? AND ms_level='1' AND year=? LIMIT 1",
    [program, year]
  );

  if (existing[0]) return existing[0];

  const [result] = await db.execute(
    "INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline) VALUES(?, '1', ?, ?, ?)",
    [program, year, openDate, deadline]
  );
  const [created] = await db.execute("SELECT * FROM enrollment_schedules WHERE id=?", [result.insertId]);
  return created[0];
}

async function upsertStudent(db, hash, student, scheduleId) {
  const [existingRows] = await db.execute(
    "SELECT id FROM students WHERE email=? OR username=? LIMIT 1",
    [student.email, student.username]
  );

  let studentPk;

  if (existingRows[0]) {
    studentPk = existingRows[0].id;
    await db.execute(
      `UPDATE students SET
        student_id=?,last_name=?,first_name=?,middle_name=?,religion=?,birthdate=?,sex=?,contact_number=?,place_of_birth=?,
        temporary_barangay=?,temporary_municipality=?,temporary_province=?,permanent_barangay=?,permanent_municipality=?,permanent_province=?,
        father_name=?,father_occupation=?,mother_name=?,mother_occupation=?,emergency_contact_name=?,emergency_contact_address=?,
        emergency_contact_relationship=?,emergency_contact_contact_number=?,willing_to_take_advance_course=?,willing_to_be_medics=?,
        willing_to_be_military_police=?,course=?,year_level=?,nstp_component=?,height=?,weight=?,blood_type=?,complexion=?,
        has_medical_condition=?,medical_condition=?,medical_certificate=?,xray_file=?,company=NULL,battalion=NULL,rotc_company=NULL,
        rotc_platoon=NULL,special_unit=NULL,platoon=NULL,email=?,username=?,password=?,photo=?,cor_file=?,role='student'
       WHERE id=?`,
      [
        student.studentId, student.lastName, student.firstName, student.middleName, student.religion, student.birthdate, student.sex,
        student.contactNumber, student.placeOfBirth, student.temporaryBarangay, student.temporaryMunicipality, student.temporaryProvince,
        student.permanentBarangay, student.permanentMunicipality, student.permanentProvince, student.fatherName, student.fatherOccupation,
        student.motherName, student.motherOccupation, student.emergencyContactName, student.emergencyContactAddress,
        student.emergencyRelationship, student.emergencyContactNumber, student.willingToTakeAdvanceCourse, student.willingToBeMedics,
        student.willingToBeMilitaryPolice, student.course, student.yearLevel, student.component, student.height, student.weight,
        student.bloodType, student.complexion, student.hasMedicalCondition, student.medicalCondition, student.medicalCertificate,
        student.xrayFile, student.email, student.username, hash,
        student.photo, student.corFile, studentPk,
      ]
    );
  } else {
    const [inserted] = await db.execute(
      `INSERT INTO students(
        student_id,last_name,first_name,middle_name,religion,birthdate,sex,contact_number,place_of_birth,
        temporary_barangay,temporary_municipality,temporary_province,permanent_barangay,permanent_municipality,permanent_province,
        father_name,father_occupation,mother_name,mother_occupation,emergency_contact_name,emergency_contact_address,
        emergency_contact_relationship,emergency_contact_contact_number,willing_to_take_advance_course,willing_to_be_medics,
        willing_to_be_military_police,course,year_level,nstp_component,height,weight,blood_type,complexion,has_medical_condition,
        medical_condition,medical_certificate,xray_file,email,username,password,photo,cor_file,role
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'student')`,
      [
        student.studentId, student.lastName, student.firstName, student.middleName, student.religion, student.birthdate, student.sex,
        student.contactNumber, student.placeOfBirth, student.temporaryBarangay, student.temporaryMunicipality, student.temporaryProvince,
        student.permanentBarangay, student.permanentMunicipality, student.permanentProvince, student.fatherName, student.fatherOccupation,
        student.motherName, student.motherOccupation, student.emergencyContactName, student.emergencyContactAddress,
        student.emergencyRelationship, student.emergencyContactNumber, student.willingToTakeAdvanceCourse, student.willingToBeMedics,
        student.willingToBeMilitaryPolice, student.course, student.yearLevel, student.component, student.height, student.weight,
        student.bloodType, student.complexion, student.hasMedicalCondition, student.medicalCondition, student.medicalCertificate,
        student.xrayFile, student.email, student.username, hash, student.photo, student.corFile,
      ]
    );
    studentPk = inserted.insertId;
  }

  const [recordRows] = await db.execute(
    "SELECT id FROM student_ms_records WHERE student_id=? AND schedule_id=? AND ms_level='1' AND program=? LIMIT 1",
    [studentPk, String(scheduleId), student.component]
  );

  if (recordRows[0]) {
    await db.execute(
      "UPDATE student_ms_records SET status='pending',rejection_reason=NULL WHERE id=?",
      [recordRows[0].id]
    );
  } else {
    await db.execute(
      "INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program,rejection_reason) VALUES(?,?,'1','pending',?,NULL)",
      [studentPk, String(scheduleId), student.component]
    );
  }
}

async function seedProgram(db, hash, program) {
  const schedule = await ensureMs1Schedule(db, program);
  for (let index = 0; index < PER_PROGRAM; index += 1) {
    const student = buildStudent(program, index);
    await upsertStudent(db, hash, student, schedule.id);
  }
  return schedule;
}

(async () => {
  const db = await mysql.createConnection(config);
  const hash = await bcrypt.hash(PASSWORD, 10);

  const rotcSchedule = await seedProgram(db, hash, "ROTC");
  const cwtsSchedule = await seedProgram(db, hash, "CWTS");

  await db.end();

  console.log(`Seeded ${PER_PROGRAM} ROTC MS 1 students on schedule #${rotcSchedule.id} as pending.`);
  console.log(`Seeded ${PER_PROGRAM} CWTS MS 1 students on schedule #${cwtsSchedule.id} as pending.`);
  console.log(`Default student password: ${PASSWORD}`);
  console.log("All seeded students are pending admin review and have no assignment yet.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
