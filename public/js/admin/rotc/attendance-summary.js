function makeAttendanceSummary(_programKey) {
  const isCwts = String(_programKey || '').toUpperCase() === 'CWTS';
  const program = isCwts ? 'CWTS' : 'ROTC';
  const apiProgram = isCwts ? 'cwts' : 'rotc';
  const unit = isCwts ? 'CS' : 'MI';

  let sessions = [];
  let current = null;
  let currentSessions = [];
  let allStudents = [];
  let currentSummary = null;
  const rotcCompanyOptions = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];

  const cycleKeyFor = (session) => `${session.school_year || 'Unknown'}__${session.ms_level || 'all'}`;

  function cycleSortValue(year) {
    const value = String(year || '').trim();
    const match = value.match(/^(\d{4})/);
    return match ? Number(match[1]) : -1;
  }

  function cycleLabelFor(item) {
    return `${program === 'CWTS' ? 'CWTS' : 'MS'} ${esc(item.level || 'â€”')} - SY ${esc(item.year)}`;
  }

  const fmtTime = (value) => value
    ? new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '—';

  const fmtDate = (value) => value
    ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  function cycles() {
    const map = new Map();

    sessions.forEach((session) => {
      const key = cycleKeyFor(session);
      if (!map.has(key)) {
        map.set(key, {
          key,
          year: session.school_year || 'Unknown',
          level: session.ms_level || '',
        });
      }
    });

    return [...map.values()].sort(
      (a, b) => cycleSortValue(b.year) - cycleSortValue(a.year)
        || Number(b.level || 0) - Number(a.level || 0)
        || String(b.year).localeCompare(String(a.year))
    );
  }

  function filteredSessions() {
    const cycle = $('#summaryCycle').value;
    const mi = $('#summaryMI').value;
    const type = $('#summaryType').value;

    return sessions.filter((session) => (
      (!cycle || cycleKeyFor(session) === cycle)
      && (!mi || String(session.mi_number) === mi)
      && (!type || session.mi_type === type)
    ));
  }

  function populate() {
    const cycle = $('#summaryCycle');
    const previousCycle = cycle.value || '';
    const cycleOptions = cycles();
    cycle.innerHTML = '<option value="">Select cycle</option>' + cycleOptions.map((item) => (
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

    $('#summaryMI').innerHTML = `<option value="">All ${unit}</option>`
      + numbers.map((number) => `<option value="${number}">${unit} ${number}</option>`).join('');
    loadSelected();
  }

  function populateCycleOptions() {
    const cycle = $('#summaryCycle');
    const previousCycle = cycle.value || '';
    const cycleOptions = cycles();

    cycle.innerHTML = '<option value="">Select cycle</option>' + cycleOptions.map((item) => (
      `<option value="${esc(item.key)}">${cycleLabelFor(item)}</option>`
    )).join('');

    if (previousCycle && cycleOptions.some((item) => item.key === previousCycle)) {
      cycle.value = previousCycle;
    } else if (cycle.options.length > 1) {
      cycle.selectedIndex = 1;
    }

    populateMIOptions();
  }

  function populateMIOptions() {
    const cycle = $('#summaryCycle').value;
    const miSelect = $('#summaryMI');
    const previousMI = miSelect.value || '';
    const numbers = [...new Set(
      sessions
        .filter((session) => !cycle || cycleKeyFor(session) === cycle)
        .map((session) => Number(session.mi_number))
        .filter(Boolean)
    )].sort((a, b) => a - b);

    miSelect.innerHTML = `<option value="">All ${unit}</option>`
      + numbers.map((number) => `<option value="${number}">${unit} ${number}</option>`).join('');

    if (previousMI && numbers.includes(Number(previousMI))) {
      miSelect.value = previousMI;
    }

    loadSelected();
  }

  async function fetchSummary(session, group) {
    const data = await API.get(
      `/api/admin/${apiProgram}/attendance-summary?session_id=${session.id}&group=${encodeURIComponent(group)}`
    );

    return {
      ...data,
      session,
    };
  }

  function buildAggregateSummary(summaries) {
    const counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
    const students = [];

    summaries.forEach((summary) => {
      (summary.students || []).forEach((student) => {
        const attendanceStatus = student.attendance_status || 'unmarked';
        counts[attendanceStatus] = (counts[attendanceStatus] || 0) + 1;
        students.push({
          ...student,
          attendance_status: attendanceStatus,
          session_id: summary.session.id,
          mi_number: summary.session.mi_number,
          mi_type: summary.session.mi_type,
          session_school_year: summary.session.school_year,
          session_ms_level: summary.session.ms_level,
          summary_key: `${summary.session.id}-${student.id}`,
        });
      });
    });

    return {
      aggregate: true,
      sessions: summaries.map((summary) => summary.session),
      students,
      counts,
      total: students.length,
    };
  }

  async function loadSelected() {
    const matches = filteredSessions();
    const selectedMI = $('#summaryMI').value;
    const group = $('#summaryGroup').value || 'overall';

    currentSessions = matches;
    current = selectedMI ? (matches[0] || null) : null;

    if (!matches.length) {
      currentSummary = null;
      allStudents = [];
      renderEmpty();
      return;
    }

    if (!selectedMI) {
      const summaries = await Promise.all(matches.map((session) => fetchSummary(session, group)));
      const aggregate = buildAggregateSummary(summaries);
      currentSummary = aggregate;
      allStudents = aggregate.students || [];
      render(aggregate);
      return;
    }

    const data = await fetchSummary(current, group);

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

  function summaryStudentCompany(student) {
    if (program === 'CWTS') {
      return String(student.company || '').trim();
    }

    if (Number(student.willing_to_take_advance_course || 0) === 1 && !student.special_unit) {
      return String(student.sex || '').trim();
    }

    if (student.special_unit) return '';
    return String(student.rotc_company || '').trim();
  }

  function summaryStudentPlatoon(student) {
    if (program === 'CWTS') {
      return '';
    }

    if (student.special_unit) {
      return String(student.special_unit || '').trim();
    }

    return String(student.rotc_platoon || '').trim();
  }

  function overallSummaryPlatoonLabel(student) {
    if (student.special_unit) {
      return String(student.special_unit || '').trim();
    }

    if (Number(student.willing_to_take_advance_course || 0) === 1 && !student.special_unit) {
      const sex = String(student.sex || '').trim().toUpperCase();
      return sex === 'FEMALE' ? 'Advance F' : sex === 'MALE' ? 'Advance M' : 'Advance Course';
    }

    const battalion = Number(student.battalion || 0);
    const platoon = String(student.rotc_platoon || '').trim();
    return battalion && platoon ? `B${battalion} P${platoon}` : '';
  }

  function summaryCompanyOptions(group, students) {
    if (program === 'CWTS') {
      return [...new Set(
        students.map((student) => summaryStudentCompany(student)).filter(Boolean)
      )].sort((a, b) => a.localeCompare(b));
    }

    if (group === 'overall') {
      return [...rotcCompanyOptions];
    }

    if (group === 'battalion-1') return ['Alpha', 'Bravo', 'Charlie', 'Delta'];
    if (group === 'battalion-2') return ['Echo', 'Foxtrot', 'Golf', 'Hotel'];
    if (group === 'advance-course') return ['Male', 'Female'];
    if (group === 'special-platoon') return ['HQ', 'Medics', 'MP'];

    return [...new Set(
      students.map((student) => summaryStudentCompany(student)).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
  }

  function ensureSummaryBattalionSelect() {
    if (program === 'CWTS') return null;

    let battalionSelect = $('#summaryBattalion');
    if (battalionSelect) return battalionSelect;

    const companySelect = $('#summaryCompany');
    if (!companySelect || !companySelect.parentNode) return null;

    battalionSelect = document.createElement('select');
    battalionSelect.id = 'summaryBattalion';
    battalionSelect.className = companySelect.className;
    battalionSelect.innerHTML = '<option value="">All Battalion</option>';
    companySelect.parentNode.insertBefore(battalionSelect, companySelect);
    return battalionSelect;
  }

  function effectiveSummaryGroup() {
    const group = $('#summaryGroup')?.value || 'overall';
    const battalionSelect = $('#summaryBattalion');
    if (program !== 'CWTS' && group === 'overall' && battalionSelect?.value) {
      return battalionSelect.value;
    }
    return group;
  }

  function sortPlatoonValues(values) {
    return [...values].sort((a, b) => {
      const aNum = Number(a);
      const bNum = Number(b);

      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return aNum - bNum;
      }

      return String(a).localeCompare(String(b));
    });
  }

  function sortOverallPlatoonValues(values) {
    return [...values].sort((a, b) => {
      const advanceOrder = { 'Advance M': 1, 'Advance F': 2 };
      const aAdvance = Object.prototype.hasOwnProperty.call(advanceOrder, a);
      const bAdvance = Object.prototype.hasOwnProperty.call(advanceOrder, b);

      if (aAdvance && bAdvance) {
        return advanceOrder[a] - advanceOrder[b];
      }

      if (aAdvance) return 1;
      if (bAdvance) return -1;

      return String(a).localeCompare(String(b), undefined, { numeric: true });
    });
  }

  function syncSummaryRosterFilters() {
    const battalionSelect = ensureSummaryBattalionSelect();
    const companySelect = $('#summaryCompany');
    const platoonSelect = $('#summaryPlatoon');
    if (!companySelect || !platoonSelect) return;

    const viewGroup = $('#summaryGroup').value || 'overall';
    const group = effectiveSummaryGroup();
    const previousBattalion = battalionSelect?.value || '';
    const previousCompany = companySelect.value || '';
    const previousPlatoon = platoonSelect.value || '';

    if (battalionSelect) {
      if (viewGroup === 'overall') {
        battalionSelect.style.display = '';
        battalionSelect.disabled = false;
        battalionSelect.innerHTML = ''
          + '<option value="">All Battalion</option>'
          + '<option value="battalion-1">Battalion 1</option>'
          + '<option value="battalion-2">Battalion 2</option>'
          + '<option value="advance-course">Advance Course</option>'
          + '<option value="special-platoon">Special Platoon</option>';
        battalionSelect.value = ['battalion-1', 'battalion-2', 'advance-course', 'special-platoon'].includes(previousBattalion)
          ? previousBattalion
          : '';
      } else {
        battalionSelect.value = '';
        battalionSelect.disabled = true;
        battalionSelect.style.display = 'none';
      }
    }

    const groupStudents = allStudents.filter((student) => {
      if (group === 'overall') return true;
      if (group === 'battalion-1') return Number(student.battalion || 0) === 1 && !student.special_unit && Number(student.willing_to_take_advance_course || 0) !== 1;
      if (group === 'battalion-2') return Number(student.battalion || 0) === 2 && !student.special_unit && Number(student.willing_to_take_advance_course || 0) !== 1;
      if (group === 'advance-course') return Number(student.willing_to_take_advance_course || 0) === 1 && !student.special_unit;
      if (group === 'special-platoon') return Boolean(student.special_unit);
      return true;
    });

    const companyOptions = summaryCompanyOptions(group, groupStudents);
    const companyLabel = group === 'advance-course'
      ? 'All Gender'
      : group === 'special-platoon'
        ? 'Unit'
        : 'All Company';
    companySelect.innerHTML = `<option value="">${companyLabel}</option>`
      + companyOptions.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    companySelect.value = companyOptions.includes(previousCompany) ? previousCompany : '';
    companySelect.disabled = companyOptions.length === 0;

    if (program === 'CWTS' || group === 'advance-course' || group === 'special-platoon') {
      platoonSelect.value = '';
      platoonSelect.disabled = true;
      platoonSelect.style.display = 'none';
      return;
    }

    platoonSelect.style.display = '';

    const selectedCompany = companySelect.value || '';
    const platoonOptions = group === 'overall'
      ? sortOverallPlatoonValues(new Set([
        ...groupStudents
          .filter((student) => {
            if (!selectedCompany) return true;
            if (selectedCompany === 'Advance Course') {
              return Number(student.willing_to_take_advance_course || 0) === 1 && !student.special_unit;
            }
            return !student.special_unit
              && Number(student.willing_to_take_advance_course || 0) !== 1
              && String(student.rotc_company || '').trim() === selectedCompany;
          })
          .map((student) => overallSummaryPlatoonLabel(student))
          .filter(Boolean),
        'Advance M',
        'Advance F',
      ]))
      : sortPlatoonValues(new Set(
        groupStudents
          .filter((student) => !selectedCompany || summaryStudentCompany(student) === selectedCompany)
          .map((student) => summaryStudentPlatoon(student))
          .filter(Boolean)
      ));

    platoonSelect.innerHTML = `<option value="">All ${group === 'special-platoon' ? 'Unit' : 'Platoon'}</option>`
      + platoonOptions.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    platoonSelect.value = platoonOptions.includes(previousPlatoon) ? previousPlatoon : '';
    platoonSelect.disabled = platoonOptions.length === 0;
  }

  function renderVisibleStats(students) {
    const counts = { present: 0, late: 0, absent: 0, unmarked: 0 };

    students.forEach((student) => {
      const key = student.attendance_status || 'unmarked';
      counts[key] = (counts[key] || 0) + 1;
    });

    $('#attendanceSummaryStats').innerHTML =
      stat('Total Students', students.length)
      + stat('Present', counts.present || 0, 'present')
      + stat('Late', counts.late || 0, 'late')
      + stat('Absent', counts.absent || 0, 'absent')
      + stat('Not Yet Marked', counts.unmarked || 0, 'unmarked');
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

  function render(data) {
    const counts = data.counts || {};
    const aggregateMode = Boolean(data.aggregate);
    const selectedType = $('#summaryType').value;
    const cycleLabel = $('#summaryCycle').selectedOptions[0]?.textContent || 'Selected Cycle';

    $('#attendanceSummaryStats').innerHTML =
      stat('Total Students', data.total || 0)
      + stat('Present', counts.present || 0, 'present')
      + stat('Late', counts.late || 0, 'late')
      + stat('Absent', counts.absent || 0, 'absent')
      + stat('Not Yet Marked', counts.unmarked || 0, 'unmarked');

    if (aggregateMode) {
      const typeLabel = selectedType ? String(selectedType).toUpperCase() : 'ALL';
      $('#attendanceSummaryTitle').textContent = `All ${unit} ${typeLabel} - ${program}`;
      $('#attendanceSummaryMeta').textContent = `${cycleLabel} - ${data.sessions.length} session${data.sessions.length === 1 ? '' : 's'} included`;
    } else {
      $('#attendanceSummaryTitle').textContent = `${unit} ${data.session.mi_number} ${(data.session.mi_type || '').toUpperCase()} - ${program}`;
      $('#attendanceSummaryMeta').textContent = `SY ${data.session.school_year || '-'} - ${program === 'CWTS' ? 'CWTS' : 'MS'} ${data.session.ms_level || '-'} - ${fmtTime(data.session.open_date)} - ${fmtTime(data.session.close_date)} - 15-minute late window`;
    }

    setExportDisabled(false);
    syncSummaryRosterFilters();
    renderRows();
  }

  function visibleStudents() {
    const query = $('#summarySearch').value.toLowerCase().trim();
    const group = effectiveSummaryGroup();
    const status = $('#summaryStatus').value;
    const company = $('#summaryCompany')?.value || '';
    const platoon = $('#summaryPlatoon')?.value || '';

    const filtered = allStudents.filter((student) => (
      (
        group === 'overall'
        || (group === 'battalion-1' && Number(student.battalion || 0) === 1 && !student.special_unit && Number(student.willing_to_take_advance_course || 0) !== 1)
        || (group === 'battalion-2' && Number(student.battalion || 0) === 2 && !student.special_unit && Number(student.willing_to_take_advance_course || 0) !== 1)
        || (group === 'advance-course' && Number(student.willing_to_take_advance_course || 0) === 1 && !student.special_unit)
        || (group === 'special-platoon' && Boolean(student.special_unit))
      )
      && 
      (!status || student.attendance_status === status)
      && (!company || (
        (group === 'overall' && company === 'Advance Course' && Number(student.willing_to_take_advance_course || 0) === 1 && !student.special_unit)
        || (group === 'overall' && company !== 'Advance Course' && !student.special_unit && Number(student.willing_to_take_advance_course || 0) !== 1 && summaryStudentCompany(student) === company)
        || (group === 'special-platoon' && String(student.special_unit || '').trim() === company)
        || (group !== 'special-platoon' && summaryStudentCompany(student) === company)
      ))
      && (!platoon || (
        (group === 'overall' && overallSummaryPlatoonLabel(student) === platoon)
        || (group !== 'overall' && summaryStudentPlatoon(student) === platoon)
      ))
      && (!query || `${student.last_name} ${student.first_name} ${student.student_id} ${student.course} ${assignment(student)} ${student.mi_number || ''} ${student.mi_type || ''}`.toLowerCase().includes(query))
    ));

    filtered.sort((a, b) => {
      if (Number(a.mi_number || 0) !== Number(b.mi_number || 0)) {
        return Number(a.mi_number || 0) - Number(b.mi_number || 0);
      }

      if (String(a.mi_type || '') !== String(b.mi_type || '')) {
        return String(a.mi_type || '').localeCompare(String(b.mi_type || ''));
      }

      const assignmentA = assignment(a);
      const assignmentB = assignment(b);
      return assignmentA.localeCompare(assignmentB) || a.last_name.localeCompare(b.last_name);
    });

    return filtered;
  }

  function renderRows() {
    const students = visibleStudents();
    const aggregateMode = Boolean(currentSummary?.aggregate);

    renderVisibleStats(students);

    const rows = students.map((student) => `
      <tr>
        ${aggregateMode ? `<td>${esc(`${unit} ${student.mi_number} ${String(student.mi_type || '').toUpperCase()}`)}</td>` : ''}
        <td>
          <strong>${esc(student.last_name)}, ${esc(student.first_name)}</strong>
          <small>${esc(student.student_id)}</small>
        </td>
        <td>${esc(student.course || '—')}<small>${esc(student.year_level || '')}</small></td>
        <td>${esc(assignment(student))}</td>
        <td>${student.attendance_time ? fmtTime(student.attendance_time) : '—'}</td>
        <td>${student.distance_meters != null ? `${Math.round(Number(student.distance_meters))}m` : '—'}</td>
        <td>${badge(student.attendance_status)}</td>
        ${aggregateMode
    ? '<td><small>Single-session verify only</small></td>'
    : `
          <td>
            <select class="admin-attendance-status" data-student="${student.id}">
              <option value="present" ${student.attendance_status === 'present' ? 'selected' : ''}>Present</option>
              <option value="late" ${student.attendance_status === 'late' ? 'selected' : ''}>Late</option>
              <option value="absent" ${student.attendance_status === 'absent' ? 'selected' : ''}>Absent</option>
            </select>
          </td>
        `}
      </tr>
    `);

    $('#attendanceSummaryContent').innerHTML = table(
      aggregateMode
        ? [`${unit} / Type`, 'Student', 'Course / Year', 'Assignment', 'Time', 'Distance', 'Status', 'Verify']
        : ['Student', 'Course / Year', 'Assignment', 'Time', 'Distance', 'Status', 'Verify'],
      rows
    );

    if (aggregateMode) {
      return;
    }

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

  function renderRows() {
    const students = visibleStudents();
    const aggregateMode = Boolean(currentSummary?.aggregate);

    const rows = students.map((student) => `
      <tr>
        ${aggregateMode ? `<td>${esc(`${unit} ${student.mi_number} ${String(student.mi_type || '').toUpperCase()}`)}</td>` : ''}
        <td>
          <strong>${esc(student.last_name)}, ${esc(student.first_name)}</strong>
          <small>${esc(student.student_id)}</small>
        </td>
        <td>${esc(student.course || '—')}<small>${esc(student.year_level || '')}</small></td>
        <td>${esc(assignment(student))}</td>
        <td>${student.attendance_time ? fmtTime(student.attendance_time) : '—'}</td>
        <td>${badge(student.attendance_status)}</td>
      </tr>
    `);

    $('#attendanceSummaryContent').innerHTML = table(
      aggregateMode
        ? [`${unit} / Type`, 'Student', 'Course / Year', 'Assignment', 'Time', 'Status']
        : ['Student', 'Course / Year', 'Assignment', 'Time', 'Status'],
      rows
    );
  }

  function renderRows() {
    const students = visibleStudents();
    const aggregateMode = Boolean(currentSummary?.aggregate);

    renderVisibleStats(students);

    const rows = students.map((student) => `
      <tr>
        ${aggregateMode ? `<td>${esc(`${unit} ${student.mi_number} ${String(student.mi_type || '').toUpperCase()}`)}</td>` : ''}
        <td>
          <strong>${esc(student.last_name)}, ${esc(student.first_name)}</strong>
          <small>${esc(student.student_id)}</small>
        </td>
        <td>${esc(student.course || 'â€”')}<small>${esc(student.year_level || '')}</small></td>
        <td>${esc(assignment(student))}</td>
        <td>${student.attendance_time ? fmtTime(student.attendance_time) : 'â€”'}</td>
        <td>${student.distance_meters != null ? `${Math.round(Number(student.distance_meters))}m` : 'â€”'}</td>
        <td>${badge(student.attendance_status)}</td>
        ${aggregateMode
    ? '<td><small>Single-session verify only</small></td>'
    : `
          <td>
            <select class="admin-attendance-status" data-student="${student.id}">
              <option value="present" ${student.attendance_status === 'present' ? 'selected' : ''}>Present</option>
              <option value="late" ${student.attendance_status === 'late' ? 'selected' : ''}>Late</option>
              <option value="absent" ${student.attendance_status === 'absent' ? 'selected' : ''}>Absent</option>
            </select>
          </td>
        `}
      </tr>
    `);

    $('#attendanceSummaryContent').innerHTML = table(
      aggregateMode
        ? [`${unit} / Type`, 'Student', 'Course / Year', 'Assignment', 'Time', 'Distance', 'Status', 'Verify']
        : ['Student', 'Course / Year', 'Assignment', 'Time', 'Distance', 'Status', 'Verify'],
      rows
    );

    if (aggregateMode) {
      return;
    }

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

  function renderRows() {
    const students = visibleStudents();
    const aggregateMode = Boolean(currentSummary?.aggregate);

    renderVisibleStats(students);

    const rows = students.map((student) => `
      <tr>
        ${aggregateMode ? `<td>${esc(`${unit} ${student.mi_number} ${String(student.mi_type || '').toUpperCase()}`)}</td>` : ''}
        <td>
          <strong>${esc(student.last_name)}, ${esc(student.first_name)}</strong>
          <small>${esc(student.student_id)}</small>
        </td>
        <td>${esc(student.course || 'â€”')}<small>${esc(student.year_level || '')}</small></td>
        <td>${esc(assignment(student))}</td>
        <td>${student.attendance_time ? fmtTime(student.attendance_time) : 'â€”'}</td>
        <td>${badge(student.attendance_status)}</td>
      </tr>
    `);

    $('#attendanceSummaryContent').innerHTML = table(
      aggregateMode
        ? [`${unit} / Type`, 'Student', 'Course / Year', 'Assignment', 'Time', 'Status']
        : ['Student', 'Course / Year', 'Assignment', 'Time', 'Status'],
      rows
    );
  }

  function exportMetadata() {
    if (!currentSummary) return null;

    const aggregateMode = Boolean(currentSummary.aggregate);
    const session = currentSummary.session || currentSummary.sessions?.[0] || null;
    if (!session) return null;
    const groupSelect = $('#summaryGroup');
    const battalionSelect = $('#summaryBattalion');
    const effectiveGroupText = battalionSelect && battalionSelect.style.display !== 'none' && battalionSelect.selectedIndex > 0
      ? battalionSelect.options[battalionSelect.selectedIndex].text
      : '';
    const groupText = effectiveGroupText || (groupSelect && groupSelect.selectedIndex >= 0
      ? groupSelect.options[groupSelect.selectedIndex].text
      : 'Overall');

    const statusSelect = $('#summaryStatus');
    const statusText = statusSelect && statusSelect.selectedIndex >= 0
      ? statusSelect.options[statusSelect.selectedIndex].text
      : 'All Status';

    return {
      session,
      sessions: currentSummary.sessions || (session ? [session] : []),
      aggregateMode,
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
      const selectedGroup = effectiveSummaryGroup();
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

  function exportWord() {
    const meta = exportMetadata();
    if (!meta) {
      toast('Select an attendance session first.', true);
      return;
    }

    const { session, students } = meta;
    const selectedGroup = effectiveSummaryGroup();
    const selectedCompany = $('#summaryCompany')?.value || '';
    const selectedPlatoon = $('#summaryPlatoon')?.value || '';

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
      if (student.attendance_status === 'unmarked') return 'Not Yet Marked';
      return String(student.attendance_status || '').replace(/^\w/, (char) => char.toUpperCase());
    }

    function rowHtml(student, index) {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(`${student.last_name || ''}, ${student.first_name || ''} ${student.middle_name || ''}`.trim())}</td>
          <td>${esc(student.student_id || '')}</td>
          <td>${esc(statusText(student))}</td>
          <td>${esc(student.attendance_time ? fmtTime(student.attendance_time) : '—')}</td>
        </tr>
      `;
    }

    function makeSection(heading, subheading, tableTitle, sectionStudents) {
      const stats = summarize(sectionStudents);
      return `
        <div class="word-section">
          <div class="word-heading">${esc(heading)}</div>
          ${subheading ? `<div class="word-subheading">${esc(subheading)}</div>` : ''}
          ${tableTitle ? `<div class="word-table-title">${esc(tableTitle)}</div>` : ''}
          <table class="word-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Name</th>
                <th>ID Number</th>
                <th>Status</th>
                <th>Time In</th>
              </tr>
            </thead>
            <tbody>
              ${sectionStudents.map((student, index) => rowHtml(student, index)).join('')}
            </tbody>
          </table>
          <div class="word-section-summary">
            <span>Total: ${sectionStudents.length}</span>
            <span>Present: ${stats.present || 0}</span>
            <span>Late: ${stats.late || 0}</span>
            <span>Absent: ${stats.absent || 0}</span>
          </div>
        </div>
      `;
    }

    function buildRotcSections() {
      if (selectedGroup === 'advance-course') {
        const sectionStudents = students.slice().sort(compareStudents);
        return sectionStudents.length
          ? [makeSection('ADVANCE COURSE', selectedCompany || '', selectedPlatoon || '', sectionStudents)]
          : [];
      }

      if (selectedGroup === 'special-platoon') {
        const units = selectedPlatoon ? [selectedPlatoon] : ['Medics', 'HQ', 'MP'];
        return units.map((unitName) => {
          const sectionStudents = students
            .filter((student) => String(student.special_unit || '') === unitName)
            .sort(compareStudents);
          return sectionStudents.length
            ? makeSection('SPECIAL PLATOON', unitName.toUpperCase(), '', sectionStudents)
            : '';
        }).filter(Boolean);
      }

      const battalions = selectedGroup === 'battalion-1'
        ? [1]
        : selectedGroup === 'battalion-2'
          ? [2]
          : [1, 2];

      const sections = [];
      battalions.forEach((battalion) => {
        const battalionStudents = students.filter((student) => Number(student.battalion || 0) === battalion);
        const companies = selectedCompany
          ? [selectedCompany]
          : [...new Set(battalionStudents.map((student) => student.rotc_company).filter(Boolean))].sort();

        companies.forEach((company) => {
          const companyStudents = battalionStudents.filter((student) => student.rotc_company === company);
          const platoons = selectedPlatoon
            ? [selectedPlatoon]
            : [...new Set(companyStudents.map((student) => String(student.rotc_platoon || '')).filter(Boolean))].sort((a, b) => Number(a) - Number(b));

          platoons.forEach((platoon) => {
            const sectionStudents = companyStudents
              .filter((student) => String(student.rotc_platoon || '') === String(platoon))
              .sort(compareStudents);

            if (!sectionStudents.length) return;
            sections.push(makeSection(`BATTALION ${battalion}`, `${String(company).toUpperCase()} COMPANY`, `PLATOON ${platoon}`, sectionStudents));
          });
        });
      });

      return sections;
    }

    function buildCwtsSections() {
      if (selectedCompany) {
        const sectionStudents = students
          .filter((student) => student.company === selectedCompany)
          .sort(compareStudents);
        return sectionStudents.length
          ? [makeSection('CWTS', `${String(selectedCompany).toUpperCase()} COMPANY`, `${String(selectedCompany).toUpperCase()} COMPANY`, sectionStudents)]
          : [];
      }

      const companies = [...new Set(students.map((student) => student.company).filter(Boolean))].sort();
      const sections = companies.map((company) => {
        const sectionStudents = students
          .filter((student) => student.company === company)
          .sort(compareStudents);
        return sectionStudents.length
          ? makeSection('CWTS', `${String(company).toUpperCase()} COMPANY`, `${String(company).toUpperCase()} COMPANY`, sectionStudents)
          : '';
      }).filter(Boolean);

      if (sections.length) return sections;

      return students.length
        ? [makeSection('CWTS', 'ATTENDANCE SUMMARY', 'STUDENT LIST', students.slice().sort(compareStudents))]
        : [];
    }

    const totals = summarize(students);
    let sections = program === 'CWTS' ? buildCwtsSections() : buildRotcSections();
    if (!sections.length && students.length) {
      sections = [makeSection(
        program,
        program === 'CWTS' ? 'ATTENDANCE SUMMARY' : meta.groupText.toUpperCase(),
        'STUDENT LIST',
        students.slice().sort(compareStudents),
      )];
    }
    const title = program === 'CWTS'
      ? (selectedCompany ? `CWTS ${String(selectedCompany).toUpperCase()} ATTENDANCE SUMMARY` : 'CWTS OVERALL ATTENDANCE SUMMARY')
      : (selectedGroup === 'overall'
        ? 'ROTC OVERALL ATTENDANCE SUMMARY'
        : `ROTC ${meta.groupText.toUpperCase()} ATTENDANCE SUMMARY`);

    const documentHtml = `
      <!DOCTYPE html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>${esc(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color:#17345f; margin:32px; }
          .word-doc { max-width: 980px; margin: 0 auto; }
          .word-title { text-align:center; font-size: 20px; font-weight:700; color:#183f93; margin-bottom:24px; }
          .word-meta { width:100%; border-collapse:collapse; margin-bottom:18px; }
          .word-meta td { border:1px solid #9aa9bf; padding:6px 8px; font-size:14px; }
          .word-meta .label { background:#dbe8f7; font-weight:700; width:20%; }
          .word-totals { width:100%; border-collapse:collapse; margin-bottom:24px; }
          .word-totals td { border:1px solid #9aa9bf; padding:7px 10px; font-weight:700; text-align:center; font-size:14px; }
          .tone-present { background:#e4f7e8; color:#167a2d; }
          .tone-late { background:#fff4d6; color:#b86d00; }
          .tone-absent { background:#ffe1de; color:#c1281f; }
          .word-section { margin: 18px 0 26px; }
          .word-heading { background:#1f4297; color:#fff; text-align:center; font-weight:700; padding:6px 10px; font-size:16px; margin-bottom:10px; }
          .word-subheading { background:#dbe8f7; color:#1f4297; text-align:center; font-weight:700; padding:6px 10px; font-size:15px; margin-bottom:10px; }
          .word-table-title { display:inline-block; min-width:110px; border:1px solid #9aa9bf; padding:4px 10px; font-weight:700; font-size:14px; margin-bottom:0; }
          .word-table { width:100%; border-collapse:collapse; margin-top:0; }
          .word-table th { background:#1f2937; color:#fff; font-size:12px; padding:5px 6px; text-align:left; border:1px solid #9aa9bf; }
          .word-table td { font-size:12px; padding:5px 6px; border:1px solid #9aa9bf; color:#111827; }
          .word-section-summary { margin-top:8px; display:flex; gap:18px; flex-wrap:wrap; font-size:12px; font-weight:700; color:#334155; }
        </style>
      </head>
      <body>
        <div class="word-doc">
          <div class="word-title">${esc(title)}</div>
          <table class="word-meta">
            <tr>
              <td class="label">${esc(unit)} / Type</td>
              <td>${esc(`${unit} ${session.mi_number} - ${String(session.mi_type || '').toUpperCase()}`)}</td>
              <td class="label">Session Date</td>
              <td>${esc(fmtDate(session.open_date))}</td>
            </tr>
            <tr>
              <td class="label">Time Window</td>
              <td>${esc(`${fmtTime(session.open_date)} - ${fmtTime(session.close_date)}`)}</td>
              <td class="label">NSTP Component</td>
              <td>${esc(program)}</td>
            </tr>
            <tr>
              <td class="label">School Year</td>
              <td>${esc(session.school_year || '')}</td>
              <td class="label">${esc(program === 'CWTS' ? 'CWTS Level' : 'MS Level')}</td>
              <td>${esc(session.ms_level || '')}</td>
            </tr>
          </table>
          <table class="word-totals">
            <tr>
              <td>TOTAL: ${students.length}</td>
              <td class="tone-present">PRESENT: ${totals.present || 0}</td>
              <td class="tone-late">LATE: ${totals.late || 0}</td>
              <td class="tone-absent">ABSENT: ${totals.absent || 0}</td>
            </tr>
          </table>
          ${sections.join('')}
        </div>
      </body>
      </html>
    `;

    const filename = `${safeFilename(program)}-${safeFilename(unit + '-' + session.mi_number)}-${safeFilename(session.mi_type)}-attendance-summary.doc`;
    downloadBlob(new Blob(['\ufeff', documentHtml], { type: 'application/msword;charset=utf-8' }), filename);
    toast('Word attendance report downloaded.');
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

    populateCycleOptions();
    ensureSummaryBattalionSelect();
    syncSummaryRosterFilters();

    $('#summaryCycle').onchange = populateMIOptions;
    $('#summaryMI').onchange = loadSelected;
    $('#summaryType').onchange = loadSelected;
    $('#summaryGroup').onchange = async () => {
      await loadSelected();
      syncSummaryRosterFilters();
      renderRows();
    };
    $('#summarySearch').oninput = renderRows;
    $('#summaryCompany').onchange = () => {
      syncSummaryRosterFilters();
      renderRows();
    };
    const battalionSelect = $('#summaryBattalion');
    if (battalionSelect) {
      battalionSelect.onchange = () => {
        syncSummaryRosterFilters();
        renderRows();
      };
    }
    $('#summaryPlatoon').onchange = renderRows;
    $('#summaryStatus').onchange = renderRows;

    const pdfButton = $('#downloadAttendancePdf');
    const excelButton = $('#downloadAttendanceExcel');
    if (pdfButton) pdfButton.onclick = exportWord;
    if (excelButton) excelButton.onclick = exportExcel;
  }

  return { init };
}
