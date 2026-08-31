function recordAssignment(row, program) {
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

function formatRecordDate(value) {
  if (!value) {
    return '-';
  }

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

function infoItem(label, value) {
  return `
    <div class="record-info-item">
      <small>${esc(label)}</small>
      <strong>${esc(value ?? '-') || '-'}</strong>
    </div>
  `;
}

function xmlSafe(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadRecordsExcel(rows, program, level, schoolYear) {
  const prefix = program === 'CWTS' ? 'CWTS' : 'MS';
  const headers = [
    '#',
    'SURNAME',
    'FIRST NAME',
    'MIDDLE NAME',
    'SUFFIX',
    'COURSE',
    'COMPANY',
    'PLATOON',
    'ID NUMBER',
    'BIRTHDATE',
    'SEX',
    'ADDRESS',
    `${prefix} LEVEL`,
    'MIDTERM',
    'FINAL',
    'AVERAGE',
  ];
  const lastColumnIndex = headers.length - 1;
  const data = rows.map((row, index) => [
    index + 1,
    row.last_name,
    row.first_name,
    row.middle_name || '',
    row.suffix || 'N/A',
    row.course,
    program === 'ROTC'
      ? (Number(row.willing_to_take_advance_course)
        ? 'Advance Course'
        : row.special_unit || row.rotc_company || '-')
      : row.company || '-',
    program === 'ROTC' ? (row.rotc_platoon || '-') : '-',
    row.student_id,
    row.birthdate || '-',
    row.sex || '-',
    [row.permanent_barangay, row.permanent_municipality, row.permanent_province]
      .filter(Boolean)
      .join(', ') || '-',
    `${prefix} ${row.ms_level}`,
    row.midterm ?? '-',
    row.final_term ?? '-',
    row.grade ?? '-',
  ]);
  const makeCell = (value, options = {}) => {
    const {
      style = 'Cell',
      type = 'String',
      mergeAcross = 0,
    } = options;
    const mergeAttr = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : '';
    return `<Cell ss:StyleID="${style}"${mergeAttr}><Data ss:Type="${type}">${xmlSafe(value)}</Data></Cell>`;
  };

  const emptyCells = (count) => new Array(Math.max(count, 0)).fill('<Cell/>').join('');
  const centerSpan = 4;
  const rightStart = 12;
  const rightSpan = 3;

  const topRows = [
    `<Row ss:Height="22">${makeCell('Region: VII', { style: 'MetaLabel', mergeAcross: 2 })}${emptyCells(2)}${makeCell('BUENAVISTA COMMUNITY COLLEGE', { style: 'SchoolTitle', mergeAcross: centerSpan })}${emptyCells(rightStart - (4 + 1 + centerSpan))}${makeCell(`School Year: SY ${schoolYear || 'All'}`, { style: 'MetaLabel', mergeAcross: rightSpan })}</Row>`,
    `<Row ss:Height="19">${makeCell(`NSTP Component: ${program}`, { style: 'MetaLabel', mergeAcross: 2 })}${emptyCells(2)}${makeCell('Cangawa, Buenavista, Bohol', { style: 'SchoolSubtitle', mergeAcross: centerSpan })}${emptyCells(rightStart - (4 + 1 + centerSpan))}${makeCell(`${prefix} Level: ${level ? `${prefix} ${level}` : 'All'}`, { style: 'MetaLabel', mergeAcross: rightSpan })}</Row>`,
    '<Row ss:Height="10"></Row>',
    `<Row ss:Height="24">${headers.map((header) => makeCell(header, { style: 'TableHeader' })).join('')}</Row>`,
  ].join('');

  const bodyRows = data.map((row) => `
    <Row ss:Height="21">${row.map((value, index) => {
      const style = index === 0 ? 'CenterCell' : 'Cell';
      return makeCell(value, { style });
    }).join('')}</Row>
  `).join('');

  const columnWidths = [
    34, 92, 92, 92, 54, 86, 86, 64, 92, 78, 58, 150, 74, 62, 62, 66,
  ];
  const columnsXml = columnWidths
    .map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`)
    .join('');

  const stylesXml = `
    <Styles>
      <Style ss:ID="Default" ss:Name="Normal">
        <Alignment ss:Vertical="Center"/>
        <Borders/>
        <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1F2937"/>
        <Interior/>
        <NumberFormat/>
        <Protection/>
      </Style>
      <Style ss:ID="Cell">
        <Alignment ss:Vertical="Center"/>
        <Borders>
          <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/>
          <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/>
          <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/>
          <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/>
        </Borders>
      </Style>
      <Style ss:ID="CenterCell">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Borders>
          <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/>
          <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/>
          <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/>
          <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/>
        </Borders>
      </Style>
      <Style ss:ID="MetaLabel">
        <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#111827"/>
      </Style>
      <Style ss:ID="SchoolTitle">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#111827"/>
      </Style>
      <Style ss:ID="SchoolSubtitle">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#374151"/>
      </Style>
      <Style ss:ID="TableHeader">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Borders>
          <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F766E"/>
          <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F766E"/>
          <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F766E"/>
          <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F766E"/>
        </Borders>
        <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
        <Interior ss:Color="#0F9D7A" ss:Pattern="Solid"/>
      </Style>
    </Styles>
  `;

  const worksheetOptions = `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><Selected/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane><Panes><Pane><Number>3</Number></Pane><Pane><Number>2</Number><ActiveRow>4</ActiveRow></Pane></Panes><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>`;

  const xml = `<?xml version="1.0"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">
    ${stylesXml}
    <Worksheet ss:Name="Records">
      <Table ss:ExpandedColumnCount="${headers.length}" ss:ExpandedRowCount="${data.length + 4}" x:FullColumns="1" x:FullRows="1">
        ${columnsXml}
        ${topRows}
        ${bodyRows}
      </Table>
      ${worksheetOptions}
    </Worksheet>
  </Workbook>`;
  const blob = new Blob(['\ufeff', xml], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = `${program}${level ? `_${prefix}${level}` : ''}${schoolYear ? `_SY${schoolYear}` : ''}_Records.xls`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 5000);
}

async function renderAdminRecords(_program, content) {
  const program = 'CWTS';
  const apiProgram = 'cwts';
  const prefix = 'CWTS';
  const rows = await API.get(`/api/admin/${apiProgram}/records`);
  const schedules = await API.get(`/api/admin/${apiProgram}/enrollment-schedule`);

  function schoolYearsForLevel(level = '') {
    return [...new Set([
      ...rows
        .filter((row) => !level || String(row.ms_level) === String(level))
        .map((row) => String(row.school_year || '').trim())
        .filter(Boolean),
      ...schedules
        .filter((schedule) => !level || String(schedule.ms_level || '') === String(level))
        .map((schedule) => String(schedule.year || '').trim())
        .filter(Boolean),
    ])].sort().reverse();
  }

  content.innerHTML = `
    <section class="records-tools">
      <div class="record-search">
        <span>${icon('records')}</span>
        <input id="recordSearch" placeholder="Search by name, student ID, or course...">
      </div>
      <select id="recordLevel">
        <option value="">All ${prefix} Levels</option>
        <option value="1">${prefix} 1</option>
        <option value="2">${prefix} 2</option>
      </select>
      <select id="recordSY">
        <option value="">All SY</option>
        ${schoolYearsForLevel().map((year) => `<option value="${esc(year)}">SY ${esc(year)}</option>`).join('')}
      </select>
      <button class="btn success" id="downloadRecords">${icon('records')} Download Excel</button>
      <button class="btn primary" id="downloadProfiles">${icon('users')} Download Profile Forms PDF</button>
    </section>
    <section class="panel record-list-panel">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Student ID</th>
              <th>Name</th>
              <th>Course</th>
              <th>${prefix} Level</th>
              <th>SY</th>
              ${program === 'ROTC' ? '<th>Battalion / Group</th>' : ''}
              <th>Action</th>
            </tr>
          </thead>
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

  function filtered() {
    const query = $('#recordSearch').value.trim().toLowerCase();
    const level = $('#recordLevel').value;
    const schoolYear = $('#recordSY').value;

    return rows.filter((row) => (
      (!level || String(row.ms_level) === level)
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
    const level = $('#recordLevel').value;
    const currentYear = $('#recordSY').value;
    const years = schoolYearsForLevel(level);
    $('#recordSY').innerHTML = `<option value="">All SY</option>${years.map((year) => `<option value="${esc(year)}"${currentYear === year ? ' selected' : ''}>SY ${esc(year)}</option>`).join('')}`;
    if (currentYear && !years.includes(currentYear)) {
      $('#recordSY').value = '';
    }

    const data = filtered();

    $('#recordRows').innerHTML = data.length
      ? data.map((row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${esc(row.student_id)}</strong></td>
          <td>${esc(row.last_name)}, ${esc(row.first_name)}${row.suffix ? ` ${esc(row.suffix)}` : ''}</td>
          <td>${esc(row.course)}</td>
          <td><span class="level-pill">${prefix} ${esc(row.ms_level)}</span></td>
          <td>${row.school_year ? `SY ${esc(row.school_year)}` : '-'}</td>
          ${program === 'ROTC'
            ? `<td>${esc(Number(row.willing_to_take_advance_course) ? 'Advance Course' : row.special_unit ? 'Special Platoon' : row.battalion ? `Battalion ${row.battalion}` : '-')}</td>`
            : ''}
          <td><button class="btn small primary" data-detail="${row.student_db_id}" data-level="${row.ms_level}">View Details</button></td>
        </tr>
      `).join('')
      : `<tr><td colspan="${program === 'ROTC' ? 8 : 7}"><div class="empty">No students found.</div></td></tr>`;

    $('#recordFooter').textContent = `Showing ${data.length} of ${rows.length} record(s)`;

    $$('[data-detail]').forEach((button) => {
      button.onclick = () => openRecord(Number(button.dataset.detail), button.dataset.level);
    });
  }

  async function openRecord(id, level) {
    const modal = $('#recordModal');
    const body = $('#recordModalBody');

    modal.classList.remove('hidden');
    body.innerHTML = `
      <div class="page-loading">
        <div class="page-spinner"></div>
        <span>Loading complete student record...</span>
      </div>
    `;

    try {
      const data = await API.get(
        `/api/admin/${apiProgram}/records/${id}?ms_level=${encodeURIComponent(level)}`
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
            <span>Student Record - ${prefix} ${esc(level)}</span>
            <h2>${esc(student.first_name)} ${esc(student.last_name)}${student.suffix ? ` ${esc(student.suffix)}` : ''}</h2>
            <p>${cycle.school_year ? `SY ${esc(cycle.school_year)} - ` : ''}${esc(student.student_id)}</p>
          </div>
          <button class="modal-close" id="recordClose">x</button>
        </div>
        <div class="record-modal-scroll">
          <section class="record-section">
            <h3>Personal Information</h3>
            <div class="record-info-grid">
              ${infoItem('Student ID', student.student_id)}
              ${infoItem('Name', `${student.last_name}, ${student.first_name} ${student.middle_name || ''}${student.suffix ? ` ${student.suffix}` : ''}`)}
              ${infoItem('Course', student.course)}
              ${infoItem('Year Level', student.year_level)}
              ${infoItem('Sex', student.sex)}
              ${infoItem('Birthdate', student.birthdate)}
              ${infoItem('Email', student.email)}
              ${infoItem('Contact Number', student.contact_number)}
              ${infoItem('Permanent Address', [student.permanent_barangay, student.permanent_municipality, student.permanent_province].filter(Boolean).join(', '))}
              ${infoItem('Medical Condition', student.has_medical_condition ? `${student.medical_condition || 'Yes'}` : 'None')}
            </div>
          </section>
          <section class="record-section">
            <h3>Enrollment & Assignment</h3>
            <div class="record-info-grid">
              ${infoItem('Program', program)}
              ${infoItem(`${prefix} Level`, `${prefix} ${level}`)}
              ${infoItem('School Year', cycle.school_year ? `SY ${cycle.school_year}` : '-')}
              ${infoItem('Enrollment Status', cycle.status)}
              ${program === 'ROTC'
                ? `${infoItem('Battalion', student.battalion ? `Battalion ${student.battalion}` : '-')}${infoItem('Company', student.rotc_company || '-')}${infoItem('Platoon', student.rotc_platoon ? `Platoon ${student.rotc_platoon}` : '-')}${infoItem('Special Unit', student.special_unit || '-')}${infoItem('Advance Course', student.willing_to_take_advance_course ? 'Yes' : 'No')}`
                : infoItem('CWTS Company', student.company || '-')}
            </div>
          </section>
          <section class="record-section">
            <h3>Grade - NSTP ${esc(level)}</h3>
            <div class="record-grade-row">
              ${infoItem('Midterm', grade ? Number(grade.midterm).toFixed(2) : '-')}
              ${infoItem('Final', grade ? Number(grade.final_term).toFixed(2) : '-')}
              ${infoItem('Average', grade ? Number(grade.grade).toFixed(2) : '-')}
              <div class="record-info-item"><small>Status</small>${grade ? badge(grade.status) : '<strong>-</strong>'}</div>
            </div>
          </section>
          <section class="record-section">
            <h3>Attendance Summary</h3>
            <div class="record-attendance-stats">
              <div class="present"><strong>${present}</strong><span>Present</span></div>
              <div class="late"><strong>${late}</strong><span>Late</span></div>
              <div class="absent"><strong>${absent}</strong><span>Absent</span></div>
            </div>
            ${attendance.length
              ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>${program === 'CWTS' ? 'CS' : 'MI'}</th><th>Type</th><th>Status</th><th>Time</th><th>Distance</th></tr></thead><tbody>${attendance.map((item) => `<tr><td>${item.mi_number || '-'}</td><td>${esc((item.mi_type || '-').toUpperCase())}</td><td>${badge(item.status)}</td><td>${formatRecordDate(item.created_at)}</td><td>${item.distance_meters != null ? `${Number(item.distance_meters).toFixed(1)} m` : '-'}</td></tr>`).join('')}</tbody></table></div>`
              : '<div class="empty compact">No attendance records for this cycle.</div>'}
          </section>
          <section class="record-section">
            <h3>Completion / Certificate Information</h3>
            <div class="record-info-grid">
              ${infoItem('Serial Number', data.serial?.serial_number || student.serial_number || 'Not yet issued')}
              ${infoItem('Certificate Status', (data.serial?.serial_number || student.serial_number) ? 'Serial number available' : 'Not yet available')}
            </div>
          </section>
          ${program === 'ROTC' && (data.withdrawals || []).length
            ? `<section class="record-section"><h3>Advance Course Withdrawal History</h3>${(data.withdrawals || []).map((withdrawal) => `<div class="withdrawal-history"><div>${badge(withdrawal.status)} <small>${formatRecordDate(withdrawal.created_at)}</small></div><p><strong>Reason:</strong> ${esc(withdrawal.reason)}</p>${withdrawal.admin_remarks ? `<p><strong>Admin Remarks:</strong> ${esc(withdrawal.admin_remarks)}</p>` : ''}</div>`).join('')}</section>`
            : ''}
        </div>
        <div class="app-dialog-actions">
          <button class="btn" id="recordCloseBottom">Close</button>
        </div>
      `;

      const close = () => modal.classList.add('hidden');

      $('#recordClose').onclick = close;
      $('#recordCloseBottom').onclick = close;
      modal.querySelector('.app-dialog-backdrop').onclick = close;
    } catch (error) {
      body.innerHTML = `
        <div class="page-load-error">
          <h3>Unable to load student record</h3>
          <p>${esc(error.message)}</p>
          <button class="btn" onclick="document.getElementById('recordModal').classList.add('hidden')">Close</button>
        </div>
      `;
    }
  }

  $('#recordSearch').oninput = draw;
  $('#recordLevel').onchange = draw;
  $('#recordSY').onchange = draw;
  $('#downloadRecords').onclick = () => {
    const data = filtered();

    if (!data.length) {
      return toast('No records to download.', true);
    }

    downloadRecordsExcel(
      data,
      program,
      $('#recordLevel').value,
      $('#recordSY').value
    );
  };

  $('#downloadProfiles').onclick = () => {
    const data = filtered();

    if (!data.length) {
      return toast('No approved student profiles to download.', true);
    }

    const params = new URLSearchParams();
    if ($('#recordLevel').value) {
      params.set('ms_level', $('#recordLevel').value);
    }
    if ($('#recordSY').value) {
      params.set('school_year', $('#recordSY').value);
    }
    const search = $('#recordSearch').value.trim();
    if (search) {
      params.set('search', search);
    }

    window.open(`/api/admin/${apiProgram}/records/download/profiles?${params.toString()}`, '_blank');
  };

  draw();
}
