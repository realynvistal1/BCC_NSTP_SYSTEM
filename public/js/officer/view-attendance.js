let officerSessions = [];
const officerRecordStore = new Map();
let officerAttendanceRows = [];
function attendanceDisplayName(value) {
  return String(value || '').trim().replace(/(^|[\s'\-])\p{L}/gu, letter => letter.toLocaleUpperCase());
}

function attendanceStudentIdentity(student) {
  const last = attendanceDisplayName(student.last_name);
  const first = attendanceDisplayName(student.first_name);
  const initials = `${first.charAt(0)}${last.charAt(0)}` || '?';
  return `<div class="director-student-identity"><span class="director-student-avatar" aria-hidden="true">${esc(initials)}</span><div><strong>${esc(last)}, ${esc(first)}</strong><small>${esc(student.student_id)}</small></div></div>`;
}

function attendanceRecordBadge(status) {
  const states = { present: ['Present', 'success'], late: ['Late', 'warning'], absent: ['Absent', 'danger'], unmarked: ['Not Marked', 'info'] };
  const [label, tone] = states[String(status || '').toLowerCase()] || states.unmarked;
  return `<span class="attendance-status-badge ${tone}">${label}</span>`;
}
let officerAttendanceFilterState = {
  group: 'all',
  company: 'all',
  platoon: 'all',
  search: '',
};

function attFmtDate(value) {
  return value
    ? new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    : '-';
}

function attFmtTime(value) {
  return value
    ? new Date(value).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
    : '-';
}

function attStatusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  const cls = normalized === 'open'
    ? 'success'
    : normalized === 'late'
      ? 'warning'
      : normalized === 'closed'
        ? 'danger'
        : 'info';

  return `<span class="attendance-status-badge ${cls}">${esc(normalized || 'scheduled')}</span>`;
}

function officerUnitLabel(program) {
  return program === 'CWTS' ? 'CS' : 'MI';
}

function sessionStatusLabel(status) {
  const normalized = String(status || 'scheduled').toLowerCase();

  if (normalized === 'open') return 'Open';
  if (normalized === 'late') return 'Late Window';
  if (normalized === 'closed') return 'Closed';

  return 'Scheduled';
}

function statCard(label, value, tone = '') {
  return `
    <div class="attendance-stat-card ${tone}">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
    </div>
  `;
}

function officerStudentGroup(student) {
  if (student.special_unit) {
    return 'special-platoon';
  }

  const battalion = Number(student.battalion || 0);

  if (battalion === 1) return 'battalion-1';
  if (battalion === 2) return 'battalion-2';

  return 'all';
}

function officerStudentCompany(student) {
  return String(student.company || student.rotc_company || '').trim() || 'all';
}

function officerStudentPlatoon(student) {
  if (student.special_unit) {
    return String(student.special_unit).trim() || 'all';
  }

  return String(student.rotc_platoon || '').trim() || 'all';
}

function companyOptionsForGroup(group, students) {
  if (group === 'battalion-1') {
    return ['Alpha', 'Bravo', 'Charlie', 'Delta'];
  }

  if (group === 'battalion-2') {
    return ['Echo', 'Foxtrot', 'Golf', 'Hotel'];
  }

  return [...new Set(
    students
      .map((student) => officerStudentCompany(student))
      .filter((value) => value && value !== 'all')
  )].sort((a, b) => a.localeCompare(b));
}

function sessionCountLabel(count) {
  return `${count} session${count === 1 ? '' : 's'} shown`;
}

function summarizeStudents(rows) {
  return rows.reduce((out, student) => {
    const key = student.attendance_status || 'unmarked';
    out.total += 1;
    out[key] = (out[key] || 0) + 1;
    return out;
  }, {
    total: 0,
    present: 0,
    late: 0,
    absent: 0,
    unmarked: 0,
  });
}

function buildCycles(sessions) {
  const seen = new Map();

  sessions.forEach((session) => {
    const key = `${session.school_year || 'Unknown'}__${session.ms_level || 'all'}`;

    if (!seen.has(key)) {
      seen.set(key, {
        key,
        school_year: session.school_year || 'Unknown',
        ms_level: session.ms_level || '',
      });
    }
  });

  return [...seen.values()].sort(
    (a, b) => b.school_year.localeCompare(a.school_year)
      || String(a.ms_level).localeCompare(String(b.ms_level))
  );
}

function sessionTrackMatch(session, program) {
  if (program === 'ADVANCE_COURSE') {
    return session.program === 'ROTC' && Number(session.is_advance_course || 0) === 1;
  }

  if (program === 'ROTC') {
    return session.program === 'ROTC' && Number(session.is_advance_course || 0) !== 1;
  }

  return session.program === 'CWTS';
}

function populateOfficerFilters() {
  const program = $('#viewProgram').value;
  const sessions = officerSessions.filter((session) => sessionTrackMatch(session, program));
  const cycles = buildCycles(sessions);
  const cycle = $('#viewCycle');
  const previousCycle = cycle.value;

  cycle.innerHTML = '<option value="">All cycles</option>'
    + cycles.map((item) => `
      <option value="${esc(item.key)}">
        ${program === 'CWTS' ? 'CWTS' : 'MS'} ${esc(item.ms_level || '-')} - SY ${esc(item.school_year)}
      </option>
    `).join('');

  if ([...cycle.options].some((option) => option.value === previousCycle)) {
    cycle.value = previousCycle;
  }

  const mi = $('#viewMI');
  const numbers = [...new Set(
    sessions.map((session) => Number(session.mi_number)).filter(Boolean)
  )].sort((a, b) => a - b);
  const previousMi = mi.value;

  mi.innerHTML = '<option value="">All</option>'
    + numbers.map((number) => `
      <option value="${number}">${program === 'CWTS' ? 'CS' : 'MI'} ${number}</option>
    `).join('');

  if ([...mi.options].some((option) => option.value === previousMi)) {
    mi.value = previousMi;
  }

  renderOfficerSessions();
}

function filteredOfficerSessions() {
  const program = $('#viewProgram').value;
  const cycle = $('#viewCycle').value;
  const mi = $('#viewMI').value;
  const type = $('#viewType').value;

  return officerSessions.filter((session) => {
    if (!sessionTrackMatch(session, program)) {
      return false;
    }

    if (cycle && `${session.school_year || 'Unknown'}__${session.ms_level || 'all'}` !== cycle) {
      return false;
    }

    if (mi && String(session.mi_number) !== mi) {
      return false;
    }

    if (type && session.mi_type !== type) {
      return false;
    }

    return true;
  });
}

function renderOfficerAttendanceTable(container, sessions, program) {
  const showRosterFilter = program === 'ROTC';
  const showCompanyFilter = program === 'ROTC' || program === 'CWTS';
  const showPlatoonFilter = program === 'ROTC';
  const rosterStudents = officerAttendanceRows;
  const state = {
    group: officerAttendanceFilterState.group || 'all',
    company: officerAttendanceFilterState.company || 'all',
    platoon: officerAttendanceFilterState.platoon || 'all',
    search: officerAttendanceFilterState.search || '',
  };

  function groupRows(group = state.group) {
    return rosterStudents.filter((student) => (
      group === 'all' || officerStudentGroup(student) === group
    ));
  }

  function companyOptions(group = state.group) {
    const rows = groupRows(group);
    if (program === 'CWTS') {
      return [...new Set(
        rows.map((student) => officerStudentCompany(student)).filter((value) => value && value !== 'all')
      )].sort((a, b) => a.localeCompare(b));
    }
    return companyOptionsForGroup(group, rows);
  }

  function platoonOptions(group = state.group, company = state.company) {
    return [...new Set(
      groupRows(group)
        .filter((student) => company === 'all' || officerStudentCompany(student) === company)
        .map((student) => officerStudentPlatoon(student))
        .filter((value) => value && value !== 'all')
    )].sort((a, b) => {
      const aNum = Number(a);
      const bNum = Number(b);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return aNum - bNum;
      }
      return a.localeCompare(b);
    });
  }

  function visibleStudents() {
    const query = state.search.toLowerCase();
    return rosterStudents.filter((student) => {
      const groupOk = !showRosterFilter || state.group === 'all' || officerStudentGroup(student) === state.group;
      const companyOk = !showCompanyFilter || state.company === 'all' || officerStudentCompany(student) === state.company;
      const platoonOk = !showPlatoonFilter || state.platoon === 'all' || officerStudentPlatoon(student) === state.platoon;
      const text = `${student.last_name || ''} ${student.first_name || ''} ${student.student_id || ''} ${officerAssignment(student) || ''} ${student.session_school_year || ''} ${student.session_ms_level || ''} ${student.mi_number || ''} ${student.mi_type || ''}`.toLowerCase();
      return groupOk && companyOk && platoonOk && (!query || text.includes(query));
    }).sort((left, right) => {
      const byName = `${left.last_name || ''}`.localeCompare(`${right.last_name || ''}`)
        || `${left.first_name || ''}`.localeCompare(`${right.first_name || ''}`);
      if (byName) return byName;
      return `${left.student_id || ''}`.localeCompare(`${right.student_id || ''}`);
    });
  }

  function syncStateWithOptions() {
    const validCompanies = companyOptions(state.group);
    if (state.company !== 'all' && !validCompanies.includes(state.company)) {
      state.company = 'all';
    }

    const validPlatoons = platoonOptions(state.group, state.company);
    if (state.platoon !== 'all' && !validPlatoons.includes(state.platoon)) {
      state.platoon = 'all';
    }
  }

  function renderFilterOptions() {
    const companySelect = $('#officerInlineCompany');
    const platoonSelect = $('#officerInlinePlatoon');
    const companies = companyOptions(state.group);
    const platoons = platoonOptions(state.group, state.company);

    if (companySelect) {
      companySelect.innerHTML = '<option value="all">All</option>'
        + companies.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
      companySelect.value = state.company;
      companySelect.disabled = companies.length === 0;
    }

    if (platoonSelect) {
      platoonSelect.innerHTML = '<option value="all">All</option>'
        + platoons.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
      platoonSelect.value = state.platoon;
      platoonSelect.disabled = platoons.length === 0;
    }
  }

  function draw() {
    syncStateWithOptions();
    renderFilterOptions();

    officerAttendanceFilterState = { ...state };
    const filteredStudents = visibleStudents();
    const counts = summarizeStudents(filteredStudents);

    $('#officerInlineStats').innerHTML = `
      ${statCard('Sessions', sessions.length)}
      ${statCard('Students', counts.total)}
      ${statCard('Present', counts.present, 'present')}
      ${statCard('Late', counts.late, 'late')}
      ${statCard('Absent', counts.absent, 'absent')}
      ${statCard('Not Marked', counts.unmarked, 'unmarked')}
    `;

    $('#officerInlineTable').innerHTML = filteredStudents.length
      ? table(
        ['Student', 'Program', 'School Year', 'Level', 'Session', 'Assignment', 'Recorded At', 'Status', 'Action'],
        filteredStudents.map((student) => `
          <tr>
            <td>${attendanceStudentIdentity(student)}</td>
            <td><span class="director-program-chip ${student.session_program === 'CWTS' ? 'cwts' : 'rotc'}">${esc(student.session_program || '-')}</span></td>
            <td>${esc(student.session_school_year || '-')}</td>
            <td>${student.session_program === 'CWTS' ? `CWTS ${esc(student.session_ms_level || '-')}` : `MS ${esc(student.session_ms_level || '-')}`}</td>
            <td>${esc(`${student.session_program === 'CWTS' ? 'CS' : 'MI'} ${student.mi_number || '-'} ${(student.mi_type || '').toUpperCase()}`)}</td>
            <td>${esc(officerAssignment(student))}</td>
            <td>${student.attendance_time ? attFmtTime(student.attendance_time) : '-'}</td>
            <td>${attendanceRecordBadge(student.attendance_status)}</td>
            <td><button class="btn small primary officer-inline-status" data-session="${student.session_id}" data-student="${student.id}" type="button">Update Status</button></td>
          </tr>
        `)
      )
      : '<div class="attendance-empty"><div class="empty-icon">O</div>No students matched the selected filters.</div>';

    $$('.officer-inline-status', container).forEach((button) => {
      button.onclick = () => window.__officerPromptStatus(Number(button.dataset.session), Number(button.dataset.student));
    });
  }

  container.innerHTML = `
    <div class="attendance-session-summary">
      <strong>${sessionCountLabel(sessions.length)}</strong>
      <span>${esc(program === 'ADVANCE_COURSE' ? 'Advance Course' : program)} attendance results</span>
    </div>
    <section class="attendance-summary-card officer-session-table-card">
      <div class="director-attendance-heading"><div><span>STUDENT ATTENDANCE</span><h2>Attendance Overview</h2><p>Review attendance and update student records for the selected sessions.</p></div></div>
      <div class="attendance-record-overview">
        <div class="attendance-record-stats" id="officerInlineStats"></div>
        <div class="attendance-record-tools">
          ${showRosterFilter
            ? `<label class="attendance-record-filter"><span>Roster Filter</span><select id="officerInlineGroup"><option value="all">All</option><option value="battalion-1">Battalion 1</option><option value="battalion-2">Battalion 2</option><option value="special-platoon">Special Platoon</option></select></label>`
            : ''}
          ${showCompanyFilter
            ? `<label class="attendance-record-filter"><span>Company</span><select id="officerInlineCompany"><option value="all">All</option></select></label>`
            : ''}
          ${showPlatoonFilter
            ? `<label class="attendance-record-filter"><span>Platoon</span><select id="officerInlinePlatoon"><option value="all">All</option></select></label>`
            : ''}
          <div class="attendance-record-search">
            <input id="officerInlineSearch" type="search" placeholder="Search name or student ID...">
          </div>
        </div>
      </div>
      <div class="attendance-record-table-wrap" id="officerInlineTable"></div>
    </section>
  `;

  if ($('#officerInlineGroup')) {
    $('#officerInlineGroup').value = state.group;
  }
  if ($('#officerInlineSearch')) {
    $('#officerInlineSearch').value = state.search;
  }
  draw();

  $('#officerInlineGroup')?.addEventListener('change', () => {
    state.group = $('#officerInlineGroup').value || 'all';
    state.company = 'all';
    state.platoon = 'all';
    draw();
  });
  $('#officerInlineCompany')?.addEventListener('change', () => {
    state.company = $('#officerInlineCompany').value || 'all';
    state.platoon = 'all';
    draw();
  });
  $('#officerInlinePlatoon')?.addEventListener('change', () => {
    state.platoon = $('#officerInlinePlatoon').value || 'all';
    draw();
  });
  $('#officerInlineSearch')?.addEventListener('input', () => {
    state.search = $('#officerInlineSearch').value || '';
    draw();
  });
}

async function renderOfficerSessions() {
  const list = $('#officerSessionList');
  const sessions = filteredOfficerSessions();
  const program = $('#viewProgram').value;

  if (!sessions.length) {
    officerAttendanceRows = [];
    list.innerHTML = `
      <div class="attendance-empty attendance-empty-polished">
        <div class="attendance-empty-icon">O</div>
        <h3>No attendance sessions found</h3>
        <p>Try another filter or create a new attendance session first.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = '<div class="page-loading"><span class="page-spinner"></span><strong>Loading attendance records...</strong></div>';

  const responses = await Promise.all(
    sessions.map(async (session) => {
      const data = await API.get(`/api/officer/attendance/sessions/${session.id}/records`);
      officerRecordStore.set(Number(session.id), data.students || []);
      return { session, students: data.students || [] };
    })
  );

  officerAttendanceRows = responses.flatMap(({ session, students }) => students.map((student) => ({
    ...student,
    session_id: session.id,
    session_program: session.program,
    session_school_year: session.school_year,
    session_ms_level: session.ms_level,
    mi_number: session.mi_number,
    mi_type: session.mi_type,
  })));

  renderOfficerAttendanceTable(list, sessions, program);
}

function officerAssignment(student) {
  return student.special_unit
    || student.company
    || ([
      student.battalion ? `B${student.battalion}` : '',
      student.rotc_company,
      student.rotc_platoon ? `P${student.rotc_platoon}` : '',
    ].filter(Boolean).join(' - '))
    || '-';
}

async function saveOfficerStatus(sessionId, student, selected) {
  const payload = {
    student_id: Number(student.id),
    status: selected,
  };
  const out = await API.post(
    `/api/officer/attendance/sessions/${sessionId}/records`,
    payload
  );
  toast(out.message);
  await renderOfficerSessions();
}

async function promptOfficerStatus(sessionId, student) {
  const current = student.attendance_status === 'unmarked'
    ? ''
    : String(student.attendance_status || '').toLowerCase();
  const input = window.prompt(
    `Update attendance for ${attendanceDisplayName(student.last_name)}, ${attendanceDisplayName(student.first_name)}.\nType present, late, or absent:`,
    current
  );

  if (input === null) {
    return;
  }

  const selected = String(input || '').trim().toLowerCase();

  if (!['present', 'late', 'absent'].includes(selected)) {
    toast('Type present, late, or absent.', true);
    return;
  }

  if (selected === current) {
    toast('Choose a different attendance status.', true);
    return;
  }

  try {
    await saveOfficerStatus(sessionId, student, selected);
  } catch (error) {
    toast(error.message, true);
  }
}

window.__officerPromptStatus = async (sessionId, studentId) => {
  const students = officerRecordStore.get(Number(sessionId)) || [];
  const student = students.find((item) => Number(item.id) === Number(studentId));

  if (!student) {
    toast('Unable to find the selected student record.', true);
    return;
  }

  openStatusModal(sessionId, student);
};

async function openStatusModal(sessionId, student) {
  const current = student.attendance_status === 'unmarked'
    ? ''
    : student.attendance_status;
  const modal = document.createElement('div');

  modal.className = 'app-dialog';
  modal.innerHTML = `
    <div class="app-dialog-backdrop"></div>
    <div class="app-dialog-card attendance-update-modal">
      <div class="record-modal-head">
        <div>
          <span>Update Attendance</span>
          <h2>${esc(attendanceDisplayName(student.last_name))}, ${esc(attendanceDisplayName(student.first_name))}</h2>
          <p>${esc(student.student_id)} - ${esc(student.course || '-')}</p>
        </div>
        <button class="modal-close" id="statusModalClose">x</button>
      </div>
      <div class="record-modal-scroll">
        <section class="record-section">
          <h3>Select New Status</h3>
          <div class="attendance-status-choice">
            <button data-status="present" class="${current === 'present' ? 'selected present' : ''}">Present</button>
            <button data-status="late" class="${current === 'late' ? 'selected late' : ''}">Late</button>
            <button data-status="absent" class="${current === 'absent' ? 'selected absent' : ''}">Absent</button>
          </div>
          <div id="offenseChangeNotice"></div>
        </section>
      </div>
      <div class="app-dialog-actions">
        <button class="btn" id="statusCancel">Cancel</button>
        <button class="btn primary" id="statusSave" disabled>Update Status</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  let selected = current;
  const close = () => modal.remove();

  $('#statusModalClose', modal).onclick = close;
  $('#statusCancel', modal).onclick = close;
  $('.app-dialog-backdrop', modal).onclick = close;

  $$('[data-status]', modal).forEach((button) => {
    button.onclick = () => {
      selected = button.dataset.status;
      $$('[data-status]', modal).forEach((item) => {
        item.className = '';
      });
      button.classList.add('selected', selected);
      $('#statusSave', modal).disabled = !selected || selected === current;

      const offense = current !== 'absent' && selected === 'absent';
      $('#offenseChangeNotice', modal).innerHTML = offense
        ? '<div class="warning-banner reject-note"><div><strong>Attendance Offense</strong><span>Changing this student to Absent will record an attendance offense. First occurrence = warning; second occurrence = settlement required.</span></div></div>'
        : '';
    };
  });

  $('#statusSave', modal).onclick = async () => {
    try {
      await saveOfficerStatus(sessionId, student, selected);
      close();
    } catch (error) {
      toast(error.message, true);
    }
  };
}

async function openOfficerRecords(id) {
  const modal = $('#attendanceRecordsModal');
  const body = $('#recordsModalBody');

  modal.classList.remove('hidden');
  body.innerHTML = '<div class="page-loading"><span class="page-spinner"></span><strong>Loading attendance records...</strong></div>';

  try {
    const data = await API.get(`/api/officer/attendance/sessions/${id}/records`);
    const session = data.session;
    officerRecordStore.set(Number(id), data.students || []);

    $('#recordsModalTitle').textContent = `${session.program === 'CWTS' ? 'CS' : 'MI'} ${session.mi_number} ${(session.mi_type || '').toUpperCase()} - ${session.program}`;
    $('#recordsModalSubtitle').textContent = `${attFmtDate(session.open_date)} - ${attFmtTime(session.open_date)} - ${attFmtTime(session.close_date)} - 100m radius`;

    const rows = data.students.map((student) => `
      <tr data-group="${officerStudentGroup(student)}" data-company="${esc(officerStudentCompany(student))}" data-platoon="${esc(officerStudentPlatoon(student))}">
        <td>${attendanceStudentIdentity(student)}</td>
        <td>${esc(officerAssignment(student))}</td>
        <td>${student.attendance_time ? attFmtTime(student.attendance_time) : '-'}</td>
        <td>${attendanceRecordBadge(student.attendance_status)}</td>
        <td><button class="btn small primary officer-update-status" type="button" onclick="window.__officerPromptStatus(${Number(id)}, ${Number(student.id)})">Update Status</button></td>
      </tr>
    `);

    const showRosterFilter = session.program === 'ROTC'
      && Number(session.is_advance_course || 0) !== 1;

    body.innerHTML = `
      <div class="attendance-record-overview">
        <div class="attendance-record-stats" id="officerRecordStats">
          ${statCard('Total', data.total)}
          ${statCard('Present', data.counts.present, 'present')}
          ${statCard('Late', data.counts.late, 'late')}
          ${statCard('Absent', data.counts.absent, 'absent')}
          ${statCard('Not Yet', data.counts.unmarked, 'unmarked')}
        </div>
        <div class="attendance-record-tools">
          ${showRosterFilter
            ? `<label class="attendance-record-filter"><span>Roster Filter</span><select id="officerRecordGroup"><option value="all">All</option><option value="battalion-1">Battalion 1</option><option value="battalion-2">Battalion 2</option><option value="special-platoon">Special Platoon</option></select></label>`
            : ''}
          <label class="attendance-record-filter"><span>Company</span><select id="officerRecordCompany"><option value="all">All</option></select></label>
          <label class="attendance-record-filter"><span>Platoon</span><select id="officerRecordPlatoon"><option value="all">All</option></select></label>
          <div class="attendance-record-search">
            <input id="officerRecordSearch" type="search" placeholder="Search name or student ID...">
          </div>
        </div>
      </div>
      <div class="attendance-record-table-wrap">
        ${table(['Student', 'Assignment', 'Time', 'Status', 'Action'], rows)}
      </div>
    `;
    const companySelect = $('#officerRecordCompany');
    const platoonSelect = $('#officerRecordPlatoon');

    const filteredByGroup = (group) => data.students.filter((student) => {
      return group === 'all' || officerStudentGroup(student) === group;
    });

    const syncDependentFilters = () => {
      const group = $('#officerRecordGroup')?.value || 'all';
      const previousCompany = companySelect?.value || 'all';
      const previousPlatoon = platoonSelect?.value || 'all';
      const groupStudents = filteredByGroup(group);
      const companyOptions = companyOptionsForGroup(group, groupStudents);

      if (companySelect) {
        companySelect.innerHTML = '<option value="all">All</option>'
          + companyOptions.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');

        companySelect.value = companyOptions.includes(previousCompany) ? previousCompany : 'all';
      }

      const company = companySelect?.value || 'all';
      const platoonOptions = [...new Set(
        groupStudents
          .filter((student) => company === 'all' || officerStudentCompany(student) === company)
          .map((student) => officerStudentPlatoon(student))
          .filter((value) => value && value !== 'all')
      )].sort((a, b) => {
        const aNum = Number(a);
        const bNum = Number(b);
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
          return aNum - bNum;
        }
        return a.localeCompare(b);
      });

      if (platoonSelect) {
        platoonSelect.innerHTML = '<option value="all">All</option>'
          + platoonOptions.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');

        platoonSelect.value = platoonOptions.includes(previousPlatoon) ? previousPlatoon : 'all';
      }
    };

    const applyRecordFilters = () => {
      const query = ($('#officerRecordSearch')?.value || '').toLowerCase();
      const group = $('#officerRecordGroup')?.value || 'all';
      const company = $('#officerRecordCompany')?.value || 'all';
      const platoon = $('#officerRecordPlatoon')?.value || 'all';

      const filteredStudents = data.students.filter((student) => {
        const groupOk = group === 'all' || officerStudentGroup(student) === group;
        const companyOk = company === 'all' || officerStudentCompany(student) === company;
        const platoonOk = platoon === 'all' || officerStudentPlatoon(student) === platoon;
        const text = `${student.last_name || ''} ${student.first_name || ''} ${student.student_id || ''} ${officerAssignment(student) || ''}`.toLowerCase();
        return groupOk && companyOk && platoonOk && text.includes(query);
      });

      $$('tbody tr', body).forEach((row) => {
        const textOk = row.textContent.toLowerCase().includes(query);
        const groupOk = group === 'all' || row.dataset.group === group;
        const companyOk = company === 'all' || row.dataset.company === company;
        const platoonOk = platoon === 'all' || row.dataset.platoon === platoon;
        row.style.display = textOk && groupOk && companyOk && platoonOk ? '' : 'none';
      });

      const counts = summarizeStudents(filteredStudents);
      $('#officerRecordStats').innerHTML = `
        ${statCard('Total', counts.total)}
        ${statCard('Present', counts.present, 'present')}
        ${statCard('Late', counts.late, 'late')}
        ${statCard('Absent', counts.absent, 'absent')}
        ${statCard('Not Yet', counts.unmarked, 'unmarked')}
      `;
    };

    $('#officerRecordSearch').oninput = applyRecordFilters;
    $('#officerRecordGroup')?.addEventListener('change', () => {
      syncDependentFilters();
      applyRecordFilters();
    });
    $('#officerRecordCompany')?.addEventListener('change', () => {
      syncDependentFilters();
      applyRecordFilters();
    });
    $('#officerRecordPlatoon')?.addEventListener('change', applyRecordFilters);
    syncDependentFilters();
    applyRecordFilters();
  } catch (error) {
    body.innerHTML = `<div class="page-load-error"><h3>Unable to load records</h3><p>${esc(error.message)}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const auth = await guard('officer');
    if (!auth) {
      return;
    }

    shell(
      'officer',
      'View Attendance',
      'Monitor ROTC, CWTS, and Advance Course attendance sessions.',
      auth
    );

    officerSessions = await API.get('/api/officer/attendance/sessions');

    const queryProgram = new URLSearchParams(location.search).get('program');
    if (queryProgram) {
      const map = {
        rotc: 'ROTC',
        cwts: 'CWTS',
        'advance-course': 'ADVANCE_COURSE',
      };

      if (map[queryProgram]) {
        $('#viewProgram').value = map[queryProgram];
      }
    }

    populateOfficerFilters();

    ['viewProgram', 'viewCycle', 'viewMI', 'viewType'].forEach((id) => {
      $(`#${id}`).addEventListener(
        'change',
        id === 'viewProgram' ? populateOfficerFilters : renderOfficerSessions
      );
    });

    const closeAttendanceRecords = $('#closeAttendanceRecords');
    closeAttendanceRecords.textContent = 'x';
    closeAttendanceRecords.style.cssText = [
      'width:44px',
      'height:44px',
      'min-width:44px',
      'min-height:44px',
      'border-radius:12px',
      'font-size:24px',
      'font-weight:900',
      'line-height:1',
      'background:#fff',
      'color:#1e293b',
      'box-shadow:0 8px 18px rgba(15,23,42,.10)',
      'display:inline-flex',
      'align-items:center',
      'justify-content:center'
    ].join(';');
    closeAttendanceRecords.onclick = () => $('#attendanceRecordsModal').classList.add('hidden');
    $('.app-dialog-backdrop', $('#attendanceRecordsModal')).onclick = () => {
      $('#attendanceRecordsModal').classList.add('hidden');
    };
  } catch (error) {
    showPageError(error);
  }
});
