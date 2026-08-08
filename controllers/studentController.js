const bcrypt=require('bcryptjs');
const db=require('../config/database');
const {
  latestRecord,studentById,studentPublic
}
=require('../services/systemService');
const authService=require('../services/authService');
const enrollmentService=require('../services/enrollmentService');
const platoonService=require('../services/platoonService');
exports.checkSchedule=async(req,res)=>{
  try{
    const program=String(req.query.program||'').toUpperCase();
    const ms=String(req.query.ms_level||'1');
    if(!['ROTC','CWTS'].includes(program)||!['1','2'].includes(ms)) return res.status(400).json({message:'Select a valid NSTP component and level.'});
    const [rows]=await db.execute('SELECT * FROM enrollment_schedules WHERE program=? AND ms_level=? ORDER BY id DESC LIMIT 1',[program,ms]);
    const schedule=rows[0]||null;
    if(!schedule)return res.json({open:false,schedule:null,message:`${enrollmentService.levelLabel(program,ms)} is not yet open for enrollment.`});
    res.json(enrollmentService.statusMessageForClosedSchedule(schedule,program));
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.checkStudentId=async(req,res)=>{
  try{
    const [r]=await db.execute('SELECT 1 FROM students WHERE student_id=? LIMIT 1',[String(req.query.student_id||'').trim()]);
    res.json({exists:r.length>0})
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.register=async(req,res)=>{
  const conn=await db.getConnection();
  try{
    const b=req.body;
    const required=['student_id','first_name','last_name','contact_number','religion','birthdate','sex','place_of_birth','temporary_barangay','temporary_municipality','temporary_province','permanent_barangay','permanent_municipality','permanent_province','father_name','father_occupation','mother_name','mother_occupation','emergency_contact_name','emergency_contact_address','emergency_contact_relationship','emergency_contact_contact_number','course','year_level','nstp_component','height','weight','blood_type','complexion','medical_certificate','email','username','password','photo','cor_file'];
    for(const k of required)if(!b[k])return res.status(400).json({message:`${k.replaceAll('_',' ')} is required.`});
    if(!/^\d{6}-\d{4}$/.test(b.student_id))return res.status(400).json({message:'Student ID must use format 000000-0000.'});
    if(String(b.contact_number).length!==11||String(b.emergency_contact_contact_number).length!==11)return res.status(400).json({message:'Contact numbers must contain 11 digits.'});
    if(!['ROTC','CWTS'].includes(b.nstp_component))return res.status(400).json({message:'Select ROTC or CWTS.'});
    // Exact old-system rule: first-time enrollment is MS/CWTS 1 only.
    const msLevel='1';
    const [schRows]=await conn.execute("SELECT * FROM enrollment_schedules WHERE program=? AND ms_level='1' ORDER BY id DESC LIMIT 1",[b.nstp_component]);
    const schedule=schRows[0];
    if(!schedule)return res.status(400).json({message:`${b.nstp_component} ${b.nstp_component==='ROTC'?'MS':'CWTS'} 1 is not yet open for enrollment.`});
    if(!enrollmentService.nowWithin(schedule))return res.status(400).json({message:'Enrollment is currently unavailable for the selected component.'});
    const [dup]=await conn.execute('SELECT id FROM students WHERE email=? OR username=? OR student_id=?',[b.email,b.username,b.student_id]);
    if(dup.length)return res.status(409).json({message:'Student ID, email, or username is already registered.'});
    if(b.password!==b.confirm_password)return res.status(400).json({message:'Passwords do not match.'});
    const passwordError=authService.passwordValidationMessage(b.password);
    if(passwordError)return res.status(400).json({message:passwordError});
    if(b.nstp_component==='ROTC'&&!b.xray_file)return res.status(400).json({message:'X-ray is required for ROTC enrollment.'});
    const pass=await bcrypt.hash(b.password,10);
    await conn.beginTransaction();
    const sql=`INSERT INTO students (student_id,last_name,first_name,middle_name,suffix,religion,birthdate,sex,contact_number,place_of_birth,temporary_barangay,temporary_municipality,temporary_province,permanent_barangay,permanent_municipality,permanent_province,father_name,father_occupation,mother_name,mother_occupation,emergency_contact_name,emergency_contact_address,emergency_contact_relationship,emergency_contact_contact_number,willing_to_take_advance_course,willing_to_be_medics,willing_to_be_military_police,course,year_level,nstp_component,height,weight,blood_type,complexion,has_medical_condition,medical_condition,medical_certificate,xray_file,email,username,password,photo,cor_file,role) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'student')`;
    const vals=[b.student_id,b.last_name,b.first_name,b.middle_name||'',b.suffix||null,b.religion,b.birthdate,b.sex,b.contact_number,b.place_of_birth,b.temporary_barangay,b.temporary_municipality,b.temporary_province,b.permanent_barangay,b.permanent_municipality,b.permanent_province,b.father_name,b.father_occupation,b.mother_name,b.mother_occupation,b.emergency_contact_name,b.emergency_contact_address,b.emergency_contact_relationship,b.emergency_contact_contact_number,Number(b.willing_to_take_advance_course||0),Number(b.willing_to_be_medics||0),Number(b.willing_to_be_military_police||0),b.course,b.year_level,b.nstp_component,b.height,b.weight,b.blood_type,b.complexion,enrollmentService.normalizeMedicalCondition(b.has_medical_condition),b.medical_condition||'',b.medical_certificate,b.xray_file||null,b.email,b.username,pass,b.photo,b.cor_file];
    const [r]=await conn.execute(sql,vals);
    await conn.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program) VALUES(?,?,?,'pending',?)",[r.insertId,String(schedule.id),msLevel,b.nstp_component]);
    await conn.commit();
    res.status(201).json({message:'Enrollment submitted successfully. Your record is pending administrator verification.'});
  }   catch(e){
    try{
      await conn.rollback()
    }   catch{
    }
    ;
    console.error(e);
    res.status(500).json({message:e.message})
  }   finally{
    conn.release()
  }
}
;
exports.dashboard=async(req,res)=>{
  try{
    const s=await studentById(req.user.id);
    const record=await latestRecord(req.user.id);
    const [grade]=await db.execute('SELECT * FROM student_grades WHERE student_id=? ORDER BY id DESC LIMIT 1',[req.user.id]);
    const [serial]=await db.execute('SELECT * FROM serial_numbers WHERE student_id=? ORDER BY id DESC LIMIT 1',[req.user.id]);
    const [att]=await db.execute("SELECT COUNT(*) total,SUM(status='present') present,SUM(status='late') late,SUM(status='absent') absent FROM attendance_records WHERE student_id=?",[req.user.id]);
    res.json({student:studentPublic(s),record,grade:grade[0]||null,serial:serial[0]||null,attendance:att[0]})
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.profile=async(req,res)=>{
  try{
    const s=await studentById(req.user.id);
    const [records]=await db.execute('SELECT * FROM student_ms_records WHERE student_id=? ORDER BY created_at DESC',[req.user.id]);
    res.json({student:studentPublic(s),records})
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.grades=async(req,res)=>{
  const [r]=await db.execute('SELECT * FROM student_grades WHERE student_id=? ORDER BY ms_level',[req.user.id]);
  res.json(r)
}
;
exports.serial=async(req,res)=>{
  const [r]=await db.execute('SELECT * FROM serial_numbers WHERE student_id=? ORDER BY id DESC',[req.user.id]);
  res.json(r)
}
;
exports.attendance = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT ar.*,ses.open_date,ses.close_date,ses.program,ses.ms_level,ses.school_year,
              ses.mi_number,ses.mi_type,ses.is_advance_course
       FROM attendance_records ar
       JOIN attendance_sessions ses ON ses.id=ar.attendance_session_id
       WHERE ar.student_id=?
       ORDER BY ses.mi_number DESC,FIELD(ses.mi_type,'out','in'),ar.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.openSessions = async (req, res) => {
  try {
    const attendanceService = require('../services/attendanceService');
    const student = await studentById(req.user.id);
    const latest = await latestRecord(req.user.id);
    if (!latest || latest.status !== 'approved' || student.serial_number) return res.json([]);

    const [rows] = await db.execute(
      `SELECT * FROM attendance_sessions
       WHERE program=? AND (ms_level IS NULL OR ms_level=?)
       ORDER BY created_at DESC,id DESC`,
      [student.nstp_component, latest.ms_level]
    );

    const isAdvance = platoonService.isAdvanceCourseCadet(student);

    const eligible = rows
      .filter((session) => {
        if (student.nstp_component === 'ROTC') {
          return Boolean(Number(session.is_advance_course || 0)) === isAdvance;
        }
        return true;
      })
      .map((session) => ({
        ...session,
        effective_status: attendanceService.getEffectiveStatus(session),
        late_deadline: attendanceService.lateDeadline(session.close_date),
      }))
      .filter((session) => ['scheduled', 'open', 'late'].includes(session.effective_status));

    res.json(eligible);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.markAttendance = async (req, res) => {
  try {
    const attendanceService = require('../services/attendanceService');
    const { sessionId, latitude, longitude } = req.body;
    const [[session]] = await db.execute('SELECT * FROM attendance_sessions WHERE id=?', [sessionId]);
    if (!session) return res.status(404).json({ message: 'Attendance session not found.' });

    const student = await studentById(req.user.id);
    if (student.serial_number) return res.status(400).json({ message: 'You have already completed NSTP and cannot record attendance.' });
    if (student.nstp_component !== session.program) return res.status(403).json({ message: 'This attendance session is not for your NSTP program.' });

    const latest = await latestRecord(req.user.id);
    if (!latest || latest.status !== 'approved') return res.status(403).json({ message: 'Your enrollment must be approved before you can mark attendance.' });
    if (session.ms_level && String(latest.ms_level) !== String(session.ms_level)) {
      return res.status(403).json({ message: `This session is for ${session.program === 'ROTC' ? 'MS' : 'CWTS'} ${session.ms_level}.` });
    }

    if (session.program === 'ROTC') {
      const isAdvance = platoonService.isAdvanceCourseCadet(student);
      if (Boolean(Number(session.is_advance_course || 0)) !== isAdvance) {
        return res.status(403).json({ message: isAdvance ? 'Use the Advance Course attendance session.' : 'This session is for Advance Course students only.' });
      }
    }

    const markStatus = attendanceService.attendanceStatusForMark(session);
    const effectiveStatus = attendanceService.getEffectiveStatus(session);
    if (!markStatus) {
      if (effectiveStatus === 'scheduled') return res.status(400).json({ message: 'This attendance session has not opened yet.' });
      return res.status(400).json({ message: 'This attendance session has already ended.' });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const meters = attendanceService.haversineMeters(lat, lng, session.latitude, session.longitude);
    if (!Number.isFinite(meters)) return res.status(400).json({ message: 'A valid device location is required.' });
    if (meters > Number(session.radius_meters || attendanceService.ATTENDANCE_RADIUS_METERS)) {
      return res.status(400).json({ message: `You are outside the attendance area (${Math.round(meters)}m away). Move within the ${session.radius_meters || attendanceService.ATTENDANCE_RADIUS_METERS}m radius.` });
    }

    const [existing] = await db.execute(
      'SELECT id,status FROM attendance_records WHERE student_id=? AND attendance_session_id=? LIMIT 1',
      [req.user.id, sessionId]
    );
    if (existing.length) {
      return res.status(409).json({ message: `Attendance already marked as ${existing[0].status}.` });
    }

    await db.execute(
      `INSERT INTO attendance_records
       (student_id,attendance_session_id,status,mi_number,mi_type,latitude,longitude,distance_meters)
       VALUES(?,?,?,?,?,?,?,?)`,
      [req.user.id, sessionId, markStatus, session.mi_number, session.mi_type, lat, lng, Math.round(meters * 100) / 100]
    );

    res.json({
      message: markStatus === 'late' ? 'Attendance marked as Late.' : 'Attendance marked successfully.',
      status: markStatus,
      distance: Math.round(meters),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
;
exports.reEnroll=async(req,res)=>{
  try{
    const s=await studentById(req.user.id);
    const [ms1Grades]=await db.execute("SELECT * FROM student_grades WHERE student_id=? AND ms_level='1' AND program=? LIMIT 1",[req.user.id,s.nstp_component]);
    const latest=await latestRecord(req.user.id);
    if(!latest||String(latest.ms_level)!=='1'||latest.status!=='approved')return res.status(400).json({message:`You can apply for ${s.nstp_component==='ROTC'?'MS':'CWTS'} 2 only after your level 1 enrollment is approved.`});
    if(ms1Grades[0]&&ms1Grades[0].status==='Failed')return res.status(400).json({message:'You cannot proceed to level 2 because your level 1 grade is Failed.'});
    const [dup]=await db.execute("SELECT id FROM student_ms_records WHERE student_id=? AND ms_level='2' AND status IN ('pending','approved') LIMIT 1",[req.user.id]);
    if(dup.length)return res.status(409).json({message:'You already have a level 2 enrollment request.'});
    const [sch]=await db.execute("SELECT * FROM enrollment_schedules WHERE program=? AND ms_level='2' ORDER BY id DESC LIMIT 1",[s.nstp_component]);
    const schedule=sch[0];
    if(!schedule||!enrollmentService.nowWithin(schedule))return res.status(400).json({message:`${s.nstp_component==='ROTC'?'MS':'CWTS'} 2 enrollment is not open at this time.`});
    await db.execute("INSERT INTO student_ms_records(student_id,schedule_id,ms_level,status,program) VALUES(?,?, '2','pending',?)",[req.user.id,String(schedule.id),s.nstp_component]);
    res.json({message:`${s.nstp_component==='ROTC'?'MS':'CWTS'} 2 enrollment submitted successfully.`})
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.withdrawal=async(req,res)=>{
  try{
    if(req.method==='GET'){
      const [r]=await db.execute('SELECT id,reason,status,admin_remarks,created_at FROM advance_course_withdrawals WHERE student_id=? ORDER BY created_at DESC LIMIT 1',[req.user.id]);
      return res.json(r[0]||null)
    }
    const student=await studentById(req.user.id);
    if(student.nstp_component!=='ROTC'||!Number(student.willing_to_take_advance_course))return res.status(400).json({message:'Withdrawal requests are available only to Advance Course students.'});
    const {
      reason
    }
    =req.body;
    if(!reason||reason.trim().length<5)return res.status(400).json({message:'Please enter your reason for withdrawal.'});
    const [pending]=await db.execute("SELECT id FROM advance_course_withdrawals WHERE student_id=? AND status='pending' LIMIT 1",[req.user.id]);
    if(pending.length)return res.status(409).json({message:'You already have a pending withdrawal request.'});
    await db.execute('INSERT INTO advance_course_withdrawals(student_id,reason) VALUES(?,?)',[req.user.id,reason.trim()]);
    res.json({message:'Withdrawal request submitted.'})
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;

exports.certificateSettings=async(req,res)=>{
 try{const [st]=await db.execute('SELECT nstp_component FROM students WHERE id=?',[req.user.id]);const program=st[0]?.nstp_component;const [r]=await db.execute('SELECT * FROM serial_number_settings WHERE program=?',[program]);res.json(r[0]||{})}catch(e){res.status(500).json({message:e.message})}
};
exports.certificate=async(req,res)=>{
 try{const [st]=await db.execute('SELECT * FROM students WHERE id=?',[req.user.id]);const student=st[0];if(!student)return res.status(404).json({message:'Student not found.'});const [sn]=await db.execute('SELECT * FROM serial_numbers WHERE student_id=? AND program=?',[req.user.id,student.nstp_component]);if(!sn[0])return res.status(404).json({message:'Certificate is not yet available.'});const [set]=await db.execute('SELECT * FROM serial_number_settings WHERE program=?',[student.nstp_component]);const {certificatePdf}=require('../services/certificateService');return certificatePdf(res,{student,serial:sn[0],settings:set[0]||{},program:student.nstp_component,assets:require('path').join(__dirname,'../public/images')});}catch(e){if(!res.headersSent)res.status(500).json({message:e.message})}
};

exports.attendanceOffense = async (req, res) => {
  try {
    const offenseService = require('../services/offenseService');
    const offense = await offenseService.get(req.user.id);
    res.json(offense || null);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.acknowledgeAttendanceWarning = async (req, res) => {
  try {
    const offenseService = require('../services/offenseService');
    const offense = await offenseService.get(req.user.id);
    if (!offense || Number(offense.offend || 0) !== 1) {
      return res.status(400).json({ message: 'There is no warning to acknowledge.' });
    }
    const updated = await offenseService.acknowledge(req.user.id);
    res.json({ message: 'Attendance warning acknowledged.', offense: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
