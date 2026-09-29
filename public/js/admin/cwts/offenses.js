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
  const program = 'CWTS';
  const apiProgram = 'cwts';
  const prefix = 'CWTS';

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
      <div class="app-dialog-card offense-detail-dialog">
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
    const settled = Number(row.settled) === 1;
    const acknowledged = Boolean(row.warning_acknowledged_at);
    const recordedAt = row.created_at ? new Date(row.created_at).toLocaleString() : 'Not available';
    const updatedAt = row.updated_at ? new Date(row.updated_at).toLocaleString() : recordedAt;
    const accessLabel = second ? (settled ? 'Access Restored' : 'Access Restricted') : 'Access Allowed';
    const accessTone = second ? (settled ? 'accent-success' : 'accent-danger') : 'accent-info';

    body.innerHTML = `
      <div class="offense-detail-card offense-detail-modal">
        <div class="offense-detail-head">
          <div>
            <span class="modal-eyebrow">Attendance Offense Detail</span>
            <h2>${esc(offenseName(row))}</h2>
            <p>${esc(row.student_no)} &bull; ${esc(row.course || '-')} &bull; ${esc(row.year_level || 'Year level not available')}</p>
            <div class="offense-detail-tags">
              <span>${program}</span>
              <span>${prefix} ${esc(row.ms_level || '-')}</span>
              <span>${row.school_year ? `SY ${esc(row.school_year)}` : 'School year unavailable'}</span>
            </div>
          </div>
          <button class="modal-close" id="offenseClose" type="button" aria-label="Close offense detail">&times;</button>
        </div>
        <div class="offense-detail-body">
          <div class="offense-rule-banner ${second ? (settled ? 'resolved' : 'restricted') : 'warning'}">
            <span>${second ? 'SECOND OFFENSE' : 'FIRST OFFENSE'}</span>
            <div>
              <strong>${second ? (settled ? 'Settlement completed' : 'Administrative settlement required') : 'Student warning issued'}</strong>
              <p>${second
                ? (settled
                  ? 'The offense has been settled and the student may use the system normally.'
                  : 'The student is restricted from normal system use until an administrator marks this offense as settled.')
                : (acknowledged
                  ? 'The student acknowledged the warning. No administrative settlement is required.'
                  : 'The student must acknowledge this warning. No administrative settlement is required.')}</p>
            </div>
          </div>
          <div class="offense-detail-summary">
            <div class="offense-detail-item ${second ? 'accent-danger' : 'accent-warning'}">
              <small>Offense Level</small>
              <strong>${second ? '2nd Offense' : '1st Offense'}</strong>
              <span>${second ? 'Not following attendance instructions' : 'Formal attendance warning'}</span>
            </div>
            <div class="offense-detail-item ${accessTone}">
              <small>Student Account Access</small>
              <strong>${accessLabel}</strong>
              <span>${second && !settled ? 'Blocked until settlement' : 'Normal system access'}</span>
            </div>
            <div class="offense-detail-item ${acknowledged ? 'accent-success' : 'accent-warning'}">
              <small>Warning Acknowledgement</small>
              <strong>${acknowledged ? 'Acknowledged' : 'Awaiting Student'}</strong>
              <span>${acknowledged ? new Date(row.warning_acknowledged_at).toLocaleString() : 'No acknowledgement recorded'}</span>
            </div>
            <div class="offense-detail-item ${second ? (settled ? 'accent-success' : 'accent-danger') : 'accent-info'}">
              <small>Settlement Requirement</small>
              <strong>${second ? (settled ? 'Settled' : 'Action Required') : 'Not Required'}</strong>
              <span>${second ? (settled ? `Updated ${updatedAt}` : 'Administrator action needed') : 'First offense only'}</span>
            </div>
            <div class="offense-detail-item">
              <small>Record Created</small>
              <strong>${recordedAt}</strong>
              <span>Initial offense record</span>
            </div>
            <div class="offense-detail-item">
              <small>Last Updated</small>
              <strong>${updatedAt}</strong>
              <span>Latest offense activity</span>
            </div>
          </div>
        </div>
        <div class="offense-detail-actions">
          ${second && !settled
            ? '<button class="btn success" id="settleOffense" type="button">Confirm Settlement</button>'
            : ''}
          <button class="btn" id="offenseCloseBottom" type="button">Close</button>
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
        if (!window.confirm(`Confirm that ${offenseName(row)} has completed the required attendance-offense settlement?`)) {
          return;
        }

        const settleButton = $('#settleOffense');
        settleButton.disabled = true;
        settleButton.textContent = 'Saving Settlement...';

        try {
          const out = await API.post(`/api/admin/${apiProgram}/offenses`, {
            student_id: row.student_id,
            action: 'settle',
          });

          row.settled = 1;
          row.updated_at = out.offense?.updated_at || new Date().toISOString();
          toast(out.message);
          draw();
          openDetail(id);
        } catch (error) {
          toast(error.message, true);
          settleButton.disabled = false;
          settleButton.textContent = 'Confirm Settlement';
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
