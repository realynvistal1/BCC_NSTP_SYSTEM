function directorCard(label,subtitle,value,suffix,href,ico,tone,meta='',pct=null){
  return `<a class="dashboard-card director-card officer-shortcut-card" href="${href}"><div class="officer-card-head"><span class="dash-icon ${tone}">${icon(ico)}</span><div><h3>${esc(label)}</h3><p class="director-subtitle">${esc(subtitle)}</p></div></div><div class="officer-card-number"><strong>${esc(value)}</strong><span>${esc(suffix)}</span></div>${pct!==null?`<div class="officer-capacity"><div class="officer-progress"><i class="${tone}" style="width:${Math.min(Number(pct)||0,100)}%"></i></div>${
    meta?`<small>${esc(meta)}</small>`:''
  }
  </div>`:meta?`<div class="officer-meta">${
    esc(meta)
  }
  </div>`:''}<div class="officer-view">View <span>></span></div></a>`
}
function officerStudentRows(rows) {
  return rows.map((x, i) => {
    const status = esc((x.status || 'pending').toLowerCase());
    const search = esc(
      (
        x.student_id +
        ' ' +
        x.first_name +
        ' ' +
        (x.middle_name || '') +
        ' ' +
        x.last_name
      ).toLowerCase()
    );
    const level = x.ms_level
      ? `${x.program === 'CWTS' ? 'CWTS' : 'MS'} ${esc(x.ms_level)}`
      : '-';
    const name = x.last_name + ', ' + x.first_name + (x.middle_name ? ` ${x.middle_name[0]}.` : '');

    return `
      <tr data-status="${status}" data-search="${search}">
        <td>${i + 1}</td>
        <td><strong>${esc(x.student_id)}</strong></td>
        <td><strong>${esc(name)}</strong></td>
        <td>${esc(x.course)}</td>
        <td>${esc(x.year_level)}</td>
        <td>${level}</td>
        <td>${badge(x.status || 'pending')}</td>
        <td>${esc(x.assignment || '-')}</td>
      </tr>`;
  });
}
function officerEnrollmentPanel(program,rows,tone){
  const approved=rows.filter(x=>x.status==='approved').length,pending=rows.filter(x=>x.status==='pending').length,rejected=rows.filter(x=>x.status==='rejected').length,correction=rows.filter(x=>String(x.status).toLowerCase().includes('correction')).length;
  const key=program.toLowerCase();
  return `<section class="section-card director-enrollment-section" data-enrollment-list="${key}"><div class="section-heading director-list-heading"><div><span class="director-section-kicker">${program} ENROLLMENT</span><h2>${program} Enrolled Students</h2><p>Read-only monitoring list of students who submitted ${program} enrollment. Approval and rejection remain with the ${program} Admin.</p></div><a class="btn small" href="${program==='ROTC'?'/officer/rotc/battalion-1':'/officer/cwts'}">View ${program==='ROTC'?'ROTC Roster':'CWTS Companies'}</a></div><div class="director-mini-stats"><span><strong>${rows.length}</strong>Total</span><span class="ok"><strong>${approved}</strong>Approved</span><span class="wait"><strong>${pending}</strong>Pending</span><span class="bad"><strong>${rejected}</strong>Rejected</span></div><div class="director-list-tools"><div class="director-search"><span>${icon('records')}</span><input type="search" placeholder="Search by name or student ID..." data-list-search="${key}"></div><div class="director-status-tabs" data-list-tabs="${key}"><button class="active" data-status-filter="all">All <b>${rows.length}</b></button><button data-status-filter="pending">Pending <b>${pending}</b></button><button data-status-filter="approved">Approved <b>${approved}</b></button><button data-status-filter="rejected">Rejected <b>${rejected}</b></button>${correction?`<button data-status-filter="needs correction">Needs Correction <b>${
    correction
  }
  </b></button>`:''}</div></div><div class="director-table" data-list-table="${key}">${table(['#','Student ID','Name','Course','Year','Level','Status','Assignment'],officerStudentRows(rows))}</div><p class="director-list-note" data-list-count="${key}">Showing ${rows.length} of ${rows.length} enrolled students.</p></section>`
}
function bindOfficerEnrollmentLists() {
  document.querySelectorAll('[data-enrollment-list]').forEach(section => {
    const key = section.dataset.enrollmentList;
    const input = section.querySelector(`[data-list-search="${key}"]`);
    const tabs = section.querySelector(`[data-list-tabs="${key}"]`);
    const count = section.querySelector(`[data-list-count="${key}"]`);
    let status = 'all';

    const apply = () => {
      const q = (input?.value || '').trim().toLowerCase();
      const rows = [...section.querySelectorAll('tbody tr[data-status]')];
      let shown = 0;

      rows.forEach(row => {
        const okStatus =
          status === 'all' ||
          row.dataset.status === status ||
          row.dataset.status.includes(status);
        const okSearch = !q || (row.dataset.search || '').includes(q);
        const show = okStatus && okSearch;

        row.style.display = show ? '' : 'none';
        if (show) shown += 1;
      });

      if (count) {
        count.textContent = `Showing ${shown} matching enrolled student${shown === 1 ? '' : 's'}.`;
      }
    };

    input?.addEventListener('input', apply);
    tabs?.querySelectorAll('button').forEach(btn =>
      btn.addEventListener('click', () => {
        tabs.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        status = btn.dataset.statusFilter || 'all';
        apply();
      })
    );

    apply();
  });
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
  `:''}</span><span class="roster-chevron">v</span></button><div class="roster-expand-body">${rosterRowsOfficer(rows)}</div></div>`
}
function bindOfficerExpanders(){
  $$('.roster-expand-card').forEach(card=>card.querySelector('.roster-expand-head')?.addEventListener('click',()=>card.classList.toggle('open')))
}
function rosterFilterOptions(rows, program, level = ''){
  const enrollments=rows.flatMap(x=>x.enrollments||[x]);
  const years=[...new Set(enrollments.map(x=>String(x.school_year||'').trim()).filter(Boolean))].sort().reverse();
  const levels=['1', '2'];
  const levelLabel=program==='CWTS'?'CWTS':'MS';
  return { years, levels, levelLabel };
}
function filterRosterRows(rows, state){
  return rows.flatMap((row)=>{
    const match=(row.enrollments||[row]).find(enrollment=>
      (!state.level || String(enrollment.ms_level||'')===String(state.level)) &&
      (!state.schoolYear || String(enrollment.school_year||'')===String(state.schoolYear))
    );
    return match ? [{...row,...match}] : [];
  });
}
function officerRosterFilterBar(rows, program, state){
  const { years, levels, levelLabel } = rosterFilterOptions(rows, program, state.level);
  const emptyMessage = filterRosterRows(rows,state).length ? '' : '<div class="notice">No students are assigned to this roster for the selected level and school year. Check the program administrator\'s roster assignments for this enrollment cycle.</div>';
  return `<section class="section-card"><div class="section-heading"><h2>Filter Enrolled Students</h2><p>Filter this roster by enrolled level and school year.</p></div><div class="filter-row"><select id="officerFilterLevel"><option value="">All ${levelLabel} Levels</option>${levels.map(level=>`<option value="${esc(level)}" ${String(state.level||'')===String(level)?'selected':''}>${levelLabel} ${esc(level)}</option>`).join('')}</select><select id="officerFilterSchoolYear"><option value="">All School Years</option>${years.map(year=>`<option value="${esc(year)}" ${String(state.schoolYear||'')===String(year)?'selected':''}>SY ${esc(year)}</option>`).join('')}</select><button class="clear-filter-btn" id="clearOfficerRosterFilters">Clear Filters</button></div>${emptyMessage}</section>`;
}
function bindOfficerRosterFilters(state, rerender){
  $('#officerFilterLevel')?.addEventListener('change',()=>{
    state.level = $('#officerFilterLevel').value;
    rerender();
  });
  $('#officerFilterSchoolYear')?.addEventListener('change',()=>{
    state.schoolYear = $('#officerFilterSchoolYear').value;
    rerender();
  });
  $('#clearOfficerRosterFilters')?.addEventListener('click',()=>{
    state.level = '';
    state.schoolYear = '';
    rerender();
  });
}
async function officerPageBase(page,c){
  if(page==='dashboard'){
    const [d,b1,b2,adv,cwts,enroll]=await Promise.all([API.get('/api/officer/dashboard'),API.get('/api/officer/roster/battalion-1'),API.get('/api/officer/roster/battalion-2'),API.get('/api/officer/roster/advance-course'),API.get('/api/officer/roster/cwts'),API.get('/api/officer/enrollments')]);
    const battalionCap=4*4*37,cwtsCap=6*60;
    const b1Pct=Math.round((b1.length/battalionCap)*100),b2Pct=Math.round((b2.length/battalionCap)*100),cwtsPct=Math.round((cwts.length/cwtsCap)*100);
    const advMale=adv.filter(x=>String(x.sex).toLowerCase()==='male').length,advFemale=adv.filter(x=>String(x.sex).toLowerCase()==='female').length;
    c.innerHTML=`<div class="director-dashboard-title"><div><span>NSTP DIRECTOR DASHBOARD</span><h2>ROTC & CWTS Overview</h2><p>Manage battalions, CWTS companies, attendance operations, and student records.</p></div><div class="director-live"><i></i>${Number(d.open_sessions||0)} active attendance session${Number(d.open_sessions||0)===1?'':'s'}</div></div><div class="portal-dashboard-grid officer-dashboard-grid">${directorCard('ROTC - Battalion 1','Male cadets battalion',b1.length,`/ ${
      battalionCap
    }
    slots`,'/officer/rotc/battalion-1','users','blue','4 companies - 4 platoons each',b1Pct)}${directorCard('ROTC - Battalion 2','Female cadettes battalion',b2.length,`/ ${
      battalionCap
    }
    slots`,'/officer/rotc/battalion-2','users','purple','4 companies - 4 platoons each',b2Pct)}${directorCard('Advance Course','Cadets for advance ROTC',adv.length,'cadets','/officer/rotc/advance-course','platoon','orange',`Male: ${
      advMale
    }
    } - Female: ${
      advFemale
    }
    `)}${directorCard('CWTS','Company roster overview',cwts.length,`/ ${
      cwtsCap
    }
    slots`,'/officer/cwts','users','green','6 companies - 60 slots each',cwtsPct)}${dashCard('Create Attendance','Set Location & Time','Record attendance for ROTC or CWTS.','/officer/create-attendance','location','indigo')}${dashCard('View Attendance','Review Sessions','Review sessions and student records.','/officer/view-attendance','attendance','green')}${dashCard('View Student Records','ROTC & CWTS','View complete student records.','/officer/view-records','records','indigo')}${dashCard('Settings','Account Security','Manage account settings and password.','/officer/settings','settings','indigo')}</div><div class="director-enrollment-header"><div><span>ENROLLMENT MONITORING</span><h2>ROTC & CWTS Enrolled Students</h2><p>Monitor submitted enrollments from both components without changing the Admin-controlled status.</p></div></div><div class="director-enrollment-grid">${officerEnrollmentPanel('ROTC',enroll.rotc||[],'blue')}${officerEnrollmentPanel('CWTS',enroll.cwts||[],'green')}</div>`;
    bindOfficerEnrollmentLists();
    return
  }
  if(page==='create-attendance'){
    c.innerHTML=`<div class="page-intro-banner sky"><div><div class="page-intro-kicker">NSTP DIRECTOR</div><h2>Create Attendance</h2><p>Set the attendance location and schedule. The attendance radius stays fixed at 100 meters.</p></div></div><div class="panel"><form id="attForm" class="form-grid"><div class="field"><label>Program</label><select name="program"><option>ROTC</option><option>CWTS</option></select></div><div class="field"><label>MS Level</label><select name="ms_level"><option value="1">MS 1</option><option value="2">MS 2</option></select></div><div class="field"><label>School Year</label><input name="school_year" placeholder="2026-2027"></div><div class="field"><label>MI Number</label><input name="mi_number" type="number" min="1" required></div><div class="field checkbox-field"><label><input name="is_advance_course" type="checkbox" value="1"> Advance Course session</label><small>Use only for ROTC Advance Course attendance.</small></div><div class="field"><label>MI Type</label><select name="mi_type"><option value="in">IN</option><option value="out">OUT</option></select></div><div class="field"><label>Radius</label><input value="100 meters" disabled></div><div class="field"><label>Open Date / Time</label><input name="open_date" type="datetime-local" required></div><div class="field"><label>Close Date / Time</label><input name="close_date" type="datetime-local" required></div><div class="field"><label>Latitude</label><input name="latitude" id="lat" readonly required></div><div class="field"><label>Longitude</label><input name="longitude" id="lng" readonly required></div><div class="field full"><div class="notice">Set the approved attendance area while you are physically at the activity location.</div><div class="actions"><button type="button" class="btn" id="useLoc">Use My Current Location</button><button class="btn primary">Save / Activate Attendance</button></div></div></form></div>`;
    $('#useLoc').onclick=()=>navigator.geolocation?.getCurrentPosition(p=>{$('#lat').value=p.coords.latitude.toFixed(7);$('#lng').value=p.coords.longitude.toFixed(7);toast('Current location added.')},()=>toast('Could not get your location.',true),{enableHighAccuracy:true});
    $('#attForm').onsubmit=async e=>{
      e.preventDefault();
      const obj=formToObject(e.target);
      if(new Date(obj.close_date)<=new Date(obj.open_date))return toast('Close time must be later than open time.',true);
      try{
          const x=await API.post('/api/officer/attendance/sessions',obj);
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
    const rows=await API.get('/api/officer/attendance/sessions');
    c.innerHTML=`<div class="page-intro-banner sky"><div><div class="page-intro-kicker">NSTP DIRECTOR</div><h2>View Attendance</h2><p>Monitor ROTC and CWTS attendance sessions and update student attendance status.</p></div></div><div class="panel">${table(['ID','Program','MI','Open','Close','Radius','Status','Records'],rows.map(x=>`<tr><td>#${
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
    c.innerHTML=`<div class="page-intro-banner sky"><div><div class="page-intro-kicker">NSTP DIRECTOR</div><h2>View Student Records</h2><p>View ROTC and CWTS student records in one organized list.</p></div></div><div class="panel">${recordsTable(rows)}</div>`;
    return
  }
  if(page==='battalion-1'||page==='battalion-2'){
    const rows=await API.get(`/api/officer/roster/${page}`),bn=page==='battalion-1'?1:2,label=bn===1?'Male':'Female',state={level:'',schoolYear:''};
    const render=()=>{
      const filtered=filterRosterRows(rows,state);
      const companies=[...new Set(filtered.map(row=>row.rotc_company).filter(Boolean))];
      const grouped={};
      companies.forEach(co=>{grouped[co]={};filtered.filter(row=>row.rotc_company===co).forEach(row=>{grouped[co][row.rotc_platoon]=[]})});
      filtered.forEach(x=>{if(grouped[x.rotc_company]&&grouped[x.rotc_company][x.rotc_platoon])grouped[x.rotc_company][x.rotc_platoon].push(x)});
      c.innerHTML=`<div class="page-intro-banner sky"><div><div class="page-intro-kicker">NSTP DIRECTOR</div><h2>Battalion ${bn} - ${label}</h2><p>View all approved ROTC ${label.toLowerCase()} cadets assigned to Battalion ${bn} companies and platoons.</p></div></div>${officerRosterFilterBar(rows,'ROTC',state)}<div class="roster-summary-grid three">${rosterSummary(`Total ${bn===1?'Cadets':'Cadettes'}`,filtered.length,'','slate')}${rosterSummary('Companies',companies.length,'','slate')}${rosterSummary('Platoons',Object.values(grouped).reduce((total,group)=>total+Object.keys(group).length,0),'','green')}</div>${companies.map((co,ci)=>`<div class="company-card"><div class="company-card-head"><div><span class="roster-letter ${['blue','green','amber','purple'][ci]}">${co[0]}</span><strong>${co} Company</strong></div><small>${Object.values(grouped[co]).flat().length} cadets</small></div><div class="roster-stack">${Object.keys(grouped[co]).sort((a,b)=>Number(a)-Number(b)).map(pl=>officerExpander(`off-${bn}-${co}-${pl}`,`Platoon ${pl}`,grouped[co][pl],Infinity,['blue','green','amber','purple'][ci])).join('')}</div></div>`).join('')}`;
      bindOfficerRosterFilters(state, render);
      bindOfficerExpanders();
    };
    render();
    return
  }
  if(page==='cwts'){
    const rows=await API.get('/api/officer/roster/cwts'),companyDetails=await API.get('/api/officer/cwts-companies?details=1'),state={level:'',schoolYear:''};
    const companyLimit=name=>{
      const members=filterRosterRows(rows,state).filter(row=>row.company===name);
      const limits=members.map(row=>Number(companyDetails.find(company=>company.name===name && Number(company.schedule_id)===Number(row.schedule_id))?.capacity ?? companyDetails.find(company=>company.name===name && !company.schedule_id)?.capacity)||null);
      return limits.length && limits.every(value=>value===limits[0]) ? limits[0] : null;
    };
    const render=()=>{
      const filtered=filterRosterRows(rows,state);
      const companies=[...new Set(filtered.map(row=>row.company).filter(Boolean))];
      const limits=companies.map(companyLimit);
      const cap=limits.every(Number.isFinite)?limits.reduce((sum,value)=>sum+value,0):null;
      const grouped={};
      companies.forEach(x=>grouped[x]=[]);
      filtered.forEach(x=>{if(grouped[x.company])grouped[x.company].push(x)});
      c.innerHTML=`<div class="page-intro-banner emerald"><div><div class="page-intro-kicker">NSTP DIRECTOR</div><h2>CWTS Company List</h2><p>View all approved CWTS company assignments and member rosters.</p></div></div>${officerRosterFilterBar(rows,'CWTS',state)}<div class="roster-summary-grid four">${rosterSummary('Total Assigned',filtered.length,'students','slate')}${rosterSummary('Total Capacity',cap??'Unavailable',companies.length+' companies','slate')}${rosterSummary('Available Slots',cap===null?'Unavailable':Math.max(0,cap-filtered.length),'remaining','green')}${rosterSummary('Companies',companies.length,'assigned companies','slate')}</div><div class="roster-stack">${companies.map((co,i)=>officerExpander(`off-cwts-${co}`,co,grouped[co],companyLimit(co)??Infinity,['blue','green','amber','purple','rose','cyan'][i])).join('')}</div>`;
      bindOfficerRosterFilters(state, render);
      bindOfficerExpanders();
    };
    render();
    return
  }
  if(page==='advance-course'||page==='special-platoon'){
    const rows=await API.get(`/api/officer/roster/${page}`),state={level:'',schoolYear:''};
    if(page==='advance-course'){
      const render=()=>{
        const filtered=filterRosterRows(rows,state);
        const male=filtered.filter(x=>String(x.sex).toLowerCase()==='male').length;
        const female=filtered.filter(x=>String(x.sex).toLowerCase()==='female').length;
        const maleRows=filtered.filter(x=>String(x.sex).toLowerCase()==='male');
        const femaleRows=filtered.filter(x=>String(x.sex).toLowerCase()==='female');
        c.innerHTML=`<div class="page-intro-banner sky"><div><div class="page-intro-kicker">NSTP DIRECTOR</div><h2>Advance Course</h2><p>View approved ROTC students under the Advance Course.</p></div></div>${officerRosterFilterBar(rows,'ROTC',state)}<div class="roster-summary-grid four">${rosterSummary('Total Cadets',filtered.length,'approved advance-course students','slate')}${rosterSummary('Male',male,'male cadets','blue')}${rosterSummary('Female',female,'female cadets','rose')}${rosterSummary('Program','ROTC','advance course roster','green')}</div><div class="roster-stack">${officerExpander('advance-course-male','Male',maleRows,Infinity,'blue')}${officerExpander('advance-course-female','Female',femaleRows,Infinity,'rose')}</div>`;
        bindOfficerRosterFilters(state, render);
        bindOfficerExpanders();
      };
      render();
      return
    }
    const render=()=>{
      const filtered=filterRosterRows(rows,state);
      const medics=filtered.filter(x=>x.special_unit==='Medics').length;
      const hq=filtered.filter(x=>x.special_unit==='HQ').length;
      const mp=filtered.filter(x=>x.special_unit==='MP').length;
      const genderCounts=list=>'Male: '+list.filter(student=>String(student.sex).toLowerCase()==='male').length+' - Female: '+list.filter(student=>String(student.sex).toLowerCase()==='female').length;
      const medicsRows=filtered.filter(x=>x.special_unit==='Medics');
      const hqRows=filtered.filter(x=>x.special_unit==='HQ');
      const mpRows=filtered.filter(x=>x.special_unit==='MP');
      c.innerHTML=`<div class="page-intro-banner sky"><div><div class="page-intro-kicker">NSTP DIRECTOR</div><h2>Special Platoon</h2><p>View approved ROTC students assigned to special units.</p></div></div>${officerRosterFilterBar(rows,'ROTC',state)}<div class="roster-summary-grid four">${rosterSummary('Total Members',filtered.length,genderCounts(filtered),'slate')}${rosterSummary('Medics',medics,genderCounts(medicsRows),'rose')}${rosterSummary('HQ',hq,genderCounts(hqRows),'blue')}${rosterSummary('MP',mp,genderCounts(mpRows),'green')}</div><div class="roster-stack">${['Medics','HQ','MP'].map(unit=>[...new Set(filtered.filter(row=>row.special_unit===unit).map(row=>row.rotc_platoon||0))].sort((a,b)=>a-b).map(platoon=>officerExpander('special-'+unit+'-'+platoon,unit+(platoon?' - Platoon '+platoon:''),filtered.filter(row=>row.special_unit===unit&&Number(row.rotc_platoon||0)===Number(platoon)),Infinity,'blue')).join('')).join('')}</div>`;
      bindOfficerRosterFilters(state, render);
      bindOfficerExpanders();
    };
    render();
    return
  }
  if(page==='settings'){
    c.innerHTML=settingsHtml();
    bindSettings();
    return
  }
}
async function setAttendance(sessionId, studentId, status) {
  if (!status) return;

  try {
    const x = await API.post(`/api/officer/attendance/sessions/${sessionId}/records`, {
      student_id: studentId,
      status
    });
    toast(x.message);
    viewSession(sessionId);
  } catch (e) {
    toast(e.message, true);
  }
}

// Use the current dashboard markup while delegating the remaining roster pages to the base renderer.
async function officerPage(page, c) {
  if (page !== 'dashboard') {
    return officerPageBase(page,c);
  }

  const [d, b1, b2, adv, special, cwts, enroll] = await Promise.all([
    API.get('/api/officer/dashboard'),
    API.get('/api/officer/roster/battalion-1'),
    API.get('/api/officer/roster/battalion-2'),
    API.get('/api/officer/roster/advance-course'),
    API.get('/api/officer/roster/special-platoon'),
    API.get('/api/officer/roster/cwts'),
    API.get('/api/officer/enrollments')
  ]);

  const roster=d.rotc_roster;
  const b1Summary=roster?.battalions?.[1]||{count:b1.length,capacity:null,companies:new Set(b1.map(row=>row.rotc_company)).size,platoons:new Set(b1.map(row=>row.rotc_company+'/'+row.rotc_platoon)).size};
  const b2Summary=roster?.battalions?.[2]||{count:b2.length,capacity:null,companies:new Set(b2.map(row=>row.rotc_company)).size,platoons:new Set(b2.map(row=>row.rotc_company+'/'+row.rotc_platoon)).size};
  const advanceCount=roster?.advance.count??adv.length;
  const specialCount=roster?.special.count??special.length;
  const structureLabel=summary=>summary.companies+' '+(summary.companies===1?'company':'companies')+' - '+summary.platoons+' '+(summary.platoons===1?'platoon':'platoons');
  const cwtsCompanyNames = await API.get('/api/officer/cwts-companies');
  const cwtsCap = cwtsCompanyNames.length * 60;
  const rotcTotal = Number(d.rotc || 0);
  const cwtsTotal = Number(d.cwts || 0);
  const allStudents = rotcTotal + cwtsTotal;
  const assignedTotal = b1Summary.count + b2Summary.count + advanceCount + specialCount + cwtsTotal;
  const b1Pct = b1Summary.capacity?Math.round(b1Summary.count/b1Summary.capacity*100):null;
  const b2Pct = b2Summary.capacity?Math.round(b2Summary.count/b2Summary.capacity*100):null;
  const cwtsPct = cwtsCap?Math.round(cwtsTotal/cwtsCap*100):0;
  const activeSessions = Number(d.open_sessions || 0);
  const recordedAttendance = Number(d.attendance_records || 0);
  const advMale = roster?.advance.male??adv.filter(x => String(x.sex).toLowerCase() === 'male').length;
  const advFemale = roster?.advance.female??adv.filter(x => String(x.sex).toLowerCase() === 'female').length;
  const specialLabel = specialCount === 1 ? 'member' : 'members';

  const intro = document.querySelector('.intro-copy');
  if (intro) {
    intro.innerHTML = `
      <div class="intro-kicker">BCC NSTP Management System</div>
      <h1>NSTP Director Dashboard</h1>
      <p>Monitor ROTC and CWTS students, rosters, attendance, and records from one overview.</p>`;
  }

  const summaryMarkup = `
    <div class="summary-grid">
      ${summaryTile('ROTC Students', rotcTotal, 'Students currently tracked under ROTC', 'blue')}
      ${summaryTile('CWTS Students', cwtsTotal, 'Students currently tracked under CWTS', 'green')}
      ${summaryTile('Active Attendance', activeSessions, `Live session${activeSessions === 1 ? '' : 's'} being monitored`, 'orange')}
      ${summaryTile('Recorded Attendance', recordedAttendance, 'All saved attendance entries across sessions', 'red')}
    </div>`;
  const shortcutMarkup = `
    <section class="section-card">
      <div class="section-heading">
        <h2>Director Shortcuts</h2>
        <p>Keep your most-used Director pages one click away.</p>
      </div>
      <div class="portal-dashboard-grid officer-dashboard-grid">
        ${directorCard('ROTC - Battalion 1', 'Male cadets battalion', b1Summary.count, b1Summary.capacity!==null?'/ '+b1Summary.capacity+' slots':'cadets', '/officer/rotc/battalion-1', 'users', 'blue', structureLabel(b1Summary), b1Pct)}
        ${directorCard('ROTC - Battalion 2', 'Female cadettes battalion', b2Summary.count, b2Summary.capacity!==null?'/ '+b2Summary.capacity+' slots':'cadets', '/officer/rotc/battalion-2', 'users', 'purple', structureLabel(b2Summary), b2Pct)}
        ${directorCard('Advance Course', 'Cadets for advance ROTC', advanceCount, 'cadets', '/officer/rotc/advance-course', 'platoon', 'orange', `Male: ${advMale} - Female: ${advFemale}`)}
        ${directorCard('Special Platoon', 'Medics, HQ, and MP roster', specialCount, specialLabel, '/officer/rotc/special-platoon', 'platoon', 'green', roster?'Medics: '+roster.special.units.Medics+' - HQ: '+roster.special.units.HQ+' - MP: '+roster.special.units.MP:'Special ROTC unit assignments')}
        ${directorCard('CWTS', 'Company roster overview', cwtsTotal, `/ ${cwtsCap} slots`, '/officer/cwts', 'users', 'green', cwtsCompanyNames.length + ' companies - 60 slots each', cwtsPct)}
        ${dashCard('Create Attendance', 'Set Location & Time', 'Record attendance for ROTC or CWTS.', '/officer/create-attendance', 'location', 'indigo')}
        ${dashCard('View Attendance', 'Review Sessions', 'Review sessions and student records.', '/officer/view-attendance', 'attendance', 'green')}
        ${dashCard('View Student Records', 'ROTC & CWTS', 'View complete student records.', '/officer/view-records', 'records', 'indigo')}
        ${dashCard('Settings', 'Account Security', 'Manage account settings and password.', '/officer/settings', 'settings', 'indigo')}
      </div>
    </section>`;

  c.innerHTML = `${summaryMarkup}${shortcutMarkup}`;
  bindOfficerEnrollmentLists();
}

// Override the current officer attendance modal helpers with the current API shape.
async function viewSession(id) {
  try {
    const payload = await API.get(`/api/officer/attendance/sessions/${id}/records`);
    const rows = Array.isArray(payload.students) ? payload.students : [];
    const tableRows = rows.map(x => {
      const status =
        x.attendance_status && x.attendance_status !== 'unmarked'
          ? badge(x.attendance_status)
          : badge('Not recorded');
      const selectedId = x.id || x.student_id;

      return `
        <tr>
          <td>
            <strong>${esc(x.student_id)}</strong><br>
            ${esc(x.last_name + ', ' + x.first_name)}
          </td>
          <td>${esc(x.nstp_component)}</td>
          <td>${status}</td>
          <td>
            <select onchange="setAttendance(${id},${selectedId},this.value)">
              <option value="">Select status</option>
              <option value="present" ${x.attendance_status === 'present' ? 'selected' : ''}>Present</option>
              <option value="late" ${x.attendance_status === 'late' ? 'selected' : ''}>Late</option>
              <option value="absent" ${x.attendance_status === 'absent' ? 'selected' : ''}>Absent</option>
            </select>
          </td>
        </tr>`;
    });

    $('#sessionRecords').innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>Session #${id} Student Records</h2>
            <p class="panel-subtitle">
              Students who have not marked attendance appear as "Not recorded".
            </p>
          </div>
        </div>
        ${table(['Student', 'Program', 'Status', 'Update'], tableRows)}
      </div>`;
  } catch (e) {
    toast(e.message, true);
  }
}



