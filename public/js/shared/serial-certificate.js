function serialAssignmentText(student, program) {
  if (program === 'CWTS') {
    return student.company ? `Company ${student.company}` : '-';
  }

  if (Number(student.willing_to_take_advance_course)) {
    return 'Advance Course';
  }

  if (student.special_unit) {
    return student.special_unit;
  }

  return [
    student.battalion ? `Battalion ${student.battalion}` : '',
    student.rotc_company ? `Company ${student.rotc_company}` : '',
    student.rotc_platoon ? `Platoon ${student.rotc_platoon}` : '',
  ].filter(Boolean).join(' - ') || '-';
}

const ROTC_BATTALION_COMPANIES = {
  '1': ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  '2': ['Echo', 'Foxtrot', 'Golf', 'Hotel'],
};

const ROTC_PLATOONS = ['1', '2', '3', '4'];

function serialCourseCode(course) {
  const value = String(course || '').trim();
  const upper = value.toUpperCase();
  const known = {
    'BS INFORMATION TECHNOLOGY': 'BSIT',
    'BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY': 'BSIT',
    BEED: 'BEED',
    'BACHELOR OF ELEMENTARY EDUCATION': 'BEED',
    BSHM: 'BSHM',
    'BS HOSPITALITY MANAGEMENT': 'BSHM',
    'BACHELOR OF SCIENCE IN HOSPITALITY MANAGEMENT': 'BSHM',
    BSED: 'BSED',
    'BACHELOR OF SECONDARY EDUCATION': 'BSED',
    BSA: 'BSA',
    'BACHELOR OF SCIENCE IN ACCOUNTANCY': 'BSA',
    BSBA: 'BSBA',
    'BACHELOR OF SCIENCE IN BUSINESS ADMINISTRATION': 'BSBA',
  };

  if (known[upper]) {
    return known[upper];
  }

  const letters = upper.match(/\b[A-Z]/g);
  return letters && letters.length >= 2 ? letters.join('') : value;
}

function hasSettingValue(value) {
  return String(value || '').trim().length > 0;
}

function certSettingsComplete(settings, program) {
  return program === 'rotc'
    ? Boolean(
      hasSettingValue(settings.academic_year)
      && hasSettingValue(settings.ceremony_date)
      && hasSettingValue(settings.commandant || settings.signatory_1_name)
      && hasSettingValue(settings.school_registrar || settings.signatory_2_name)
    )
    : Boolean(
      hasSettingValue(settings.academic_year)
      && hasSettingValue(settings.ceremony_date)
      && hasSettingValue(settings.nstp_coordinator || settings.signatory_1_name)
      && hasSettingValue(settings.bcc_president || settings.signatory_2_name)
      && hasSettingValue(settings.municipal_mayor || settings.signatory_3_name)
    );
}

async function imageData(file) {
  if (!file) {
    return null;
  }

  if (file.size > 1024 * 1024) {
    throw new Error('Signature image must be 1 MB or smaller.');
  }

  return fileAsDataUrl(file);
}

