// Capacity belongs to company assignment, not enrollment or approval.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.execPath,['--test',path.join(__dirname,'verify-cwts-enrollment-capacity.test.js'),path.join(__dirname,'verify-cwts-schedule-setup.test.js')],{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;
process.exitCode=result.status??1;