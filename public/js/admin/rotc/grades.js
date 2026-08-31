function gradeValue(value) {
  return value === null || value === undefined || value === ''
    ? ''
    : Number(value).toFixed(2);
}

function gradeMap(rows) {
  const map = new Map();

  (rows || []).forEach((grade) => {
    map.set(`${grade.student_id}|${grade.ms_level}`, grade);
  });

  return map;
}

function gradeStatus(avg) {
  if (avg === null) {
    return { label: '-', cls: 'neutral' };
  }

  return avg >= 1 && avg <= 3
    ? { label: 'Passed', cls: 'success' }
    : { label: 'Failed', cls: 'danger' };
}

function avgGrade(midterm, finalTerm) {
  const first = Number(midterm);
  const second = Number(finalTerm);

  if (
    !Number.isFinite(first)
    || !Number.isFinite(second)
    || first < 1
    || first > 5
    || second < 1
    || second > 5
  ) {
    return null;
  }

  return Math.round(((first + second) / 2) * 100) / 100;
}

function xmlSafe(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function courseCode(course) {
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

function downloadGradesExcel(rows, grades, program, level, schoolYear) {
  const headers = ['NO.', 'ID NUMBER', 'LAST NAME', 'FIRST NAME', 'MIDDLE NAME', 'YEAR', 'COURSE', 'MIDTERM', 'FINAL'];
  const makeCell = (value, options = {}) => {
    const {
      style = 'Cell',
      type = 'String',
      mergeAcross = 0,
    } = options;
    const mergeAttr = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : '';
    return `<Cell ss:StyleID="${style}"${mergeAttr}><Data ss:Type="${type}">${xmlSafe(value)}</Data></Cell>`;
  };
  const levels = level ? [String(level)] : ['1', '2'];
  const columnWidths = [42, 100, 110, 120, 110, 90, 90, 80, 80];
  const columnsXml = columnWidths.map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`).join('');

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
        <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#111827"/>
      </Style>
      <Style ss:ID="SchoolSubtitle">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#374151"/>
      </Style>
      <Style ss:ID="TableHeader">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Borders>
          <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#15803D"/>
          <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#15803D"/>
          <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#15803D"/>
          <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#15803D"/>
        </Borders>
        <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
        <Interior ss:Color="#16A34A" ss:Pattern="Solid"/>
      </Style>
    </Styles>
  `;

  const worksheetOptions = '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><Selected/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>5</SplitHorizontal><TopRowBottomPane>5</TopRowBottomPane><ActivePane>2</ActivePane><Panes><Pane><Number>3</Number></Pane><Pane><Number>2</Number><ActiveRow>5</ActiveRow></Pane></Panes><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>';
  const worksheetsXml = levels.map((currentLevel) => {
    const levelData = rows
      .filter((student) => Number(student[`approved_ms${currentLevel}`]) === 1)
      .map((student, index) => [
        index + 1,
        student.student_no || '',
        student.last_name || '',
        student.first_name || '',
        student.middle_name || '',
        student.year_level || '',
        courseCode(student.course),
        gradeValue(grades.get(`${student.student_id}|${currentLevel}`)?.midterm),
        gradeValue(grades.get(`${student.student_id}|${currentLevel}`)?.final_term),
      ]);

    const levelRows = levelData.map((dataRow) => `
        <Row ss:Height="21">
          ${dataRow.map((value, columnIndex) => makeCell(value, {
            style: columnIndex === 0 ? 'CenterCell' : 'Cell',
            type: columnIndex === 0 ? 'Number' : 'String',
          })).join('')}
        </Row>
      `).join('');

    const topRows = [
      `<Row ss:Height="24">${makeCell('BUENAVISTA COMMUNITY COLLEGE', { style: 'SchoolTitle', mergeAcross: headers.length - 1 })}</Row>`,
      `<Row ss:Height="18">${makeCell('Cangawa, Buenavista, Bohol', { style: 'SchoolSubtitle', mergeAcross: headers.length - 1 })}</Row>`,
      `<Row ss:Height="18">${makeCell(`School Year: ${schoolYear ? `SY ${schoolYear}` : 'All'}    Level: NSTP ${currentLevel}`, { style: 'MetaLabel', mergeAcross: headers.length - 1 })}</Row>`,
      '<Row ss:Height="10"></Row>',
      `<Row ss:Height="24">${headers.map((header) => makeCell(header, { style: 'TableHeader' })).join('')}</Row>`,
    ].join('');

    return `
      <Worksheet ss:Name="NSTP ${currentLevel}">
        <Table ss:ExpandedColumnCount="${headers.length}" ss:ExpandedRowCount="${levelData.length + 5}" x:FullColumns="1" x:FullRows="1">
          ${columnsXml}
          ${topRows}
          ${levelRows}
        </Table>
        ${worksheetOptions}
      </Worksheet>
    `;
  }).join('');

  const xml = `<?xml version="1.0"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">
    ${stylesXml}
    ${worksheetsXml}
  </Workbook>`;

  const blob = new Blob(['\ufeff', xml], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = `${program}${level ? `_MS${level}` : ''}${schoolYear ? `_SY${schoolYear}` : ''}_Grades.xls`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 5000);
}

async function renderAdminGrades(_program, content) {
  const program = 'ROTC';
  const apiProgram = 'rotc';
  const prefix = 'MS';

  const data = await API.get(`/api/admin/${apiProgram}/grades`);
  const students = data.students || [];
  const grades = gradeMap(data.grades || []);
  const schoolYears = [...new Set(
    students.flatMap((student) => [student.ms1_year, student.ms2_year]).filter(Boolean)
  )].sort().reverse();

  content.innerHTML = `
    <div class="grade-summary-grid">
      <div class="grade-summary-card">
        <small>Total Students</small>
        <strong id="gradeTotal">${students.length}</strong>
      </div>
      <div class="grade-summary-card green">
        <small>Graded</small>
        <strong id="gradeGraded">0</strong>
      </div>
      <div class="grade-summary-card amber">
        <small>Ungraded</small>
        <strong id="gradeUngraded">0</strong>
      </div>
    </div>
    <section class="panel grade-panel">
      <div class="grade-filter-head">
        <div>
          <h2>Student Grades</h2>
          <p>Encode or update ${program} NSTP 1 and NSTP 2 midterm and final term grades.</p>
        </div>
      </div>
      <div class="grade-tools">
        <select id="gradeLevel">
          <option value="">All ${prefix} Levels</option>
          <option value="1">${prefix} 1</option>
          <option value="2">${prefix} 2</option>
        </select>
        <select id="gradeSY">
          <option value="">All School Years</option>
          ${schoolYears.map((year) => `<option value="${esc(year)}">SY ${esc(year)}</option>`).join('')}
        </select>
        <select id="gradeYear">
          <option value="">All Years</option>
          <option>1st Year</option>
          <option>2nd Year</option>
          <option>3rd Year</option>
          <option>4th Year</option>
        </select>
        <input id="gradeSearch" placeholder="Search by name, student ID, or course...">
        <button class="btn success" id="downloadGradeRecords">Download Excel</button>
        <button class="clear-filter-btn" id="clearGradeFilters" type="button">Clear Filters</button>
      </div>
      <div class="table-wrap">
        <table class="data-table grade-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Student ID</th>
              <th>Student Name</th>
              <th>Course & Year</th>
              <th>Grade Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="gradeRows"></tbody>
        </table>
      </div>
      <div class="table-footer" id="gradeFooter"></div>
    </section>
    <div id="gradeModal" class="app-dialog hidden">
      <div class="app-dialog-backdrop"></div>
      <div class="app-dialog-card grade-modal-card">
        <div id="gradeModalBody"></div>
      </div>
    </div>
  `;

  function hasGrade(student, level) {
    return level
      ? grades.has(`${student.student_id}|${level}`)
      : grades.has(`${student.student_id}|1`) || grades.has(`${student.student_id}|2`);
  }

  function filtered() {
    const level = $('#gradeLevel').value;
    const schoolYear = $('#gradeSY').value;
    const yearLevel = $('#gradeYear').value;
    const query = $('#gradeSearch').value.trim().toLowerCase();

    return students.filter((student) => {
      if (level && !Number(student[`approved_ms${level}`])) {
        return false;
      }

      if (schoolYear && !(student.ms1_year === schoolYear || student.ms2_year === schoolYear)) {
        return false;
      }

      if (yearLevel && student.year_level !== yearLevel) {
        return false;
      }

      if (
        query
        && !`${student.last_name} ${student.first_name} ${student.middle_name || ''} ${student.student_no} ${student.course}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }

      return true;
    });
  }

  function renderRows() {
    const rows = filtered();
    const level = $('#gradeLevel').value;
    const graded = rows.filter((student) => hasGrade(student, level)).length;

    $('#gradeTotal').textContent = rows.length;
    $('#gradeGraded').textContent = graded;
    $('#gradeUngraded').textContent = rows.length - graded;

    $('#gradeRows').innerHTML = rows.length
      ? rows.map((student, index) => {
        const gradedAlready = hasGrade(student, level);
        const middleInitial = student.middle_name ? ` ${esc(student.middle_name[0])}.` : '';
        const suffix = student.suffix ? ` ${esc(student.suffix)}` : '';

        return `
          <tr>
            <td>${index + 1}</td>
            <td>${esc(student.student_no)}</td>
            <td><strong>${esc(student.last_name)}, ${esc(student.first_name)}${middleInitial}${suffix}</strong></td>
            <td>${esc(student.course)} - ${esc(student.year_level)}</td>
            <td>${gradedAlready ? '<span class="badge success">Graded</span>' : '<span class="badge warning">Ungraded</span>'}</td>
            <td>
              <button class="btn small ${gradedAlready ? 'success' : 'secondary'}" data-grade-student="${student.student_id}">
                ${gradedAlready ? 'View / Edit' : 'Encode'}
              </button>
            </td>
          </tr>
        `;
      }).join('')
      : '<tr><td colspan="6"><div class="empty">No students found.</div></td></tr>';

    $('#gradeFooter').textContent = `${rows.length} student${rows.length === 1 ? '' : 's'} shown`;

    $$('[data-grade-student]').forEach((button) => {
      button.onclick = () => openModal(
        students.find((student) => String(student.student_id) === button.dataset.gradeStudent)
      );
    });
  }

  function section(student, level) {
    const approved = Number(student[`approved_ms${level}`]) === 1;
    const grade = grades.get(`${student.student_id}|${level}`);
    const disabled = !approved;

    return `
      <div class="grade-level-card ${disabled ? 'disabled' : ''}" data-level="${level}">
        <div class="grade-level-top">
          <div>
            <span class="grade-level-number">${level}</span>
            <strong>NSTP ${level}</strong>
            ${disabled ? '<em>Not enrolled</em>' : ''}
          </div>
          <div>
            <span class="grade-average" id="avg${level}">${grade ? `Avg: ${Number(grade.grade).toFixed(2)}` : ''}</span>
            <span class="badge ${grade?.status === 'Passed' ? 'success' : grade?.status === 'Failed' ? 'danger' : 'neutral'}" id="st${level}">
              ${grade?.status || '-'}
            </span>
          </div>
        </div>
        <div class="grade-input-grid">
          <label>
            Midterm
            <input
              id="mid${level}"
              type="number"
              min="1"
              max="5"
              step="0.01"
              value="${grade?.midterm ?? ''}"
              ${disabled ? 'disabled' : ''}
              placeholder="1.00 - 5.00"
            >
          </label>
          <label>
            Final Term
            <input
              id="fin${level}"
              type="number"
              min="1"
              max="5"
              step="0.01"
              value="${grade?.final_term ?? ''}"
              ${disabled ? 'disabled' : ''}
              placeholder="1.00 - 5.00"
            >
          </label>
        </div>
      </div>
    `;
  }

  function openModal(student) {
    const modal = $('#gradeModal');

    $('#gradeModalBody').innerHTML = `
      <div class="app-dialog-head">
        <div class="grade-student-head">
          <div class="grade-avatar">${esc((student.first_name || '?')[0])}${esc((student.last_name || '?')[0])}</div>
          <div>
            <small>${esc(student.student_no)}</small>
            <h3>${esc(student.last_name)}, ${esc(student.first_name)}</h3>
            <p>${esc(student.course)} - ${esc(student.year_level)}</p>
          </div>
        </div>
        <button class="modal-close" id="closeGradeModal">x</button>
      </div>
      <div class="grade-modal-content">
        ${section(student, '1')}
        ${section(student, '2')}
        <div id="gradeMessage"></div>
      </div>
      <div class="app-dialog-actions">
        <button class="btn" id="cancelGrade">Close</button>
        <button class="btn primary" id="saveGrades">Save Grades</button>
      </div>
    `;

    modal.classList.remove('hidden');

    const close = () => modal.classList.add('hidden');

    $('#closeGradeModal').onclick = close;
    $('#cancelGrade').onclick = close;
    modal.querySelector('.app-dialog-backdrop').onclick = close;

    ['1', '2'].forEach((level) => {
      ['mid', 'fin'].forEach((key) => {
        const input = $(`#${key}${level}`);

        if (input && !input.disabled) {
          input.addEventListener('input', () => updateCalc(level));
        }
      });

      updateCalc(level);
    });

    $('#saveGrades').onclick = async () => {
      const button = $('#saveGrades');
      let saved = 0;

      button.disabled = true;

      try {
        for (const level of ['1', '2']) {
          if (!Number(student[`approved_ms${level}`])) {
            continue;
          }

          const midterm = $(`#mid${level}`).value;
          const finalTerm = $(`#fin${level}`).value;
          const avg = avgGrade(midterm, finalTerm);

          if (midterm === '' && finalTerm === '') {
            continue;
          }

          if (avg === null) {
            throw new Error(`${prefix} ${level} grades must both be between 1.00 and 5.00.`);
          }

          const result = await API.post(`/api/admin/${apiProgram}/grades`, {
            student_id: student.student_id,
            ms_level: level,
            midterm: Number(midterm),
            final_term: Number(finalTerm),
          });

          grades.set(`${student.student_id}|${level}`, {
            student_id: student.student_id,
            ms_level: level,
            midterm: Number(midterm),
            final_term: Number(finalTerm),
            grade: result.grade,
            status: result.status,
          });

          saved += 1;
        }

        if (!saved) {
          throw new Error('Enter valid grades before saving.');
        }

        toast('Grades saved successfully.');
        close();
        renderRows();
      } catch (error) {
        $('#gradeMessage').innerHTML = `<div class="notice error">${esc(error.message)}</div>`;
      } finally {
        button.disabled = false;
      }
    };
  }

  function updateCalc(level) {
    const midterm = $(`#mid${level}`);
    const finalTerm = $(`#fin${level}`);

    if (!midterm || midterm.disabled) {
      return;
    }

    const avg = avgGrade(midterm.value, finalTerm.value);
    const status = gradeStatus(avg);

    $(`#avg${level}`).textContent = avg === null ? '' : `Avg: ${avg.toFixed(2)}`;
    $(`#st${level}`).textContent = status.label;
    $(`#st${level}`).className = `badge ${status.cls}`;
  }

  ['#gradeLevel', '#gradeSY', '#gradeYear'].forEach((selector) => {
    $(selector).onchange = renderRows;
  });

  $('#gradeSearch').oninput = renderRows;
  $('#clearGradeFilters').onclick = () => {
    $('#gradeLevel').value = '';
    $('#gradeSY').value = '';
    $('#gradeYear').value = '';
    $('#gradeSearch').value = '';
    renderRows();
  };
  $('#downloadGradeRecords').onclick = () => {
    const rows = filtered();

    if (!rows.length) {
      return toast('No grade records to download.', true);
    }

    downloadGradesExcel(
      rows,
      grades,
      program,
      $('#gradeLevel').value,
      $('#gradeSY').value
    );
  };

  renderRows();
}
