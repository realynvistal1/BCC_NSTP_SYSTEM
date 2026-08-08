const db=require('../config/database');
async function latestRecord(studentId){ const [r]=await db.execute('SELECT * FROM student_ms_records WHERE student_id=? ORDER BY created_at DESC LIMIT 1',[studentId]); return r[0]||null; }
async function studentById(id){const [r]=await db.execute('SELECT * FROM students WHERE id=?',[id]);return r[0]||null;}
function studentPublic(s){if(!s)return null; const {password,...safe}=s; return safe;}
module.exports={latestRecord,studentById,studentPublic};
