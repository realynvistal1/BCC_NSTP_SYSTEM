const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bcc_nstp_database',
  waitForConnections: true,
  connectionLimit: 10,
  // Bound waiting work when all database connections are busy.
  queueLimit: 100,
  connectTimeout: 10000,
  dateStrings: true,
  // SQL injection defense: prevent multiple SQL statements in one call.
  multipleStatements: false,
});

async function getConnection() {
  const connection = await pool.getConnection();

  // Route every query call through prepared execution to reduce the chance
  // that future code reintroduces raw query usage.
  connection.query = connection.execute.bind(connection);

  return connection;
}

// SQL injection protection: use prepared execution for both execute() and query().
// Pass user input separately with ? placeholders, e.g. execute('SELECT * FROM students WHERE id = ?', [id]).
// Never concatenate or interpolate user input into SQL; prepared execution alone cannot make that safe.
module.exports = {
  execute: pool.execute.bind(pool),
  query: pool.execute.bind(pool),
  getConnection,
  end: pool.end.bind(pool),
};
