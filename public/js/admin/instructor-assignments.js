async function renderInstructorAssignments(program,content){
 const base=`/api/admin/${program}`,isCwts=program==='cwts',name=i=>[i.first_name,i.middle_name,i.last_name].filter(Boolean).join(' ');
 let data,request=0;
 let listFilters={year:'',level:'',status:'',search:''};
 async function load(scheduleId){const current=++request;const result=await API.get(`${base}/instructor-assignments${scheduleId?`?schedule_id=${Number(scheduleId)}`:''}`);if(current!==request)return;data=result;draw();}
 function dialog(title,markup){
  const e=document.createElement('dialog');e.className='instructor-dialog';e.setAttribute('aria-label',title);
  e.innerHTML=`<header><h3>${esc(title)}</h3><button type="button" data-close aria-label="Close">&times;</button></header>${markup}`;
  const previous=document.activeElement;e.querySelector('[data-close]').onclick=()=>e.close();e.addEventListener('close',()=>{e.remove();previous?.focus();});document.body.append(e);e.showModal();return e;
 }
 function reviewAccount(instructor){
  const isPending=instructor.review_status==='pending';
  const controls=isPending?`<label>Review Note<textarea data-note rows="3" maxlength="500" placeholder="Required when rejecting"></textarea></label><div class="instructor-error hidden" role="alert"></div><div class="instructor-actions"><button class="btn" data-decision="rejected">Reject</button><button class="btn primary" data-decision="approved">Approve Account</button></div>`:`<dl><dt>Status</dt><dd>${esc(instructor.review_status==='approved'?'Approved':'Rejected')}</dd>${instructor.review_note?'<dt>Review Note</dt><dd>'+esc(instructor.review_note)+'</dd>':''}</dl>`;

  const e=dialog(isPending?'Review Instructor':'Instructor Details',`<div class="review-detail"><div class="review-profile">${instructor.has_photo?`<img src="${base}/instructors/${Number(instructor.id)}/photo" alt="Instructor portrait">`:''}<div><strong>${esc(name(instructor))}</strong><div>${esc(instructor.email)}</div></div></div><dl><dt>Component</dt><dd>${program.toUpperCase()}</dd><dt>School Year</dt><dd>${esc(instructor.requested_year||'Not provided')}</dd><dt>Level</dt><dd>${esc(instructor.requested_level||'Not provided')}</dd></dl>${controls}</div>`);
  e.querySelectorAll('[data-decision]').forEach(button=>button.onclick=async()=>{
   e.querySelectorAll('[data-decision]').forEach(b=>b.disabled=true);
   try{const result=await API.patch(`${base}/instructors/${Number(instructor.id)}/review`,{decision:button.dataset.decision,note:e.querySelector('[data-note]').value});e.close();toast(result.message);await load(data.schedule?.id);}
   catch(error){const msg=e.querySelector('[role=alert]');msg.textContent=error.message;msg.classList.remove('hidden');e.querySelectorAll('[data-decision]').forEach(b=>b.disabled=false);}
  });
 }
 function assign(company,current){
  const instructors=data.instructors.filter(i=>i.status==='active'&&i.review_status==='approved');
  if(!instructors.length){toast('Approve an instructor registration first.',true);return;}
  const cycle=data.schedule;
  let selectedInstructorId=instructors.some(i=>Number(i.id)===Number(current?.instructor_id))?Number(current.instructor_id):null;
  const e=dialog(current?'Change Instructor':'Assign Instructor',`<form class="instructor-form"><div class="instructor-scope full"><strong>${isCwts?esc(company)+' Company':'All ROTC students'}</strong><span>NSTP ${esc(cycle.ms_level)} &middot; ${esc(cycle.year)}</span></div><label class="full">Search Instructor<input type="search" name="instructor_search" placeholder="Type an instructor's name or email" autocomplete="off" aria-controls="instructorMatches"></label><div class="instructor-picker full"><div class="instructor-picker-heading"><strong>Choose an instructor</strong><small class="instructor-search-status" data-search-status role="status" aria-live="polite"></small></div><button class="instructor-picker-toggle" type="button" data-picker-toggle aria-expanded="false" aria-controls="instructorMatches"><span data-picker-selection>Select instructor</span><span aria-hidden="true">&#9662;</span></button><fieldset class="instructor-picker-results" id="instructorMatches" hidden><legend class="sr-only">Available instructors</legend><div data-instructor-results></div></fieldset></div><div class="instructor-error hidden" role="alert"></div><div class="instructor-actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary" disabled>Save Assignment</button></div></form>`);
  e.querySelector('[data-cancel]').onclick=()=>e.close();
  const form=e.querySelector('form'),search=form.elements.instructor_search,status=form.querySelector('[data-search-status]'),results=form.querySelector('[data-instructor-results]'),saveButton=form.querySelector('[type=submit]');
  const picker=form.querySelector('#instructorMatches'),toggle=form.querySelector('[data-picker-toggle]'),selection=form.querySelector('[data-picker-selection]');
  function setPickerOpen(open){picker.hidden=!open;toggle.setAttribute('aria-expanded',String(open));}
  function showSelection(){const selected=instructors.find(i=>Number(i.id)===selectedInstructorId);selection.textContent=selected?name(selected):'Select instructor';}
  toggle.onclick=()=>setPickerOpen(picker.hidden);
  e.addEventListener('cancel',event=>{if(!picker.hidden){event.preventDefault();setPickerOpen(false);toggle.focus();}});
  function drawMatches(){
   const terms=search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
   const matches=instructors.filter(i=>terms.every(term=>(name(i)+' '+i.email).toLowerCase().includes(term)));
   if(!matches.some(i=>Number(i.id)===selectedInstructorId))selectedInstructorId=null;
   status.textContent=matches.length+' found';
   results.innerHTML=matches.map(i=>`<label class="instructor-picker-option"><input type="radio" name="instructor_id" value="${Number(i.id)}" ${Number(i.id)===selectedInstructorId?'checked':''} required><span class="instructor-picker-avatar">${i.has_photo?`<img src="${base}/instructors/${Number(i.id)}/photo" alt="" loading="lazy">`:`<span aria-hidden="true">${esc([i.first_name?.[0],i.last_name?.[0]].filter(Boolean).join(''))}</span>`}</span><span class="instructor-picker-person"><strong>${esc(name(i))}</strong><small>${esc(i.email)}</small></span></label>`).join('')||'<div class="instructor-picker-empty">No instructors found. Try another name or email.</div>';
   saveButton.disabled=selectedInstructorId===null;showSelection();
   results.querySelectorAll('[name=instructor_id]').forEach(radio=>radio.onchange=()=>{selectedInstructorId=Number(radio.value);saveButton.disabled=false;showSelection();setPickerOpen(true);form.querySelector('[role=alert]').classList.add('hidden');});
  }
  search.oninput=()=>{drawMatches();setPickerOpen(true);};search.onfocus=()=>setPickerOpen(true);drawMatches();setPickerOpen(false);
  form.onsubmit=async event=>{
   event.preventDefault();
   if(!instructors.some(i=>Number(i.id)===selectedInstructorId))return;
   saveButton.disabled=true;
   try{const result=await API.post(`${base}/instructor-assignments`,{schedule_id:cycle.id,instructor_id:selectedInstructorId,company});e.close();toast(result.message);await load(cycle.id);}
   catch(error){const msg=form.querySelector('[role=alert]');msg.textContent=error.message;msg.classList.remove('hidden');saveButton.disabled=false;}
  };
 }
 async function assignPerson(instructor){
  if(!data.schedules.length){toast('Create an enrollment schedule first.',true);return;}
  const e=dialog(isCwts?'Assign Company':'Assign Class',`<form class="instructor-form"><div class="instructor-scope full"><strong>${esc(name(instructor))}</strong></div><label>School Year<select name="year">${[...new Set(data.schedules.map(s=>s.year))].map(y=>`<option>${esc(y)}</option>`).join('')}</select></label><label>NSTP Level<select name="level"></select></label><select name="schedule" hidden aria-label="Selected schedule"></select><label class="full" data-company-label>${isCwts?'Company':'Class'}<select name="company" disabled></select></label><div class="instructor-error hidden" role="alert"></div><div class="instructor-actions"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary" type="submit" disabled>Assign</button></div></form>`);
  const form=e.querySelector('form'),schedule=form.elements.schedule,company=form.elements.company,save=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]');let cycleData,version=0;
  e.querySelector('[data-cancel]').onclick=()=>e.close();
  async function choices(){const current=++version;save.disabled=true;company.disabled=true;error.classList.add('hidden');try{const result=await API.get(base+'/instructor-assignments?schedule_id='+Number(schedule.value));if(current!==version||!e.isConnected)return;cycleData=result;const occupied=new Set(result.assignments.map(a=>a.company));const scopes=(isCwts?result.companies:['']).filter(company=>!occupied.has(company));company.innerHTML=scopes.map(c=>`<option value="${esc(c)}">${isCwts?esc(c)+' Company':'All ROTC students'}</option>`).join('')||'<option>No available companies</option>';company.disabled=!scopes.length;save.disabled=!scopes.length;if(!scopes.length){error.textContent='No unassigned companies for this school year and level.';error.classList.remove('hidden');}}catch(err){error.textContent=err.message;error.classList.remove('hidden');}}
  const year=form.elements.year,level=form.elements.level;
  function selectCycle(reset){
    if(reset){const levels=[...new Set(data.schedules.filter(s=>s.year===year.value).map(s=>String(s.ms_level)))].sort();level.innerHTML=levels.map(l=>`<option value="${l}">NSTP ${l}</option>`).join('');if(levels.includes(String(instructor.requested_level)))level.value=String(instructor.requested_level);}
    const cycle=data.schedules.find(s=>s.year===year.value&&String(s.ms_level)===level.value);schedule.innerHTML=cycle?`<option value="${Number(cycle.id)}"></option>`:'';return choices();
  }
  year.onchange=()=>selectCycle(true);level.onchange=()=>selectCycle(false);
  form.onsubmit=async event=>{event.preventDefault();if(!cycleData||Number(cycleData.schedule.id)!==Number(schedule.value))return;if(cycleData.assignments.some(a=>a.company===company.value)){toast('This company already has an instructor.',true);return;}save.disabled=true;schedule.disabled=true;year.disabled=true;level.disabled=true;company.disabled=true;try{const fresh=await API.get(base+'/instructor-assignments?schedule_id='+Number(schedule.value));if(fresh.assignments.some(a=>a.company===company.value))throw Error('This company already has an instructor. Select another company.');const result=await API.post(base+'/instructor-assignments',{schedule_id:Number(schedule.value),instructor_id:Number(instructor.id),company:company.value});e.close();toast(result.message);await load(Number(schedule.value));}catch(err){error.textContent=err.message;error.classList.remove('hidden');save.disabled=false;schedule.disabled=false;year.disabled=false;level.disabled=false;company.disabled=false;}};
  if([...year.options].some(o=>o.value===instructor.requested_year))year.value=instructor.requested_year;
  await selectCycle(true);
 }
 function draw(){
  const counts=[['Total',data.instructors.length,'total'],['Pending',data.instructors.filter(i=>i.review_status==='pending').length,'pending'],['Approved',data.instructors.filter(i=>i.review_status==='approved').length,'approved'],['Rejected',data.instructors.filter(i=>i.review_status==='rejected').length,'rejected']];
  const years=[...new Set(data.instructors.map(i=>i.requested_year).filter(Boolean))].sort().reverse();
  const avatar=i=>`<span class="instructor-avatar">${i.has_photo?`<img src="${base}/instructors/${Number(i.id)}/photo" alt="" loading="lazy">`:`<span>${esc((i.first_name?.[0]||'')+(i.last_name?.[0]||''))}</span>`}</span>`;
  content.innerHTML=`<div class="instructor-overview">${counts.map(([label,total,tone])=>`<article class="instructor-overview-card ${tone}"><small>${label}</small><strong>${total}</strong></article>`).join('')}</div><div class="instructor-workspace"><section class="instructor-panel"><div class="instructor-grade-style-filters"><header><span aria-hidden="true">&#9776;</span><h2>Filter Instructors</h2></header><div class="instructor-filter-row instructor-list-filters"><label><span class="sr-only">School Year</span><select data-year><option value="">All school years</option>${years.map(y=>`<option>${esc(y)}</option>`).join('')}</select></label><label><span class="sr-only">Level</span><select data-level><option value="">All levels</option><option value="1">NSTP 1</option><option value="2">NSTP 2</option></select></label><label><span class="sr-only">Status</span><select data-status><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label><label><span class="sr-only">Search</span><input type="search" data-search placeholder="Search name or email"></label></div></div><div class="instructor-list-summary" data-count role="status"></div><div class="instructor-compact-table"><table class="data-table"><thead><tr><th>Instructor</th><th>Status</th><th>School Year / Level</th><th>Assignment</th><th>Action</th></tr></thead><tbody data-rows></tbody></table></div></section></div>`;
  const fields={year:content.querySelector('[data-year]'),level:content.querySelector('[data-level]'),status:content.querySelector('[data-status]'),search:content.querySelector('[data-search]')};
  Object.entries(fields).forEach(([key,field])=>{field.value=listFilters[key];field[key==='search'?'oninput':'onchange']=renderList;});
  function renderList(){Object.entries(fields).forEach(([key,field])=>listFilters[key]=field.value);const terms=listFilters.search.toLowerCase().trim().split(/\s+/).filter(Boolean);const visible=data.instructors.filter(i=>(!listFilters.year||i.requested_year===listFilters.year)&&(!listFilters.level||String(i.requested_level)===listFilters.level)&&(!listFilters.status||i.review_status===listFilters.status)&&terms.every(t=>(name(i)+' '+i.email).toLowerCase().includes(t)));
   content.querySelector('[data-count]').textContent=visible.length+' instructors';
   content.querySelector('[data-rows]').innerHTML=visible.map(i=>{
     const state=['approved','rejected'].includes(i.review_status)?i.review_status:'pending';
     const assigned=data.assignments.filter(a=>Number(a.instructor_id)===Number(i.id));
     return `<tr><td><div class="instructor-identity">${avatar(i)}<div><strong class="instructor-person">${esc(name(i))}</strong><small class="instructor-muted">${esc(i.email)}</small></div></div></td><td><span class="instructor-account-status ${state}">${state[0].toUpperCase()+state.slice(1)}</span></td><td><span>${esc(i.requested_year||'Not specified')}</span><small class="instructor-muted">NSTP ${esc(i.requested_level||'-')}</small></td><td>${assigned.length?assigned.map(a=>`<span class="instructor-table-assignment">${esc(a.company?a.company+' Company':'ROTC Class')}</span><small class="instructor-muted">${esc(data.schedule.year)} &bull; NSTP ${esc(data.schedule.ms_level)}</small>`).join(''):'<span class="instructor-muted">Not assigned</span>'}</td><td><div class="instructor-table-actions"><button class="btn instructor-review" data-review="${Number(i.id)}">${state==='pending'?'Review':'Details'}</button>${state==='approved'&&i.status==='active'?`<button class="btn primary" data-person="${Number(i.id)}">${isCwts?'Assign Company':'Assign Class'}</button>`:''}${assigned.map(a=>`<button class="btn instructor-remove" data-remove="${Number(a.id)}">Remove</button>`).join('')}</div></td></tr>`;
   }).join('')||'<tr><td colspan="5"><div class="instructor-empty">No instructors found.</div></td></tr>';
   content.querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>reviewAccount(data.instructors.find(i=>Number(i.id)===Number(b.dataset.review))));
   content.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>assignPerson(data.instructors.find(i=>Number(i.id)===Number(b.dataset.person))).catch(e=>toast(e.message,true)));
   content.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this assignment?'))return;b.disabled=true;try{const result=await API.patch(base+'/instructor-assignments/'+Number(b.dataset.remove)+'/remove',{});toast(result.message);await load(data.schedule?.id);}catch(e){toast(e.message,true);b.disabled=false;}});
  }
  renderList();
 }
 await load();
}
