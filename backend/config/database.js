require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env')});
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
 host: process.env.DB_HOST || '127.0.0.1',
 port: Number(process.env.DB_PORT || 3306),
 user: process.env.DB_USER || 'root',
 password: process.env.DB_PASSWORD || '',
 database: process.env.DB_NAME || 'faculty_evaluation',
 waitForConnections:true, connectionLimit:10, queueLimit:0,
 dateStrings:true, timezone:'+08:00',
 // Date/time fields use explicit Manila date strings in the evaluation window checks.
});
module.exports = pool;