async function renderAdminSerial(content, program) {
  const programLabel = program.toUpperCase();
  let rows = await API.get(`/api/admin/${program}/serial-numbers`);
  let settings = await API.get(`/api/admin/${program}/certificate-settings`);
  let importReport = null;
  let state = {
    q: '',
    elig: 'All',
    level: '',
    sy: '',
    battalion: '',
    company: '',
    platoon: '',
    special: '',
    cwtsCompany: '',
  };

  const scheduleSY = (row) => {
    const value = row.ms2_schedule || row.ms1_schedule || '';
    const parts = value.split('_');
    return parts.length >= 3 ? parts.slice(2).join('_') : '';
  };

  const years = [...new Set(rows.map(scheduleSY).filter(Boolean))]
    .sort()
    .reverse();

  window.__openSerialCertificateSettings = () => {
    openSettings();
  };
  window.__openSerialBulkImport = () => {
    openImport();
  };

  function isAdvanceRow(row) {
    return Number(row.willing_to_take_advance_course) === 1;
  }

  function isSpecialUnitRow(row) {
    return Boolean(row.special_unit) || isAdvanceRow(row);
  }

  function filtered() {
    return rows.filter((row) => {
      const query = state.q.toLowerCase();

      if (
        query
        && !`${row.student_no} ${row.first_name} ${row.last_name} ${row.course}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }

      if (state.elig === 'Eligible' && (!row.eligible || row.serial_number)) {
        return false;
      }

      if (state.elig === 'Not Eligible' && row.eligible) {
        return false;
      }

      if (state.elig === 'Assigned' && !row.serial_number) {
        return false;
      }

      if (state.sy && scheduleSY(row) !== state.sy) {
        return false;
      }

      if (state.level === '1' && !row.ms1_schedule) {
        return false;
      }

      if (state.level === '2' && !row.ms2_schedule) {
        return false;
      }

      if (program === 'rotc' && state.special) {
        if (state.special === 'Advance Course' && !isAdvanceRow(row)) {
          return false;
        }

        if (state.special !== 'Advance Course' && String(row.special_unit || '') !== state.special) {
          return false;
        }
      } else if (program === 'rotc') {
        if (state.battalion && String(row.battalion || '') !== state.battalion) {
          return false;
        }

        if (state.company && String(row.rotc_company || '') !== state.company) {
          return false;
        }

        if (state.platoon) {
          const platoonValue = String(row.rotc_platoon || row.platoon || '');
          if (platoonValue !== state.platoon) {
            return false;
          }
        }
      }

      if (program === 'cwts' && state.cwtsCompany && String(row.company || '') !== state.cwtsCompany) {
        return false;
      }

      return true;
    });
  }

  function uniqueSorted(values, mode = 'text') {
    const list = [...new Set(values.filter(Boolean).map((value) => String(value)))];
    return list.sort((left, right) => {
      if (mode === 'number') {
        const leftNum = Number(left);
        const rightNum = Number(right);
        if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
          return leftNum - rightNum;
        }
      }
      return String(left).localeCompare(String(right));
    });
  }

  function matchingRows(overrides = {}) {
    const nextState = { ...state, ...overrides };

    return rows.filter((row) => {
      if (program === 'rotc' && nextState.special) {
        if (nextState.special === 'Advance Course' && !isAdvanceRow(row)) {
          return false;
        }

        if (nextState.special !== 'Advance Course' && String(row.special_unit || '') !== nextState.special) {
          return false;
        }
      } else if (program === 'rotc') {
        if (isSpecialUnitRow(row)) {
          return false;
        }

        if (nextState.battalion && String(row.battalion || '') !== nextState.battalion) {
          return false;
        }

        if (nextState.company && String(row.rotc_company || '') !== nextState.company) {
          return false;
        }

        if (nextState.platoon) {
          const platoonValue = String(row.rotc_platoon || row.platoon || '');
          if (platoonValue !== nextState.platoon) {
            return false;
          }
        }
      }

      if (program === 'cwts' && nextState.cwtsCompany && String(row.company || '') !== nextState.cwtsCompany) {
        return false;
      }

      return true;
    });
  }

  function filterOptions() {
    const regularRotcRows = rows.filter((row) => !isSpecialUnitRow(row));
    const storedBattalions = uniqueSorted(regularRotcRows.map((row) => row.battalion), 'number');
    const battalions = uniqueSorted([
      ...storedBattalions,
      ...Object.keys(ROTC_BATTALION_COMPANIES),
    ], 'number');
    let rotcCompanies = [];
    let rotcPlatoons = [];

    if (program === 'rotc') {
      if (state.special) {
        rotcCompanies = [];
        rotcPlatoons = [];
      } else {
        const battalionCompanies = state.battalion
          ? (ROTC_BATTALION_COMPANIES[state.battalion] || [])
          : uniqueSorted(Object.values(ROTC_BATTALION_COMPANIES).flat());

        const dataCompanies = uniqueSorted(
          matchingRows({ company: '', platoon: '' }).map((row) => row.rotc_company)
        );

        rotcCompanies = uniqueSorted([...battalionCompanies, ...dataCompanies]);

        const dataPlatoons = uniqueSorted(
          matchingRows({ platoon: '' }).map((row) => row.rotc_platoon || row.platoon),
          'number'
        );

        rotcPlatoons = uniqueSorted([...ROTC_PLATOONS, ...dataPlatoons], 'number');
      }
    }

    const cwtsCompanies = uniqueSorted(rows.map((row) => row.company));

    return {
      battalions,
      rotcCompanies,
      rotcPlatoons,
      cwtsCompanies,
    };
  }

  function syncFilterState() {
    const options = filterOptions();

    if (program === 'rotc') {
      if (state.battalion && !options.battalions.includes(state.battalion)) {
        state.battalion = '';
      }

      if (state.company && !options.rotcCompanies.includes(state.company)) {
        state.company = '';
      }

      if (state.platoon && !options.rotcPlatoons.includes(state.platoon)) {
        state.platoon = '';
      }
    }

    if (program === 'cwts' && state.cwtsCompany && !options.cwtsCompanies.includes(state.cwtsCompany)) {
      state.cwtsCompany = '';
    }

    return options;
  }

  function draw() {
    const options = syncFilterState();
    const list = filtered();
    const assigned = list.filter((row) => row.serial_number).length;
    const eligible = list.filter((row) => row.eligible && !row.serial_number).length;
    const notEligible = list.filter((row) => !row.eligible).length;

    content.innerHTML = `
      <div class="page-intro-banner ${program === 'cwts' ? 'emerald' : 'sky'}">
        <div>
          <div class="page-intro-kicker">${programLabel} ADMIN</div>
          <h2>Serial Number & Certificate Generation</h2>
          <p>Assign serial numbers to students who completed NSTP 1 and NSTP 2 grades, then make their certificate available for download.</p>
        </div>
        <div class="serial-banner-actions">
          <button class="btn" id="serialImportBtn" type="button" onclick="window.__openSerialBulkImport()">Upload Excel</button>
          <button class="btn primary" id="certSettingsBtn" type="button" onclick="window.__openSerialCertificateSettings()">Certificate Settings</button>
        </div>
      </div>
      ${!certSettingsComplete(settings, program)
        ? '<div class="notice warning">Complete Certificate Settings before assigning serial numbers.</div>'
        : ''}
      ${importReport
        ? `
          <div class="panel serial-import-report">
            <div class="serial-import-head">
              <div>
                <h3>Latest Bulk Import</h3>
                <p>${esc(importReport.message || 'Bulk import finished.')}</p>
              </div>
              <button class="btn small" type="button" id="clearImportReport">Clear</button>
            </div>
            <div class="serial-import-stats">
              <div class="stat-card"><div class="dash-label">Rows</div><div class="value">${Number(importReport.summary?.total || 0)}</div></div>
              <div class="stat-card"><div class="dash-label">Assigned</div><div class="value">${Number(importReport.summary?.assigned || 0)}</div></div>
              <div class="stat-card"><div class="dash-label">Skipped</div><div class="value">${Number(importReport.summary?.skipped || 0)}</div></div>
            </div>
            ${table(
              ['Excel Row', 'Student ID', 'Student', 'Serial Number', 'Status'],
              (importReport.results || []).map((row) => `
                <tr>
                  <td>${esc(row.excel_row)}</td>
                  <td>${esc(row.student_id || '-')}</td>
                  <td>${esc(row.student_name || '-')}</td>
                  <td>${esc(row.serial_number || '-')}</td>
                  <td>${row.status === 'assigned' ? badge('Assigned') : badge('Skipped')}<div class="serial-muted-note">${esc(row.message || '')}</div></td>
                </tr>
              `)
            )}
          </div>
        `
        : ''}
      <div class="stats-grid">
        <div class="stat-card"><div class="dash-label">Assigned</div><div class="value">${assigned}</div></div>
        <div class="stat-card"><div class="dash-label">Eligible</div><div class="value">${eligible}</div></div>
        <div class="stat-card"><div class="dash-label">Not Eligible</div><div class="value">${notEligible}</div></div>
        <div class="stat-card"><div class="dash-label">Students</div><div class="value">${list.length}</div></div>
      </div>
      <div class="panel">
        <div class="serial-toolbar">
          <div class="search-box">
            <input id="serialSearch" placeholder="Search Student ID, name, or course" value="${esc(state.q)}">
          </div>
          <select id="serialElig">
            <option>All</option>
            <option>Eligible</option>
            <option>Not Eligible</option>
            <option>Assigned</option>
          </select>
          <select id="serialLevel">
            <option value="">All Levels</option>
            <option value="1">${program === 'cwts' ? 'CWTS' : 'MS'} 1</option>
            <option value="2">${program === 'cwts' ? 'CWTS' : 'MS'} 2</option>
          </select>
          <select id="serialSY">
            <option value="">All School Years</option>
            ${years.map((year) => `<option>${esc(year)}</option>`).join('')}
          </select>
          ${program === 'rotc'
            ? `<select id="serialBattalion">
                <option value="">All Battalions</option>
                ${options.battalions.map((value) => `<option value="${esc(value)}">Battalion ${esc(value)}</option>`).join('')}
              </select>
              <select id="serialCompany">
                <option value="">All Companies</option>
                ${options.rotcCompanies.map((value) => `<option value="${esc(value)}">Company ${esc(value)}</option>`).join('')}
              </select>
              <select id="serialPlatoon">
                <option value="">All Platoons</option>
                ${options.rotcPlatoons.map((value) => `<option value="${esc(value)}">Platoon ${esc(value)}</option>`).join('')}
              </select>
              <select id="serialSpecial">
                <option value="">All Special Assignments</option>
                <option value="Advance Course">Advance Course</option>
                <option value="HQ">HQ</option>
                <option value="Medics">Medics</option>
                <option value="MP">MP</option>
              </select>`
            : `<select id="serialCwtsCompany">
                <option value="">All Companies</option>
                ${options.cwtsCompanies.map((value) => `<option value="${esc(value)}">Company ${esc(value)}</option>`).join('')}
              </select>`}
        </div>
        ${table(
          ['Student', 'Course / Year', 'Assignment', 'MS 1 Grade', 'MS 2 Grade', 'Eligibility', 'Serial Number', 'Date Assigned'],
          list.map((row) => `
            <tr>
              <td class="serial-student-cell"><strong>${esc(row.student_no)}</strong><br>${esc(`${row.last_name}, ${row.first_name}`)}</td>
              <td><strong class="serial-course-code">${esc(serialCourseCode(row.course))}</strong><br><span class="muted">${esc(row.year_level || '')}</span></td>
              <td>${esc(serialAssignmentText(row, programLabel))}</td>
              <td class="serial-grade-cell">${row.ms1_grade ? Number(row.ms1_grade).toFixed(2) : '-'}<br>${row.ms1_status ? badge(row.ms1_status) : ''}</td>
              <td class="serial-grade-cell">${row.ms2_grade ? Number(row.ms2_grade).toFixed(2) : '-'}<br>${row.ms2_status ? badge(row.ms2_status) : ''}</td>
              <td class="serial-eligibility-cell">
                ${row.serial_number ? badge('Assigned') : row.eligible ? badge('Eligible') : badge('Grades Incomplete')}
                ${!row.serial_number && !row.eligible ? '<div class="serial-muted-note">Complete grades first</div>' : ''}
              </td>
              <td class="serial-number-cell">
                ${row.serial_number
                  ? `<strong class="serial-code">${esc(row.serial_number)}</strong><div class="serial-actions-inline"><a class="btn small" href="/api/admin/${program}/certificates/${row.student_id}" target="_blank">Download Certificate</a></div>`
                  : row.eligible
                    ? `<div class="serial-actions-inline"><button class="btn small primary assignSerialBtn" data-id="${row.student_id}" data-name="${esc(`${row.first_name} ${row.last_name}`)}">Assign Serial</button></div>`
                    : '-'}
              </td>
              <td>${row.serial_created_at ? new Date(row.serial_created_at).toLocaleString() : '-'}</td>
            </tr>
          `)
        )}
      </div>
      <div id="serialModalHost"></div>
    `;

    $('#serialElig').value = state.elig;
    $('#serialLevel').value = state.level;
    $('#serialSY').value = state.sy;

    if ($('#serialBattalion')) {
      $('#serialBattalion').value = state.battalion;
    }

    if ($('#serialCompany')) {
      $('#serialCompany').value = state.company;
    }

    if ($('#serialPlatoon')) {
      $('#serialPlatoon').value = state.platoon;
    }

    if ($('#serialSpecial')) {
      $('#serialSpecial').value = state.special;
    }

    if ($('#serialCwtsCompany')) {
      $('#serialCwtsCompany').value = state.cwtsCompany;
    }

    $('#serialSearch').oninput = (event) => {
      state.q = event.target.value;
      draw();
    };
    $('#serialElig').onchange = (event) => {
      state.elig = event.target.value;
      draw();
    };
    $('#serialLevel').onchange = (event) => {
      state.level = event.target.value;
      draw();
    };
    $('#serialSY').onchange = (event) => {
      state.sy = event.target.value;
      draw();
    };

    if ($('#serialBattalion')) {
      $('#serialBattalion').onchange = (event) => {
        state.battalion = event.target.value;
        state.company = '';
        state.platoon = '';
        if (state.battalion) {
          state.special = '';
        }
        draw();
      };
    }

    if ($('#serialCompany')) {
      $('#serialCompany').onchange = (event) => {
        state.company = event.target.value;
        state.platoon = '';
        if (state.company) {
          state.special = '';
        }
        draw();
      };
    }

    if ($('#serialPlatoon')) {
      $('#serialPlatoon').onchange = (event) => {
        state.platoon = event.target.value;
        if (state.platoon) {
          state.special = '';
        }
        draw();
      };
    }

    if ($('#serialSpecial')) {
      $('#serialSpecial').onchange = (event) => {
        state.special = event.target.value;
        if (state.special) {
          state.battalion = '';
          state.company = '';
          state.platoon = '';
        }
        draw();
      };
    }

    if ($('#serialCwtsCompany')) {
      $('#serialCwtsCompany').onchange = (event) => {
        state.cwtsCompany = event.target.value;
        draw();
      };
    }

    $$('.assignSerialBtn').forEach((button) => {
      button.onclick = () => openAssign(button.dataset.id, button.dataset.name);
    });

    if ($('#clearImportReport')) {
      $('#clearImportReport').onclick = () => {
        importReport = null;
        draw();
      };
    }
  }

  function openAssign(id, name) {
    if (!certSettingsComplete(settings, program)) {
      return toast('Complete Certificate Settings first.', true);
    }

    $('#serialModalHost').innerHTML = `
      <div class="app-dialog">
        <div class="app-dialog-backdrop" data-close></div>
        <section class="app-dialog-card settings-modal">
          <div class="app-dialog-head">
            <div>
              <h3>Assign Serial Number</h3>
              <p>${esc(name)}</p>
            </div>
            <button class="modal-close" type="button" data-close>x</button>
          </div>
          <div class="record-modal-scroll">
            <div class="field">
              <label>Official Serial Number</label>
              <input id="serialInput" placeholder="NSTP-2026-0001" autocomplete="off">
            </div>
            <div class="certificate-settings-summary">
              <strong>Certificate Settings</strong>
              <p>A.Y.: ${esc(settings.academic_year || '-')} - Date: ${esc(settings.ceremony_date || '-')}</p>
            </div>
          </div>
          <div class="app-dialog-actions">
            <button class="btn" data-close>Cancel</button>
            <button class="btn primary" id="saveSerialBtn">Assign & Generate Certificate</button>
          </div>
        </section>
      </div>
    `;

    $$('[data-close]').forEach((node) => {
      node.onclick = () => {
        $('#serialModalHost').innerHTML = '';
      };
    });

    $('#saveSerialBtn').onclick = async () => {
      const value = $('#serialInput').value.trim();

      if (!value) {
        return toast('Enter the serial number.', true);
      }

      try {
        const result = await API.post(`/api/admin/${program}/serial-numbers`, {
          student_id: Number(id),
          serial_number: value,
        });

        toast(result.message);
        rows = await API.get(`/api/admin/${program}/serial-numbers`);
        $('#serialModalHost').innerHTML = '';
        draw();
      } catch (error) {
        toast(error.message, true);
      }
    };
  }

  async function openSettings() {
    const isRotc = program === 'rotc';

    try {
      settings = await API.get(`/api/admin/${program}/certificate-settings`);
    } catch (error) {
      toast(error.message || 'Unable to load certificate settings.', true);
      return;
    }

    $('#serialModalHost').innerHTML = `
      <div class="app-dialog">
        <div class="app-dialog-backdrop" data-close></div>
        <section class="app-dialog-card settings-modal">
          <div class="app-dialog-head">
            <div>
              <h3>Certificate Settings</h3>
              <p>Configure signatories, date, and A.Y. for ${programLabel} certificates.</p>
            </div>
            <button class="modal-close" type="button" data-close>x</button>
          </div>
          <form id="certificateSettingsForm">
            <div class="record-modal-scroll form-grid">
              <div class="field">
                <label>Academic Year (A.Y.)</label>
                <input name="academic_year" value="${esc(settings.academic_year || '')}" placeholder="2026-2027" required>
              </div>
              <div class="field">
                <label>Ceremony / Issuance Date</label>
                <input type="date" name="ceremony_date" value="${esc(settings.ceremony_date || '')}" required>
              </div>
              ${isRotc
                ? `
                  <div class="field">
                    <label>Commandant</label>
                    <input name="commandant" value="${esc(settings.commandant || '')}" required>
                  </div>
                  <div class="field">
                    <label>Commandant Signature</label>
                    <input type="file" id="commandantSig" accept="image/*">
                  </div>
                  <div class="field">
                    <label>School Registrar</label>
                    <input name="school_registrar" value="${esc(settings.school_registrar || '')}" required>
                  </div>
                  <div class="field">
                    <label>Registrar Signature</label>
                    <input type="file" id="registrarSig" accept="image/*">
                  </div>
                `
                : `
                  <div class="field">
                    <label>NSTP Coordinator</label>
                    <input name="nstp_coordinator" value="${esc(settings.nstp_coordinator || '')}" required>
                  </div>
                  <div class="field">
                    <label>Coordinator Signature</label>
                    <input type="file" id="coordinatorSig" accept="image/*">
                  </div>
                  <div class="field">
                    <label>BCC President</label>
                    <input name="bcc_president" value="${esc(settings.bcc_president || '')}" required>
                  </div>
                  <div class="field">
                    <label>President Signature</label>
                    <input type="file" id="presidentSig" accept="image/*">
                  </div>
                  <div class="field">
                    <label>Municipal Mayor</label>
                    <input name="municipal_mayor" value="${esc(settings.municipal_mayor || '')}" required>
                  </div>
                  <div class="field">
                    <label>Mayor Signature</label>
                    <input type="file" id="mayorSig" accept="image/*">
                  </div>
                `}
              <div class="field full-span">
                <label>Saved Signatures</label>
                <div class="certificate-settings-summary">
                  <strong>Current certificate data</strong>
                  <p>
                    ${
                      isRotc
                        ? `Commandant signature: ${settings.commandant_signature ? 'Saved' : 'Not yet uploaded'}<br>
                           Registrar signature: ${settings.school_registrar_signature ? 'Saved' : 'Not yet uploaded'}`
                        : `Coordinator signature: ${settings.nstp_coordinator_signature ? 'Saved' : 'Not yet uploaded'}<br>
                           President signature: ${settings.bcc_president_signature ? 'Saved' : 'Not yet uploaded'}<br>
                           Mayor signature: ${settings.municipal_mayor_signature ? 'Saved' : 'Not yet uploaded'}`
                    }
                  </p>
                  <p>Leave file inputs empty to keep the current saved signatures.</p>
                </div>
              </div>
            </div>
            <div class="app-dialog-actions">
              <button type="button" class="btn" data-close>Cancel</button>
              <button type="button" class="btn primary" id="saveCertificateSettingsBtn">Save Certificate Settings</button>
            </div>
          </form>
        </section>
      </div>
    `;

    $$('[data-close]').forEach((node) => {
      node.onclick = () => {
        $('#serialModalHost').innerHTML = '';
      };
    });

    const saveSettings = async () => {
      const form = $('#certificateSettingsForm');
      const body = formToObject(form);
      const submitButton = $('#saveCertificateSettingsBtn');

      try {
        submitButton.disabled = true;
        submitButton.textContent = 'Saving...';

        if (isRotc) {
          body.commandant_signature = await imageData($('#commandantSig').files[0]);
          body.school_registrar_signature = await imageData($('#registrarSig').files[0]);
        } else {
          body.nstp_coordinator_signature = await imageData($('#coordinatorSig').files[0]);
          body.bcc_president_signature = await imageData($('#presidentSig').files[0]);
          body.municipal_mayor_signature = await imageData($('#mayorSig').files[0]);
        }

        const result = await API.post(`/api/admin/${program}/certificate-settings`, body);
        settings = result.settings;
        toast(result.message);
        $('#serialModalHost').innerHTML = '';
        draw();
      } catch (error) {
        toast(error.message, true);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Save Certificate Settings';
        }
      }
    };

    $('#saveCertificateSettingsBtn').onclick = saveSettings;
    $('#certificateSettingsForm').onsubmit = async (event) => {
      event.preventDefault();
      await saveSettings();
    };
  }

  function openImport() {
    if (!certSettingsComplete(settings, program)) {
      return toast('Complete Certificate Settings first.', true);
    }

    $('#serialModalHost').innerHTML = `
      <div class="app-dialog">
        <div class="app-dialog-backdrop" data-close></div>
        <section class="app-dialog-card settings-modal">
          <div class="app-dialog-head">
            <div>
              <h3>Bulk Upload Serial Numbers</h3>
              <p>Upload your official Excel sheet and the system will assign certificates only to eligible students.</p>
            </div>
            <button class="modal-close" type="button" data-close>x</button>
          </div>
          <div class="record-modal-scroll">
            <div class="field">
              <label>Excel File</label>
              <input id="serialImportFile" type="file" accept=".xlsx,.xls" />
            </div>
            <div class="certificate-settings-summary">
              <strong>Expected columns</strong>
              <p>Include at least <code>Serial Number</code> and <code>ID No.</code>. The importer also recognizes Surname, First Name, Middle Name, Course, Platoon, Birthdate, Sex, Barangay, and Present Address.</p>
              <p>Students with incomplete grades, failed eligibility, duplicate serial numbers, or mismatched names will be skipped automatically.</p>
            </div>
          </div>
          <div class="app-dialog-actions">
            <button class="btn" type="button" data-close>Cancel</button>
            <button class="btn primary" type="button" id="uploadSerialSheetBtn">Upload and Assign</button>
          </div>
        </section>
      </div>
    `;

    $$('[data-close]').forEach((node) => {
      node.onclick = () => {
        $('#serialModalHost').innerHTML = '';
      };
    });

    $('#uploadSerialSheetBtn').onclick = async () => {
      const button = $('#uploadSerialSheetBtn');
      const file = $('#serialImportFile')?.files?.[0];

      if (!file) {
        return toast('Choose an Excel file first.', true);
      }

      const body = new FormData();
      body.append('file', file);

      try {
        button.disabled = true;
        button.textContent = 'Uploading...';
        const result = await API.post(`/api/admin/${program}/serial-numbers/import`, body);
        importReport = result;
        rows = await API.get(`/api/admin/${program}/serial-numbers`);
        $('#serialModalHost').innerHTML = '';
        toast(result.message || 'Bulk import completed.');
        draw();
      } catch (error) {
        toast(error.message, true);
      } finally {
        if ($('#uploadSerialSheetBtn')) {
          $('#uploadSerialSheetBtn').disabled = false;
          $('#uploadSerialSheetBtn').textContent = 'Upload and Assign';
        }
      }
    };
  }

  draw();
}

async function renderStudentSerial(content) {
  const rows = await API.get('/api/student/serial-number');
  const serial = rows[0] || null;

  if (!serial) {
    content.innerHTML = `
      <div class="panel serial-empty">
        <div class="empty-icon">${icon('serial')}</div>
        <h2>Certificate is not yet available</h2>
        <p>Your ROTC/CWTS Admin must complete your certificate requirements and assign your official serial number first.</p>
      </div>
    `;
    return;
  }

  const profile = await API.get('/api/student/profile');
  const student = profile.student || {};

  content.innerHTML = `
    <div class="page-intro-banner sky">
      <div>
        <div class="page-intro-kicker">NSTP COMPLETION</div>
        <h2>Serial Number & Certificate</h2>
        <p>Your official NSTP completion certificate is available.</p>
      </div>
    </div>
    <div class="serial-student-card">
      <div class="serial-ribbon">CERTIFICATE AVAILABLE</div>
      <img src="/assets/images/bcclogo-removebg-preview.png" alt="BCC logo">
      <div>
        <span>Official Serial Number</span>
        <strong>${esc(serial.serial_number)}</strong>
        <p>${esc(student.nstp_component || '')} - ${esc([student.first_name, student.last_name].filter(Boolean).join(' ') || 'Student')}</p>
        <small>Issued ${new Date(serial.created_at).toLocaleDateString()}</small>
      </div>
    </div>
    <div class="actions serial-download-actions">
      <a class="btn primary" href="/api/student/certificate" target="_blank">Download Certificate PDF</a>
    </div>
  `;
}
