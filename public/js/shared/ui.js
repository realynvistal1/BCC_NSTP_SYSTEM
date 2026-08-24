function summaryTile(label,value,helper,tone='blue'){
  return `<div class="summary-tile ${tone}"><div class="summary-accent"></div><div class="dash-label">${esc(label)}</div><div class="summary-number">${esc(value)}</div><div class="summary-helper">${esc(helper)}</div></div>`
}
function progressRow(label, value, total, tone) {
  const pct = total ? Math.round((Number(value) / Number(total)) * 100) : 0;
  const width = Math.max(0, Math.min(100, pct));

  return `
    <div class="progress-row">
      <div class="progress-meta">
        <strong>${esc(label)}</strong>
        <span>${esc(value)} - ${pct}%</span>
      </div>
      <div class="progress-track">
        <span class="${tone}" style="width:${width}%"></span>
      </div>
    </div>`;
}
function insight(label, value, helper) {
  return `
    <div class="insight-card">
      <div class="dash-label">${esc(label)}</div>
      <div class="insight-value">${esc(value)}</div>
      <p>${esc(helper)}</p>
    </div>`;
}
function scheduleStatus(openDate, deadline) {
  const now = Date.now();
  const open = new Date(openDate).getTime();
  const end = new Date(deadline).getTime();

  if (!openDate || !deadline || Number.isNaN(open) || Number.isNaN(end)) {
    return {
      key: 'not-set',
      label: 'Not Set'
    };
  }

  if (now < open) {
    return {
      key: 'upcoming',
      label: 'Upcoming'
    };
  }

  if (now <= end) {
    return {
      key: 'open',
      label: 'Open'
    };
  }

  return {
    key: 'closed',
    label: 'Closed'
  };
}
function oldDateTime(v) {
  if (!v) return '-';

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return esc(v);

  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function daysRemaining(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';

  const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (diff < 0) return 'Deadline passed';
  if (diff === 0) return 'Deadline is today';
  if (diff === 1) return '1 day remaining';
  return `${diff} days remaining`;
}
function scheduleFootText(statusKey, deadline) {
  if (statusKey === 'open') return daysRemaining(deadline);
  if (statusKey === 'upcoming') return 'Enrollment has not opened yet';
  if (statusKey === 'closed') return 'Enrollment period completed';
  return 'Schedule unavailable';
}

function scheduleCard(x, p) {
  const st = scheduleStatus(x.open_date, x.deadline);
  const level = p === 'cwts' ? `CWTS ${x.ms_level}` : `MS ${x.ms_level}`;

  return `
    <article class="schedule-card ${st.key}">
      <div class="schedule-card-top">
        <div>
          <span class="schedule-level">${level}</span>
          <h3>SY ${esc(x.year)}</h3>
        </div>
        <span class="schedule-status ${st.key}">
          <i></i>${st.label}
        </span>
      </div>
      <div class="schedule-date-row">
        <span class="schedule-date-icon">${icon('schedule')}</span>
        <div>
          <small>Enrollment Opens</small>
          <strong>${oldDateTime(x.open_date)}</strong>
        </div>
      </div>
      <div class="schedule-date-row">
        <span class="schedule-date-icon deadline">${icon('attendance')}</span>
        <div>
          <small>Enrollment Deadline</small>
          <strong>${oldDateTime(x.deadline)}</strong>
        </div>
      </div>
      <div class="schedule-foot">
        <span>${scheduleFootText(st.key, x.deadline)}</span>
      </div>
    </article>`;
}
async function renderEnrollmentSchedule(p,c){
  const rows = await API.get(`/api/admin/${p}/enrollment-schedule`);
  const program = p.toUpperCase();
  const prefix = p === 'cwts' ? 'CWTS' : 'MS';
  const active = rows.filter(x => ['open', 'upcoming'].includes(scheduleStatus(x.open_date, x.deadline).key));
  const closed = rows.filter(x => scheduleStatus(x.open_date, x.deadline).key === 'closed');
  const currentYear = new Date().getFullYear();
  const sorted = [...rows].sort(
    (a, b) => String(b.year).localeCompare(String(a.year)) || String(b.ms_level).localeCompare(String(a.ms_level))
  );

  let nextLevel = '1';
  let nextYear = `${currentYear}-${currentYear + 1}`;
  if (sorted[0]) {
    if (String(sorted[0].ms_level) === '1') {
      nextLevel = '2';
      nextYear = sorted[0].year;
    } else {
      const y = parseInt(String(sorted[0].year).split('-')[0], 10) || currentYear;
      nextLevel = '1';
      nextYear = `${y + 1}-${y + 2}`;
    }
  }

  const hasActive = active.length > 0;
  const introText = p === 'cwts' ? 'CWTS level' : 'MS level';
  const warning = hasActive
    ? `
      <div class="warning-banner">
        ${icon('schedule')}
        <div>
          <strong>A current enrollment schedule is active.</strong>
          <span>You cannot create another schedule while an enrollment is open or upcoming. Wait until it closes.</span>
        </div>
      </div>`
    : '';
  const activeMarkup = active.length
    ? `<div class="schedule-card-grid">${active.map(x => scheduleCard(x, p)).join('')}</div>`
    : `
      <div class="empty-state-card">
        ${icon('schedule')}
        <strong>No current enrollment schedule</strong>
        <span>Create a schedule to make ${program} enrollment available to students.</span>
      </div>`;
  const historyRows = closed
    .map(
      x => `
        <tr>
          <td><span class="level-pill">${prefix} ${x.ms_level}</span></td>
          <td><strong>SY ${esc(x.year)}</strong></td>
          <td>${oldDateTime(x.open_date)}</td>
          <td>${oldDateTime(x.deadline)}</td>
          <td><span class="schedule-status closed"><i></i>Closed</span></td>
        </tr>`
    )
    .join('');
  const historyMarkup = closed.length
    ? `
      <div class="history-table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Level</th><th>School Year</th><th>Opening</th><th>Deadline</th><th>Status</th></tr>
          </thead>
          <tbody>${historyRows}</tbody>
        </table>
      </div>`
    : '<div class="empty-state-card compact"><strong>No enrollment history yet</strong></div>';
  const modalMarkup = `
    <div id="scheduleModal" class="app-dialog hidden">
      <div class="app-dialog-backdrop"></div>
      <div class="app-dialog-card schedule-modal-card">
        <div class="app-dialog-head">
          <div>
            <span class="modal-eyebrow">${program} Enrollment</span>
            <h3>Create Enrollment Schedule</h3>
            <p>Set the level, school year, opening date and enrollment deadline.</p>
          </div>
          <button type="button" class="modal-close" id="closeScheduleModal">x</button>
        </div>
        <form id="scheduleForm" class="schedule-form-old">
          <div class="field">
            <label>${p === 'cwts' ? 'CWTS Level' : 'MS Level'}</label>
            <select name="ms_level" aria-label="Enrollment level" required>
              <option value="1" ${String(nextLevel) === '1' ? 'selected' : ''}>${prefix} 1</option>
              <option value="2" ${String(nextLevel) === '2' ? 'selected' : ''}>${prefix} 2</option>
            </select>
            <small class="field-help">Choose which enrollment level this schedule should open.</small>
          </div>
          <div class="field">
            <label>School Year</label>
            <input name="year" value="${esc(nextYear)}" placeholder="2026-2027" required>
            <small class="field-help">Enter the school year you want to use for this schedule.</small>
          </div>
          <div class="field"><label>Opening Date</label><input name="open_day" type="date" required></div>
          <div class="field time-field">
            <label>Opening Time</label>
            <div class="time-parts">
              <input name="open_time" type="time" value="08:00" step="60" required>
            </div>
          </div>
          <div class="field"><label>Deadline Date</label><input name="deadline_day" type="date" required></div>
          <div class="field time-field">
            <label>Deadline Time</label>
            <div class="time-parts">
              <input name="deadline_time" type="time" value="17:00" step="60" required>
            </div>
          </div>
          <div class="app-dialog-actions">
            <button type="button" class="btn" id="cancelSchedule">Cancel</button>
            <button class="btn primary">Save Schedule</button>
          </div>
        </form>
      </div>
    </div>`;

  c.innerHTML = `
    <section class="page-intro-banner ${p}">
      <div>
        <div class="intro-kicker">${program} Administration</div>
        <h2>${program} Enrollment Schedule</h2>
        <p>Manage enrollment schedules per ${introText} and school year.</p>
      </div>
      <button id="createScheduleBtn" class="btn primary page-intro-action" ${hasActive ? 'disabled' : ''}>
        ${icon('schedule')} Create Schedule
      </button>
    </section>
    ${warning}
    <section class="schedule-section">
      <div class="schedule-section-title">
        <i class="live-dot"></i>
        <div>
          <h3>Current Enrollment</h3>
          <p>Open or upcoming ${program} enrollment periods.</p>
        </div>
      </div>
      ${activeMarkup}
    </section>
    <section class="schedule-section">
      <div class="schedule-section-title history">
        <div>
          <h3>Enrollment History</h3>
          <p>Previously completed enrollment schedules.</p>
        </div>
        <span class="history-count">${closed.length} record${closed.length === 1 ? '' : 's'}</span>
      </div>
      ${historyMarkup}
    </section>
    ${modalMarkup}`;

  const modal = $('#scheduleModal');
  function toggle(show) {
    modal.classList.toggle('hidden', !show);
  }
  if ($('#createScheduleBtn')) {
    $('#createScheduleBtn').onclick = () => {
      if (!hasActive) toggle(true);
    };
  }
  $('#closeScheduleModal').onclick = () => toggle(false);
  $('#cancelSchedule').onclick = () => toggle(false);
  modal.querySelector('.app-dialog-backdrop').onclick = () => toggle(false);
  $('#scheduleForm').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    function dt(day, time) {
      return `${day}T${time}:00`;
    }
    const obj = {
      ms_level: f.ms_level.value,
      year: f.year.value.trim(),
      open_date: dt(f.open_day.value, f.open_time.value),
      deadline: dt(f.deadline_day.value, f.deadline_time.value)
    };
    if (new Date(obj.deadline) <= new Date(obj.open_date)) {
      return toast('The deadline must be later than the opening date.', true);
    }
    const btn = f.querySelector('button[type="submit"],button.btn.primary');
    btn.disabled = true;
    try {
      const x = await API.post(`/api/admin/${p}/enrollment-schedule`, obj);
      toast(x.message);
      setTimeout(() => location.reload(), 500);
    } catch (err) {
      btn.disabled = false;
      toast(err.message, true);
    }
  };
}
const COURSE_OPTIONS=['BS Criminology','BS Hospitality Management','BS Information Technology','BS Tourism Management','BEED - Bachelor of Elementary Education','BSED - Major in English','BSED - Major in Mathematics'];
function studentInitials(x){
  return `${String(x.first_name||'').charAt(0)}${String(x.last_name||'').charAt(0)}`.toUpperCase()||'ST'
}
function enrollmentAssignment(x, p) {
  if (p === 'cwts') {
    return x.company ? `${x.company} Company` : 'Not assigned';
  }

  return (
    x.special_unit ||
    (
      [
        x.battalion ? `Battalion ${x.battalion}` : '',
        x.rotc_company,
        x.rotc_platoon ? `Platoon ${x.rotc_platoon}` : ''
      ]
        .filter(Boolean)
        .join(' - ') || 'Not assigned'
    )
  );
}

