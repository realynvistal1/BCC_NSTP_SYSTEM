let officerSessions = [];

function attFmtDate(v){return v?new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}
function attFmtTime(v){return v?new Date(v).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'—'}
function attStatusBadge(status){const s=String(status||'').toLowerCase();const cls=s==='open'?'success':s==='late'?'warning':s==='closed'?'danger':'info';return `<span class="attendance-status-badge ${cls}">${esc(s||'scheduled')}</span>`}

function buildCycles(sessions){const seen=new Map();sessions.forEach(s=>{const key=`${s.school_year||'Unknown'}__${s.ms_level||'all'}`;if(!seen.has(key))seen.set(key,{key,school_year:s.school_year||'Unknown',ms_level:s.ms_level||''})});return [...seen.values()].sort((a,b)=>b.school_year.localeCompare(a.school_year)||String(a.ms_level).localeCompare(String(b.ms_level)))}
function sessionTrackMatch(s,program){if(program==='ADVANCE_COURSE')return s.program==='ROTC'&&Number(s.is_advance_course||0)===1;if(program==='ROTC')return s.program==='ROTC'&&Number(s.is_advance_course||0)!==1;return s.program==='CWTS'}

function populateOfficerFilters(){
 const p=$('#viewProgram').value; const sessions=officerSessions.filter(s=>sessionTrackMatch(s,p)); const cycles=buildCycles(sessions); const cycle=$('#viewCycle'); const old=cycle.value;
 cycle.innerHTML='<option value="">All cycles</option>'+cycles.map(c=>`<option value="${esc(c.key)}">${p==='CWTS'?'CWTS':'MS'} ${esc(c.ms_level||'—')} - SY ${esc(c.school_year)}</option>`).join(''); if([...cycle.options].some(o=>o.value===old))cycle.value=old;
 const mi=$('#viewMI'); const nums=[...new Set(sessions.map(s=>Number(s.mi_number)).filter(Boolean))].sort((a,b)=>a-b); const oldMi=mi.value; mi.innerHTML='<option value="">All</option>'+nums.map(n=>`<option value="${n}">${p==='CWTS'?'CS':'MI'} ${n}</option>`).join(''); if([...mi.options].some(o=>o.value===oldMi))mi.value=oldMi;
 renderOfficerSessions();
}

function filteredOfficerSessions(){const p=$('#viewProgram').value, cycle=$('#viewCycle').value, mi=$('#viewMI').value, type=$('#viewType').value; return officerSessions.filter(s=>{if(!sessionTrackMatch(s,p))return false;if(cycle&&`${s.school_year||'Unknown'}__${s.ms_level||'all'}`!==cycle)return false;if(mi&&String(s.mi_number)!==mi)return false;if(type&&s.mi_type!==type)return false;return true})}

function renderOfficerSessions(){const list=$('#officerSessionList'); const sessions=filteredOfficerSessions(); const p=$('#viewProgram').value; const unit=p==='CWTS'?'CS':'MI'; if(!sessions.length){list.innerHTML='<div class="attendance-empty"><h3>No attendance sessions</h3><p>Create an attendance session first.</p></div>';return}
 list.innerHTML=sessions.map(s=>`<article class="officer-session-card"><div class="session-card-top"><div><span class="session-program ${s.program.toLowerCase()}">${p==='ADVANCE_COURSE'?'Advance Course':s.program}</span><h3>${unit} ${esc(s.mi_number||'—')} • ${(s.mi_type||'').toUpperCase()}</h3><p>${attFmtDate(s.open_date)} • ${attFmtTime(s.open_date)} - ${attFmtTime(s.close_date)} • Late until ${attFmtTime(s.late_deadline)}</p></div>${attStatusBadge(s.effective_status)}</div><div class="session-card-meta"><span>SY ${esc(s.school_year||'—')}</span><span>${p==='CWTS'?'CWTS':'MS'} ${esc(s.ms_level||'—')}</span><span>100m radius</span><span>Created by ${esc(s.created_by||'—')}</span></div><button class="btn primary view-session-records" data-id="${s.id}" type="button">View Student Records</button></article>`).join('');
 $$('.view-session-records',list).forEach(b=>b.onclick=()=>openOfficerRecords(b.dataset.id));
}

function officerAssignment(st){return st.special_unit||st.company||([st.battalion?`B${st.battalion}`:'',st.rotc_company,st.rotc_platoon?`P${st.rotc_platoon}`:''].filter(Boolean).join(' • '))||'—'}

