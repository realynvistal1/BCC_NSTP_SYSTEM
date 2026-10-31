function cwtsMatchesCycle(row, selection) {
  return Boolean(selection?.ms_level&&selection?.school_year)&&String(row.ms_level)===String(selection.ms_level)&&row.school_year===selection.school_year;
}
function cwtsMatchesHistorySession(row, selection) {
  return cwtsMatchesCycle(row,selection)&&Boolean(selection.mi_number)&&['in','out'].includes(selection.mi_type)
    &&String(row.mi_number)===String(selection.mi_number)&&String(row.mi_type).toLowerCase()===selection.mi_type;
}
const cwtsManagementState={accountSearch:'',accountPage:1,assignmentPage:1,historyPage:1,access:'all',assignmentSearch:'',historySearch:''};
function latestCwtsAssignmentSession(sessions) {
  return [...sessions].sort((a,b)=>new Date(b.open_date).getTime()-new Date(a.open_date).getTime()||Number(b.id)-Number(a.id))[0];
}
function bindCwtsSessionFilters(sessions,hasInstructor,assignments=[],instructors=[],onSessionChange=()=>{},savedSelection={}){
  const fields=['#cwtsAssignLevel','#cwtsAssignYear','#cwtsAssignNumber','#cwtsAssignType','#cwtsAssignSession'].map(selector=>$(selector));
  const keys=['ms_level','school_year','mi_number','mi_type','id'];
  const prompts=['Select CWTS level','Select school year','Select CS number','Select IN or OUT','Select session date'];
  const button=$('#cwtsAssignForm').querySelector('button');
  const form=$('#cwtsAssignForm');
  const instructorSelect=form.elements.instructor_id;
  const companySelect=form.elements.company;
  const warning=document.createElement('div');
  warning.className='cwts-note warning';warning.hidden=true;warning.setAttribute('role','status');
  companySelect.closest('label').after(warning);
  const activeInstructors=new Set(assignments.filter(a=>Number(a.active)===1).map(a=>String(a.instructor_id)));
  function availability(){
    const search = $('#cwtsInstructorSearch');
    const query = String(search?.value || '').trim().toLowerCase();
    const selected = instructorSelect.value;
    const matches = instructors.filter(i => i.status !== 'disabled' && (i.first_name + ' ' + i.last_name).toLowerCase().includes(query));
    instructorSelect.innerHTML = '<option value="" disabled>Select an instructor</option>' + matches.map(i => '<option value="' + i.id + '">' + esc(i.first_name + ' ' + i.last_name) + '</option>').join('');
    instructorSelect.value = matches.some(i => String(i.id) === selected) ? selected : '';
    if ($('#cwtsInstructorMatches')) $('#cwtsInstructorMatches').textContent = query && !matches.length ? 'No instructors match your search.' : '';
    const occupied=assignments.find(a=>Number(a.active)===1&&String(a.attendance_session_id)===fields[4].value&&a.company===companySelect.value);
    for(const option of instructorSelect.options){
      if(!option.value)continue;
      option.disabled=activeInstructors.has(option.value);
      const instructor=instructors.find(i=>String(i.id)===option.value);
      if(instructor)option.textContent=instructor.first_name+' '+instructor.last_name;
    }
    if(activeInstructors.has(instructorSelect.value)||occupied)instructorSelect.value='';
    instructorSelect.disabled=Boolean(occupied);
    if ($('#cwtsInstructorSearch')) $('#cwtsInstructorSearch').disabled=Boolean(occupied);
    const available=instructors.some(i=>i.status!=='disabled'&&!activeInstructors.has(String(i.id)));
    warning.hidden=!occupied&&available;
    warning.textContent=occupied?`Company ${occupied.company} already has an instructor: ${occupied.first_name} ${occupied.last_name}. Choose another company.`:instructors.some(i=>i.status!=='disabled') ? 'All instructors are assigned. Revoke an assignment to free one.' : 'Invite an instructor to get started.';
    button.disabled=!hasInstructor||!fields[4].value||!companySelect.value||!instructorSelect.value||Boolean(occupied);
  }
  function update(from){
    for(let i=from;i<fields.length;i++){
      const matches=sessions.filter(s=>keys.slice(0,i).every((key,j)=>fields[j].value&&String(s[key])===fields[j].value));
      if(i===4){
        fields[i].value=String(latestCwtsAssignmentSession(matches)?.id||'');
        continue;
      }
      const values=[...new Set(matches.map(s=>String(s[keys[i]])))];
      if(i<3)values.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      const label=value=>i===0?`CWTS ${value}`:i===2?`CS ${value}`:i===3?value.toUpperCase():i===4?`${attendanceUpdateDate(matches.find(s=>String(s.id)===value).open_date)} (Session #${value})`:value;
      fields[i].innerHTML=`<option value="">${prompts[i]}</option>`+values.map(value=>`<option value="${esc(value)}">${esc(label(value))}</option>`).join('');
      fields[i].disabled=!values.length;
      if(i===4&&values.length===1)fields[i].value=values[0];
    }
    button.disabled=!hasInstructor||!fields[4].value;
    $('#cwtsSessionHint').textContent=!sessions.length?'Create a CWTS attendance session first.':'';
    $('#cwtsSessionHint').hidden=Boolean(sessions.length);
    availability();
    onSessionChange(Object.fromEntries(keys.slice(0,4).map((key,i)=>[key,fields[i].value])));
  }
  fields.forEach((field,i)=>field.onchange=()=>update(i+1));
  companySelect.onchange=availability;
  instructorSelect.onchange=availability;
  if ($('#cwtsInstructorSearch')) $('#cwtsInstructorSearch').oninput=availability;
  update(0);
  for(let i=0;i<4;i++){
    const saved=String(savedSelection[keys[i]]||'');
    if(!saved||!Array.from(fields[i].options).some(option=>option.value===saved))break;
    fields[i].value=saved;update(i+1);
  }
}
function cwtsSessionLabel(s){return `CS ${s.mi_number} ${String(s.mi_type).toUpperCase()} · CWTS ${s.ms_level} · ${s.school_year} · ${attendanceUpdateDate(s.open_date)}`;}
function cwtsPage(rows,page){const pages=Math.max(1,Math.ceil(rows.length/5));page=Math.min(Math.max(1,page),pages);return {rows:rows.slice((page-1)*5,page*5),page,pages,total:rows.length};}
function cwtsPager(node,page,onPage){
  node.innerHTML=`<span role="status">${page.total?((page.page-1)*5+1):0}–${Math.min(page.page*5,page.total)} of ${page.total}</span><div><button class="btn small" data-prev ${page.page===1?'disabled':''}>Previous</button><span>Page ${page.page} of ${page.pages}</span><button class="btn small" data-next ${page.page===page.pages?'disabled':''}>Next</button></div>`;
  node.querySelector('[data-prev]').onclick=()=>onPage(page.page-1);node.querySelector('[data-next]').onclick=()=>onPage(page.page+1);
}
async function renderCwtsInstructors(){
  const content=$('#content');const generation=(content.cwtsGeneration||0)+1;content.cwtsGeneration=generation;
  const data=await API.get('/api/officer/cwts-instructors');
  let log=[],historyRequest=0;
  if(content.cwtsGeneration!==generation)return;
  const enabled=data.instructors.filter(i=>i.status!=='disabled');
  const heading=(n,title,copy)=>`<div class="cwts-heading"><span class="cwts-step">${n}</span><div><h2>${title}</h2><p>${copy}</p></div></div>`;
  content.innerHTML=`<div class="cwts-workspace">${!data.email_ready?'<div class="cwts-note warning" role="status">Email invitations are not ready. Ask the system administrator to connect email delivery and the school website address. Existing instructor assignments can still be managed.</div>':''}
    <div class="cwts-two-column"><section class="panel cwts-mint">${heading('1','Invite an instructor','Their own account, using the existing CWTS login.')}
    <form id="cwtsInviteForm" class="cwts-form"><label class="field">First name<input name="first_name" maxlength="100" autocomplete="given-name" required></label><label class="field">Last name<input name="last_name" maxlength="100" autocomplete="family-name" required></label><label class="field">Instructor email<input name="email" type="email" maxlength="255" autocomplete="email" required></label><p class="cwts-help">Password setup link expires in 24 hours.</p><button class="btn primary" ${data.email_ready?'':'disabled'}>Create account &amp; send invitation</button></form></section>
    <section class="panel cwts-violet">${heading('2','Assign company attendance','Choose the instructor for one company and CS IN/OUT session.')}
    <form id="cwtsAssignForm" class="cwts-form"><div class="cwts-session-fields"><label class="field">CWTS level<select id="cwtsAssignLevel" required></select></label><label class="field">School year<select id="cwtsAssignYear" required disabled></select></label><label class="field">CS number<select id="cwtsAssignNumber" required disabled></select></label><label class="field">Attendance type<select id="cwtsAssignType" required disabled></select></label></div><input type="hidden" name="session_id" id="cwtsAssignSession"><label class="field">Company<select name="company" required><option value="">Select company</option>${data.companies.map(c=>`<option value="${esc(c)}">Company ${esc(c)}</option>`).join('')}</select></label><div class="field"><label for="cwtsInstructorSearch">Instructor</label><div class="cwts-connected-picker"><div class="cwts-instructor-search"><span aria-hidden="true">${icon('records')}</span><input id="cwtsInstructorSearch" type="search" placeholder="Search instructor name" autocomplete="off" aria-controls="cwtsInstructorPicker"></div><label class="cwts-picker-label" for="cwtsInstructorPicker">Select an instructor</label><select id="cwtsInstructorPicker" name="instructor_id" size="5" required aria-describedby="cwtsInstructorMatches"><option value="" disabled selected>Select an instructor</option>${enabled.map(i=>`<option value="${i.id}">${esc(i.first_name+' '+i.last_name)}</option>`).join('')}</select></div><small id="cwtsInstructorMatches" role="status" aria-live="polite"></small></div><p class="cwts-help" id="cwtsSessionHint" role="status"></p><button class="btn primary" ${enabled.length&&data.sessions.length?'':'disabled'}>Save assignment</button></form></section></div>
    <section class="panel cwts-blue"><details open><summary class="cwts-heading"><div><h2>Instructor accounts</h2><p>${data.instructors.length} accounts · invitation delivery and access</p></div></summary><div class="cwts-toolbar"><label>Find an instructor<input id="cwtsAccountSearch" type="search" placeholder="Search instructor name" value="${esc(cwtsManagementState.accountSearch)}"></label><button class="btn" id="cwtsRefresh">Refresh</button></div><div id="cwtsAccounts"></div><div class="cwts-pagination" id="cwtsAccountPages"></div></details></section>
    <div class="cwts-management-lists">
    <section class="panel cwts-mint"><details open><summary class="cwts-heading"><span class="cwts-list-icon" aria-hidden="true">${icon('users')}</span><div><span class="cwts-list-eyebrow">Assigned instructors</span><h2>Company assignments</h2><p>Each assignment is limited to the selected company and session.</p></div><span class="cwts-list-count" id="cwtsAssignmentCount">0 active</span></summary><div class="cwts-toolbar"><label>Find an instructor<input id="cwtsAssignmentSearch" type="search" placeholder="Search instructor name" value="${esc(cwtsManagementState.assignmentSearch)}"></label><label>Access<select id="cwtsAssignmentFilter"><option value="all">All assignments</option><option value="active">Active</option><option value="pending">Awaiting invitation</option><option value="disabled">Account disabled</option><option value="revoked">Revoked</option></select></label></div><div id="cwtsAssignments"></div><div class="cwts-pagination" id="cwtsAssignmentPages"></div></details></section>
    <section class="panel cwts-violet" id="attendanceChanges"><details open><summary class="cwts-heading"><span class="cwts-list-icon" aria-hidden="true">${icon('records')}</span><div><span class="cwts-list-eyebrow">Activity log</span><h2>CWTS attendance updates</h2><p>Latest ${log.length} updates · five per page</p></div><span class="cwts-list-count" id="cwtsHistoryCount">0 updates</span></summary><div class="cwts-toolbar"><label>Find an update<input id="cwtsHistorySearch" type="search" placeholder="Student name or ID" value="${esc(cwtsManagementState.historySearch)}"></label><button class="btn small" id="cwtsHistoryRefresh" type="button">${icon('refresh')} Refresh</button></div><div id="cwtsHistory"></div><div class="cwts-pagination" id="cwtsHistoryPages"></div></details></section></div></div>`;
  const mutate=async(button,url,body,method='patch')=>{
    button.disabled=true;
    try{const result=await API[method](url,body);toast(result.message);await renderCwtsInstructors();}
    catch(error){toast(error.message,true);button.disabled=false;}
  };
  function drawAccounts(){
    const query=cwtsManagementState.accountSearch.trim().toLowerCase();
    const page=cwtsPage(data.instructors.filter(i=>`${i.first_name} ${i.last_name}`.toLowerCase().includes(query)),cwtsManagementState.accountPage);cwtsManagementState.accountPage=page.page;
    $('#cwtsAccounts').innerHTML=table(['Instructor','Account','Invitation','Actions'],page.rows.map(i=>{
      const expired=i.delivery_status==='sent'&&Number(i.invitation_expires)<Date.now();
      const delivery=expired?'Link expired':({not_sent:'Not sent',sent:'Sent',failed:'Delivery failed',accepted:'Password set'}[i.delivery_status]||'Not sent');
      return `<tr><td><strong>${esc(i.first_name+' '+i.last_name)}</strong><small>${esc(i.email)}</small></td><td><span class="cwts-badge ${i.status}">${i.status==='pending'?'Invitation pending':i.status==='active'?'Active':'Disabled'}</span></td><td><span class="cwts-badge ${expired?'pending':i.delivery_status}">${delivery}</span>${i.delivery_status==='sent'&&!expired?'<small>Link valid for 24 hours from sending</small>':''}</td><td><div class="cwts-actions">${i.status!=='disabled'?`<button class="btn small" data-invite="${i.id}" ${data.email_ready?'':'disabled'}>${i.status==='active'?'Send password setup link':'Send invitation'}</button>`:''}<button class="btn small ${i.status==='disabled'?'':'danger'}" data-account="${i.id}" data-status="${i.status==='disabled'?'active':'disabled'}">${i.status==='disabled'?'Enable account':'Disable account'}</button></div></td></tr>`;
    }));
    cwtsPager($('#cwtsAccountPages'),page,p=>{cwtsManagementState.accountPage=p;drawAccounts();});
    $('#cwtsAccounts').querySelectorAll('[data-invite]').forEach(b=>b.onclick=()=>mutate(b,`/api/officer/cwts-instructors/${b.dataset.invite}/invitation`,{},'post'));
    $('#cwtsAccounts').querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>mutate(b,`/api/officer/cwts-instructors/${b.dataset.account}/status`,{status:b.dataset.status}));
  }
  function drawAssignments(){
    const count=$('#cwtsAssignmentCount');if(count)count.textContent=data.assignments.filter(a=>cwtsMatchesCycle(a,cwtsManagementState.session)&&Number(a.active)===1&&a.instructor_status==='active').length+' active';
    const access=a=>Number(a.active)?a.instructor_status:'revoked';
    const page=cwtsPage(data.assignments.filter(a=>cwtsMatchesCycle(a,cwtsManagementState.session)&&(cwtsManagementState.access==='all'||access(a)===cwtsManagementState.access)&&[a.first_name,a.last_name].join(' ').toLowerCase().includes(cwtsManagementState.assignmentSearch.trim().toLowerCase())),cwtsManagementState.assignmentPage);cwtsManagementState.assignmentPage=page.page;
    $('#cwtsAssignments').innerHTML=page.rows.length?table(['Instructor','Company & session','Access','Action'],page.rows.map(a=>`<tr><td><strong>${esc(a.first_name+' '+a.last_name)}</strong></td><td><div class="cwts-assigned-company">${icon('platoon')}<strong>Company ${esc(a.company)}</strong></div><div class="cwts-session-tags"><span>CWTS ${esc(a.ms_level)}</span><span>SY ${esc(a.school_year)}</span><span>CS ${esc(a.mi_number)} / ${esc(a.mi_type.toUpperCase())}</span></div></td><td><span class="cwts-badge ${access(a)}">${esc(access(a)==='pending'?'Awaiting invitation':access(a))}</span></td><td>${Number(a.active)?`<button class="btn small" data-revoke-cwts="${a.id}">${icon('logout')} Revoke Access</button>`:'Access removed'}</td></tr>`)):'<div class="cwts-list-empty"><span aria-hidden="true">&#9671;</span><strong>No matching assignments</strong><p>Try another search or choose All assignments.</p></div>';
    cwtsPager($('#cwtsAssignmentPages'),page,p=>{cwtsManagementState.assignmentPage=p;drawAssignments();});
    $('#cwtsAssignments').querySelectorAll('[data-revoke-cwts]').forEach(b=>b.onclick=()=>mutate(b,`/api/officer/cwts-instructor-assignments/${b.dataset.revokeCwts}/revoke`,{}));
  }
  function drawHistory(){
    const count=$('#cwtsHistoryCount');if(count)count.textContent=log.filter(r=>cwtsMatchesHistorySession(r,cwtsManagementState.session)).length+' updates';
    const page=cwtsPage(log.filter(r=>cwtsMatchesHistorySession(r,cwtsManagementState.session)&&[r.first_name,r.last_name,r.student_id].join(' ').toLowerCase().includes(cwtsManagementState.historySearch.trim().toLowerCase())),cwtsManagementState.historyPage);cwtsManagementState.historyPage=page.page;
    $('#cwtsHistory').innerHTML=page.rows.length?page.rows.map(r=>`<article class="attendance-history-row"><div class="attendance-history-student"><strong>${esc(r.first_name+' '+r.last_name)}</strong><span>Company ${esc(r.company)} · CS ${r.mi_number} ${esc(r.mi_type.toUpperCase())}</span></div><div class="attendance-history-transition">${badge(r.previous_status)} &rarr; ${badge(r.status)}</div><time>${esc(attendanceUpdateDate(r.verified_at))}</time><button class="btn small" data-history="${r.id}">${icon('records')} View Details</button></article>`).join(''):'<div class="cwts-list-empty"><span aria-hidden="true">&#9672;</span><strong>No matching updates</strong><p>Select CWTS level, school year, CS number, and IN or OUT above.</p></div>';
    cwtsPager($('#cwtsHistoryPages'),page,p=>{cwtsManagementState.historyPage=p;drawHistory();});
    $('#cwtsHistory').querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>{
      const row=log.find(r=>String(r.id)===b.dataset.history);const dialog=document.createElement('dialog');dialog.className='attendance-update-dialog';dialog.setAttribute('aria-label','CWTS attendance update');
      dialog.innerHTML=`<div class="attendance-dialog-body">${attendanceChangeCard(row)}</div><footer class="attendance-dialog-footer"><span>Saved attendance correction</span><button class="btn primary">Done</button></footer>`;
      dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.remove();b.focus();},{once:true});document.body.appendChild(dialog);dialog.showModal();
    });
  }
  $('#cwtsInviteForm').onsubmit=async event=>{
    event.preventDefault();const form=event.target,b=form.querySelector('button');b.disabled=true;b.textContent='Sending invitation…';
    try{const result=await API.post('/api/officer/cwts-instructors',Object.fromEntries(new FormData(form)));toast(result.message);form.reset();}
    catch(error){toast(error.message,true);}
    finally{await renderCwtsInstructors().catch(error=>toast(error.message,true));b.disabled=false;b.textContent='Create account & send invitation';}
  };
  const restoreSelection={...cwtsManagementState.session};
  bindCwtsSessionFilters(data.sessions,enabled.length>0,data.assignments,enabled,selection=>{
    cwtsManagementState.session=selection;cwtsManagementState.historyPage=1;cwtsManagementState.assignmentPage=1;
    const request=++historyRequest;log=[];drawHistory();drawAssignments();
    if(!selection.ms_level||!selection.school_year||!selection.mi_number||!selection.mi_type)return;
    API.get('/api/officer/cwts-verification-log?'+new URLSearchParams(selection)).then(rows=>{
      if(request!==historyRequest||content.cwtsGeneration!==generation)return;
      log=rows;drawHistory();
    }).catch(error=>{if(request===historyRequest&&content.cwtsGeneration===generation)toast(error.message,true);});
  },restoreSelection);
  $('#cwtsAssignForm').onsubmit=event=>{event.preventDefault();mutate(event.target.querySelector('button'),'/api/officer/cwts-instructor-assignments',Object.fromEntries(new FormData(event.target)),'post');};
  $('#cwtsRefresh').onclick=()=>renderCwtsInstructors().catch(error=>toast(error.message,true));
  $('#cwtsAccountSearch').oninput=e=>{cwtsManagementState.accountSearch=e.target.value;cwtsManagementState.accountPage=1;drawAccounts();};
  $('#cwtsAssignmentFilter').value=cwtsManagementState.access;
  $('#cwtsAssignmentFilter').onchange=e=>{cwtsManagementState.access=e.target.value;cwtsManagementState.assignmentPage=1;drawAssignments();};
  $('#cwtsAssignmentSearch').oninput=e=>{cwtsManagementState.assignmentSearch=e.target.value;cwtsManagementState.assignmentPage=1;drawAssignments();};
  $('#cwtsHistorySearch').oninput=e=>{cwtsManagementState.historySearch=e.target.value;cwtsManagementState.historyPage=1;drawHistory();};
  $('#cwtsHistoryRefresh').onclick=()=>renderCwtsInstructors().catch(error=>toast(error.message,true));
  drawAccounts();drawAssignments();drawHistory();
  openAttendanceUpdateHistory();
}
document.addEventListener('DOMContentLoaded',async()=>{
  try{const auth=await guard('officer');if(!auth)return;shell('officer','CWTS Instructors','Invite instructors and assign attendance by company and session.',auth);await renderCwtsInstructors();}catch(error){showPageError(error);}
});
