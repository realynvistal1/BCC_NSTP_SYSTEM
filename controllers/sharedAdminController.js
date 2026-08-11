const db=require('../config/database');
const gradesService=require('../services/gradesService');
const platoonService=require('../services/platoonService');
function program(req){
  return req.params.program?.toUpperCase() || (/cwts/i.test(req.user.portal)?'CWTS':'ROTC');
}
exports.dashboard=async(req,res)=>{
  try{
    const p=program(req);
    const [[counts]]=await db.query(`SELECT COUNT(*) total,SUM(smr.status='pending') pending,SUM(smr.status='approved') approved,SUM(smr.status='rejected') rejected FROM student_ms_records smr JOIN students s ON s.id=smr.student_id WHERE smr.program=?`,[p]);
    const [[assigned]]=await db.query(`SELECT SUM(CASE WHEN ?='CWTS' THEN s.company IS NOT NULL ELSE (s.rotc_company IS NOT NULL OR s.special_unit IS NOT NULL) END) assigned FROM students s WHERE s.nstp_component=? AND s.role='student'`,[p,p]);
    res.json({program:p,...counts,assigned:assigned.assigned||0});
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.schedules=async(req,res)=>{
  try{
    const p=program(req);
    if(req.method==='GET'){
      const [r]=await db.execute('SELECT * FROM enrollment_schedules WHERE program=? ORDER BY year DESC, ms_level DESC, id DESC',[p]);
      return res.json(r);
    }
    const {
      ms_level,year,open_date,deadline
    }
    =req.body;
    if(!['1','2'].includes(String(ms_level||''))) return res.status(400).json({message:'Select a valid enrollment level.'});
    if(!String(year||'').trim()||!open_date||!deadline) return res.status(400).json({message:'Complete the school year, opening date, and deadline.'});
    const open=new Date(open_date), end=new Date(deadline);
    if(Number.isNaN(open.getTime())||Number.isNaN(end.getTime())) return res.status(400).json({message:'Enter valid enrollment dates and times.'});
    if(end.getTime()<=open.getTime()) return res.status(400).json({message:'The closing date/time must be later than the opening date/time.'});
    const now=new Date();
    const [existing]=await db.execute('SELECT id,ms_level,year,open_date,deadline FROM enrollment_schedules WHERE program=? ORDER BY year DESC, ms_level DESC, id DESC',[p]);
    const blocking=existing.find(x=>now.getTime()<=new Date(x.deadline).getTime());
    if(blocking) return res.status(409).json({message:`A current or upcoming ${p} enrollment schedule already exists. Wait until it closes before creating a new schedule.`});

    // Required sequence: Level 1 must exist first, then Level 2 in the same school year.
    // After Level 2, the next schedule starts again at Level 1 for the next school year.
    const currentYear=new Date().getFullYear();
    let expectedLevel='1';
    let expectedYear=`${currentYear}-${currentYear+1}`;
    if(existing[0]){
      const latest=existing[0];
      if(String(latest.ms_level)==='1'){
        expectedLevel='2';
        expectedYear=String(latest.year);
      } else {
        const start=parseInt(String(latest.year||'').split('-')[0],10)||currentYear;
        expectedLevel='1';
        expectedYear=`${start+1}-${start+2}`;
      }
    }
    if(String(ms_level)!==expectedLevel || String(year).trim()!==expectedYear){
      const label=p==='CWTS'?'CWTS':'MS';
      return res.status(409).json({message:`The next allowed schedule is ${label} ${expectedLevel} for SY ${expectedYear}. ${label} 2 cannot be created before ${label} 1.`});
    }

    const [dup]=await db.execute('SELECT id FROM enrollment_schedules WHERE program=? AND ms_level=? AND year=? LIMIT 1',[p,expectedLevel,expectedYear]);
    if(dup.length) return res.status(409).json({message:`A ${p==='CWTS'?'CWTS':'MS'} ${expectedLevel} schedule for SY ${expectedYear} already exists.`});
    await db.execute('INSERT INTO enrollment_schedules(program,ms_level,year,open_date,deadline) VALUES(?,?,?,?,?)',[p,expectedLevel,expectedYear,open_date,deadline]);
    res.json({message:`${p} enrollment schedule created successfully.`});
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.enrollments=async(req,res)=>{
  try{
    const p=program(req);
    // Keep the list response lightweight. Large uploaded documents are loaded only
    // when the administrator opens View / Edit. This prevents blank pages on reload.
    const [r]=await db.execute(`SELECT
      smr.id record_id,smr.schedule_id,smr.status,smr.ms_level,smr.rejection_reason,smr.created_at,
      s.id,s.student_id,s.last_name,s.first_name,s.middle_name,s.suffix,s.email,s.contact_number,
      s.sex,s.course,s.year_level,s.nstp_component,s.has_medical_condition,s.medical_condition,
      s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,
      s.willing_to_take_advance_course,s.willing_to_be_medics,s.willing_to_be_military_police
      FROM student_ms_records smr
      JOIN students s ON s.id=smr.student_id
      WHERE smr.program=? AND s.role='student'
      ORDER BY smr.created_at DESC`,[p]);
    res.json(r);
  } catch(e){
    res.status(500).json({message:e.message});
  }
};

exports.enrollmentDetail=async(req,res)=>{
  try{
    const p=program(req);
    const [[row]]=await db.execute(`SELECT smr.id record_id,smr.schedule_id,smr.status,smr.ms_level,smr.rejection_reason,smr.created_at,s.*
      FROM student_ms_records smr
      JOIN students s ON s.id=smr.student_id
      WHERE smr.id=? AND smr.program=? AND s.role='student' LIMIT 1`,[req.params.id,p]);
    if(!row)return res.status(404).json({message:'Enrollment record not found.'});
    delete row.password;
    res.json(row);
  } catch(e){
    res.status(500).json({message:e.message});
  }
};
exports.updateEnrollment=async(req,res)=>{
  try{
    const p=program(req);
    const {
      status,rejection_reason
    }
    =req.body;
    if(!['pending','approved','rejected'].includes(status))return res.status(400).json({message:'Invalid status'});
    const [[rec]]=await db.execute(`SELECT smr.*,s.has_medical_condition,s.medical_condition,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit FROM student_ms_records smr JOIN students s ON s.id=smr.student_id WHERE smr.id=? AND smr.program=?`,[req.params.id,p]);
    if(!rec)return res.status(404).json({message:'Enrollment record not found.'});
    await db.execute('UPDATE student_ms_records SET status=?,rejection_reason=? WHERE id=?',[status,status==='rejected'?(rejection_reason||'Please contact your NSTP administrator.'):null,req.params.id]);
    if(status==='approved'){
      // Expected behavior: re-enrollment approval keeps the existing assignment.
      if(String(rec.ms_level)==='2'&&(rec.company||rec.battalion||rec.rotc_company||rec.special_unit)) return res.json({message:'Enrollment approved. Existing assignment retained.'});
      if(p==='CWTS'){
        const companies=['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot'];
        const limit=60;
        const [counts]=await db.query(`SELECT company,COUNT(*) total FROM students s WHERE s.nstp_component='CWTS' AND s.company IS NOT NULL AND EXISTS(SELECT 1 FROM student_ms_records r WHERE r.student_id=s.id AND r.status='approved') GROUP BY company`);
        const map=Object.fromEntries(companies.map(c=>[c,0]));
        counts.forEach(x=>map[x.company]=Number(x.total));
        const company=companies.find(c=>map[c]<limit);
        if(!company){
          await db.execute("UPDATE student_ms_records SET status='pending' WHERE id=?",[req.params.id]);
          return res.status(409).json({message:'All CWTS companies are full. Enrollment was left pending.'});
        }
        await db.execute('UPDATE students SET company=? WHERE id=?',[company,rec.student_id]);
        return res.json({message:`Enrollment approved and automatically assigned to ${company} Company.`});
      }
      // Match old source: medical condition -> HQ, Medics preference -> Medics, MP preference -> MP.
      const [[pref]]=await db.execute('SELECT has_medical_condition,willing_to_be_medics,willing_to_be_military_police,willing_to_take_advance_course FROM students WHERE id=?',[rec.student_id]);
      const unit=platoonService.specialUnitForStudent(pref);
      if(unit){
        if(unit!=='HQ'){
          const [[ct]]=await db.execute('SELECT COUNT(*) total FROM students s WHERE s.special_unit=? AND EXISTS(SELECT 1 FROM student_ms_records r WHERE r.student_id=s.id AND r.status=\'approved\')',[unit]);
          if(Number(ct.total||0)>=37){
            await db.execute("UPDATE student_ms_records SET status='pending' WHERE id=?",[req.params.id]);
            return res.status(409).json({message:`${unit} is already full (37/37). Enrollment was left pending.`});
          }
        }
        await db.execute('UPDATE students SET special_unit=?,platoon=?,battalion=NULL,rotc_company=NULL,rotc_platoon=NULL WHERE id=?',[unit,unit,rec.student_id]);
        return res.json({message:`Enrollment approved. Cadet assigned to ${unit}.`});
      }
      // Advance Course cadets are shown in the Advance Course list; regular cadets wait for automatic platoon assignment.
      await db.execute("UPDATE students SET battalion=NULL,rotc_company=NULL,rotc_platoon=NULL,special_unit=NULL WHERE id=?",[rec.student_id]);
      if(Number(pref?.willing_to_take_advance_course||0)===1) return res.json({message:'Enrollment approved. Cadet added to the Advance Course list.'});
      return res.json({message:'Enrollment approved. Cadet is ready for automatic platoon assignment after enrollment closes.'});
    }
    res.json({message:`Enrollment ${status}.`})
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.bulkApprove=async(req,res)=>{
  try{
    const p=program(req);
    const ids=Array.isArray(req.body.ids)?req.body.ids.map(Number).filter(Boolean):[];
    if(!ids.length)return res.status(400).json({message:'No pending enrollment records selected.'});
    let approved=0, skipped=0, failed=0;
    const messages=[];
    for(const id of ids){
      try{
        const [[rec]]=await db.execute(`SELECT smr.*,s.has_medical_condition,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit FROM student_ms_records smr JOIN students s ON s.id=smr.student_id WHERE smr.id=? AND smr.program=?`,[id,p]);
        if(!rec||rec.status!=='pending'){
          skipped++;
          continue;
        }
        if(p==='CWTS'){
          const companies=['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot'];
          const limit=60;
          const [counts]=await db.query(`SELECT s.company,COUNT(DISTINCT s.id) total FROM students s WHERE s.nstp_component='CWTS' AND s.company IS NOT NULL AND EXISTS(SELECT 1 FROM student_ms_records r WHERE r.student_id=s.id AND r.status='approved') GROUP BY s.company`);
          const map=Object.fromEntries(companies.map(c=>[c,0]));
          counts.forEach(x=>map[x.company]=Number(x.total));
          const company=companies.find(c=>map[c]<limit);
          if(!company){
            failed++;
            messages.push('CWTS companies are full.');
            continue;
          }
          await db.execute("UPDATE student_ms_records SET status='approved',rejection_reason=NULL WHERE id=?",[id]);
          if(String(rec.ms_level)!=='2'||!rec.company) await db.execute('UPDATE students SET company=? WHERE id=?',[company,rec.student_id]);
        }   else{
          await db.execute("UPDATE student_ms_records SET status='approved',rejection_reason=NULL WHERE id=?",[id]);
          if(String(rec.ms_level)!=='2'){
            const [[pref]]=await db.execute('SELECT has_medical_condition,willing_to_be_medics,willing_to_be_military_police,willing_to_take_advance_course FROM students WHERE id=?',[rec.student_id]);
            const unit=platoonService.specialUnitForStudent(pref);
            if(unit){
              if(unit!=='HQ'){
                const [[ct]]=await db.execute('SELECT COUNT(*) total FROM students s WHERE s.special_unit=? AND EXISTS(SELECT 1 FROM student_ms_records r WHERE r.student_id=s.id AND r.status=\'approved\')',[unit]);
                if(Number(ct.total||0)>=37){
                  await db.execute("UPDATE student_ms_records SET status='pending' WHERE id=?",[id]);
                  failed++;
                  approved--;
                  continue;
                }
              }
              await db.execute('UPDATE students SET special_unit=?,platoon=?,battalion=NULL,rotc_company=NULL,rotc_platoon=NULL WHERE id=?',[unit,unit,rec.student_id]);
            }    else {
              await db.execute('UPDATE students SET special_unit=NULL,battalion=NULL,rotc_company=NULL,rotc_platoon=NULL WHERE id=?',[rec.student_id]);
            }
          }
        }
        approved++;
      }   catch(err){
        failed++;
        messages.push(err.message);
      }
    }
    res.json({message:`Bulk review complete: ${approved} approved, ${skipped} skipped, ${failed} failed.`,approved,skipped,failed,details:messages.slice(0,3)});
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.bulkReject=async(req,res)=>{
  try{
    const p=program(req);
    const ids=Array.isArray(req.body.ids)?req.body.ids.map(Number).filter(Boolean):[];
    const rejectionReason=String(req.body.rejection_reason||'').trim();
    if(!ids.length)return res.status(400).json({message:'No pending enrollment records selected.'});
    if(!rejectionReason)return res.status(400).json({message:'Enter the reason for rejecting the selected enrollments.'});
    let rejected=0, skipped=0, failed=0;
    const messages=[];
    for(const id of ids){
      try{
        const [[rec]]=await db.execute(`SELECT id,status FROM student_ms_records WHERE id=? AND program=? LIMIT 1`,[id,p]);
        if(!rec||rec.status!=='pending'){
          skipped++;
          continue;
        }
        await db.execute("UPDATE student_ms_records SET status='rejected',rejection_reason=? WHERE id=?",[rejectionReason,id]);
        rejected++;
      }catch(err){
        failed++;
        messages.push(err.message);
      }
    }
    res.json({message:`Bulk review complete: ${rejected} rejected, ${skipped} skipped, ${failed} failed.`,rejected,skipped,failed,details:messages.slice(0,3)});
  }catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.roster=async(req,res)=>{
  try{
    const p=program(req);
    const [r]=await db.execute(`SELECT s.id,s.student_id,s.first_name,s.middle_name,s.last_name,s.suffix,s.sex,s.course,s.year_level,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,s.has_medical_condition,s.medical_condition,s.willing_to_take_advance_course,s.willing_to_be_medics,s.willing_to_be_military_police,smr.ms_level FROM students s JOIN student_ms_records smr ON smr.student_id=s.id WHERE s.nstp_component=? AND smr.program=? AND smr.status='approved' AND smr.id=(SELECT MAX(x.id) FROM student_ms_records x WHERE x.student_id=s.id AND x.program=smr.program AND x.ms_level=smr.ms_level) ORDER BY s.last_name,s.first_name`,[p,p]);
    res.json(r)
  }   catch(e){
    res.status(500).json({message:e.message})
  }
}
;
exports.autoAssign=async(req,res)=>{
  try{
    const p=program(req);
    if(p==='CWTS')return res.status(400).json({message:'CWTS company assignment happens automatically during approval, matching the system.'});
    const ms=String(req.body.ms_level||req.query.ms_level||'1');
    const [sched]=await db.execute('SELECT * FROM enrollment_schedules WHERE program=\'ROTC\' AND ms_level=? ORDER BY id DESC LIMIT 1',[ms]);
    if(sched[0]&&Date.now()<=new Date(sched[0].deadline).getTime())return res.status(400).json({message:`Wait until the MS ${ms} enrollment schedule closes before assigning platoons.`});
    const [rows]=await db.execute(`SELECT s.id,s.last_name,s.first_name,s.middle_name,s.suffix,s.sex,s.rotc_company,s.rotc_platoon,s.special_unit,s.has_medical_condition,s.willing_to_take_advance_course,s.willing_to_be_medics,s.willing_to_be_military_police FROM students s JOIN student_ms_records r ON r.student_id=s.id WHERE s.nstp_component='ROTC' AND r.ms_level=? AND r.status='approved' AND r.id=(SELECT MAX(x.id) FROM student_ms_records x WHERE x.student_id=s.id AND x.ms_level=?) ORDER BY s.last_name,s.first_name,s.middle_name,s.id`,[ms,ms]);
    const maleCompanies=['Alpha','Bravo','Charlie','Delta'],femaleCompanies=['Echo','Foxtrot','Golf','Hotel'],platoons=4,slot=37;
    const candidates=rows.filter(x=>!x.rotc_company&&!x.special_unit&&!x.has_medical_condition&&!x.willing_to_take_advance_course&&!x.willing_to_be_medics&&!x.willing_to_be_military_police);
    const assignedExisting=rows.filter(x=>x.rotc_company&&!x.special_unit);
    function countsFor(companies,sex){
      const out={
      }
      ;
      for(const c of companies)for(let p=1;p<=platoons;p++)out[`${c}|${p}`]=0;
      for(const x of assignedExisting.filter(r=>r.sex===sex)){
        const k=`${x.rotc_company}|${x.rotc_platoon}`;
        if(k in out)out[k]++;
      }
      return out
    }
    async function assignGroup(list,battalion,companies,counts){
      let assigned=0;
      for(const st of [...list].sort((a,b)=>{
        const last=String(a.last_name||'').localeCompare(String(b.last_name||''),undefined,{sensitivity:'base'});
        if(last)return last;
        const first=String(a.first_name||'').localeCompare(String(b.first_name||''),undefined,{sensitivity:'base'});
        if(first)return first;
        const middle=String(a.middle_name||'').localeCompare(String(b.middle_name||''),undefined,{sensitivity:'base'});
        if(middle)return middle;
        return Number(a.id)-Number(b.id);
      })){
        let choice=null;
        outer:for(const c of companies){
          for(let p=1;p<=platoons;p++){
            const k=`${c}|${p}`;
            if(counts[k]<slot){
              choice={
                c,p,k
              }
              ;
              break outer
            }
          }
        }
        if(!choice)break;
        await db.execute('UPDATE students SET battalion=?,rotc_company=?,rotc_platoon=?,platoon=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[battalion,choice.c,choice.p,`${choice.c} - Platoon ${choice.p}`,st.id]);
        counts[choice.k]++;
        assigned++;
      }
      return assigned
    }
    const males=candidates.filter(x=>x.sex==='Male'),females=candidates.filter(x=>x.sex==='Female');
    const a1=await assignGroup(males,1,maleCompanies,countsFor(maleCompanies,'Male'));
    const a2=await assignGroup(females,2,femaleCompanies,countsFor(femaleCompanies,'Female'));
    res.json({message:`Automatic platoon assignment complete. ${a1+a2} cadet(s) assigned.`,assigned:a1+a2,alreadyAssigned:rows.length-candidates.length})
  }   catch(e){
    console.error(e);
    res.status(500).json({message:e.message})
  }
}
;
exports.grades=async(req,res)=>{
  try{
    const p=program(req);
    if(req.method==='GET'){
      const [students]=await db.execute(`
        SELECT s.id student_id,s.student_id student_no,s.first_name,s.middle_name,s.last_name,s.suffix,
               s.course,s.year_level,s.sex,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,
               s.willing_to_take_advance_course,
               MAX(CASE WHEN smr.ms_level='1' AND smr.status='approved' THEN 1 ELSE 0 END) approved_ms1,
               MAX(CASE WHEN smr.ms_level='2' AND smr.status='approved' THEN 1 ELSE 0 END) approved_ms2,
               MAX(CASE WHEN smr.ms_level='1' AND smr.status='approved' THEN es.year END) ms1_year,
               MAX(CASE WHEN smr.ms_level='2' AND smr.status='approved' THEN es.year END) ms2_year
        FROM students s
        JOIN student_ms_records smr ON smr.student_id=s.id AND smr.program=?
        LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
        WHERE s.nstp_component=? AND s.role='student'
        GROUP BY s.id
        HAVING approved_ms1=1 OR approved_ms2=1
        ORDER BY s.last_name,s.first_name`,[p,p]);
      const [grades]=await db.execute(`SELECT id,student_id,ms_level,midterm,final_term,grade,status,program,updated_at FROM student_grades WHERE program=?`,[p]);
      return res.json({students,grades});
    }
    const {student_id,ms_level,midterm,final_term}=req.body;
    const level=String(ms_level||'');
    if(!['1','2'].includes(level))return res.status(400).json({message:'Select a valid MS/CWTS level.'});
    const [[approved]]=await db.execute(`SELECT COUNT(*) total FROM student_ms_records WHERE student_id=? AND program=? AND ms_level=? AND status='approved'`,[student_id,p,level]);
    if(!Number(approved.total))return res.status(400).json({message:`This student does not have an approved ${p==='CWTS'?'CWTS':'MS'} ${level} enrollment.`});
    const mid=Number(midterm),fin=Number(final_term);
    if(!Number.isFinite(mid)||!Number.isFinite(fin)||mid<1||mid>5||fin<1||fin>5)return res.status(400).json({message:'Midterm and final grades must be from 1.00 to 5.00.'});
    const grade=gradesService.calculateGrade(mid,fin);
    const status=gradesService.statusFromGrade(grade);
    await db.execute(`INSERT INTO student_grades(student_id,ms_level,midterm,final_term,grade,status,program)
      VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE midterm=VALUES(midterm),final_term=VALUES(final_term),grade=VALUES(grade),status=VALUES(status),updated_at=CURRENT_TIMESTAMP`,
      [student_id,level,mid,fin,grade,status,p]);
    res.json({message:'Grades saved successfully.',grade,status});
  }catch(e){res.status(500).json({message:e.message})}
};
exports.offenses = async (req, res) => {
  try {
    const p = program(req);
    const offenseService = require('../services/offenseService');

    if (req.method === 'GET') {
      const [rows] = await db.execute(`
        SELECT
          o.id,o.student_id,o.offend,o.settled,o.warning_acknowledged_at,o.created_at,o.updated_at,
          s.student_id AS student_no,s.first_name,s.middle_name,s.last_name,s.suffix,s.course,s.year_level,
          (
            SELECT smr.ms_level
            FROM student_ms_records smr
            WHERE smr.student_id=s.id AND smr.program=? AND smr.status='approved'
            ORDER BY smr.created_at DESC,smr.id DESC LIMIT 1
          ) AS ms_level,
          (
            SELECT es.year
            FROM student_ms_records smr2
            LEFT JOIN enrollment_schedules es ON CAST(smr2.schedule_id AS UNSIGNED)=es.id
            WHERE smr2.student_id=s.id AND smr2.program=? AND smr2.status='approved'
            ORDER BY smr2.created_at DESC,smr2.id DESC LIMIT 1
          ) AS school_year
        FROM attendance_offenses o
        JOIN students s ON s.id=o.student_id
        WHERE s.nstp_component=? AND s.role='student' AND o.offend>0
        ORDER BY o.updated_at DESC,s.last_name,s.first_name`, [p,p,p]);
      return res.json(rows);
    }

    const studentId = Number(req.body.student_id);
    const action = String(req.body.action || '').toLowerCase();
    if (!studentId) return res.status(400).json({ message: 'Select a valid student.' });
    if (action !== 'settle') return res.status(400).json({ message: 'Only second-offense settlement can be updated here.' });

    const updated = await offenseService.settle(studentId);
    res.json({ message: 'Attendance offense marked as settled. The student may use the system again.', offense: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.serials=async(req,res)=>{
  try{
    const p=program(req);
    if(req.method==='GET'){
      const [rows]=await db.execute(`
        SELECT s.id AS student_id,s.student_id AS student_no,s.first_name,s.middle_name,s.last_name,
               s.course,s.year_level,s.sex,s.company,s.battalion,s.rotc_company,s.rotc_platoon,
               s.special_unit,s.willing_to_take_advance_course,sn.serial_number,sn.created_at AS serial_created_at,
               MAX(CASE WHEN g.ms_level='1' THEN g.grade END) AS ms1_grade,
               MAX(CASE WHEN g.ms_level='1' THEN g.status END) AS ms1_status,
               MAX(CASE WHEN g.ms_level='2' THEN g.grade END) AS ms2_grade,
               MAX(CASE WHEN g.ms_level='2' THEN g.status END) AS ms2_status,
               MAX(CASE WHEN r.ms_level='1' AND r.status='approved' THEN r.schedule_id END) AS ms1_schedule,
               MAX(CASE WHEN r.ms_level='2' AND r.status='approved' THEN r.schedule_id END) AS ms2_schedule
        FROM students s
        LEFT JOIN serial_numbers sn ON sn.student_id=s.id AND sn.program=?
        LEFT JOIN student_grades g ON g.student_id=s.id AND g.program=?
        LEFT JOIN student_ms_records r ON r.student_id=s.id AND r.program=?
        WHERE s.nstp_component=? AND s.role='student'
          AND EXISTS(SELECT 1 FROM student_ms_records ar WHERE ar.student_id=s.id AND ar.program=? AND ar.status='approved')
        GROUP BY s.id,s.student_id,s.first_name,s.middle_name,s.last_name,s.course,s.year_level,s.sex,s.company,
                 s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,s.willing_to_take_advance_course,
                 sn.serial_number,sn.created_at
        ORDER BY s.last_name,s.first_name`,[p,p,p,p,p]);
      return res.json(rows.map(row=>({
        ...row,
        eligible:Boolean(row.ms1_grade && row.ms2_grade),
        eligibility_message:(row.ms1_grade && row.ms2_grade)?'Eligible':'Grades Incomplete'
      })));
    }
    const {student_id,serial_number}=req.body;
    if(!student_id||!String(serial_number||'').trim()) return res.status(400).json({message:'Student and serial number are required.'});
    const [gradeRows]=await db.execute(`SELECT ms_level,grade,status FROM student_grades WHERE student_id=? AND program=?`,[student_id,p]);
    if(!gradesService.hasRequiredGradeLevels(gradeRows)) return res.status(400).json({message:'The student is not yet eligible. Both Level 1 and Level 2 grades must be completed.'});
    const [settingsRows]=await db.execute('SELECT * FROM serial_number_settings WHERE program=?',[p]);
    const st=settingsRows[0];
    const complete=p==='ROTC'
      ? Boolean(st?.academic_year&&st?.ceremony_date&&st?.commandant&&st?.school_registrar)
      : Boolean(st?.academic_year&&st?.ceremony_date&&st?.nstp_coordinator&&st?.municipal_mayor&&st?.bcc_president);
    if(!complete) return res.status(400).json({message:'Complete Certificate Settings before assigning a serial number.'});
    const serial=String(serial_number).trim().toUpperCase();
    const [duplicate]=await db.execute('SELECT student_id FROM serial_numbers WHERE serial_number=? AND student_id<>?',[serial,student_id]);
    if(duplicate.length) return res.status(400).json({message:'That serial number is already assigned to another student.'});
    const s1=p==='ROTC'?st.commandant:st.nstp_coordinator;
    const pos1=p==='ROTC'?'Commandant':'NSTP Coordinator';
    const s2=p==='ROTC'?st.school_registrar:st.bcc_president;
    const pos2=p==='ROTC'?'School Registrar':'BCC President';
    const s3=p==='ROTC'?null:st.municipal_mayor;
    const pos3=p==='ROTC'?null:'Municipal Mayor';
    await db.execute(`INSERT INTO serial_numbers(student_id,serial_number,program,signatory_1_name,signatory_1_position,signatory_2_name,signatory_2_position,signatory_3_name,signatory_3_position)
      VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE serial_number=VALUES(serial_number),program=VALUES(program),
      signatory_1_name=VALUES(signatory_1_name),signatory_1_position=VALUES(signatory_1_position),
      signatory_2_name=VALUES(signatory_2_name),signatory_2_position=VALUES(signatory_2_position),
      signatory_3_name=VALUES(signatory_3_name),signatory_3_position=VALUES(signatory_3_position),created_at=CURRENT_TIMESTAMP`,
      [student_id,serial,p,s1,pos1,s2,pos2,s3,pos3]);
    await db.execute('UPDATE students SET serial_number=? WHERE id=?',[serial,student_id]);
    res.json({message:'Serial number assigned and certificate is now available.',serial_number:serial});
  }catch(e){res.status(500).json({message:e.message})}
};

exports.certificateSettings=async(req,res)=>{
  try{
    const p=program(req);
    if(req.method==='GET'){
      const [rows]=await db.execute('SELECT * FROM serial_number_settings WHERE program=?',[p]);
      return res.json(rows[0]||{program:p});
    }
    const b=req.body||{};
    const vals=[
      p,b.academic_year||null,b.ceremony_date||null,b.commandant||null,b.school_registrar||null,
      b.nstp_coordinator||null,b.municipal_mayor||null,b.bcc_president||null,
      b.commandant_signature||null,b.school_registrar_signature||null,b.nstp_coordinator_signature||null,
      b.municipal_mayor_signature||null,b.bcc_president_signature||null
    ];
    await db.execute(`INSERT INTO serial_number_settings(program,academic_year,ceremony_date,commandant,school_registrar,nstp_coordinator,municipal_mayor,bcc_president,commandant_signature,school_registrar_signature,nstp_coordinator_signature,municipal_mayor_signature,bcc_president_signature)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
      academic_year=VALUES(academic_year),ceremony_date=VALUES(ceremony_date),commandant=VALUES(commandant),school_registrar=VALUES(school_registrar),
      nstp_coordinator=VALUES(nstp_coordinator),municipal_mayor=VALUES(municipal_mayor),bcc_president=VALUES(bcc_president),
      commandant_signature=COALESCE(VALUES(commandant_signature),commandant_signature),school_registrar_signature=COALESCE(VALUES(school_registrar_signature),school_registrar_signature),
      nstp_coordinator_signature=COALESCE(VALUES(nstp_coordinator_signature),nstp_coordinator_signature),municipal_mayor_signature=COALESCE(VALUES(municipal_mayor_signature),municipal_mayor_signature),
      bcc_president_signature=COALESCE(VALUES(bcc_president_signature),bcc_president_signature)`,vals);
    const [rows]=await db.execute('SELECT * FROM serial_number_settings WHERE program=?',[p]);
    res.json({message:'Certificate settings saved.',settings:rows[0]});
  }catch(e){res.status(500).json({message:e.message})}
};


exports.certificate=async(req,res)=>{
  try{
    const p=program(req); const studentId=Number(req.params.studentId);
    const [students]=await db.execute('SELECT * FROM students WHERE id=? AND nstp_component=?',[studentId,p]);
    const [serials]=await db.execute('SELECT * FROM serial_numbers WHERE student_id=? AND program=?',[studentId,p]);
    const [settings]=await db.execute('SELECT * FROM serial_number_settings WHERE program=?',[p]);
    if(!students[0]||!serials[0]) return res.status(404).json({message:'Certificate is not yet available.'});
    if(!settings[0]) return res.status(400).json({message:'Certificate settings are not configured.'});
    const {certificatePdf}=require('../services/certificateService');
    return certificatePdf(res,{student:students[0],serial:serials[0],settings:settings[0],program:p,assets:require('path').join(__dirname,'../public/images')});
  }catch(e){ if(!res.headersSent)res.status(500).json({message:e.message}) }
};


exports.records=async(req,res)=>{
  try{
    const p=program(req);
    const [rows]=await db.execute(`
      SELECT smr.id record_id,smr.ms_level,smr.status,smr.created_at,
             COALESCE(es.year,'') school_year,
             s.id student_db_id,s.student_id,s.first_name,s.middle_name,s.last_name,s.suffix,
             s.course,s.year_level,s.nstp_component,s.sex,s.birthdate,s.email,s.contact_number,
             s.permanent_barangay,s.permanent_municipality,s.permanent_province,
             s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,s.willing_to_take_advance_course,
             s.serial_number,
             g.midterm,g.final_term,g.grade,g.status grade_status
      FROM student_ms_records smr
      JOIN students s ON s.id=smr.student_id
      LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
      LEFT JOIN student_grades g ON g.student_id=s.id AND g.program=smr.program AND g.ms_level=smr.ms_level
      WHERE smr.program=? AND smr.status='approved' AND s.role='student'
      ORDER BY s.last_name,s.first_name,smr.ms_level`,[p]);
    res.json(rows);
  }catch(e){res.status(500).json({message:e.message})}
};

exports.recordDetail=async(req,res)=>{
  try{
    const p=program(req), studentId=Number(req.params.studentId), level=String(req.query.ms_level||'1');
    const [[student]]=await db.execute(`SELECT * FROM students WHERE id=? AND nstp_component=? AND role='student' LIMIT 1`,[studentId,p]);
    if(!student)return res.status(404).json({message:'Student record not found.'});
    const [[cycle]]=await db.execute(`SELECT smr.*,COALESCE(es.year,'') school_year FROM student_ms_records smr LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id WHERE smr.student_id=? AND smr.program=? AND smr.ms_level=? AND smr.status='approved' ORDER BY smr.created_at DESC LIMIT 1`,[studentId,p,level]);
    if(!cycle)return res.status(404).json({message:'Approved enrollment cycle not found.'});
    const [grades]=await db.execute(`SELECT * FROM student_grades WHERE student_id=? AND program=? ORDER BY ms_level`,[studentId,p]);
    const params=[studentId,p,level];
    let sy='';
    if(cycle.school_year){sy=' AND (ses.school_year=? OR ses.school_year IS NULL)';params.push(cycle.school_year)}
    const [attendance]=await db.execute(`SELECT ar.id,ar.status,ar.created_at,ar.distance_meters,ar.latitude,ar.longitude,
      ses.mi_number,ses.mi_type,ses.open_date,ses.close_date,ses.school_year,ses.ms_level
      FROM attendance_records ar JOIN attendance_sessions ses ON ses.id=ar.attendance_session_id
      WHERE ar.student_id=? AND ses.program=? AND (ses.ms_level=? OR ses.ms_level IS NULL) ${sy}
      ORDER BY ses.mi_number,FIELD(ses.mi_type,'in','out'),ar.created_at`,params);
    const [serials]=await db.execute(`SELECT * FROM serial_numbers WHERE student_id=? AND program=? ORDER BY id DESC`,[studentId,p]);
    const [withdrawals]=p==='ROTC'?await db.execute(`SELECT id,reason,status,admin_remarks,created_at,updated_at FROM advance_course_withdrawals WHERE student_id=? ORDER BY created_at DESC`,[studentId]):[[]];
    res.json({student,cycle,grades,attendance,serial:serials[0]||null,withdrawals});
  }catch(e){res.status(500).json({message:e.message})}
};

exports.withdrawals=async(req,res)=>{
  try{
    if(req.method==='GET'){
      const [rows]=await db.execute(`SELECT w.*,s.student_id student_no,s.first_name,s.middle_name,s.last_name,s.suffix,s.course,s.year_level,s.sex,s.battalion,s.rotc_company,s.rotc_platoon
        FROM advance_course_withdrawals w JOIN students s ON s.id=w.student_id
        ORDER BY FIELD(w.status,'pending','rejected','approved'),w.created_at DESC`);
      return res.json(rows);
    }
    const id=Number(req.params.id), status=String(req.body.status||'').toLowerCase(), remarks=String(req.body.admin_remarks||'').trim();
    if(!['approved','rejected'].includes(status))return res.status(400).json({message:'Invalid withdrawal action.'});
    const [[request]]=await db.execute(`SELECT w.*,s.sex FROM advance_course_withdrawals w JOIN students s ON s.id=w.student_id WHERE w.id=? AND w.status='pending' LIMIT 1`,[id]);
    if(!request)return res.status(404).json({message:'Withdrawal request not found or already processed.'});
    if(status==='rejected'){
      if(!remarks)return res.status(400).json({message:'Please enter remarks for a rejected request.'});
      await db.execute(`UPDATE advance_course_withdrawals SET status='rejected',admin_remarks=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[remarks,id]);
      return res.json({message:'Withdrawal request rejected.'});
    }

    const conn=await db.getConnection();
    try{
      await conn.beginTransaction();
      await conn.execute(`UPDATE advance_course_withdrawals SET status='approved',admin_remarks=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[remarks||null,id]);
      await conn.execute(`UPDATE students SET willing_to_take_advance_course=0,battalion=NULL,rotc_company=NULL,rotc_platoon=NULL,platoon=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[request.student_id]);
      const [[rec]]=await conn.execute(`SELECT ms_level FROM student_ms_records WHERE student_id=? AND program='ROTC' AND status='approved' ORDER BY created_at DESC LIMIT 1`,[request.student_id]);
      const ms=String(rec?.ms_level||'1');
      const battalion=request.sex==='Male'?1:2;
      const companies=request.sex==='Male'?['Alpha','Bravo','Charlie','Delta']:['Echo','Foxtrot','Golf','Hotel'];
      let choice=null;
      for(const company of companies){
        for(let platoon=1;platoon<=4;platoon++){
          const [[count]]=await conn.execute(`SELECT COUNT(*) total FROM students s JOIN student_ms_records r ON r.student_id=s.id WHERE s.nstp_component='ROTC' AND r.ms_level=? AND r.status='approved' AND s.rotc_company=? AND s.rotc_platoon=? AND s.special_unit IS NULL AND COALESCE(s.willing_to_take_advance_course,0)=0`,[ms,company,platoon]);
          if(Number(count.total)<37){choice={company,platoon};break}
        }
        if(choice)break;
      }
      if(choice){
        await conn.execute(`UPDATE students SET battalion=?,rotc_company=?,rotc_platoon=?,platoon=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[battalion,choice.company,choice.platoon,`${choice.company} - Platoon ${choice.platoon}`,request.student_id]);
      }
      await conn.commit();
      return res.json({message:choice?`Withdrawal approved. Student moved to Battalion ${battalion}, ${choice.company} Company, Platoon ${choice.platoon}.`:`Withdrawal approved, but no regular platoon slot is currently available.`,assignment:choice});
    }catch(err){await conn.rollback();throw err}finally{conn.release()}
  }catch(e){res.status(500).json({message:e.message})}
};

exports.attendanceSummary = async (req, res) => {
  try {
    const attendanceService = require('../services/attendanceService');
    const p = program(req);
    const sessionId = Number(req.query.session_id || 0);
    const group = String(req.query.group || 'overall').toLowerCase();

    if (!sessionId) {
      const [sessions] = await db.execute(
        `SELECT * FROM attendance_sessions WHERE program=? ORDER BY school_year DESC,ms_level DESC,mi_number DESC,FIELD(mi_type,'out','in'),created_at DESC`,
        [p]
      );
      return res.json({
        sessions: sessions.map((session) => ({
          ...session,
          effective_status: attendanceService.getEffectiveStatus(session),
          late_deadline: attendanceService.lateDeadline(session.close_date),
        })),
        late_minutes: attendanceService.LATE_THRESHOLD_MINUTES,
      });
    }

    const [[session]] = await db.execute('SELECT * FROM attendance_sessions WHERE id=? AND program=?', [sessionId, p]);
    if (!session) return res.status(404).json({ message: 'Attendance session not found.' });

    let rosterCondition = '';
    if (p === 'ROTC') {
      if (group === 'battalion-1') rosterCondition = " AND s.battalion=1 AND s.special_unit IS NULL AND s.willing_to_take_advance_course=0";
      else if (group === 'battalion-2') rosterCondition = " AND s.battalion=2 AND s.special_unit IS NULL AND s.willing_to_take_advance_course=0";
      else if (group === 'advance-course') rosterCondition = " AND s.willing_to_take_advance_course=1 AND s.special_unit IS NULL AND COALESCE(s.has_medical_condition,0)=0";
      else if (group === 'special-platoon') rosterCondition = " AND s.special_unit IN ('Medics','HQ','MP')";
    }

    let trackCondition = '';
    if (p === 'ROTC') {
      trackCondition = Number(session.is_advance_course || 0) === 1
        ? " AND s.willing_to_take_advance_course=1 AND s.special_unit IS NULL AND COALESCE(s.has_medical_condition,0)=0"
        : " AND NOT (s.willing_to_take_advance_course=1 AND s.special_unit IS NULL AND COALESCE(s.has_medical_condition,0)=0)";
    }

    const params = [session.id, p, p, String(session.ms_level || '1')];
    let yearCondition = '';
    if (session.school_year) {
      yearCondition = ' AND (es.year=? OR es.year IS NULL)';
      params.push(session.school_year);
    }

    const [students] = await db.execute(
      `SELECT
         s.id,s.student_id,s.first_name,s.middle_name,s.last_name,s.course,s.year_level,s.sex,
         s.nstp_component,s.company,s.battalion,s.rotc_company,s.rotc_platoon,s.special_unit,
         s.willing_to_take_advance_course,
         ar.id record_id,ar.status attendance_status,ar.created_at attendance_time,
         ar.latitude attendance_latitude,ar.longitude attendance_longitude,ar.distance_meters,
         ar.verified_by,ar.verified_at
       FROM students s
       LEFT JOIN attendance_records ar ON ar.student_id=s.id AND ar.attendance_session_id=?
       WHERE s.role='student' AND s.nstp_component=?
         AND EXISTS (
           SELECT 1 FROM student_ms_records smr
           LEFT JOIN enrollment_schedules es ON CAST(smr.schedule_id AS UNSIGNED)=es.id
           WHERE smr.student_id=s.id AND smr.program=? AND smr.ms_level=? AND smr.status='approved' ${yearCondition}
         )
         ${trackCondition} ${rosterCondition}
       ORDER BY s.last_name,s.first_name`,
      params
    );

    const graceOver = attendanceService.getEffectiveStatus(session) === 'closed';
    const normalized = students.map((student) => ({
      ...student,
      attendance_status: student.attendance_status || (graceOver ? 'absent' : 'unmarked'),
    }));

    const counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
    normalized.forEach((student) => {
      counts[student.attendance_status] = (counts[student.attendance_status] || 0) + 1;
    });

    res.json({
      session: { ...session, effective_status: attendanceService.getEffectiveStatus(session), late_deadline: attendanceService.lateDeadline(session.close_date) },
      group,
      students: normalized,
      counts,
      total: normalized.length,
      late_minutes: attendanceService.LATE_THRESHOLD_MINUTES,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyAttendance = async (req, res) => {
  try {
    const offenseService = require('../services/offenseService');
    const p = program(req);
    const sessionId = Number(req.params.sessionId);
    const studentId = Number(req.body.student_id);
    const status = String(req.body.status || '').toLowerCase();
    if (!sessionId || !studentId || !['present','late','absent'].includes(status)) {
      return res.status(400).json({ message: 'Select a valid student and attendance status.' });
    }
    const [[session]] = await db.execute('SELECT id,program,mi_number,mi_type FROM attendance_sessions WHERE id=? AND program=?', [sessionId, p]);
    if (!session) return res.status(404).json({ message: 'Attendance session not found.' });
    const [beforeRows] = await db.execute(
      'SELECT id,status FROM attendance_records WHERE student_id=? AND attendance_session_id=? LIMIT 1',
      [studentId, sessionId]
    );
    const previousStatus = beforeRows[0]?.status || null;

    await db.execute(
      `INSERT INTO attendance_records(student_id,attendance_session_id,status,mi_number,mi_type,verified_by,verified_at)
       VALUES(?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE status=VALUES(status),verified_by=VALUES(verified_by),verified_at=NOW(),updated_at=NOW()`,
      [studentId, sessionId, status, session.mi_number, session.mi_type, req.user.email]
    );
    let offense = null;
    if (status === 'absent' && previousStatus !== 'absent') {
      offense = await offenseService.record(studentId);
    }
    res.json({
      message: offense
        ? (Number(offense.offend) >= 2
          ? 'Attendance verified. Second offense recorded; settlement is required.'
          : 'Attendance verified. First-offense warning recorded.')
        : 'Attendance verified and saved.',
      offense,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


