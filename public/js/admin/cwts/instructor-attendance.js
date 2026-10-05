let cwtsInstructorGeneration=0,cwtsSelectedAssignment='',cwtsStudentSearch='',cwtsStudentPage=1;
function cwtsAssignmentCard(a,selected,multiple){
  return `<article class="attendance-assignment-card cwts-duty-card ${selected?'selected':''}"><div class="cwts-duty-title"><div><span class="attendance-eyebrow">Assigned company</span><h3>Company ${esc(a.company)}</h3></div>${multiple?`<button type="button" class="btn small" data-cwts-assignment="${esc(a.id)}" aria-pressed="${selected}">${selected?'Viewing attendance':'View attendance'}</button>`:''}</div><dl class="attendance-assignment-details"><div class="cwts-duty-session"><dt>Attendance session</dt><dd>CS ${esc(a.mi_number)} <span class="cwts-duty-type">${esc(String(a.mi_type).toUpperCase())}</span></dd></div><div class="cwts-duty-cycle"><dt>Level &amp; school year</dt><dd>CWTS ${esc(a.ms_level)} &middot; ${esc(a.school_year)}</dd></div><div class="cwts-duty-date"><dt>Session date</dt><dd>${esc(attendanceUpdateDate(a.open_date))}</dd></div></dl></article>`;
}
function cwtsInstructorView(assignments,selected,rows){
  const heading=(symbol,kicker,title,copy)=>`<span class="verifier-heading-icon teal" aria-hidden="true">${icon(symbol)}</span><div><span class="attendance-eyebrow">${kicker}</span><h2>${title}</h2><p>${copy}</p></div>`;
  return `<div class="cwts-workspace cwts-verifier-workspace">
    <section class="panel cwts-mint"><div class="verifier-section-heading">${heading('platoon','Your attendance duty','Your assignments','Your assigned company and attendance session.')}<button class="btn" id="cwtsRefreshAssigned" type="button">${icon('refresh')} Refresh</button></div>
    ${selected?`<div class="cwts-assignment-cards">${assignments.map(a=>cwtsAssignmentCard(a,String(a.id)===String(selected.id),assignments.length>1)).join('')}</div>`:'<div class="verifier-empty"><span class="verifier-empty-symbol" aria-hidden="true">&#9671;</span><h3>No active assignments yet</h3><p>The NSTP Director will assign your company and session here. Refresh to check for updates.</p></div>'}</section>
    ${selected?`<section class="panel cwts-blue"><div class="verifier-section-heading">${heading('attendance','Company roster','Attendance records','Check physical attendance. Enter a reason for each correction.')}</div>
    <div class="verifier-summary"><span class="verifier-stat total"><span class="verifier-stat-icon" aria-hidden="true">${icon('users')}</span><span><strong>${rows.length}</strong><small>Students</small></span></span>${['present','late','absent','unmarked'].map(status=>`<span class="verifier-stat ${status}"><span class="verifier-stat-dot" aria-hidden="true"></span><span><strong>${rows.filter(r=>r.status===status).length}</strong><small>${status[0].toUpperCase()+status.slice(1)}</small></span></span>`).join('')}</div>
    <details class="cwts-attendance-guide"><summary>How to check attendance</summary><ul><li>Marked Present and physically attending: leave the record unchanged.</li><li>Marked Present but physically absent: change to Absent and give a reason. A false-claim offense is recorded.</li><li>Physically attending but unable to submit: record attendance and give a reason.</li></ul></details>
    <div class="cwts-toolbar"><label for="cwtsStudentSearch">Find a student<input id="cwtsStudentSearch" type="search" placeholder="Name or student ID" value="${esc(cwtsStudentSearch)}"></label></div><div id="cwtsStudentRows"></div><div class="cwts-pagination" id="cwtsStudentPages"></div></section>`:''}</div>`;
}
async function loadCwtsAssignedAttendance(){
  const generation=++cwtsInstructorGeneration;
  const assignments=await API.get('/api/admin/cwts/instructor/assignments');
  if(generation!==cwtsInstructorGeneration)return;
  if(!assignments.some(a=>String(a.id)===cwtsSelectedAssignment)){cwtsSelectedAssignment=String(assignments[0]?.id||'');cwtsStudentPage=1;}
  const selected=assignments.find(a=>String(a.id)===cwtsSelectedAssignment);
  const rows=selected?await API.get(`/api/admin/cwts/instructor/assignments/${selected.id}/records`):[];
  if(generation!==cwtsInstructorGeneration)return;
  $('#content').innerHTML=cwtsInstructorView(assignments,selected,rows);
  const reload=()=>loadCwtsAssignedAttendance().catch(error=>{if(error.status===401)location.assign('/admin/cwts/login');else toast(error.message,true);});
  $('#cwtsRefreshAssigned').onclick=reload;
  if(!selected)return;
  document.querySelectorAll('[data-cwts-assignment]').forEach(button=>button.onclick=()=>{cwtsSelectedAssignment=button.dataset.cwtsAssignment;cwtsStudentSearch='';cwtsStudentPage=1;reload();});
  function renderRows(){
    const query=cwtsStudentSearch.trim().toLowerCase();const filtered=rows.filter(r=>`${r.first_name} ${r.last_name} ${r.student_id}`.toLowerCase().includes(query));
    const pages=Math.max(1,Math.ceil(filtered.length/10));cwtsStudentPage=Math.min(cwtsStudentPage,pages);
    const visible=filtered.slice((cwtsStudentPage-1)*10,cwtsStudentPage*10);
    $('#cwtsStudentRows').innerHTML=table(['Student','Attendance','Last update','Action'],visible.map(r=>`<tr><td><strong>${esc(r.first_name+' '+r.last_name)}</strong><small>${esc(r.student_id)}</small></td><td>${badge(r.status)}</td><td>${attendanceUpdateDetails(r)||'—'}</td><td><button class="btn small primary" data-student="${r.student_internal_id}">Update attendance</button></td></tr>`));
    $('#cwtsStudentPages').innerHTML=`<span>${filtered.length} students</span><div><button class="btn small" data-prev ${cwtsStudentPage===1?'disabled':''}>Previous</button><span>Page ${cwtsStudentPage} of ${pages}</span><button class="btn small" data-next ${cwtsStudentPage===pages?'disabled':''}>Next</button></div>`;
    $('#cwtsStudentPages [data-prev]').onclick=()=>{cwtsStudentPage--;renderRows();};$('#cwtsStudentPages [data-next]').onclick=()=>{cwtsStudentPage++;renderRows();};
    $('#cwtsStudentRows').querySelectorAll('[data-student]').forEach(button=>button.onclick=()=>{
      const row=rows.find(r=>String(r.student_internal_id)===button.dataset.student);openCwtsCorrection(row,selected,reload,button);
    });
  }
  $('#cwtsStudentSearch').oninput=e=>{cwtsStudentSearch=e.target.value;cwtsStudentPage=1;renderRows();};renderRows();
}
function openCwtsCorrection(row,assignment,reload,trigger){
  const dialog=document.createElement('dialog');dialog.className='attendance-update-dialog';dialog.setAttribute('aria-label','Update attendance for '+row.first_name+' '+row.last_name);
  dialog.innerHTML=`<header class="attendance-dialog-header"><div><span class="attendance-eyebrow">Company ${esc(assignment.company)} · CS ${assignment.mi_number} ${esc(assignment.mi_type.toUpperCase())}</span><h2>Update attendance</h2></div><button class="attendance-dialog-close" type="button" aria-label="Close">&times;</button></header><form><div class="attendance-dialog-body"><div class="attendance-edit-student"><strong>${esc(row.first_name+' '+row.last_name)}</strong><p>${esc(row.student_id)} · ${badge(row.status)}</p></div><label class="field">Attendance status<select name="status" required>${row.status==='unmarked'?'<option value="" disabled selected>Select attendance status</option>':''}${['present','late','absent'].map(s=>`<option value="${s}" ${row.status===s?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}</select></label><label class="field">Reason<textarea name="reason" required maxlength="500" rows="3" placeholder="Explain what you confirmed in the class area."></textarea></label><div class="attendance-save-note">A false Present claim changed to Absent records a punishment offense. An Unmarked student recorded as Absent receives no punishment offense.</div><p class="attendance-save-error" role="alert" hidden></p></div><footer class="attendance-dialog-footer"><button type="button" data-review hidden>Refresh and review</button><button class="btn" type="button" data-cancel>Cancel</button><button class="btn primary" type="submit">Save attendance</button></footer></form>`;
  let saving=false,stale=false;
  const close=()=>{if(!saving)dialog.close();};dialog.querySelector('.attendance-dialog-close').onclick=close;dialog.querySelector('[data-cancel]').onclick=close;
  dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});dialog.addEventListener('close',()=>{dialog.remove();trigger?.focus();},{once:true});
  dialog.querySelector('[data-review]').onclick=async()=>{close();await reload();};
  const form=dialog.querySelector('form'),submit=form.querySelector('[type=submit]');
  form.onsubmit=async event=>{
    event.preventDefault();if(saving||stale)return;
    const reason=form.elements.reason.value.trim();if(!reason){form.elements.reason.setCustomValidity('Enter a reason.');form.elements.reason.reportValidity();return;}
    saving=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);submit.textContent='Saving…';
    try{
      const result=await API.patch(`/api/admin/cwts/instructor/assignments/${assignment.id}/records/${row.student_internal_id}`,{status:form.elements.status.value,reason,expected_version:row.id?Number(row.record_version):null});
      dialog.close();toast(result.message);await reload();
    }catch(error){const message=form.querySelector('.attendance-save-error');message.hidden=false;message.textContent=error.message;
      if([401,403,409].includes(error.status)){stale=true;dialog.querySelector('[data-review]').hidden=false;}
    }finally{saving=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);submit.disabled=stale;submit.textContent='Save attendance';}
  };
  form.elements.reason.oninput=()=>form.elements.reason.setCustomValidity('');document.body.appendChild(dialog);dialog.showModal();
}
document.addEventListener('DOMContentLoaded',async()=>{
  try{const auth=await guard('cwts-admin');if(!auth)return;if(auth.user.role!=='instructor'){location.assign('/admin/cwts/dashboard');return;}
    shell('cwts','My Assigned Attendance',`Welcome, ${auth.user.name||'Instructor'}. Check attendance for your assigned company and session.`,auth);await loadCwtsAssignedAttendance();
  }catch(error){showPageError(error);}
});
