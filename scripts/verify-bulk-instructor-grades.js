const assert=require('node:assert/strict'),db=require('../config/database'),grades=require('../services/instructorGradeService');
(async()=>{
 const c=await db.getConnection();await c.beginTransaction();
 const savepoint=sql=>new Promise((resolve,reject)=>c.connection.query(sql,(error,result)=>error?reject(error):resolve(result)));
 const facade={execute:c.execute.bind(c),getConnection:async()=>({execute:c.execute.bind(c),beginTransaction:()=>savepoint('SAVEPOINT bulk_grades'),commit:()=>savepoint('RELEASE SAVEPOINT bulk_grades'),rollback:()=>savepoint('ROLLBACK TO SAVEPOINT bulk_grades'),release(){}})};
 const stamp=Date.now();
 try{
  for(const program of ['ROTC','CWTS']){
   const table=program==='ROTC'?'rotc_instructors':'cwts_instructors';
   const [teacher]=await c.execute(`INSERT INTO ${table}(first_name,last_name,email,status,review_status,session_version,created_by) VALUES('Bulk','Test',?,'active','approved',1,'bulk-test')`,[program+stamp+'@example.invalid']);
   const user={id:teacher.insertId,program,session_version:1,email:program+stamp+'@example.invalid'};
   const [cycle]=await c.execute("INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline) VALUES(?,'1','7796-7797',NOW(),DATE_ADD(NOW(),INTERVAL 1 DAY))",[program]);
   const entries=[];
   for(const company of ['Alpha','Bravo']){
    const [assignment]=await c.execute(`INSERT INTO grade_instructor_assignments(program,schedule_id,company,${program==='ROTC'?'rotc_instructor_id':'cwts_instructor_id'},assigned_by) VALUES(?,?,?,?,'bulk-test')`,[program,cycle.insertId,company,user.id]);
    const [student]=await c.execute("INSERT INTO students(student_id,first_name,last_name,email,password,nstp_component,course) VALUES(?,'Bulk','Student',?,'test',?,'BSIT')",[program+company+stamp,program+company+stamp+'@example.invalid',program]);
    const [record]=await c.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,program,status,assignment_company,assignment_is_advance) VALUES(?,?,'1',?,'approved',?,0)",[student.insertId,String(cycle.insertId),program,company]);
    entries.push({assignment_id:assignment.insertId,enrollment_record_id:record.insertId,midterm:'2.00',final_term:'2.50',expected_version:null});
   }
   assert.equal((await grades.saveAll(facade,user,{action:'draft',records:entries})).count,2);
   await c.execute('UPDATE instructor_grade_submissions SET assignment_id=? WHERE enrollment_record_id=?',[entries[1].assignment_id,entries[0].enrollment_record_id]);
   const moved=await grades.records(facade,user,entries[0].assignment_id);
   assert.equal(Number(moved.students[0].submission.version),1,'Reassigned enrollments must expose the existing submission version');
   assert.equal(moved.students[0].submission.status,'draft');
   const other=await grades.records(facade,user,entries[1].assignment_id);
   assert(!other.students.some(s=>s.enrollment_record_id===entries[0].enrollment_record_id),'Submission lookup cannot expose another company');
   await assert.rejects(grades.saveAll(facade,user,{action:'submitted',records:entries.map(e=>({...e,expected_version:1}))}),e=>e.status===400&&e.message.includes('Excel'));
   const attachments=require('../services/gradeAttachmentService');
   const workbook=require('../services/recordWorkbookService').build(program,[{school_year:'7796-7797',ms_level:1,company:'Alpha',student_no:'test',midterm:2,final_term:2.5}]);
   for(const entry of entries){const uploaded=await attachments.upload(facade,user,entry.assignment_id,{originalname:'Scores_Attendance.xlsx',buffer:workbook});entry.attachment_id=uploaded.attachment.id;const file=await attachments.download(facade,user,uploaded.attachment.id);assert(file.file_data.equals(workbook));}
   await assert.rejects(attachments.download(facade,user,entries[0].attachment_id,program==='ROTC'?'CWTS':'ROTC'),e=>e.status===404);
   const drafts=entries.map(e=>({...e,expected_version:1}));
   await assert.rejects(grades.saveAll(facade,user,{action:'submitted',records:[drafts[0],{...drafts[1],expected_version:null}]}),e=>e.status===409);
   let [saved]=await c.execute('SELECT status,version FROM instructor_grade_submissions WHERE enrollment_record_id IN (?,?)',entries.map(e=>e.enrollment_record_id));
   assert(saved.every(e=>e.status==='draft'&&Number(e.version)===1),'A stale row must roll back every earlier write');
   await assert.rejects(grades.saveAll(facade,user,{action:'submitted',records:[drafts[0],{...drafts[1],assignment_id:drafts[0].assignment_id}]}),e=>e.status===403);
   [saved]=await c.execute('SELECT status,version FROM instructor_grade_submissions WHERE enrollment_record_id IN (?,?)',entries.map(e=>e.enrollment_record_id));
   assert(saved.every(e=>e.status==='draft'&&Number(e.version)===1),'An out-of-scope row must roll back the batch');
   const submittedResult=await grades.saveAll(facade,user,{action:'submitted',records:drafts});assert.equal(submittedResult.count,2);
   const review=await grades.reviewList(facade,program);assert(review.some(g=>g.attachment_name==='Scores_Attendance.xlsx'&&g.enrollment_record_id===entries[0].enrollment_record_id));
   await grades.review(facade,program,submittedResult.submissions[0].id,{action:'return',note:'Check source scores',expected_version:2},'admin-test');
   await grades.save(facade,user,entries[0].assignment_id,entries[0].enrollment_record_id,{...drafts[0],expected_version:3,action:'submitted'});
   await grades.review(facade,program,submittedResult.submissions[0].id,{action:'approve',expected_version:4},'admin-test');
   const newer=await attachments.upload(facade,user,entries[0].assignment_id,{originalname:'Updated_Scores.xlsx',buffer:workbook});
   assert.notEqual(newer.attachment.id,entries[0].attachment_id);
   const [[submitted]]=await c.execute('SELECT attachment_id FROM instructor_grade_submissions WHERE enrollment_record_id=?',[entries[0].enrollment_record_id]);assert.equal(submitted.attachment_id,entries[0].attachment_id,'Submitted evidence must remain the exact original version');
   await assert.rejects(grades.saveAll(facade,user,{action:'draft',records:drafts.map(e=>({...e,expected_version:2}))}),e=>e.status===409);
   await assert.rejects(grades.saveAll(facade,user,{action:'draft',records:[entries[0],entries[0]]}),/only once/);
   // Removing or replacing a teaching assignment preserves read access only.
   const historyId=entries[0].assignment_id;
   await c.execute('UPDATE grade_instructor_assignments SET active=0 WHERE id=?',[historyId]);
   const removed=await grades.records(facade,user,historyId);
   assert.equal(removed.assignment.read_only,true);
   assert(removed.students.some(s=>Number(s.enrollment_record_id)===Number(entries[0].enrollment_record_id)));
   assert((await grades.assignments(facade,user)).some(a=>Number(a.id)===Number(historyId)&&a.read_only));
   const recordService=require('../services/instructorRecordService');
   assert((await recordService.list(facade,user)).some(r=>Number(r.record_id)===Number(entries[0].enrollment_record_id)));
   assert((await attachments.download(facade,user,entries[0].attachment_id)).file_data.equals(workbook));
   await assert.rejects(grades.save(facade,user,historyId,entries[0].enrollment_record_id,{midterm:1,final_term:1,action:'draft',expected_version:5}),e=>e.status===403);
   await assert.rejects(attachments.upload(facade,user,historyId,{originalname:'Blocked.xlsx',buffer:workbook}),e=>e.status===403);
   const [replacement]=await c.execute(`INSERT INTO ${table}(first_name,last_name,email,status,review_status,session_version,created_by) VALUES('Replacement','Test',?,'active','approved',1,'bulk-test')`,['replacement'+program+stamp+'@example.invalid']);
   await c.execute('INSERT INTO grade_instructor_assignment_log(assignment_id,previous_instructor_id,instructor_id,changed_by) VALUES(?,?,?,?)',[historyId,user.id,replacement.insertId,'history-test']);
   await c.execute(`UPDATE grade_instructor_assignments SET active=1,${program==='ROTC'?'rotc_instructor_id':'cwts_instructor_id'}=? WHERE id=?`,[replacement.insertId,historyId]);
   assert.equal((await grades.records(facade,user,historyId)).assignment.read_only,true);
   assert.equal((await grades.records(facade,{...user,id:replacement.insertId},historyId)).assignment.read_only,false);
   assert((await recordService.list(facade,user)).some(r=>Number(r.record_id)===Number(entries[0].enrollment_record_id)));
   await assert.rejects(grades.records(facade,{...user,id:900000000},historyId),e=>e.status===403);
   assert.equal((await recordService.list(facade,{...user,id:900000000})).length,0);
   await assert.rejects(grades.save(facade,user,historyId,entries[0].enrollment_record_id,{midterm:1,final_term:1,action:'draft',expected_version:5}),e=>e.status===403);
   const [attendanceSession]=await c.execute("INSERT INTO attendance_sessions(program,ms_level,school_year,is_advance_course,mi_number,mi_type,open_date,close_date,latitude,longitude,created_by) VALUES(?,'1','7796-7797',0,1,'in',DATE_SUB(NOW(),INTERVAL 1 HOUR),DATE_ADD(NOW(),INTERVAL 1 HOUR),8,125,'history-test')",[program]);
   if(program==='CWTS'){
     const attendance=require('../services/instructorAttendanceService');
     const sessionKey=historyId+'-'+attendanceSession.insertId;
     assert((await attendance.list(facade,user)).some(a=>a.id===sessionKey&&a.read_only));
     assert((await attendance.records(facade,user,sessionKey)).length>0);
     const [[recordStudent]]=await c.execute('SELECT student_id FROM student_ms_records WHERE id=?',[entries[0].enrollment_record_id]);
     await assert.rejects(attendance.verify(facade,user,sessionKey,recordStudent.student_id,{status:'present',reason:'Not permitted',expected_version:null}),e=>e.status===403);
   }else{
     const attendance=await require('../services/rotcInstructorAttendanceService').overview(facade,user);
     assert(attendance.records.some(r=>Number(r.enrollment_record_id)===Number(entries[0].enrollment_record_id)));
     assert.equal(attendance.read_only,true);
   }
   console.log(program+': removed/replaced history readable, unrelated instructors blocked, grade/file changes rejected');
   console.log(program+': Excel upload/download, required evidence, immutable versions, admin return/approve, bulk grades, rollback and access checks passed');
  }
 }finally{await c.rollback();c.release();await db.end();}
})().catch(error=>{console.error(error);process.exitCode=1;});
