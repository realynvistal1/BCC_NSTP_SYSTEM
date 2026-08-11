let officerSessions = [];

function attFmtDate(v){return v?new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'-'}
function attFmtTime(v){return v?new Date(v).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'-'}
function attStatusBadge(status){const s=String(status||'').toLowerCase();const cls=s==='open'?'success':s==='late'?'warning':s==='closed'?'danger':'info';return `<span class="attendance-status-badge ${cls}">${esc(s||'scheduled')}</span>`}
function officerUnitLabel(program){return program==='CWTS'?'CS':'MI'}
function sessionStatusLabel(status){const s=String(status||'scheduled').toLowerCase();if(s==='open')return 'Open';if(s==='late')return 'Late Window';if(s==='closed')return 'Closed';return 'Scheduled'}
function statCard(label,value,tone=''){return `<div class="attendance-stat-card ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}
function officerStudentGroup(st){if(st.special_unit)return 'special-platoon';const battalion=Number(st.battalion||0);if(battalion===1)return 'battalion-1';if(battalion===2)return 'battalion-2';return 'all'}
function sessionCountLabel(count){return `${count} session${count===1?'':'s'} shown`}
function summarizeStudents(rows){return rows.reduce((out,student)=>{const key=student.attendance_status||'unmarked';out.total+=1;out[key]=(out[key]||0)+1;return out},{total:0,present:0,late:0,absent:0,unmarked:0})}

function buildCycles(sessions){const seen=new Map();sessions.forEach(s=>{const key=`${s.school_year||'Unknown'}__${s.ms_level||'all'}`;if(!seen.has(key))seen.set(key,{key,school_year:s.school_year||'Unknown',ms_level:s.ms_level||''})});return [...seen.values()].sort((a,b)=>b.school_year.localeCompare(a.school_year)||String(a.ms_level).localeCompare(String(b.ms_level)))}
function sessionTrackMatch(s,program){if(program==='ADVANCE_COURSE')return s.program==='ROTC'&&Number(s.is_advance_course||0)===1;if(program==='ROTC')return s.program==='ROTC'&&Number(s.is_advance_course||0)!==1;return s.program==='CWTS'}

function populateOfficerFilters(){
 const p=$('#viewProgram').value; const sessions=officerSessions.filter(s=>sessionTrackMatch(s,p)); const cycles=buildCycles(sessions); const cycle=$('#viewCycle'); const old=cycle.value;
 cycle.innerHTML='<option value="">All cycles</option>'+cycles.map(c=>`<option value="${esc(c.key)}">${p==='CWTS'?'CWTS':'MS'} ${esc(c.ms_level||'-')} - SY ${esc(c.school_year)}</option>`).join(''); if([...cycle.options].some(o=>o.value===old))cycle.value=old;
 const mi=$('#viewMI'); const nums=[...new Set(sessions.map(s=>Number(s.mi_number)).filter(Boolean))].sort((a,b)=>a-b); const oldMi=mi.value; mi.innerHTML='<option value="">All</option>'+nums.map(n=>`<option value="${n}">${p==='CWTS'?'CS':'MI'} ${n}</option>`).join(''); if([...mi.options].some(o=>o.value===oldMi))mi.value=oldMi;
 renderOfficerSessions();
}

function filteredOfficerSessions(){const p=$('#viewProgram').value,cycle=$('#viewCycle').value,mi=$('#viewMI').value,type=$('#viewType').value;return officerSessions.filter(s=>{if(!sessionTrackMatch(s,p))return false;if(cycle&&`${s.school_year||'Unknown'}__${s.ms_level||'all'}`!==cycle)return false;if(mi&&String(s.mi_number)!==mi)return false;if(type&&s.mi_type!==type)return false;return true})}

function renderOfficerSessions(){
 const list=$('#officerSessionList'); const sessions=filteredOfficerSessions(); const p=$('#viewProgram').value; const unit=officerUnitLabel(p==='ADVANCE_COURSE'?'ROTC':p);
 if(!sessions.length){list.innerHTML='<div class="attendance-empty attendance-empty-polished"><div class="attendance-empty-icon">O</div><h3>No attendance sessions found</h3><p>Try another filter or create a new attendance session first.</p></div>';return}
 list.innerHTML=`<div class="attendance-session-summary"><strong>${sessionCountLabel(sessions.length)}</strong><span>${esc(p==='ADVANCE_COURSE'?'Advance Course':p)} attendance results</span></div>`+sessions.map(s=>`<article class="officer-session-card ${esc(String(s.effective_status||'scheduled').toLowerCase())}"><div class="session-card-shell"><div class="session-card-main"><div class="session-card-top"><div class="session-card-heading"><span class="session-program ${s.program.toLowerCase()}">${p==='ADVANCE_COURSE'?'Advance Course':s.program}</span><h3>${unit} ${esc(s.mi_number||'-')} <span>-</span> ${(s.mi_type||'').toUpperCase()}</h3><p>${attFmtDate(s.open_date)} - ${attFmtTime(s.open_date)} - ${attFmtTime(s.close_date)} - Late until ${attFmtTime(s.late_deadline)}</p></div><div class="session-status-stack">${attStatusBadge(s.effective_status)}</div></div><div class="session-card-meta session-meta-grid"><span><b>SY</b>${esc(s.school_year||'-')}</span><span><b>${p==='CWTS'?'CWTS':'MS'}</b>${esc(s.ms_level||'-')}</span><span><b>Radius</b>100m</span><span><b>Created by</b>${esc(s.created_by||'-')}</span></div><div class="session-card-actions"><button class="btn primary view-session-records" data-id="${s.id}" type="button">View Student Records</button></div></div><div class="session-card-accent ${esc(String(s.effective_status||'scheduled').toLowerCase())}"><span>${sessionStatusLabel(s.effective_status).toUpperCase()}</span></div></div></article>`).join('');
 $$('.view-session-records',list).forEach(b=>b.onclick=()=>openOfficerRecords(b.dataset.id));
}

function officerAssignment(st){return st.special_unit||st.company||([st.battalion?`B${st.battalion}`:'',st.rotc_company,st.rotc_platoon?`P${st.rotc_platoon}`:''].filter(Boolean).join(' - '))||'-'}

async function openStatusModal(sessionId,student){
 const current=student.attendance_status==='unmarked'?'':student.attendance_status;
 const modal=document.createElement('div');
 modal.className='status-dialog';
 modal.innerHTML=`<div class="status-dialog-backdrop"></div><div class="status-dialog-card attendance-update-modal"><div class="record-modal-head"><div><span>Update Attendance</span><h2>${esc(student.last_name)}, ${esc(student.first_name)}</h2><p>${esc(student.student_id)} - ${esc(student.course||'-')}</p></div><button class="modal-close" id="statusModalClose">x</button></div><div class="record-modal-scroll"><section class="record-section"><h3>Select New Status</h3><div class="attendance-status-choice"><button data-status="present" class="${current==='present'?'selected present':''}">Present</button><button data-status="late" class="${current==='late'?'selected late':''}">Late</button><button data-status="absent" class="${current==='absent'?'selected absent':''}">Absent</button></div><div id="offenseChangeNotice"></div></section></div><div class="status-dialog-actions"><button class="btn" id="statusCancel">Cancel</button><button class="btn primary" id="statusSave" disabled>Update Status</button></div></div>`;
 document.body.appendChild(modal);
 let selected=current;
 const close=()=>modal.remove();
 $('#statusModalClose',modal).onclick=close;$('#statusCancel',modal).onclick=close;$('.status-dialog-backdrop',modal).onclick=close;
 $$('[data-status]',modal).forEach(btn=>btn.onclick=()=>{selected=btn.dataset.status;$$('[data-status]',modal).forEach(x=>x.className='');btn.classList.add('selected',selected);$('#statusSave',modal).disabled=!selected||selected===current;const offense=current!=='absent'&&selected==='absent';$('#offenseChangeNotice',modal).innerHTML=offense?'<div class="warning-banner reject-note"><div><strong>Attendance Offense</strong><span>Changing this student to Absent will record an attendance offense. First occurrence = warning; second occurrence = settlement required.</span></div></div>':'';});
 $('#statusSave',modal).onclick=async()=>{try{const out=await API.post(`/api/officer/attendance/sessions/${sessionId}/records`,{student_id:Number(student.id),status:selected});toast(out.message);close();await openOfficerRecords(sessionId)}catch(e){toast(e.message,true)}};
}

async function openOfficerRecords(id){
 const modal=$('#attendanceRecordsModal'); const body=$('#recordsModalBody'); modal.classList.remove('hidden'); body.innerHTML='<div class="page-loading"><span class="page-spinner"></span><strong>Loading attendance records...</strong></div>';
 try{
   const data=await API.get(`/api/officer/attendance/sessions/${id}/records`);
   const s=data.session;
   $('#recordsModalTitle').textContent=`${s.program==='CWTS'?'CS':'MI'} ${s.mi_number} ${(s.mi_type||'').toUpperCase()} - ${s.program}`;
   $('#recordsModalSubtitle').textContent=`${attFmtDate(s.open_date)} - ${attFmtTime(s.open_date)} - ${attFmtTime(s.close_date)} - 100m radius`;
   const rows=data.students.map(st=>`<tr data-group="${officerStudentGroup(st)}"><td><strong>${esc(st.last_name)}, ${esc(st.first_name)}</strong><small>${esc(st.student_id)}</small></td><td>${esc(officerAssignment(st))}</td><td>${st.attendance_time?attFmtTime(st.attendance_time):'-'}</td><td>${st.distance_meters!=null?`${Math.round(Number(st.distance_meters))}m`:'-'}</td><td>${badge(st.attendance_status)}</td><td><button class="btn small primary officer-update-status" data-student="${st.id}">Update Status</button></td></tr>`);
   const showRosterFilter=s.program==='ROTC'&&Number(s.is_advance_course||0)!==1;
   body.innerHTML=`<div class="attendance-record-overview"><div class="attendance-record-stats" id="officerRecordStats">${statCard('Total',data.total)}${statCard('Present',data.counts.present,'present')}${statCard('Late',data.counts.late,'late')}${statCard('Absent',data.counts.absent,'absent')}${statCard('Not Yet',data.counts.unmarked,'unmarked')}</div><div class="attendance-record-tools">${showRosterFilter?`<label class="attendance-record-filter"><span>Roster Filter</span><select id="officerRecordGroup"><option value="all">All</option><option value="battalion-1">Battalion 1</option><option value="battalion-2">Battalion 2</option><option value="special-platoon">Special Platoon</option></select></label>`:''}<div class="attendance-record-search"><input id="officerRecordSearch" type="search" placeholder="Search name or student ID..."></div></div></div><div class="attendance-record-table-wrap">${table(['Student','Assignment','Time','Distance','Status','Action'],rows)}</div>`;
   $$('.officer-update-status',body).forEach(btn=>btn.onclick=()=>{const st=data.students.find(x=>Number(x.id)===Number(btn.dataset.student));if(st)openStatusModal(id,st)});
   const applyRecordFilters=()=>{const q=($('#officerRecordSearch')?.value||'').toLowerCase();const group=$('#officerRecordGroup')?.value||'all';const filteredStudents=data.students.filter(student=>{const groupOk=group==='all'||officerStudentGroup(student)===group;const text=`${student.last_name||''} ${student.first_name||''} ${student.student_id||''} ${officerAssignment(student)||''}`.toLowerCase();return groupOk&&text.includes(q)});$$('tbody tr',body).forEach(tr=>{const textOk=tr.textContent.toLowerCase().includes(q);const groupOk=group==='all'||tr.dataset.group===group;tr.style.display=textOk&&groupOk?'':'none'});const counts=summarizeStudents(filteredStudents);$('#officerRecordStats').innerHTML=`${statCard('Total',counts.total)}${statCard('Present',counts.present,'present')}${statCard('Late',counts.late,'late')}${statCard('Absent',counts.absent,'absent')}${statCard('Not Yet',counts.unmarked,'unmarked')}`};
   $('#officerRecordSearch').oninput=applyRecordFilters;
   $('#officerRecordGroup')?.addEventListener('change',applyRecordFilters);
   applyRecordFilters();
 }catch(e){body.innerHTML=`<div class="page-load-error"><h3>Unable to load records</h3><p>${esc(e.message)}</p></div>`}
}

document.addEventListener('DOMContentLoaded',async()=>{try{const auth=await guard('officer');if(!auth)return;shell('officer','View Attendance','Monitor ROTC, CWTS, and Advance Course attendance sessions.',auth);officerSessions=await API.get('/api/officer/attendance/sessions');const qp=new URLSearchParams(location.search).get('program');if(qp){const map={rotc:'ROTC',cwts:'CWTS','advance-course':'ADVANCE_COURSE'};if(map[qp])$('#viewProgram').value=map[qp]}populateOfficerFilters();['viewProgram','viewCycle','viewMI','viewType'].forEach(id=>$('#'+id).addEventListener('change',id==='viewProgram'?populateOfficerFilters:renderOfficerSessions));$('#closeAttendanceRecords').onclick=()=>$('#attendanceRecordsModal').classList.add('hidden');$('.app-dialog-backdrop', $('#attendanceRecordsModal')).onclick=()=>$('#attendanceRecordsModal').classList.add('hidden')}catch(e){showPageError(e)}});

