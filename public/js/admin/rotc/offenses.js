function offenseName(row) {
  const middleInitial = row.middle_name
    ? ` ${String(row.middle_name).charAt(0)}.`
    : '';
  const suffix = row.suffix ? ` ${row.suffix}` : '';

  return `${row.last_name || ''}, ${row.first_name || ''}${middleInitial}${suffix}`.trim();
}

function offenseStatus(row) {
  if (Number(row.offend || 0) < 2) {
    return '<span class="muted">-</span>';
  }

  return Number(row.settled)
    ? '<span class="badge success">Settled</span>'
    : '<span class="badge danger">Not Yet Settled</span>';
}

function offenseLevel(row) {
  return Number(row.offend || 0) >= 2
    ? '<span class="badge danger">Not following instructions</span>'
    : '<span class="badge warning">Warning</span>';
}

function offenseTabLabel(label, count, active = false) {
  return `
    <button class="status-tab ${active ? 'active' : ''}" data-filter="${label === 'All' ? '' : label === 'Warning' ? 'warning' : 'settlement'}" title="${label}: ${count}">
      <span>${label}</span>
    </button>
  `;
}

async function renderAdminOffenses(_program, content, auth) {
  const program = 'ROTC';
  const apiProgram = 'rotc';
  const prefix = 'MS';

  shell(
    apiProgram,
    'Attendance Offenses',
    `${program} students with attendance violations.`,
    auth
  );

  const rows = await API.get(`/api/admin/${apiProgram}/offenses`);
  const years = [...new Set(rows.map((row) => row.school_year).filter(Boolean))]
    .sort()
    .reverse();

  content.innerHTML = `
    <section class="page-intro-banner ${program === 'CWTS' ? 'emerald' : 'sky'}">
      <div>
        <div class="page-intro-kicker">${program} ADMIN</div>
        <h2>Attendance Offenses</h2>
        <p>Review warnings and second-offense settlement records created during NSTP Director attendance verification.</p>
      </div>
    </section>
    <section class="summary-grid three" id="offenseStats"></section>
    <section class="panel">
      <div class="offense-filter-row">
        <div class="offense-filter-inputs">
          <select id="offenseLevel">
            <option value="">All ${prefix} Levels</option>
            <option value="1">${prefix} 1</option>
            <option value="2">${prefix} 2</option>
          </select>
          <select id="offenseSY">
            <option value="">All School Years</option>
            ${years.map((year) => `<option value="${esc(year)}">SY ${esc(year)}</option>`).join('')}
          </select>
          <input id="offenseSearch" type="search" placeholder="Search by name, student ID, or course...">
          <button class="clear-filter-btn" id="clearOffenseFilters" type="button">Clear Filters</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Student ID</th>
              <th>Name</th>
              <th>Course</th>
              <th>Offense</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="offenseRows"></tbody>
        </table>
      </div>
      <div class="table-footer" id="offenseFooter"></div>
    </section>
    <div class="app-dialog hidden" id="offenseModal">
      <div class="app-dialog-backdrop"></div>
      <div class="app-dialog-card">
        <div id="offenseModalBody"></div>
      </div>
    </div>
  `;

  let type = '';

  function filtered() {
    const query = $('#offenseSearch').value.trim().toLowerCase();
    const level = $('#offenseLevel').value;
    const schoolYear = $('#offenseSY').value;

    return rows.filter((row) => {
      if (type === 'warning' && Number(row.offend) !== 1) {
        return false;
      }

      if (type === 'settlement' && Number(row.offend) < 2) {
        return false;
      }

      if (level && String(row.ms_level || '') !== level) {
        return false;
      }

      if (schoolYear && String(row.school_year || '') !== schoolYear) {
        return false;
      }

      if (
        query
        && !`${offenseName(row)} ${row.student_no || ''} ${row.course || ''}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }

      return true;
    });
  }

  function draw() {
    const data = filtered();
    const warnings = data.filter((row) => Number(row.offend) === 1).length;
    const settlement = data.filter(
      (row) => Number(row.offend) >= 2 && !Number(row.settled)
    ).length;
    const tabBase = rows.filter((row) => {
      const query = $('#offenseSearch').value.trim().toLowerCase();
      const level = $('#offenseLevel').value;
      const schoolYear = $('#offenseSY').value;

      if (level && String(row.ms_level || '') !== level) {
        return false;
      }

      if (schoolYear && String(row.school_year || '') !== schoolYear) {
        return false;
      }

      if (
        query
        && !`${offenseName(row)} ${row.student_no || ''} ${row.course || ''}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }

      return true;
    });
    const tabCounts = {
      all: tabBase.length,
      warning: tabBase.filter((row) => Number(row.offend) === 1).length,
      settlement: tabBase.filter((row) => Number(row.offend) >= 2).length,
    };

    $('#offenseStats').innerHTML = `
      <div class="stat-card offense-stat-card compact">
        <div class="dash-label">Total Records</div>
        <div class="value">${data.length}</div>
        <div class="stat-note">Filtered results</div>
      </div>
      <div class="stat-card warning offense-stat-card compact">
        <div class="dash-label">Warning</div>
        <div class="value">${warnings}</div>
        <div class="stat-note">First offense</div>
      </div>
      <div class="stat-card danger offense-stat-card compact">
        <div class="dash-label">Need Settlement</div>
        <div class="value">${settlement}</div>
        <div class="stat-note">Second offense</div>
      </div>
    `;

    $('#offenseRows').innerHTML = data.length
      ? data.map((row, index) => `
        <tr class="${Number(row.offend) >= 2 && !Number(row.settled) ? 'offense-row-alert' : ''}">
          <td>${index + 1}</td>
          <td><strong>${esc(row.student_no)}</strong></td>
          <td>
            <strong>${esc(offenseName(row))}</strong><br>
            <span class="muted">${esc(row.year_level || '')}</span>
          </td>
          <td>${esc(row.course || '-')}</td>
          <td>${offenseLevel(row)}</td>
          <td>${offenseStatus(row)}</td>
          <td><button class="btn small" data-view-offense="${row.student_id}">View Detail</button></td>
        </tr>
      `).join('')
      : '<tr><td colspan="7"><div class="empty">No offenses match your filters.</div></td></tr>';

    $('#offenseFooter').textContent = `${data.length} of ${rows.length} record(s) shown`;

    $$('[data-view-offense]').forEach((button) => {
      button.onclick = () => openDetail(Number(button.dataset.viewOffense));
    });
  }

  function openDetail(id) {
    const row = rows.find((item) => Number(item.student_id) === id);

    if (!row) {
      return;
    }

    const modal = $('#offenseModal');
    const body = $('#offenseModalBody');
    const second = Number(row.offend) >= 2;

    body.innerHTML = `
      <div class="offense-detail-card offense-detail-modal">
        <div class="offense-detail-head">
          <div>
            <span class="modal-eyebrow">Attendance Offense Detail</span>
            <h2>${esc(offenseName(row))}</h2>
            <p>${esc(row.student_no)} - ${esc(row.course || '-')} ${esc(row.year_level || '')}</p>
          </div>
          <button class="modal-close" id="offenseClose">x</button>
        </div>
        <div class="offense-detail-body">
          <div class="offense-detail-summary">
            <div class="offense-detail-item ${second ? 'accent-danger' : 'accent-warning'}">
              <small>Offense Level</small>
              <strong>${second ? '2nd Offense - Not following instructions' : '1st Offense - Warning'}</strong>
            </div>
            <div class="offense-detail-item ${second ? (Number(row.settled) ? 'accent-success' : 'accent-danger') : ''}">
              <small>Settlement Status</small>
              <strong>${second ? (Number(row.settled) ? 'Settled' : 'Not Yet Settled') : '-'}</strong>
            </div>
            <div class="offense-detail-item">
              <small>Warning Acknowledged</small>
              <strong>${row.warning_acknowledged_at ? new Date(row.warning_acknowledged_at).toLocaleString() : 'Not yet acknowledged'}</strong>
            </div>
            <div class="offense-detail-item">
              <small>Date Recorded</small>
              <strong>${row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</strong>
            </div>
          </div>
          ${second && !Number(row.settled)
            ? `<div class="warning-banner reject-note"><div><strong>Action Required</strong><span>The student is restricted from normal system use until this second offense is settled.</span></div></div>`
            : ''}
        </div>
        <div class="offense-detail-actions">
          ${second && !Number(row.settled)
            ? '<button class="btn success" id="settleOffense">Mark as Settled</button>'
            : ''}
          <button class="btn" id="offenseCloseBottom">Close</button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    const close = () => modal.classList.add('hidden');

    $('#offenseClose').onclick = close;
    $('#offenseCloseBottom').onclick = close;
    $('.app-dialog-backdrop', modal).onclick = close;

    if ($('#settleOffense')) {
      $('#settleOffense').onclick = async () => {
        try {
          const out = await API.post(`/api/admin/${apiProgram}/offenses`, {
            student_id: row.student_id,
            action: 'settle',
          });

          row.settled = 1;
          toast(out.message);
          close();
          draw();
        } catch (error) {
          toast(error.message, true);
        }
      };
    }
  }

  $('#offenseLevel').onchange = draw;
  $('#offenseSY').onchange = draw;
  $('#offenseSearch').oninput = draw;
  $('#clearOffenseFilters').onclick = () => {
    type = '';
    $('#offenseLevel').value = '';
    $('#offenseSY').value = '';
    $('#offenseSearch').value = '';
    draw();
  };

  draw();
}
