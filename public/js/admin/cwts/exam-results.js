function cwtsExamIcon(kind = 'document') {
  const paths = {
    document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] || paths.document}</svg>`;
}
function cwtsExamScheduleMarkup(rows) {
  const schedules = rows.filter(row => String(row.ms_level) === '1');
  const hasActive = rows.some(row => ['open','upcoming'].includes(scheduleStatus(row.open_date,row.deadline).key));
  return `<header class="exam-panel-header"><span class="exam-icon-tile">${cwtsExamIcon()}</span><div class="exam-heading"><h3>CWTS 1 Exam Results</h3><p>Upload the list of students who passed or failed the exam.</p></div></header>
    ${schedules.length ? `<div class="exam-schedule-list">${schedules.map(row => {
      const status = scheduleStatus(row.open_date,row.deadline);
      return `<article class="exam-schedule-row"><div><strong>School Year ${esc(row.year)}</strong><small>CWTS 1</small></div><span class="schedule-status ${status.key}"><i></i>${esc(status.label)}</span><button type="button" class="btn exam-primary" data-exam-schedule="${Number(row.id)}">View / Upload Results ${cwtsExamIcon('arrow')}</button></article>`;
    }).join('')}</div>` : `<div class="exam-empty exam-empty-compact"><div><p>${hasActive ? 'There is no CWTS 1 schedule. You can upload results after creating one.' : 'Click Create Schedule above and select CWTS 1. Then upload the exam results here.'}</p></div></div>`}
    <footer class="exam-panel-footer"><span>Students must pass the exam to enroll in CWTS 1. No exam is needed for CWTS 2.</span></footer>`;
}
async function openCwtsExamResults(scheduleId, trigger) {
  const dialog = document.createElement('dialog');
  dialog.className = 'cwts-exam-dialog';
  dialog.setAttribute('aria-label', 'CWTS 1 exam results');
  dialog.innerHTML = '<p role="status">Loading exam results…</p>';
  document.body.append(dialog);
  dialog.showModal();
  let expiryTimer;
  dialog.addEventListener('close', () => { clearInterval(expiryTimer); dialog.remove(); trigger?.focus(); });
  const base = `/api/admin/cwts/enrollment-schedule/${scheduleId}`;
  try {
    const data = await API.get(`${base}/exam-results`);
    if (scheduleStatus(data.schedule.open_date, data.schedule.deadline).key !== 'open') {
      dialog.close();
      toast('CWTS 1 enrollment is closed.', true);
      return;
    }
    expiryTimer = setInterval(() => {
      if (scheduleStatus(data.schedule.open_date, data.schedule.deadline).key !== 'open') dialog.close();
    }, 1000);
    const summary = rows => {
      const passed = rows.filter(row => row.result === 'passed').length;
      return `<div class="exam-count"><span>Students</span><strong>${rows.length}</strong></div><div class="exam-count passed"><span>Passed</span><strong>${passed}</strong></div><div class="exam-count failed"><span>Failed</span><strong>${rows.filter(row => row.result === 'failed').length}</strong></div>`;
    };
    const table = rows => `<div class="exam-table-wrap"><table class="data-table"><thead><tr><th>Student ID</th><th>First Name</th><th>Middle Name</th><th>Last Name</th><th>Sex</th><th>Course</th><th>Result</th></tr></thead><tbody>${rows.map(row => `<tr>${['student_id','first_name','middle_name','last_name','sex','course'].map(key => `<td>${esc(row[key])}</td>`).join('')}<td><span class="exam-result ${row.result === 'passed' ? 'passed' : 'failed'}">${esc(row.result)}</span></td></tr>`).join('') || '<tr><td colspan="7" class="exam-table-empty">No results.</td></tr>'}</tbody></table></div>`;
    dialog.innerHTML = `<div class="app-dialog-head exam-dialog-head"><span class="exam-icon-tile">${cwtsExamIcon()}</span><div><h3>CWTS 1 Exam Results</h3><span class="exam-open-label"><i></i>Enrollment open</span></div><button type="button" class="btn" data-close>Close</button></div><div class="exam-dialog-body">
      <form data-import class="exam-simple-form">
        <div class="field exam-file-field"><div class="exam-field-heading"><label for="examResultsFile">Exam Results File</label><a href="${base}/exam-template">Download Template</a></div><input id="examResultsFile" name="file" type="file" accept=".xlsx,.xls" required></div>
        <div class="app-dialog-actions"><button class="btn primary" type="submit">Preview Results</button></div>
      </form>
      <div class="exam-feedback" data-message role="status" aria-live="polite"></div><div class="exam-preview" data-preview></div>
      <div class="exam-summary" data-exam-summary>${summary(data.rows)}</div>
      <section class="exam-saved-section"><div class="exam-results-toolbar"><h4>Results (${data.rows.length})</h4>
      <label>Course <select data-course><option value="">All courses</option>${data.courses.map(course => `<option value="${esc(course)}">${esc(course)}</option>`).join('')}</select></label></div>
      <div data-saved>${table(data.rows)}</div></section></div>`;
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.querySelector('[data-course]').onchange = event => {
      dialog.querySelector('[data-saved]').innerHTML = table(data.rows.filter(row => !event.target.value || row.course === event.target.value));
    };
    const form = dialog.querySelector('form'), preview = dialog.querySelector('[data-preview]'), message = dialog.querySelector('[data-message]');
    form.file.onchange = () => { preview.innerHTML = ''; message.textContent = ''; };
    form.onsubmit = async event => {
      event.preventDefault();
      const file = form.file.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { message.textContent = 'Maximum Excel file size is 8MB.'; return; }
      const button = form.querySelector('button');
      button.disabled = true; preview.innerHTML = ''; message.textContent = 'Checking file…';
      try {
        const body = new FormData(); body.append('file', file);
        const check = await API.post(`${base}/exam-preview`, body);
        message.textContent = check.errors.length ? 'Please correct the highlighted rows.' : `${check.rows.length} students ready to save.`;
        preview.innerHTML = `${check.errors.length ? `<ul>${check.errors.map(error => `<li>${esc(error)}</li>`).join('')}</ul>` : ''}${table(check.rows)}<button type="button" class="btn success" data-confirm ${check.errors.length ? 'disabled' : ''}>Save Results</button>`;
        preview.querySelector('[data-confirm]').onclick = async event => {
          const confirm = event.currentTarget;
          confirm.disabled = true; button.disabled = true; form.file.disabled = true;
          try {
            const upload = new FormData(); upload.append('file', file); upload.append('revision', check.revision);
            await API.post(`${base}/exam-import`, upload);
            const refreshed = await API.get(`${base}/exam-results`);
            data.rows = refreshed.rows;
            dialog.querySelector('[data-course]').value = '';
            dialog.querySelector('[data-saved]').innerHTML = table(data.rows);
            dialog.querySelector('[data-exam-summary]').innerHTML = summary(data.rows);
            dialog.querySelector('h4').textContent = `Results (${data.rows.length})`;
            preview.innerHTML = ''; form.reset(); message.textContent = 'Results saved.';
          } catch (error) { message.textContent = error.message + ' Preview again before retrying.'; preview.innerHTML = ''; }
          finally { button.disabled = false; form.file.disabled = false; }
        };
      } catch (error) { message.textContent = error.message; }
      finally { button.disabled = false; }
    };
  } catch (error) {
    dialog.innerHTML = `<p>${esc(error.message)}</p><button class="btn">Close</button>`;
    dialog.querySelector('button').onclick = () => dialog.close();
  }
}
