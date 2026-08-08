require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const cfg = {
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

(async () => {
  const root = await mysql.createConnection(cfg);
  await root.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  await root.end();

  const db = await mysql.createConnection({
    ...cfg,
    database: process.env.DB_NAME || "bcc_nstp_system",
    multipleStatements: false,
  });

  for (const [sid, email, user, pw, role, first, last] of admins) {
    const hash = await bcrypt.hash(pw, 10);
    await db.execute(
      `INSERT INTO students(student_id,email,username,password,role,first_name,last_name,nstp_component)
       VALUES(?,?,?,?,?,?,?,'')
       ON DUPLICATE KEY UPDATE password=VALUES(password),role=VALUES(role),username=VALUES(username)`,
      [sid, email, user, hash, role, first, last]
    );
  }

  await db.end();
  console.log("Database setup complete.");
  console.log("ROTC Admin: bcc.rotc.admin@gmail.com / rotc@admin");
  console.log("CWTS Admin: bcc.cwts.admin@gmail.com / cwts@admin");
  console.log("NSTP Director: bcc.officer.admin@gmail.com / officer@admin");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
