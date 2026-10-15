function verifierCandidateLabel(student) {
  const shortCourses = {
    'BS Criminology': 'BSCrim',
    'BS Information Technology': 'BSIT',
    'BS Hospitality Management': 'BSHM',
    'BS Tourism Management': 'BSTM',
    'BEED - Bachelor of Elementary Education': 'BEED',
    'BSED - Major in English': 'BSED - English',
    'BSED - Major in Mathematics': 'BSED - Mathematics',
  };
  return [student.last_name + ', ' + student.first_name, shortCourses[student.course] || student.course, student.year_level, student.student_id].filter(Boolean).join(' / ');
}
function verifierSearchMatches(record, query) {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  const text = normalize([record.first_name, record.middle_name, record.last_name, record.student_id].join(' '));
  const compactId = normalize(record.student_id).replace(/\s/g, '');
  return tokens.every(token => text.includes(token) || (/^\d+$/.test(token) && compactId.includes(token)));
}
function verifierScope(a) {
  const mi=Number(a.mi_number)>0?`MI ${a.mi_number}`:'All MIs (existing assignment)';
  const type=a.mi_type?String(a.mi_type).toUpperCase():'All types';
  if (a.special_unit) return `Special Platoon / ${a.special_unit} / MS ${a.ms_level} / SY ${a.school_year} / ${mi} / ${type}`;
  return `Battalion ${a.battalion} / ${a.company} / Platoon ${a.platoon} / MS ${a.ms_level} / SY ${a.school_year} / ${mi} / ${type}`;
}
function verifierTable(headers,rows) {
  return rows.length ? table(headers,rows) : '<div class="notice">No records to show.</div>';
}
function verifierAssignmentAccess(a) {
  return Number(a.active) === 1 ? (Number(a.eligible) === 1 ? 'active' : 'ineligible') : 'revoked';
}
function verifierAssignmentRow(a) {
  const access = verifierAssignmentAccess(a);
  const label = { active: 'Active', ineligible: 'Access blocked', revoked: 'Revoked' }[access];
  const name = [a.first_name, a.last_name].filter(Boolean).join(' ');
  const initials = [a.first_name, a.last_name].filter(Boolean).map(part => String(part).charAt(0)).join('');
  const group = a.special_unit ? `Special Platoon / ${a.special_unit}` : `Battalion ${a.battalion} / ${a.company} / Platoon ${a.platoon}`;
  return `<tr class="verifier-assignment-row"><td><div class="verifier-assignee"><span class="verifier-assignee-avatar" aria-hidden="true">${esc(initials)}</span><div><strong>${esc(name)}</strong><small>${esc(a.student_id)}</small></div></div></td>
    <td><div class="verifier-assigned-group">${icon('platoon')}<strong>${esc(group)}</strong></div><div class="verifier-assigned-tags"><span>MS ${esc(a.ms_level)}</span><span>SY ${esc(a.school_year)}</span><span class="session">${Number(a.mi_number) ? `MI ${esc(a.mi_number)}` : 'All MIs'} / ${esc(String(a.mi_type || 'All types').toUpperCase())}</span></div></td>
    <td><span class="verifier-access ${access}">${label}</span></td><td>${Number(a.active) === 1 ? `<button class="btn small verifier-revoke" type="button" data-revoke="${esc(a.id)}" aria-label="Revoke access for ${esc(name)}">${icon('logout')} Revoke Access</button>` : '<span class="verifier-access-ended">Access removed</span>'}</td></tr>`;
}
function attendanceHistoryRow(row, index) {
  const status = value => ['present', 'late', 'absent'].includes(value) ? value : 'unmarked';
  return `<article class="attendance-history-row">
    <div class="attendance-history-student"><strong>${esc(row.first_name+' '+row.last_name)}</strong><span>${esc(row.student_id)} &middot; MI ${esc(row.mi_number)} ${esc(String(row.mi_type || '').toUpperCase())}</span></div>
    <div class="attendance-history-transition"><span class="update-status ${status(row.previous_status)}">${esc(row.previous_status || 'Unmarked')}</span><span aria-label="changed to">&rarr;</span><span class="update-status ${status(row.status)}">${esc(row.status || 'Unmarked')}</span></div>
    <time>${esc(attendanceUpdateDate(row.verified_at))}</time>
    <button class="btn small attendance-history-view" type="button" data-view-change="${index}" aria-label="View attendance update for ${esc(row.first_name+' '+row.last_name)}">${icon('records')} View Details</button>
  </article>`;
}
function showAttendanceHistoryDetail(row, trigger) {
  const dialog = document.createElement('dialog');
  dialog.className = 'attendance-update-dialog attendance-history-dialog';
  dialog.setAttribute('aria-label', 'Attendance update details');
  dialog.innerHTML = `<header class="attendance-dialog-header"><span class="attendance-dialog-icon" aria-hidden="true">${icon('records')}</span><div><span class="attendance-eyebrow">Activity log</span><h2>Attendance update details</h2></div><button class="attendance-dialog-close" type="button" aria-label="Close details">&times;</button></header><div class="attendance-dialog-body">${attendanceChangeCard(row)}</div><footer class="attendance-dialog-footer"><span class="attendance-history-note">Saved attendance correction</span><button class="btn primary" type="button">Done</button></footer>`;
  dialog.querySelectorAll('button').forEach(button => button.onclick = () => dialog.close());
  dialog.addEventListener('close', () => { dialog.remove(); trigger?.focus(); }, { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
}
async function renderVerifierManagement(content) {
  const [data,log]=await Promise.all([API.get('/api/officer/rotc-verifiers'),API.get('/api/officer/rotc-verification-log')]);
  const state = content.verifierManagementState ||= { access:'all', search:'', historySearch:'', assignmentPage:1, historyPage:1, assignmentsOpen:true, historyOpen:true };
  content.innerHTML=`<section class="panel verifier-management-panel"><div class="section-heading verifier-section-heading"><span class="verifier-heading-icon" aria-hidden="true">${icon('platoon')}</span><div><span class="attendance-eyebrow">Attendance management</span><h2>Assign ROTC Verifiers</h2></div></div>
    <form id="verifierAssignmentForm" class="form-grid">
      <fieldset class="verifier-form-step"><legend><span>1</span> Attendance</legend><div class="verifier-step-fields">
      <div class="field full verifier-field-violet"><label for="verifierTargetCycle">Level &amp; School Year</label><select id="verifierTargetCycle" required><option value="">Select enrollment cycle</option>${data.cycles.map((cycle,i)=>`<option value="${i}">MS ${esc(cycle.ms_level)} / SY ${esc(cycle.school_year)}</option>`).join('')}</select></div>
      <div class="field verifier-field-teal"><label for="verifierMiNumber">MI Number</label><select id="verifierMiNumber" required disabled><option value="">Select enrollment cycle first</option></select><small id="verifierMiHint" hidden>Only created ROTC attendance sessions (MI 1–15) are available.</small></div>
      <div class="field verifier-field-teal"><label for="verifierMiType">Attendance Type</label><select id="verifierMiType" required disabled><option value="">Select MI first</option></select></div>
      </div></fieldset>
      <fieldset class="verifier-form-step"><legend><span>2</span> Group</legend><div class="verifier-step-fields">
      <div class="field verifier-field-violet"><label for="verifierAssignmentType">Assignment Type</label><select id="verifierAssignmentType"><option value="regular">Regular Platoon</option><option value="special">Special Platoon</option></select></div>
      <div class="field verifier-field-blue hidden" id="verifierSpecialField"><label for="verifierSpecialUnit">Special Unit</label><select id="verifierSpecialUnit">${data.specialUnits.map(unit=>`<option>${esc(unit)}</option>`).join('')}</select></div>
      <div class="field verifier-field-blue" data-regular-assignment><label for="verifierBattalion">Battalion</label><select id="verifierBattalion"><option value="1">Battalion 1</option><option value="2">Battalion 2</option></select></div>
      <div class="field verifier-field-blue" data-regular-assignment><label for="verifierCompany">Company</label><select id="verifierCompany"></select></div>
      <div class="field verifier-field-blue" data-regular-assignment><label for="verifierPlatoon">Platoon</label><select id="verifierPlatoon">${[1,2,3,4].map(i=>`<option value="${i}">Platoon ${i}</option>`).join('')}</select></div>
      </div><div id="verifierGroupWarning" class="notice error" role="status" hidden></div></fieldset>
      <fieldset class="verifier-form-step"><legend><span>3</span> Verifier</legend><div class="verifier-step-fields">
      <div class="field full verifier-field-blue"><label for="verifierCandidateSearch">Advance Course Student</label><div class="verifier-picker-search"><span aria-hidden="true">${icon('records')}</span><input id="verifierCandidateSearch" type="search" placeholder="Search by name or Student ID" autocomplete="off" aria-controls="verifierCandidate"></div><label class="verifier-picker-label" for="verifierCandidate">Select a verifier</label><select id="verifierCandidate" class="verifier-candidate-list" size="5" required aria-describedby="verifierCandidateCount"><option value="" disabled>Select a student below</option><option value="">Select verifier</option>${data.candidates.map((s,i)=>`<option value="${i}">${esc(verifierCandidateLabel(s))}</option>`).join('')}</select><small id="verifierCandidateCount" role="status" aria-live="polite"></small><small id="verifierAvailabilityHint" hidden>Already assigned. Revoke the current assignment to change its verifier.</small></div>
      </div></fieldset>
      <div class="field full verifier-submit"><button class="btn primary" type="submit" ${data.candidates.length?'':'disabled'}>Assign Verifier</button></div>
    </form>${data.candidates.length?'':'<p class="notice">No approved Advance Course students with saved cycle assignments are available.</p>'}</section>
    <section class="panel verifier-assignments-panel verifier-compact-panel"><details id="verifierAssignmentsDisclosure" ${state.assignmentsOpen?'open':''}><summary class="verifier-section-heading verifier-disclosure-heading"><span class="verifier-heading-icon teal" aria-hidden="true">${icon('users')}</span><div><span class="attendance-eyebrow">Assigned verifiers</span><h2>Verifier Assignments</h2><p>Search a verifier or filter access. Five assignments per page.</p></div><span class="verifier-assignment-count">${data.assignments.filter(a => verifierAssignmentAccess(a) === 'active').length} active</span><span class="verifier-collapse-chevron" aria-hidden="true">&#8964;</span></summary><div class="verifier-section-body"><div class="verifier-list-toolbar"><label class="field"><span>Find a verifier</span><input id="verifierAssignmentSearch" type="search" placeholder="Name, student ID, or group" value="${esc(state.search)}"></label><label class="field"><span>Access</span><select id="verifierAccessFilter"><option value="all">All assignments</option><option value="active">Active</option><option value="revoked">Revoked</option><option value="ineligible">Access blocked</option></select></label></div><div id="verifierAssignmentResults"></div><div id="verifierAssignmentPagination" class="verifier-pagination"></div></div></details></section>
    <section class="panel verifier-compact-panel verifier-history-panel" id="attendanceChanges"><details id="verifierHistoryDisclosure" ${state.historyOpen?'open':''}><summary class="verifier-section-heading verifier-disclosure-heading"><span class="verifier-heading-icon violet" aria-hidden="true">${icon('records')}</span><div><span class="attendance-eyebrow">Activity log</span><h2>Attendance Update History</h2><p>Five updates per page. Open an update for the reason and verifier.</p></div><span class="verifier-history-count">${log.length} updates</span><span class="verifier-collapse-chevron" aria-hidden="true">&#8964;</span></summary><div class="verifier-section-body"><div class="verifier-list-toolbar history"><label class="field"><span>Find an update</span><input id="verifierHistorySearch" type="search" placeholder="Student name or ID" value="${esc(state.historySearch)}"></label><button class="btn small verifier-history-refresh" id="refreshAttendanceChanges" type="button">${icon('refresh')} Refresh</button></div><div id="verifierHistoryResults" class="attendance-history-list" role="region" aria-label="Attendance updates" tabindex="0"></div><div id="verifierHistoryPagination" class="verifier-pagination"></div></div></details></section>`;
  $('#refreshAttendanceChanges').onclick=()=>renderVerifierManagement(content).catch(error=>toast(error.message,true));
  const updateCompanies=()=>{ $('#verifierCompany').innerHTML=data.companies[$('#verifierBattalion').value].map(co=>`<option>${esc(co)}</option>`).join(''); };
  const updateCandidates=()=>{
    const selected=$('#verifierCandidate').value;
    const special=$('#verifierAssignmentType').value==='special';
    const sex=$('#verifierBattalion').value==='1'?'Male':'Female';
    const cycle=data.cycles[$('#verifierTargetCycle').value];
    const assigned=data.assignments.find(a=>Number(a.active)===1&&cycle
      &&String(a.ms_level)===String(cycle.ms_level)&&a.school_year===cycle.school_year
      &&(Number(a.mi_number)===0||String(a.mi_number)===$('#verifierMiNumber').value)
      &&(!a.mi_type||String(a.mi_type).toLowerCase()===$('#verifierMiType').value)
      &&(special?a.special_unit===$('#verifierSpecialUnit').value:!a.special_unit
        &&String(a.battalion)===$('#verifierBattalion').value&&a.company===$('#verifierCompany').value
        &&String(a.platoon)===$('#verifierPlatoon').value));
    const candidates=data.candidates.map((student,index)=>({student,index})).filter(({student})=>special||student.sex===sex);
    const activeVerifiers=new Set(data.assignments.filter(a=>Number(a.active)===1).map(a=>String(a.verifier_id)));
    const available=candidates.filter(({student})=>!activeVerifiers.has(String(student.id)));
    const query = $('#verifierCandidateSearch').value;
    const matched = candidates.filter(({student}) => verifierSearchMatches(student, query));
    const selectedCandidate = candidates.find(candidate => String(candidate.index) === selected);
    // Keep an existing selection visible when the query changes.
    const visible = selectedCandidate && !matched.includes(selectedCandidate) ? [selectedCandidate, ...matched] : matched;
    $('#verifierCandidate').innerHTML='<option value="" disabled>Select a verifier</option>'+visible.map(({student:s,index})=>`<option value="${index}" ${activeVerifiers.has(String(s.id))?'disabled':''}>${esc(verifierCandidateLabel(s))}${activeVerifiers.has(String(s.id))?' (Already assigned)':''}</option>`).join('');
    $('#verifierCandidate').value = !assigned && available.some(candidate=>String(candidate.index)===selected) ? selected : '';
    $('#verifierCandidateCount').textContent = assigned ? 'This group already has a verifier.' : matched.length ? matched.length + ' matching student(s). Select a name to continue.' : 'No students match your search.';
    $('#verifierCandidateSearch').disabled = Boolean(assigned);
    $('#verifierCandidate').disabled=Boolean(assigned);
    const warning=$('#verifierGroupWarning');
    warning.hidden=!assigned;
    warning.textContent=assigned?`${special?$('#verifierSpecialUnit').value:'Battalion '+$('#verifierBattalion').value+' / '+$('#verifierCompany').value+' / Platoon '+$('#verifierPlatoon').value} already has a verifier: ${[assigned.first_name,assigned.last_name].filter(Boolean).join(' ')}. Choose another group.`:'';
    $('#verifierAvailabilityHint').hidden=Boolean(assigned)||available.length>0;
    $('#verifierAvailabilityHint').textContent='No available verifiers. Revoke an active assignment to make its student available.';
    $('#verifierAssignmentForm button[type="submit"]').disabled=!available.length||Boolean(assigned);
  };
  $('#verifierCandidateSearch').oninput = updateCandidates;
  updateCompanies(); $('#verifierBattalion').onchange=()=>{updateCompanies();updateCandidates();};
  const cycleSessions=()=>{
    const cycle=data.cycles[$('#verifierTargetCycle').value];
    return cycle ? data.sessions.filter(s=>String(s.ms_level)===String(cycle.ms_level)&&s.school_year===cycle.school_year) : [];
  };
  const updateMiTypes=()=>{
    const mi=$('#verifierMiNumber').value;
    const types=['in','out'].filter(type=>cycleSessions().some(s=>String(s.mi_number)===mi&&s.mi_type===type));
    $('#verifierMiType').innerHTML='<option value="">Select attendance type</option>'+types.map(type=>`<option value="${type}">${type.toUpperCase()}</option>`).join('');
    $('#verifierMiType').disabled=!types.length;
    updateCandidates();
  };
  $('#verifierTargetCycle').onchange=()=>{
    const numbers=[...new Set(cycleSessions().map(s=>Number(s.mi_number)))].sort((a,b)=>a-b);
    $('#verifierMiNumber').innerHTML='<option value="">Select created MI</option>'+numbers.map(mi=>`<option value="${mi}">MI ${mi}</option>`).join('');
    $('#verifierMiNumber').disabled=!numbers.length;
    $('#verifierMiHint').hidden=Boolean(numbers.length);
    $('#verifierMiHint').textContent=numbers.length?'':'No attendance sessions for this level and school year.';
    updateMiTypes();
  };
  $('#verifierMiNumber').onchange=updateMiTypes;
  $('#verifierMiType').onchange=updateCandidates;
  $('#verifierCompany').onchange=updateCandidates;
  $('#verifierPlatoon').onchange=updateCandidates;
  $('#verifierSpecialUnit').onchange=updateCandidates;
  $('#verifierAssignmentType').onchange=()=>{
    const special=$('#verifierAssignmentType').value==='special';
    $('#verifierSpecialField').classList.toggle('hidden',!special);
    $('#verifierSpecialUnit').disabled=!special;
    content.querySelectorAll('[data-regular-assignment]').forEach(field=>{
      field.classList.toggle('hidden',special);field.querySelector('select').disabled=special;
    });
    updateCandidates();
  };
  $('#verifierAssignmentType').onchange();
  $('#verifierAssignmentForm').onsubmit=async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;
    try {
      const candidate=data.candidates[$('#verifierCandidate').value];
      const cycle=data.cycles[$('#verifierTargetCycle').value];
      if(!candidate || !cycle) throw new Error('Select a student and enrollment cycle.');
      if(!$('#verifierMiNumber').value || !$('#verifierMiType').value) throw new Error('Select a created MI and attendance type.');
      const result=await API.post('/api/officer/rotc-verifiers',{verifier_id:candidate.id,ms_level:cycle.ms_level,school_year:cycle.school_year,mi_number:$('#verifierMiNumber').value,mi_type:$('#verifierMiType').value,battalion:$('#verifierBattalion').value,company:$('#verifierCompany').value,platoon:$('#verifierPlatoon').value,special_unit:$('#verifierAssignmentType').value==='special'?$('#verifierSpecialUnit').value:''});
      toast(result.message);await renderVerifierManagement(content);
    } catch(error) {toast(error.message,true);button.disabled=false;}
  };
  renderVerifierManagementLists(content,data.assignments,log,state);
  openAttendanceUpdateHistory();
}

function verifierListPage(rows, page, size=5) {
  const pages=Math.max(1,Math.ceil(rows.length/size));
  const current=Math.min(Math.max(1,page),pages);
  return {rows:rows.slice((current-1)*size,current*size),page:current,pages,total:rows.length,start:rows.length?(current-1)*size+1:0,end:Math.min(current*size,rows.length)};
}

function renderVerifierManagementLists(content,assignments,log,state) {
  const queryMatch=(values,query)=>values.join(' ').toLowerCase().includes(query.trim().toLowerCase());
  const paginate=(node,result,onChange)=>{
    node.innerHTML=`<span role="status" aria-live="polite">${result.start}&ndash;${result.end} of ${result.total}</span><div><button class="btn small" type="button" data-page-prev ${result.page===1?'disabled':''}>Previous</button><span>Page ${result.page} of ${result.pages}</span><button class="btn small" type="button" data-page-next ${result.page===result.pages?'disabled':''}>Next</button></div>`;
    node.querySelector('[data-page-prev]').onclick=()=>onChange(result.page-1);
    node.querySelector('[data-page-next]').onclick=()=>onChange(result.page+1);
  };
  const drawAssignments=()=>{
    const filtered=assignments.filter(a=>{
      const access=verifierAssignmentAccess(a);
      return (state.access==='all'||state.access===access) && queryMatch([a.first_name,a.last_name,a.student_id,verifierScope(a)],state.search);
    });
    const result=verifierListPage(filtered,state.assignmentPage);state.assignmentPage=result.page;
    const node=$('#verifierAssignmentResults');
    node.innerHTML=result.total?verifierTable(['Student','Assigned Group & Cycle','Access','Action'],result.rows.map(verifierAssignmentRow)):'<div class="verifier-list-empty"><span aria-hidden="true">&#9671;</span><strong>No matching assignments</strong><p>Try another search or choose All assignments to include revoked access.</p></div>';
    paginate($('#verifierAssignmentPagination'),result,page=>{state.assignmentPage=page;drawAssignments();});
    node.querySelectorAll('[data-revoke]').forEach(button=>button.onclick=async()=>{
      button.disabled=true;
      try {const result=await API.patch(`/api/officer/rotc-verifiers/${button.dataset.revoke}/revoke`,{});toast(result.message);await renderVerifierManagement(content);}
      catch(error){toast(error.message,true);button.disabled=false;}
    });
  };
  const drawHistory=()=>{
    const filtered=log.map((row,index)=>({row,index})).filter(({row})=>queryMatch([row.first_name,row.last_name,row.student_id],state.historySearch));
    const result=verifierListPage(filtered,state.historyPage);state.historyPage=result.page;
    const node=$('#verifierHistoryResults');
    node.innerHTML=result.total?result.rows.map(({row,index})=>attendanceHistoryRow(row,index)).join(''):'<div class="verifier-list-empty"><span aria-hidden="true">&#9672;</span><strong>No matching updates</strong><p>Try another student name or refresh to check for recent updates.</p></div>';
    node.querySelectorAll('[data-view-change]').forEach(button=>{button.onclick=()=>showAttendanceHistoryDetail(log[Number(button.dataset.viewChange)],button);});
    paginate($('#verifierHistoryPagination'),result,page=>{state.historyPage=page;drawHistory();});
  };
  $('#verifierAccessFilter').value=state.access;
  $('#verifierAccessFilter').onchange=event=>{state.access=event.target.value;state.assignmentPage=1;drawAssignments();};
  $('#verifierAssignmentSearch').oninput=event=>{state.search=event.target.value;state.assignmentPage=1;drawAssignments();};
  $('#verifierHistorySearch').oninput=event=>{state.historySearch=event.target.value;state.historyPage=1;drawHistory();};
  $('#verifierAssignmentsDisclosure').ontoggle=event=>{state.assignmentsOpen=event.target.open;};
  $('#verifierHistoryDisclosure').ontoggle=event=>{state.historyOpen=event.target.open;};
  drawAssignments();drawHistory();
}
function assignedAttendanceRow(record) {
  const key = esc(record.row_key);
  const update = attendanceUpdateDetails(record);
  return `<tr data-record="${key}">
    <td class="verifier-record-student"><strong>${esc([record.first_name,record.last_name].filter(Boolean).join(' '))}</strong><small>${esc(record.student_id)}</small><details class="verifier-record-details"><summary>Details</summary><div>MI ${esc(record.mi_number)} / ${esc(String(record.mi_type).toUpperCase())}<br>${esc(attendanceUpdateDate(record.open_date))}${update ? `<div>${update}</div>` : ''}</div></details></td>
    <td class="verifier-record-session"><strong>MI ${esc(record.mi_number)} / ${esc(String(record.mi_type).toUpperCase())}</strong><small>${esc(attendanceUpdateDate(record.open_date))}</small></td>
    <td class="verifier-record-status">${badge(record.status)}</td>
    <td class="verifier-record-history${update ? '' : ' is-empty'}">${update || '<small>No changes yet</small>'}</td>
    <td class="verifier-record-action"><button class="btn small primary" type="button" data-update="${key}" aria-label="Update attendance for ${esc([record.first_name,record.last_name].filter(Boolean).join(' '))}">Update</button></td>
  </tr>`;
}

async function renderAssignedAttendance(content, preferredAssignmentId = '') {
  const generation = (content.verifierGeneration || 0) + 1;
  content.verifierGeneration = generation;
  const assignments = await API.get('/api/student/rotc-verifier/assignments');
  if (content.verifierGeneration !== generation) return;
  if (!assignments.length) {
    content.innerHTML = '<section class="panel"><h2>My Assigned Attendance</h2><button class="btn" id="refreshVerifierRecords" type="button">Refresh</button><div class="notice">No active attendance assignment.</div></section>';
    $('#refreshVerifierRecords').onclick = () => renderAssignedAttendance(content).catch(error => toast(error.message,true));
    return;
  }
  let selectedAssignmentId = assignments.some(a => String(a.id) === String(preferredAssignmentId))
    ? String(preferredAssignmentId) : String(assignments[0].id);
  content.innerHTML = `<section class="panel"><div class="section-heading verifier-section-heading"><span class="verifier-heading-icon" aria-hidden="true">${icon('platoon')}</span><div><h2>Your assignment${assignments.length > 1 ? 's' : ''}</h2></div><button class="btn" id="refreshVerifierRecords" type="button">${icon('refresh')} Refresh</button></div><div class="verifier-assignment-boxes">${assignments.map(a => `<div class="verifier-assignment-box" data-assignment-box="${esc(a.id)}">${attendanceAssignmentCard(a)}${assignments.length > 1 ? `<button class="btn small" type="button" data-open-assignment="${esc(a.id)}" aria-pressed="false">View attendance</button>` : ''}</div>`).join('')}</div></section><section class="panel" id="verifierRecords"></section>`;
  let request = 0;
  async function load() {
    const token = ++request;
    const assignmentId = selectedAssignmentId;
    content.querySelectorAll('[data-open-assignment]').forEach(button => {
      const selected = button.dataset.openAssignment === assignmentId;
      button.setAttribute('aria-pressed', String(selected));
      button.textContent = selected ? 'Viewing attendance' : 'View attendance';
    });
    content.querySelectorAll('[data-assignment-box]').forEach(box => box.classList.toggle('selected', box.dataset.assignmentBox === assignmentId));
    $('#verifierRecords').innerHTML = '<div class="notice" role="status">Loading attendance records...</div>';
    const records = await API.get(`/api/student/rotc-verifier/assignments/${assignmentId}/records`);
    records.forEach(r => { r.row_key = r.id || `unmarked-${r.student_internal_id}-${r.session_id}`; });
    if (token !== request || content.verifierGeneration !== generation) return;
    const node = $('#verifierRecords');
    node.innerHTML = `<div class="section-heading verifier-section-heading"><span class="verifier-heading-icon teal" aria-hidden="true">${icon('attendance')}</span><div><h2>Attendance records</h2></div></div><div class="verifier-toolbar"><div class="field"><label for="verifierSearch">Find a student</label><input id="verifierSearch" type="search" placeholder="Name or student ID"></div></div>${attendanceStatusFilters(records)}${records.length ? verifierTable(['Student','Session','Attendance','Last update','Action'], records.map(assignedAttendanceRow)) : '<div class="verifier-empty"><span class="verifier-empty-symbol" aria-hidden="true">&#10003;</span><h3>No students for this assignment</h3><p>No approved students match this assigned group and session. Use Refresh to check for new records.</p></div>'}`;
    const emptySearch = document.createElement('div');
    emptySearch.className = 'notice verifier-search-empty';
    emptySearch.setAttribute('role', 'status');
    emptySearch.textContent = 'No students match your search and attendance filter.';
    emptySearch.hidden = true;
    node.append(emptySearch);
    const recordsByKey = new Map(records.map(record => [String(record.row_key), record]));
    let attendanceStatus = 'all';
    let recordPage = 1;
    const pageSize = 10;
    const pagination = document.createElement('nav');
    pagination.className = 'verifier-record-pagination';
    pagination.setAttribute('aria-label', 'Student record pages');
    node.append(pagination);
    const filterRecords = () => {
      const query = $('#verifierSearch').value;
      node.querySelectorAll('[data-attendance-status]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.attendanceStatus === attendanceStatus)));
      const matchedRows = [];
      node.querySelectorAll('[data-record]').forEach(row => {
        const record = recordsByKey.get(row.dataset.record);
        const matched = Boolean(record && verifierSearchMatches(record, query) && (attendanceStatus === 'all' || record.status === attendanceStatus));
        row.hidden = true;
        if (matched) matchedRows.push(row);
      });
      const pages = Math.max(1, Math.ceil(matchedRows.length / pageSize));
      recordPage = Math.min(recordPage, pages);
      matchedRows.slice((recordPage - 1) * pageSize, recordPage * pageSize).forEach(row => { row.hidden = false; });
      emptySearch.hidden = !records.length || matchedRows.length > 0;
      pagination.hidden = matchedRows.length <= pageSize;
      pagination.innerHTML = `<button class="btn small" type="button" data-prev ${recordPage === 1 ? 'disabled' : ''}>Previous</button><span>${recordPage} / ${pages}</span><button class="btn small" type="button" data-next ${recordPage === pages ? 'disabled' : ''}>Next</button>`;
      const prev = pagination.querySelector('[data-prev]');
      const next = pagination.querySelector('[data-next]');
      if (prev) prev.onclick = () => { recordPage--; filterRecords(); };
      if (next) next.onclick = () => { recordPage++; filterRecords(); };
    };
    $('#verifierSearch').oninput = () => { recordPage = 1; filterRecords(); };
    node.querySelectorAll('[data-attendance-status]').forEach(button => button.onclick = () => { attendanceStatus = button.dataset.attendanceStatus; recordPage = 1; filterRecords(); });
    filterRecords();
    node.querySelectorAll('[data-update]').forEach(button => button.onclick = () => {
      const record = records.find(r => String(r.row_key) === button.dataset.update);
      const dialog = document.createElement('dialog');
      dialog.className = 'attendance-update-dialog student-attendance-edit-dialog';
      dialog.setAttribute('aria-label', 'Update attendance for '+record.first_name+' '+record.last_name);
      dialog.innerHTML = `<header class="attendance-dialog-header"><div class="attendance-dialog-icon">${icon('attendance')}</div><div><span class="attendance-eyebrow">MI ${esc(record.mi_number)} ${esc(String(record.mi_type).toUpperCase())}</span><h2>Update Attendance</h2></div><button type="button" class="attendance-dialog-close" aria-label="Close">×</button></header><form><div class="attendance-dialog-body"><div class="attendance-change-top attendance-edit-student"><div><h3>${esc(record.first_name+' '+record.last_name)}</h3><span>${esc(record.student_id)}</span></div>${badge(record.status)}</div><label class="field">Status<select name="status" required>${record.status==='unmarked' ? '<option value="" selected disabled>Select attendance status</option>' : ''}${['present','late','absent'].map(status => `<option value="${status}" ${status===record.status?'selected':''}>${status[0].toUpperCase()+status.slice(1)}</option>`).join('')}</select></label><label class="field">Reason<textarea name="reason" maxlength="500" required rows="3" placeholder="Brief reason for the change"></textarea></label><div class="attendance-save-note">${icon('attendance')}<span>Changes save immediately and are logged. Marking a student&#39;s own Present submission as Absent records a false-attendance offense.</span></div><p class="attendance-save-error" role="alert" hidden></p></div><footer class="attendance-dialog-footer"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary">Save</button></footer></form>`;
      let saving = false;
      let outdated = false;
      dialog.querySelector('.attendance-dialog-footer').insertAdjacentHTML('afterbegin','<button type="button" class="btn" data-review-latest hidden>Refresh and review</button>');
      const reviewLatest = dialog.querySelector('[data-review-latest]');
      reviewLatest.onclick = async () => {
        if (saving) return;
        dialog.close();
        await reload();
      };
      const close = () => { if (!saving) dialog.close(); };
      dialog.querySelector('.attendance-dialog-close').onclick = close;
      dialog.querySelector('[data-cancel]').onclick = close;
      dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
      dialog.addEventListener('close', () => dialog.remove(), { once: true });
      dialog.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        if (saving || outdated) return;
        const form = event.target;
        const reason = form.elements.reason.value.trim();
        if (!reason) { form.elements.reason.setCustomValidity('Enter a reason.'); form.elements.reason.reportValidity(); return; }
        form.elements.reason.setCustomValidity('');
        saving = true;
        dialog.querySelectorAll('button').forEach(b => b.disabled = true);
        const submit = form.querySelector('[type="submit"]');
        submit.textContent = 'Saving…';
        try {
          const result = await API.patch(`/api/student/rotc-verifier/records/${record.id || 0}`, { assignment_id: assignmentId, status: form.elements.status.value, reason, ...(record.id ? { expected_version: Number(record.record_version) } : { student_id: record.student_internal_id, session_id: record.session_id }) });
          dialog.close(); toast(result.message);
          await renderAssignedAttendance(content,selectedAssignmentId).catch(error => {
            $('#verifierRecords').innerHTML = '<div class="notice" role="alert">Attendance saved. Could not reload the roster. Please use Refresh.</div>';
            toast(error.message,true);
          });
        } catch (error) {
          const message = form.querySelector('.attendance-save-error');
          message.hidden = false; message.textContent = error.message;
          if (error.status === 409 || error.status === 403) {
            outdated = true;
            reviewLatest.hidden = false;
          }
        } finally {
          saving = false; dialog.querySelectorAll('button').forEach(b => b.disabled = false); submit.textContent = 'Update Attendance';
          submit.disabled = outdated;
        }
      };
      dialog.querySelector('textarea').oninput = event => event.target.setCustomValidity('');
      document.body.appendChild(dialog); dialog.showModal();
    });
  }
  const refresh = () => load().catch(error => {
    if (content.verifierGeneration !== generation) return;
    $('#verifierRecords').innerHTML = '<div class="notice" role="alert">Could not load attendance records. Please try Refresh.</div>';
    toast(error.message, true);
  });
  const reload = () => renderAssignedAttendance(content,selectedAssignmentId).catch(error => {
    toast(error.message,true);
  });
  content.querySelectorAll('[data-open-assignment]').forEach(button => button.onclick = () => {
    selectedAssignmentId = button.dataset.openAssignment;
    refresh();
  });
  $('#refreshVerifierRecords').onclick = reload;
  await load();
}

document.addEventListener('DOMContentLoaded',async()=>{
  const director=document.body.dataset.role==='officer';
  try {
    const auth=await guard(director?'officer':'student');if(!auth)return;
    shell(director?'officer':'student',document.body.dataset.title,document.body.dataset.subtitle,auth);
    await (director?renderVerifierManagement:renderAssignedAttendance)($('#content'));
  } catch(error) { showPageError(error); }
});
