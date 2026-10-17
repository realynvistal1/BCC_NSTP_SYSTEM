function rotcRosterTotals(slots, assignments) {
  const counts = Object.fromEntries(slots.map(slot => [slot.key, 0]));
  let advance = 0;
  for (const assignment of assignments || []) {
    if (assignment.slot === 'advance') advance++;
    else if (Object.hasOwn(counts, assignment.slot)) counts[assignment.slot]++;
  }
  return { counts, advance, total: Object.values(counts).reduce((sum, count) => sum + count, advance) };
}

async function renderROTCRosterEditor(container) {
  container.classList.add('rotc-roster-editor');
  const schedules = await API.get('/api/admin/rotc/enrollment-schedule');
  const latest = [...schedules].sort((a,b) => Number(b.id) - Number(a.id))[0];
  if (!latest) { container.innerHTML = '<section class="section-card">Create an enrollment schedule before setting up the roster.</section>'; return; }
  let selected = latest, state, busy = false, dirty = false, setupDirty = false, studentSearch = '';
  const endpoint = '/api/admin/rotc/roster/editor';
  const name = slot => `${slot.unit || `Battalion ${slot.battalion} / ${slot.company}`} / Platoon ${slot.platoon}`;
  const sort = rows => [...rows].sort((a,b) => `${a.last_name} ${a.first_name} ${a.middle_name || ''}`.localeCompare(`${b.last_name} ${b.first_name} ${b.middle_name || ''}`, 'en', {sensitivity:'base'}));
  async function load() {
    state = await API.get(`${endpoint}?ms_level=${encodeURIComponent(selected.ms_level)}&school_year=${encodeURIComponent(selected.year)}`);
    dirty = false; setupDirty = false; studentSearch = '';
    draw();
  }
  function showRosterNotice(title, message, kind = 'success') {
    const dialog = document.createElement('dialog');
    dialog.className = 'roster-feedback-dialog ' + kind;
    dialog.setAttribute('aria-labelledby','rosterFeedbackTitle');
    dialog.setAttribute('aria-describedby','rosterFeedbackMessage');
    if(kind==='error')dialog.setAttribute('role','alertdialog');
    const mark=kind==='success'?'<path d="m6 12 4 4 8-8"/>':'<path d="M12 7v6m0 4h.01"/>';
    dialog.innerHTML='<div class="roster-feedback-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+mark+'</svg></div><h3 id="rosterFeedbackTitle">'+esc(title)+'</h3><p id="rosterFeedbackMessage">'+esc(message)+'</p><button type="button" class="btn primary" autofocus>Continue</button>';
    document.body.appendChild(dialog);
    dialog.querySelector('button').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }
  function confirmReassignment(setup = false) {
    return new Promise(resolve => {
      const previousFocus=document.activeElement;
      const dialog=document.createElement('dialog');
      dialog.className='roster-reassign-dialog';
      dialog.setAttribute('aria-labelledby','rosterReassignTitle');
      dialog.setAttribute('aria-describedby','rosterReassignDescription');
      dialog.innerHTML='<form method="dialog"><div class="reassign-heading"><span class="reassign-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 11-1l3 6M4 12l3 6a7 7 0 0 0 11-1"/></svg></span><button type="submit" value="cancel" class="reassign-close" aria-label="Close">&times;</button></div><h3 id="rosterReassignTitle">Assign students again?</h3><p id="rosterReassignDescription">Students will be assigned alphabetically using your current platoon setup.</p><div class="reassign-warning"><strong>Your manual moves will be replaced.</strong><span>This changes the draft roster. Students will see it after you save and finalize.</span></div><div class="reassign-actions"><button type="submit" value="cancel" class="btn" autofocus>Keep current roster</button><button type="submit" value="assign" class="btn primary">Assign Again</button></div></form>';
      if(setup===true){
        dialog.querySelector('#rosterReassignTitle').textContent='Save platoon setup?';
        dialog.querySelector('#rosterReassignDescription').textContent='Your updated companies, platoons and capacities will be saved.';
        dialog.querySelector('.reassign-warning strong').textContent='Setup can only be saved once.';
        dialog.querySelector('.reassign-warning span').textContent='Review your companies, platoons and capacities. After saving, setup is locked for this enrollment cycle. Student moves can still increase capacity when needed.';
        dialog.querySelector('.reassign-actions [value="cancel"]').textContent='Keep Editing';
        dialog.querySelector('.reassign-actions [value="assign"]').textContent='Save Setup';
      }
      if(setup==='finalize'||setup==='update'||setup==='discard'){
        const finalize=setup==='finalize'||setup==='update';
        dialog.classList.add(finalize?'confirm-finalize':'confirm-discard');
        dialog.querySelector('#rosterReassignTitle').textContent=finalize?'Finalize this roster?':'Discard unsaved changes?';
        dialog.querySelector('#rosterReassignDescription').textContent=finalize?'Save the current assignments and make them visible to students.':'Restore the last saved draft roster.';
        dialog.querySelector('.reassign-warning strong').textContent=finalize?'Finalizing permanently locks this roster.':'Your unsaved student moves will be removed.';
        dialog.querySelector('.reassign-warning span').textContent=finalize?'Only approved Advance Course withdrawals can transfer students to an available regular platoon afterward.':'Saved assignments and setup will be kept.';
        dialog.querySelector('.reassign-actions [value="cancel"]').textContent='Keep Reviewing';
        dialog.querySelector('.reassign-actions [value="assign"]').textContent=finalize?'Save & Finalize':'Discard Changes';
      }
      if(setup==='update') {
        dialog.querySelector('#rosterReassignTitle').textContent='Publish roster changes?';
        dialog.querySelector('#rosterReassignDescription').textContent='Update the published roster with your reviewed student moves. Past attendance keeps its original groups.';
        dialog.querySelector('.reassign-actions [value="assign"]').textContent='Save & Update';
      }
      dialog.addEventListener('close',()=>{
        const confirmed=dialog.returnValue==='assign';
        dialog.remove();
        if(previousFocus?.isConnected)previousFocus.focus();
        resolve(confirmed);
      },{once:true});
      document.body.appendChild(dialog);
      dialog.showModal();
    });
  }
  async function save(action) {
    if (busy) return;
    if(action==='configure'&&Number(state.revision)>0){showRosterNotice('Setup is locked','This enrollment cycle already has a saved platoon setup.','error');return;}
    if(action==='assign'&&state.assignments!==null){showRosterNotice('Already assigned','Use Move to adjust the draft roster. Assignment is available only once.','error');return;}
    if(['assign','finalize','update'].includes(action)){
      if(!(Date.now()>new Date(state.schedule.deadline).getTime())){showRosterNotice('Enrollment is still open','Wait until enrollment closes before assigning students.','error');return;}
      if(Number(state.pending_count||0)>0){showRosterNotice('Review pending enrollments','Approve or reject all pending enrollments before assigning students.','error');return;}
    }
    if (['configure','assign','save','finalize'].includes(action)) {
      const emptyCompany=(state.companies||[]).find(company=>!state.configuration.some(slot=>!slot.unit&&slot.company===company.name&&slot.battalion===company.battalion));
      if(emptyCompany){showRosterNotice('Add a platoon',emptyCompany.name+' Company needs at least one platoon.','error');return;}
    }
    if(action==='configure'&&!state.configuration.some(slot=>slot.unit!=='HQ')){showRosterNotice('Add a platoon','Add at least one platoon before saving the setup.','error');return;}
    if(['save','finalize','update'].includes(action)&&!state.assignments?.length){showRosterNotice('Assign students first','Assign students before saving the roster.','error');return;}
    if (setupDirty && ['save','finalize','update'].includes(action)) { showRosterNotice('Save your setup first','Save Setup and assign alphabetically after changing the setup.','error'); return; }
    if (action === 'configure' && !(await confirmReassignment(true))) return;
    if (action === 'assign' && state.assignments && !(await confirmReassignment())) return;
    if (['finalize','update'].includes(action) && !(await confirmReassignment(action))) return;
    busy = true;
    const controls = [...container.querySelectorAll('button,input,select')].map(control => [control, control.disabled]);
    controls.forEach(([control]) => { control.disabled = true; });
    try {
      const result = await API.post(endpoint, { ms_level: selected.ms_level, school_year: selected.year, revision: state.revision, action, configuration: state.configuration, companies: state.companies, assignments: state.assignments, confirm: ['finalize','update'].includes(action) });
      if(action==='configure')container.querySelector('[data-setup-dialog]')?.close();
      await load();
      container.querySelector('[data-message]').textContent = {
        configure: 'Platoon setup saved. You can now assign students alphabetically.',
        assign: 'Students are assigned. Review their platoons and make any changes before finalizing.',
        save: 'Your progress is saved. You can continue editing this draft.',
        finalize: 'Roster finalized. Students can now see their assigned platoons.',
        edit: 'Editing draft opened. Published assignments stay unchanged until Save & Update.',
        update: 'Roster updated. Published records, downloads and new attendance groups now use these assignments.',
      }[action] || result.message;
      const titles={configure:'Setup saved',assign:'Students assigned',save:'Draft saved',finalize:'Roster finalized',edit:'Edit roster',update:'Roster updated'};
      const messages={configure:'Your companies, platoons and capacities are saved.',assign:'Review the student assignments before finalizing.',save:'Your roster changes are saved.',finalize:'Students can now view their assigned platoons.',edit:'Move students in this draft, then use Save & Update to publish.',update:'The updated assignments are now published.'};
      showRosterNotice(titles[action]||'Saved',messages[action]||result.message);
    } catch(error) {
      const message = container.querySelector('[data-message]');
      message.textContent = error.message;
      message.setAttribute('role','alert');
      showRosterNotice('Please check your changes',error.message,'error');
    } finally {
      busy = false;
      controls.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; });
    }
  }
  function draw() {
    const published=Boolean(state.schedule.platoons_assigned_at);
    const locked = published;
    const setupLocked=locked||Number(state.revision)>0;
    const slots = state.configuration;
    const assignments = locked ? state.students.map(student => {
      const slot = slots.find(slot => Number(slot.battalion || 0) === Number(student.assignment_battalion || 0) && (slot.company || null) === (student.assignment_company || null) && (slot.unit || null) === (student.assignment_special_unit || null) && slot.platoon === Number(student.assignment_platoon));
      return { record_id: student.record_id, slot: Number(student.assignment_is_advance) === 1 ? 'advance' : slot?.key || 'legacy' };
    }) : state.assignments;
    const totals = rotcRosterTotals(slots, assignments);
    const counts = totals.counts;
    const levels = [...new Set(schedules.map(schedule => String(schedule.ms_level)))].sort();
    const years = [...new Set(schedules.map(schedule => String(schedule.year)))].sort().reverse();
    const setupWasOpen = Boolean(container.querySelector('[data-setup-dialog]')?.open);
    const openDetails = new Set([...container.querySelectorAll('details[open][data-detail]')].map(detail => detail.dataset.detail));
    const openRosters = new Set([...container.querySelectorAll('[data-expand-card].open')].map(card => card.dataset.expandCard));
    const configuredCompanies = state.companies || [...new Map(slots.filter(slot=>!slot.unit).map(slot=>[slot.company,{name:slot.company,battalion:slot.battalion}])).values()];
    state.companies = configuredCompanies;
    const companyNames = configuredCompanies.map(company=>company.name);
    const companyOrder=['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'];
    const nextCompany=companyOrder.find(company=>!companyNames.includes(company));
    const colors = ['blue','green','amber','purple','rose','cyan','orange','teal'];
    const members = key => sort(state.students.filter(student => (assignments || []).some(assignment => Number(assignment.record_id) === Number(student.record_id) && assignment.slot === key)));
    const groupCount = predicate => slots.filter(predicate).reduce((total,slot) => total + (counts[slot.key] || 0),0);
    const groupCapacity = predicate => slots.filter(predicate).reduce((total,slot) => total + Number(slot.capacity || 0),0);
    const assignedTotal = totals.total;
    const advanceStudents = members('advance');
    const hasAssignments = assignedTotal > 0;
    container.classList.toggle('roster-awaiting-assignment', !hasAssignments);
    const closed = Date.now() > new Date(state.schedule.deadline).getTime();
    const pendingCount = Number(state.pending_count || 0);
    const readyToAssign = closed && pendingCount === 0 && state.students.length > 0;
    const scheduleValue = locked ? 'Finalized' : hasAssignments ? (dirty?'Unsaved changes':'Draft') : closed ? 'Closed' : 'Open / Upcoming';
    const summaries = '<div class="roster-summary-grid six" aria-live="polite" aria-label="Current roster totals">'
      + rosterSummary('Total Assigned Cadets',hasAssignments?assignedTotal:'','','slate')
      + rosterSummary('Battalion 1 (M)',hasAssignments?groupCount(slot=>!slot.unit&&slot.battalion===1)+'/'+groupCapacity(slot=>!slot.unit&&slot.battalion===1):'','','blue')
      + rosterSummary('Battalion 2 (F)',hasAssignments?groupCount(slot=>!slot.unit&&slot.battalion===2)+'/'+groupCapacity(slot=>!slot.unit&&slot.battalion===2):'','','rose')
      + rosterSummary('Advance Course',hasAssignments?totals.advance:'',hasAssignments?'cadets':'','amber')
      + rosterSummary('Special Platoon',hasAssignments?groupCount(slot=>Boolean(slot.unit)):'',hasAssignments?'members':'','green')
      + rosterSummary('Schedule',scheduleValue,!closed&&!locked?'Waiting to close':'','slate')+'</div>';
    const tile = (slot,index) => slot.unit==='HQ' ? '<div class="setup-hq-row"><strong>Platoon '+slot.platoon+'</strong><span>'+(slot.platoon===1?'Male':'Female')+'</span></div>' : '<div class="setup-simple-platoon" data-slot="'+index+'"><label class="field setup-number"><span>Platoon'+(slot.unit?' '+(slot.platoon===1?'(Male)':'(Female)'):'')+'</span><input aria-label="'+esc(name(slot))+' number" data-field="platoon" type="number" min="1" max="255" value="'+slot.platoon+'" '+(setupLocked || slot.unit ? 'disabled' : '')+'></label>'
      + (slot.unit === 'HQ' ? '<span class="setup-sex-label">'+(slot.platoon === 1?'Male':'Female')+'</span>' : '')
      + '<label class="field setup-capacity"><span>Capacity</span><input aria-label="'+esc(name(slot))+' capacity" data-field="capacity" type="number" min="1" max="10000" value="'+slot.capacity+'" '+(setupLocked?'disabled':'')+'></label><span class="setup-students-label">students</span>'
      + (setupLocked || slot.unit === 'HQ' ? '' : '<button class="btn danger" data-remove="'+index+'" aria-label="Remove '+esc(name(slot))+'">Remove</button>')+'</div>';
    const companySetup = company => {
      const list = slots.filter(slot=>!slot.unit&&slot.company===company);
      return '<details class="setup-simple-company" data-detail="'+company+'" '+(openDetails.has(company)?'open':'')+'><summary><span class="roster-letter blue">'+company[0]+'</span><strong>'+company+' Company</strong><small>'+list.length+' '+(list.length===1?'platoon':'platoons')+' &middot; Capacity: '+list.reduce((total,slot)=>total+Number(slot.capacity||0),0)+'</small><span class="setup-chevron" aria-hidden="true">&#8964;</span></summary><div class="setup-simple-company-body">'+slots.map((slot,index)=>!slot.unit&&slot.company===company?tile(slot,index):'').join('')+(setupLocked?'':'<div class="setup-company-footer"><button class="btn" data-add-to-company="'+company+'">+ Add platoon</button><button class="btn setup-remove-company" data-remove-company="'+company+'">Remove company</button></div>')+'</div></details>';
    };
    const setupBattalions = [1,2].map(battalion => {
      const companies = companyNames.filter(company=>configuredCompanies.some(entry=>entry.name===company&&entry.battalion===battalion));
      const allCompanies = companyOrder;
      const available = nextCompany ? [nextCompany] : [];
      return '<section class="setup-simple-battalion setup-tone-'+(battalion===1?'blue':'rose')+'"><div class="setup-battalion-heading"><span class="roster-letter '+(battalion===1?'blue':'rose')+'">'+battalion+'</span><div><h3>Battalion '+battalion+'</h3><p>Add a <strong>company</strong>, then add its <strong>platoons</strong> and set their <strong>capacities</strong>.</p></div></div>'
        + (setupLocked?'':'<div class="setup-company-add-row"><select aria-label="Company to add to Battalion '+battalion+'" data-new-company="'+battalion+'" '+(!available.length?'disabled':'')+'><option value="" selected disabled>Choose a company</option>'+allCompanies.map(company=>'<option value="'+company+'" '+(company!==nextCompany?'disabled':'')+'>'+company+'</option>').join('')+'</select><button class="btn" data-add-company="'+battalion+'" '+(!available.length?'disabled':'')+'>+ Add company</button></div>')
        + '<div class="setup-simple-companies">'+companies.map(companySetup).join('')+(companies.length?'':'<p class="setup-empty-note">No companies yet. Choose a company above to add it here.</p>')+'</div></section>';
    }).join('');
    const setupSpecial = '<section class="setup-simple-battalion setup-tone-green"><div class="setup-battalion-heading"><span class="roster-letter green">S</span><div><h3>Special Platoons</h3><p>Medics and MP: Platoon 1 &mdash; Male. Platoon 2 &mdash; Female.</p></div></div><div class="setup-simple-special">'+['Medics','MP'].map((unit,index)=>'<div class="setup-special-unit"><div class="setup-special-unit-heading"><span class="roster-letter '+['rose','green','blue'][index]+'">'+unit[0]+'</span><strong>'+unit+'</strong>'+(setupLocked||unit==='HQ'?'':'<button class="btn" data-add-unit="'+unit+'" '+([1,2].every(number=>slots.some(slot=>slot.unit===unit&&slot.platoon===number))?'disabled':'')+'>+ Add platoon</button>')+'</div>'+slots.map((slot,i)=>slot.unit===unit?tile(slot,i):'').join('')+'</div>').join('')+'</div></section>';
    const setup = '<dialog class="roster-setup-dialog" data-setup-dialog aria-labelledby="rosterSetupTitle"><div class="roster-setup-dialog-heading"><h3 id="rosterSetupTitle">Platoon setup</h3><button type="button" class="btn" data-close-setup>Done</button></div><div class="setup-panel-body">'+setupBattalions+setupSpecial+(setupLocked?'':'<div class="setup-save-row"><button class="btn primary" data-action="configure">Save Setup</button></div>')+'</div></dialog>';
    const moveAction = locked ? null : student => '<button type="button" class="btn roster-move-button" data-move-student="'+Number(student.record_id)+'" '+(setupDirty||Number(student.has_medical_condition)===1?'disabled':'')+'>Move</button>';
    const battalions = [1,2].map(battalion => {
      const companies = companyNames.filter(company=>slots.some(slot=>!slot.unit&&slot.company===company&&slot.battalion===battalion));
      return '<section class="roster-battalion"><div class="roster-section-title"><h3>Battalion '+battalion+(battalion===1?' - Male':' - Female')+'</h3><small>'+groupCount(slot=>!slot.unit&&slot.battalion===battalion)+' / '+groupCapacity(slot=>!slot.unit&&slot.battalion===battalion)+' cadets</small></div><div class="roster-company-grid">'+companies.map((company,index)=>'<div class="company-card"><div class="company-card-head"><span class="roster-letter '+colors[(index+(battalion===2?4:0))%colors.length]+'">'+esc(company[0])+'</span><div><strong>'+esc(company)+' Company</strong><small>'+groupCount(slot=>!slot.unit&&slot.company===company)+' / '+groupCapacity(slot=>!slot.unit&&slot.company===company)+'</small></div></div><div class="roster-stack">'+slots.filter(slot=>!slot.unit&&slot.company===company).map(slot=>expanderCard('roster-'+slot.key,'Platoon '+slot.platoon,counts[slot.key]||0,slot.capacity,rosterRows(members(slot.key),moveAction),colors[index%colors.length])).join('')+'</div></div>').join('')+(companies.length?'':'<div class="roster-empty">Add a company in Platoon setup to get started.</div>')+'</div></section>';
    }).join('');
    const specialRosters = '<div class="roster-section-title"><h3>Special Platoons</h3><small>'+groupCount(slot=>Boolean(slot.unit))+' members</small></div><div class="roster-special-grid">'+['Medics','MP','HQ'].map((unit,index)=>'<div class="company-card"><div class="company-card-head"><span class="roster-letter '+['rose','green','blue'][index]+'">'+unit[0]+'</span><div><strong>'+unit+'</strong><small>'+groupCount(slot=>slot.unit===unit)+' members</small></div></div><div class="roster-stack">'+slots.filter(slot=>slot.unit===unit).map(slot=>expanderCard('roster-'+slot.key,'Platoon '+slot.platoon+(slot.platoon===1?' - Male':' - Female'),counts[slot.key]||0,slot.unit==='HQ'?Infinity:slot.capacity,rosterRows(members(slot.key),moveAction),['rose','green','blue'][index])).join('')+'</div></div>').join('')+'</div>';
    const advanceRoster = '<div class="roster-section-title"><h3>Advance Course</h3><small>'+advanceStudents.length+' cadets</small></div><div class="roster-company-grid">'+['Male','Female'].map((sex,index)=>expanderCard('roster-advance-'+sex,sex,advanceStudents.filter(student=>student.sex===sex).length,Infinity,rosterRows(advanceStudents.filter(student=>student.sex===sex),moveAction),index?'rose':'purple')).join('')+'</div>';
    container.innerHTML = `<div class="page-intro-banner sky roster-original-heading"><div><div class="page-intro-kicker">ROTC ADMIN</div><h2>ROTC Platoon List</h2><p>View and manage platoons by MS level and school year.</p></div><div class="filter-row roster-original-filters"><select data-level class="roster-ms-select" aria-label="MS Level">${levels.map(level=>`<option value="${esc(level)}" ${level===String(selected.ms_level)?'selected':''}>MS ${esc(level)}</option>`).join('')}</select><select data-year class="roster-ms-select" aria-label="School Year">${years.map(year=>`<option value="${esc(year)}" ${year===String(selected.year)?'selected':''}>SY ${esc(year)}</option>`).join('')}</select></div></div><p data-message aria-live="polite"></p>
    <section class="section-card roster-current-filter"><div><h3>Current Filter</h3><p>Showing MS ${esc(selected.ms_level)} - SY ${esc(selected.year)}.</p></div><button type="button" class="btn" data-open-setup>${setupLocked?'View Setup':'Platoon Setup'}</button></section>${summaries}
    <section class="assignment-box ${readyToAssign&&!locked?'ready':'waiting'}"><div class="assignment-copy"><span class="assignment-icon">${locked?'Finalized':hasAssignments?'Review':!closed?'Pending':pendingCount?'Pending Review':'Ready'}</span><div><strong>Platoon Assignment</strong><p>${locked?'Students can view their assigned platoons.':hasAssignments?'Review student assignments before saving the final roster.':!closed?'Waiting for the enrollment schedule to close before assignment.':pendingCount?pendingCount+' pending enrollment(s). Approve or reject them before assigning students.':!state.students.length?'No approved students to assign.':slots.length?'Assign approved students alphabetically.':'Add companies and platoons in Platoon Setup first.'}</p></div></div>${hasAssignments?'<span class="roster-assigned-status">&#10003; '+(locked?'Roster Finalized':'Students Assigned')+'</span>':`<button class="btn primary assign-wide" ${locked||hasAssignments||!readyToAssign||!slots.length||!setupLocked?'disabled':''} ${locked||hasAssignments?'':'data-action="assign"'}>${locked?'Roster Finalized':!closed?'Assignment Locked':pendingCount?'Review Pending Enrollments':!state.students.length?'No Approved Students':!slots.length?'Set Up Platoons First':hasAssignments?'Students Assigned':!setupLocked?'Save Setup First':'Assign Platoons'}</button>`}${!locked&&hasAssignments?'<div class="actions"><button type="button" class="btn" data-action="save" '+(!dirty?'disabled':'')+'>Save Draft</button><button class="btn success" data-action="finalize" '+(!readyToAssign?'disabled':'')+'>'+'Save &amp; Finalize'+'</button><button type="button" class="btn" data-discard '+(!dirty?'disabled':'')+'>Discard Changes</button></div>':''}</section><div class="roster-search-bar"><label for="rosterStudentSearch">Search students</label><div><input id="rosterStudentSearch" type="search" placeholder="Search name or student ID" autocomplete="off"><button type="button" class="btn" data-clear-search>Clear</button></div><span data-search-result role="status"></span></div>${battalions}${specialRosters}${advanceRoster}${setup}`;
    const setupDialog=container.querySelector('[data-setup-dialog]');
    container.querySelector('[data-open-setup]').onclick=()=>setupDialog.showModal();
    container.querySelector('[data-close-setup]').onclick=()=>setupDialog.close();
    if(setupWasOpen)setupDialog.showModal();
    bindRosterExpanders();
    container.querySelectorAll('[data-expand-card]').forEach(card => {
      if (!openRosters.has(card.dataset.expandCard)) return;
      card.classList.add('open');
      card.querySelector('.roster-expand-body').style.display = 'block';
      card.querySelector('[data-expand]').setAttribute('aria-expanded','true');
    });
    function moveStudent(student) {
      if(locked||setupDirty||Number(student.has_medical_condition)===1)return;
      const assignment=(state.assignments||[]).find(row=>Number(row.record_id)===Number(student.record_id));
      if(!assignment)return;
      const current=slots.find(slot=>slot.key===assignment.slot);
      const destinations=slots.filter(slot=>slot.key!==assignment.slot && (slot.unit ? slot.platoon===(student.sex==='Male'?1:student.sex==='Female'?2:0) : slot.battalion===(student.sex==='Male'?1:student.sex==='Female'?2:0)));
      const advance=assignment.slot!=='advance';
      const destinationGroups=['Battalion 1','Battalion 2','Medics','MP','HQ'];
      const sexLabel=student.sex==='Male'?'Male':student.sex==='Female'?'Female':'';
      const destinationOptions=destinationGroups.map(group=>{
        const options=destinations.filter(slot=>(slot.unit||'Battalion '+slot.battalion)===group);
        const groupLabel=group==='Battalion 1'?'Battalion 1 - Male':group==='Battalion 2'?'Battalion 2 - Female':group;
        return options.length?'<optgroup label="'+groupLabel+'">'+options.map(slot=>'<option value="'+esc(slot.key)+'">'+esc(slot.unit?'Platoon '+slot.platoon+' - '+(slot.platoon===1?'Male':'Female'):slot.company+' / Platoon '+slot.platoon)+'</option>').join('')+'</optgroup>':'';
      }).join('')+(advance?'<optgroup label="Advance Course"><option value="advance">Advance Course'+(sexLabel?' - '+sexLabel:'')+'</option></optgroup>':'');
      const dialog=document.createElement('dialog');dialog.className='roster-add-dialog roster-move-dialog';dialog.setAttribute('aria-labelledby','moveStudentTitle');
      dialog.innerHTML='<form><span class="move-dialog-label">PLATOON TRANSFER</span><h3 id="moveStudentTitle">Move student</h3><p class="move-student-name"><strong>'+esc(student.last_name+', '+student.first_name)+'</strong></p><div class="move-current"><span>From</span><strong>'+esc(current?name(current):'Advance Course')+'</strong></div><label class="field"><span>To &mdash; choose a group or platoon</span><select name="destination" required size="7" aria-label="New group or platoon"><option value="" selected disabled>Select the new platoon</option>'+destinationOptions+'</select></label><div class="move-preview" data-move-preview aria-live="polite">Choose a platoon to see the updated totals.</div><p class="move-save-note">Changes update this draft. Save Draft to keep them.</p><p data-move-error role="alert"></p><div class="actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary">Move student</button></div></form>';
      document.body.appendChild(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
      dialog.querySelector('[name="destination"]').onchange=event=>{
        const target=event.target.value, destination=slots.find(slot=>slot.key===target);
        const sourceCount=state.assignments.filter(row=>row.slot===assignment.slot).length;
        const targetCount=state.assignments.filter(row=>row.slot===target).length;
        const capacity=destination&&destination.unit!=='HQ'?Math.max(Number(destination.capacity),targetCount+1):null;
        dialog.querySelector('[data-move-preview]').textContent='From: '+sourceCount+' to '+(sourceCount-1)+' students. To: '+targetCount+' to '+(targetCount+1)+' students.'+(destination&&destination.unit!=='HQ'&&capacity>Number(destination.capacity)?' Capacity increases to '+capacity+'.':'');
      };
      dialog.querySelector('form').onsubmit=event=>{
        event.preventDefault();const target=event.currentTarget.elements.destination.value;const destination=slots.find(slot=>slot.key===target);
        if(!destinations.some(slot=>slot.key===target)&&!(target==='advance'&&advance))return;
        assignment.slot=target;
        if(destination&&destination.unit!=='HQ') destination.capacity=Math.max(Number(destination.capacity),state.assignments.filter(row=>row.slot===target).length);
        dirty=true;dialog.close();draw();container.querySelector('[data-message]').textContent=student.first_name+' '+student.last_name+' moved to '+(destination?name(destination):'Advance Course'+(sexLabel?' - '+sexLabel:''))+'. Save Draft to keep this change.';
      };dialog.showModal();
    }
    container.querySelectorAll('[data-move-student]').forEach(button=>button.onclick=()=>{const student=state.students.find(row=>Number(row.record_id)===Number(button.dataset.moveStudent));if(student)moveStudent(student);});
    const searchInput=container.querySelector('#rosterStudentSearch');
    searchInput.value=studentSearch;
    const originalOpen=new Set(openRosters);
    function filterRoster(){
      const query=studentSearch.trim().toLocaleLowerCase();
      let matches=0;
      container.querySelectorAll('[data-expand-card]').forEach(card=>{
        let count=0;
        card.querySelectorAll('tbody tr').forEach(row=>{
          const text=[row.cells[1]?.textContent,row.cells[2]?.textContent].join(' ').toLocaleLowerCase();
          const match=!query||text.includes(query);
          row.hidden=!match;
          if(match){count++;matches++;}
        });
        card.hidden=Boolean(query&&!count);
        const open=query?count>0:originalOpen.has(card.dataset.expandCard);
        card.classList.toggle('open',open);
        card.querySelector('.roster-expand-body').style.display=open?'block':'none';
        card.querySelector('[data-expand]').setAttribute('aria-expanded',String(open));
      });
      container.querySelectorAll('.company-card').forEach(card=>{card.hidden=Boolean(query&&![...card.querySelectorAll('[data-expand-card]')].some(child=>!child.hidden));});
      container.querySelector('[data-search-result]').textContent=query?(matches?matches+' student'+(matches===1?'':'s')+' found':'No students found.'):'';
    }
    searchInput.oninput=()=>{
      if(!studentSearch.trim()){
        originalOpen.clear();
        container.querySelectorAll('[data-expand-card].open').forEach(card=>originalOpen.add(card.dataset.expandCard));
      }
      studentSearch=searchInput.value;filterRoster();
    };
    container.querySelector('[data-clear-search]').onclick=()=>{studentSearch='';searchInput.value='';filterRoster();searchInput.focus();};
    if(studentSearch.trim())filterRoster();
    const changeCycle = async event => {
      if (dirty && !confirm('Switch rosters without saving your latest changes?')) {
        container.querySelector('[data-level]').value = selected.ms_level;
        container.querySelector('[data-year]').value = selected.year;
        return;
      }
      const level = container.querySelector('[data-level]').value;
      const year = container.querySelector('[data-year]').value;
      const match = schedules.find(schedule => String(schedule.ms_level) === level && String(schedule.year) === year);
      if (!match) {
        container.querySelector('[data-message]').textContent = 'There is no enrollment schedule for this MS level and school year yet.';
        container.querySelector('[data-level]').value = selected.ms_level;
        container.querySelector('[data-year]').value = selected.year;
        return;
      }
      const previous = selected;
      selected = match;
      try { await load(); } catch(error) {
        selected = previous;
        container.querySelector('[data-level]').value = selected.ms_level;
        container.querySelector('[data-year]').value = selected.year;
        container.querySelector('[data-message]').textContent = error.message;
      }
    };
    container.querySelector('[data-level]').onchange = changeCycle;
    container.querySelector('[data-year]').onchange = changeCycle;
    container.querySelectorAll('[data-action]').forEach(button => button.onclick = () => save(button.dataset.action));
    if (locked) return;
    container.querySelectorAll('[data-field]').forEach(input => input.onchange = () => {
      const slot = slots[Number(input.closest('[data-slot]').dataset.slot)];
      slot[input.dataset.field] = input.dataset.field === 'company' ? input.value : Number(input.value);
      dirty = true; setupDirty = true;
      if (input.dataset.field === 'battalion') {
        slots.filter(other => !other.unit && other.company === slot.company).forEach(other => { other.battalion = slot.battalion; });
      }
      draw();
    });
    container.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { slots.splice(Number(button.dataset.remove),1); dirty = true; setupDirty = true; draw(); });
    container.querySelectorAll('[data-up]').forEach(button => button.onclick = () => {
      const index = Number(button.dataset.up), slot = slots[index];
      let earlier = index - 1;
      while (earlier >= 0 && !(slot.unit ? slots[earlier].unit === slot.unit : !slots[earlier].unit && slots[earlier].company === slot.company)) earlier--;
      if (earlier < 0) return;
      [slots[earlier], slots[index]] = [slots[index], slots[earlier]];
      dirty = true; setupDirty = true; draw();
    });
    function addPlatoon(company, unit, battalion) {
      if(unit==='HQ')return;
      const existingNumbers = slots.filter(slot=>unit ? slot.unit===unit : !slot.unit&&slot.company===company).map(slot=>Number(slot.platoon));
      const platoon = unit ? [1,2].find(number=>!existingNumbers.includes(number)) : Math.max(0,...existingNumbers)+1;
      if (!platoon) return;
      const dialog=document.createElement('dialog');
      dialog.className='roster-add-dialog';
      dialog.setAttribute('aria-labelledby','addPlatoonTitle');
      dialog.innerHTML='<form><h3 id="addPlatoonTitle">Add platoon to '+(unit || company+' Company')+'</h3><p>Enter how many students this platoon can hold.</p><label class="field"><span>Platoon</span><input name="platoon" type="number" min="1" max="255" required value="'+platoon+'" '+(unit?'readonly':'')+'></label>'+(unit?'<p>'+ (platoon===1?'Platoon 1 is for male students.':'Platoon 2 is for female students.')+'</p>':'')+'<label class="field"><span>Capacity</span><input name="capacity" type="number" min="1" max="10000" placeholder="Number of students" required autofocus></label><div class="actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary">Add Platoon</button></div></form>';
      document.body.appendChild(dialog);
      dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
      dialog.addEventListener('close',()=>dialog.remove());
      dialog.querySelector('form').onsubmit=event=>{
        event.preventDefault();
        const form=event.currentTarget;
        const capacity=Number(form.elements.capacity.value), number=Number(form.elements.platoon.value);
        if(existingNumbers.includes(number)){form.elements.platoon.setCustomValidity('This platoon number is already used.');form.elements.platoon.reportValidity();return;}
        if(!Number.isInteger(capacity)||capacity<1||capacity>10000)return;
        slots.push({key:'slot-'+Date.now()+'-'+slots.length,battalion:unit?null:battalion,company:unit?null:company,platoon:number,unit:unit||null,capacity});
        dirty=true;setupDirty=true;dialog.close();draw();
        const detail=[...container.querySelectorAll('[data-detail]')].find(detail=>detail.dataset.detail===(unit||company));
        if(detail)detail.open=true;
      };
      dialog.querySelector('[name="platoon"]').oninput=event=>event.target.setCustomValidity('');
      dialog.showModal();
    }
    container.querySelectorAll('[data-company-battalion]').forEach(select=>select.onchange=()=>{
      slots.filter(slot=>!slot.unit&&slot.company===select.dataset.companyBattalion).forEach(slot=>{slot.battalion=Number(select.value)});
      dirty=true;setupDirty=true;draw();
    });
    container.querySelectorAll('[data-add-to-company]').forEach(button=>button.onclick=()=>{
      const company=button.dataset.addToCompany;
      addPlatoon(company,null,configuredCompanies.find(entry=>entry.name===company).battalion);
    });
    container.querySelectorAll('[data-add-unit]').forEach(button=>button.onclick=()=>addPlatoon(null,button.dataset.addUnit,null));
    container.querySelectorAll('[data-add-company]').forEach(button=>button.onclick=()=>{
      const battalion=Number(button.dataset.addCompany);
      const company=container.querySelector('[data-new-company="'+battalion+'"]').value;
      if(!company || company!==nextCompany || configuredCompanies.some(entry=>entry.name===company))return;
      configuredCompanies.push({name:company,battalion});
      dirty=true;setupDirty=true;draw();
      const detail=[...container.querySelectorAll('[data-detail]')].find(detail=>detail.dataset.detail===company);
      if(detail)detail.open=true;
    });
    container.querySelectorAll('[data-remove-company]').forEach(button=>button.onclick=()=>{
      const company=button.dataset.removeCompany;
      if(configuredCompanies.some(entry=>companyOrder.indexOf(entry.name)>companyOrder.indexOf(company))){alert('Remove later companies first.');return;}
      if(!confirm('Remove '+company+' Company and its platoons from this setup?'))return;
      for(let index=slots.length-1;index>=0;index--)if(!slots[index].unit&&slots[index].company===company)slots.splice(index,1);
      const companyIndex=configuredCompanies.findIndex(entry=>entry.name===company);
      if(companyIndex>=0)configuredCompanies.splice(companyIndex,1);
      dirty=true;setupDirty=true;draw();
    });
    const discard=container.querySelector('[data-discard]');
    if(discard)discard.onclick=async()=>{if(!dirty||busy)return;if(await confirmReassignment('discard')){try{await load();}catch(error){showRosterNotice('Unable to discard changes',error.message,'error');}}};
  }
  await load();
}
