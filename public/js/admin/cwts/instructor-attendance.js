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
    <div class="cwts-attendance-filter-group">${cwtsAttendanceFilterPanel(assignments)}<div class="cwts-attendance-filter-reset"><button class="clear-filter-btn" type="button" id="cwtsAttendanceClear">Clear Filters</button></div><div class="cwts-toolbar cwts-attendance-downloads"><label for="cwtsStudentSearch"><span class="sr-only">Search students</span><input id="cwtsStudentSearch" type="search" placeholder="Search name or student ID" value="${esc(cwtsStudentSearch)}"></label><button class="btn primary" type="button" id="cwtsAttendanceWord">Download Word</button></div></div>
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
    const query=cwtsStudentSearch.trim().toLowerCase();const filtered=rows.filter(r=>`${r.first_name} ${r.middle_name||''} ${r.last_name} ${r.student_id}`.toLowerCase().includes(query)&&(cwtsStudentStatus==='all'||r.status===cwtsStudentStatus));
    document.querySelectorAll('[data-attendance-status]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.attendanceStatus===cwtsStudentStatus)));
    const pages=Math.max(1,Math.ceil(filtered.length/10));cwtsStudentPage=Math.min(cwtsStudentPage,pages);
    const visible=filtered.slice((cwtsStudentPage-1)*10,cwtsStudentPage*10);
    $('#cwtsStudentRows').innerHTML=table(['Student','Session / Company','Attendance','Last update','Action'],visible.map(r=>{
      const update=attendanceUpdateDetails(r);
      const studentName=[r.first_name,r.middle_name,r.last_name].filter(Boolean).join(' ');
      const avatar=window.InstructorUI?.studentAvatar?window.InstructorUI.studentAvatar(r.student_internal_id,studentName):'';

      return `<tr><td class="verifier-record-student"><div class="ip-student-identity">${avatar}<div><strong>${esc(studentName)}</strong><small>${esc(r.student_id)}</small></div></div>${update?`<details class="verifier-record-details"><summary>History</summary><div>${update}</div></details>`:''}</td><td><strong>CS ${esc(r.attendance_scope.mi_number)} ${esc(r.attendance_scope.mi_type.toUpperCase())}</strong><small class="cwts-row-company">${esc(r.attendance_scope.company)} Company</small></td><td class="verifier-record-status">${badge(r.status)}</td><td class="verifier-record-history">${update||'<span class="ip-no-update">No corrections yet</span>'}</td><td class="verifier-record-action"><button type="button" class="btn small primary" data-student="${rows.indexOf(r)}" aria-label="Update attendance for ${esc(r.first_name+' '+r.last_name)}">Update</button></td></tr>`;
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
    const groups=new Map();filtered.forEach(r=>{const id=r.attendance_scope.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);});
    const sections=[...groups.values()].map((list,index)=>{const a=list[0].attendance_scope;return `<section style="${index?'page-break-before:always;':''}"><h1>BUENAVISTA COMMUNITY COLLEGE</h1><h2>CWTS Attendance - ${esc(a.company)} Company</h2><p>School Year: ${esc(a.school_year)} | NSTP ${esc(a.ms_level)} | CS ${esc(a.mi_number)} ${esc(a.mi_type.toUpperCase())}</p><p>Date: ${esc(attendanceUpdateDate(a.open_date))} | Status: ${esc(cwtsStudentStatus)} | Search: ${esc(cwtsStudentSearch||'All students')}</p><table><thead><tr><th>#</th><th>Student ID</th><th>Student Name</th><th>Course</th><th>Attendance</th></tr></thead><tbody>${list.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.student_id)}</td><td>${esc([r.last_name+',',r.first_name,r.middle_name].filter(Boolean).join(' '))}</td><td>${esc(r.course||'')}</td><td>${esc(r.status==='unmarked'?'Not Marked':r.status[0].toUpperCase()+r.status.slice(1))}</td></tr>`).join('')}</tbody></table><p><strong>Total: ${list.length}</strong> | ${['present','late','absent','unmarked'].map(status=>esc(status)+': '+list.filter(r=>r.status===status).length).join(' | ')}</p></section>`;}).join('');
    const html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>@page{size:11in 8.5in;margin:.5in}body{font-family:Arial;font-size:10pt;color:#203f31}h1{font-size:15pt;text-align:center}h2{font-size:12pt;text-align:center}table{border-collapse:collapse;width:100%}th,td{border:1px solid #759883;padding:7px;text-align:left}th{background:#dcefe4}</style></head><body>'+sections+'</body></html>';
    download(new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}),'CWTS_Attendance.doc');
  };
  $('#cwtsStudentSearch').oninput=e=>{cwtsStudentSearch=e.target.value;cwtsStudentPage=1;renderRows();};renderRows();
}
function openCwtsCorrection(row,assignment,reload,trigger){
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