function enrollmentRow(x, p) {
  const medical = Number(x.has_medical_condition || 0) === 1;
  const photo = `<span class="student-avatar">${esc(studentInitials(x))}</span>`;
  const level = p === 'cwts' ? `CWTS ${x.ms_level}` : `MS ${x.ms_level}`;
  const fullName = x.last_name + ', ' + x.first_name + (x.suffix ? ` ${x.suffix}` : '');

  return `
    <tr class="${medical ? 'medical-row' : ''}" data-status="${esc(x.status)}">
      <td class="student-cell">
        ${photo}
        <div>
          <strong>${esc(fullName)}</strong>
          <small>${esc(x.email)}</small>
          ${medical ? '<span class="medical-tag">Medical</span>' : ''}
        </div>
      </td>
      <td><strong class="student-id-text">${esc(x.student_id)}</strong></td>
      <td>
        <span>${esc(x.course)}</span>
        <small class="cell-sub">${esc(x.year_level)}</small>
      </td>
      <td><span class="level-pill ${esc(x.status)}">${level}</span></td>
      <td>${esc(x.school_year || x.schedule_year || '-')}</td>
      <td>${oldDateTime(x.created_at)}</td>
      <td>${badge(x.status)}</td>
      <td><button class="view-edit-link" data-record="${x.record_id}">View / Edit</button></td>
    </tr>`;
}
function detailSection(title, fields) {
  const content = fields
    .map(([label, value]) => {
      return `
        <div class="detail-field">
          <small>${esc(label)}</small>
          <strong>${esc(value || '-')}</strong>
        </div>`;
    })
    .join('');

  return `<section class="student-detail-section">
    <div class="student-detail-section-head">
      <h4>${esc(title)}</h4>
    </div>
    <div class="student-detail-grid">
      ${content}
    </div>
  </section>`;
}

function isPreviewableImage(url = '') {
  return /^data:image\//i.test(url) || /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url);
}

function documentPreviewCard(label, url) {
  if (!url) {
    return `<div class="document-preview-card missing">
      <div class="document-thumb placeholder">${icon('records')}</div>
      <div class="document-copy"><strong>${esc(label)}</strong><span>Not uploaded</span></div>
    </div>`;
  }
  const image = isPreviewableImage(url);
  return `<div class="document-preview-card">
    ${image
      ? `<button type="button" class="document-thumb image preview-file-btn" data-url="${esc(url)}" data-label="${esc(label)}"><img src="${url}" alt="${esc(label)}"></button>`
      : `<a class="document-thumb file" href="${url}" target="_blank" rel="noopener">${icon('records')}</a>`}
    <div class="document-copy">
      <strong>${esc(label)}</strong>
      <span>${image ? 'Image submitted' : 'File submitted'}</span>
      <div class="document-actions">
        ${image ? `<button type="button" class="document-link preview-file-btn" data-url="${esc(url)}" data-label="${esc(label)}">View inside app</button>` : ''}
        <a class="document-link" href="${url}" target="_blank" rel="noopener">Open outside</a>
      </div>
    </div>
  </div>`;
}

