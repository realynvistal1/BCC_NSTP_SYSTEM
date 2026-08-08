function directorCard(label,subtitle,value,suffix,href,ico,tone,meta='',pct=null){
  return `<a class="dashboard-card director-card old-officer-card" href="${href}"><div class="officer-card-head"><span class="dash-icon ${tone}">${icon(ico)}</span><div><h3>${esc(label)}</h3><p class="director-subtitle">${esc(subtitle)}</p></div></div><div class="officer-card-number"><strong>${esc(value)}</strong><span>${esc(suffix)}</span></div>${pct!==null?`<div class="officer-capacity"><div class="officer-progress"><i class="${tone}" style="width:${Math.min(Number(pct)||0,100)}%"></i></div>${
    meta?`<small>${esc(meta)}</small>`:''
  }
  </div>`:meta?`<div class="officer-meta">${
    esc(meta)
  }
  </div>`:''}<div class="officer-view">View <span>→</span></div></a>`
}
function officerStudentRows(rows){
  return rows.map((x,i)=>`<tr data-status="${esc((x.status||'pending').toLowerCase())}" data-search="${esc((x.student_id+' '+x.first_name+' '+(x.middle_name||'')+' '+x.last_name+' '+x.course+' '+(x.assignment||'')).toLowerCase())}"><td>${i+1}</td><td><strong>${esc(x.student_id)}</strong></td><td><strong>${esc(x.last_name+', '+x.first_name+(x.middle_name?` ${x.middle_name[0]}.`:''))}</strong></td><td>${esc(x.course)}</td><td>${esc(x.year_level)}</td><td>${x.ms_level?`${x.program==='CWTS'?'CWTS':'MS'} ${esc(x.ms_level)}`:'-'}</td><td>${badge(x.status||'pending')}</td><td>${esc(x.assignment||'-')}</td></tr>`)
}
function officerEnrollmentPanel(program,rows,tone){
  const approved=rows.filter(x=>x.status==='approved').length,pending=rows.filter(x=>x.status==='pending').length,rejected=rows.filter(x=>x.status==='rejected').length,correction=rows.filter(x=>String(x.status).toLowerCase().includes('correction')).length;
  const key=program.toLowerCase();
  return `<section class="section-card director-enrollment-section" data-enrollment-list="${key}"><div class="section-heading director-list-heading"><div><span class="director-section-kicker">${program} ENROLLMENT</span><h2>${program} Enrolled Students</h2><p>Read-only monitoring list of students who submitted ${program} enrollment. Approval and rejection remain with the ${program} Admin.</p></div><a class="btn small" href="${program==='ROTC'?'/officer/rotc/battalion-1':'/officer/cwts'}">View ${program==='ROTC'?'ROTC Roster':'CWTS Companies'}</a></div><div class="director-mini-stats"><span><strong>${rows.length}</strong>Total</span><span class="ok"><strong>${approved}</strong>Approved</span><span class="wait"><strong>${pending}</strong>Pending</span><span class="bad"><strong>${rejected}</strong>Rejected</span></div><div class="director-list-tools"><div class="director-search"><span>${icon('records')}</span><input type="search" placeholder="Search student name, ID, course or assignment..." data-list-search="${key}"></div><div class="director-status-tabs" data-list-tabs="${key}"><button class="active" data-status-filter="all">All <b>${rows.length}</b></button><button data-status-filter="pending">Pending <b>${pending}</b></button><button data-status-filter="approved">Approved <b>${approved}</b></button><button data-status-filter="rejected">Rejected <b>${rejected}</b></button>${correction?`<button data-status-filter="needs correction">Needs Correction <b>${
    correction
  }
  </b></button>`:''}</div></div><div class="director-table" data-list-table="${key}">${table(['#','Student ID','Name','Course','Year','Level','Status','Assignment'],officerStudentRows(rows))}</div><p class="director-list-note" data-list-count="${key}">Showing ${rows.length} of ${rows.length} enrolled students.</p></section>`
}
function bindOfficerEnrollmentLists(){
  document.querySelectorAll('[data-enrollment-list]').forEach(section=>{const key=section.dataset.enrollmentList,input=section.querySelector(`[data-list-search="${key}"]`),tabs=section.querySelector(`[data-list-tabs="${key}"]`),count=section.querySelector(`[data-list-count="${key}"]`);let status='all';const apply=()=>{const q=(input?.value||'').trim().toLowerCase();const rows=[...section.querySelectorAll('tbody tr[data-status]')];let shown=0;rows.forEach(row=>{const okStatus=status==='all'||row.dataset.status===status||row.dataset.status.includes(status);const okSearch=!q||(row.dataset.search||'').includes(q);const show=okStatus&&okSearch;row.style.display=show?'':'none';if(show)shown++});if(count)count.textContent=`Showing ${shown} matching enrolled student${shown===1?'':'s'}.`};input?.addEventListener('input',apply);tabs?.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');status=btn.dataset.statusFilter||'all';apply()}));apply()})
}
function rosterRowsOfficer(rows){
  if(!rows.length)return '<div class="roster-empty">No students assigned yet.</div>';
  return `<div class="roster-table-wrap"><table class="roster-table"><thead><tr><th>#</th><th>Student ID</th><th>Name</th><th>Course</th><th>Year Level</th></tr></thead><tbody>${rows.map((s,i)=>`<tr><td>${
    i+1
  }
  </td><td><strong>${
    esc(s.student_id)
  }
  </strong></td><td>${
    esc(s.last_name+', '+s.first_name)
  }
  </td><td>${
    esc(s.course)
  }
  </td><td>${
    esc(s.year_level)
  }
  </td></tr>`).join('')}</tbody></table></div>`
}
function officerExpander(key,label,rows,limit,tone='blue'){
  const pct=Number.isFinite(limit)?Math.min(100,Math.round(rows.length/limit*100)):0;
  return `<div class="roster-expand-card" data-roster-key="${key}"><button class="roster-expand-head" type="button"><span class="roster-letter ${tone}">${esc(label[0])}</span><span class="roster-expand-copy"><span class="roster-expand-title">${esc(label)}</span>${Number.isFinite(limit)?`<span class="roster-progress"><i class="${tone}" style="width:${pct}%"></i></span>`:''}</span><span class="roster-count">${rows.length}${Number.isFinite(limit)?`/${
    limit
  }
  `:''}</span><span class="roster-chevron">⌄</span></button><div class="roster-expand-body">${rosterRowsOfficer(rows)}</div></div>`
}
function bindOfficerExpanders(){
  $$('.roster-expand-card').forEach(card=>card.querySelector('.roster-expand-head')?.addEventListener('click',()=>card.classList.toggle('open')))
}
async function officerPage(page,c){
  if(page==='dashboard'){
    const [d,b1,b2,adv,cwts,enroll]=await Promise.all([API.get('/api/officer/dashboard'),API.get('/api/officer/roster/battalion-1'),API.get('/api/officer/roster/battalion-2'),API.get('/api/officer/roster/advance-course'),API.get('/api/officer/roster/cwts'),API.get('/api/officer/enrollments')]);
    const battalionCap=4*4*37,cwtsCap=6*60;
    const b1Pct=Math.round((b1.length/battalionCap)*100),b2Pct=Math.round((b2.length/battalionCap)*100),cwtsPct=Math.round((cwts.length/cwtsCap)*100);
    const advMale=adv.filter(x=>String(x.sex).toLowerCase()==='male').length,advFemale=adv.filter(x=>String(x.sex).toLowerCase()==='female').length;
    c.innerHTML=`<div class="director-dashboard-title"><div><span>NSTP DIRECTOR DASHBOARD</span><h2>ROTC & CWTS Overview</h2><p>Manage battalions, CWTS companies, attendance operations, and student records.</p></div><div class="director-live"><i></i>${Number(d.open_sessions||0)} active attendance session${Number(d.open_sessions||0)===1?'':'s'}</div></div><div class="old-dashboard-grid officer-dashboard-grid">${directorCard('ROTC - Battalion 1','Male cadets battalion',b1.length,`/ ${
      battalionCap
    }
    slots`,'/officer/rotc/battalion-1','users','blue','4 companies • 4 platoons each',b1Pct)}${directorCard('ROTC - Battalion 2','Female cadettes battalion',b2.length,`/ ${
      battalionCap
    }
    slots`,'/officer/rotc/battalion-2','users','purple','4 companies • 4 platoons each',b2Pct)}${directorCard('Advance Course','Cadets for advance ROTC',adv.length,'cadets','/officer/rotc/advance-course','platoon','orange',`Male: ${
      advMale
    }
    • Female: ${
      advFemale
    }
    `)}${directorCard('CWTS','Company roster overview',cwts.length,`/ ${
      cwtsCap
    }
    slots`,'/officer/cwts','users','green','6 companies • 60 slots each',cwtsPct)}${dashCard('Create Attendance','Set Location & Time','Record attendance for ROTC or CWTS.','/officer/create-attendance','location','indigo')}${dashCard('View Attendance','Review Sessions','Review sessions and student records.','/officer/view-attendance','attendance','green')}${dashCard('View Student Records','ROTC & CWTS','View complete student records.','/officer/view-records','records','indigo')}${dashCard('Settings','Account Security','Manage account settings and password.','/officer/settings','settings','indigo')}</div><div class="director-enrollment-header"><div><span>ENROLLMENT MONITORING</span><h2>ROTC & CWTS Enrolled Students</h2><p>Monitor submitted enrollments from both components without changing the Admin-controlled status.</p></div></div><div class="director-enrollment-grid">${officerEnrollmentPanel('ROTC',enroll.rotc||[],'blue')}${officerEnrollmentPanel('CWTS',enroll.cwts||[],'green')}</div>`;
    bindOfficerEnrollmentLists();
    return
  }
  if(page==='create-attendance'){
    c.innerHTML=`<div class="old-page-intro sky"><div><div class="old-intro-kicker">NSTP DIRECTOR</div><h2>Create Attendance</h2><p>Set the attendance location, schedule, component, and allowed radius.</p></div></div><div class="panel"><form id="attForm" class="form-grid"><div class="field"><label>Program</label><select name="program"><option>ROTC</option><option>CWTS</option></select></div><div class="field"><label>MS Level</label><select name="ms_level"><option value="1">MS 1</option><option value="2">MS 2</option></select></div><div class="field"><label>School Year</label><input name="school_year" placeholder="2026-2027"></div><div class="field"><label>MI Number</label><input name="mi_number" type="number" min="1" required></div><div class="field checkbox-field"><label><input name="is_advance_course" type="checkbox" value="1"> Advance Course session</label><small>Use only for ROTC Advance Course attendance.</small></div><div class="field"><label>MI Type</label><select name="mi_type"><option value="in">IN</option><option value="out">OUT</option></select></div><div class="field"><label>Radius (meters)</label><input name="radius_meters" type="number" min="10" value="100"></div><div class="field"><label>Open Date / Time</label><input name="open_date" type="datetime-local" required></div><div class="field"><label>Close Date / Time</label><input name="close_date" type="datetime-local" required></div><div class="field"><label>Latitude</label><input name="latitude" id="lat" required></div><div class="field"><label>Longitude</label><input name="longitude" id="lng" required></div><div class="field full"><div class="notice">Set the approved attendance area while you are physically at the activity location.</div><div class="actions"><button type="button" class="btn" id="useLoc">Use My Current Location</button><button class="btn primary">Save / Activate Attendance</button></div></div></form></div>`;
    $('#useLoc').onclick=()=>navigator.geolocation?.getCurrentPosition(p=>{$('#lat').value=p.coords.latitude.toFixed(7);$('#lng').value=p.coords.longitude.toFixed(7);toast('Current location added.')},()=>toast('Could not get your location.',true),{enableHighAccuracy:true});
    $('#attForm').onsubmit=async e=>{
      e.preventDefault();
      const obj=formToObject(e.target);
      if(new Date(obj.close_date)<=new Date(obj.open_date))return toast('Close time must be later than open time.',true);
      try{
        const x=await API.post('/api/officer/attendance',obj);
        toast(x.message);
        e.target.reset()
      }   catch(e){
        toast(e.message,true)
      }
    }
    ;
    return
  }
  if(page==='view-attendance'){
    const rows=await API.get('/api/officer/attendance');
    c.innerHTML=`<div class="old-page-intro sky"><div><div class="old-intro-kicker">NSTP DIRECTOR</div><h2>View Attendance</h2><p>Monitor ROTC and CWTS attendance sessions and update student attendance status.</p></div></div><div class="panel">${table(['ID','Program','MI','Open','Close','Radius','Status','Records'],rows.map(x=>`<tr><td>#${
      x.id
    }
    </td><td><strong>${
      x.program
    }
    </strong></td><td>${
      x.mi_number||'-'
    }
    ${
      (x.mi_type||'').toUpperCase()
    }
    </td><td>${
      esc(x.open_date)
    }
    </td><td>${
      esc(x.close_date)
    }
    </td><td>${
      x.radius_meters
    }
    m</td><td>${
      badge(x.status)
    }
    </td><td><button class="btn small primary" onclick="viewSession(${x.id})">View Students</button></td></tr>`))}</div><div id="sessionRecords"></div>`;
    return
  }
  if(page==='view-records'){
    const rows=await API.get('/api/officer/records');
    c.innerHTML=`<div class="old-page-intro sky"><div><div class="old-intro-kicker">NSTP DIRECTOR</div><h2>View Student Records</h2><p>View ROTC and CWTS student records in one organized list.</p></div></div><div class="panel">${recordsTable(rows)}</div>`;
    return
  }
  if(page==='battalion-1'||page==='battalion-2'){
    const rows=await API.get(`/api/officer/roster/${page}`),bn=page==='battalion-1'?1:2,label=bn===1?'Male':'Female',companies=bn===1?['Alpha','Bravo','Charlie','Delta']:['Echo','Foxtrot','Golf','Hotel'],capacity=companies.length*4*37;
    const grouped={
    }
    ;
    companies.forEach(co=>{grouped[co]={1:[],2:[],3:[],4:[]}});
    rows.forEach(x=>{if(grouped[x.rotc_company]&&grouped[x.rotc_company][x.rotc_platoon])grouped[x.rotc_company][x.rotc_platoon].push(x)});
    c.innerHTML=`<div class="old-page-intro sky"><div><div class="old-intro-kicker">NSTP DIRECTOR</div><h2>Battalion ${bn} - ${label}</h2><p>View all approved ROTC ${label.toLowerCase()} cadets assigned to Battalion ${bn} companies and platoons.</p></div></div><div class="roster-summary-grid four">${rosterSummary(`Total ${
      bn===1?'Cadets':'Cadettes'
    }
    `,rows.length,'','slate')}${rosterSummary('Capacity',`${
      rows.length
    }
    /${
      capacity
    }
    `,'','blue')}${rosterSummary('Companies',companies.length,'','slate')}${rosterSummary('Platoons',companies.length*4,'4 per company','green')}</div>${companies.map((co,ci)=>`<div class="company-card"><div class="company-card-head"><div><span class="roster-letter ${['blue','green','amber','purple'][ci]}">${
      co[0]
    }
    </span><strong>${
      co
    }
    Company</strong></div><small>${
      Object.values(grouped[co]).flat().length
    }
    cadets</small></div><div class="roster-stack">${
      [1,2,3,4].map(pl=>officerExpander(`off-${bn}-${co}-${pl}`,`Platoon ${pl}`,grouped[co][pl],37,['blue','green','amber','purple'][ci])).join('')
    }
    </div></div>`).join('')}`;
    bindOfficerExpanders();
    return
  }
  if(page==='cwts'){
    const rows=await API.get('/api/officer/roster/cwts'),companies=['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot'],grouped={
    }
    ;
    companies.forEach(x=>grouped[x]=[]);
    rows.forEach(x=>{if(grouped[x.company])grouped[x.company].push(x)});
    const cap=companies.length*60;
    c.innerHTML=`<div class="old-page-intro emerald"><div><div class="old-intro-kicker">NSTP DIRECTOR</div><h2>CWTS Company List</h2><p>View all approved CWTS company assignments and member rosters.</p></div></div><div class="roster-summary-grid four">${rosterSummary('Total Assigned',rows.length,'students','slate')}${rosterSummary('Total Capacity',cap,'6 companies','slate')}${rosterSummary('Available Slots',cap-rows.length,'remaining','green')}${rosterSummary('Companies',companies.length,'60 slots each','slate')}</div><div class="roster-stack">${companies.map((co,i)=>officerExpander(`off-cwts-${
      co
    }
    `,co,grouped[co],60,['blue','green','amber','purple','rose','cyan'][i])).join('')}</div>`;
    bindOfficerExpanders();
    return
  }
  if(page==='advance-course'||page==='special-platoon'){
    const rows=await API.get(`/api/officer/roster/${page}`);
    c.innerHTML=`<div class="old-page-intro sky"><div><div class="old-intro-kicker">NSTP DIRECTOR</div><h2>${page==='advance-course'?'Advance Course':'Special Platoon'}</h2><p>View approved ROTC students assigned to this group.</p></div></div><div class="panel">${recordsTable(rows)}</div>`;
    return
  }
  if(page==='settings'){
    c.innerHTML=settingsHtml();
    bindSettings();
    return
  }
}
async function viewSession(id){
  try{
    const rows=await API.get(`/api/officer/attendance/${id}/records`);
    $('#sessionRecords').innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Session #${id} Student Records</h2><p class="panel-subtitle">Students who have not marked attendance appear as “Not recorded”.</p></div></div>${table(['Student','Program','Status','Update'],rows.map(x=>`<tr><td><strong>${
      esc(x.student_no)
    }
    </strong><br>${
      esc(x.last_name+', '+x.first_name)
    }
    </td><td>${
      esc(x.nstp_component)
    }
    </td><td>${
      x.status?badge(x.status):badge('Not recorded')
    }
    </td><td><select onchange="setAttendance(${id},${x.student_id},this.value)"><option value="">Select status</option><option value="present" ${
      x.status==='present'?'selected':''
    }
    >Present</option><option value="late" ${
      x.status==='late'?'selected':''
    }
    >Late</option><option value="absent" ${
      x.status==='absent'?'selected':''
    }
    >Absent</option></select></td></tr>`))}</div>`
  }   catch(e){
    toast(e.message,true)
  }
}
async function setAttendance(sessionId,studentId,status){
  if(!status)return;
  try{
    const x=await API.post(`/api/officer/attendance/${sessionId}/records`,{student_id:studentId,status});
    toast(x.message);
    viewSession(sessionId)
  }   catch(e){
    toast(e.message,true)
  }
}
