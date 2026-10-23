'use strict';
requireRole('faculty');
const call=(route,options)=>privateApi('/faculty'+route,options);
let periods=[],assignments=[];
const safe=async(fn)=>{try{await fn();}catch(e){toast(e.message,'error');}};
$('#logout').onclick=()=>signOut('faculty');
$('nav').addEventListener('click',e=>{const b=e.target.closest('button[data-section]');if(!b)return;showTab(b.dataset.section);void load(b.dataset.section);});
const action=(id,command,label,cls='secondary')=>`<button class="btn small ${cls}" data-action="${command}" data-id="${id}">${esc(label)}</button>`;
function renderEvaluationNotices(){
 const open=periods.filter(p=>p.status==='open');
 $('#evaluationNotices').innerHTML=open.map(p=>`<div class="evaluation-alert"><span class="evaluation-alert-icon" aria-hidden="true">!</span><div><strong>Evaluation is now open</strong><p>${esc(p.title)}: ${p.accepted_at?'Add your teaching subjects. Each subject needs '+Number(p.required_students)+' responses for its final rating.':'Accept this evaluation to start adding your teaching subjects.'}</p></div>${p.accepted_at?'<button type="button" class="btn small" data-jump="teaching">Manage subjects</button>':action(p.id,'accept','Accept & add subjects','positive')}</div>`).join('');
}
async function fetchPeriods(){periods=await call('/periods');renderEvaluationNotices();}
async function fetchAssignments(){assignments=await call('/assignments');}
function ratingTotals(rows,periods){
 const records=rows.map(a=>({...a,required_students:a.required_students??periods.find(p=>String(p.id)===String(a.period_id))?.required_students}));
 const responses=records.reduce((n,a)=>n+(Number(a.response_count)||0),0);
 const known=records.every(a=>Number.isInteger(Number(a.required_students))&&Number(a.required_students)>0);
 const target=known?records.reduce((n,a)=>n+Number(a.required_students),0):null;
 const remaining=known?records.reduce((n,a)=>n+Math.max(0,Number(a.required_students)-(Number(a.response_count)||0)),0):null;
 const completed=records.filter(a=>Number(a.required_students)>0&&Number(a.response_count)>=Number(a.required_students)).length;
 return {records,responses,target,remaining,completed};
}
async function load(tab){await safe(async()=>{
 if(tab==='overview'){
  await Promise.all([fetchPeriods(),fetchAssignments()]);
  assignments=assignments.map(a=>{const p=periods.find(p=>String(p.id)===String(a.period_id));return {...a,required_students:a.required_students??p?.required_students,school_year:a.school_year??p?.school_year,semester:a.semester??p?.semester};});
  const responses=assignments.reduce((sum,a)=>sum+Number(a.response_count||0),0),rated=assignments.filter(a=>a.average_rating!=null);
  const average=rated.length?(rated.reduce((sum,a)=>sum+Number(a.average_rating)*Number(a.response_count),0)/Math.max(1,rated.reduce((sum,a)=>sum+Number(a.response_count),0))).toFixed(2):'—';
  const items=[['Teaching assignments',assignments.length],['Approved subjects',assignments.filter(a=>a.status==='approved').length],['Student responses',responses],['Overall rating',average]];
  $('#facultyRingValue').textContent=average==='—'?'—':average;updateRing($('#facultyRing'),average==='—'?0:average);$('#facultyResponseCount').textContent=`${moneyNumber(responses)} student responses`;
  $('#facultyBars').innerHTML=`<div class="rating-row"><span>Average</span><div class="rating-track"><div style="width:${average==='—'?0:Number(average)/5*100}%"></div></div><strong>${esc(average)} / 5</strong></div><div class="rating-row"><span>Approved</span><div class="rating-track"><div style="width:${assignments.length?assignments.filter(a=>a.status==='approved').length/assignments.length*100:0}%"></div></div><strong>${assignments.filter(a=>a.status==='approved').length}</strong></div>`;
  $('#facultyStats').innerHTML=items.map(([label,value])=>`<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');const history=await call('/analytics');drawYearBars($('#facultyHistoryBars'),history);
  $('#facultyPeriods').innerHTML=periods.length?periods.map(p=>`<div class="list-card"><div class="row spaced"><strong>${esc(p.title)}</strong>${p.accepted_at?'<span class="pill approved">Accepted</span>':pill(p.status)}</div><p>${esc(p.school_year)} / ${esc(p.semester)} &middot; ${Number(p.required_students)} students per subject</p><small>Evaluation: ${niceDate(p.starts_at)} — ${niceDate(p.ends_at)} (Manila time)</small><div class="row" style="margin-top:.65rem">${!p.accepted_at&&p.status==='open'?action(p.id,'accept','Accept evaluation','positive'):p.accepted_at?'<span class="muted">Questionnaire received</span>':''}</div></div>`).join(''):'<div class="empty"><strong>No available evaluations</strong>Admin has not opened a period yet.</div>';
 }
 if(tab==='profile')await loadProfile();
 if(tab==='teaching'){
  await Promise.all([fetchPeriods(),fetchAssignments()]);
  assignments=assignments.map(a=>{const p=periods.find(p=>String(p.id)===String(a.period_id));return {...a,required_students:a.required_students??p?.required_students,school_year:a.school_year??p?.school_year,semester:a.semester??p?.semester};});
  const available=periods.filter(p=>p.status==='open'&&p.accepted_at);
  const select=$('#assignPeriod');select.innerHTML='<option value="">Choose an evaluation</option>'+available.map(p=>`<option value="${p.id}">${esc(p.title)} - ${esc(p.school_year)} - ${esc(p.semester)} (${Number(p.required_students)} responses per subject)</option>`).join('');
  $('#assignmentForm button[type="submit"]').disabled=!available.length;
  $('#assignPeriod').disabled=!available.length;
  $('#assignmentAvailability').hidden=available.length>0||periods.some(p=>p.status==='open');
  $('#assignmentAvailability').textContent='No open evaluations yet. Your administrator will open one soon.';
  termFilters('teachingTerm',periods,matches=>{const filtered=assignments.filter(matches);
  $('#myAssignments').innerHTML=filtered.length?filtered.map(a=>`<details class="subject-card" name="teaching-subject"><summary><div class="subject-card-title"><strong>${esc(a.subject_code)} &middot; ${esc(a.section_name)}</strong><span>${esc(a.subject_name)} &middot; ${Number(a.response_count)||0} responses</span></div><div class="subject-card-summary">${pill(a.status)}<span class="subject-view"><span class="subject-view-closed">View</span><span class="subject-view-open">Hide</span><span aria-hidden="true">&#8964;</span></span></div></summary><div class="subject-card-body"><section class="subject-info-box"><h3>Subject information</h3><dl class="subject-details"><div><dt>Year level</dt><dd>${esc(a.year_level)}</dd></div><div><dt>Evaluation</dt><dd>${esc(a.period_title)}<br>${esc([a.school_year,a.semester].filter(Boolean).join(' / '))}</dd></div><div><dt>Student progress</dt><dd>${responseProgress(a)}</dd></div></dl></section>${a.link?`<div class="share-url"><label for="url-${a.id}">Student link</label><input id="url-${a.id}" readonly aria-label="Student evaluation link for ${esc(a.subject_code)}" value="${esc(new URL(a.link,location.origin).href)}" onclick="this.select()"><div class="row"><button class="btn small" data-action="copy" data-id="${a.id}">Copy link</button><button class="btn secondary small" data-action="open" data-id="${a.id}">Preview form ↗</button></div>${a.period_status!=='open'?'<small class="notice warning">Evaluation closed.</small>':''}${['localhost','127.0.0.1'].includes(location.hostname)?'<small class="notice warning">For other devices, share using your school website or network address.</small>':''}</div>`:a.status==='pending'?'<div class="notice warning">Waiting for admin approval.</div>':a.status==='rejected'?'<div class="notice error">This assignment was not approved. Edit and resubmit it.</div>':''}${['pending','rejected'].includes(a.status)&&a.period_status==='open'?`<div class="row" style="margin-top:.6rem">${action(a.id,'edit','Edit assignment')}${action(a.id,'delete','Delete','danger')}</div>`:''}</div></details>`).join(''):'<div class="empty assignment-empty"><span class="empty-subject-icon" aria-hidden="true">&#9638;</span><strong>No subjects for this selection</strong><p>Choose another school year or semester, or add a subject.</p></div>';
  },assignments);
 }
 if(tab==='results'){
  await Promise.all([fetchPeriods(),fetchAssignments()]);
  assignments=assignments.map(a=>{const p=periods.find(p=>String(p.id)===String(a.period_id));return {...a,required_students:a.required_students??p?.required_students,school_year:a.school_year??p?.school_year,semester:a.semester??p?.semester};});
  const select=$('#resultPeriod'),selected=select.value;
  select.innerHTML='<option value="">All periods</option>'+periods.map(p=>`<option value="${p.id}">${esc(p.title)} - ${esc(p.school_year)} - ${esc(p.semester)}</option>`).join('');select.value=selected;
  const totals=ratingTotals(assignments.filter(a=>!selected||String(a.period_id)===selected),periods),rows=totals.records;
  const cards=[['Required responses',totals.target??'Unavailable','Student slots across your subjects'],['Responses received',totals.responses,'Submitted student evaluations'],['Still needed',totals.remaining??'Unavailable','Responses needed to finish'],['Completed subjects',totals.completed+' / '+rows.length,'Subjects with a final rating']];
  $('#ratingStats').innerHTML=cards.map(([label,value,note])=>`<article class="rating-summary-card"><span>${label}</span><strong>${esc(value)}</strong><small>${note}</small></article>`).join('');
  $('#myResults').innerHTML=rows.length?`<table><thead><tr><th>Subject / Section</th><th>Period</th><th>Student progress</th><th>Rating / 5</th><th>Details</th></tr></thead><tbody>${rows.map(a=>`<tr><td><strong>${esc(a.subject_code)} – ${esc(a.subject_name)}</strong><br><small>${esc(a.year_level)} · ${esc(a.section_name)}</small></td><td>${esc(a.period_title)}</td><td>${responseProgress(a)}</td><td><strong>${a.average_rating==null?'—':Number(a.average_rating).toFixed(2)+'/5'}</strong><small class="rating-state">${Number(a.response_count)>=Number(a.required_students)?'Final rating':'In progress'}</small></td><td>${action(a.id,'details','View results')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty"><strong>No ratings yet</strong>Your subjects and results will appear here.</div>';
 }
 });}