function enrollmentDetailModal(x, p) {
  const medical = Number(x.has_medical_condition || 0) === 1;
  const assignment = enrollmentAssignment(x, p);
  const fullName = `${x.last_name || ''}, ${x.first_name || ''} ${x.middle_name || ''} ${x.suffix || ''}`
    .replace(/\s+/g, ' ')
    .trim();
  const personal = [
    ['Student ID', x.student_id],
    ['Full Name', fullName],
    ['Sex', x.sex],
    ['Birthdate', x.birthdate],
    ['Place of Birth', x.place_of_birth],
    ['Religion', x.religion],
    ['Contact Number', x.contact_number],
    ['Email', x.email]
  ];
  const academic = [
    ['Course', x.course],
    ['Year Level', x.year_level],
    [p === 'cwts' ? 'CWTS Level' : 'MS Level', `${p === 'cwts' ? 'CWTS' : 'MS'} ${x.ms_level}`],
    ['School Year', x.school_year || '-'],
    ['Current Assignment', assignment]
  ];
  const health = [
    ['Height', x.height],
    ['Weight', x.weight],
    ['Blood Type', x.blood_type],
    ['Complexion', x.complexion],
    ['Medical Condition', medical ? (x.medical_condition || 'Yes') : 'None']
  ];
  const address = [
    ['Temporary Address', [x.temporary_barangay, x.temporary_municipality, x.temporary_province].filter(Boolean).join(', ')],
    ['Permanent Address', [x.permanent_barangay, x.permanent_municipality, x.permanent_province].filter(Boolean).join(', ')]
  ];
  const family = [
    ['Father', `${x.father_name || '-'}${x.father_occupation ? ' - ' + x.father_occupation : ''}`],
    ['Mother', `${x.mother_name || '-'}${x.mother_occupation ? ' - ' + x.mother_occupation : ''}`]
  ];
  const emergency = [
    ['Name', x.emergency_contact_name],
    ['Relationship', x.emergency_contact_relationship],
    ['Contact Number', x.emergency_contact_contact_number],
    ['Address', x.emergency_contact_address]
  ];
  const docs = [
    ['Photo 2x2', x.photo],
    ['Medical Certificate', x.medical_certificate],
    ...(p === 'rotc' ? [['X-Ray', x.xray_file]] : []),
    ['Certificate of Registration', x.cor_file]
  ];
  const special = p === 'rotc'
    ? (
        medical
          ? 'HQ'
          : Number(x.willing_to_be_medics || 0) === 1
            ? 'Medics'
            : Number(x.willing_to_be_military_police || 0) === 1
              ? 'MP'
              : Number(x.willing_to_take_advance_course || 0) === 1
                ? 'Advance Course'
                : ''
      )
    : '';

  return `<div class="app-dialog" id="enrollmentModal">
    <div class="app-dialog-backdrop"></div>
    <div class="app-dialog-card enrollment-detail-card student-record-modal-shell">
      <div class="app-dialog-head student-record-head">
        <div class="detail-profile">
          ${x.photo?`<button type="button" class="detail-avatar-button preview-file-btn" data-url="${esc(x.photo)}" data-label="Photo 2x2"><img src="${x.photo}" class="detail-avatar" alt="${esc(fullName)}"></button>`:`<span class="detail-avatar fallback">${esc(studentInitials(x))}</span>`}
          <div>
            <span class="modal-eyebrow">${p.toUpperCase()} Enrollment Record</span>
            <h3>${esc(fullName)}</h3>
 <p>${esc(x.student_id)} - ${esc(x.course)} - ${esc(x.year_level)}</p>
          </div>
        </div>
 <button class="modal-close" id="closeEnrollmentModal" type="button">x</button>
      </div>

      <div class="detail-status-bar">
        <div><small>Enrollment Status</small>${badge(x.status)}</div>
        <div><small>Submitted</small><strong>${oldDateTime(x.created_at)}</strong></div>
        ${special?`<div><small>ROTC Category</small><strong>${esc(special)}</strong></div>`:''}
      </div>

      ${x.rejection_reason?`<div class="warning-banner reject-note"><div><strong>Administrator Remark</strong><span>${esc(x.rejection_reason)}</span></div></div>`:''}

      <div class="student-record-scroll">
        ${detailSection('Personal Information', personal)}
        ${detailSection('Academic Information', academic)}
        ${detailSection('Physical & Health Information', health)}
        ${detailSection('Address Information', address)}
        ${detailSection('Parent / Family Information', family)}
        ${detailSection('Emergency Contact', emergency)}

        <section class="student-detail-section">
          <div class="student-detail-section-head"><h4>Submitted Requirements</h4><span>Click an image to preview it inside the system.</span></div>
          <div class="document-grid">${docs.map(([label,url])=>documentPreviewCard(label,url)).join('')}</div>
        </section>
      </div>

      <div class="modal-review-actions">
        ${x.status==='pending'?`<button class="btn danger" id="rejectEnrollment" type="button">Reject</button><button class="btn success" id="approveEnrollment" type="button">Approve Enrollment</button>`:`<button class="btn" id="resetPending" type="button">Set as Pending</button>`}
        <button class="btn" id="closeEnrollmentBottom" type="button">Close</button>
      </div>

      <div id="rejectBox" class="reject-box hidden">
        <label>Reason for rejection / correction needed</label>
        <textarea id="rejectReason" rows="3" placeholder="Enter the reason or correction needed..."></textarea>
        <div class="actions"><button class="btn" id="cancelReject" type="button">Cancel</button><button class="btn danger" id="confirmReject" type="button">Confirm Rejection</button></div>
      </div>
    </div>

    <div class="file-preview-overlay hidden" id="filePreviewOverlay" aria-hidden="true">
      <div class="file-preview-backdrop"></div>
      <div class="file-preview-dialog">
 <div class="file-preview-head"><strong id="filePreviewTitle">Preview</strong><button type="button" id="closeFilePreview">x</button></div>
        <div class="file-preview-body"><img id="filePreviewImage" alt="File preview"></div>
        <div class="file-preview-actions"><a id="openFileOutside" class="btn primary" target="_blank" rel="noopener">Open outside</a></div>
      </div>
    </div>
  </div>`;
}

