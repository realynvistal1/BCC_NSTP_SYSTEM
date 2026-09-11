async function studentPage(page,c){
  const d=await API.get('/api/student/dashboard');
  const s=d.student||{
  }
  ,r=d.record||{
  }
  ;
  if(page==='dashboard'){
    const rawStatus=r.status||'Pending';
    const status=badge(rawStatus);
    const assignment=s.special_unit||s.platoon||(s.nstp_component==='CWTS'?s.company:s.rotc_company)||'Not assigned';
    const att=d.attendance||{
    }
    ;
    const grade=d.grade?`${esc(d.grade.grade)} - ${esc(d.grade.status)}`:'Not yet released';
    const serial=esc(d.serial?.serial_number||'Not yet released');
    const welcome=displayNamePart(s.last_name||s.first_name||'Student');
    const intro=document.querySelector('.intro-copy');
    if(intro){
      intro.innerHTML=`<div class="intro-kicker">BCC NSTP Management System</div><h1>Welcome back, ${esc(welcome)}</h1><p>${esc([s.student_id,s.course,s.year_level,s.nstp_component].filter(Boolean).join(' - '))}</p>`;
    }
    const eligibleReEnroll=String(r.ms_level||'')==='1'&&String(rawStatus).toLowerCase()==='approved';
    c.innerHTML=`<div class="portal-dashboard-grid student-dashboard-grid">${dashCard('Enrollment Status',status,'View your current enrollment review status.','/student/enrollment-status','enrollment','blue')}${dashCard('Assigned Platoon',esc(assignment),'View your assigned platoon, battalion, company, or special unit.','/student/assigned-platoon','platoon','green')}${dashCard('Attendance',`${
      att.present||0
    }
    Present`,'Tap to view and mark your attendance.','/student/attendance','attendance','cyan')}${dashCard('Grades',grade,'Grades are released at the end of the semester.','/student/grades','grades','orange')}${dashCard('Serial Number',serial,'Issued upon completion of the program.','/student/serial-number','serial','purple')}${eligibleReEnroll?dashCard('Apply Enrollment','MS 2 Enrollment','Tap to enroll for MS 2 when enrollment is open.','/student/re-enrollment','refresh','indigo'):''}${dashCard('Settings','Account Security','Manage your account password and settings.','/student/settings','settings','blue')}</div>`;
    return
  }
  if(page==='enrollment-status'){
    const p=await API.get('/api/student/profile');
    const x=p.student,rec=p.records[0]||{
    }
    ;
    const enrollmentStatus=String(rec.status||'pending').toLowerCase();
    const reviewComplete=enrollmentStatus==='approved'||enrollmentStatus==='rejected';
    const finalState=enrollmentStatus==='approved'?'done':enrollmentStatus==='rejected'?'current rejected':'pending';
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Enrollment Status</h2><p class="panel-subtitle">Your latest NSTP enrollment information and review result.</p></div>${badge(rec.status||'pending')}</div>${rec.rejection_reason?`<div class="notice error"><strong>Admin remark:</strong> ${
      esc(rec.rejection_reason)
    }
    </div>`:''}${rec.status==='rejected'?`<div class="actions" style="justify-content:flex-start;margin:16px 0 0"><button class="btn primary" id="resubmitEnrollment">Submit Enrollment Again</button></div>`:''}<div class="status-timeline" aria-label="Enrollment progress"><div class="timeline-step done"><div class="timeline-marker"><span>1</span></div><div class="timeline-copy"><strong>Submitted</strong><span>Enrollment received</span></div></div><div class="timeline-step ${reviewComplete?'done':'current'}" ${reviewComplete?'':'aria-current="step"'}><div class="timeline-marker"><span>2</span></div><div class="timeline-copy"><strong>Admin Review</strong><span>${reviewComplete?'Review completed':'Waiting for review'}</span></div></div><div class="timeline-step ${finalState}" ${enrollmentStatus==='rejected'?'aria-current="step"':''}><div class="timeline-marker"><span>3</span></div><div class="timeline-copy"><strong>${enrollmentStatus==='rejected'?'Needs Action':'Approval & Assignment'}</strong><span>${enrollmentStatus==='approved'?'Enrollment approved':enrollmentStatus==='rejected'?'Review the admin remark':'Next step'}</span></div></div></div>${table(['Field','Information'],[['Student ID',x.student_id],['Name',`${
      displayNamePart(x.first_name)
    }
    ${
      displayNamePart(x.middle_name||'')
    }
    ${
      displayNamePart(x.last_name)
    }
    `],['Course',x.course],['Year Level',x.year_level],['NSTP Component',x.nstp_component],['MS Level',rec.ms_level?`MS ${
      rec.ms_level
    }
    `:'-'],['Email',x.email],['Contact',x.contact_number]].map(a=>`<tr><td><strong>${
      a[0]
    }
    </strong></td><td>${
      esc(a[1])
    }
    </td></tr>`))}</div>`;
    if(rec.status==='rejected'&&$('#resubmitEnrollment'))$('#resubmitEnrollment').onclick=()=>location.href='/student/re-enrollment';
    return
  }
  if(page==='assigned-platoon'){
    let assign=s.special_unit?`Special Unit: ${s.special_unit}`:s.nstp_component==='CWTS'?`Company ${s.company||'Not assigned'}`:`${s.battalion?'Battalion '+s.battalion+' - ':''}${s.rotc_company||'Not assigned'}${s.rotc_platoon?' - Platoon '+s.rotc_platoon:''}`;
    c.innerHTML=`<div class="hero-assignment"><div class="assignment-icon">${icon('platoon')}</div><div class="dash-label">Current Assignment</div><h2>${esc(assign)}</h2><p class="muted">Your assignment becomes available after your enrollment is approved and the administrator performs automatic assignment.</p>${s.special_unit==='HQ'?`<div class="notice" style="margin-top:16px;text-align:left"><strong>Advance Course:</strong> If you need to leave the advance course, you may submit a withdrawal request for ROTC Admin review.</div><div class="actions" style="justify-content:center"><button class="btn danger" id="withdrawRequest">Request Withdrawal</button></div>`:''}</div>`;
    if($('#withdrawRequest'))$('#withdrawRequest').onclick=async()=>{
      const reason=prompt('Why do you want to withdraw from Advance Course?')||'';
      if(reason.trim().length<5)return;
      try{
        const x=await API.post('/api/student/withdrawal',{reason});
        toast(x.message)
      }   catch(e){
        toast(e.message,true)
      }
    }
    ;
    return
  }
  if(page==='grades'){
    const rows=await API.get('/api/student/grades');
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>My Grades</h2><p class="panel-subtitle">Official NSTP grades released by your administrator.</p></div></div>${table(['MS Level','Midterm','Final','Average','Status'],rows.map(x=>`<tr><td><strong>MS ${
      x.ms_level
    }
    </strong></td><td>${
      x.midterm??'-'
    }
    </td><td>${
      x.final_term??'-'
    }
    </td><td><strong>${
      x.grade??'-'
    }
    </strong></td><td>${
      badge(x.status)
    }
    </td></tr>`))}</div>`;
    return
  }
  if(page==='serial-number'){
    const rows=await API.get('/api/student/serial-number');
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>NSTP Serial Number</h2><p class="panel-subtitle">Your serial number is issued after successful NSTP completion.</p></div></div>${rows[0]?`<div class="serial-box"><div class="dash-icon purple" style="margin:auto">${
      icon('serial')
    }
    </div><div class="dash-label" style="margin-top:13px">Official NSTP Serial Number</div><div class="serial-code">${
      esc(rows[0].serial_number)
    }
    </div><p class="muted">Program: ${
      esc(rows[0].program||s.nstp_component)
    }
    </p></div>`:'<div class="empty"><div class="empty-icon">'+icon('serial')+'</div>No serial number has been released yet.</div>'}</div>`;
    return
  }
  if(page==='attendance'){
    const sessions=await API.get('/api/student/attendance/sessions');
    const records=await API.get('/api/student/attendance');
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Available Attendance Sessions</h2><p class="panel-subtitle">Location permission is required to mark attendance.</p></div></div><div class="grid">${sessions.map(x=>`<div class="dashboard-card"><div class="dash-top"><span class="dash-icon cyan">${
      icon('location')
    }
    </span>${
      badge(x.status)
    }
    </div><div class="dash-label">${
      esc(x.program)
    }
    Attendance</div><div class="dash-value">MI ${
      x.mi_number||'-'
    }
    ${
      esc((x.mi_type||'').toUpperCase())
    }
    </div><p class="muted">${
      esc(x.open_date)
    }
    to ${
      esc(x.close_date)
    }
    </p><p class="muted">Allowed radius: ${
      x.radius_meters
    }
    meters</p><button class="btn primary" onclick="markAttendance(${x.id})">Use My Location & Mark</button></div>`).join('')||'<div class="empty">No open attendance sessions.</div>'}</div></div><div class="panel"><div class="panel-head"><div><h2>Attendance History</h2><p class="panel-subtitle">Your recorded attendance entries.</p></div></div>${table(['Date','MI','Type','Status'],records.map(x=>`<tr><td>${
      esc(x.created_at)
    }
    </td><td>${
      x.mi_number||'-'
    }
    </td><td>${
      esc((x.mi_type||'-').toUpperCase())
    }
    </td><td>${
      badge(x.status)
    }
    </td></tr>`))}</div>`;
    return
  }
  if(page==='re-enrollment'){
    await renderReEnrollment(c);
    return
  }
  if(page==='settings'){
    c.innerHTML=settingsHtml();
    bindSettings();
    return
  }
}
async function markAttendance(id){
  if(!navigator.geolocation)return toast('Geolocation is not supported by this browser.',true);
  navigator.geolocation.getCurrentPosition(async p=>{try{const d=await API.post('/api/student/attendance/mark',{sessionId:id,latitude:p.coords.latitude,longitude:p.coords.longitude});toast(`${d.message} Distance: ${d.distance}m`);setTimeout(()=>location.reload(),700)}catch(e){toast(e.message,true)}},()=>toast('Location permission is required to mark attendance.',true),{enableHighAccuracy:true,timeout:15000,maximumAge:0})
}
async function renderReEnrollment(c){
  try{
    const data=await API.get('/api/student/re-enroll');
    const s=data.student||{};
    const latest=data.latest_record||{};
    const isRotc=String(s.nstp_component||'').toUpperCase()==='ROTC';
    const hasMedical=Number(s.has_medical_condition||0)===1;
    const checked=(value)=>Number(value)?'checked':'';
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Re-enrollment Form</h2><p class="panel-subtitle">${esc(data.message||'Review your saved information and submit your next enrollment request.')}</p></div>${badge(latest.status||'approved')}</div><div class="notice"><strong>Target Level:</strong> ${esc(data.level_label||`MS ${data.target_level||'2'}`)}${data.schedule?.year?` • <strong>School Year:</strong> ${esc(data.schedule.year)}`:''}</div><div class="summary-grid" style="margin-top:16px"><div class="summary-tile blue"><div class="summary-accent"></div><div class="dash-label">Student ID</div><div class="summary-number" style="font-size:22px">${esc(s.student_id||'-')}</div><div class="summary-helper">Existing student record will be reused.</div></div><div class="summary-tile green"><div class="summary-accent"></div><div class="dash-label">Program</div><div class="summary-number" style="font-size:22px">${esc(s.nstp_component||'-')}</div><div class="summary-helper">Your NSTP component stays the same.</div></div><div class="summary-tile orange"><div class="summary-accent"></div><div class="dash-label">Current Level</div><div class="summary-number" style="font-size:22px">MS ${esc(latest.ms_level||'1')}</div><div class="summary-helper">Latest approved or rejected enrollment record.</div></div><div class="summary-tile red"><div class="summary-accent"></div><div class="dash-label">Target</div><div class="summary-number" style="font-size:22px">${esc(data.level_label||`MS ${data.target_level||'2'}`)}</div><div class="summary-helper">This new request will go back to admin review.</div></div></div><form id="reEnrollForm" class="form-grid" style="margin-top:18px"><div class="field"><label>Student ID</label><input value="${esc(s.student_id||'')}" disabled></div><div class="field"><label>NSTP Component</label><input value="${esc(s.nstp_component||'')}" disabled></div><div class="field"><label>Course</label><input name="course" value="${esc(s.course||'')}" readonly></div><div class="field"><label>Year Level</label><select name="year_level" required>${['1st Year','2nd Year','3rd Year','4th Year'].map((value)=>`<option value="${value}" ${s.year_level===value?'selected':''}>${value}</option>`).join('')}</select></div><div class="field"><label>Religion</label><input name="religion" value="${esc(s.religion||'')}" required></div><div class="field"><label>Contact Number</label><input name="contact_number" value="${esc(s.contact_number||'')}" maxlength="11" placeholder="09XXXXXXXXX" required></div><div class="field"><label>Temporary Barangay</label><input name="temporary_barangay" value="${esc(s.temporary_barangay||'')}" required></div><div class="field"><label>Temporary Municipality</label><input name="temporary_municipality" value="${esc(s.temporary_municipality||'')}" required></div><div class="field"><label>Temporary Province</label><input name="temporary_province" value="${esc(s.temporary_province||'')}" required></div><div class="field"><label>Permanent Barangay</label><input name="permanent_barangay" value="${esc(s.permanent_barangay||'')}" required></div><div class="field"><label>Permanent Municipality</label><input name="permanent_municipality" value="${esc(s.permanent_municipality||'')}" required></div><div class="field"><label>Permanent Province</label><input name="permanent_province" value="${esc(s.permanent_province||'')}" required></div><div class="field"><label>Emergency Contact Name</label><input name="emergency_contact_name" value="${esc(s.emergency_contact_name||'')}" required></div><div class="field"><label>Emergency Relationship</label><input name="emergency_contact_relationship" value="${esc(s.emergency_contact_relationship||'')}" required></div><div class="field full"><label>Emergency Address</label><input name="emergency_contact_address" value="${esc(s.emergency_contact_address||'')}" required></div><div class="field"><label>Emergency Contact Number</label><input name="emergency_contact_contact_number" value="${esc(s.emergency_contact_contact_number||'')}" maxlength="11" placeholder="09XXXXXXXXX" required></div><div class="field"><label>Height</label><input name="height" value="${esc(s.height||'')}" placeholder="e.g. 5'7&quot;" required></div><div class="field"><label>Weight (kg)</label><input name="weight" value="${esc(s.weight||'')}" type="number" min="1" required></div><div class="field"><label>Blood Type</label><select name="blood_type" required>${['A+','A-','B+','B-','AB+','AB-','O+','O-','N/A'].map((value)=>`<option value="${value}" ${s.blood_type===value?'selected':''}>${value}</option>`).join('')}</select></div><div class="field"><label>Complexion</label><input name="complexion" value="${esc(s.complexion||'')}" required></div><div class="field full"><label>Medical Condition</label><select name="has_medical_condition" id="reMedicalSelect"><option value="0" ${!hasMedical?'selected':''}>No medical condition</option><option value="1" ${hasMedical?'selected':''}>Has medical condition</option></select></div><div class="field full ${hasMedical?'':'hidden'}" id="reMedicalNameField"><label>Medical Condition Details</label><input name="medical_condition" value="${esc(s.medical_condition||'')}" placeholder="e.g. Asthma, Hypertension"></div>${isRotc?`<div class="field full"><label>ROTC Preferences</label><div class="notice" style="display:grid;gap:10px"><label><input type="checkbox" name="willing_to_take_advance_course" value="1" ${checked(s.willing_to_take_advance_course)}> Willing to take Advance Course</label><label><input type="checkbox" name="willing_to_be_medics" value="1" ${checked(s.willing_to_be_medics)}> Willing to be assigned to Medics</label><label><input type="checkbox" name="willing_to_be_military_police" value="1" ${checked(s.willing_to_be_military_police)}> Willing to be assigned to Military Police</label></div></div>`:''}<div class="field"><label>Update Medical Certificate</label><input type="file" id="reMedicalCertificate" accept=".pdf,image/*"></div><div class="field"><label>Update COR</label><input type="file" id="reCorFile" accept=".pdf,image/*"></div>${isRotc?`<div class="field full"><label>Update X-ray</label><input type="file" id="reXrayFile" accept=".pdf,image/*"></div>`:''}<div class="field full"><div class="notice">Your saved profile will be updated with the information above. When you submit, a new pending enrollment record will appear again on the admin side for review.</div></div><div class="field full"><button class="btn primary" id="submitReEnroll" type="submit">Submit Re-enrollment</button></div></form></div>`;
    const form=$('#reEnrollForm');
    const medSelect=$('#reMedicalSelect');
    const medField=$('#reMedicalNameField');
    medSelect?.addEventListener('change',()=>{
      const yes=medSelect.value==='1';
      medField?.classList.toggle('hidden',!yes);
      if(!yes){
        const input=medField?.querySelector('input');
        if(input)input.value='';
      }
    });
    ['contact_number','emergency_contact_contact_number'].forEach((name)=>{
      const input=form.elements[name];
      input?.addEventListener('input',(e)=>{
        let digits=e.target.value.replace(/\D/g,'').slice(0,11);
        if(digits.length>=2&&!digits.startsWith('09'))digits='09'+digits.slice(2);
        e.target.value=digits;
      });
    });
    form.onsubmit=async(e)=>{
      e.preventDefault();
      const submitBtn=$('#submitReEnroll');
      try{
        const payload=formToObject(form);
        payload.has_medical_condition=medSelect.value;
        if(payload.has_medical_condition!=='1')payload.medical_condition='';
        payload.willing_to_take_advance_course=form.querySelector('input[name="willing_to_take_advance_course"]')?.checked?1:0;
        payload.willing_to_be_medics=form.querySelector('input[name="willing_to_be_medics"]')?.checked?1:0;
        payload.willing_to_be_military_police=form.querySelector('input[name="willing_to_be_military_police"]')?.checked?1:0;
        const medicalFile=$('#reMedicalCertificate')?.files?.[0];
        const corFile=$('#reCorFile')?.files?.[0];
        const xrayFile=$('#reXrayFile')?.files?.[0];
        if(medicalFile)payload.medical_certificate=await fileAsDataUrl(medicalFile);
        if(corFile)payload.cor_file=await fileAsDataUrl(corFile);
        if(xrayFile)payload.xray_file=await fileAsDataUrl(xrayFile);
        submitBtn.disabled=true;
        submitBtn.textContent='Submitting...';
        const out=await API.post('/api/student/re-enroll',payload);
        toast(out.message);
        setTimeout(()=>location.href='/student/enrollment-status',900)
      }catch(err){
        submitBtn.disabled=false;
        submitBtn.textContent='Submit Re-enrollment';
        toast(err.message,true)
      }
    };
  }catch(err){
    const message=String(err?.message||'');
    const helpText=message==='Request failed'
      ? 'Unable to load the new re-enrollment form. Your server may still be running the old code. Restart the app, then open this page again.'
      : message||'Unable to load the re-enrollment form.';
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Re-enrollment</h2><p class="panel-subtitle">Apply for your next MS level using your existing student record.</p></div></div><div class="notice error">${esc(helpText)}</div></div>`;
  }
}
function settingsHtml(){
  return `<div class="panel"><div class="panel-head"><div><h2>Account Settings</h2><p class="panel-subtitle">Keep your account secure by changing your password when needed.</p></div></div><form id="passwordForm" class="form-grid"><div class="field"><label>Current Password</label><input type="password" name="currentPassword" required></div><div class="field"><label>New Password</label><input type="password" name="newPassword" minlength="8" required></div><div class="field full"><button class="btn primary">Change Password</button></div></form></div>`
}
function bindSettings(){
  const f=$('#passwordForm');
  f.onsubmit=async e=>{
    e.preventDefault();
    try{
      const x=await API.post('/api/auth/change-password',formToObject(f));
      toast(x.message);
      f.reset()
    }   catch(e){
      toast(e.message,true)
    }
  }
}