$('#assignmentForm').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;safe(async()=>{
 const d=formData(form);await call('/assignments',{method:'POST',data:d});form.reset();toast('Subject submitted for admin approval.','success');await load('teaching');
 });});
$('#resultPeriod').onchange=()=>load('results');
async function loadProfile(){
 const d=await call('/profile');
 $('#profileName').textContent=d.full_name;
 $('#profileDepartment').textContent=d.department||'Instructor';
 $('#facultyAvatar').src=d.has_photo?photoUrl(d.id)+'?v='+Date.now():'/assets/avatar.svg';
 const fields=[['First name',d.first_name],['Last name',d.last_name],['Middle name',d.middle_name],['Faculty ID',d.employee_id],['Email address',d.email],['Contact number',d.contact_number],['Department',d.department],['Position',d.designation]];
 $('#profileDetails').innerHTML=fields.map(([label,value])=>`<div><small>${esc(label)}</small><strong>${esc(value||'Not provided')}</strong></div>`).join('');
 $('#welcomeName').textContent=(d.first_name||d.full_name||'Instructor').split(' ')[0];
}
async function copyLink(value){
 try{await navigator.clipboard.writeText(value);}catch{
  const el=document.createElement('textarea');el.value=value;el.style.position='fixed';el.style.opacity='0';document.body.append(el);el.select();const ok=document.execCommand('copy');el.remove();if(!ok)throw Error('Could not copy. Your link is: '+value);
 }
}

