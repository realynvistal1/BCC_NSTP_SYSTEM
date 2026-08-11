function recordAssignment(row,program){
  if(program==='CWTS') return row.company||'-';
  if(Number(row.willing_to_take_advance_course)) return 'Advance Course';
  if(row.special_unit) return row.special_unit;
  return [row.battalion?`Battalion ${row.battalion}`:'',row.rotc_company,row.rotc_platoon?`Platoon ${row.rotc_platoon}`:''].filter(Boolean).join(' - ')||'-';
}
function formatRecordDate(v){ if(!v)return'-'; const d=new Date(v); return Number.isNaN(d.getTime())?esc(v):d.toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
function infoItem(label,value){return `<div class="record-info-item"><small>${esc(label)}</small><strong>${esc(value??'-')||'-'}</strong></div>`}
function xmlSafe(v=''){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function downloadRecordsExcel(rows,program,level,sy){
  const prefix=program==='CWTS'?'CWTS':'MS';
  const headers=['#','SURNAME','FIRST NAME','MIDDLE NAME','SUFFIX','COURSE','COMPANY','PLATOON','ID NUMBER','BIRTHDATE','SEX','ADDRESS',`${prefix} LEVEL`,'MIDTERM','FINAL','AVERAGE'];
  const data=rows.map((r,i)=>[i+1,r.last_name,r.first_name,r.middle_name||'',r.suffix||'N/A',r.course,program==='ROTC'?(Number(r.willing_to_take_advance_course)?'Advance Course':r.special_unit||r.rotc_company||'-'):r.company||'-',program==='ROTC'?(r.rotc_platoon||'-'):'-',r.student_id,r.birthdate||'-',r.sex||'-',[r.permanent_barangay,r.permanent_municipality,r.permanent_province].filter(Boolean).join(', ')||'-',`${prefix} ${r.ms_level}`,r.midterm??'-',r.final_term??'-',r.grade??'-']);
  const rowsXml=[
    [`Region: VII`,`NSTP Component: ${program}`,'','','BUENAVISTA COMMUNITY COLLEGE','','','','','','','','',`School Year: ${sy||'All'}`],
    ['','','','','Cangawa, Buenavista, Bohol','','','','','','','','',`${prefix} Level: ${level||'All'}`],
    [],headers,...data
  ].map(row=>`<Row>${row.map(v=>`<Cell><Data ss:Type="String">${xmlSafe(v)}</Data></Cell>`).join('')}</Row>`).join('');
  const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Records"><Table>${rowsXml}</Table></Worksheet></Workbook>`;
  const blob=new Blob(['\ufeff',xml],{type:'application/vnd.ms-excel;charset=utf-8'});
  const a=document.createElement('a');
  const url=URL.createObjectURL(blob);
  a.href=url;
  a.download=`${program}${level?`_${prefix}${level}`:''}${sy?`_SY${sy}`:''}_Records.xls`;
  a.style.display='none';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},5000);
}

