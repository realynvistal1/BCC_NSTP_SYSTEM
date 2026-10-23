'use strict';
require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env')});
const db=require('../config/database');
(async()=>{try{const [columns]=await db.query("SHOW COLUMNS FROM periods LIKE 'required_students'");if(!columns.length)await db.query('ALTER TABLE periods ADD COLUMN required_students INT UNSIGNED NOT NULL DEFAULT 40');console.log('Student response target schema ready.');}finally{await db.end();}})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
