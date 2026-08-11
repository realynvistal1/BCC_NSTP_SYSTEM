function makeAttendanceSummary(_programKey) {
  const program = 'CWTS';
  const apiProgram = 'cwts';
  const unit = 'CS';

  let sessions = [];
  let current = null;
  let allStudents = [];
  let currentSummary = null;

  const fmtTime = (value) => value
    ? new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '—';

  const fmtDate = (value) => value
    ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  function cycles() {
    const map = new Map();

    sessions.forEach((session) => {
      const key = `${session.school_year || 'Unknown'}__${session.ms_level || 'all'}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          year: session.school_year || 'Unknown',
          level: session.ms_level || '',
        });
      }
    });

    return [...map.values()].sort(
      (a, b) => b.year.localeCompare(a.year) || String(a.level).localeCompare(String(b.level))
    );
  }

  function filteredSessions() {
    const cycle = $('#summaryCycle').value;
    const mi = $('#summaryMI').value;
    const type = $('#summaryType').value;

    return sessions.filter((session) => (
      (!cycle || `${session.school_year || 'Unknown'}__${session.ms_level || 'all'}` === cycle)
      && (!mi || String(session.mi_number) === mi)
      && (!type || session.mi_type === type)
    ));
  }

  function populate() {
    const cycle = $('#summaryCycle');
    cycle.innerHTML = '<option value="">Select cycle</option>' + cycles().map((item) => (
      `<option value="${esc(item.key)}">${program === 'CWTS' ? 'CWTS' : 'MS'} ${esc(item.level || '—')} - SY ${esc(item.year)}</option>`
    )).join('');

    if (cycle.options.length > 1) cycle.selectedIndex = 1;
    populateMI();
  }

  function populateMI() {
    const cycle = $('#summaryCycle').value;
    const numbers = [...new Set(
      sessions
        .filter((session) => !cycle || `${session.school_year || 'Unknown'}__${session.ms_level || 'all'}` === cycle)
        .map((session) => Number(session.mi_number))
        .filter(Boolean)
    )].sort((a, b) => a - b);

    $('#summaryMI').innerHTML = `<option value="">Select ${unit}</option>`
      + numbers.map((number) => `<option value="${number}">${unit} ${number}</option>`).join('');

    if (numbers.length) $('#summaryMI').value = String(numbers[0]);
    loadSelected();
  }

  async function loadSelected() {
    const matches = filteredSessions();
    current = matches[0] || null;

    if (!current) {
      currentSummary = null;
      allStudents = [];
      renderEmpty();
      return;
    }

    const group = $('#summaryGroup').value || 'overall';
    const data = await API.get(
      `/api/admin/${apiProgram}/attendance-summary?session_id=${current.id}&group=${encodeURIComponent(group)}`
    );

    currentSummary = data;
    allStudents = data.students || [];
    render(data);
  }

  function renderEmpty() {
    $('#attendanceSummaryStats').innerHTML = '';
    $('#attendanceSummaryMeta').textContent = 'Choose an attendance cycle and session.';
    $('#attendanceSummaryContent').innerHTML = `
      <div class="attendance-empty">
        <h3>No attendance selected</h3>
        <p>Select a cycle and ${unit} session above.</p>
      </div>
    `;
    setExportDisabled(true);
  }

  function stat(label, value, cls = '') {
    return `
      <div class="attendance-stat-card ${cls}">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  function assignment(student) {
    if (program === 'CWTS') {
      return student.company ? `${student.company} Company` : 'Unassigned';
    }

    if (student.special_unit) return student.special_unit;
    if (Number(student.willing_to_take_advance_course || 0) === 1) return 'Advance Course';

    return [
      student.battalion ? `Battalion ${student.battalion}` : '',
      student.rotc_company,
      student.rotc_platoon ? `Platoon ${student.rotc_platoon}` : '',
    ].filter(Boolean).join(' • ') || 'Unassigned';
  }

  function render(data) {
    const counts = data.counts || {};

    $('#attendanceSummaryStats').innerHTML =
      stat('Total Students', data.total || 0)
      + stat('Present', counts.present || 0, 'present')
      + stat('Late', counts.late || 0, 'late')
      + stat('Absent', counts.absent || 0, 'absent')
      + stat('Not Yet Marked', counts.unmarked || 0, 'unmarked');

    $('#attendanceSummaryTitle').textContent = `${unit} ${data.session.mi_number} ${(data.session.mi_type || '').toUpperCase()} — ${program}`;
    $('#attendanceSummaryMeta').textContent = `SY ${data.session.school_year || '—'} • ${program === 'CWTS' ? 'CWTS' : 'MS'} ${data.session.ms_level || '—'} • ${fmtTime(data.session.open_date)} - ${fmtTime(data.session.close_date)} • 15-minute late window`;

    setExportDisabled(false);
    renderRows();
  }

  function visibleStudents() {
    const query = $('#summarySearch').value.toLowerCase().trim();
    const status = $('#summaryStatus').value;

    const filtered = allStudents.filter((student) => (
      (!status || student.attendance_status === status)
      && (!query || `${student.last_name} ${student.first_name} ${student.student_id} ${student.course} ${assignment(student)}`.toLowerCase().includes(query))
    ));

    filtered.sort((a, b) => {
      const assignmentA = assignment(a);
      const assignmentB = assignment(b);
      return assignmentA.localeCompare(assignmentB) || a.last_name.localeCompare(b.last_name);
    });

    return filtered;
  }

  function renderRows() {
    const students = visibleStudents();

    const rows = students.map((student) => `
      <tr>
        <td>
          <strong>${esc(student.last_name)}, ${esc(student.first_name)}</strong>
          <small>${esc(student.student_id)}</small>
        </td>
        <td>${esc(student.course || '—')}<small>${esc(student.year_level || '')}</small></td>
        <td>${esc(assignment(student))}</td>
        <td>${student.attendance_time ? fmtTime(student.attendance_time) : '—'}</td>
        <td>${student.distance_meters != null ? `${Math.round(Number(student.distance_meters))}m` : '—'}</td>
        <td>${badge(student.attendance_status)}</td>
        <td>
          <select class="admin-attendance-status" data-student="${student.id}">
            <option value="present" ${student.attendance_status === 'present' ? 'selected' : ''}>Present</option>
            <option value="late" ${student.attendance_status === 'late' ? 'selected' : ''}>Late</option>
            <option value="absent" ${student.attendance_status === 'absent' ? 'selected' : ''}>Absent</option>
          </select>
        </td>
      </tr>
    `);

    $('#attendanceSummaryContent').innerHTML = table(
      ['Student', 'Course / Year', 'Assignment', 'Time', 'Distance', 'Status', 'Verify'],
      rows
    );

    $$('.admin-attendance-status', $('#attendanceSummaryContent')).forEach((select) => {
      select.onchange = async () => {
        try {
          const result = await API.patch(
            `/api/admin/${apiProgram}/attendance-summary/${current.id}/verify`,
            {
              student_id: Number(select.dataset.student),
              status: select.value,
            }
          );
          toast(result.message);
          await loadSelected();
        } catch (error) {
          toast(error.message, true);
        }
      };
    });
  }

  function setExportDisabled(disabled) {
    const pdfButton = $('#downloadAttendancePdf');
    const excelButton = $('#downloadAttendanceExcel');
    if (pdfButton) pdfButton.disabled = disabled;
    if (excelButton) excelButton.disabled = disabled;
  }

  function exportMetadata() {
    if (!currentSummary || !currentSummary.session) return null;

    const session = currentSummary.session;
    const groupSelect = $('#summaryGroup');
    const groupText = groupSelect && groupSelect.selectedIndex >= 0
      ? groupSelect.options[groupSelect.selectedIndex].text
      : 'Overall';

    const statusSelect = $('#summaryStatus');
    const statusText = statusSelect && statusSelect.selectedIndex >= 0
      ? statusSelect.options[statusSelect.selectedIndex].text
      : 'All Status';

    return {
      session,
      groupText,
      statusText,
      searchText: $('#summarySearch').value.trim(),
      students: visibleStudents(),
      title: `${program} Attendance Summary`,
    };
  }

  function safeFilename(value) {
    return String(value || '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  function xmlEscape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportExcel() {
    const meta = exportMetadata();
    if (!meta) {
      toast('Select an attendance session first.', true);
      return;
    }

    const { session, students } = meta;
    const counts = students.reduce((result, student) => {
      const key = student.attendance_status || 'unmarked';
      result[key] = (result[key] || 0) + 1;
      return result;
    }, { present: 0, late: 0, absent: 0, unmarked: 0 });

    const rows = [
      ['BUENAVISTA COMMUNITY COLLEGE'],
      ['BCC NSTP Management System'],
      [meta.title],
      [],
      ['Program', program],
      ['School Year', session.school_year || '—'],
      [program === 'CWTS' ? 'CWTS Level' : 'MS Level', session.ms_level || '—'],
      [`${unit} Number`, `${unit} ${session.mi_number}`],
      ['Session', String(session.mi_type || '').toUpperCase()],
      ['Date', fmtDate(session.open_date)],
      ['Time', `${fmtTime(session.open_date)} - ${fmtTime(session.close_date)}`],
      ['Group / View', meta.groupText],
      ['Status Filter', meta.statusText],
      ['Search', meta.searchText || 'None'],
      [],
      ['Student ID', 'Student Name', 'Course', 'Year Level', 'Assignment', 'Time Marked', 'Distance', 'Status'],
      ...students.map((student) => [
        student.student_id || '',
        `${student.last_name || ''}, ${student.first_name || ''} ${student.middle_name || ''}`.trim(),
        student.course || '',
        student.year_level || '',
        assignment(student),
        student.attendance_time ? fmtTime(student.attendance_time) : '',
        student.distance_meters != null ? `${Math.round(Number(student.distance_meters))} m` : '',
        student.attendance_status === 'unmarked' ? 'Not Yet Marked' : String(student.attendance_status || '').toUpperCase(),
      ]),
      [],
      ['TOTALS'],
      ['Total Students', students.length],
      ['Present', counts.present || 0],
      ['Late', counts.late || 0],
      ['Absent', counts.absent || 0],
      ['Not Yet Marked', counts.unmarked || 0],
    ];

    const columnWidths = [90, 190, 160, 80, 210, 100, 80, 110];
    const xmlRows = rows.map((row) => {
      if (!row.length) return '<Row></Row>';
      return `<Row>${row.map((cell) => {
        const numeric = typeof cell === 'number';
        return `<Cell><Data ss:Type="${numeric ? 'Number' : 'String'}">${xmlEscape(cell)}</Data></Cell>`;
      }).join('')}</Row>`;
    }).join('');

    const xml = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Worksheet ss:Name="Attendance Summary"><Table>${columnWidths.map((width) => `<Column ss:Width="${width}"/>`).join('')}${xmlRows}</Table></Worksheet>\n</Workbook>`;

    const filename = `${safeFilename(program)}-${safeFilename(unit + '-' + session.mi_number)}-${safeFilename(session.mi_type)}-attendance-summary.xls`;
    downloadBlob(new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' }), filename);
    toast('Excel attendance report downloaded.');
  }

  function pdfEscape(value) {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '?')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  function truncate(value, max) {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
  }

  function makePdfBlob(linesByPage) {
    const objects = [];
    const addObject = (content) => {
      objects.push(content);
      return objects.length;
    };

    const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const pageObjectIds = [];

    linesByPage.forEach((pageLines) => {
      let stream = 'BT\n';
      pageLines.forEach((line) => {
        const font = line.bold ? `F${boldFontId}` : `F${fontId}`;
        stream += `/${font} ${line.size || 9} Tf\n`;
        stream += `1 0 0 1 ${line.x || 40} ${line.y || 760} Tm\n`;
        stream += `(${pdfEscape(line.text)}) Tj\n`;
      });
      stream += 'ET';

      const streamId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = addObject('');
      pageObjectIds.push({ pageId, streamId });
    });

    const pagesId = addObject('');

    pageObjectIds.forEach(({ pageId, streamId }) => {
      objects[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F${fontId} ${fontId} 0 R /F${boldFontId} ${boldFontId} 0 R >> >> /Contents ${streamId} 0 R >>`;
    });

    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map(({ pageId }) => `${pageId} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;
    const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    objects.forEach((content, index) => {
      offsets[index + 1] = pdf.length;
      pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
    });

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Blob([pdf], { type: 'application/pdf' });
  }

  function exportPdf() {
    const meta = exportMetadata();
    if (!meta) {
      toast('Select an attendance session first.', true);
      return;
    }

    const { session, students } = meta;
    const counts = students.reduce((result, student) => {
      const key = student.attendance_status || 'unmarked';
      result[key] = (result[key] || 0) + 1;
      return result;
    }, { present: 0, late: 0, absent: 0, unmarked: 0 });

    const pages = [];
    let page = [];
    let y = 560;

    function newPage(includeHeader = true) {
      if (page.length) pages.push(page);
      page = [];
      y = 560;
      if (includeHeader) {
        page.push({ x: 36, y, size: 15, bold: true, text: 'BUENAVISTA COMMUNITY COLLEGE' });
        y -= 18;
        page.push({ x: 36, y, size: 11, bold: true, text: 'BCC NSTP Management System' });
        y -= 18;
        page.push({ x: 36, y, size: 13, bold: true, text: meta.title });
        y -= 22;
      }
    }

    newPage(true);
    const details = [
      `Program: ${program}`,
      `School Year: ${session.school_year || '—'}    ${program === 'CWTS' ? 'CWTS' : 'MS'} Level: ${session.ms_level || '—'}`,
      `${unit}: ${unit} ${session.mi_number}    Session: ${String(session.mi_type || '').toUpperCase()}`,
      `Date: ${fmtDate(session.open_date)}    Time: ${fmtTime(session.open_date)} - ${fmtTime(session.close_date)}`,
      `View: ${meta.groupText}    Status: ${meta.statusText}`,
      `Search: ${meta.searchText || 'None'}`,
    ];

    details.forEach((text) => {
      page.push({ x: 36, y, size: 9, text });
      y -= 13;
    });

    y -= 8;
    const header = 'Student ID   Student Name                 Course        Year   Assignment                    Time      Distance   Status';
    page.push({ x: 36, y, size: 8, bold: true, text: header });
    y -= 12;
    page.push({ x: 36, y, size: 8, text: '-'.repeat(125) });
    y -= 12;

    students.forEach((student) => {
      if (y < 55) {
        newPage(true);
        page.push({ x: 36, y, size: 8, bold: true, text: header });
        y -= 12;
        page.push({ x: 36, y, size: 8, text: '-'.repeat(125) });
        y -= 12;
      }

      const name = truncate(`${student.last_name || ''}, ${student.first_name || ''}`, 28).padEnd(28);
      const studentId = truncate(student.student_id || '', 12).padEnd(12);
      const course = truncate(student.course || '', 12).padEnd(12);
      const year = truncate(student.year_level || '', 6).padEnd(6);
      const assign = truncate(assignment(student), 29).padEnd(29);
      const time = (student.attendance_time ? fmtTime(student.attendance_time) : '—').padEnd(10);
      const distance = (student.distance_meters != null ? `${Math.round(Number(student.distance_meters))}m` : '—').padEnd(10);
      const status = student.attendance_status === 'unmarked' ? 'NOT YET' : String(student.attendance_status || '').toUpperCase();

      page.push({
        x: 36,
        y,
        size: 7.5,
        text: `${studentId} ${name} ${course} ${year} ${assign} ${time} ${distance} ${status}`,
      });
      y -= 11;
    });

    if (y < 100) newPage(false);
    y -= 8;
    page.push({ x: 36, y, size: 9, bold: true, text: `Total Students: ${students.length}    Present: ${counts.present || 0}    Late: ${counts.late || 0}    Absent: ${counts.absent || 0}    Not Yet Marked: ${counts.unmarked || 0}` });
    y -= 16;
    page.push({ x: 36, y, size: 8, text: `Generated: ${new Date().toLocaleString()}` });

    if (page.length) pages.push(page);

    const filename = `${safeFilename(program)}-${safeFilename(unit + '-' + session.mi_number)}-${safeFilename(session.mi_type)}-attendance-summary.pdf`;
    downloadBlob(makePdfBlob(pages), filename);
    toast('PDF attendance report downloaded.');
  }

  function exportStructuredPdf() {
    const meta = exportMetadata();
    if (!meta) {
      toast('Select an attendance session first.', true);
      return;
    }

    const { session, students } = meta;

    function summarize(sectionStudents) {
      return sectionStudents.reduce((result, student) => {
        const key = student.attendance_status || 'unmarked';
        result[key] = (result[key] || 0) + 1;
        return result;
      }, { present: 0, late: 0, absent: 0, unmarked: 0 });
    }

    function compareStudents(a, b) {
      return `${a.last_name || ''}`.localeCompare(`${b.last_name || ''}`)
        || `${a.first_name || ''}`.localeCompare(`${b.first_name || ''}`)
        || `${a.student_id || ''}`.localeCompare(`${b.student_id || ''}`);
    }

    function statusText(student) {
      return student.attendance_status === 'unmarked'
        ? 'NOT YET MARKED'
        : String(student.attendance_status || '').toUpperCase();
    }

    function buildRotcSections() {
      const selectedGroup = $('#summaryGroup').value || 'overall';
      const sections = [];

      if (selectedGroup === 'advance-course') {
        ['Male', 'Female'].forEach((sex) => {
          const sectionStudents = students
            .filter((student) => String(student.sex || '').toLowerCase() === sex.toLowerCase())
            .sort(compareStudents);
          if (!sectionStudents.length) return;
          sections.push({
            heading: 'ADVANCE COURSE',
            subheading: `${sex.toUpperCase()} CADETS`,
            tableTitle: sex.toUpperCase(),
            students: sectionStudents,
          });
        });
        return sections;
      }

      if (selectedGroup === 'special-platoon') {
        ['Medics', 'HQ', 'MP'].forEach((specialUnit) => {
          const sectionStudents = students
            .filter((student) => student.special_unit === specialUnit)
            .sort(compareStudents);
          if (!sectionStudents.length) return;
          sections.push({
            heading: 'SPECIAL PLATOON',
            subheading: specialUnit.toUpperCase(),
            tableTitle: specialUnit.toUpperCase(),
            students: sectionStudents,
          });
        });
        return sections;
      }

      const battalionFilter = selectedGroup === 'battalion-1' ? 1 : selectedGroup === 'battalion-2' ? 2 : null;
      const regularStudents = students.filter((student) => !student.special_unit && Number(student.willing_to_take_advance_course || 0) !== 1);
      const battalions = battalionFilter ? [battalionFilter] : [1, 2];

      battalions.forEach((battalion) => {
        const battalionRows = regularStudents.filter((student) => Number(student.battalion) === battalion);
        const companies = [...new Set(battalionRows.map((student) => student.rotc_company).filter(Boolean))].sort();
        companies.forEach((company) => {
          const companyRows = battalionRows.filter((student) => student.rotc_company === company);
          const platoons = [...new Set(companyRows.map((student) => Number(student.rotc_platoon)).filter(Boolean))].sort((a, b) => a - b);
          platoons.forEach((platoon) => {
            const sectionStudents = companyRows.filter((student) => Number(student.rotc_platoon) === platoon).sort(compareStudents);
            if (!sectionStudents.length) return;
            sections.push({
              heading: `BATTALION ${battalion}`,
              subheading: `${String(company).toUpperCase()} COMPANY`,
              tableTitle: `PLATOON ${platoon}`,
              students: sectionStudents,
            });
          });
        });
      });

      return sections;
    }

    function buildCwtsSections() {
      const companies = [...new Set(students.map((student) => student.company).filter(Boolean))].sort();
      return companies.map((company) => ({
        heading: 'CWTS',
        subheading: `${String(company).toUpperCase()} COMPANY`,
        tableTitle: `${String(company).toUpperCase()} COMPANY`,
        students: students.filter((student) => student.company === company).sort(compareStudents),
      })).filter((section) => section.students.length);
    }

    function fallbackSections() {
      return [{
        heading: meta.groupText.toUpperCase(),
        subheading: 'ATTENDANCE SUMMARY',
        tableTitle: 'STUDENT LIST',
        students: [...students].sort(compareStudents),
      }];
    }

    function buildPage(section, index, totalSections) {
      const lines = [];
      const counts = summarize(section.students);
      let y = 560;

      lines.push({ x: 180, y, size: 15, bold: true, text: `${program} ${meta.groupText.toUpperCase()}` });
      y -= 24;
      lines.push({ x: 40, y, size: 9, text: `${unit} / Type: ${unit} ${session.mi_number} - ${String(session.mi_type || '').toUpperCase()}` });
      lines.push({ x: 320, y, size: 9, text: `Session Date: ${fmtDate(session.open_date)}` });
      y -= 14;
      lines.push({ x: 40, y, size: 9, text: `Time Window: ${fmtTime(session.open_date)} - ${fmtTime(session.close_date)}` });
      lines.push({ x: 320, y, size: 9, text: `School Year: ${session.school_year || '-'}` });
      y -= 14;
      lines.push({ x: 40, y, size: 9, text: `${program === 'CWTS' ? 'CWTS' : 'MS'} Level: ${session.ms_level || '-'}` });
      lines.push({ x: 320, y, size: 9, text: `Page: ${index + 1} of ${totalSections}` });
      y -= 26;

      lines.push({ x: 40, y, size: 10, bold: true, text: `TOTAL: ${section.students.length}` });
      lines.push({ x: 145, y, size: 10, text: `PRESENT: ${counts.present || 0}` });
      lines.push({ x: 275, y, size: 10, text: `LATE: ${counts.late || 0}` });
      lines.push({ x: 380, y, size: 10, text: `ABSENT: ${counts.absent || 0}` });
      lines.push({ x: 495, y, size: 10, text: `NOT YET: ${counts.unmarked || 0}` });
      y -= 28;

      lines.push({ x: 40, y, size: 12, bold: true, text: section.heading });
      y -= 18;
      lines.push({ x: 60, y, size: 11, bold: true, text: section.subheading });
      y -= 18;
      lines.push({ x: 80, y, size: 10, bold: true, text: section.tableTitle });
      y -= 16;

      lines.push({ x: 40, y, size: 8.5, bold: true, text: 'No.  Student Name                 ID Number      Status         Time In' });
      y -= 10;
      lines.push({ x: 40, y, size: 8, text: '-'.repeat(78) });
      y -= 10;

      section.students.forEach((student, rowIndex) => {
        const row = [
          String(rowIndex + 1).padEnd(4),
          truncate(`${student.last_name || ''}, ${student.first_name || ''}`, 28).padEnd(28),
          truncate(student.student_id || '', 12).padEnd(12),
          truncate(statusText(student), 13).padEnd(13),
          truncate(student.attendance_time ? fmtTime(student.attendance_time) : '-', 10),
        ].join(' ');
        lines.push({ x: 40, y, size: 8, text: row });
        y -= 10;
      });

      lines.push({ x: 40, y: 26, size: 7.5, text: `Generated: ${new Date().toLocaleString()}` });
      return lines;
    }

    let sections = program === 'CWTS' ? buildCwtsSections() : buildRotcSections();
    if (!sections.length) sections = fallbackSections();
    const pages = sections.map((section, index) => buildPage(section, index, sections.length));

    const filename = `${safeFilename(program)}-${safeFilename(unit + '-' + session.mi_number)}-${safeFilename(session.mi_type)}-attendance-summary.pdf`;
    downloadBlob(makePdfBlob(pages), filename);
    toast(`PDF attendance report downloaded. ${sections.length} page${sections.length === 1 ? '' : 's'} created.`);
  }

  async function init() {
    const auth = await guard(program === 'CWTS' ? 'cwts-admin' : 'rotc-admin');
    if (!auth) return;

    shell(
      program === 'CWTS' ? 'cwts' : 'rotc',
      'Attendance Summary',
      program === 'CWTS'
        ? 'Review CWTS attendance by company and student status.'
        : 'Review ROTC attendance by battalion, company, platoon, Advance Course, and special units.',
      auth
    );

    const data = await API.get(`/api/admin/${apiProgram}/attendance-summary`);
    sessions = data.sessions || [];

    const queryGroup = new URLSearchParams(location.search).get('group');
    if (queryGroup && [...$('#summaryGroup').options].some((option) => option.value === queryGroup)) {
      $('#summaryGroup').value = queryGroup;
    }

    populate();

    $('#summaryCycle').onchange = populateMI;
    $('#summaryMI').onchange = loadSelected;
    $('#summaryType').onchange = loadSelected;
    $('#summaryGroup').onchange = loadSelected;
    $('#summarySearch').oninput = renderRows;
    $('#summaryStatus').onchange = renderRows;

    const pdfButton = $('#downloadAttendancePdf');
    const excelButton = $('#downloadAttendanceExcel');
    if (pdfButton) pdfButton.onclick = exportStructuredPdf;
    if (excelButton) excelButton.onclick = exportExcel;
  }

  return { init };
}