async function renderEnrollmentList(p,c){
  const rows=await API.get(`/api/admin/${p}/enrollments`);
  const schedules=await API.get(`/api/admin/${p}/enrollment-schedule`);
  const program=p.toUpperCase(),prefix=p==='cwts'?'CWTS':'MS';
  const scheduleMap={
  }
  ;
  schedules.forEach(s=>scheduleMap[`${s.ms_level}|${s.year}`]=s);
  rows.forEach(x=>{let y='';const sid=String(x.schedule_id||'');const parts=sid.split('_');if(parts.length>=3)y=parts.slice(2).join('_');if(!y){const t=new Date(x.created_at).getTime();const candidates=schedules.filter(s=>String(s.ms_level)===String(x.ms_level));const hit=candidates.find(s=>t>=new Date(s.open_date).getTime()&&t<=new Date(s.deadline).getTime());y=hit?.year||candidates[0]?.year||''}x.school_year=y});
  const schoolYears=[...new Set(rows.map(x=>x.school_year).filter(Boolean))].sort().reverse();
  const counts={
    all:rows.length,pending:rows.filter(x=>x.status==='pending').length,approved:rows.filter(x=>x.status==='approved').length,rejected:rows.filter(x=>x.status==='rejected').length
  }
  ;
  c.innerHTML=`<section class="page-intro-banner ${p}"><div><div class="intro-kicker">${program} Administration</div><h2>Enrollment List</h2><p>View and manage all ${program} enrollments.</p></div><div class="intro-total"><strong>${rows.length}</strong><span>Total Enrollments</span></div></section><section class="enrollment-controls-panel"><div class="enrollment-search-row"><div class="search-box-panel">${icon('records')}<input id="enrollmentSearch" placeholder="Search by name, Student ID, or email..."></div><div class="status-tabs">${['all','pending','approved','rejected'].map(k=>`<button class="status-tab ${k==='all'?'active':''}" data-status="${k}">${
    k[0].toUpperCase()+k.slice(1)
  }
  <span>${
    counts[k]
  }
  </span></button>`).join('')}</div></div><div class="filter-row"><select id="filterLevel"><option value="">All ${p==='cwts'?'CWTS':'MS'} Levels</option><option value="1">${prefix} 1</option><option value="2">${prefix} 2</option></select><select id="filterSY"><option value="">All School Years</option>${schoolYears.map(y=>`<option value="${esc(y)}">SY ${
    esc(y)
  }
  </option>`).join('')}</select><select id="filterYear"><option value="">All Year Levels</option>${['1st Year','2nd Year','3rd Year','4th Year'].map(y=>`<option>${
    y
  }
  </option>`).join('')}</select><select id="filterCourse"><option value="">All Courses</option>${COURSE_OPTIONS.map(y=>`<option>${
    esc(y)
  }
  </option>`).join('')}</select><select id="filterMedical"><option value="">Medical: All</option><option value="yes">With Medical Condition</option><option value="no">No Medical Condition</option></select>${p==='rotc'?`<select id="filterPreference"><option value="">All Preferences</option><option value="medics">Medics</option><option value="mp">MP</option><option value="advance">Advance Course</option></select>`:''}<button class="clear-filter-btn" id="clearFilters">Clear Filters</button></div></section><div class="bulk-action-row"><div id="filterResultText">Showing ${rows.length} enrollment${rows.length===1?'':'s'}</div><div class="actions"><button class="btn danger" id="rejectAllPending">Reject All Pending (<span id="bulkRejectCount">${counts.pending}</span>)</button><button class="btn success" id="approveAllPending">Approve All Pending (<span id="bulkCount">${counts.pending}</span>)</button></div></div><section class="enrollment-table-card"><div class="table-scroll"><table class="data-table enrollment-data-table"><thead><tr><th>Student</th><th>Student ID</th><th>Course & Year</th><th>${p==='cwts'?'CWTS Level':'MS Level'}</th><th>SY</th><th>Date</th><th>Status</th><th>Details</th></tr></thead><tbody id="enrollmentRows"></tbody></table></div><div id="enrollmentEmpty" class="empty-state-card hidden">${icon('enrollment')}<strong>No enrollments found</strong><span>Try adjusting your search or filters.</span></div></section><div id="modalMount"></div>`;
  let activeStatus='all';
  function getFiltered(){
    const q=$('#enrollmentSearch').value.toLowerCase().trim(),lvl=$('#filterLevel').value,sy=$('#filterSY').value,yr=$('#filterYear').value,course=$('#filterCourse').value,med=$('#filterMedical').value,pref=p==='rotc'?$('#filterPreference').value:'';
    return rows.filter(x=>{if(activeStatus!=='all'&&x.status!==activeStatus)return false;if(lvl&&String(x.ms_level)!==lvl)return false;if(sy&&x.school_year!==sy)return false;if(yr&&x.year_level!==yr)return false;if(course&&x.course!==course)return false;if(med==='yes'&&Number(x.has_medical_condition||0)!==1)return false;if(med==='no'&&Number(x.has_medical_condition||0)===1)return false;if(pref==='medics'&&Number(x.willing_to_be_medics||0)!==1)return false;if(pref==='mp'&&Number(x.willing_to_be_military_police||0)!==1)return false;if(pref==='advance'&&Number(x.willing_to_take_advance_course||0)!==1)return false;if(q&&!`${x.first_name} ${x.last_name} ${x.student_id} ${x.email} ${x.course} ${x.year_level}`.toLowerCase().includes(q))return false;return true})
  }
  function draw(){
    const f=getFiltered();
    $('#enrollmentRows').innerHTML=f.map(x=>enrollmentRow(x,p)).join('');
    $('#enrollmentEmpty').classList.toggle('hidden',f.length!==0);
    $('.enrollment-data-table').classList.toggle('hidden',f.length===0);
    $('#filterResultText').textContent=`Showing ${f.length} of ${rows.length} enrollment${rows.length===1?'':'s'}`;
    const pending=f.filter(x=>x.status==='pending');
    $('#bulkCount').textContent=pending.length;
    $('#bulkRejectCount').textContent=pending.length;
    $('#approveAllPending').disabled=pending.length===0;
    $('#rejectAllPending').disabled=pending.length===0;
    document.querySelectorAll('.view-edit-link').forEach(btn=>btn.onclick=()=>openDetail(Number(btn.dataset.record)))
  }
  async function openDetail(id){
    const listRow=rows.find(r=>Number(r.record_id)===id);
    if(!listRow)return;
    $('#modalMount').innerHTML=`<div class="app-dialog" id="enrollmentModal"><div class="app-dialog-backdrop"></div><div class="app-dialog-card enrollment-detail-card"><div class="page-loading"><span class="page-spinner"></span><strong>Loading student record...</strong></div></div></div>`;
    let x;
    try {
      x=await API.get(`/api/admin/${p}/enrollments/${id}`);
      x.school_year=listRow.school_year;
    } catch(error) {
      $('#modalMount').innerHTML='';
      toast(error.message,true);
      return;
    }
    $('#modalMount').innerHTML=enrollmentDetailModal(x,p);
    const modal=$('#enrollmentModal');
    function close(){
      modal.remove()
    }
    $('#closeEnrollmentModal').onclick=close;
    $('#closeEnrollmentBottom').onclick=close;
    modal.querySelector('.app-dialog-backdrop').onclick=close;

    const previewOverlay=$('#filePreviewOverlay');
    const previewImage=$('#filePreviewImage');
    const previewTitle=$('#filePreviewTitle');
    const openOutside=$('#openFileOutside');
    function closePreview(){
      previewOverlay?.classList.add('hidden');
      previewOverlay?.setAttribute('aria-hidden','true');
      if(previewImage) previewImage.removeAttribute('src');
    }
    $$('.preview-file-btn', modal).forEach(button=>button.addEventListener('click',()=>{
      const url=button.dataset.url;
      if(!url||!previewOverlay||!previewImage)return;
      previewImage.src=url;
      previewImage.alt=button.dataset.label||'File preview';
      previewTitle.textContent=button.dataset.label||'File preview';
      openOutside.href=url;
      previewOverlay.classList.remove('hidden');
      previewOverlay.setAttribute('aria-hidden','false');
    }));
    $('#closeFilePreview')?.addEventListener('click',closePreview);
    previewOverlay?.querySelector('.file-preview-backdrop')?.addEventListener('click',closePreview);
    if($('#approveEnrollment'))$('#approveEnrollment').onclick=async()=>{
      const button=$('#approveEnrollment');
      button.disabled=true;
      button.textContent='Approving...';
      try{
        const z=await API.patch(`/api/admin/${p}/enrollments/${id}`,{status:'approved'});
        toast(z.message);
        setTimeout(()=>location.reload(),450)
      }   catch(e){
        button.disabled=false;
        button.textContent='Approve Enrollment';
        toast(e.message,true)
      }
    }
    ;
    if($('#rejectEnrollment'))$('#rejectEnrollment').onclick=()=>$('#rejectBox').classList.remove('hidden');
    if($('#cancelReject'))$('#cancelReject').onclick=()=>$('#rejectBox').classList.add('hidden');
    if($('#confirmReject'))$('#confirmReject').onclick=async()=>{
      const reason=$('#rejectReason').value.trim();
      if(!reason)return toast('Enter the reason for rejection or correction needed.',true);
      try{
        const z=await API.patch(`/api/admin/${p}/enrollments/${id}`,{status:'rejected',rejection_reason:reason});
        toast(z.message);
        setTimeout(()=>location.reload(),450)
      }   catch(e){
        toast(e.message,true)
      }
    }
    ;
    if($('#resetPending'))$('#resetPending').onclick=async()=>{
      try{
        const z=await API.patch(`/api/admin/${p}/enrollments/${id}`,{status:'pending'});
        toast(z.message);
        setTimeout(()=>location.reload(),450)
      }   catch(e){
        toast(e.message,true)
      }
    }
  }
  document.querySelectorAll('.status-tab').forEach(b=>b.onclick=()=>{activeStatus=b.dataset.status;document.querySelectorAll('.status-tab').forEach(x=>x.classList.toggle('active',x===b));draw()});
  ['enrollmentSearch','filterLevel','filterSY','filterYear','filterCourse','filterMedical',...(p==='rotc'?['filterPreference']:[])].forEach(id=>$('#'+id).addEventListener(id==='enrollmentSearch'?'input':'change',draw));
  $('#clearFilters').onclick=()=>{
    $('#enrollmentSearch').value='';
    $('#filterLevel').value='';
    $('#filterSY').value='';
    $('#filterYear').value='';
    $('#filterCourse').value='';
    $('#filterMedical').value='';
    if(p==='rotc')$('#filterPreference').value='';
    activeStatus='all';
    document.querySelectorAll('.status-tab').forEach(x=>x.classList.toggle('active',x.dataset.status==='all'));
    draw()
  }
  ;
  $('#approveAllPending').onclick=async()=>{
    const ids=getFiltered().filter(x=>x.status==='pending').map(x=>x.record_id);
    if(!ids.length)return;
    const b=$('#approveAllPending');
    b.disabled=true;
    b.textContent='Approving...';
    try{
      const z=await API.post(`/api/admin/${p}/enrollments/bulk-approve`,{ids});
      toast(z.message);
      setTimeout(()=>location.reload(),600)
    }   catch(e){
      b.disabled=false;
      toast(e.message,true)
    }
  }
  ;
  function closeBulkRejectModal(){
    $('#bulkRejectModal')?.remove();
  }
  function openBulkRejectModal(ids){
 $('#modalMount').innerHTML=`<div class="app-dialog" id="bulkRejectModal"><div class="app-dialog-backdrop"></div><div class="app-dialog-card schedule-modal-card"><div class="app-dialog-head"><div><span class="modal-eyebrow">${program} Enrollment</span><h3>Reject All Pending</h3><p>Enter the rejection reason that will be shown to all selected students.</p></div><button type="button" class="modal-close" id="closeBulkRejectModal">x</button></div><div class="schedule-form-old" style="grid-template-columns:1fr"><div class="reject-box" style="display:block"><label for="bulkRejectReason">Rejection reason</label><textarea id="bulkRejectReason" rows="5" placeholder="Enter the reason or correction needed..."></textarea></div><div class="app-dialog-actions"><button type="button" class="btn" id="cancelBulkReject">Cancel</button><button type="button" class="btn danger" id="confirmBulkReject">Reject Selected</button></div></div></div></div>`;
    $('#closeBulkRejectModal').onclick=closeBulkRejectModal;
    $('#cancelBulkReject').onclick=closeBulkRejectModal;
    $('#bulkRejectModal .app-dialog-backdrop').onclick=closeBulkRejectModal;
    $('#confirmBulkReject').onclick=async()=>{
      const rejectionReason=$('#bulkRejectReason').value.trim();
      if(!rejectionReason)return toast('Enter the reason for rejecting the selected enrollments.',true);
      const button=$('#confirmBulkReject');
      button.disabled=true;
      button.textContent='Rejecting...';
      try{
        const z=await API.post(`/api/admin/${p}/enrollments/bulk-reject`,{ids,rejection_reason:rejectionReason});
        closeBulkRejectModal();
        toast(z.message);
        setTimeout(()=>location.reload(),600)
      }catch(e){
        button.disabled=false;
        button.textContent='Reject Selected';
        toast(e.message,true)
      }
    }
    ;
  }
  $('#rejectAllPending').onclick=async()=>{
    const ids=getFiltered().filter(x=>x.status==='pending').map(x=>x.record_id);
    if(!ids.length)return;
    openBulkRejectModal(ids);
  }
  ;
  draw()
}
function rosterName(x){
  return `${esc(x.last_name||'')}, ${esc(x.first_name||'')}${x.middle_name?` ${
    esc(x.middle_name[0])
  }
  .`:''}${x.suffix?` ${
    esc(x.suffix)
  }
  `:''}`
}
function rosterRows(list){
  return list.length?`<div class="roster-table-wrap"><table class="roster-table"><thead><tr><th>#</th><th>Student ID</th><th>Name</th><th>Course</th><th>Year Level</th></tr></thead><tbody>${list.map((x,i)=>`<tr><td>${
    i+1
  }
  </td><td><strong>${
    esc(x.student_id)
  }
  </strong></td><td>${
    rosterName(x)
  }
  </td><td>${
    esc(x.course||'-')
  }
  </td><td>${
    esc(x.year_level||'-')
  }
  </td></tr>`).join('')}</tbody></table></div>`:`<div class="roster-empty">No members assigned yet.</div>`
}
function rosterSummary(label,value,sub='',tone='blue'){
  return `<div class="roster-stat ${tone}"><div class="roster-stat-label">${esc(label)}</div><div class="roster-stat-value">${esc(value)}</div>${sub?`<div class="roster-stat-sub">${
    esc(sub)
  }
  </div>`:''}</div>`
}
function expanderCard(key,title,count,cap,body,tone='blue',badgeText=''){
  const pct=cap&&Number.isFinite(cap)?Math.min(100,Math.round(count/cap*100)):0;
  return `<div class="roster-expand-card" data-expand-card="${esc(key)}"><button class="roster-expand-head" type="button" data-expand="${esc(key)}"><span class="roster-letter ${tone}">${esc(title[0])}</span><span class="roster-expand-copy"><span class="roster-expand-title">${esc(title)} ${badgeText?`<em>${
    esc(badgeText)
  }
  </em>`:''}</span>${Number.isFinite(cap)?`<span class="roster-progress"><i class="${tone}" style="width:${pct}%"></i></span>`:''}</span><span class="roster-count">${count}${Number.isFinite(cap)?`/${
    cap
  }
  `:''}</span><span class="roster-chevron">v</span></button><div class="roster-expand-body" id="expand-${esc(key)}">${body}</div></div>`
}
function bindRosterExpanders(){
  $$('[data-expand]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = button.dataset.expand;
      const card = $(`[data-expand-card="${key}"]`);
      const isOpen = card?.classList.toggle('open');
      const body = card ? $('.roster-expand-body', card) : null;
      if (body) body.style.display = isOpen ? 'block' : 'none';
      button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    };
  });
}
async function renderCWTSCompanyRoster(c){
  const rows=await API.get('/api/admin/cwts/roster');
  const companies=['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot'],limit=60;
  let alphabetical=false;
  const grouped=Object.fromEntries(companies.map(x=>[x,rows.filter(r=>r.company===x)]));
  const draw=()=>{
    const shown=Object.fromEntries(companies.map(x=>[x,[...grouped[x]].sort((a,b)=>alphabetical?String(a.last_name).localeCompare(String(b.last_name)):0)]));
    const total=companies.reduce((n,x)=>n+shown[x].length,0),capacity=companies.length*limit;
    c.innerHTML=`<div class="page-intro-banner emerald"><div><div class="page-intro-kicker">CWTS ADMIN</div><h2>CWTS Company List</h2><p>Approved CWTS enrollments are automatically assigned to their respective companies.</p></div><button class="page-intro-action emerald" id="sortCompanies">${alphabetical?'Applied Alphabetical Sort':'Sort Alphabetical'}</button></div><div class="roster-summary-grid four">${rosterSummary('Total Assigned',total,'students','slate')}${rosterSummary('Total Capacity',capacity,'6 companies','slate')}${rosterSummary('Available Slots',capacity-total,'remaining','green')}${rosterSummary('Companies',companies.length,`${
      limit
    }
    slots each`,'slate')}</div><div class="roster-stack">${companies.map((co,i)=>expanderCard(`cwts-${
      i
    }
    `,co,shown[co].length,limit,rosterRows(shown[co]),['blue','green','amber','purple','rose','cyan'][i])).join('')}</div>`;
    $('#sortCompanies').onclick=()=>{
      alphabetical=true;
      draw()
    }
    ;
    bindRosterExpanders();
  }
  ;
  draw();
}
async function renderROTCRoster(c,specialOnly=false){
  const [rows,schedules]=await Promise.all([API.get('/api/admin/rotc/roster'),API.get('/api/admin/rotc/enrollment-schedule')]);
  const maleCos=['Alpha','Bravo','Charlie','Delta'],femaleCos=['Echo','Foxtrot','Golf','Hotel'],platoonCap=37,platoons=4;
  const latest=[...schedules].sort((a,b)=>Number(b.id)-Number(a.id))[0];
  let ms=String(latest?.ms_level||'1');
  const draw=()=>{
    const current=rows.filter(r=>String(r.ms_level)===ms);
    const sched=[...schedules].filter(x=>String(x.ms_level)===ms).sort((a,b)=>Number(b.id)-Number(a.id))[0];
    const closed=!sched||Date.now()>new Date(sched.deadline).getTime();
    const special={
      Medics:current.filter(x=>x.special_unit==='Medics'),HQ:current.filter(x=>x.special_unit==='HQ'),MP:current.filter(x=>x.special_unit==='MP')
    }
    ;
    if(specialOnly){
      const total=Object.values(special).flat().length;
      c.innerHTML=`<div class="page-intro-banner rose"><div><div class="page-intro-kicker">ROTC ADMIN</div><h2>Special Platoon</h2><p>View cadets assigned to Medics, HQ, and Military Police.</p></div><select id="specialMs" class="roster-ms-select"><option value="1" ${ms==='1'?'selected':''}>MS 1</option><option value="2" ${ms==='2'?'selected':''}>MS 2</option></select></div><div class="roster-summary-grid four">${rosterSummary('Special Members',total,'all units','rose')}${rosterSummary('Medics',special.Medics.length,'of 37','rose')}${rosterSummary('HQ',special.HQ.length,'no limit','blue')}${rosterSummary('Military Police',special.MP.length,'of 37','green')}</div><div class="roster-section-title"><h3>Special Platoon</h3><span class="unit-badge medical">MEDICAL</span><small>${total} members</small></div><div class="roster-stack">${expanderCard('medics','Medics',special.Medics.length,37,rosterRows(special.Medics),'rose')}${expanderCard('hq','HQ',special.HQ.length,Infinity,rosterRows(special.HQ),'blue')}${expanderCard('mp','MP',special.MP.length,37,rosterRows(special.MP),'green')}</div>`;
      $('#specialMs').onchange=e=>{
        ms=e.target.value;
        draw()
      }
      ;
      bindRosterExpanders();
      return;
    }
    const advanceMale=current.filter(x=>Number(x.willing_to_take_advance_course||0)===1&&x.sex==='Male'&&!x.special_unit),advanceFemale=current.filter(x=>Number(x.willing_to_take_advance_course||0)===1&&x.sex==='Female'&&!x.special_unit);
    const regular=current.filter(x=>!x.special_unit&&Number(x.willing_to_take_advance_course||0)!==1);
    const b1=regular.filter(x=>x.battalion===1||String(x.battalion)==='1'),b2=regular.filter(x=>x.battalion===2||String(x.battalion)==='2');
    const specialTotal=Object.values(special).flat().length,advanceTotal=advanceMale.length+advanceFemale.length,total=b1.length+b2.length+specialTotal+advanceTotal,bCap=maleCos.length*platoons*platoonCap;
 const battalion=(num,label,companies,list)=>`<div class="roster-section-title"><h3>Battalion ${num} - ${label}</h3><small>${list.length}/${bCap}</small></div><div class="roster-stack">${companies.map((co,ci)=>{const companyList=list.filter(x=>x.rotc_company===co);const phtml=Array.from({length:platoons},(_,i)=>{const pn=i+1,students=companyList.filter(x=>Number(x.rotc_platoon)===pn);return expanderCard(`b${
      num
    }
    -${
      ci
    }
    -${
      pn
    }
    `,`Platoon ${
      pn
    }
    `,students.length,platoonCap,rosterRows(students),['blue','green','amber','purple','rose','cyan','orange','teal'][ci+(num===2?4:0)]);}).join('');return `<div class="company-card"><div class="company-card-head"><span class="roster-letter ${['blue','green','amber','purple','rose','cyan','orange','teal'][ci+(num===2?4:0)]}">${
      co[0]
    }
    </span><div><strong>${
      co
    }
    Company</strong><small>${
      companyList.length
    }
    /${
      platoons*platoonCap
    }
    </small></div></div>${
      phtml
    }
    </div>`}).join('')}</div>`;
    c.innerHTML=`<div class="page-intro-banner sky"><div><div class="page-intro-kicker">ROTC ADMIN</div><h2>ROTC Platoon List</h2><p>View and assign the platoon for ROTC MS ${ms} cadets.</p></div><select id="rosterMs" class="roster-ms-select"><option value="1" ${ms==='1'?'selected':''}>MS 1</option><option value="2" ${ms==='2'?'selected':''}>MS 2</option></select></div><div class="roster-summary-grid six">${rosterSummary('Total Cadets',total,'','slate')}${rosterSummary('Battalion 1 (M)',`${
      b1.length
    }
    /${
      bCap
    }
    `,'','blue')}${rosterSummary('Battalion 2 (F)',`${
      b2.length
    }
    /${
      bCap
    }
    `,'','rose')}${rosterSummary('Advance Course',advanceTotal,'cadets','amber')}${rosterSummary('Special Platoon',specialTotal,'members','green')}${rosterSummary('Schedule',closed?'Closed':'Open / Upcoming',closed?'Ready to assign':'Waiting to close',closed?'green':'amber')}</div><div class="assignment-box ${closed?'ready':'waiting'}"><div class="assignment-copy"><span class="assignment-icon">${closed?'Ready':'Pending'}</span><div><strong>Platoon Assignment</strong><p>${closed?`MS ${
      ms
    }
    enrollment is closed. You can now assign cadets to platoons.`:`Waiting for the MS ${
      ms
    }
    enrollment schedule to close before assignment.`}</p></div></div><button class="btn primary assign-wide" id="assignPlatoons" ${closed?'':'disabled'}>${closed?'Assign Platoons':'Assignment Locked'}</button><div id="assignResult"></div></div>${battalion(1,'Male',maleCos,b1)}${battalion(2,'Female',femaleCos,b2)}<div class="roster-section-title"><h3>Advance Course List</h3><span class="unit-badge advance">ADVANCE</span><small>${advanceTotal} cadets</small></div><div class="roster-stack">${expanderCard('advance-male','Male',advanceMale.length,Infinity,rosterRows(advanceMale),'purple')}${expanderCard('advance-female','Female',advanceFemale.length,Infinity,rosterRows(advanceFemale),'rose')}</div><div class="roster-section-title"><h3>Special Platoon</h3><span class="unit-badge medical">MEDICAL</span><small>${specialTotal} members</small></div><div class="roster-stack">${expanderCard('medics','Medics',special.Medics.length,37,rosterRows(special.Medics),'rose')}${expanderCard('hq','HQ',special.HQ.length,Infinity,rosterRows(special.HQ),'blue')}${expanderCard('mp','MP',special.MP.length,37,rosterRows(special.MP),'green')}</div>`;
    $('#rosterMs').onchange=e=>{
      ms=e.target.value;
      draw()
    }
    ;
    const assign=$('#assignPlatoons');
    if(assign)assign.onclick=async()=>{
      if(!confirm(`Assign approved ROTC MS ${ms} cadets now?`))return;
      assign.disabled=true;
      assign.textContent='Assigning...';
      try{
        const x=await API.post('/api/admin/rotc/auto-assign',{ms_level:ms});
        $('#assignResult').innerHTML=`<div class="assignment-result success">${esc(x.message)}</div>`;
        setTimeout(()=>location.reload(),700)
      }   catch(e){
        $('#assignResult').innerHTML=`<div class="assignment-result error">${esc(e.message)}</div>`;
        assign.disabled=false;
        assign.textContent='Assign Platoons'
      }
    }
    ;
    bindRosterExpanders();
  }
  ;
  draw();
}
function enrollmentTable(rows,p){
  return table(['Student ID','Name','Course','MS','Status','Action'],rows.map(x=>`<tr><td><strong>${esc(x.student_id)}</strong></td><td>${esc(x.last_name+', '+x.first_name)}</td><td>${esc(x.course)}</td><td>MS ${x.ms_level}</td><td>${badge(x.status)}</td><td><div class="actions"><button class="btn small success" onclick="setEnrollment('${p}',${x.record_id},'approved')">Approve</button><button class="btn small danger" onclick="setEnrollment('${p}',${x.record_id},'rejected')">Reject</button></div></td></tr>`))
}
async function setEnrollment(p,id,status){
  let reason='';
  if(status==='rejected'){
    reason=prompt('Enter the reason for rejection:')||'';
    if(!reason)return
  }
  try{
    const x=await API.patch(`/api/admin/${p}/enrollments/${id}`,{status,rejection_reason:reason});
    toast(x.message);
    setTimeout(()=>location.reload(),500)
  }   catch(e){
    toast(e.message,true)
  }
}
async function saveGrade(p,id){
  try{
    const mid=Number($(`#m${id}`).value),fin=Number($(`#f${id}`).value),ms=$(`#gms${id}`).value;
    if(mid<1||mid>5||fin<1||fin>5)return toast('Grades must be between 1.00 and 5.00.',true);
    const x=await API.post(`/api/admin/${p}/grades`,{student_id:id,ms_level:ms,midterm:mid,final_term:fin});
 toast(`${x.message} Final Grade: ${Number(x.grade).toFixed(2)} - ${x.status}`);
    setTimeout(()=>location.reload(),500)
  }   catch(e){
    toast(e.message,true)
  }
}
async function saveOffense(p,id){
  try{
    const x=await API.post(`/api/admin/${p}/offenses`,{student_id:id,offend:$(`#o${id}`).value,settled:$(`#s${id}`).checked});
    toast(x.message)
  }   catch(e){
    toast(e.message,true)
  }
}
async function saveSerial(p,id){
  try{
    const value=$(`#sn${id}`).value.trim();
    if(!value)return toast('Enter a serial number first.',true);
    const x=await API.post(`/api/admin/${p}/serial-numbers`,{student_id:id,serial_number:value});
    toast(x.message)
  }   catch(e){
    toast(e.message,true)
  }
}
async function withdraw(id,status){
  try{
    const remarks=prompt('Admin remarks (optional):')||'';
    const x=await API.patch(`/api/admin/rotc/withdrawals/${id}`,{status,admin_remarks:remarks});
    toast(x.message);
    setTimeout(()=>location.reload(),500)
  }   catch(e){
    toast(e.message,true)
  }
}
function recordsTable(rows){
  return table(['Student ID','Name','Course','Year','Program','Assignment','Email'],rows.map(x=>`<tr><td><strong>${esc(x.student_id)}</strong></td><td>${esc(x.last_name+', '+x.first_name)}</td><td>${esc(x.course)}</td><td>${esc(x.year_level)}</td><td>${esc(x.nstp_component)}</td><td>${esc(x.company||x.special_unit||x.rotc_company||'-')}</td><td>${esc(x.email)}</td></tr>`))
}

