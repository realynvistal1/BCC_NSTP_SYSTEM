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

function gradeStatus(avg, course = '') {
  if (avg === null) {
    return { label: '-', cls: 'neutral' };
  }

  const passingLimit = /criminology|education|\bBEED\b|\bBSED\b/i.test(String(course)) ? 2.5 : 3;
  return avg >= 1 && avg <= passingLimit
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

function matchingGradeLevels(student, grades, level, schoolYear) {
  return (level ? [String(level)] : ['1', '2']).filter(value =>
    (Number(student[`approved_ms${value}`]) === 1 || grades.has(`${student.student_id}|${value}`))
    && (!schoolYear || student[`ms${value}_year`] === schoolYear)
  );
}

function downloadGradesExcel(rows, grades, program, level, schoolYear) {
  const levelPrefix = 'Ms';
  const headers = ['NO.', 'ID NUMBER', 'LAST NAME', 'FIRST NAME', 'MIDDLE NAME', 'SUFFIX', 'YEAR', 'COURSE', 'MIDTERM', 'FINAL', 'FINAL GRADE'];
  const makeCell = (value, options = {}) => {
    const {
      style = 'Cell',
      type = 'String',
      mergeAcross = 0,
      formula = '',
    } = options;
    const mergeAttr = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : '';
    const formulaAttr = formula ? ` ss:Formula="${xmlSafe(formula)}"` : '';
    return `<Cell ss:StyleID="${style}"${mergeAttr}${formulaAttr}><Data ss:Type="${type}">${xmlSafe(value)}</Data></Cell>`;
  };
  const levels = level ? [String(level)] : ['1', '2'];
  const columnWidths = [42, 100, 110, 120, 110, 60, 90, 90, 80, 80, 80];
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
      <Style ss:ID="GradeCell" ss:Parent="Cell">
        <NumberFormat ss:Format="0.00"/>
      </Style>
      <Style ss:ID="MetaLabel">
        <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#111827"/>
      </Style>
      <Style ss:ID="MetaRight" ss:Parent="MetaLabel">
        <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
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
      .filter((student) => Number(student[`approved_ms${currentLevel}`]) === 1
        && matchingGradeLevels(student, grades, currentLevel, schoolYear).length > 0)
      .map((student, index) => [
        index + 1,
        student.student_no || '',
        student.last_name || '',
        student.first_name || '',
        student.middle_name || '',
        displaySuffix(student.suffix) || '',
        student.year_level || '',
        courseCode(student.course),
        gradeValue(grades.get(`${student.student_id}|${currentLevel}`)?.midterm),
        gradeValue(grades.get(`${student.student_id}|${currentLevel}`)?.final_term),
        gradeValue(grades.get(`${student.student_id}|${currentLevel}`)?.grade),
      ]);

    const levelRows = levelData.map((dataRow) => `
        <Row ss:Height="21">
          ${dataRow.map((value, columnIndex) => makeCell(value, {
            style: columnIndex === 0 ? 'CenterCell' : columnIndex >= 8 ? 'GradeCell' : 'Cell',
            type: columnIndex === 0 || (columnIndex >= 8 && value !== '') ? 'Number' : 'String',
            formula: '',
          })).join('')}
        </Row>
      `).join('');

    const topRows = [
      `<Row ss:Height="24">${makeCell('BUENAVISTA COMMUNITY COLLEGE', { style: 'SchoolTitle', mergeAcross: headers.length - 1 })}</Row>`,
      `<Row ss:Height="18">${makeCell('Cangawa, Buenavista, Bohol', { style: 'SchoolSubtitle', mergeAcross: headers.length - 1 })}</Row>`,
      `<Row ss:Height="18">${makeCell(`School Year: ${schoolYear ? `SY ${schoolYear}` : 'All'}`, { style: 'MetaLabel', mergeAcross: headers.length - 3 })}${makeCell(`${levelPrefix}:${currentLevel}`, { style: 'MetaRight', mergeAcross: 1 })}</Row>`,
      '<Row ss:Height="10"></Row>',
      `<Row ss:Height="24">${headers.map((header) => makeCell(header, { style: 'TableHeader' })).join('')}</Row>`,
    ].join('');

    return `
      <Worksheet ss:Name="${levelPrefix} ${currentLevel}">
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
  link.download = `${program}${level ? `_${levelPrefix}${level}` : ''}${schoolYear ? `_SY${schoolYear}` : ''}_Grades.xls`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 5000);
}

async function renderAdminGrades(_program, content) {
  const program = _program.toUpperCase();
  const apiProgram = program.toLowerCase();
  const prefix = 'NSTP';

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
      <div class="grade-summary-card blue">
        <small>Graded</small>
        <strong id="gradeGraded">0</strong>
      </div>
      <div class="grade-summary-card amber">
        <small>Ungraded</small>
        <strong id="gradeUngraded">0</strong>
      </div>
      <div class="grade-summary-card green">
        <small>Passed</small>
        <strong id="gradePassed">0</strong>
      </div>
      <div class="grade-summary-card red">
        <small>Failed</small>
        <strong id="gradeFailed">0</strong>
      </div>
    </div>
    <section class="panel grade-panel">
      <div class="grade-filter-head">
        <div>
          <h2>Student Grades</h2>
          <p>View approved grades and review instructor submissions.</p>
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
        <select id="gradeStatus" aria-label="Grade status">
          <option value="">All Grade Statuses</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="ungraded">Ungraded</option>
        </select>
        <input id="gradeSearch" placeholder="Search by name or student ID...">
        <button class="btn success" id="downloadGradeRecords">Download Excel</button>
        <button class="btn success" id="downloadAllGradeRecords">Download All</button><button class="clear-filter-btn" id="clearGradeFilters" type="button">Clear Filters</button>
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
    const levels = matchingGradeLevels(student, grades, level, $('#gradeSY').value);
    return levels.length > 0 && levels.every(value => grades.has(`${student.student_id}|${value}`));
  }

  function studentGradeState(student, level) {
    const levels = matchingGradeLevels(student, grades, level, $('#gradeSY').value);
    const studentGrades = levels
      .map((currentLevel) => grades.get(`${student.student_id}|${currentLevel}`))
      .filter(Boolean);

    if (!studentGrades.length) return 'ungraded';
    if (studentGrades.some((grade) => (
      gradeStatus(Number(grade.grade), student.course).label === 'Failed'
    ))) return 'failed';
    return studentGrades.length === levels.length ? 'passed' : 'ungraded';
  }

  function filtered() {
    const level = $('#gradeLevel').value;
    const schoolYear = $('#gradeSY').value;
    const yearLevel = $('#gradeYear').value;
    const status = $('#gradeStatus').value;
    const query = $('#gradeSearch').value.trim().toLowerCase();

    return students.filter((student) => {
      if (!matchingGradeLevels(student, grades, level, schoolYear).length) {
        return false;
      }

      if (status && studentGradeState(student, level) !== status) {
        return false;
      }

      if (yearLevel && student.year_level !== yearLevel) {
        return false;
      }

      if (
        query
        && !`${student.last_name} ${student.first_name} ${student.middle_name || ''} ${student.student_no}`
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
    const passed = rows.filter((student) => studentGradeState(student, level) === 'passed').length;
    const failed = rows.filter((student) => studentGradeState(student, level) === 'failed').length;

    $('#gradeTotal').textContent = rows.length;
    $('#gradeGraded').textContent = graded;
    $('#gradePassed').textContent = passed;
    $('#gradeFailed').textContent = failed;
    $('#gradeUngraded').textContent = rows.length - graded;

    $('#gradeRows').innerHTML = rows.length
      ? rows.map((student, index) => {
        const gradedAlready = hasGrade(student, level);
        const gradeState = studentGradeState(student, level);
        const middleInitial = student.middle_name ? ` ${esc(student.middle_name[0])}.` : '';
        const suffix = displaySuffix(student.suffix) ? ` ${esc(displaySuffix(student.suffix))}` : '';
        const statusBadge = gradeState === 'failed'
          ? '<span class="badge danger grade-result-badge">Failed</span>'
          : gradeState === 'passed'
            ? '<span class="badge success grade-result-badge">Passed</span>'
            : '<span class="badge warning grade-result-badge">Ungraded</span>';

        return `
          <tr class="grade-row-${gradeState}">
            <td>${index + 1}</td>
            <td>${esc(student.student_no)}</td>
            <td><strong>${esc(student.last_name)}, ${esc(student.first_name)}${middleInitial}${suffix}</strong></td>
            <td>${esc(student.course)} - ${esc(student.year_level)}</td>
            <td>${statusBadge}</td>
            <td>
              <button class="btn small ${gradeState === 'failed' ? 'danger' : gradedAlready ? 'success' : 'secondary'}" data-grade-student="${student.student_id}">
                View Grades
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
    const matchesSelection = matchingGradeLevels(student, grades, $('#gradeLevel').value, $('#gradeSY').value).includes(level);
    const disabled = true;

    return `
      <div class="grade-level-card ${disabled ? 'disabled' : ''}" data-level="${level}">
        <div class="grade-level-top">
          <div>
            <span class="grade-level-number">${level}</span>
            <strong>NSTP ${level}</strong>
            ${!approved || !matchesSelection ? `<em>${approved ? 'Outside selected level / school year' : 'Not enrolled'}</em>` : `<em>${esc(student[`ms${level}_year`] || '')}${grade ? ' / Saved (locked)' : Number(student[`ms${level}_attempts`]) > 1 ? ' / Retake' : ''}</em>`}
          </div>
          <div>
            <span class="grade-average" id="avg${level}">${grade ? `Grade: ${Number(grade.grade).toFixed(2)}` : ''}</span>
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
    const canEncode = matchingGradeLevels(student, grades, $('#gradeLevel').value, $('#gradeSY').value)
      .some(level => Number(student[`approved_ms${level}`]) === 1 && !grades.has(`${student.student_id}|${level}`));
    const initials = `${String(student.first_name || '').charAt(0)}${String(student.last_name || '').charAt(0)}`.toUpperCase() || 'ST';

    $('#gradeModalBody').innerHTML = `
      <div class="app-dialog-head">
        <div class="grade-student-head">
          <img class="grade-avatar grade-avatar-img" src="/api/admin/${apiProgram}/students/${encodeURIComponent(student.student_id)}/photo" alt="${esc(`${student.first_name} ${student.last_name}`)} 2x2 photo" data-initials="${esc(initials)}">
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
        <div class="notice">Grades are submitted by the assigned instructor.</div>
        <div id="gradeMessage"></div>
      </div>
      <div class="app-dialog-actions">
        <button class="btn" id="cancelGrade">Close</button>
        <button class="hidden" id="saveGrades" disabled>Save Grades</button>
      </div>
    `;

    const avatar = $('.grade-avatar-img', modal);
    const showAvatarFallback = () => {
      if (!avatar.isConnected) return;
      const fallback = document.createElement('div');
      fallback.className = 'grade-avatar';
      fallback.textContent = avatar.dataset.initials || 'ST';
      avatar.replaceWith(fallback);
    };
    avatar.addEventListener('error', showAvatarFallback, { once: true });
    if (avatar.complete && avatar.naturalWidth === 0) showAvatarFallback();

    modal.classList.remove('hidden');

    const close = () => modal.classList.add('hidden');

    $('#closeGradeModal').onclick = close;
    $('#cancelGrade').onclick = close;
    modal.querySelector('.app-dialog-backdrop').onclick = close;

    ['1', '2'].forEach((level) => {
      ['mid', 'fin'].forEach((key) => {
        const input = $(`#${key}${level}`);

        if (input && !input.disabled) {
          input.addEventListener('input', () => updateCalc(level, student.course));
        }
      });

      updateCalc(level, student.course);
    });

  }

  function updateCalc(level, course) {
    const midterm = $(`#mid${level}`);
    const finalTerm = $(`#fin${level}`);

    if (!midterm || midterm.disabled) {
      return;
    }

    const avg = avgGrade(midterm.value, finalTerm.value);
    const status = gradeStatus(avg, course);

    $(`#avg${level}`).textContent = avg === null ? '' : `Avg: ${avg.toFixed(2)}`;
    $(`#st${level}`).textContent = status.label;
    $(`#st${level}`).className = `badge ${status.cls}`;
  }

  ['#gradeLevel', '#gradeSY', '#gradeYear', '#gradeStatus'].forEach((selector) => {
    $(selector).onchange = renderRows;
  });

  $('#gradeSearch').oninput = renderRows;
  $('#clearGradeFilters').onclick = () => {
    $('#gradeLevel').value = '';
    $('#gradeSY').value = '';
    $('#gradeYear').value = '';
    $('#gradeStatus').value = '';
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

  $('#downloadAllGradeRecords').onclick = () => {
    if (!students.length) return toast('No grade records to download.', true);
    downloadGradesExcel(students, grades, program, '', '');
  };
  renderRows();
  const reviewPanel=document.createElement('section');
  reviewPanel.className='admin-submission-review';
  content.appendChild(reviewPanel);
  await renderInstructorGradeReview(program, reviewPanel);
}

