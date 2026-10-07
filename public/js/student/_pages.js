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
    const assignment=d.assignment_assigned===false
      ?'Not assigned'
      :s.special_unit||s.platoon||(s.nstp_component==='CWTS'?s.company:s.rotc_company)||'Not assigned';
    const att=d.attendance||{
    }
    ;
    const grade=d.grade?`${esc(d.grade.grade)} - ${esc(d.grade.status)}`:'Not yet released';
    const serial=esc(d.serial?.serial_number||s.serial_number||'Not yet released');
    const welcome=displayNamePart(s.last_name||s.first_name||'Student');
    const intro=document.querySelector('.intro-copy');
    if(intro){
      intro.innerHTML=`<div class="intro-kicker">BCC NSTP Management System</div><h1>Welcome back, ${esc(welcome)}</h1><p>${esc([s.student_id,s.course,s.year_level,s.nstp_component].filter(Boolean).join(' - '))}</p>`;
    }
    const reEnrollment=d.re_enrollment||{};
    const retakeNotice=(enrollment)=>['retake','return'].includes(enrollment.mode)
      ?`<div class="notice ${enrollment.eligible?'success':''}" style="margin-bottom:18px"><strong>${esc(levelPrefix)} ${esc(enrollment.target_level)} ${enrollment.mode==='return'?'Return':'Retake'} ${enrollment.eligible?'Enrollment Open':'Enrollment'}</strong><br>${esc(enrollment.message)}${enrollment.eligible?` <a href="/student/re-enrollment">Enroll for ${esc(levelPrefix)} ${esc(enrollment.target_level)} ${enrollment.mode==='return'?'Return':'Retake'}</a>`:''}</div>`:'';
    const isApprovedLevelOne=String(r.ms_level||'')==='1'&&String(rawStatus).toLowerCase()==='approved';
    const eligibilityBlocked=['failed-grade','grades-incomplete'].includes(reEnrollment.reason);
    const levelPrefix=String(s.nstp_component||'').toUpperCase()==='CWTS'?'CWTS':'MS';
    const targetLabel=`${levelPrefix} ${reEnrollment.target_level||'2'}`;
    const qualifiedForLevelTwo=reEnrollment.eligible===true&&String(reEnrollment.target_level)==='2';
    const eligibilityMessage=reEnrollment.message||`Only students who passed ${levelPrefix} 1 can enroll in ${targetLabel}.`;
    const eligibilityNotice=['retake','return'].includes(reEnrollment.mode) ? retakeNotice(reEnrollment) : eligibilityBlocked
      ?`<div class="notice error" style="margin-bottom:18px"><strong>Not Qualified for ${esc(targetLabel)}</strong><br>${esc(eligibilityMessage)}</div>`
      :qualifiedForLevelTwo
        ?`<div class="notice success" style="margin-bottom:18px"><strong>Qualified for ${esc(targetLabel)} Enrollment</strong><br>You are qualified for ${esc(targetLabel)} enrollment because you passed ${esc(levelPrefix)} 1. Enrollment is now open. <a href="/student/re-enrollment">Enroll now</a>.</div>`
        :'';
    const enrollmentCard=reEnrollment.eligible
      ?dashCard('Enroll',`${targetLabel}${reEnrollment.mode==='retake'?' Retake':''} Enrollment`,reEnrollment.message,'/student/re-enrollment','refresh','indigo')
      :eligibilityBlocked
        ?dashCard('Enrollment Eligibility','Not Qualified',eligibilityMessage,'/student/grades','grades','red')
        :'';
    c.innerHTML=`<div id="enrollmentNotice">${eligibilityNotice}</div><div class="portal-dashboard-grid student-dashboard-grid">${dashCard('Enrollment Status',status,'View your current enrollment review status.','/student/enrollment-status','enrollment','blue')}${dashCard('Assigned Platoon',esc(assignment),'View your assigned platoon, battalion, company, or special unit.','/student/assigned-platoon','platoon','green')}${dashCard('Attendance',`${
      att.present||0
    }
    Present`,'Tap to view and mark your attendance.','/student/attendance','attendance','cyan')}${dashCard('Grades',grade,'Grades are released at the end of the semester.','/student/grades','grades','orange')}${dashCard('Serial Number',serial,'Issued upon completion of the program.','/student/serial-number','serial','purple')}${isApprovedLevelOne||eligibilityBlocked?enrollmentCard:''}${dashCard('Settings','Account Security','Manage your account password and settings.','/student/settings','settings','blue')}</div>`;
    const noticeTimer=window.setInterval(async()=>{
      if(!c.isConnected){window.clearInterval(noticeTimer);return;}
      if(document.hidden)return;
      try{
        const fresh=await API.get('/api/student/dashboard');
        if(['retake','return'].includes(fresh.re_enrollment?.mode)||['retake','return'].includes(reEnrollment.mode)){
          const notice=c.querySelector('#enrollmentNotice');
          if(notice)notice.innerHTML=retakeNotice(fresh.re_enrollment||{});
        }
      }catch(_){/* Retry at the next dashboard refresh. */}
    },30000);
    if(String(s.nstp_component||'').toUpperCase()==='ROTC' && Number(s.willing_to_take_advance_course)===1 && String(rawStatus).toLowerCase()==='approved' && Number(r.assignment_is_advance)===1 && !s.special_unit && !r.assignment_special_unit){
      const grid=c.querySelector('.student-dashboard-grid');
      grid.insertAdjacentHTML('beforeend',dashCard('My Assigned Attendance','Review Attendance','Check your assigned group and update attendance.','/student/verify-attendance','attendance','green'));
    }
    window.addEventListener('student-attendance-updated', event => {
      const card=c.querySelector('a[href="/student/attendance"]');
      const value=card?.querySelector('.dash-value');
      if(value) value.textContent=`${event.detail.history.filter(row=>row.status==='present').length} Present`;
    });
    return
  }
  if(page==='enrollment-status'){
    const p=await API.get('/api/student/profile');
    const x=p.student,rec=p.records[0]||{
    }
    ;
    const enrollmentStatus=String(rec.status||'pending').toLowerCase();
    const reviewComplete=['approved','rejected','withdrawn','dropped'].includes(enrollmentStatus);
    const enrollmentClosed=['withdrawn','dropped'].includes(enrollmentStatus);
    const finalState=enrollmentStatus==='approved'?'done':enrollmentStatus==='rejected'||enrollmentClosed?'current rejected':'pending';
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Enrollment Status</h2><p class="panel-subtitle">Your latest NSTP enrollment information and review result.</p></div>${badge(rec.status||'pending')}</div>${rec.rejection_reason?`<div class="notice error"><strong>Admin remark:</strong> ${
      esc(rec.rejection_reason)
    }
    </div>`:''}${rec.status==='rejected'?`<div class="actions" style="justify-content:flex-start;margin:16px 0 0"><button class="btn primary" id="resubmitEnrollment">Submit Enrollment Again</button></div>`:''}<div class="status-timeline" aria-label="Enrollment progress"><div class="timeline-step done"><div class="timeline-marker"><span>1</span></div><div class="timeline-copy"><strong>Submitted</strong><span>Enrollment received</span></div></div><div class="timeline-step ${reviewComplete?'done':'current'}" ${reviewComplete?'':'aria-current="step"'}><div class="timeline-marker"><span>2</span></div><div class="timeline-copy"><strong>Admin Review</strong><span>${reviewComplete?'Review completed':'Waiting for review'}</span></div></div><div class="timeline-step ${finalState}" ${enrollmentStatus==='rejected'?'aria-current="step"':''}><div class="timeline-marker"><span>3</span></div><div class="timeline-copy"><strong>${enrollmentClosed?'Enrollment Closed':enrollmentStatus==='rejected'?'Needs Action':'Approval & Assignment'}</strong><span>${enrollmentClosed?'Review the recorded reason':enrollmentStatus==='approved'?'Enrollment approved':enrollmentStatus==='rejected'?'Review the admin remark':'Next step'}</span></div></div></div>${table(['Field','Information'],[['Student ID',x.student_id],['Name',`${
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
    `:'-'],['School Year',rec.school_year||'Not available'],['Email',x.email],['Contact',x.contact_number]].map(a=>`<tr><td><strong>${
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
function organizeReEnrollmentForm(form,isRotc){
  if(!form)return;
  const originalFields=Array.from(form.children);
  const field=(selector)=>form.querySelector(selector)?.closest('.field')||null;
  const unique=(items)=>items.filter((item,index)=>item&&items.indexOf(item)===index);
  const section=(title,description,items)=>{
    const fields=unique(items);
    if(!fields.length)return;
    const card=document.createElement('section');
    card.className='re-enroll-section';
    card.innerHTML=`<div class="re-enroll-section-head"><div><h3>${esc(title)}</h3><p>${esc(description)}</p></div></div><div class="re-enroll-section-grid"></div>`;
    const grid=card.querySelector('.re-enroll-section-grid');
    fields.forEach((item)=>grid.appendChild(item));
    form.appendChild(card);
  };

  form.classList.add('re-enrollment-organized');
  section('Academic Information','Review the enrollment details that identify your NSTP program and level.',[
    originalFields[0],originalFields[1],field('[name="course"]'),field('[name="year_level"]'),
  ]);
  section('Personal Information','Confirm your current contact and personal information.',[
    field('[name="religion"]'),field('[name="contact_number"]'),
  ]);
  section('Address & Emergency Contact','Update your present and permanent address and your emergency contact.',[
    field('[name="temporary_barangay"]'),field('[name="temporary_municipality"]'),field('[name="temporary_province"]'),
    field('[name="permanent_barangay"]'),field('[name="permanent_municipality"]'),field('[name="permanent_province"]'),
    field('[name="emergency_contact_name"]'),field('[name="emergency_contact_relationship"]'),
    field('[name="emergency_contact_address"]'),field('[name="emergency_contact_contact_number"]'),
  ]);
  section('Physical & Health Information','Review your physical profile and disclose any medical condition.',[
    field('[name="height"]'),field('[name="weight"]'),field('[name="blood_type"]'),field('[name="complexion"]'),
    field('[name="has_medical_condition"]'),field('[name="medical_condition"]'),
  ]);
  if(isRotc){
    section('ROTC Preferences','Select the ROTC assignments you are willing to join.',[
      field('[name="willing_to_take_advance_course"]'),
    ]);
  }
  section('Enrollment Requirements','Upload replacements only when a document needs to be updated.',[
    field('#reMedicalCertificate'),field('#reCorFile'),field('#reXrayFile'),
  ]);

  const remaining=Array.from(form.children).filter((item)=>item.classList?.contains('field'));
  if(remaining.length){
    const footer=document.createElement('div');
    footer.className='re-enroll-submit-area';
    remaining.forEach((item)=>footer.appendChild(item));
    form.appendChild(footer);
  }
}
async function renderReEnrollment(c){
  try{
    const data=await API.get('/api/student/re-enroll');
    const s=data.student||{};
    const latest=data.latest_record||{};
    const isRotc=String(s.nstp_component||'').toUpperCase()==='ROTC';
    const availableComponents=Array.from(new Set(
      (data.available_components||[s.nstp_component]).map((value)=>String(value||'').toUpperCase()).filter(Boolean)
    ));
    const supportsRotc=availableComponents.includes('ROTC');
    const selectedProgram=String(data.schedule?.program||s.nstp_component||'').toUpperCase();
    const hasMedical=Number(s.has_medical_condition||0)===1;
    const checked=(value)=>Number(value)?'checked':'';
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Re-enrollment Form</h2><p class="panel-subtitle">${esc(data.message||'Review your saved information and submit your next enrollment request.')}</p></div><span class="badge">Enrollment open</span></div><div class="notice"><strong>Target Level:</strong> ${esc(data.level_label||`MS ${data.target_level||'2'}`)}${data.schedule?.year?` • <strong>School Year:</strong> ${esc(data.schedule.year)}`:''}</div><div class="summary-grid" style="margin-top:16px"><div class="summary-tile blue"><div class="summary-accent"></div><div class="dash-label">Student ID</div><div class="summary-number" style="font-size:22px">${esc(s.student_id||'-')}</div><div class="summary-helper">Existing student record will be reused.</div></div><div class="summary-tile green"><div class="summary-accent"></div><div class="dash-label">Program</div><div class="summary-number" style="font-size:22px">${esc(s.nstp_component||'-')}</div><div class="summary-helper">Your NSTP component stays the same.</div></div><div class="summary-tile orange"><div class="summary-accent"></div><div class="dash-label">Current Level</div><div class="summary-number" style="font-size:22px">MS ${esc(latest.ms_level||'1')}</div><div class="summary-helper">Your previously approved enrollment.</div></div><div class="summary-tile red"><div class="summary-accent"></div><div class="dash-label">Target</div><div class="summary-number" style="font-size:22px">${esc(data.level_label||`MS ${data.target_level||'2'}`)}</div><div class="summary-helper">This new request will go back to admin review.</div></div></div><form id="reEnrollForm" class="form-grid" style="margin-top:18px"><div class="field"><label>Student ID</label><input value="${esc(s.student_id||'')}" disabled></div><div class="field"><label>NSTP Component</label><input value="${esc(s.nstp_component||'')}" disabled></div><div class="field"><label>Course</label><input name="course" value="${esc(s.course||'')}" readonly></div><div class="field"><label>Year Level</label><select name="year_level" required>${['1st Year','2nd Year','3rd Year','4th Year'].map((value)=>`<option value="${value}" ${s.year_level===value?'selected':''}>${value}</option>`).join('')}</select></div><div class="field"><label>Religion</label><input name="religion" value="${esc(s.religion||'')}" required></div><div class="field"><label>Contact Number</label><input name="contact_number" value="${esc(s.contact_number||'')}" maxlength="11" placeholder="09XXXXXXXXX" required></div><div class="field"><label>Temporary Barangay</label><input name="temporary_barangay" value="${esc(s.temporary_barangay||'')}" required></div><div class="field"><label>Temporary Municipality</label><input name="temporary_municipality" value="${esc(s.temporary_municipality||'')}" required></div><div class="field"><label>Temporary Province</label><input name="temporary_province" value="${esc(s.temporary_province||'')}" required></div><div class="field"><label>Permanent Barangay</label><input name="permanent_barangay" value="${esc(s.permanent_barangay||'')}" required></div><div class="field"><label>Permanent Municipality</label><input name="permanent_municipality" value="${esc(s.permanent_municipality||'')}" required></div><div class="field"><label>Permanent Province</label><input name="permanent_province" value="${esc(s.permanent_province||'')}" required></div><div class="field"><label>Emergency Contact Name</label><input name="emergency_contact_name" value="${esc(s.emergency_contact_name||'')}" required></div><div class="field"><label>Emergency Relationship</label><input name="emergency_contact_relationship" value="${esc(s.emergency_contact_relationship||'')}" required></div><div class="field full"><label>Emergency Address</label><input name="emergency_contact_address" value="${esc(s.emergency_contact_address||'')}" required></div><div class="field"><label>Emergency Contact Number</label><input name="emergency_contact_contact_number" value="${esc(s.emergency_contact_contact_number||'')}" maxlength="11" placeholder="09XXXXXXXXX" required></div><div class="field"><label>Height</label><input name="height" value="${esc(s.height||'')}" placeholder="e.g. 5'7&quot;" required></div><div class="field"><label>Weight (kg)</label><input name="weight" value="${esc(s.weight||'')}" type="number" min="1" required></div><div class="field"><label>Blood Type</label><select name="blood_type" required>${['A+','A-','B+','B-','AB+','AB-','O+','O-','N/A'].map((value)=>`<option value="${value}" ${s.blood_type===value?'selected':''}>${value}</option>`).join('')}</select></div><div class="field"><label>Complexion</label><input name="complexion" value="${esc(s.complexion||'')}" required></div><div class="field full"><label>Medical Condition</label><select name="has_medical_condition" id="reMedicalSelect"><option value="0" ${!hasMedical?'selected':''}>No medical condition</option><option value="1" ${hasMedical?'selected':''}>Has medical condition</option></select></div><div class="field full ${hasMedical?'':'hidden'}" id="reMedicalNameField"><label>Medical Condition Details</label><input name="medical_condition" value="${esc(s.medical_condition||'')}" placeholder="e.g. Asthma, Hypertension"></div>${isRotc?`<div class="field full"><label>ROTC Preferences</label><div class="notice" style="display:grid;gap:10px"><label><input type="checkbox" name="willing_to_take_advance_course" value="1" ${checked(s.willing_to_take_advance_course)}> Willing to take Advance Course</label><label><input type="checkbox" name="willing_to_be_medics" value="1" ${checked(s.willing_to_be_medics)}> Willing to be assigned to Medics</label><label><input type="checkbox" name="willing_to_be_military_police" value="1" ${checked(s.willing_to_be_military_police)}> Willing to be assigned to Military Police</label></div></div>`:''}<div class="field"><label>Update Medical Certificate</label><input type="file" id="reMedicalCertificate" accept=".pdf,image/*"></div><div class="field"><label>Update COR</label><input type="file" id="reCorFile" accept=".pdf,image/*"></div>${isRotc?`<div class="field full"><label>Update X-ray</label><input type="file" id="reXrayFile" accept=".pdf,image/*"></div>`:''}<div class="field full"><div class="notice">Your saved profile will be updated with the information above. When you submit, a new pending enrollment record will appear again on the admin side for review.</div></div><div class="field full"><button class="btn primary" id="submitReEnroll" type="submit">Submit Re-enrollment</button></div></form></div>`;
    const form=$('#reEnrollForm');
    if(['retake','return'].includes(data.mode)){
      const enrollmentType=data.mode==='return'?'Return':'Retake';
      const title=c.querySelector('.panel-head h2');
      if(title)title.textContent=`${data.level_label} ${enrollmentType} Enrollment`;
      $('#submitReEnroll').textContent=`Submit ${data.level_label} ${enrollmentType}`;
    }
    const componentField=Array.from(form.children)[1];
    if(data.mode==='retry'&&availableComponents.length&&componentField){
      const oldControl=componentField.querySelector('input,select');
      const select=document.createElement('select');
      select.name='nstp_component';
      select.id='reNstpComponent';
      select.required=true;
      select.innerHTML=availableComponents.map((value)=>`<option value="${esc(value)}" ${value===selectedProgram?'selected':''}>${esc(value)}</option>`).join('');
      oldControl?.replaceWith(select);
    }
    if(supportsRotc&&!form.querySelector('[name="willing_to_take_advance_course"]')){
      const preferenceField=document.createElement('div');
      preferenceField.className='field full';
      preferenceField.innerHTML=`<label>ROTC Preferences</label><div class="notice" style="display:grid;gap:10px"><label><input type="checkbox" name="willing_to_take_advance_course" value="1" ${checked(s.willing_to_take_advance_course)}> Willing to take Advance Course</label><label><input type="checkbox" name="willing_to_be_medics" value="1" ${checked(s.willing_to_be_medics)}> Willing to be assigned to Medics</label><label><input type="checkbox" name="willing_to_be_military_police" value="1" ${checked(s.willing_to_be_military_police)}> Willing to be assigned to Military Police</label></div>`;
      form.appendChild(preferenceField);
    }
    if(supportsRotc&&!form.querySelector('#reXrayFile')){
      const xrayField=document.createElement('div');
      xrayField.className='field full';
      xrayField.innerHTML='<label>Update X-ray</label><input type="file" id="reXrayFile" accept=".pdf,image/*">';
      form.appendChild(xrayField);
    }
    organizeReEnrollmentForm(form,supportsRotc);
    const componentSelect=$('#reNstpComponent');
    const targetNotice=c.querySelector('.panel > .notice');
    const summaryTiles=c.querySelectorAll('.summary-grid .summary-tile');
    const summaryValues=c.querySelectorAll('.summary-grid .summary-number');
    if(data.mode==='retry'&&summaryTiles.length>=4){
      const previousProgram=String(latest.program||s.nstp_component||'').toUpperCase();
      const previousLevel=previousProgram==='ROTC'?`MS ${latest.ms_level||'1'}`:`CWTS ${latest.ms_level||'1'}`;
      const previousDisplay=previousProgram==='ROTC'?`ROTC - ${previousLevel}`:previousLevel;
      const previousLabel=summaryTiles[2].querySelector('.dash-label');
      const previousHelper=summaryTiles[2].querySelector('.summary-helper');
      const applicationLabel=summaryTiles[3].querySelector('.dash-label');
      const applicationHelper=summaryTiles[3].querySelector('.summary-helper');
      if(previousLabel)previousLabel.textContent='Previous Enrollment';
      if(summaryValues[2])summaryValues[2].textContent=previousDisplay;
      if(previousHelper)previousHelper.textContent='Rejected enrollment being corrected.';
      if(applicationLabel)applicationLabel.textContent='New Application';
      if(applicationHelper)applicationHelper.textContent='This corrected request will return to admin review.';
    }
    const scheduleByProgram=new Map((data.available_schedules||[]).map((item)=>[String(item.program).toUpperCase(),item]));
    const updateProgramChoice=()=>{
      const selected=String(componentSelect?.value||selectedProgram).toUpperCase();
      const rotc=selected==='ROTC';
      const preferenceSection=form.querySelector('[name="willing_to_take_advance_course"]')?.closest('.re-enroll-section');
      const xrayField=form.querySelector('#reXrayFile')?.closest('.field');
      preferenceSection?.classList.toggle('hidden',!rotc);
      xrayField?.classList.toggle('hidden',!rotc);
      const selectedSchedule=scheduleByProgram.get(selected)||data.schedule;
      if(targetNotice){
        targetNotice.innerHTML=`<strong>Target Level:</strong> ${esc(selected==='ROTC'?`MS ${data.target_level||'1'}`:`CWTS ${data.target_level||'1'}`)}${selectedSchedule?.year?` • <strong>School Year:</strong> ${esc(selectedSchedule.year)}`:''}`;
      }
      if(summaryValues[1])summaryValues[1].textContent=selected;
      if(summaryValues[2]&&data.mode!=='retry')summaryValues[2].textContent=selected==='ROTC'?`MS ${latest.ms_level||'1'}`:`CWTS ${latest.ms_level||'1'}`;
      const enrollmentLabel=selected==='ROTC'?`MS ${data.target_level||'2'}`:`CWTS ${data.target_level||'2'}`;
      const enrollmentSubtitle=c.querySelector('.panel-subtitle');
      if(enrollmentSubtitle)enrollmentSubtitle.textContent=`${enrollmentLabel} enrollment is now open. Please review your saved information and ${data.mode==='retry'?'submit your enrollment again':'complete the form to enroll'}.`;
      if(summaryValues[3])summaryValues[3].textContent=selected==='ROTC'?`MS ${data.target_level||'1'}`:`CWTS ${data.target_level||'1'}`;
    };
    componentSelect?.addEventListener('change',updateProgramChoice);
    updateProgramChoice();
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
        payload.nstp_component=componentSelect?.value||s.nstp_component;
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
        if((componentSelect?.value||s.nstp_component)==='ROTC'&&xrayFile)payload.xray_file=await fileAsDataUrl(xrayFile);
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

