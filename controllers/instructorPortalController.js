const db=require('../config/database');
const accounts=require('../services/instructorPortalService');
const grades=require('../services/instructorGradeService');
const endpoint=handler=>async(req,res)=>{try{await handler(req,res);}catch(e){if(!e.status)console.error('Instructor portal:',e.code||e.message);res.status(e.status||500).json({message:e.status?e.message:'Unable to complete this request. Please try again.'});}};
const sendPhoto=(res,photo)=>res.set({'Content-Type':photo.mimeType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(photo.buffer);
exports.registrationYears=endpoint(async(req,res)=>res.json({years:await accounts.registrationYears(db,req.query.program,req.query.level)}));
exports.register=endpoint(async(req,res)=>{
  const result=await require('../services/captchaService').verifyToken(req.body.recaptcha_token,'instructor_register',{hostname:req.hostname,portal:'instructor'});
  if(!result.ok)accounts.fail(result.message);
  res.status(201).json(await accounts.register(db,req.body));
});
exports.profile=endpoint(async(req,res)=>res.json(await accounts.profile(db,req.user)));
exports.dashboard=endpoint(async(req,res)=>{
  const assignments=await grades.assignments(db,req.user),students=new Map(),summaries=[];
  for(const assignment of assignments){
    const result=await grades.records(db,req.user,assignment.id);
    result.students.forEach(student=>students.set(Number(student.enrollment_record_id),student));
    summaries.push({...assignment,student_count:result.students.length});
  }
  const attendance=req.user.program==='CWTS'?await require('../services/instructorAttendanceService').list(db,req.user):[];
  const open=attendance.filter(row=>['open','late'].includes(row.effective_status));
  const rows=[...students.values()];
  res.json({assignments:summaries,open_attendance:open,students_preview:rows.slice(0,6).map(s=>({id:s.student_id,first_name:s.first_name,middle_name:s.middle_name,last_name:s.last_name,student_no:s.student_no,course:s.course})),stats:{students:new Set(rows.map(s=>Number(s.student_id))).size,enrollment_records:rows.length,assignments:assignments.length,
    drafts:rows.filter(s=>s.saved_final==null&&s.submission?.status==='draft').length,
    no_grades:rows.filter(s=>s.saved_final==null&&!s.submission).length,
    graded:rows.filter(s=>s.saved_final!=null).length,
    for_review:rows.filter(s=>s.saved_final==null&&s.submission?.status==='submitted').length,
    returned:rows.filter(s=>s.saved_final==null&&s.submission?.status==='returned').length,open_attendance:open.length}});
});
exports.photo=endpoint(async(req,res)=>sendPhoto(res,await accounts.portrait(db,req.user.program,req.user.id)));
exports.studentPhoto=endpoint(async(req,res)=>sendPhoto(res,await accounts.studentPortrait(db,req.user,req.params.studentId)));
exports.assignments=endpoint(async(req,res)=>res.json(await grades.assignments(db,req.user)));
exports.records=endpoint(async(req,res)=>res.json(await grades.records(db,req.user,req.params.id)));
exports.save=endpoint(async(req,res)=>res.json(await grades.save(db,req.user,req.params.id,req.params.recordId,req.body)));
exports.saveAll=endpoint(async(req,res)=>res.json(await grades.saveAll(db,req.user,req.body)));
const gradeFiles=require('../services/gradeAttachmentService');
function sendWorkbook(res,file){
  res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="Supporting_Grades.xlsx"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(file.file_data);
}
exports.uploadGradeWorkbook=endpoint(async(req,res)=>res.json(await gradeFiles.upload(db,req.user,req.params.id,req.file)));
exports.downloadGradeWorkbook=endpoint(async(req,res)=>sendWorkbook(res,await gradeFiles.download(db,req.user,req.params.id)));
exports.forProgram=program=>({
  reviewAccount:endpoint(async(req,res)=>res.json(await accounts.review(db,program,req.params.id,req.body,req.user.email))),
  photo:endpoint(async(req,res)=>sendPhoto(res,await accounts.portrait(db,program,req.params.id))),
  grades:endpoint(async(req,res)=>res.json(await grades.reviewList(db,program))),
  reviewGrade:endpoint(async(req,res)=>res.json(await grades.review(db,program,req.params.id,req.body,req.user.email)))
  ,downloadGradeWorkbook:endpoint(async(req,res)=>sendWorkbook(res,await gradeFiles.download(db,req.user,req.params.id,program)))
});

const instructorRecords=require('../services/instructorRecordService');
exports.studentRecords=endpoint(async(req,res)=>res.json(await instructorRecords.list(db,req.user)));
exports.studentRecordDetail=endpoint(async(req,res)=>res.json(await instructorRecords.detail(db,req.user,req.params.recordId)));
exports.downloadStudentRecords=endpoint(async(req,res)=>{
  const records=await instructorRecords.list(db,req.user,req.query,true);
  if(!records.length)accounts.fail('No assigned student records match these filters.',404);
  await require('../services/certificateService').registrationFormsPdf(res,{records,program:req.user.program,assets:require('path').join(__dirname,'../public/images'),filters:{commandantName:''}});
});

exports.downloadStudentCertificate=endpoint(async(req,res)=>{
  const record=await instructorRecords.detail(db,req.user,req.params.recordId);
  if(!record.certificate_available)accounts.fail('Certificate is not yet available.',404);
  const [[students],[serials],[settings]]=await Promise.all([
    db.execute('SELECT * FROM students WHERE id=? AND nstp_component=?',[record.student_db_id,req.user.program]),
    db.execute('SELECT * FROM serial_numbers WHERE student_id=? AND program=? ORDER BY id DESC LIMIT 1',[record.student_db_id,req.user.program]),
    db.execute('SELECT * FROM serial_number_settings WHERE program=? LIMIT 1',[req.user.program])
  ]);
  res.set('Cache-Control','private, no-store');
  await require('../services/certificateService').certificatePdf(res,{student:students[0],serial:serials[0],settings:settings[0],program:req.user.program,assets:require('path').join(__dirname,'../public/images')});
});

exports.downloadAttendance=endpoint(async(req,res)=>{
  if(req.user.program!=='CWTS')accounts.fail('CWTS attendance access is required.',403);
  const service=require('../services/instructorAttendanceService'),assignments=await service.list(db,req.user);
  const assignment=assignments.find(a=>String(a.id)===String(req.params.id));if(!assignment)accounts.fail('This attendance session is not assigned to you.',403);
  const records=await service.records(db,req.user,assignment.id),query=String(req.query.search||'').trim().toLowerCase(),status=String(req.query.status||'all');
  if(!['all','present','late','absent','unmarked'].includes(status))accounts.fail('Select a valid attendance status.');
  const rows=records.filter(r=>(status==='all'||r.status===status)&&(!query||`${r.first_name} ${r.middle_name||''} ${r.last_name} ${r.student_id}`.toLowerCase().includes(query)));
  if(!rows.length)accounts.fail('No attendance records match these filters.',404);
  const PDFDocument=require('pdfkit'),doc=new PDFDocument({size:'A4',layout:'landscape',margin:35});
  res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="CWTS_Attendance.pdf"','Cache-Control':'private, no-store'});doc.pipe(res);
  const counts=['present','late','absent','unmarked'].map(s=>s+': '+rows.filter(r=>r.status===s).length).join('   |   ');
  function page(){doc.fillColor('#20573e').font('Helvetica-Bold').fontSize(16).text('BUENAVISTA COMMUNITY COLLEGE');doc.fontSize(12).text('CWTS Attendance - '+assignment.company+' Company');doc.font('Helvetica').fontSize(10).fillColor('#456652').text('SY '+assignment.school_year+' | NSTP '+assignment.ms_level+' | CS '+assignment.mi_number+' '+String(assignment.mi_type).toUpperCase());doc.text('Search: '+(query||'All students')+' | Status: '+status);doc.moveDown(.5).text(counts);doc.moveDown();const y=doc.y;[['Student ID',35,110],['Student Name',150,250],['Course',405,245],['Status',655,110]].forEach(([t,x,w])=>doc.font('Helvetica-Bold').text(t,x,y,{width:w}));doc.y=y+23;}
  page();for(const row of rows){if(doc.y>doc.page.height-70){doc.addPage();page();}const y=doc.y;[[row.student_id,35,110],[[row.last_name+',',row.first_name,row.middle_name].filter(Boolean).join(' '),150,250],[row.course||'',405,245],[row.status,655,110]].forEach(([t,x,w])=>doc.font('Helvetica').fontSize(10).fillColor('#284536').text(String(t||''),x,y,{width:w,height:34,ellipsis:true}));doc.y=y+40;}doc.end();
});

exports.rotcAttendanceOverview=endpoint(async(req,res)=>{res.set('Cache-Control','private, no-store');res.json(await require('../services/rotcInstructorAttendanceService').overview(db,req.user));});

exports.downloadStudentRecordsExcel=endpoint(async(req,res)=>{
  const records=await instructorRecords.list(db,req.user,req.query);
  if(!records.length)accounts.fail('No assigned student records match these filters.',404);
  const buffer=require('../services/recordWorkbookService').build(req.user.program,records);
  res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="'+req.user.program+'_Student_Records.xlsx"','Cache-Control':'private, no-store'}).send(buffer);
});
