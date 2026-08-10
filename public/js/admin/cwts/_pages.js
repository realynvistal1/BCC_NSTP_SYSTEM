async function adminPage(role,page,c){
  const p=role==='rotc'?'rotc':'cwts';
  if(page==='dashboard'){
    const d=await API.get(`/api/admin/${p}/dashboard`);
    const total=Number(d.total||0),pending=Number(d.pending||0),approved=Number(d.approved||0),rejected=Number(d.rejected||0),assigned=Number(d.assigned||0);
    const approvalRate=total?Math.round((approved/total)*100):0,pendingRate=total?Math.round((pending/total)*100):0;
    const program=p.toUpperCase();
    const intro=document.querySelector('.intro-copy');
    if(intro){
      intro.innerHTML=`<div class="intro-kicker">BCC NSTP Management System</div><h1>${program} Dashboard</h1><p>${program==='ROTC'?'Track cadet movement, assignment load, approvals, and ROTC actions from one control center.':'Monitor company allocation, enrollment flow, and CWTS readiness from one overview.'}</p>`;
    }
      c.innerHTML=`<div class="summary-grid">${summaryTile('Approved Students',approved,`Students approved in the current ${
        program
      }
      enrollment cycle`,'blue')}${summaryTile('Approved',approved,`${
        approvalRate
      }
    % of students cleared`,'green')}${summaryTile('Pending',pending,`${
      pendingRate
    }
    % still need review`,'orange')}${summaryTile('Rejected Students',rejected,'Students who were not approved','red')}</div><div class="admin-analytics"><section class="section-card"><div class="section-heading"><h2>Enrollment Pipeline</h2><p>A quick snapshot of how student applications are moving through review.</p></div>${progressRow('Approved',approved,total,'green')}${progressRow('Pending',pending,total,'orange')}${progressRow('Rejected',rejected,total,'red')}</section><section class="section-card"><div class="section-heading"><h2>What Needs Attention</h2><p>Use these numbers to decide what to review first.</p></div><div class="insight-list">${insight('Pending Reviews',pending,'Students waiting for enrollment approval')}${insight('Rejected Cases',rejected,'Applications that may need follow-up or re-submission')}${insight('Approval Rate',approvalRate+'%','Current success rate across student records')}</div></section></div><section class="section-card distribution-card"><div class="section-heading"><h2>${program} Distribution</h2><p>${program==='ROTC'?'Current view highlights approved cadets and assignment readiness.':'Company analytics show how students are spread across available CWTS units.'}</p></div><div class="distribution-insights">${insight(program==='ROTC'?'Assigned Cadets':'Assigned Students',assigned,`Out of ${
      approved
    }
    approved students`)}${insight(program==='ROTC'?'Needs Assignment':'Needs Company',Math.max(approved-assigned,0),'Approved students still waiting for placement')}${insight('Assignment Rate',approved?Math.round((assigned/approved)*100)+'%':'0%','Current approved-student assignment coverage')}</div></section><section class="section-card"><div class="section-heading"><h2>Management Shortcuts</h2><p>Keep the most important admin pages one click away.</p></div><div class="old-dashboard-grid">${dashCard('Enrollment Schedule','Manage Schedule',`Manage the ${
      program
    }
    enrollment period.`,`/admin/${
      p
    }
    /enrollment-schedule`,'schedule','blue')}${dashCard('Enrollment List',`${
      total
    }
    Students`,'View and manage all enrollment applications.',`/admin/${
      p
    }
    /enrollment-list`,'enrollment','blue')}${dashCard(program==='ROTC'?'Platoon List':'Company List',`${
      assigned
    }
    Assigned`,program==='ROTC'?'Manage ROTC platoon assignments.':'View CWTS company assignments.',`/admin/${
      p
    }
    /${
      program==='ROTC'?'platoon-roster':'company-roster'
    }
    `,'platoon','green')}${dashCard('Attendance Summary','View Attendance','Tap to view daily attendance records.',`/admin/${
      p
    }
    /attendance-summary`,'attendance','cyan')}${dashCard('View Records','Student Records','Tap to view complete student records.',`/admin/${
      p
    }
    /view-records`,'records','indigo')}${dashCard('Grades','Encode Grades',`Tap to encode ${
      program
    }
    grades.`,`/admin/${
      p
    }
    /grades`,'grades','orange')}${dashCard('Attendance Offenses','Review Violations','Tap to view students with attendance violations.',`/admin/${
      p
    }
    /offenses`,'offense','orange')}${dashCard('Serial Number','Manage Numbers','Tap to view and manage serial numbers.',`/admin/${
      p
    }
    /serial-number`,'serial','purple')}${dashCard('Settings','Account Settings','Manage your account and settings.',`/admin/${
      p
    }
    /settings`,'settings','blue')}</div></section>`;
    return
  }
  if(page==='enrollment-schedule'){
    await renderEnrollmentSchedule(p,c);
    return
  }
  if(page==='enrollment-list'){
    await renderEnrollmentList(p,c);
    return
  }
  if(page==='platoon-roster'){
    await renderROTCRoster(c,false);
    return
  }
  if(page==='company-roster'){
    await renderCWTSCompanyRoster(c);
    return
  }
  if(page==='special-platoon'){
    await renderROTCRoster(c,true);
    return
  }
  if(page==='grades'){
    const rows=await API.get(`/api/admin/${p}/grades`);
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Encode Grades</h2><p class="panel-subtitle">Enter midterm and final grades using the 1.00–5.00 college grading scale. A final grade from 1.00 to 3.00 is Passed.</p></div></div>${table(['Student','MS Level','Midterm','Final','Average','Status','Action'],rows.map(x=>`<tr><td><strong>${
      esc(x.student_no)
    }
    </strong><br>${
      esc(x.last_name+', '+x.first_name)
    }
    </td><td><select id="gms${x.student_id}"><option value="1" ${
      String(x.ms_level)==='1'?'selected':''
    }
    >MS 1</option><option value="2" ${
      String(x.ms_level)==='2'?'selected':''
    }
    >MS 2</option></select></td><td><input id="m${x.student_id}" type="number" min="1" max="5" step="0.01" value="${x.midterm??''}"></td><td><input id="f${x.student_id}" type="number" min="1" max="5" step="0.01" value="${x.final_term??''}"></td><td>${
      x.grade??'-'
    }
    </td><td>${
      x.status?badge(x.status):'-'
    }
    </td><td><button class="btn small primary" onclick="saveGrade('${p}',${x.student_id})">Save</button></td></tr>`))}</div>`;
    return
  }
  if(page==='offenses'){
    const rows=await API.get(`/api/admin/${p}/offenses`);
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Attendance Offenses</h2><p class="panel-subtitle">Track absences/offenses and settlement status.</p></div></div>${table(['Student','Offenses','Settled','Action'],rows.map(x=>`<tr><td><strong>${
      esc(x.student_no)
    }
    </strong><br>${
      esc(x.last_name+', '+x.first_name)
    }
    </td><td><input id="o${x.student_id}" type="number" min="0" value="${x.offend}"></td><td><input id="s${x.student_id}" type="checkbox" ${
      x.settled?'checked':''
    }
    style="width:auto"></td><td><button class="btn small primary" onclick="saveOffense('${p}',${x.student_id})">Save</button></td></tr>`))}</div>`;
    return
  }
  if(page==='serial-number'){
    const rows=await API.get(`/api/admin/${p}/serial-numbers`);
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Serial Number Management</h2><p class="panel-subtitle">Issue official NSTP serial numbers to qualified students.</p></div></div>${table(['Student','Serial Number','Action'],rows.map(x=>`<tr><td><strong>${
      esc(x.student_no)
    }
    </strong><br>${
      esc(x.last_name+', '+x.first_name)
    }
    </td><td><input id="sn${x.student_id}" value="${esc(x.serial_number||'')}" placeholder="NSTP-2026-0001"></td><td><button class="btn small primary" onclick="saveSerial('${p}',${x.student_id})">Save</button></td></tr>`))}</div>`;
    return
  }
  if(page==='view-records'){
    const rows=await API.get(`/api/admin/${p}/records`);
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Student Records</h2><p class="panel-subtitle">Consolidated ${p.toUpperCase()} student information.</p></div></div>${recordsTable(rows)}</div>`;
    return
  }
  if(page==='attendance-summary'){
    const group=location.pathname.split('/').pop();
    const q=['overall','attendance-summary'].includes(group)?'':`?group=${encodeURIComponent(group)}`;
    const rows=await API.get(`/api/admin/${p}/attendance-summary${q}`);
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>${p.toUpperCase()} Attendance Summary</h2><p class="panel-subtitle">Aggregated present, late, and absent records per student.</p></div></div>${table(['Student','Assignment','Present','Late','Absent','Total'],rows.map(x=>`<tr><td><strong>${
      esc(x.student_id)
    }
    </strong><br>${
      esc(x.last_name+', '+x.first_name)
    }
    </td><td>${
      esc(x.assignment||'-')
    }
    </td><td>${
      x.present||0
    }
    </td><td>${
      x.late||0
    }
    </td><td>${
      x.absent||0
    }
    </td><td><strong>${
      x.total||0
    }
    </strong></td></tr>`))}</div>`;
    return
  }
  if(page==='withdrawal-requests'){
    const rows=await API.get('/api/admin/rotc/withdrawals');
    c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Advance Course Withdrawal Requests</h2><p class="panel-subtitle">Review requests from ROTC advance-course students.</p></div></div>${table(['Student','Reason','Status','Action'],rows.map(x=>`<tr><td><strong>${
      esc(x.student_no)
    }
    </strong><br>${
      esc(x.last_name+', '+x.first_name)
    }
    </td><td>${
      esc(x.reason)
    }
    </td><td>${
      badge(x.status)
    }
    </td><td><div class="actions"><button class="btn small success" onclick="withdraw(${x.id},'approved')">Approve</button><button class="btn small danger" onclick="withdraw(${x.id},'rejected')">Reject</button></div></td></tr>`))}</div>`;
    return
  }
  if(page==='settings'){
    c.innerHTML=settingsHtml();
    bindSettings();
    return
  }
}
function enrollmentTable(rows,p){
  return table(['Student ID','Name','Course','MS','Status','Action'],rows.map(x=>`<tr><td><strong>${esc(x.student_id)}</strong></td><td>${esc(x.last_name+', '+x.first_name)}</td><td>${esc(x.course)}</td><td>MS ${x.ms_level}</td><td>${badge(x.status)}</td><td><div class="actions"><button class="btn small success" onclick="setEnrollment('${p}',${x.record_id},'approved')">Approve</button><button class="btn small danger" onclick="setEnrollment('${p}',${x.record_id},'rejected')">Reject</button></div></td></tr>`))
}
async function setEnrollment(p,id,status){
  let reason='';
  if(status==='rejected'){
    reason=prompt('Enter the reason for rejection:')||'';
    if(!reason)return
  }
  try{
    const x=await API.patch(`/api/admin/${p}/enrollments/${id}`,{status,rejection_reason:reason});
    toast(x.message);
    setTimeout(()=>location.reload(),500)
  }   catch(e){
    toast(e.message,true)
  }
}
async function saveGrade(p,id){
  try{
    const mid=Number($(`#m${id}`).value),fin=Number($(`#f${id}`).value),ms=$(`#gms${id}`).value;
    if(mid<1||mid>5||fin<1||fin>5)return toast('Grades must be between 1.00 and 5.00.',true);
    const x=await API.post(`/api/admin/${p}/grades`,{student_id:id,ms_level:ms,midterm:mid,final_term:fin});
    toast(`${x.message} Final Grade: ${Number(x.grade).toFixed(2)} • ${x.status}`);
    setTimeout(()=>location.reload(),500)
  }   catch(e){
    toast(e.message,true)
  }
}
async function saveOffense(p,id){
  try{
    const x=await API.post(`/api/admin/${p}/offenses`,{student_id:id,offend:$(`#o${id}`).value,settled:$(`#s${id}`).checked});
    toast(x.message)
  }   catch(e){
    toast(e.message,true)
  }
}
async function saveSerial(p,id){
  try{
    const value=$(`#sn${id}`).value.trim();
    if(!value)return toast('Enter a serial number first.',true);
    const x=await API.post(`/api/admin/${p}/serial-numbers`,{student_id:id,serial_number:value});
    toast(x.message)
  }   catch(e){
    toast(e.message,true)
  }
}
async function withdraw(id,status){
  try{
    const remarks=prompt('Admin remarks (optional):')||'';
    const x=await API.patch(`/api/admin/rotc/withdrawals/${id}`,{status,admin_remarks:remarks});
    toast(x.message);
    setTimeout(()=>location.reload(),500)
  }   catch(e){
    toast(e.message,true)
  }
}
function recordsTable(rows){
  return table(['Student ID','Name','Course','Year','Program','Assignment','Email'],rows.map(x=>`<tr><td><strong>${esc(x.student_id)}</strong></td><td>${esc(x.last_name+', '+x.first_name)}</td><td>${esc(x.course)}</td><td>${esc(x.year_level)}</td><td>${esc(x.nstp_component)}</td><td>${esc(x.company||x.special_unit||x.rotc_company||'-')}</td><td>${esc(x.email)}</td></tr>`))
}
