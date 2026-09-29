function officerRecordAssignment(row, program) {
  if (program === 'CWTS') {
    return row.company ? `${row.company} Company` : '-';
  }

  if (row.special_unit) {
    return `Special Unit - ${row.special_unit}`;
  }

  if (Number(row.willing_to_take_advance_course)) {
    return 'Advance Course';
  }

  return [
    row.battalion ? `Battalion ${row.battalion}` : '',
    row.rotc_company ? `${row.rotc_company} Company` : '',
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

function officerXmlSafe(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function officerCourseCode(course) {
  const value = String(course || '').trim();
  const upper = value.toUpperCase();
  const known = {
    'BS INFORMATION TECHNOLOGY': 'BSIT',
    'BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY': 'BSIT',
    BEED: 'BEED',
    'BEED - BACHELOR OF ELEMENTARY EDUCATION': 'BEED',
    'BACHELOR OF ELEMENTARY EDUCATION': 'BEED',
    BSHM: 'BSHM',
    'BS HOSPITALITY MANAGEMENT': 'BSHM',
    'BACHELOR OF SCIENCE IN HOSPITALITY MANAGEMENT': 'BSHM',
    BSED: 'BSED',
    'BSED - MAJOR IN ENGLISH': 'BSED',
    'BSED - MAJOR IN MATHEMATICS': 'BSED',
    'BACHELOR OF SECONDARY EDUCATION': 'BSED',
    'BS TOURISM MANAGEMENT': 'BSTM',
    'BACHELOR OF SCIENCE IN TOURISM MANAGEMENT': 'BSTM',
    'BS CRIMINOLOGY': 'BSCRIM',
    'BACHELOR OF SCIENCE IN CRIMINOLOGY': 'BSCRIM',
  };

  if (known[upper]) return known[upper];
  const letters = upper.match(/\b[A-Z]/g);
  return letters && letters.length >= 2 ? letters.join('') : value;
}

function downloadOfficerRecordsExcel(rows, program, level, schoolYear) {
  const prefix = program === 'CWTS' ? 'CWTS' : 'MS';
  const headers = [
    '#', 'SURNAME', 'FIRST NAME', 'MIDDLE NAME', 'SUFFIX', 'COURSE', 'COMPANY',
    'PLATOON', 'ID NUMBER', 'BIRTHDATE', 'SEX', 'ADDRESS', `${prefix} LEVEL`,
    'MIDTERM', 'FINAL', 'AVERAGE',
  ];
  const makeCell = (value, options = {}) => {
    const { style = 'Cell', mergeAcross = 0 } = options;
    const mergeAttr = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : '';
    return `<Cell ss:StyleID="${style}"${mergeAttr}><Data ss:Type="String">${officerXmlSafe(value)}</Data></Cell>`;
  };
  const widths = [34, 92, 92, 92, 54, 86, 86, 64, 92, 78, 58, 150, 74, 62, 62, 66];
  const columns = widths.map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`).join('');
  const styles = `
    <Styles>
      <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1F2937"/></Style>
      <Style ss:ID="Cell"><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/></Borders></Style>
      <Style ss:ID="CenterCell"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DEE7"/></Borders></Style>
      <Style ss:ID="MetaLabel"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#111827"/></Style>
      <Style ss:ID="SchoolTitle"><Alignment ss:Horizontal="Center"/><Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#111827"/></Style>
      <Style ss:ID="SchoolSubtitle"><Alignment ss:Horizontal="Center"/><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#374151"/></Style>
      <Style ss:ID="TableHeader"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F766E"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F766E"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F766E"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F766E"/></Borders><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F9D7A" ss:Pattern="Solid"/></Style>
    </Styles>`;
  const levels = level ? [String(level)] : ['1', '2'];
  const worksheets = levels.map((currentLevel) => {
    const levelRows = rows.filter((row) => String(row.ms_level) === currentLevel).map((row, index) => [
      index + 1,
      row.last_name,
      row.first_name,
      row.middle_name || '',
      row.suffix || 'N/A',
      officerCourseCode(row.course),
      program === 'ROTC'
        ? (Number(row.willing_to_take_advance_course) ? 'Advance Course' : row.special_unit || row.rotc_company || '-')
        : row.company || '-',
      program === 'ROTC' ? (row.rotc_platoon || '-') : '-',
      row.student_id,
      row.birthdate || '-',
      row.sex || '-',
      [row.permanent_barangay, row.permanent_municipality, row.permanent_province].filter(Boolean).join(', ') || '-',
      `${prefix} ${row.ms_level}`,
      row.midterm ?? '-',
      row.final_term ?? '-',
      row.grade ?? '-',
    ]);
    const headerRows = [
      `<Row ss:Height="20">${makeCell('Region: VII', { style: 'MetaLabel', mergeAcross: 2 })}${new Array(3).fill('<Cell/>').join('')}${makeCell('BUENAVISTA COMMUNITY COLLEGE', { style: 'SchoolTitle', mergeAcross: 5 })}${new Array(2).fill('<Cell/>').join('')}${makeCell(`School Year: SY ${schoolYear || 'All'}`, { style: 'MetaLabel', mergeAcross: 2 })}</Row>`,
      `<Row ss:Height="18">${makeCell(`NSTP Component: ${program}`, { style: 'MetaLabel', mergeAcross: 2 })}${new Array(3).fill('<Cell/>').join('')}${makeCell('Cangawa, Buenavista, Bohol', { style: 'SchoolSubtitle', mergeAcross: 5 })}${new Array(2).fill('<Cell/>').join('')}${makeCell(`${prefix} Level: ${prefix} ${currentLevel}`, { style: 'MetaLabel', mergeAcross: 2 })}</Row>`,
      '<Row ss:Height="10"></Row>',
      `<Row ss:Height="24">${headers.map((header) => makeCell(header, { style: 'TableHeader' })).join('')}</Row>`,
    ].join('');
    const bodyRows = levelRows.map((dataRow) => `<Row ss:Height="21">${dataRow.map((value, index) => makeCell(value, { style: index === 0 ? 'CenterCell' : 'Cell' })).join('')}</Row>`).join('');
    return `<Worksheet ss:Name="NSTP ${currentLevel}"><Table ss:ExpandedColumnCount="${headers.length}" ss:ExpandedRowCount="${levelRows.length + 4}" x:FullColumns="1" x:FullRows="1">${columns}${headerRows}${bodyRows}</Table></Worksheet>`;
  }).join('');
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${styles}${worksheets}</Workbook>`;
  const blob = new Blob(['\ufeff', xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
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

async function renderOfficerRecords(content) {
  const rows = await API.get('/api/officer/records');
  const scheduleOptions = await API.get('/api/officer/records/filter-options');

  content.innerHTML = `
    <section class="records-tools officer-record-tools">
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
        <option value="">All School Years</option>
      </select>
      <button class="btn success" id="downloadRecords" type="button">${icon('records')} Download Excel</button>
      <button class="btn primary" id="downloadProfiles" type="button">${icon('users')} Download Profile Forms PDF</button>
      <select id="recordBattalion">
        <option value="">All Battalions</option>
      </select>
      <select id="recordCompany">
        <option value="">All Companies</option>
      </select>
      <select id="recordPlatoon">
        <option value="">All Platoons</option>
      </select>
      <select id="recordSpecial">
        <option value="">All Special Assignments</option>
      </select>
      <button class="clear-filter-btn" id="clearRecordFilters" type="button">Clear Filters</button>
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
    <div class="app-dialog hidden" id="profileDownloadModal">
      <div class="app-dialog-backdrop"></div>
      <div class="app-dialog-card small-modal">
        <div class="app-dialog-head">
          <div>
            <span class="modal-eyebrow">ROTC Profile Forms</span>
            <h3>Commandant Name</h3>
            <p>Edit the commandant name before downloading the ROTC profile forms.</p>
          </div>
          <button type="button" class="modal-close" id="profileDownloadClose" aria-label="Close">x</button>
        </div>
        <form id="profileDownloadForm" class="modal-form-body">
          <label class="field">
            Commandant Name
            <input id="profileCommandantName" name="commandant_name" maxlength="100" required autocomplete="off">
          </label>
          <div class="app-dialog-actions">
            <button type="button" class="btn" id="profileDownloadCancel">Cancel</button>
            <button type="submit" class="btn primary">Download PDF</button>
          </div>
        </form>
      </div>
    </div>
  `;

  let commandantName = 'BILVER F. BUTALE';

  function currentProgram() {
    return $('#recordProgram').value;
  }

  function prefix(program) {
    return program === 'CWTS' ? 'CWTS' : 'MS';
  }

  function currentFilters(overrides = {}) {
    return {
      program: currentProgram(),
      query: $('#recordSearch').value.trim().toLowerCase(),
      level: $('#recordLevel').value,
      schoolYear: $('#recordSY').value,
      battalion: $('#recordBattalion').value,
      company: $('#recordCompany').value,
      platoon: $('#recordPlatoon').value,
      special: $('#recordSpecial').value,
      ...overrides,
    };
  }

  function matchesRecord(row, overrides = {}) {
    const {
      program,
      query,
      level,
      schoolYear,
      battalion,
      company,
      platoon,
      special,
    } = currentFilters(overrides);

    if (program && row.program !== program) {
      return false;
    }

    if (level && String(row.ms_level || '') !== level) {
      return false;
    }

    if (schoolYear && String(row.school_year || '') !== schoolYear) {
      return false;
    }

    if (program === 'ROTC' || (!program && row.program === 'ROTC')) {
      if (battalion && String(row.battalion || '') !== battalion) {
        return false;
      }
      if (company && String(row.rotc_company || '') !== company) {
        return false;
      }
      if (platoon && String(row.rotc_platoon || '') !== platoon) {
        return false;
      }
      if (special) {
        if (special === 'advance' && !Number(row.willing_to_take_advance_course || 0)) {
          return false;
        }
        if (special !== 'advance' && String(row.special_unit || '') !== special) {
          return false;
        }
      }
    } else if (program === 'CWTS' || (!program && row.program === 'CWTS')) {
      if (company && String(row.company || '') !== company) {
        return false;
      }
      if (battalion || platoon || special) {
        return false;
      }
    }

    if (
      query
      && !`${row.first_name} ${row.middle_name || ''} ${row.last_name} ${row.student_id} ${row.course}`
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }

    return true;
  }

  function filtered(overrides = {}) {
    return rows.filter((row) => matchesRecord(row, overrides));
  }

  function optionValues(list, valueFn) {
    return [...new Set(list.map(valueFn).map((value) => String(value || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function setSelectOptions(selectId, placeholder, values, currentValue, labelFn = (value) => value) {
    const select = $(selectId);
    select.innerHTML = `<option value="">${placeholder}</option>${values.map((value) => `<option value="${esc(value)}"${currentValue === value ? ' selected' : ''}>${esc(labelFn(value))}</option>`).join('')}`;
    if (currentValue && !values.includes(currentValue)) {
      select.value = '';
    }
  }

  function refreshFilterOptions() {
    const filters = currentFilters();
    const program = filters.program;
    const base = filtered({
      schoolYear: '',
      battalion: '',
      company: '',
      platoon: '',
      special: '',
    });
    const scheduleYears = optionValues(
      scheduleOptions.filter((item) => {
        if (program && item.program !== program) {
          return false;
        }
        if (filters.level && String(item.ms_level || '') !== String(filters.level)) {
          return false;
        }
        return true;
      }),
      (item) => item.year
    ).sort().reverse();
    const yearValues = [...new Set([
      ...optionValues(base, (row) => row.school_year).sort().reverse(),
      ...scheduleYears,
    ])];
    setSelectOptions('#recordSY', 'All School Years', yearValues, filters.schoolYear);

    const isRotc = !program || program === 'ROTC';
    const isCwts = !program || program === 'CWTS';

    const rotcBase = rows.filter((row) => row.program === 'ROTC' && matchesRecord(row, {
      program: program === 'CWTS' ? '__none__' : 'ROTC',
      schoolYear: '',
      battalion: '',
      company: '',
      platoon: '',
      special: '',
    }));
    const cwtsBase = rows.filter((row) => row.program === 'CWTS' && matchesRecord(row, {
      program: program === 'ROTC' ? '__none__' : 'CWTS',
      schoolYear: '',
      battalion: '',
      company: '',
      platoon: '',
      special: '',
    }));

    const battalions = isRotc ? ['1', '2'] : [];
    setSelectOptions('#recordBattalion', 'All Battalions', battalions, filters.battalion, (value) => `Battalion ${value}`);

    const battalionCompanies = {
      1: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
      2: ['Echo', 'Foxtrot', 'Golf', 'Hotel'],
    };
    const allRotcCompanies = Object.values(battalionCompanies).flat();
    const allCwtsCompanies = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
    const companyValues = program === 'ROTC'
      ? (battalionCompanies[filters.battalion]
        || allRotcCompanies)
      : program === 'CWTS'
        ? allCwtsCompanies
        : optionValues([
          ...rotcBase.map((row) => ({ label: row.rotc_company ? `ROTC: ${row.rotc_company}` : '' })),
          ...cwtsBase.map((row) => ({ label: row.company ? `CWTS: ${row.company}` : '' })),
        ], (row) => row.label);
    const companyValue = filters.company && !program
      ? (rotcBase.some((row) => row.rotc_company === filters.company) ? `ROTC: ${filters.company}` : cwtsBase.some((row) => row.company === filters.company) ? `CWTS: ${filters.company}` : '')
      : filters.company;
    setSelectOptions('#recordCompany', 'All Companies', companyValues, companyValue);

    const platoons = isRotc ? ['1', '2', '3', '4'] : [];
    setSelectOptions('#recordPlatoon', 'All Platoons', platoons, filters.platoon, (value) => `Platoon ${value}`);

    const specialValues = isRotc ? ['advance', 'Medics', 'HQ', 'MP'] : [];
    setSelectOptions('#recordSpecial', 'All Special Assignments', specialValues, filters.special, (value) => value === 'advance' ? 'Advance Course' : value);

    const hasBattalion = Boolean(filters.battalion);
    const hasSpecialAssignment = Boolean(filters.special);
    $('#recordBattalion').disabled = !isRotc || hasSpecialAssignment || !battalions.length;
    $('#recordCompany').disabled = hasSpecialAssignment || !(isRotc || isCwts) || !companyValues.length;
    $('#recordPlatoon').disabled = !isRotc || hasSpecialAssignment || !platoons.length;
    $('#recordSpecial').disabled = !isRotc || hasBattalion || !specialValues.length;
  }

  function normalizedBattalionFilter() {
    return $('#recordBattalion').value;
  }

  function normalizedCompanyFilter() {
    const value = $('#recordCompany').value;
    if (!currentProgram()) {
      return value.replace(/^ROTC:\s*|^CWTS:\s*/,'');
    }
    return value;
  }

  function normalizedPlatoonFilter() {
    return $('#recordPlatoon').value;
  }

  function normalizedSpecialFilter() {
    return $('#recordSpecial').value;
  }

  function visibleRecords() {
    const selectedProgram = currentProgram();
    return rows.filter((row) => matchesRecord(row, {
      program: selectedProgram,
      battalion: normalizedBattalionFilter(),
      company: normalizedCompanyFilter(),
      platoon: normalizedPlatoonFilter(),
      special: normalizedSpecialFilter(),
    }));
  }

  function draw() {
    refreshFilterOptions();
    const program = currentProgram() || 'ROTC';
    const pfx = prefix(program);
    const selectedProgram = currentProgram();
    const data = visibleRecords();

    $('#recordHead').innerHTML = `
      <tr>
        <th>#</th>
        <th>Student ID</th>
        <th>Name</th>
        <th>Course</th>
        <th>${pfx} Level</th>
        <th>SY</th>
        <th>Assignment</th>
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
          <td><span class="level-pill">${row.program === 'CWTS' ? 'CWTS' : 'MS'} ${esc(row.ms_level)}</span></td>
          <td>${row.school_year ? `SY ${esc(row.school_year)}` : '-'}</td>
          <td>${esc(officerRecordAssignment(row, row.program))}</td>
          <td><button class="btn small primary" data-detail="${row.student_db_id}" data-level="${row.ms_level}" data-program="${row.program}">View Details</button></td>
        </tr>
      `).join('')
      : '<tr><td colspan="8"><div class="empty">No students found.</div></td></tr>';

    $('#recordFooter').textContent = `Showing ${data.length} of ${rows.filter((row) => !selectedProgram || row.program === selectedProgram).length} record(s)`;

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
      const recordFullName = `${student.first_name} ${student.last_name}${student.suffix ? ` ${student.suffix}` : ''}`;
      const recordInitials = `${String(student.first_name || '').charAt(0)}${String(student.last_name || '').charAt(0)}`.toUpperCase() || 'ST';

      body.innerHTML = `
        <div class="record-modal-head">
          <div class="record-student-summary">
            ${student.photo
              ? `<img class="record-student-photo" src="${esc(student.photo)}" alt="${esc(recordFullName)} 2x2 photo">`
              : `<div class="record-student-photo fallback" aria-label="No student photo">${esc(recordInitials)}</div>`}
            <div>
              <span>Student Record - ${pfx} ${esc(level)}</span>
              <h2>${esc(recordFullName)}</h2>
              <p>${cycle.school_year ? `SY ${esc(cycle.school_year)} - ` : ''}${esc(student.student_id)}</p>
            </div>
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
              ${officerInfoItem('Assignment', officerRecordAssignment(student, program))}
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
  $('#recordBattalion').onchange = () => {
    if ($('#recordBattalion').value) {
      $('#recordSpecial').value = '';
    }
    $('#recordCompany').value = '';
    $('#recordPlatoon').value = '';
    draw();
  };
  $('#recordCompany').onchange = draw;
  $('#recordPlatoon').onchange = draw;
  $('#recordSpecial').onchange = () => {
    if ($('#recordSpecial').value) {
      $('#recordBattalion').value = '';
      $('#recordCompany').value = '';
      $('#recordPlatoon').value = '';
    }
    draw();
  };
  $('#downloadRecords').onclick = () => {
    const data = visibleRecords();
    const program = currentProgram();

    if (!data.length) {
      return toast('No records to download.', true);
    }

    downloadOfficerRecordsExcel(
      data,
      program,
      $('#recordLevel').value,
      $('#recordSY').value
    );
  };

  function profileDownloadParams(program, editedCommandantName = '') {
    const params = new URLSearchParams({ program });
    if ($('#recordLevel').value) params.set('ms_level', $('#recordLevel').value);
    if ($('#recordSY').value) params.set('school_year', $('#recordSY').value);
    if ($('#recordCompany').value) params.set('company', normalizedCompanyFilter());
    const search = $('#recordSearch').value.trim();
    if (search) params.set('search', search);
    if (editedCommandantName) params.set('commandant_name', editedCommandantName);
    return params;
  }

  $('#downloadProfiles').onclick = () => {
    const data = visibleRecords();
    const program = currentProgram();

    if (!data.length) {
      return toast('No approved student profiles to download.', true);
    }

    if (program === 'CWTS') {
      const params = profileDownloadParams(program);
      window.open(`/api/officer/records/download/profiles?${params.toString()}`, '_blank');
      return;
    }

    const modal = $('#profileDownloadModal');
    const input = $('#profileCommandantName');
    input.value = commandantName;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  };

  const closeProfileDownload = () => $('#profileDownloadModal').classList.add('hidden');
  $('#profileDownloadClose').onclick = closeProfileDownload;
  $('#profileDownloadCancel').onclick = closeProfileDownload;
  $('#profileDownloadModal').querySelector('.app-dialog-backdrop').onclick = closeProfileDownload;
  $('#profileDownloadForm').onsubmit = (event) => {
    event.preventDefault();
    const editedCommandantName = $('#profileCommandantName').value.trim().replace(/\s+/g, ' ');

    if (!editedCommandantName) {
      toast('Enter the commandant name before downloading.', true);
      $('#profileCommandantName').focus();
      return;
    }

    commandantName = editedCommandantName;
    closeProfileDownload();
    const params = profileDownloadParams('ROTC', editedCommandantName);
    window.open(`/api/officer/records/download/profiles?${params.toString()}`, '_blank');
  };

  $('#clearRecordFilters').onclick = () => {
    $('#recordProgram').value = 'ROTC';
    $('#recordSearch').value = '';
    $('#recordLevel').value = '';
    $('#recordSY').value = '';
    $('#recordBattalion').value = '';
    $('#recordCompany').value = '';
    $('#recordPlatoon').value = '';
    $('#recordSpecial').value = '';
    draw();
  };
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
