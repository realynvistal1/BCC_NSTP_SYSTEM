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
    const grade=d.grade?`${esc(d.grade.grade)} • ${esc(d.grade.status)}`:'Not yet released';
    const serial=esc(d.serial?.serial_number||'Not yet released');
    const welcome=(s.last_name||s.first_name||'Student').trim();
    const intro=document.querySelector('.intro-copy');
    if(intro){
      intro.innerHTML=`<div class="intro-kicker">BCC NSTP Management System</div><h1>Welcome back, ${esc(welcome)}</h1><p>${esc([s.student_id,s.course,s.year_level,s.nstp_component].filter(Boolean).join(' - '))}</p>`;
    }
    const eligibleReEnroll=String(r.ms_level||'')==='1'&&String(rawStatus).toLowerCase()==='approved';
    c.innerHTML=`<div class="old-dashboard-grid student-dashboard-grid">${dashCard('Enrollment Status',status,'View your current enrollment review status.','/student/enrollment-status','enrollment','blue')}${dashCard('Assigned Platoon',esc(assignment),'View your assigned platoon, battalion, company, or special unit.','/student/assigned-platoon','platoon','green')}${dashCard('Attendance',`${
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
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Enrollment Status</h2><p class="panel-subtitle">Your latest NSTP enrollment information and review result.</p></div>${badge(rec.status||'pending')}</div>${rec.rejection_reason?`<div class="notice error"><strong>Admin remark:</strong> ${
      esc(rec.rejection_reason)
    }
    </div>`:''}<div class="status-timeline"><div class="timeline-step done"><strong>1. Submitted</strong><span>Enrollment form received</span></div><div class="timeline-step ${rec.status==='pending'?'current':'done'}"><strong>2. Admin Review</strong><span>${rec.status==='pending'?'Waiting for review':'Review completed'}</span></div><div class="timeline-step ${rec.status==='approved'?'done':rec.status==='rejected'?'current':''}"><strong>3. ${rec.status==='rejected'?'Needs Action':'Approved & Assignment'}</strong><span>${rec.status==='approved'?'Ready for platoon/company assignment':rec.status==='rejected'?'See administrator remark':'Pending approval'}</span></div></div>${table(['Field','Information'],[['Student ID',x.student_id],['Name',`${
      x.first_name
    }
    ${
      x.middle_name||''
    }
    ${
      x.last_name
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
    return
  }
  if(page==='assigned-platoon'){
    let assign=s.special_unit?`Special Unit: ${s.special_unit}`:s.nstp_component==='CWTS'?`Company ${s.company||'Not assigned'}`:`${s.battalion?'Battalion '+s.battalion+' • ':''}${s.rotc_company||'Not assigned'}${s.rotc_platoon?' • Platoon '+s.rotc_platoon:''}`;
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
    → ${
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
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Re-enrollment</h2><p class="panel-subtitle">Apply for your next MS level using your existing student record.</p></div></div><div class="notice">Only an approved MS 1 student may submit an MS 2 re-enrollment request. Duplicate requests are blocked.</div><button class="btn primary" id="reenroll">Submit Re-enrollment Request</button></div>`;
    $('#reenroll').onclick=async()=>{
      try{
        const x=await API.post('/api/student/re-enroll',{});
        toast(x.message)
      }   catch(e){
        toast(e.message,true)
      }
    }
    ;
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
