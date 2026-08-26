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
  queueLimit: 0,
  dateStrings: true,
  multipleStatements: false,
});

async function getConnection() {
  const connection = await pool.getConnection();

  // Route every query call through prepared execution to reduce the chance
  // that future code reintroduces raw query usage.
  connection.query = connection.execute.bind(connection);

  return connection;
}

module.exports = {
  execute: pool.execute.bind(pool),
  query: pool.execute.bind(pool),
  getConnection,
  end: pool.end.bind(pool),
};
