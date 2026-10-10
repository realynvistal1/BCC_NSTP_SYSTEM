const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

function isListening(host, port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const finish = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

// Start only an existing local XAMPP database, never initialize or seed data.
async function ensureLocalMysql() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || 3306);
  if (process.platform !== 'win32' || process.env.NODE_ENV === 'production'
      || process.env.DB_AUTO_START === 'false'
      || !['localhost', '127.0.0.1', '::1'].includes(host) || port !== 3306) return;
  const probeHost = host === 'localhost' ? '127.0.0.1' : host;
  if (await isListening(probeHost, port)) return;

  const root = process.env.XAMPP_PATH || 'C:\\xampp';
  const executable = path.join(root, 'mysql', 'bin', 'mysqld.exe');
  const config = path.join(root, 'mysql', 'bin', 'my.ini');
  const database = process.env.DB_NAME || 'bcc_nstp_database';
  if (!/^[\w-]+$/.test(database) || !fs.existsSync(executable)
      || !fs.existsSync(config) || !fs.existsSync(path.join(root, 'mysql', 'data', database))) return;

  console.log('Starting local XAMPP MySQL for BCC NSTP...');
  const child = spawn(executable, [`--defaults-file=${config}`, '--standalone'], {
    cwd: path.dirname(executable), detached: true, stdio: 'ignore', windowsHide: true,
  });
  let launchError;
  let exited = false;
  child.once('error', error => { launchError = error; });
  child.once('exit', () => { exited = true; });
  child.unref();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isListening(probeHost, port)) {
      console.log('Local MySQL is ready.');
      return;
    }
    if (launchError || exited) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`XAMPP MySQL did not start${launchError ? `: ${launchError.message}` : '.'} Check ${path.join(root, 'mysql', 'data', 'mysql_error.log')} or start MySQL in the XAMPP Control Panel.`);
}

module.exports = { ensureLocalMysql };
