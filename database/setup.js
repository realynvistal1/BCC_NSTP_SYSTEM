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
};

const admins = [
  ["bcc.rotc.admin@gmail.com", "rotcadmin", "bcc@admin123", "admin", "ROTC"],
  ["bcc.cwts.admin@gmail.com", "cwtsadmin", "bcc@admin123", "admin", "CWTS"],
  ["bcc.officer.admin@gmail.com", "directoradmin", "bcc@admin123", "director", "BOTH"],
];

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (!quote) {
      if (char === "-" && next === "-") {
        lineComment = true;
        index += 1;
        continue;
      }

      if (char === "/" && next === "*") {
        blockComment = true;
        index += 1;
        continue;
      }
    }

    if (quote) {
      current += char;

      if (char === "\\") {
        if (index + 1 < sql.length) {
          current += sql[index + 1];
          index += 1;
        }
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }

    if (char === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) {
    statements.push(tail);
  }

  return statements;
}

async function runSchemaStatements(connection, schemaPath) {
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  const statements = splitSqlStatements(schemaSql);

  for (const statement of statements) {
    await connection.execute(statement);
  }
}

async function ensureAttendanceColumns(db) {
  const columns = [
    "latitude",
    "longitude",
    "distance_meters",
    "verified_by",
    "verified_at",
  ];

  for (const column of columns) {
    const [rows] = await db.execute(
      "SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='attendance_records' AND COLUMN_NAME=?",
      [DB_NAME, column]
    );
    if (!Number(rows[0].total)) {
      if (column === "latitude") {
        await db.execute("ALTER TABLE attendance_records ADD COLUMN latitude DOUBLE DEFAULT NULL");
      } else if (column === "longitude") {
        await db.execute("ALTER TABLE attendance_records ADD COLUMN longitude DOUBLE DEFAULT NULL");
      } else if (column === "distance_meters") {
        await db.execute("ALTER TABLE attendance_records ADD COLUMN distance_meters DECIMAL(10,2) DEFAULT NULL");
      } else if (column === "verified_by") {
        await db.execute("ALTER TABLE attendance_records ADD COLUMN verified_by VARCHAR(255) DEFAULT NULL");
      } else if (column === "verified_at") {
        await db.execute("ALTER TABLE attendance_records ADD COLUMN verified_at DATETIME DEFAULT NULL");
      }
    }
  }
}

(async () => {
  const root = await mysql.createConnection({
    ...config,
    multipleStatements: false,
  });
  await runSchemaStatements(root, path.join(__dirname, "schema.sql"));
  await root.end();

  const db = await mysql.createConnection({ ...config, database: DB_NAME, multipleStatements: false });
  await ensureAttendanceColumns(db);
  await require("./migrate-platoon-assignment").ensurePlatoonAssignmentColumn(db);

  for (const [email, username, password, role, program] of admins) {
    const hash = await bcrypt.hash(password, 10);
    await db.execute(
      `INSERT INTO admins(email,username,password,role,program)
       VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         email=VALUES(email),
         username=VALUES(username),
         password=VALUES(password),
         role=VALUES(role),
         program=VALUES(program)`,
      [email, username, hash, role, program]
    );
  }

  await db.end();
  console.log("Database setup complete.");
  console.log("ROTC Admin: bcc.rotc.admin@gmail.com / bcc@admin123");
  console.log("CWTS Admin: bcc.cwts.admin@gmail.com / bcc@admin123");
  console.log("NSTP Director: bcc.officer.admin@gmail.com / bcc@admin123");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
