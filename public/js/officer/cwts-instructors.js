const cwtsManagementState={accountSearch:'',accountPage:1,assignmentPage:1,historyPage:1,access:'all'};
function bindCwtsSessionFilters(sessions,hasInstructor,assignments=[],instructors=[]){
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
    const occupied=assignments.find(a=>Number(a.active)===1&&String(a.attendance_session_id)===fields[4].value&&a.company===companySelect.value);
    for(const option of instructorSelect.options){
      if(!option.value)continue;
      option.disabled=activeInstructors.has(option.value);
      const instructor=instructors.find(i=>String(i.id)===option.value);
      if(instructor)option.textContent=`${instructor.first_name} ${instructor.last_name}${option.disabled?' (Already assigned)':instructor.status==='pending'?' — invitation pending':''}`;
    }
    if(activeInstructors.has(instructorSelect.value)||occupied)instructorSelect.value='';
    instructorSelect.disabled=Boolean(occupied);
    const available=Array.from(instructorSelect.options).some(o=>o.value&&!o.disabled);
    warning.hidden=!occupied&&available;
    warning.textContent=occupied?`Company ${occupied.company} already has an instructor: ${occupied.first_name} ${occupied.last_name}. Choose another company.`:'No available instructors. Revoke an active assignment to make its instructor available.';
    button.disabled=!hasInstructor||!fields[4].value||!companySelect.value||!instructorSelect.value||Boolean(occupied);
  }
  function update(from){
    for(let i=from;i<fields.length;i++){
      const matches=sessions.filter(s=>keys.slice(0,i).every((key,j)=>fields[j].value&&String(s[key])===fields[j].value));
      const values=[...new Set(matches.map(s=>String(s[keys[i]])))];
      if(i<3)values.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      const label=value=>i===0?`CWTS ${value}`:i===2?`CS ${value}`:i===3?value.toUpperCase():i===4?`${attendanceUpdateDate(matches.find(s=>String(s.id)===value).open_date)} (Session #${value})`:value;
      fields[i].innerHTML=`<option value="">${prompts[i]}</option>`+values.map(value=>`<option value="${esc(value)}">${esc(label(value))}</option>`).join('');
      fields[i].disabled=!values.length;
      if(i===4&&values.length===1)fields[i].value=values[0];
    }
    button.disabled=!hasInstructor||!fields[4].value;
    $('#cwtsSessionHint').textContent=!sessions.length?'No CWTS sessions available. Create one in Create Attendance, then refresh this page.':fields[4].value?'This assignment applies only to the selected company and exact session.':'Choose the level, school year, CS number and IN/OUT type. Only created sessions are listed.';
    availability();
  }
  fields.forEach((field,i)=>field.onchange=()=>update(i+1));
  companySelect.onchange=availability;
  instructorSelect.onchange=availability;
  update(0);
}
function cwtsSessionLabel(s){return `CS ${s.mi_number} ${String(s.mi_type).toUpperCase()} · CWTS ${s.ms_level} · ${s.school_year} · ${attendanceUpdateDate(s.open_date)}`;}
function cwtsPage(rows,page){const pages=Math.max(1,Math.ceil(rows.length/5));page=Math.min(Math.max(1,page),pages);return {rows:rows.slice((page-1)*5,page*5),page,pages,total:rows.length};}
function cwtsPager(node,page,onPage){
  node.innerHTML=`<span role="status">${page.total?((page.page-1)*5+1):0}–${Math.min(page.page*5,page.total)} of ${page.total}</span><div><button class="btn small" data-prev ${page.page===1?'disabled':''}>Previous</button><span>Page ${page.page} of ${page.pages}</span><button class="btn small" data-next ${page.page===page.pages?'disabled':''}>Next</button></div>`;
  node.querySelector('[data-prev]').onclick=()=>onPage(page.page-1);node.querySelector('[data-next]').onclick=()=>onPage(page.page+1);
}
async function renderCwtsInstructors(){
  const content=$('#content');const generation=(content.cwtsGeneration||0)+1;content.cwtsGeneration=generation;
  const [data,log]=await Promise.all([API.get('/api/officer/cwts-instructors'),API.get('/api/officer/cwts-verification-log')]);
  if(content.cwtsGeneration!==generation)return;
  const enabled=data.instructors.filter(i=>i.status!=='disabled');
  const heading=(n,title,copy)=>`<div class="cwts-heading"><span class="cwts-step">${n}</span><div><h2>${title}</h2><p>${copy}</p></div></div>`;
  content.innerHTML=`<div class="cwts-workspace">${!data.email_ready?'<div class="cwts-note warning" role="status">Email invitations are not ready. Ask the system administrator to connect email delivery and the school website address. Existing instructor assignments can still be managed.</div>':''}
    <div class="cwts-two-column"><section class="panel cwts-mint">${heading('1','Invite an instructor','Their own account, using the existing CWTS login.')}
    <form id="cwtsInviteForm" class="cwts-form"><label class="field">First name<input name="first_name" maxlength="100" autocomplete="given-name" required></label><label class="field">Last name<input name="last_name" maxlength="100" autocomplete="family-name" required></label><label class="field">Instructor email<input name="email" type="email" maxlength="255" autocomplete="email" required></label><p class="cwts-help">The email contains a one-time link to set a password, valid for 24 hours. Only the instructor chooses their password.</p><button class="btn primary" ${data.email_ready?'':'disabled'}>Create account &amp; send invitation</button></form></section>
    <section class="panel cwts-violet">${heading('2','Assign company attendance','Choose the instructor for one company and CS IN/OUT session.')}
    <form id="cwtsAssignForm" class="cwts-form"><label class="field">Instructor<select name="instructor_id" required><option value="">Select instructor</option>${enabled.map(i=>`<option value="${i.id}">${esc(i.first_name+' '+i.last_name)}${i.status==='pending'?' — invitation pending':''}</option>`).join('')}</select></label><label class="field">Company<select name="company" required><option value="">Select company</option>${data.companies.map(c=>`<option value="${esc(c)}">Company ${esc(c)}</option>`).join('')}</select></label><div class="cwts-session-fields"><label class="field">CWTS level<select id="cwtsAssignLevel" required></select></label><label class="field">School year<select id="cwtsAssignYear" required disabled></select></label><label class="field">CS number<select id="cwtsAssignNumber" required disabled></select></label><label class="field">Attendance type<select id="cwtsAssignType" required disabled></select></label></div><label class="field">Session date<select name="session_id" id="cwtsAssignSession" required disabled></select></label><p class="cwts-help" id="cwtsSessionHint" role="status"></p><div class="cwts-note">One active assignment per instructor. Revoke an assignment before changing its instructor.</div>${!data.sessions.length?'<p class="cwts-help">Create a CWTS attendance session first.</p>':''}<button class="btn primary" ${enabled.length&&data.sessions.length?'':'disabled'}>Save assignment</button></form></section></div>
    <section class="panel cwts-blue"><details open><summary class="cwts-heading"><div><h2>Instructor accounts</h2><p>${data.instructors.length} accounts · invitation delivery and access</p></div></summary><div class="cwts-toolbar"><label>Find an instructor<input id="cwtsAccountSearch" type="search" placeholder="Name or email" value="${esc(cwtsManagementState.accountSearch)}"></label><button class="btn" id="cwtsRefresh">Refresh</button></div><div id="cwtsAccounts"></div><div class="cwts-pagination" id="cwtsAccountPages"></div></details></section>
    <section class="panel cwts-mint"><details open><summary class="cwts-heading"><div><h2>Company assignments</h2><p>Each assignment is limited to the selected company and session.</p></div></summary><div class="cwts-toolbar"><label>Assignment access<select id="cwtsAssignmentFilter"><option value="all">All assignments</option><option value="active">Active</option><option value="pending">Awaiting invitation</option><option value="disabled">Account disabled</option><option value="revoked">Revoked</option></select></label></div><div id="cwtsAssignments"></div><div class="cwts-pagination" id="cwtsAssignmentPages"></div></details></section>
    <section class="panel cwts-violet" id="attendanceChanges"><details open><summary class="cwts-heading"><div><h2>CWTS attendance updates</h2><p>Latest ${log.length} updates · five per page</p></div></summary><div id="cwtsHistory"></div><div class="cwts-pagination" id="cwtsHistoryPages"></div></details></section></div>`;
  const mutate=async(button,url,body,method='patch')=>{
    button.disabled=true;
    try{const result=await API[method](url,body);toast(result.message);await renderCwtsInstructors();}
    catch(error){toast(error.message,true);button.disabled=false;}
  };
  function drawAccounts(){
    const query=cwtsManagementState.accountSearch.trim().toLowerCase();
    const page=cwtsPage(data.instructors.filter(i=>`${i.first_name} ${i.last_name} ${i.email}`.toLowerCase().includes(query)),cwtsManagementState.accountPage);cwtsManagementState.accountPage=page.page;
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
    const access=a=>Number(a.active)?a.instructor_status:'revoked';
    const page=cwtsPage(data.assignments.filter(a=>cwtsManagementState.access==='all'||access(a)===cwtsManagementState.access),cwtsManagementState.assignmentPage);cwtsManagementState.assignmentPage=page.page;
    $('#cwtsAssignments').innerHTML=table(['Instructor','Company & session','Access','Action'],page.rows.map(a=>`<tr><td><strong>${esc(a.first_name+' '+a.last_name)}</strong></td><td><strong>Company ${esc(a.company)}</strong><small>${esc(cwtsSessionLabel(a))}</small></td><td><span class="cwts-badge ${access(a)}">${esc(access(a)==='pending'?'Awaiting invitation':access(a))}</span></td><td>${Number(a.active)?`<button class="btn small" data-revoke-cwts="${a.id}">Revoke assignment</button>`:'Access removed'}</td></tr>`));
    cwtsPager($('#cwtsAssignmentPages'),page,p=>{cwtsManagementState.assignmentPage=p;drawAssignments();});
    $('#cwtsAssignments').querySelectorAll('[data-revoke-cwts]').forEach(b=>b.onclick=()=>mutate(b,`/api/officer/cwts-instructor-assignments/${b.dataset.revokeCwts}/revoke`,{}));
  }
  function drawHistory(){
    const page=cwtsPage(log,cwtsManagementState.historyPage);cwtsManagementState.historyPage=page.page;
    $('#cwtsHistory').innerHTML=page.rows.length?page.rows.map(r=>`<article class="attendance-history-row"><div class="attendance-history-student"><strong>${esc(r.first_name+' '+r.last_name)}</strong><span>Company ${esc(r.company)} · CS ${r.mi_number} ${esc(r.mi_type.toUpperCase())}</span></div><div class="attendance-history-transition">${badge(r.previous_status)} &rarr; ${badge(r.status)}</div><time>${esc(attendanceUpdateDate(r.verified_at))}</time><button class="btn small" data-history="${r.id}">View details</button></article>`).join(''):'<div class="cwts-note">No instructor corrections yet.</div>';
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
  bindCwtsSessionFilters(data.sessions,enabled.length>0,data.assignments,enabled);
  $('#cwtsAssignForm').onsubmit=event=>{event.preventDefault();mutate(event.target.querySelector('button'),'/api/officer/cwts-instructor-assignments',Object.fromEntries(new FormData(event.target)),'post');};
  $('#cwtsRefresh').onclick=()=>renderCwtsInstructors().catch(error=>toast(error.message,true));
  $('#cwtsAccountSearch').oninput=e=>{cwtsManagementState.accountSearch=e.target.value;cwtsManagementState.accountPage=1;drawAccounts();};
  $('#cwtsAssignmentFilter').value=cwtsManagementState.access;
  $('#cwtsAssignmentFilter').onchange=e=>{cwtsManagementState.access=e.target.value;cwtsManagementState.assignmentPage=1;drawAssignments();};
  drawAccounts();drawAssignments();drawHistory();
  openAttendanceUpdateHistory();
}
document.addEventListener('DOMContentLoaded',async()=>{
  try{const auth=await guard('officer');if(!auth)return;shell('officer','CWTS Instructors','Invite instructors and assign attendance by company and session.',auth);await renderCwtsInstructors();}catch(error){showPageError(error);}
});