async function renderInstructorGradeReview(program,content){
  const base=`/api/admin/${program.toLowerCase()}`;let rows=[],history=[],filter='submitted',request=0;
  const fullName=s=>[s.first_name,s.middle_name,s.last_name].filter(Boolean).join(' ');
  async function load(){const current=++request;const [submissions,saved]=await Promise.all([API.get(`${base}/grade-submissions`),API.get(`${base}/grades`)]);if(current!==request)return;rows=submissions;history=saved;draw();}
  function draw(){
    const list=rows.filter(r=>filter==='all'||r.status===filter);
    const names=new Map((history.students||[]).map(s=>[Number(s.student_id),s]));
    content.innerHTML=`<section class="instructor-header"><div><h2>Submitted Grades</h2><p>Review Midterm and Final grades submitted by instructors.</p></div><button class="btn" data-refresh>Refresh</button></section><section class="instructor-panel"><div class="instructor-toolbar"><label>Submission Status<select data-filter><option value="submitted">For Review (${rows.filter(r=>r.status==='submitted').length})</option><option value="returned">Returned</option><option value="approved">Approved</option><option value="all">All Submissions</option></select></label></div><div class="portal-table-wrap"><table class="portal-table"><thead><tr><th>Student</th><th>Assignment</th><th>Instructor</th><th>Midterm</th><th>Final</th><th>Status</th><th>Action</th></tr></thead><tbody>${list.map(r=>`<tr><td><strong>${esc(fullName(r))}</strong><small>${esc(r.student_no)}</small>${r.review_note?`<span class="grade-note">${esc(r.review_note)}</span>`:''}</td><td>${esc(r.year)}<small>${esc(program)} ${esc(r.ms_level)}${r.company?' · '+esc(r.company):''}</small></td><td>${esc([r.instructor_first_name,r.instructor_last_name].join(' '))}</td><td>${Number(r.midterm).toFixed(2)}</td><td>${Number(r.final_term).toFixed(2)}</td><td><span class="portal-badge ${esc(r.status)}">${r.status==='submitted'?'For review':r.status==='returned'?'Returned':'Approved'}</span></td><td>${r.status==='submitted'?`<div class="portal-actions"><button data-action="return" data-id="${r.id}" class="portal-secondary">Return</button><button data-action="approve" data-id="${r.id}">Approve</button></div>`:'—'}</td></tr>`).join('')||'<tr><td colspan="7" class="portal-empty">No grade submissions in this list.</td></tr>'}</tbody></table></div></section>
      `;
    const select=content.querySelector('[data-filter]');select.value=filter;select.onchange=()=>{filter=select.value;draw();};content.querySelector('[data-refresh]').onclick=()=>load().catch(e=>toast(e.message,true));
    content.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{
      const row=rows.find(r=>Number(r.id)===Number(button.dataset.id)),action=button.dataset.action;
      let note='';if(action==='return'){note=prompt('What should the instructor correct?');if(note===null)return;if(!note.trim()){toast('Enter a correction note.',true);return;}}else if(!confirm(`Approve Midterm ${row.midterm} and Final ${row.final_term} for ${fullName(row)}?`))return;
      const siblings=button.closest('tr').querySelectorAll('button');siblings.forEach(b=>b.disabled=true);
      try{const result=await API.patch(`${base}/grade-submissions/${row.id}/review`,{action,note,expected_version:Number(row.version)});toast(result.message);await load();}catch(e){toast(e.message,true);siblings.forEach(b=>b.disabled=false);}
    });
  }
  await load();
}
