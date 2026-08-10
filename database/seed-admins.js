require("dotenv").config();

const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

const cfg = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "bcc_nstp_database",
};

async function seedAdmins() {
  const conn = await mysql.createConnection(cfg);

  try {
    const sharedPassword = await bcrypt.hash("bcc@admin123", 10);

    const admins = [
      ["bcc.rotc.admin@gmail.com", "rotcadmin", sharedPassword, "admin", "ROTC"],
      ["bcc.cwts.admin@gmail.com", "cwtsadmin", sharedPassword, "admin", "CWTS"],
      ["bcc.officer.admin@gmail.com", "directoradmin", sharedPassword, "director", "BOTH"],
    ];

    for (const [email, username, password, role, program] of admins) {
      await conn.execute(
        `INSERT INTO admins (email, username, password, role, program)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           email = VALUES(email),
           username = VALUES(username),
           password = VALUES(password),
           role = VALUES(role),
           program = VALUES(program)`,
        [email, username, password, role, program]
      );
    }

    console.log("Admins seeded successfully.");
    console.log("Shared password: bcc@admin123");
  } finally {
    await conn.end();
  }
}

seedAdmins().catch((error) => {
  console.error("Failed to seed admins:", error);
  process.exit(1);
});