async function renderAdminRecords(_program,content){
  const program='ROTC', p='rotc', prefix='MS';
  const rows=await API.get(`/api/admin/${p}/records`);
  const years=[...new Set(rows.map(r=>r.school_year).filter(Boolean))].sort().reverse();
  content.innerHTML=`
    <section class="records-tools">
      <div class="record-search"><span>${icon('records')}</span><input id="recordSearch" placeholder="Search by name, student ID, or course..."></div>
      <select id="recordLevel"><option value="">All ${prefix} Levels</option><option value="1">${prefix} 1</option><option value="2">${prefix} 2</option></select>
      <select id="recordSY"><option value="">All SY</option>${years.map(y=>`<option value="${esc(y)}">SY ${esc(y)}</option>`).join('')}</select>
      <button class="btn success" id="downloadRecords">${icon('records')} Download Excel</button>
    </section>
    <section class="panel record-list-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Student ID</th><th>Name</th><th>Course</th><th>${prefix} Level</th><th>SY</th>${program==='ROTC'?'<th>Battalion / Group</th>':''}<th>Action</th></tr></thead><tbody id="recordRows"></tbody></table></div><div class="table-footer" id="recordFooter"></div></section>
    <div class="app-dialog hidden" id="recordModal"><div class="app-dialog-backdrop"></div><div class="app-dialog-card record-modal-card"><div id="recordModalBody"></div></div></div>`;
  function filtered(){const q=$('#recordSearch').value.trim().toLowerCase(),lv=$('#recordLevel').value,sy=$('#recordSY').value; return rows.filter(r=>(!lv||String(r.ms_level)===lv)&&(!sy||r.school_year===sy)&&(!q||`${r.first_name} ${r.middle_name||''} ${r.last_name} ${r.student_id} ${r.course}`.toLowerCase().includes(q)));}
  function draw(){const data=filtered(); $('#recordRows').innerHTML=data.length?data.map((r,i)=>`<tr><td>${i+1}</td><td><strong>${esc(r.student_id)}</strong></td><td>${esc(r.last_name)}, ${esc(r.first_name)}${r.suffix?` ${esc(r.suffix)}`:''}</td><td>${esc(r.course)}</td><td><span class="level-pill">${prefix} ${esc(r.ms_level)}</span></td><td>${r.school_year?`SY ${esc(r.school_year)}`:'-'}</td>${program==='ROTC'?`<td>${esc(Number(r.willing_to_take_advance_course)?'Advance Course':r.special_unit?'Special Platoon':r.battalion?`Battalion ${r.battalion}`:'-')}</td>`:''}<td><button class="btn small primary" data-detail="${r.student_db_id}" data-level="${r.ms_level}">View Details</button></td></tr>`).join(''):`<tr><td colspan="${program==='ROTC'?8:7}"><div class="empty">No students found.</div></td></tr>`; $('#recordFooter').textContent=`Showing ${data.length} of ${rows.length} record(s)`; $$('[data-detail]').forEach(b=>b.onclick=()=>openRecord(Number(b.dataset.detail),b.dataset.level));}
  async function openRecord(id,level){
    const modal=$('#recordModal'),body=$('#recordModalBody'); modal.classList.remove('hidden'); body.innerHTML=`<div class="page-loading"><div class="page-spinner"></div><span>Loading complete student record...</span></div>`;
    try{
      const d=await API.get(`/api/admin/${p}/records/${id}?ms_level=${encodeURIComponent(level)}`),s=d.student,c=d.cycle,att=d.attendance||[],grade=(d.grades||[]).find(g=>String(g.ms_level)===String(level));
      const present=att.filter(x=>x.status==='present').length,late=att.filter(x=>x.status==='late').length,absent=att.filter(x=>x.status==='absent').length;
      body.innerHTML=`<div class="record-modal-head"><div><span>Student Record - ${prefix} ${esc(level)}</span><h2>${esc(s.first_name)} ${esc(s.last_name)}${s.suffix?` ${esc(s.suffix)}`:''}</h2><p>${c.school_year?`SY ${esc(c.school_year)} - `:''}${esc(s.student_id)}</p></div><button class="modal-close" id="recordClose">x</button></div><div class="record-modal-scroll">
        <section class="record-section"><h3>Personal Information</h3><div class="record-info-grid">${infoItem('Student ID',s.student_id)}${infoItem('Name',`${s.last_name}, ${s.first_name} ${s.middle_name||''}${s.suffix?` ${s.suffix}`:''}`)}${infoItem('Course',s.course)}${infoItem('Year Level',s.year_level)}${infoItem('Sex',s.sex)}${infoItem('Birthdate',s.birthdate)}${infoItem('Email',s.email)}${infoItem('Contact Number',s.contact_number)}${infoItem('Permanent Address',[s.permanent_barangay,s.permanent_municipality,s.permanent_province].filter(Boolean).join(', '))}${infoItem('Medical Condition',s.has_medical_condition?`${s.medical_condition||'Yes'}`:'None')}</div></section>
        <section class="record-section"><h3>Enrollment & Assignment</h3><div class="record-info-grid">${infoItem('Program',program)}${infoItem(`${prefix} Level`,`${prefix} ${level}`)}${infoItem('School Year',c.school_year?`SY ${c.school_year}`:'-')}${infoItem('Enrollment Status',c.status)}${program==='ROTC'?`${infoItem('Battalion',s.battalion?`Battalion ${s.battalion}`:'-')}${infoItem('Company',s.rotc_company||'-')}${infoItem('Platoon',s.rotc_platoon?`Platoon ${s.rotc_platoon}`:'-')}${infoItem('Special Unit',s.special_unit||'-')}${infoItem('Advance Course',s.willing_to_take_advance_course?'Yes':'No')}`:infoItem('CWTS Company',s.company||'-')}</div></section>
        <section class="record-section"><h3>Grade - NSTP ${esc(level)}</h3><div class="record-grade-row">${infoItem('Midterm',grade?Number(grade.midterm).toFixed(2):'-')}${infoItem('Final',grade?Number(grade.final_term).toFixed(2):'-')}${infoItem('Average',grade?Number(grade.grade).toFixed(2):'-')}<div class="record-info-item"><small>Status</small>${grade?badge(grade.status):'<strong>-</strong>'}</div></div></section>
        <section class="record-section"><h3>Attendance Summary</h3><div class="record-attendance-stats"><div class="present"><strong>${present}</strong><span>Present</span></div><div class="late"><strong>${late}</strong><span>Late</span></div><div class="absent"><strong>${absent}</strong><span>Absent</span></div></div>${att.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>${program==='CWTS'?'CS':'MI'}</th><th>Type</th><th>Status</th><th>Time</th><th>Distance</th></tr></thead><tbody>${att.map(a=>`<tr><td>${a.mi_number||'-'}</td><td>${esc((a.mi_type||'-').toUpperCase())}</td><td>${badge(a.status)}</td><td>${formatRecordDate(a.created_at)}</td><td>${a.distance_meters!=null?`${Number(a.distance_meters).toFixed(1)} m`:'-'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty compact">No attendance records for this cycle.</div>'}</section>
        <section class="record-section"><h3>Completion / Certificate Information</h3><div class="record-info-grid">${infoItem('Serial Number',d.serial?.serial_number||s.serial_number||'Not yet issued')}${infoItem('Certificate Status',(d.serial?.serial_number||s.serial_number)?'Serial number available':'Not yet available')}</div></section>
        ${program==='ROTC'&&(d.withdrawals||[]).length?`<section class="record-section"><h3>Advance Course Withdrawal History</h3>${(d.withdrawals||[]).map(w=>`<div class="withdrawal-history"><div>${badge(w.status)} <small>${formatRecordDate(w.created_at)}</small></div><p><strong>Reason:</strong> ${esc(w.reason)}</p>${w.admin_remarks?`<p><strong>Admin Remarks:</strong> ${esc(w.admin_remarks)}</p>`:''}</div>`).join('')}</section>`:''}
      </div><div class="app-dialog-actions"><button class="btn" id="recordCloseBottom">Close</button></div>`;
      const close=()=>modal.classList.add('hidden'); $('#recordClose').onclick=close; $('#recordCloseBottom').onclick=close; modal.querySelector('.app-dialog-backdrop').onclick=close;
    }catch(e){body.innerHTML=`<div class="page-load-error"><h3>Unable to load student record</h3><p>${esc(e.message)}</p><button class="btn" onclick="document.getElementById('recordModal').classList.add('hidden')">Close</button></div>`;}
  }
  $('#recordSearch').oninput=draw; $('#recordLevel').onchange=draw; $('#recordSY').onchange=draw; $('#downloadRecords').onclick=()=>{const d=filtered();if(!d.length)return toast('No records to download.',true);downloadRecordsExcel(d,program,$('#recordLevel').value,$('#recordSY').value);}; draw();
}

