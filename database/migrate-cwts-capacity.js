const fs=require('fs');
async function ensureCwtsCapacity(db) {
  const [columns]=await db.execute("SHOW COLUMNS FROM cwts_companies LIKE 'capacity'");
  if(columns.length)return;
  const [companies]=await db.execute('SELECT * FROM cwts_companies');
  fs.mkdirSync(require('path').join(__dirname,'../.local-backups'),{recursive:true});
  fs.writeFileSync(require('path').join(__dirname,'../.local-backups/cwts-companies-before-capacity-'+Date.now()+'.json'),JSON.stringify(companies),{flag:'wx'});
  await db.execute('ALTER TABLE cwts_companies ADD COLUMN capacity INT UNSIGNED NOT NULL DEFAULT 60');
}
module.exports={ensureCwtsCapacity};
if(require.main===module){const db=require('../config/database');ensureCwtsCapacity(db).then(()=>console.log('CWTS capacity ready; existing companies retain 60 slots.')).catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.end());}
