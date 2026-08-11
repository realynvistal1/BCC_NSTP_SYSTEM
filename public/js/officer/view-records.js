function officerRecordAssignment(row, program) {
  if (program === 'CWTS') {
    return row.company || '-';
  }

  if (Number(row.willing_to_take_advance_course)) {
    return 'Advance Course';
  }

  if (row.special_unit) {
    return row.special_unit;
  }

  return [
    row.battalion ? `Battalion ${row.battalion}` : '',
    row.rotc_company,
    row.rotc_platoon ? `Platoon ${row.rotc_platoon}` : '',
  ].filter(Boolean).join(' - ') || '-';
}

function officerRecordDate(value) {
  if (!value) return '-';

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? esc(value)
    : date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
}

function officerInfoItem(label, value) {
  return `
    <div class="record-info-item">
      <small>${esc(label)}</small>
      <strong>${esc(value ?? '-') || '-'}</strong>
    </div>
  `;
}

async function renderOfficerRecords(content) {
  const rows = await API.get('/api/officer/records');
  const years = [...new Set(rows.map((row) => row.school_year).filter(Boolean))]
    .sort()
    .reverse();

  content.innerHTML = `
    <section class="records-tools">
      <select id="recordProgram">
        <option value="ROTC">ROTC</option>
        <option value="CWTS">CWTS</option>
      </select>
      <div class="record-search">
        <span>${icon('records')}</span>
        <input id="recordSearch" placeholder="Search by name, student ID, or course...">
      </div>
      <select id="recordLevel">
        <option value="">All Levels</option>
        <option value="1">Level 1</option>
        <option value="2">Level 2</option>
      </select>
      <select id="recordSY">
        <option value="">All SY</option>
        ${years.map((year) => `<option value="${esc(year)}">SY ${esc(year)}</option>`).join('')}
      </select>
    </section>
    <section class="panel record-list-panel">
      <div class="table-wrap">
        <table class="data-table">
          <thead id="recordHead"></thead>
          <tbody id="recordRows"></tbody>
        </table>
      </div>
      <div class="table-footer" id="recordFooter"></div>
    </section>
    <div class="app-dialog hidden" id="recordModal">
      <div class="app-dialog-backdrop"></div>
      <div class="app-dialog-card record-modal-card">
        <div id="recordModalBody"></div>
      </div>
    </div>
  `;

  function currentProgram() {
    return $('#recordProgram').value;
  }

  function prefix(program) {
    return program === 'CWTS' ? 'CWTS' : 'MS';
  }

  function filtered() {
    const program = currentProgram();
    const query = $('#recordSearch').value.trim().toLowerCase();
    const level = $('#recordLevel').value;
    const schoolYear = $('#recordSY').value;

    return rows.filter((row) => (
      row.program === program
      && (!level || String(row.ms_level) === level)
      && (!schoolYear || row.school_year === schoolYear)
      && (
        !query
        || `${row.first_name} ${row.middle_name || ''} ${row.last_name} ${row.student_id} ${row.course}`
          .toLowerCase()
          .includes(query)
      )
    ));
  }

  function draw() {
    const program = currentProgram();
    const pfx = prefix(program);
    const data = filtered();

    $('#recordHead').innerHTML = `
      <tr>
        <th>#</th>
        <th>Student ID</th>
        <th>Name</th>
        <th>Course</th>
        <th>${pfx} Level</th>
        <th>SY</th>
        ${program === 'ROTC' ? '<th>Battalion / Group</th>' : ''}
        <th>Action</th>
      </tr>
    `;

    $('#recordRows').innerHTML = data.length
      ? data.map((row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${esc(row.student_id)}</strong></td>
          <td>${esc(row.last_name)}, ${esc(row.first_name)}${row.suffix ? ` ${esc(row.suffix)}` : ''}</td>
          <td>${esc(row.course)}</td>
          <td><span class="level-pill">${pfx} ${esc(row.ms_level)}</span></td>
          <td>${row.school_year ? `SY ${esc(row.school_year)}` : '-'}</td>
          ${program === 'ROTC'
            ? `<td>${esc(Number(row.willing_to_take_advance_course) ? 'Advance Course' : row.special_unit ? 'Special Platoon' : row.battalion ? `Battalion ${row.battalion}` : '-')}</td>`
            : ''}
          <td><button class="btn small primary" data-detail="${row.student_db_id}" data-level="${row.ms_level}" data-program="${program}">View Details</button></td>
        </tr>
      `).join('')
      : `<tr><td colspan="${program === 'ROTC' ? 8 : 7}"><div class="empty">No students found.</div></td></tr>`;

    $('#recordFooter').textContent = `Showing ${data.length} of ${rows.filter((row) => row.program === program).length} record(s)`;

    $$('[data-detail]').forEach((button) => {
      button.onclick = () => openRecord(
        Number(button.dataset.detail),
        button.dataset.level,
        button.dataset.program
      );
    });
  }

  async function openRecord(id, level, program) {
    const modal = $('#recordModal');
    const body = $('#recordModalBody');
    const pfx = prefix(program);

    modal.classList.remove('hidden');
    body.innerHTML = `
      <div class="page-loading">
        <div class="page-spinner"></div>
        <span>Loading complete student record...</span>
      </div>
    `;

    try {
      const data = await API.get(
        `/api/officer/records/${id}?program=${encodeURIComponent(program)}&ms_level=${encodeURIComponent(level)}`
      );
      const student = data.student;
      const cycle = data.cycle;
      const attendance = data.attendance || [];
      const grade = (data.grades || []).find((item) => String(item.ms_level) === String(level));
      const present = attendance.filter((item) => item.status === 'present').length;
      const late = attendance.filter((item) => item.status === 'late').length;
      const absent = attendance.filter((item) => item.status === 'absent').length;

      body.innerHTML = `
        <div class="record-modal-head">
          <div>
            <span>Student Record - ${pfx} ${esc(level)}</span>
            <h2>${esc(student.first_name)} ${esc(student.last_name)}${student.suffix ? ` ${esc(student.suffix)}` : ''}</h2>
            <p>${cycle.school_year ? `SY ${esc(cycle.school_year)} - ` : ''}${esc(student.student_id)}</p>
          </div>
          <button class="modal-close" id="recordClose">x</button>
        </div>
        <div class="record-modal-scroll">
          <section class="record-section">
            <h3>Personal Information</h3>
            <div class="record-info-grid">
              ${officerInfoItem('Student ID', student.student_id)}
              ${officerInfoItem('Name', `${student.last_name}, ${student.first_name} ${student.middle_name || ''}${student.suffix ? ` ${student.suffix}` : ''}`)}
              ${officerInfoItem('Course', student.course)}
              ${officerInfoItem('Year Level', student.year_level)}
              ${officerInfoItem('Sex', student.sex)}
              ${officerInfoItem('Birthdate', student.birthdate)}
              ${officerInfoItem('Email', student.email)}
              ${officerInfoItem('Contact Number', student.contact_number)}
              ${officerInfoItem('Permanent Address', [student.permanent_barangay, student.permanent_municipality, student.permanent_province].filter(Boolean).join(', '))}
              ${officerInfoItem('Medical Condition', student.has_medical_condition ? `${student.medical_condition || 'Yes'}` : 'None')}
            </div>
          </section>
          <section class="record-section">
            <h3>Enrollment & Assignment</h3>
            <div class="record-info-grid">
              ${officerInfoItem('Program', program)}
              ${officerInfoItem(`${pfx} Level`, `${pfx} ${level}`)}
              ${officerInfoItem('School Year', cycle.school_year ? `SY ${cycle.school_year}` : '-')}
              ${officerInfoItem('Enrollment Status', cycle.status)}
              ${program === 'ROTC'
                ? `${officerInfoItem('Battalion', student.battalion ? `Battalion ${student.battalion}` : '-')}${officerInfoItem('Company', student.rotc_company || '-')}${officerInfoItem('Platoon', student.rotc_platoon ? `Platoon ${student.rotc_platoon}` : '-')}${officerInfoItem('Special Unit', student.special_unit || '-')}${officerInfoItem('Advance Course', student.willing_to_take_advance_course ? 'Yes' : 'No')}`
                : officerInfoItem('CWTS Company', student.company || '-') }
            </div>
          </section>
          <section class="record-section">
            <h3>Grades</h3>
            <div class="record-grade-row">
              ${officerInfoItem('Midterm', grade?.midterm ?? '-')}
              ${officerInfoItem('Final', grade?.final_term ?? '-')}
              ${officerInfoItem('Average', grade?.grade ?? '-')}
              ${officerInfoItem('Status', grade?.status ?? '-')}
            </div>
          </section>
          <section class="record-section">
            <h3>Attendance</h3>
            <div class="record-attendance-stats">
              <div class="present"><strong>${present}</strong><span>Present</span></div>
              <div class="late"><strong>${late}</strong><span>Late</span></div>
              <div class="absent"><strong>${absent}</strong><span>Absent</span></div>
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>MI</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  ${attendance.length
                    ? attendance.map((item) => `
                      <tr>
                        <td>${esc(item.mi_number ?? '-')}</td>
                        <td>${esc((item.mi_type || '-').toUpperCase())}</td>
                        <td>${badge(item.status)}</td>
                        <td>${officerRecordDate(item.created_at)}</td>
                      </tr>
                    `).join('')
                    : '<tr><td colspan="4"><div class="empty">No attendance records found.</div></td></tr>'}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      `;

      $('#recordClose').onclick = () => modal.classList.add('hidden');
      $('.app-dialog-backdrop', modal).onclick = () => modal.classList.add('hidden');
    } catch (error) {
      body.innerHTML = `<div class="page-load-error"><h3>Unable to load record</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  $('#recordProgram').addEventListener('change', draw);
  $('#recordSearch').oninput = draw;
  $('#recordLevel').onchange = draw;
  $('#recordSY').onchange = draw;
  draw();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const auth = await guard('officer');
    if (!auth) return;

    shell('officer', 'View Student Records', 'View ROTC and CWTS student records.', auth);
    await renderOfficerRecords($('#content'));
  } catch (error) {
    showPageError(error);
  }
});
