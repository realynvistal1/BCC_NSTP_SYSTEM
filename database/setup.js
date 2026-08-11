require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const DB_NAME = process.env.DB_NAME || "bcc_nstp_database";
const config = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  multipleStatements: true,
};

const admins = [
  ["ROTC Admin", "bcc.rotc.admin@gmail.com", "ROTC Admin", "rotc@admin", "admin", "ROTC", "Admin"],
  ["CWTS Admin", "bcc.cwts.admin@gmail.com", "CWTS Admin", "cwts@admin", "admin", "CWTS", "Admin"],
  ["NSTP Director", "bcc.officer.admin@gmail.com", "NSTP Director", "officer@admin", "officer", "NSTP", "Director"],
];

async function ensureAttendanceColumns(db) {
  const columns = [
    ["latitude", "DOUBLE DEFAULT NULL"],
    ["longitude", "DOUBLE DEFAULT NULL"],
    ["distance_meters", "DECIMAL(10,2) DEFAULT NULL"],
    ["verified_by", "VARCHAR(255) DEFAULT NULL"],
    ["verified_at", "DATETIME DEFAULT NULL"],
  ];

  for (const [column, definition] of columns) {
    const [rows] = await db.query(
      "SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='attendance_records' AND COLUMN_NAME=?",
      [DB_NAME, column]
    );
    if (!Number(rows[0].total)) {
      await db.query(`ALTER TABLE attendance_records ADD COLUMN ${column} ${definition}`);
    }
  }
}

(async () => {
  const root = await mysql.createConnection(config);
  await root.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  await root.end();

  const db = await mysql.createConnection({ ...config, database: DB_NAME, multipleStatements: false });
  await ensureAttendanceColumns(db);

  for (const [studentId, email, username, password, role, firstName, lastName] of admins) {
    const hash = await bcrypt.hash(password, 10);
    await db.execute(
      `INSERT INTO students(student_id,email,username,password,role,first_name,last_name,nstp_component)
       VALUES(?,?,?,?,?,?,?,'')
       ON DUPLICATE KEY UPDATE password=VALUES(password),role=VALUES(role),username=VALUES(username)`,
      [studentId, email, username, hash, role, firstName, lastName]
    );
  }

  await db.end();
  console.log("Database setup complete.");
  console.log("ROTC Admin: bcc.rotc.admin@gmail.com / rotc@admin");
  console.log("CWTS Admin: bcc.cwts.admin@gmail.com / cwts@admin");
  console.log("NSTP Director: bcc.officer.admin@gmail.com / officer@admin");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
