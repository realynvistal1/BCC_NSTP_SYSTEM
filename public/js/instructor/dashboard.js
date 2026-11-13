(()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fullName=s=>[s.first_name,s.middle_name,s.last_name].filter(Boolean).join(' ');
  const art=type=>typeof icon==='function'?icon(type):'';
  function studentAvatar(studentId,studentName){
    const initials=String(studentName).trim().split(/\s+/).filter(Boolean).map(word=>word[0]).slice(0,2).join('');
    const photo=Number.isSafeInteger(Number(studentId))&&Number(studentId)>0?`<img src="/api/instructor/students/${Number(studentId)}/photo" alt="" loading="lazy" onerror="this.remove()">`:'';
    return `<span class="ip-student-avatar"><span aria-hidden="true">${esc(initials)}</span>${photo}</span>`;
  }
  window.InstructorUI={studentAvatar};
  const select=document.getElementById('assignmentSelect'),content=document.getElementById('assignedStudents'),notice=document.getElementById('instructorMessage');
  let gradeSaving=false;
  let assignmentId,request=0,gradeSearch='',gradeStatus='',gradeCourse='',teachingAssignments=[];
  function show(message,error=false){
    notice.hidden=true;notice.textContent='';
    const notification=document.getElementById('toast');
    notification?.setAttribute('role',error?'alert':'status');
    notification?.setAttribute('aria-live',error?'assertive':'polite');
    notification?.setAttribute('aria-atomic','true');
    toast(message,error,error?6500:3500);
  }
  async function load(){
    document.querySelector('.ip-grade-filter-panel .ip-grade-bulk-actions')?.remove();
    const current=++request;assignmentId=Number(select.value);content.innerHTML='<p class="portal-empty">Loading students…</p>';
    const selected=teachingAssignments.find(a=>Number(a.id)===assignmentId);
    const scopes=selected?teachingAssignments.filter(a=>a.year===selected.year&&Number(a.ms_level)===Number(selected.ms_level)):[{id:assignmentId}];
    const results=await Promise.all(scopes.map(a=>API.get(`/api/instructor/assignments/${a.id}/records`)));if(current!==request)return;
    const evidence=new Map(results.map(result=>[Number(result.assignment.id),result.attachment]));
    const data={students:results.flatMap(result=>result.students.map(student=>({...student,grade_assignment_id:result.assignment.id,assignment_read_only:Boolean(result.assignment.read_only)||Boolean(Number(student.historical_record))}))) };

    function updateSummary(){
    const states=data.students.map(student=>student.saved_final!=null?'approved':student.submission?.status||'not-entered');
    const summary=document.getElementById('instructorGradeSummary');
    const counts=[['Total Students',states.length,'total'],['Drafts',states.filter(s=>s==='draft').length,'draft'],['No Grades Yet',states.filter(s=>s==='not-entered').length,'ungraded'],['For Review',states.filter(s=>s==='submitted').length,'review'],['Approved',states.filter(s=>s==='approved').length,'approved']];
    if(summary.children.length===counts.length){counts.forEach(([,count],index)=>{const value=summary.children[index].querySelector('strong');if(value.textContent!==String(count))value.textContent=count;});}
    else summary.innerHTML=counts.map(([label,count,tone])=>`<article class="ip-record-count ${tone}"><small>${label}</small><strong>${count}</strong></article>`).join('');
    }
    updateSummary();
    content.innerHTML=`<div class="ip-grade-toolbar"><label><span class="sr-only">Search students</span><span aria-hidden="true">${art('users')}</span><input id="instructorGradeSearch" type="search" placeholder="Search student name or ID" autocomplete="off"></label><label class="ip-grade-status-filter"><span class="sr-only">Grade status</span><select id="instructorGradeStatus"><option value="">All statuses</option><option value="not-entered">No Grades Yet</option><option value="draft">Draft</option><option value="submitted">For review</option><option value="returned">Needs correction</option><option value="approved">Approved</option></select></label></div>`+(data.students.length?`<div class="ip-grade-bulk-actions"><button type="button" class="portal-secondary" data-bulk-save="draft">Save Draft All</button><div class="ip-grade-evidence-inline" data-grade-evidence></div><button type="button" data-bulk-save="submitted">Submit All</button></div><div class="portal-table-wrap ip-grade-table"><table class="portal-table"><thead><tr><th>Student</th><th>Midterm</th><th>Final</th><th>Average</th><th>Result</th><th>Status</th><th>Action</th></tr></thead><tbody>${data.students.map((s,index)=>{
      const g=s.submission,locked=s.assignment_read_only||s.saved_final!=null||['submitted','approved'].includes(g?.status);
      return `<tr data-row="${index}"><td><div class="ip-student-identity">${studentAvatar(s.student_id,fullName(s))}<div><strong>${esc(fullName(s))}</strong><small>${esc(s.student_no)}</small><small class="ip-student-course">${esc(s.course)}</small></div></div>${g?.review_note?`<span class="grade-note">${esc(g.review_note)}</span>`:''}</td><td><label class="sr-only" for="mid-${index}">Midterm for ${esc(fullName(s))}</label><input id="mid-${index}" name="midterm" type="number" min="1" max="5" step="0.01" placeholder="—" value="${esc(s.saved_midterm??g?.midterm??'')}" ${locked?'disabled':''}></td><td><label class="sr-only" for="fin-${index}">Final for ${esc(fullName(s))}</label><input id="fin-${index}" name="final_term" type="number" min="1" max="5" step="0.01" placeholder="—" value="${esc(s.saved_final??g?.final_term??'')}" ${locked?'disabled':''}></td><td data-average>--</td><td data-result>--</td><td><span data-grade-status class="portal-badge ${s.saved_final!=null?'approved':esc(g?.status||'not-entered')}">${s.saved_final!=null?'Approved':esc(g?.status==='submitted'?'For review':g?.status==='returned'?'Needs correction':g?.status==='draft'?'Draft':'No Grades Yet')}</span></td><td data-grade-actions>${locked?`<span class="ip-grade-locked">${art('check')} ${s.assignment_read_only?'View only':s.saved_final!=null?'Published':'Submitted'}</span>`:`<div class="portal-actions"><button data-save="draft" class="portal-secondary">Save Draft</button><button data-save="submitted">Submit to Admin</button></div>`}</td></tr>`;
    }).join('')}</tbody></table></div>`:'<div class="portal-empty"><span class="ip-empty-art">'+art('users')+'</span><h3>No students yet</h3><p>Students will appear after company assignment.</p></div>');


    let evidenceAssignment=Number(results[0]?.assignment.id);
    function renderEvidence(){
      const panel=document.querySelector('#gradesView [data-grade-evidence]');if(!panel)return;
      const file=evidence.get(evidenceAssignment),readOnly=Boolean(results.find(r=>Number(r.assignment.id)===evidenceAssignment)?.assignment.read_only);
      const label=a=>['Medics','MP','HQ','Advance Course'].includes(a.company)?a.company:a.company+' Company';
      panel.innerHTML=`${results.length>1?`<select data-evidence-assignment aria-label="Company or group for Excel upload">${results.map(result=>`<option value="${Number(result.assignment.id)}">${esc(label(result.assignment))}</option>`).join('')}</select>`:''}<span class="ip-grade-upload-message" role="status">${file?`<a href="/api/instructor/grade-attachments/${Number(file.id)}/download" title="${esc(file.original_name)}" aria-label="Download uploaded Excel file: ${esc(file.original_name)}">${art('check')}<span>Excel uploaded</span></a>`:'Upload your Excel file before submitting.'}</span><input type="file" accept=".xlsx" data-workbook hidden aria-label="Choose supporting Excel file"><button type="button" class="portal-secondary" data-upload-workbook>${file?'Replace Excel':'Upload Excel'}</button>`;
      const group=panel.querySelector('[data-evidence-assignment]');if(group){group.value=String(evidenceAssignment);group.onchange=()=>{if(gradeSaving)return;evidenceAssignment=Number(group.value);renderEvidence();};}
      const input=panel.querySelector('[data-workbook]'),button=panel.querySelector('[data-upload-workbook]');
      if(readOnly){input.disabled=true;button.hidden=true;const message=panel.querySelector('.ip-grade-upload-message');if(!file)message.textContent='Previous assignment - view only';}
      button.onclick=()=>{if(!gradeSaving&&!readOnly)input.click();};
      input.onchange=async()=>{
        if(gradeSaving)return;const file=input.files[0];if(!file)return;
        if(!/\.xlsx$/i.test(file.name)||file.size>8*1024*1024){show('Choose an .xlsx file of 8 MB or smaller.',true);input.value='';return;}
        const form=new FormData();form.append('workbook',file);gradeSaving=true;const restore=freezeGradeControls(button),id=evidenceAssignment;
        try{const result=await API.post('/api/instructor/assignments/'+id+'/workbook',form);evidence.set(id,result.attachment);renderEvidence();show(result.message);}
        catch(error){show(error.message,true);}finally{restore();finishSaving();}
      };
    }
    renderEvidence();
    const bulkActions=content.querySelector('.ip-grade-bulk-actions');
    if(bulkActions)document.querySelector('.ip-grade-filter-panel').appendChild(bulkActions);
    document.querySelector('.ip-assignment-filters .ip-grade-toolbar')?.remove();
    const toolbar=content.querySelector('.ip-grade-toolbar');
    document.querySelector('.ip-assignment-filters').appendChild(toolbar);
    const searchField=document.getElementById('instructorGradeSearch'),statusField=document.getElementById('instructorGradeStatus'),courseField=document.getElementById('instructorGradeCourse');
    const courses=[...new Set(data.students.map(s=>s.course).filter(Boolean))].sort();
    if(!courses.includes(gradeCourse))gradeCourse='';
    courseField.innerHTML='<option value="">All courses</option>'+courses.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');courseField.value=gradeCourse;
    const filterToolbar=document.querySelector('.ip-assignment-filters .ip-grade-toolbar');
    const searchLabel=searchField.closest('label');searchLabel.classList.add('ip-grade-search-last');
    if(bulkActions)bulkActions.prepend(searchLabel);else filterToolbar.appendChild(searchLabel);

    searchField.value=gradeSearch;statusField.value=gradeStatus;
    function filterStudents(){
      gradeSearch=searchField.value;gradeStatus=statusField.value;gradeCourse=courseField.value;
      const query=gradeSearch.trim().toLowerCase();let visible=0;
      content.querySelectorAll('[data-row]').forEach(row=>{const student=data.students[Number(row.dataset.row)],state=student.saved_final!=null?'approved':student.submission?.status||'not-entered';const matches=(`${fullName(student)} ${student.student_no}`).toLowerCase().includes(query)&&(!gradeStatus||state===gradeStatus)&&(!gradeCourse||student.course===gradeCourse);row.hidden=!matches;if(matches)visible++;});
      const editable=[...content.querySelectorAll('[data-row]')].some(row=>!row.hidden&&!row.querySelector('[name=midterm]').disabled);
      document.querySelectorAll('#gradesView [data-bulk-save]').forEach(button=>button.disabled=gradeSaving||!editable);
    }
    searchField.oninput=filterStudents;statusField.onchange=filterStudents;courseField.onchange=filterStudents;filterStudents();
    content.querySelectorAll('[data-row]').forEach(row=>{
      const student=data.students[Number(row.dataset.row)],mid=row.querySelector('[name=midterm]'),fin=row.querySelector('[name=final_term]');
      function updateAverage(){const first=Number(mid.value),last=Number(fin.value);const valid=mid.value!==''&&fin.value!==''&&Number.isFinite(first)&&Number.isFinite(last)&&first>=1&&first<=5&&last>=1&&last<=5;
        const average=valid?Math.round(((first+last)/2)*100)/100:null;
        row.querySelector('[data-average]').textContent=average===null?'--':average.toFixed(2);
        const limit=/criminology|education|\bBEED\b|\bBSED\b/i.test(student.course||'')?2.5:3;
        row.querySelector('[data-result]').innerHTML=average===null?'--':`<span class="portal-badge ${average<=limit?'approved':'returned'}">${average<=limit?'Passed':'Failed'}</span>`;
      }
      mid.addEventListener('input',updateAverage);fin.addEventListener('input',updateAverage);updateAverage();
    });


    function applySavedGrades(submissions){
      for(const saved of submissions){const student=data.students.find(s=>Number(s.enrollment_record_id)===Number(saved.enrollment_record_id));if(student)student.submission=saved;}
      updateSummary();
    }
    function finishSaving(){
      gradeSaving=false;
      for(const row of content.querySelectorAll('[data-row]')){
        const student=data.students[Number(row.dataset.row)],submission=student.submission;
        const locked=student.assignment_read_only||student.saved_final!=null||['submitted','approved'].includes(submission?.status);
        row.querySelector('[name=midterm]').disabled=locked;row.querySelector('[name=final_term]').disabled=locked;
        const badge=row.querySelector('[data-grade-status]');
        badge.className='portal-badge '+(student.saved_final!=null?'approved':submission?.status||'not-entered');
        badge.textContent=student.saved_final!=null?'Approved':({draft:'Draft',submitted:'For review',returned:'Needs correction',approved:'Approved'})[submission?.status]||'No Grades Yet';
        if(locked)row.querySelector('[data-grade-actions]').innerHTML='<span class="ip-grade-locked">'+art('check')+' '+(student.assignment_read_only?'View only':student.saved_final!=null?'Published':'Submitted')+'</span>';
        if(!submission?.review_note)row.querySelector('.grade-note')?.remove();
      }
      filterStudents();
    }
    function freezeGradeControls(activeButton){
      const controls=[...content.querySelectorAll('button,input,select'),...document.querySelectorAll('.ip-grade-filter-panel button,.ip-grade-filter-panel input,.ip-grade-filter-panel select'),select];
      const previous=controls.map(control=>[control,control.disabled,control.readOnly]);
      content.classList.add('ip-grade-saving');activeButton?.setAttribute('aria-busy','true');
      controls.forEach(control=>{if(control.tagName==='INPUT')control.readOnly=true;else if(control.tagName==='BUTTON')control.setAttribute('aria-disabled','true');else control.disabled=true;});
      return ()=>{content.classList.remove('ip-grade-saving');activeButton?.removeAttribute('aria-busy');previous.forEach(([control,disabled,readOnly])=>{control.disabled=disabled;if(control.tagName==='INPUT')control.readOnly=readOnly;else if(control.tagName==='BUTTON')control.removeAttribute('aria-disabled');});};
    }
    document.querySelectorAll('#gradesView [data-bulk-save]').forEach(button=>button.onclick=async()=>{
      if(gradeSaving)return;
      const action=button.dataset.bulkSave,entries=[];
      for(const row of content.querySelectorAll('[data-row]')){
        const mid=row.querySelector('[name=midterm]'),fin=row.querySelector('[name=final_term]');
        if(row.hidden||mid.disabled)continue;
        if(action==='draft'&&mid.value===''&&fin.value==='')continue;
        const student=data.students[Number(row.dataset.row)];
        if(!mid.value||!fin.value||!mid.reportValidity()||!fin.reportValidity()){
          show('Enter valid Midterm and Final grades for '+fullName(student)+' before '+(action==='draft'?'saving all drafts.':'submitting all grades.'),true);(mid.value?fin:mid).focus();return;
        }
        if(action==='submitted'&&!evidence.get(Number(student.grade_assignment_id))){show('Upload the supporting Excel file for each company/group before submitting grades.',true);return;}
        entries.push({attachment_id:evidence.get(Number(student.grade_assignment_id))?.id||null,assignment_id:student.grade_assignment_id,enrollment_record_id:student.enrollment_record_id,midterm:mid.value,final_term:fin.value,expected_version:student.submission?Number(student.submission.version):null});
      }
      if(!entries.length){show('No editable grades to save. Enter grades first.',true);return;}
      if(action==='submitted'&&!confirm('Submit all '+entries.length+' grade records shown for admin review? Submitted grades are locked until returned by the admin.'))return;
      gradeSaving=true;const restore=freezeGradeControls(button);
      try{const result=await API.post('/api/instructor/grade-records/bulk',{action,records:entries});applySavedGrades(result.submissions);show(result.message);}
      catch(error){show(error.message,true);}
      finally{restore();finishSaving();}
    });
    content.querySelectorAll('[data-save]').forEach(button=>button.onclick=async()=>{
      if(gradeSaving)return;
      const row=button.closest('tr'),s=data.students[Number(row.dataset.row)],mid=row.querySelector('[name=midterm]'),fin=row.querySelector('[name=final_term]');
      if(!mid.value||!fin.value||!mid.reportValidity()||!fin.reportValidity()){show('Enter both Midterm and Final grades from 1.00 to 5.00.',true);return;}
      if(button.dataset.save==='submitted'&&!evidence.get(Number(s.grade_assignment_id))){show('Upload the supporting Excel file before submitting grades.',true);return;}
      if(button.dataset.save==='submitted'&&!confirm('Submit these grades for admin review? You can edit them again only if the admin returns them.'))return;
      gradeSaving=true;const restore=freezeGradeControls(button);
      try{const result=await API.post(`/api/instructor/assignments/${s.grade_assignment_id}/records/${s.enrollment_record_id}`,{attachment_id:evidence.get(Number(s.grade_assignment_id))?.id||null,midterm:mid.value,final_term:fin.value,action:button.dataset.save,expected_version:s.submission?Number(s.submission.version):null});applySavedGrades([result.submission]);show(result.message);}
      catch(e){show(e.message,true);}
      finally{restore();finishSaving();}
    });
  }
  select.onchange=()=>{notice.hidden=true;load().catch(e=>show(e.message,true));};
  let profile,attendanceBusy=false,dashboardRequest=0;
  const currentTab=()=>['profile','grades','attendance','records'].includes(location.hash.slice(1))?location.hash.slice(1):'records';
  async function refreshGrades(){
    document.querySelector('.ip-grade-filter-panel .ip-grade-bulk-actions')?.remove();
    const assignments=await API.get('/api/instructor/assignments'),previous=select.value;teachingAssignments=assignments;
    const yearField=document.getElementById('gradeSchoolYear'),levelField=document.getElementById('gradeLevel'),companyField=document.getElementById('gradeCompany');
    document.getElementById('gradeCompanyLabel').textContent=profile.program==='CWTS'?'Company':'Company / Group';
    select.disabled=!assignments.length;
    select.innerHTML=assignments.map(a=>`<option value="${a.id}">${esc(a.year)} · NSTP ${esc(a.ms_level)}${a.company?' · '+esc(a.company)+(['Medics','MP','HQ','Advance Course'].includes(a.company)?'':' Company'):''}</option>`).join('')||'<option>No assignment yet</option>';
    if(assignments.some(a=>String(a.id)===previous))select.value=previous;
    async function chooseAssignment(changed){
      let selected=assignments.find(a=>String(a.id)===select.value)||assignments[0];
      if(changed==='year')selected=assignments.find(a=>a.year===yearField.value&&String(a.ms_level)===levelField.value)||assignments.find(a=>a.year===yearField.value);
      if(changed==='level')selected=assignments.find(a=>a.year===yearField.value&&String(a.ms_level)===levelField.value);
      if(changed==='company')selected=assignments.find(a=>String(a.id)===companyField.value);
      if(!selected)return;
      const years=[...new Set(assignments.map(a=>a.year))];
      yearField.innerHTML=years.map(year=>`<option value="${esc(year)}">${esc(year)}</option>`).join('');yearField.value=selected.year;
      const levels=[...new Set(assignments.filter(a=>a.year===selected.year).map(a=>String(a.ms_level)))].sort();
      levelField.innerHTML=levels.map(level=>`<option value="${esc(level)}">NSTP ${esc(level)}</option>`).join('');levelField.value=String(selected.ms_level);
      const companies=assignments.filter(a=>a.year===selected.year&&String(a.ms_level)===String(selected.ms_level));
      companyField.innerHTML=companies.map(a=>`<option value="${a.id}">${esc(a.company?a.company+(['Medics','MP','HQ','Advance Course'].includes(a.company)?'':' Company'):profile.program+' Students')}</option>`).join('');companyField.value=String(selected.id);
      select.value=String(selected.id);await load();
    }
    yearField.onchange=()=>chooseAssignment('year').catch(e=>show(e.message,true));levelField.onchange=()=>chooseAssignment('level').catch(e=>show(e.message,true));companyField.onchange=()=>chooseAssignment('company').catch(e=>show(e.message,true));
    [yearField,levelField,companyField].forEach(field=>field.disabled=!assignments.length);
    if(assignments.length)await chooseAssignment();else{document.getElementById('instructorGradeSummary').innerHTML='';[yearField,levelField,companyField].forEach(field=>field.innerHTML='<option>No assignment</option>');content.innerHTML='<div class="portal-empty"><h3>No assignment yet.</h3><p>Your admin will assign your students for the school year.</p></div>';}
  }
  async function refreshAttendance(){
    if(attendanceBusy)return;attendanceBusy=true;
    const target=document.getElementById('content');
    try{
      if(profile.program==='CWTS')await loadCwtsAssignedAttendance();
      else await window.renderRotcInstructorAttendance(target);
    }catch(e){target.innerHTML=`<div class="panel portal-empty" role="alert">${esc(e.message)}<p><button type="button" class="btn" id="retryInstructorAttendance">Try Again</button></p></div>`;document.getElementById('retryInstructorAttendance').onclick=refreshAttendance;}
    finally{attendanceBusy=false;}
  }
  async function refreshProfileAssignments(){
    const container=document.getElementById('instructorProfileAssignments');
    container.textContent='Loading assignments...';
    try{
      const assignments=await API.get('/api/instructor/assignments');
      container.innerHTML=assignments.length?assignments.map(a=>{
        const company=a.company?(['Medics','MP','HQ','Advance Course'].includes(a.company)||/company$/i.test(a.company)?a.company:a.company+' Company'):'Unassigned';
        return `<article class="instructor-profile-assignment"><strong>${esc(company)}</strong><span>SY ${esc(a.year)} &bull; ${profile.program==='ROTC'?'MS':'CWTS'} ${esc(a.ms_level)}${a.read_only?' &bull; View only':''}</span></article>`;
      }).join(''):'<p>No teaching assignment yet. Your administrator will assign your company or group.</p>';
    }catch(error){container.textContent='Unable to load teaching assignments. '+error.message;}
  }
  async function switchTab(){
    const tab=currentTab();if(document.body)document.body.dataset.instructorView=tab;
    document.querySelectorAll('[data-instructor-view]').forEach(view=>view.hidden=view.dataset.instructorView!==tab);
    document.querySelectorAll('[data-instructor-tab]').forEach(link=>{const active=link.dataset.instructorTab===tab;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    const headings={records:['View Records','Assigned student records.'],dashboard:['Dashboard','Your companies, students, grades, and attendance.'],profile:['My Profile','Your instructor account.'],grades:['Grades','Enter and submit Midterm and Final grades.'],attendance:['Attendance',profile.program==='ROTC'?'ROTC attendance records. View only.':'Attendance for your assigned company.']};
    document.getElementById('pageTitle').textContent=headings[tab][0];document.getElementById('pageSubtitle').textContent=headings[tab][1];
    if(tab==='profile')await refreshProfileAssignments();
    if(tab==='records')await window.renderInstructorRecords(document.getElementById('instructorRecordsView'));
    if(tab==='attendance')await refreshAttendance();
    if(tab==='grades')await refreshGrades();

  }
  (async()=>{
    const p=await API.get('/api/instructor/profile');
    profile=p;shell('instructor','View Records','Assigned student records.',{user:p});
    document.getElementById('instructorPortalLabel').textContent=p.program+' Instructor';


    document.getElementById('instructorProfile').innerHTML=`<img class="profile-portrait" src="${p.photo_url}" alt="Your profile photo" onerror="this.hidden=true"><div><small>${esc(p.program)} INSTRUCTOR</small><h1>${esc(fullName(p))}</h1><p>${esc(p.email)}</p></div><span class="portal-badge approved">Approved</span>`;
    document.getElementById('instructorAccountDetails').innerHTML=[['Full Name',fullName(p)],['Email Address',p.email],['NSTP Component',p.program],['Registered School Year',p.requested_year||'—'],['Registered Level',p.requested_level?(p.program==='ROTC'?'MI ':'CWTS ')+p.requested_level:'—'],['Account Status','Approved']].map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
    window.addEventListener('hashchange',()=>switchTab().catch(e=>toast(e.message,true)));await switchTab();
    const timer=window.setInterval(()=>{
      if(document.hidden||document.querySelector('dialog[open]'))return;
      if(currentTab()==='attendance'&&!document.activeElement?.matches('input,select,textarea'))refreshAttendance();

    },20000);
    window.addEventListener('pagehide',()=>window.clearInterval(timer),{once:true});
  })().catch(e=>{if(e.status===401)location.assign('/instructor/login');else{show(e.message,true);document.getElementById('instructorProfile').textContent=e.message;}});
})();