function settingsHtml() {
  return `
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>Account Settings</h2>
          <p class="panel-subtitle">
            Keep your account secure by changing your password when needed.
          </p>
        </div>
      </div>

      <form id="passwordForm" class="form-grid">
        <div class="field">
          <label>Current Password</label>
          <input type="password" name="currentPassword" required>
        </div>

        <div class="field">
          <label>New Password</label>
          <input type="password" name="newPassword" minlength="8" required>
        </div>

        <div class="field full">
          <button class="btn primary" type="submit">Change Password</button>
        </div>
      </form>
    </div>
  `;
}

function bindSettings() {
  const form = $("#passwordForm");
  if (!form) return;

  form.onsubmit = async (event) => {
    event.preventDefault();

    try {
      const response = await API.post(
        "/api/auth/change-password",
        formToObject(form)
      );
      toast(response.message);
      form.reset();
    } catch (error) {
      toast(error.message, true);
    }
  };
}

async function renderROTCRoster(c, specialOnly = false) {
  const [allCycleRows, schedules] = await Promise.all([
    API.get("/api/admin/rotc/roster?all_cycles=1"),
    API.get("/api/admin/rotc/enrollment-schedule"),
  ]);

  const maleCompanies = ["Alpha", "Bravo", "Charlie", "Delta"];
  const femaleCompanies = ["Echo", "Foxtrot", "Golf", "Hotel"];
  const platoonCap = 37;
  const platoons = 4;
  const tones = ["blue", "green", "amber", "purple", "rose", "cyan", "orange", "teal"];
  const latest = [...schedules].sort((a, b) => Number(b.id) - Number(a.id))[0];
  let selectedLevel = String(latest?.ms_level || "1");
  let selectedYear = String(latest?.year || "");

  const levels = [...new Set(
    [
      ...allCycleRows.map((row) => String(row.ms_level || "").trim()),
      ...schedules.map((row) => String(row.ms_level || "").trim()),
    ].filter(Boolean)
  )].sort((a, b) => Number(a) - Number(b));
  const years = [...new Set(
    [
      ...allCycleRows.map((row) => String(row.school_year || "").trim()),
      ...schedules.map((row) => String(row.year || "").trim()),
    ].filter(Boolean)
  )].sort().reverse();

  function battalionMarkup(num, label, companies, list, battalionCap) {
    const companyCards = companies.map((company, companyIndex) => {
      const tone = tones[companyIndex + (num === 2 ? 4 : 0)];
      const companyList = list.filter((student) => student.rotc_company === company);
      const platoonCards = Array.from({ length: platoons }, (_, index) => {
        const platoonNumber = index + 1;
        const students = companyList.filter(
          (student) => Number(student.rotc_platoon) === platoonNumber
        );
        return expanderCard(
          `rotc-${num}-${company}-${platoonNumber}`,
          `Platoon ${platoonNumber}`,
          students.length,
          platoonCap,
          rosterRows(students),
          tone
        );
      }).join("");

      return `<div class="company-card"><div class="company-card-head"><span class="roster-letter ${tone}">${company[0]}</span><div><strong>${company} Company</strong><small>${companyList.length}/${platoons * platoonCap}</small></div></div>${platoonCards}</div>`;
    }).join("");

    return `<div class="roster-section-title"><h3>Battalion ${num} - ${label}</h3><small>${list.length}/${battalionCap}</small></div><div class="roster-stack">${companyCards}</div>`;
  }

  const draw = () => {
    const current = allCycleRows.filter((row) => {
      if (selectedLevel && String(row.ms_level || "") !== selectedLevel) return false;
      if (selectedYear && String(row.school_year || "") !== selectedYear) return false;
      return true;
    });
    const schedule = [...schedules]
      .filter((item) => (
        (!selectedLevel || String(item.ms_level || "") === selectedLevel)
        && (!selectedYear || String(item.year || "") === selectedYear)
      ))
      .sort((a, b) => Number(b.id) - Number(a.id))[0];
    const closed = Boolean(schedule) && Date.now() > new Date(schedule.deadline).getTime();
    const cycleLabel = [
      selectedLevel ? `MS ${selectedLevel}` : "all MS levels",
      selectedYear ? `SY ${selectedYear}` : "all school years",
    ].join(" - ");
    const canAssign = Boolean(selectedLevel && selectedYear && schedule && closed);

    const special = {
      Medics: current.filter((student) => student.special_unit === "Medics"),
      HQ: current.filter((student) => student.special_unit === "HQ"),
      MP: current.filter((student) => student.special_unit === "MP"),
    };

    if (specialOnly) {
      const total = Object.values(special).flat().length;
      c.innerHTML = `<div class="page-intro-banner rose"><div><div class="page-intro-kicker">ROTC ADMIN</div><h2>Special Platoon</h2><p>View cadets assigned to Medics, HQ, and Military Police.</p></div><div class="filter-row"><select id="specialMs" class="roster-ms-select"><option value="">All MS Levels</option>${levels.map((level) => `<option value="${esc(level)}" ${selectedLevel === String(level) ? "selected" : ""}>MS ${esc(level)}</option>`).join("")}</select><select id="specialYear" class="roster-ms-select"><option value="">All School Years</option>${years.map((year) => `<option value="${esc(year)}" ${selectedYear === String(year) ? "selected" : ""}>SY ${esc(year)}</option>`).join("")}</select></div></div><section class="section-card"><div class="section-heading"><h2>Filter Special Platoon</h2><p>Showing ${esc(cycleLabel)}.</p></div></section><div class="roster-summary-grid four">${rosterSummary("Special Members", total, "all units", "rose")}${rosterSummary("Medics", special.Medics.length, "of 37", "rose")}${rosterSummary("HQ", special.HQ.length, "no limit", "blue")}${rosterSummary("Military Police", special.MP.length, "of 37", "green")}</div><div class="roster-section-title"><h3>Special Platoon</h3><span class="unit-badge medical">MEDICAL</span><small>${total} members</small></div><div class="roster-stack">${expanderCard("medics", "Medics", special.Medics.length, 37, rosterRows(special.Medics), "rose")}${expanderCard("hq", "HQ", special.HQ.length, Infinity, rosterRows(special.HQ), "blue")}${expanderCard("mp", "MP", special.MP.length, 37, rosterRows(special.MP), "green")}</div>`;
      $("#specialMs").onchange = (event) => {
        selectedLevel = event.target.value;
        draw();
      };
      $("#specialYear").onchange = (event) => {
        selectedYear = event.target.value;
        draw();
      };
      bindRosterExpanders();
      return;
    }

    const advanceMale = current.filter(
      (student) =>
        Number(student.willing_to_take_advance_course || 0) === 1 &&
        student.sex === "Male" &&
        !student.special_unit
    );
    const advanceFemale = current.filter(
      (student) =>
        Number(student.willing_to_take_advance_course || 0) === 1 &&
        student.sex === "Female" &&
        !student.special_unit
    );
    const regular = current.filter(
      (student) =>
        !student.special_unit &&
        Number(student.willing_to_take_advance_course || 0) !== 1
    );
    const battalionOne = regular.filter(
      (student) => student.battalion === 1 || String(student.battalion) === "1"
    );
    const battalionTwo = regular.filter(
      (student) => student.battalion === 2 || String(student.battalion) === "2"
    );
    const specialTotal = Object.values(special).flat().length;
    const advanceTotal = advanceMale.length + advanceFemale.length;
    const total = battalionOne.length + battalionTwo.length + specialTotal + advanceTotal;
    const battalionCap = maleCompanies.length * platoons * platoonCap;

    c.innerHTML = `<div class="page-intro-banner sky"><div><div class="page-intro-kicker">ROTC ADMIN</div><h2>ROTC Platoon List</h2><p>View and assign the platoon roster by MS level and school year.</p></div><div class="filter-row"><select id="rosterMs" class="roster-ms-select"><option value="">All MS Levels</option>${levels.map((level) => `<option value="${esc(level)}" ${selectedLevel === String(level) ? "selected" : ""}>MS ${esc(level)}</option>`).join("")}</select><select id="rosterYear" class="roster-ms-select"><option value="">All School Years</option>${years.map((year) => `<option value="${esc(year)}" ${selectedYear === String(year) ? "selected" : ""}>SY ${esc(year)}</option>`).join("")}</select></div></div><section class="section-card"><div class="section-heading"><h2>Current Filter</h2><p>Showing ${esc(cycleLabel)}.</p></div></section><div class="roster-summary-grid six">${rosterSummary("Total Cadets", total, "", "slate")}${rosterSummary("Battalion 1 (M)", `${battalionOne.length}/${battalionCap}`, "", "blue")}${rosterSummary("Battalion 2 (F)", `${battalionTwo.length}/${battalionCap}`, "", "rose")}${rosterSummary("Advance Course", advanceTotal, "cadets", "amber")}${rosterSummary("Special Platoon", specialTotal, "members", "green")}${rosterSummary("Schedule", canAssign ? "Closed" : schedule ? "Open / Upcoming" : "No Schedule", canAssign ? "Ready to assign" : schedule ? "Waiting to close" : "Pick one cycle", canAssign ? "green" : "amber")}</div><div class="assignment-box ${canAssign ? "ready" : "waiting"}"><div class="assignment-copy"><span class="assignment-icon">${canAssign ? "Ready" : "Pending"}</span><div><strong>Platoon Assignment</strong><p>${canAssign ? `MS ${selectedLevel} enrollment for SY ${selectedYear} is closed. You can now assign cadets to platoons.` : selectedLevel && selectedYear && schedule ? `Waiting for the MS ${selectedLevel} enrollment schedule for SY ${selectedYear} to close before assignment.` : "Choose both an MS level and a school year to assign cadets for one ROTC cycle."}</p></div></div><button class="btn primary assign-wide" id="assignPlatoons" ${canAssign ? "" : "disabled"}>${canAssign ? "Assign Platoons" : "Assignment Locked"}</button><div id="assignResult"></div></div>${battalionMarkup(1, "Male", maleCompanies, battalionOne, battalionCap)}${battalionMarkup(2, "Female", femaleCompanies, battalionTwo, battalionCap)}<div class="roster-section-title"><h3>Advance Course List</h3><span class="unit-badge advance">ADVANCE</span><small>${advanceTotal} cadets</small></div><div class="roster-stack">${expanderCard("advance-male", "Male", advanceMale.length, Infinity, rosterRows(advanceMale), "purple")}${expanderCard("advance-female", "Female", advanceFemale.length, Infinity, rosterRows(advanceFemale), "rose")}</div><div class="roster-section-title"><h3>Special Platoon</h3><span class="unit-badge medical">MEDICAL</span><small>${specialTotal} members</small></div><div class="roster-stack">${expanderCard("medics", "Medics", special.Medics.length, 37, rosterRows(special.Medics), "rose")}${expanderCard("hq", "HQ", special.HQ.length, Infinity, rosterRows(special.HQ), "blue")}${expanderCard("mp", "MP", special.MP.length, 37, rosterRows(special.MP), "green")}</div>`;

    $("#rosterMs").onchange = (event) => {
      selectedLevel = event.target.value;
      draw();
    };

    $("#rosterYear").onchange = (event) => {
      selectedYear = event.target.value;
      draw();
    };

    const assign = $("#assignPlatoons");
    if (assign) {
      assign.onclick = async () => {
        if (!confirm(`Assign approved ROTC MS ${selectedLevel} cadets for SY ${selectedYear} now?`)) return;
        assign.disabled = true;
        assign.textContent = "Assigning...";
        try {
          const result = await API.post("/api/admin/rotc/auto-assign", {
            ms_level: selectedLevel,
            school_year: selectedYear,
          });
          $("#assignResult").innerHTML = `<div class="assignment-result success">${esc(result.message)}</div>`;
          setTimeout(() => location.reload(), 700);
        } catch (error) {
          $("#assignResult").innerHTML = `<div class="assignment-result error">${esc(error.message)}</div>`;
          assign.disabled = false;
          assign.textContent = "Assign Platoons";
        }
      };
    }

    bindRosterExpanders();
  };

  draw();
}

