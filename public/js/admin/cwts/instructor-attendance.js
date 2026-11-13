let cwtsInstructorGeneration=0,cwtsSelectedAssignment='',cwtsStudentSearch='',cwtsStudentPage=1,cwtsStudentStatus='all',cwtsLastOpenSessions='';
const cwtsAttendanceFilters={cycle:'',company:'',session:'',type:''};
function cwtsAttendanceScopeMatches(a){return (!cwtsAttendanceFilters.cycle||a.school_year+'|'+a.ms_level===cwtsAttendanceFilters.cycle)&&(!cwtsAttendanceFilters.session||String(a.mi_number)===cwtsAttendanceFilters.session)&&(!cwtsAttendanceFilters.type||a.mi_type===cwtsAttendanceFilters.type);}
function cwtsAttendanceFilterPanel(assignments){
  const options=(values,label)=>'<option value="">'+label+'</option>'+values.map(([value,text])=>`<option value="${esc(value)}">${esc(text)}</option>`).join('');
  return `<div class="cwts-session-filters"><label>School Year / Level<select data-session-filter="cycle">${options([...new Map(assignments.map(a=>[a.school_year+'|'+a.ms_level,[a.school_year+'|'+a.ms_level,'CWTS '+a.ms_level+' - SY '+a.school_year]])).values()],'All years / levels')}</select></label><label>CS Session<select data-session-filter="session">${options([...new Set(assignments.map(a=>Number(a.mi_number)))].sort((a,b)=>a-b).map(n=>[n,'CS '+n]),'All sessions')}</select></label><label>IN / OUT<select data-session-filter="type"><option value="">Both</option><option value="in">IN</option><option value="out">OUT</option></select></label></div>`;
}
function cwtsInstructorView(assignments,selected,rows){
  return `<div class="cwts-workspace cwts-verifier-workspace cwts-attendance-unified">
    <div class="cwts-attendance-summary">${attendanceStatusFilters(rows,cwtsStudentStatus)}</div>
    <section class="panel cwts-mint"><div class="verifier-section-heading"><span class="verifier-heading-icon teal" aria-hidden="true">${icon('attendance')}</span><div><h2>Attendance Records</h2></div><button class="btn" id="cwtsRefreshAssigned" type="button">${icon('refresh')} Refresh</button></div>
    <div class="cwts-attendance-filter-group">${cwtsAttendanceFilterPanel(assignments)}<div class="cwts-attendance-filter-reset"><button class="clear-filter-btn" type="button" id="cwtsAttendanceClear">Clear Filters</button></div><div class="cwts-toolbar cwts-attendance-downloads"><label class="cwts-attendance-status-select">Status<select id="cwtsAttendanceStatus"><option value="all">All statuses</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="unmarked">Not Marked</option></select></label><label for="cwtsStudentSearch"><span class="sr-only">Search students</span><input id="cwtsStudentSearch" type="search" placeholder="Search name or student ID" value="${esc(cwtsStudentSearch)}"></label><button class="btn primary" type="button" id="cwtsAttendanceWord">Download Word</button></div></div>
    <div id="cwtsStudentRows"></div><div class="cwts-pagination" id="cwtsStudentPages"></div></section></div>`;
}
async function loadCwtsAssignedAttendance(){
  const generation=++cwtsInstructorGeneration;
  const assignments=await API.get('/api/admin/cwts/instructor/assignments');
  if(generation!==cwtsInstructorGeneration)return;
  const scopes=assignments.filter(cwtsAttendanceScopeMatches),selected=scopes[0];
  const result=await Promise.all(scopes.map(async scope=>{const records=await API.get(`/api/admin/cwts/instructor/assignments/${scope.id}/records`);return records.map(r=>({...r,attendance_scope:scope}));}));
  const rows=result.flat();
  if(generation!==cwtsInstructorGeneration)return;
  $('#content').innerHTML=cwtsInstructorView(assignments,selected,rows);
  const reload=()=>loadCwtsAssignedAttendance().catch(error=>{if(error.status===401)location.assign('/cwts/instructor/login');else toast(error.message,true);});
  $('#cwtsRefreshAssigned').onclick=reload;
  document.querySelectorAll('[data-session-filter]').forEach(field=>{field.value=cwtsAttendanceFilters[field.dataset.sessionFilter];field.onchange=()=>{cwtsAttendanceFilters[field.dataset.sessionFilter]=field.value;cwtsStudentPage=1;reload();};});

  function renderRows(){
    $('#cwtsAttendanceStatus').value=cwtsStudentStatus;
    const query=cwtsStudentSearch.trim().toLowerCase();const filtered=rows.filter(r=>`${r.first_name} ${r.middle_name||''} ${r.last_name} ${r.student_id}`.toLowerCase().includes(query)&&(cwtsStudentStatus==='all'||r.status===cwtsStudentStatus));
    document.querySelectorAll('[data-attendance-status]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.attendanceStatus===cwtsStudentStatus)));
    const pages=Math.max(1,Math.ceil(filtered.length/10));cwtsStudentPage=Math.min(cwtsStudentPage,pages);
    const visible=filtered.slice((cwtsStudentPage-1)*10,cwtsStudentPage*10);
    $('#cwtsStudentRows').innerHTML=table(['Student','Session / Company','Attendance','Last update','Action'],visible.map(r=>{
      const update=attendanceUpdateDetails(r);
      const studentName=[r.first_name,r.middle_name,r.last_name].filter(Boolean).join(' ');
      const avatar=window.InstructorUI?.studentAvatar?window.InstructorUI.studentAvatar(r.student_internal_id,studentName):'';

      return `<tr><td class="verifier-record-student"><div class="ip-student-identity">${avatar}<div><strong>${esc(studentName)}</strong><small>${esc(r.student_id)}</small></div></div></td><td><strong>CS ${esc(r.attendance_scope.mi_number)} ${esc(r.attendance_scope.mi_type.toUpperCase())}</strong><small class="cwts-row-company">${esc(r.attendance_scope.company)} Company</small></td><td class="verifier-record-status">${badge(r.status)}</td><td class="verifier-record-history">${update||'<span class="ip-no-update">No corrections yet</span>'}</td><td class="verifier-record-action">${r.attendance_scope.read_only?'<span class="portal-badge">View only</span>':`<button type="button" class="btn small primary" data-student="${rows.indexOf(r)}" aria-label="Update attendance for ${esc(r.first_name+' '+r.last_name)}">Update</button>`}</td></tr>`;
    }));
    if(!filtered.length)$('#cwtsStudentRows').innerHTML='<div class="notice" role="status">No students found.</div>';
    $('#cwtsStudentPages').innerHTML=`<span>${filtered.length} attendance records</span><div><button class="btn small" data-prev ${cwtsStudentPage===1?'disabled':''}>Previous</button><span>Page ${cwtsStudentPage} of ${pages}</span><button class="btn small" data-next ${cwtsStudentPage===pages?'disabled':''}>Next</button></div>`;
    $('#cwtsStudentPages [data-prev]').onclick=()=>{cwtsStudentPage--;renderRows();};$('#cwtsStudentPages [data-next]').onclick=()=>{cwtsStudentPage++;renderRows();};
    $('#cwtsStudentRows').querySelectorAll('[data-student]').forEach(button=>button.onclick=()=>{
      const row=rows[Number(button.dataset.student)];openCwtsCorrection(row,row.attendance_scope,reload,button);
    });
  }
  document.querySelectorAll('[data-attendance-status]').forEach(button=>button.onclick=()=>{cwtsStudentStatus=button.dataset.attendanceStatus;cwtsStudentPage=1;renderRows();});
  const exportRows=()=>rows.filter(r=>`${r.first_name} ${r.middle_name||''} ${r.last_name} ${r.student_id}`.toLowerCase().includes(cwtsStudentSearch.trim().toLowerCase())&&(cwtsStudentStatus==='all'||r.status===cwtsStudentStatus));
  function download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('#cwtsAttendanceClear').onclick=()=>{cwtsStudentSearch='';cwtsStudentStatus='all';cwtsStudentPage=1;Object.keys(cwtsAttendanceFilters).forEach(k=>cwtsAttendanceFilters[k]='');reload();};
  $('#cwtsAttendanceWord').onclick=()=>{
    const filtered=exportRows();if(!filtered.length){toast('No attendance records to download.',true);return;}
    const html=window.buildCwtsAttendanceWord(filtered,{status:cwtsStudentStatus==='all'?'All':cwtsStudentStatus,search:cwtsStudentSearch});
    download(new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}),'CWTS_Attendance_Summary.doc');
  };
  $('#cwtsAttendanceStatus').onchange=e=>{cwtsStudentStatus=e.target.value;cwtsStudentPage=1;renderRows();};
  $('#cwtsStudentSearch').oninput=e=>{cwtsStudentSearch=e.target.value;cwtsStudentPage=1;renderRows();};renderRows();
}
function openCwtsCorrection(row,assignment,reload,trigger){
  if(assignment.read_only){toast('Previous assignments are view only.',true);return;}
  const dialog=document.createElement('dialog');dialog.className='attendance-update-dialog student-attendance-edit-dialog';dialog.setAttribute('aria-label','Update attendance for '+row.first_name+' '+row.last_name);
  dialog.innerHTML=`<header class="attendance-dialog-header"><div><span class="attendance-eyebrow">Company ${esc(assignment.company)} · CS ${assignment.mi_number} ${esc(assignment.mi_type.toUpperCase())}</span><h2>Update attendance</h2></div><button class="attendance-dialog-close" type="button" aria-label="Close">&times;</button></header><form><div class="attendance-dialog-body"><div class="attendance-edit-student"><strong>${esc(row.first_name+' '+row.last_name)}</strong><p>${esc(row.student_id)} · ${badge(row.status)}</p></div><label class="field">Status<select name="status" required>${row.status==='unmarked'?'<option value="" disabled selected>Select attendance status</option>':''}${['present','late','absent'].map(s=>`<option value="${s}" ${row.status===s?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}</select></label><label class="field">Reason<textarea name="reason" required maxlength="500" rows="3" placeholder="Brief reason for the change"></textarea></label><div class="attendance-save-note">A reason is required. False attendance claims are recorded as offenses.</div><p class="attendance-save-error" role="alert" hidden></p></div><footer class="attendance-dialog-footer"><button type="button" data-review hidden>Refresh and review</button><button class="btn" type="button" data-cancel>Cancel</button><button class="btn primary" type="submit">Save</button></footer></form>`;
  let saving=false,stale=false;
  const close=()=>{if(!saving)dialog.close();};dialog.querySelector('.attendance-dialog-close').onclick=close;dialog.querySelector('[data-cancel]').onclick=close;
  dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});dialog.addEventListener('close',()=>{dialog.remove();trigger?.focus();},{once:true});
  dialog.querySelector('[data-review]').onclick=async()=>{close();await reload();};
  const form=dialog.querySelector('form'),submit=form.querySelector('[type=submit]');
  const unchangedStatus=()=>!form.elements.status.value||form.elements.status.value===row.status;
  const updateSaveState=()=>{submit.disabled=saving||stale||unchangedStatus();};
  form.elements.status.onchange=updateSaveState;
  updateSaveState();
  form.onsubmit=async event=>{
    event.preventDefault();if(saving||stale||unchangedStatus())return;
    const reason=form.elements.reason.value.trim();if(!reason){form.elements.reason.setCustomValidity('Enter a reason.');form.elements.reason.reportValidity();return;}
    saving=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);submit.textContent='Saving…';
    try{
      const result=await API.patch(`/api/admin/cwts/instructor/assignments/${assignment.id}/records/${row.student_internal_id}`,{status:form.elements.status.value,reason,expected_version:row.id?Number(row.record_version):null});
      dialog.close();toast(result.message);await reload();
    }catch(error){const message=form.querySelector('.attendance-save-error');message.hidden=false;message.textContent=error.message;
      if([401,403,409].includes(error.status)){stale=true;dialog.querySelector('[data-review]').hidden=false;}
    }finally{saving=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);submit.disabled=stale||unchangedStatus();submit.textContent='Save';}
  };
  form.elements.reason.oninput=()=>form.elements.reason.setCustomValidity('');document.body.appendChild(dialog);dialog.showModal();
}
document.addEventListener('DOMContentLoaded',async()=>{
  if(document.body.dataset.page!=='cwts-instructor-attendance')return;
  try{const auth=await guard('instructor');if(!auth)return;if(auth.user.role!=='instructor'){location.assign('/admin/cwts/dashboard');return;}
    shell('cwts','Assigned Attendance','',auth);await loadCwtsAssignedAttendance();
  }catch(error){showPageError(error);}
});
