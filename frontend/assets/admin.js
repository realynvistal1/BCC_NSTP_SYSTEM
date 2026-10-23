'use strict';
requireRole('admin');
const call=(path,opts)=>privateApi('/admin'+path,opts);
const safely=async fn=>{try{await fn();}catch(error){toast(error.message,'error');}};
let periods=[],reports=[],visibleReports=[];
const yearOptions=(selected='')=>{const now=new Date().getFullYear();const y=Number(String(selected).slice(0,4));const years=[];for(let start=now+5;start>=2015;start--)years.push(`<option value="${start}" ${start===y?'selected':''}>${start}–${start+1}</option>`);return '<option value="">Choose starting year</option>'+years.join('');};
$('#newStartYear').innerHTML=yearOptions(new Date().getFullYear());
const btn=(action,id,label,kind='secondary')=>`<button class="btn small ${kind}" data-action="${action}" data-id="${id}">${esc(label)}</button>`;
const table=(heads,rows)=>rows.length?`<table><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`:'<div class="empty"><strong>No records found</strong>New records will appear here.</div>';
$('#logout').onclick=()=>signOut('admin');
$('nav').onclick=e=>{const b=e.target.closest('button[data-section]');if(b){showTab(b.dataset.section);void load(b.dataset.section);}};
async function load(tab){await safely(async()=>{
 if(tab==='overview'){
  const d=await call('/overview');$('#adminStats').innerHTML=[['Faculty accounts',d.faculty_count],['Pending registrations',d.pending_count],['Subjects to review',d.pending_assignments],['Student responses',d.response_count]].map(([t,n])=>`<div class="stat"><span>${esc(t)}</span><strong>${moneyNumber(n)}</strong></div>`).join('');
  const avg=Number(d.average_rating||0);$('#adminRingValue').textContent=avg?avg.toFixed(2):'—';updateRing($('#adminRing'),avg);$('#adminResponseCount').textContent=`${moneyNumber(d.response_count)} student responses`;paintRatingBars($('#adminDistribution'),d.rating_distribution);const history=await call('/analytics');drawYearBars($('#adminYearBars'),history.schoolYears);$('#adminPeriodRecords').innerHTML=table(['Evaluation','School year','Status','Responses','Average / 5'],history.periods.map(p=>`<tr><td>${esc(p.title)}</td><td>${esc(p.school_year)}</td><td>${pill(p.status)}</td><td>${moneyNumber(p.responses)}</td><td>${p.average_rating==null?'—':esc(Number(p.average_rating).toFixed(2)+'/5')}</td></tr>`));
 }

 if(tab==='facultyAccounts'){
  const records=await call('/faculty');$('#facultyList').innerHTML=table(['Instructor','Contact','Department','Status','Actions'],records.map(r=>`<tr><td><div class="faculty-cell"><img src="/assets/avatar.svg" data-admin-photo="${r.has_photo?r.id:''}" alt="" class="mini-avatar"><div><strong>${esc(r.full_name)}</strong><br><small>${esc(r.designation||r.employee_id||'Faculty member')}</small></div></div></td><td>${esc(r.email)}<br><small>${esc(r.contact_number||'')}</small></td><td>${esc(r.department)}</td><td>${pill(r.status)}</td><td><div class="actions">${btn('profile',r.id,'View profile')}${r.status!=='approved'?btn('faculty:approved',r.id,'Approve','positive'):''}${r.status!=='rejected'?btn('faculty:rejected',r.id,'Reject','danger'):''}${r.status!=='suspended'?btn('faculty:suspended',r.id,'Suspend'):''}</div></td></tr>`));
  $('#facultyList').querySelectorAll('img[data-admin-photo]').forEach(img=>{if(img.dataset.adminPhoto)void renderAdminPhoto(img,Number(img.dataset.adminPhoto));});
 }
 if(tab==='periods')await loadPeriods();
 if(tab==='assignments'){
  const records=await call('/assignments');$('#assignmentList').innerHTML=table(['Instructor','Subject / Section','Period','Status','Action'],records.map(r=>`<tr><td>${esc(r.faculty_name)}</td><td><strong>${esc(r.subject_code)} – ${esc(r.subject_name)}</strong><br><small>${esc(r.year_level)} · ${esc(r.section_name)}</small></td><td>${esc(r.period_title)}</td><td>${pill(r.status)}</td><td><div class="actions">${r.status==='pending'?btn('assignment:approved',r.id,'Approve','positive')+btn('assignment:rejected',r.id,'Reject','danger'):'—'}</div></td></tr>`));
 }
 if(tab==='reports')await loadReports();
});}
function periodDate(value){
 if(!value)return 'Not scheduled';
 const raw=String(value),date=new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)?raw:raw.replace(' ','T')+'+08:00');
 return Number.isNaN(date.getTime())?niceDate(value):new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}).format(date);
}
async function loadPeriods(){
 periods=await call('/periods');
 termFilters('adminTerm',periods,matches=>{const filtered=periods.filter(matches);
 $('#periodList').innerHTML=filtered.length?filtered.map(p=>`<details class="evaluation-card evaluation-dropdown" name="admin-evaluation"><summary><div><strong>${esc(p.title)}</strong><span class="evaluation-row-meta">${esc(p.school_year)} / ${esc(p.semester)} / ${Number(p.required_students)} students per subject</span></div><div class="evaluation-row-actions">${pill(p.status)}<span class="subject-view"><span class="subject-view-closed">View</span><span class="subject-view-open">Hide</span><span aria-hidden="true">&#8964;</span></span></div></summary><div class="evaluation-dropdown-body"><div class="evaluation-schedule"><div><span>Opens</span><strong>${esc(periodDate(p.starts_at))}</strong></div><div><span>Closes</span><strong>${esc(periodDate(p.ends_at))}</strong></div></div><div class="row evaluation-card-actions">${btn('questions',p.id,p.status==='draft'?'Edit questions':'View questions')}${p.status!=='closed'?btn('editPeriod',p.id,'Edit schedule'):''}${p.status==='draft'?btn('period:open',p.id,'Open evaluation','positive'):''}${p.status==='open'?btn('period:closed',p.id,'Close evaluation','danger'):''}</div></div></details>`).join(''):'<div class="empty"><strong>No evaluations yet</strong>Choose another year or semester, or create a draft.</div>';
 });
}
$('#periodForm').onsubmit=e=>{e.preventDefault();safely(async()=>{
 await call('/periods',{method:'POST',data:formData(e.target)});e.target.reset();toast('Draft period created. Review its questions.','success');await loadPeriods();
});};
async function editQuestions(pid){
 if(!periods.length)await loadPeriods();
 const period=periods.find(p=>Number(p.id)===pid),data=await call('/periods/'+pid+'/questions');
 if(!period)throw Error('Period not found.');
 const editable=period.status==='draft',wrap=document.createElement('div');wrap.className='question-builder';
 wrap.innerHTML='<div class="builder-intro"><span class="eyebrow">QUESTIONS BY CATEGORY</span><p>Each category contains several numbered questions. Students rate every question from 1 to 5.</p></div><div id="questionGroups"></div><div class="row builder-controls">'+(editable?'<button type="button" class="btn secondary" id="addCategory">+ Add category</button><button type="button" class="btn secondary" id="useTemplate">Use 3 categories with 5 questions each</button><button type="button" class="btn" id="saveQuestions">Save questionnaire</button>':'')+'</div>';
 const modal=makeModal('Shared evaluation questions',wrap),groups=wrap.querySelector('#questionGroups');
 function addCategory(name,questions=[]){
  const group=document.createElement('section');group.className='question-category';
  group.innerHTML='<div class="field"><label>Category name</label><input class="category-name" maxlength="80" placeholder="e.g. Quality of Teaching" '+(editable?'':'disabled')+'></div><div class="category-questions"></div>'+(editable?'<button type="button" class="btn secondary small add-category-question">+ Add question in this category</button>':'');
  group.querySelector('.category-name').value=name;
  const rows=group.querySelector('.category-questions');
  function renumber(){[...rows.children].forEach((row,i)=>row.querySelector('label').textContent='Question '+(i+1));}
  function addQuestion(text=''){
   const row=document.createElement('div');row.className='category-question';
   row.innerHTML='<div class="field"><label></label><textarea class="qtext" rows="2" maxlength="500" placeholder="Enter a question statement" '+(editable?'':'disabled')+'></textarea></div>'+(editable?'<button type="button" class="btn danger small">Remove</button>':'');
   row.querySelector('textarea').value=text;
   if(editable)row.querySelector('button').onclick=()=>{row.remove();renumber();};
   rows.append(row);renumber();
  }
  questions.forEach(addQuestion);
  if(editable)group.querySelector('.add-category-question').onclick=()=>addQuestion();
  groups.append(group);
 }
 const grouped=new Map();data.forEach(q=>{if(!grouped.has(q.category))grouped.set(q.category,[]);grouped.get(q.category).push(q.question_text);});
 grouped.forEach((questions,name)=>addCategory(name,questions));
 if(editable){
  wrap.querySelector('#addCategory').onclick=()=>addCategory('', ['']);
  wrap.querySelector('#useTemplate').onclick=()=>safely(async()=>{
   const response=await fetch('/assets/questionnaire-template.json');if(!response.ok)throw Error('Unable to load question template.');
   const template=await response.json();
   if(!confirm('Replace the questions shown here with 3 categories of 5 questions? Changes take effect only when you save.'))return;
   groups.replaceChildren();Object.entries(template).forEach(([name,questions])=>addCategory(name,questions));
  });
  wrap.querySelector('#saveQuestions').onclick=()=>safely(async()=>{
   const questions=[];
   for(const group of groups.children){
    const category=group.querySelector('.category-name').value.trim();
    if(!category)throw Error('Enter a name for each category.');
    const prompts=[...group.querySelectorAll('.qtext')];
    if(!prompts.length)throw Error('Add at least one question in '+category+'.');
    for(const prompt of prompts){const text=prompt.value.trim();if(text.length<5)throw Error('Each question needs at least five characters.');questions.push({category,text});}
   }
   if(!questions.length||questions.length>60)throw Error('Provide 1 to 60 questions.');
   await call('/periods/'+pid+'/questions',{method:'PUT',data:{questions}});modal.remove();toast('Questionnaire saved for all instructors.','success');
  });
 }
}
async function editPeriod(pid){
 const p=periods.find(r=>Number(r.id)===pid);if(!p)throw Error('Period not found.');
 const wrap=document.createElement('div');
 const dt=v=>esc(String(v??'').slice(0,16).replace(' ','T'));
 wrap.innerHTML=`<form id="editPeriodForm"><div class="field"><label>Evaluation title</label><input name="title" value="${esc(p.title)}" required></div><div class="form-grid period-fields"><div class="field"><label>School year begins</label><select name="startYear" required>${yearOptions(p.school_year)}</select></div><div class="field"><label>Start date & time</label><input type="datetime-local" name="startsAt" value="${dt(p.starts_at)}" required></div><div class="field"><label>End date & time</label><input type="datetime-local" name="endsAt" value="${dt(p.ends_at)}" required></div></div><div class="field"><label>Semester</label><select name="semester" required>${['1st Semester','2nd Semester','Summer','Full Year'].map(t=>`<option ${t===p.semester?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label>Students required per subject</label><input type="number" name="requiredStudents" min="1" max="10000" step="1" value="${Number(p.required_students)}" ${p.status==='draft'?'':'readonly'} required><small>The student count is locked after opening.</small></div><button class="btn wide">Save period details</button></form>`;
 const modal=makeModal('Edit evaluation schedule',wrap);
 wrap.querySelector('form').onsubmit=e=>{e.preventDefault();safely(async()=>{
  await call(`/periods/${pid}`,{method:'PATCH',data:formData(e.target)});modal.remove();toast('Evaluation schedule updated.','success');await loadPeriods();
 });};
}
function reportMatches(record,{search='',department='',period=''}={}){
 const text=[record.faculty_name,record.department,record.subject_code,record.subject_name,record.section_name,record.period_title].filter(Boolean).join(' ').toLowerCase();
 return (!search.trim()||text.includes(search.trim().toLowerCase()))&&(!department||record.department===department)&&(!period||String(record.period_id)===String(period));
}
async function loadReports(){
 periods=await call('/periods');
 const select=$('#reportPeriod'),selected=select.value;
 select.innerHTML='<option value="">All evaluations</option>'+periods.map(p=>`<option value="${p.id}">${esc(p.title)} - ${esc(p.school_year)} - ${esc(p.semester)}</option>`).join('');select.value=selected;
 const [rows,faculty]=await Promise.all([call('/reports'),call('/faculty')]);
 reports=rows.map(r=>{const p=periods.find(p=>String(p.id)===String(r.period_id)),person=faculty.find(f=>String(f.id)===String(r.faculty_id));return {...r,department:r.department??person?.department,required_students:r.required_students??p?.required_students,school_year:r.school_year??p?.school_year,semester:r.semester??p?.semester};});
 const department=$('#reportDepartment'),previous=department.value;
 const departments=[...new Set(['IT DEPARTMENT','CRIMINOLOGY DEPARTMENT','HM DEPARTMENT','EDUCATION DEPARTMENT','TOURISM DEPARTMENT','ICT DEPARTMENT',...faculty.map(f=>f.department),...reports.map(r=>r.department)].filter(Boolean))].sort();
 department.innerHTML='<option value="">All departments</option>'+departments.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');department.value=departments.includes(previous)?previous:'';
 termFilters('reportTerm',periods,matches=>{
  function render(){
   visibleReports=reports.filter(matches).filter(r=>reportMatches(r,{search:$('#reportSearch').value,department:department.value,period:select.value}));
 $('#reportList').innerHTML=table(['Instructor','Subject / Section','Period','Student progress','Rating / 5','Details'],visibleReports.map(r=>`<tr><td><strong>${esc(r.faculty_name)}</strong><br><small>${esc(r.department||'Not specified')}</small></td><td>${esc(r.subject_code)} – ${esc(r.subject_name)}<br><small>${esc(r.year_level)} · ${esc(r.section_name)}</small></td><td>${esc(r.period_title)}<br><small>${esc(r.school_year||'')} / ${esc(r.semester||'')}</small></td><td>${responseProgress(r)}</td><td><strong>${r.average_rating==null?'—':Number(r.average_rating).toFixed(2)+'/5'}</strong><small class="rating-state">${Number(r.response_count)>=Number(r.required_students)?'Final rating':'In progress'}</small></td><td>${btn('details',r.id,'View')}</td></tr>`));
   if(!visibleReports.length)$('#reportList').innerHTML='<div class="empty"><strong>No matching reports</strong>Try another search or reset the filters.</div>';
   const summary=$('#reportTermYear').closest('.term-filter-box').querySelector('.term-filter-summary');summary.textContent=visibleReports.length+' report'+(visibleReports.length===1?'':'s')+' found';
   summary.closest('.term-filter-box').querySelector('.term-filter-reset').disabled=false;
  }
  $('#reportSearch').oninput=render;department.onchange=render;select.onchange=render;render();
 },reports);
 const reset=$('#reportTermYear').closest('.term-filter-box').querySelector('.term-filter-reset'),resetTerms=reset.onclick;
 reset.disabled=false;
 reset.onclick=()=>{$('#reportSearch').value='';department.value='';select.value='';resetTerms();reset.disabled=false;};
}
$('#printReports').onclick=()=>window.print();
async function showDetail(id){
 const data=await call(`/results/${id}`);if(!data.assignment)throw Error(data.message||'Assignment not found.');
 const a=data.assignment,wrap=document.createElement('div');
 wrap.innerHTML=`<p><strong>${esc(a.faculty_name)} · ${esc(a.subject_code)} · ${esc(a.section_name)}</strong></p>${ratingSummary(data)}${table(['Question','Average / 5','Answers'],data.questions.map(q=>`<tr><td>${esc(q.question_text)}<br><small>${esc(q.category)}</small></td><td>${q.average_rating??'—'}</td><td>${q.ratings}</td></tr>`))}<div class="result-comments"></div>`;
 renderResultComments(wrap.querySelector('.result-comments'),data.comments||[]);
 makeModal('Evaluation Results',wrap);
}
async function renderAdminPhoto(img,facultyId){
 try{const r=await fetch(`/api/admin/faculty/${facultyId}/photo`,{headers:{Authorization:`Bearer ${getToken()}`}});if(!r.ok)return;
  const blob=await r.blob();const u=URL.createObjectURL(blob);img.onload=()=>URL.revokeObjectURL(u);img.src=u;
 }catch{/* The avatar fallback remains visible. */}
}
async function showFacultyProfile(personId){
 const records=await call('/faculty');const r=records.find(x=>Number(x.id)===personId);if(!r)return;
 const wrap=document.createElement('div');
 wrap.innerHTML=`<div class="profile-summary"><img src="/assets/avatar.svg" id="adminProfilePhoto" class="profile-avatar" alt="Instructor photo"><div><h2>${esc(r.full_name)}</h2><p>${esc(r.designation||'Instructor')} · ${esc(r.department||'')}</p>${pill(r.status)}</div></div><div class="profile-facts"><div><small>Full name</small><strong>${esc(r.full_name)}</strong></div><div><small>Faculty ID</small><strong>${esc(r.employee_id||'Not provided')}</strong></div><div><small>Email</small><strong>${esc(r.email)}</strong></div><div><small>Contact</small><strong>${esc(r.contact_number||'Not provided')}</strong></div><div><small>Department</small><strong>${esc(r.department||'Not provided')}</strong></div><div><small>Position</small><strong>${esc(r.designation||'Instructor')}</strong></div></div>`;
 makeModal('Instructor profile',wrap);if(r.has_photo)void renderAdminPhoto(wrap.querySelector('#adminProfilePhoto'),r.id);
}
document.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;const [action,status]=b.dataset.action.split(':'),rid=Number(b.dataset.id);
 safely(async()=>{
  if(action==='profile')return showFacultyProfile(rid);

  if(action==='questions')return editQuestions(rid);
  if(action==='editPeriod')return editPeriod(rid);
  if(action==='details')return showDetail(rid);
  if(!confirm(`Continue with ${status} for this record?`))return;
  if(action==='faculty')await call(`/faculty/${rid}/status`,{method:'PATCH',data:{status}});
  if(action==='assignment')await call(`/assignments/${rid}/status`,{method:'PATCH',data:{status}});
  if(action==='period')await call(`/periods/${rid}/status`,{method:'PATCH',data:{status}});
  toast('Saved successfully.','success');await load(action==='faculty'?'facultyAccounts':action==='assignment'?'assignments':'periods');
 });
});
$('#refreshOverview').onclick=()=>load('overview');$('#refreshFaculty').onclick=()=>load('facultyAccounts');$('#refreshAssignments').onclick=()=>load('assignments');$('#refreshReports').onclick=()=>load('reports');
safely(async()=>{const me=await call('/me');$('#who').textContent=me.full_name;await load('overview');});