async function renderCWTSCompanyRoster(c) {
  const defaultRows = await API.get("/api/admin/cwts/roster");
  const allCycleRows = await API.get("/api/admin/cwts/roster?all_cycles=1");
  const companies = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
  const limit = 60;
  let alphabetical = false;
  let selectedLevel = "";
  let selectedYear = "";

  const levels = [...new Set(allCycleRows.map((row) => String(row.ms_level || "").trim()).filter(Boolean))].sort();
  const years = [...new Set(allCycleRows.map((row) => String(row.school_year || "").trim()).filter(Boolean))].sort().reverse();

  const filteredRows = () => {
    const source = selectedLevel || selectedYear ? allCycleRows : defaultRows;
    return source.filter((row) => {
      if (selectedLevel && String(row.ms_level || "") !== selectedLevel) return false;
      if (selectedYear && String(row.school_year || "") !== selectedYear) return false;
      return true;
    });
  };

  const draw = () => {
    const rows = filteredRows();
    const grouped = Object.fromEntries(
      companies.map((company) => [company, rows.filter((row) => row.company === company)])
    );
    const shown = Object.fromEntries(
      companies.map((company) => [
        company,
        [...grouped[company]].sort((a, b) =>
          alphabetical
            ? `${a.last_name || ""}`.localeCompare(`${b.last_name || ""}`, undefined, { sensitivity: "base" })
            : 0
        ),
      ])
    );

    const total = companies.reduce((sum, company) => sum + shown[company].length, 0);
    const capacity = companies.length * limit;

    c.innerHTML = `<div class="page-intro-banner emerald"><div><div class="page-intro-kicker">CWTS ADMIN</div><h2>CWTS Company List</h2><p>Approved CWTS enrollments are automatically assigned to their respective companies.</p></div><button class="page-intro-action emerald" id="sortCompanies">${alphabetical ? "Applied Alphabetical Sort" : "Sort Alphabetical"}</button></div><section class="section-card"><div class="section-heading"><h2>Filter Enrolled Students</h2><p>Filter this company roster by CWTS level and school year.</p></div><div class="filter-row"><select id="cwtsRosterLevel"><option value="">All CWTS Levels</option>${levels.map((level) => `<option value="${esc(level)}" ${selectedLevel === String(level) ? "selected" : ""}>CWTS ${esc(level)}</option>`).join("")}</select><select id="cwtsRosterYear"><option value="">All School Years</option>${years.map((year) => `<option value="${esc(year)}" ${selectedYear === String(year) ? "selected" : ""}>SY ${esc(year)}</option>`).join("")}</select><button class="clear-filter-btn" id="clearCwtsRosterFilters">Clear Filters</button></div></section><div class="roster-summary-grid four">${rosterSummary("Total Assigned", total, "students", "slate")}${rosterSummary("Total Capacity", capacity, "6 companies", "slate")}${rosterSummary("Available Slots", capacity - total, "remaining", "green")}${rosterSummary("Companies", companies.length, `${limit} slots each`, "slate")}</div><div class="roster-stack">${companies.map((company, index) => expanderCard(`cwts-${company}`, company, shown[company].length, limit, rosterRows(shown[company]), ["blue", "green", "amber", "purple", "rose", "cyan"][index])).join("")}</div>`;

    $("#sortCompanies").onclick = () => {
      alphabetical = true;
      draw();
    };

    $("#cwtsRosterLevel").onchange = (event) => {
      selectedLevel = event.target.value;
      draw();
    };

    $("#cwtsRosterYear").onchange = (event) => {
      selectedYear = event.target.value;
      draw();
    };

    $("#clearCwtsRosterFilters").onclick = () => {
      selectedLevel = "";
      selectedYear = "";
      draw();
    };

    bindRosterExpanders();
  };

  draw();
}


