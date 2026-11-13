const db=require('../config/database');
exports.forProgram=program=>async(req,res)=>{try{
 const ids=req.body.record_ids;
 if(!Array.isArray(ids)||!ids.length||ids.length>5000||ids.some(id=>!Number.isSafeInteger(id)||id<=0))return res.status(400).json({message:'Select between 1 and 5,000 valid grade records.'});
 const selected=[...new Set(ids)],placeholders=selected.map(()=>'?').join(',');
 const [rows]=await db.execute(`SELECT r.id,s.student_id student_no,s.last_name,s.first_name,s.middle_name,s.course,s.year_level,r.ms_level,es.year school_year,r.assignment_company company,
 COALESCE(g.midterm,CASE WHEN ig.status<>'draft' THEN ig.midterm END) midterm,COALESCE(g.final_term,CASE WHEN ig.status<>'draft' THEN ig.final_term END) final_term,
 CASE WHEN g.final_term IS NOT NULL THEN 'Approved' WHEN ig.status='submitted' THEN 'For Review' WHEN ig.status='returned' THEN 'Returned' ELSE 'Not Submitted' END status
 FROM student_ms_records r JOIN students s ON s.id=r.student_id JOIN enrollment_schedules es ON es.id=CAST(r.schedule_id AS UNSIGNED) AND es.program=r.program
 LEFT JOIN student_grade_attempts g ON g.enrollment_record_id=r.id LEFT JOIN instructor_grade_submissions ig ON ig.enrollment_record_id=r.id
 WHERE r.program=? AND s.nstp_component=? AND s.role='student' AND (r.status='approved' OR g.final_term IS NOT NULL) AND r.id IN (${placeholders}) ORDER BY es.year DESC,r.ms_level,r.assignment_company,s.last_name,s.first_name`,[program,program,...selected]);
 if(rows.length!==selected.length)return res.status(403).json({message:'Some records are unavailable in this program. Refresh the grades page.'});
 const buffer=require('../services/gradeWorkbookService').build(program,rows);
 res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${program}_Grades.xlsx"`,'Cache-Control':'private, no-store'}).send(buffer);
}catch(e){console.error('Grade export:',e.code||e.message);if(!res.headersSent)res.status(500).json({message:'Unable to download grades. Please try again.'});}};