async function openStatusModal(sessionId,student){
  const current=student.attendance_status==='unmarked'?'':student.attendance_status;
  const modal=document.createElement('div');
  modal.className='old-modal';
  modal.innerHTML=`<div class="old-modal-backdrop"></div><div class="old-modal-card attendance-update-modal"><div class="record-modal-head"><div><span>Update Attendance</span><h2>${esc(student.last_name)}, ${esc(student.first_name)}</h2><p>${esc(student.student_id)} · ${esc(student.course||'—')}</p></div><button class="modal-close" id="statusModalClose">×</button></div><div class="record-modal-scroll"><section class="record-section"><h3>Select New Status</h3><div class="attendance-status-choice"><button data-status="present" class="${current==='present'?'selected present':''}">Present</button><button data-status="late" class="${current==='late'?'selected late':''}">Late</button><button data-status="absent" class="${current==='absent'?'selected absent':''}">Absent</button></div><div id="offenseChangeNotice"></div></section></div><div class="old-modal-actions"><button class="btn" id="statusCancel">Cancel</button><button class="btn primary" id="statusSave" disabled>Update Status</button></div></div>`;
  document.body.appendChild(modal);
  let selected=current;
  const close=()=>modal.remove();
  $('#statusModalClose',modal).onclick=close;$('#statusCancel',modal).onclick=close;$('.old-modal-backdrop',modal).onclick=close;
  $$('[data-status]',modal).forEach(btn=>btn.onclick=()=>{selected=btn.dataset.status;$$('[data-status]',modal).forEach(x=>x.className='');btn.classList.add('selected',selected);$('#statusSave',modal).disabled=!selected||selected===current;const offense=['present','late'].includes(current)&&selected==='absent';$('#offenseChangeNotice',modal).innerHTML=offense?'<div class="old-warning-banner reject-note"><div><strong>Attendance Offense</strong><span>Changing a previously Present/Late student to Absent will record an attendance offense. First occurrence = warning; second occurrence = settlement required.</span></div></div>':'';});
  $('#statusSave',modal).onclick=async()=>{try{const out=await API.post(`/api/officer/attendance/sessions/${sessionId}/records`,{student_id:Number(student.id),status:selected});toast(out.message);close();await openOfficerRecords(sessionId)}catch(e){toast(e.message,true)}};
}

async function openOfficerRecords(id){
 const modal=$('#attendanceRecordsModal'); const body=$('#recordsModalBody'); modal.classList.remove('hidden'); body.innerHTML='<div class="page-loading"><span class="page-spinner"></span><strong>Loading attendance records...</strong></div>';
 try{
   const data=await API.get(`/api/officer/attendance/sessions/${id}/records`); const s=data.session; $('#recordsModalTitle').textContent=`${s.program==='CWTS'?'CS':'MI'} ${s.mi_number} ${(s.mi_type||'').toUpperCase()} — ${s.program}`; $('#recordsModalSubtitle').textContent=`${attFmtDate(s.open_date)} • ${attFmtTime(s.open_date)} - ${attFmtTime(s.close_date)} • 100m radius`;
   const rows=data.students.map(st=>`<tr><td><strong>${esc(st.last_name)}, ${esc(st.first_name)}</strong><small>${esc(st.student_id)}</small></td><td>${esc(officerAssignment(st))}</td><td>${st.attendance_time?attFmtTime(st.attendance_time):'—'}</td><td>${st.distance_meters!=null?`${Math.round(Number(st.distance_meters))}m`:'—'}</td><td>${badge(st.attendance_status)}</td><td><button class="btn small primary officer-update-status" data-student="${st.id}">Update Status</button></td></tr>`);
   body.innerHTML=`<div class="attendance-record-stats"><div><span>Total</span><strong>${data.total}</strong></div><div class="present"><span>Present</span><strong>${data.counts.present}</strong></div><div class="late"><span>Late</span><strong>${data.counts.late}</strong></div><div class="absent"><span>Absent</span><strong>${data.counts.absent}</strong></div><div><span>Not Yet</span><strong>${data.counts.unmarked}</strong></div></div><div class="attendance-record-search"><input id="officerRecordSearch" type="search" placeholder="Search name or student ID..."></div>${table(['Student','Assignment','Time','Distance','Status','Action'],rows)}`;
   $$('.officer-update-status',body).forEach(btn=>btn.onclick=()=>{const st=data.students.find(x=>Number(x.id)===Number(btn.dataset.student));if(st)openStatusModal(id,st)});
   $('#officerRecordSearch').oninput=e=>{const q=e.target.value.toLowerCase();$$('tbody tr',body).forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none')};
 }catch(e){body.innerHTML=`<div class="page-load-error"><h3>Unable to load records</h3><p>${esc(e.message)}</p></div>`}
}

document.addEventListener('DOMContentLoaded',async()=>{try{const auth=await guard('officer');if(!auth)return;shell('officer','View Attendance','Monitor ROTC, CWTS, and Advance Course attendance sessions.',auth);officerSessions=await API.get('/api/officer/attendance/sessions');const qp=new URLSearchParams(location.search).get('program');if(qp){const map={rotc:'ROTC',cwts:'CWTS','advance-course':'ADVANCE_COURSE'};if(map[qp])$('#viewProgram').value=map[qp]}populateOfficerFilters();['viewProgram','viewCycle','viewMI','viewType'].forEach(id=>$('#'+id).addEventListener('change',id==='viewProgram'?populateOfficerFilters:renderOfficerSessions));$('#closeAttendanceRecords').onclick=()=>$('#attendanceRecordsModal').classList.add('hidden');$('.attendance-modal-backdrop').onclick=()=>$('#attendanceRecordsModal').classList.add('hidden')}catch(e){showPageError(e)}});
