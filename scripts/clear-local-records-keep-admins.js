// Explicit local-only cleanup. Retains admin/director accounts and all table definitions.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const db = require('../config/database');
const quote = name => '`' + name.replace(/`/g, '``') + '`';
async function main() {
  if (!process.argv.includes('--confirm-clear-keep-admins')) throw Error('Explicit --confirm-clear-keep-admins required.');
  const host = process.env.DB_HOST || 'localhost';
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw Error('This cleanup only supports the local database.');
  const connection = await db.getConnection();
  try {
    const [[target]] = await connection.execute('SELECT DATABASE() name');
    const [tables] = await connection.execute("SELECT TABLE_NAME name,ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'");
    if (!tables.some(table => table.name === 'admins') || tables.some(table => table.engine !== 'InnoDB')) throw Error('Expected transactional tables and an admins table.');
    const [keys] = await connection.execute('SELECT TABLE_NAME child,REFERENCED_TABLE_NAME parent FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL');
    const pending = new Set(tables.map(table => table.name).filter(name => name !== 'admins'));
    const order = [];
    while (pending.size) {
      const ready = [...pending].filter(name => !keys.some(key => key.parent === name && key.child !== name && pending.has(key.child)));
      if (!ready.length) throw Error('Cyclic foreign keys require manual review. Nothing was deleted.');
      ready.forEach(name => { order.push(name); pending.delete(name); });
    }
    await connection.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await connection.beginTransaction();
    // Lock existing rows and insertion gaps while backing up and clearing this database.
    for (const table of tables) await connection.execute('SELECT 1 FROM ' + quote(table.name) + ' FOR UPDATE');
    const [adminsBefore] = await connection.execute('SELECT * FROM admins ORDER BY id');
    if (adminsBefore.some(row => !['admin', 'director'].includes(row.role))) throw Error('Unexpected account roles in admins; review before cleaning.');
    const backupDir = path.resolve(__dirname, '../.local-backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, `before-full-clear-${Date.now()}.sql`);
    const executable = path.join(process.env.XAMPP_PATH || 'C:\\xampp', 'mysql', 'bin', 'mysqldump.exe');
    await promisify(execFile)(executable, [
      '--host=' + host, '--port=' + (process.env.DB_PORT || '3306'), '--user=' + (process.env.DB_USER || 'root'),
      '--single-transaction', '--skip-lock-tables', '--hex-blob', '--routines', '--triggers', '--result-file=' + backup,
      '--databases', target.name,
    ], { windowsHide: true, env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' }, timeout: 180000 });
    const size = fs.statSync(backup).size;
    const fd = fs.openSync(backup, 'r');
    const tail = Buffer.alloc(Math.min(1024, size));
    try { fs.readSync(fd, tail, 0, tail.length, size - tail.length); } finally { fs.closeSync(fd); }
    if (!size || !tail.toString().includes('Dump completed')) throw Error('Backup completion could not be verified. Nothing was deleted.');
    console.log(JSON.stringify({ database: target.name, backup, backupBytes: size }));
    const deleted = {};
    for (const name of order) {
      const [result] = await connection.execute('DELETE FROM ' + quote(name));
      deleted[name] = result.affectedRows;
    }
    for (const name of order) {
      const [[row]] = await connection.execute('SELECT COUNT(*) count FROM ' + quote(name));
      if (Number(row.count)) throw Error('Records remain in ' + name + '; rolling back.');
    }
    const [adminsAfter] = await connection.execute('SELECT * FROM admins ORDER BY id');
    if (JSON.stringify(adminsBefore) !== JSON.stringify(adminsAfter)) throw Error('Admin accounts changed; rolling back.');
    await connection.commit();
    console.log(JSON.stringify({ clearedTables: order.length, removedRecords: Object.values(deleted).reduce((a,b)=>a+b,0), accountsKept: adminsAfter.length, deleted }));
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
