const db = require('../config/database');
const { DEFAULTS } = require('../services/cwtsCompanyService');
(async () => {
  try {
    await db.execute('CREATE TABLE IF NOT EXISTS cwts_companies (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,name VARCHAR(30) NOT NULL UNIQUE,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
    for (const name of DEFAULTS) await db.execute('INSERT IGNORE INTO cwts_companies(name) VALUES(?)', [name]);
    await db.execute('ALTER TABLE students MODIFY company VARCHAR(30) DEFAULT NULL');
    console.log('CWTS companies configured with 60 slots each.');
  } finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