$('#refreshHome').onclick=()=>load('overview');$('#refreshTeaching').onclick=()=>load('teaching');$('#refreshResults').onclick=()=>load('results');
async function showResults(recordId){
 const data=await call(`/results/${recordId}`);if(!data.assignment)return toast(data.message||'Could not load results.','error');
 const a=data.assignment,wrap=document.createElement('div');
 wrap.innerHTML=`<p><strong>${esc(a.subject_name)} · ${esc(a.section_name)}</strong></p>${ratingSummary(data)}<h3>Question ratings</h3><div class="table-wrap"><table><thead><tr><th>Question</th><th>Avg.</th><th>Responses</th></tr></thead><tbody>${data.questions.map(q=>`<tr><td>${esc(q.question_text)}<br><small>${esc(q.category)}</small></td><td>${q.average_rating??'—'}</td><td>${q.ratings}</td></tr>`).join('')}</tbody></table></div><div class="result-comments"></div>`;
 renderResultComments(wrap.querySelector('.result-comments'),data.comments||[]);
 makeModal('My evaluation results',wrap);
}
async function editAssignment(recordId){
 const a=assignments.find(r=>Number(r.id)===recordId);if(!a)return;
 const wrap=document.createElement('div');
 wrap.innerHTML=`<form><div class="field"><label>Subject code</label><input name="subjectCode" value="${esc(a.subject_code)}" maxlength="35" required></div><div class="field"><label>Subject name</label><input name="subjectName" value="${esc(a.subject_name)}" maxlength="170" required></div><div class="field"><label>Year level</label><input name="yearLevel" value="${esc(a.year_level)}" required></div><div class="field"><label>Section</label><input name="section" value="${esc(a.section_name)}" maxlength="70" required></div><button class="btn wide">Save and resubmit for approval</button></form>`;
 const modal=makeModal('Correct teaching assignment',wrap);
 wrap.querySelector('form').onsubmit=e=>{e.preventDefault();safe(async()=>{
  await call(`/assignments/${recordId}`,{method:'PATCH',data:formData(e.target)});modal.remove();toast('Assignment sent for admin review.','success');await load('teaching');
 });};
}
async function codeSettings(recordId){
 const a=assignments.find(a=>Number(a.id)===recordId);if(!a)return;
 const wrap=document.createElement('div');wrap.innerHTML=`<p>Subject: <strong>${esc(a.subject_code)} · ${esc(a.section_name)}</strong></p><div class="notice warning">Public links are easy to share but can receive repeated submissions. Turn on one-time codes BEFORE students start evaluating if you want stronger protection. Each student needs their own code; codes are shown only once.</div><p>Current mode: <strong>${a.requires_code?'One-time code required':'Open public link'}</strong></p><button id="toggleCode" class="btn secondary">${a.requires_code?'Use open link instead':'Require one-time codes'}</button><div class="divider"></div><div class="field"><label>Generate one-time access codes (1–100)</label><input id="codeCount" type="number" min="1" max="100" value="30"></div><button id="createCodes" class="btn" ${!a.requires_code?'disabled':''}>Generate codes</button><pre id="newCodes" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><button id="copyCodes" class="btn secondary hidden">Copy all codes</button>`;
 const modal=makeModal('Evaluation link settings',wrap);
 wrap.querySelector('#toggleCode').onclick=()=>safe(async()=>{
  await call(`/assignments/${recordId}/code-mode`,{method:'PATCH',data:{enabled:!Boolean(a.requires_code)}});modal.remove();toast('Evaluation link settings updated.','success');await load('teaching');
 });
 wrap.querySelector('#createCodes').onclick=()=>safe(async()=>{
  const count=Number(wrap.querySelector('#codeCount').value);const data=await call(`/assignments/${recordId}/codes`,{method:'POST',data:{count}});
  wrap.querySelector('#newCodes').textContent=data.codes.join('\n');wrap.querySelector('#copyCodes').classList.remove('hidden');toast('Codes generated. Save them now.','success');
 });
 wrap.querySelector('#copyCodes').onclick=()=>safe(async()=>{await navigator.clipboard.writeText(wrap.querySelector('#newCodes').textContent);toast('Codes copied.','success');});
}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-action]');if(!btn)return;const task=btn.dataset.action,recordId=Number(btn.dataset.id);
 safe(async()=>{
  if(task==='accept'){await call(`/periods/${recordId}/accept`,{method:'POST'});toast('Evaluation accepted! Add your subjects next.','success');await load('overview');showTab('teaching');await load('teaching');}
  if(task==='open'){const a=assignments.find(a=>Number(a.id)===recordId);if(a?.link)window.open(new URL(a.link,location.origin).href,'_blank','noopener');}
  if(task==='copy'){const a=assignments.find(a=>Number(a.id)===recordId);if(!a?.link)throw Error('Wait for admin approval before sharing.');await copyLink(new URL(a.link,location.origin).href);toast(['localhost','127.0.0.1'].includes(location.hostname)?'Link copied. Use a hosted site or reachable network IP for student phones.':'Student link copied!','success');}
  if(task==='details')await showResults(recordId);
  if(task==='edit')await editAssignment(recordId);
  if(task==='delete'){if(confirm('Remove this teaching assignment?')){await call(`/assignments/${recordId}`,{method:'DELETE'});toast('Assignment removed.','success');await load('teaching');}}
  if(task==='codes')await codeSettings(recordId);
 });
});
safe(async()=>{const me=await call('/me');$('#who').textContent=me.full_name;await load('overview');});

let noticeRefreshRunning=false;
setInterval(async()=>{
 if(document.hidden||noticeRefreshRunning)return;
 noticeRefreshRunning=true;
 try{const latest=await call('/periods');const changed=JSON.stringify(latest)!==JSON.stringify(periods);periods=latest;renderEvaluationNotices();if(changed&&$('#teaching').classList.contains('active'))await load('teaching');}catch{/* Retry on the next refresh. */}finally{noticeRefreshRunning=false;}
},30000);
