document.addEventListener('DOMContentLoaded', () => bootstrapPortalPage({
  expectedPortal: 'student',
  shellRole: 'student',
  moduleSrc: '/assets/js/student/_pages.js',
  render: async (content) => {
    const [rows, dashboard] = await Promise.all([
      API.get('/api/student/grades'),
      API.get('/api/student/dashboard'),
    ]);

    const program = dashboard.student?.nstp_component || '-';
    const description = program === 'CWTS'
      ? 'Civic Welfare Training Service'
      : 'National Service Training Program';

    const grades = new Map((rows || []).map((grade) => [String(grade.ms_level), grade]));
    const ms1 = grades.get('1');
    const ms2 = grades.get('2');

    if (!ms1 && !ms2) {
      content.innerHTML = `
        <div class="panel student-grade-empty">
          <div class="empty-icon">${icon('grades')}</div>
          <h3>No grades released yet</h3>
          <p>Your grades will appear here once released by your administrator.</p>
        </div>
      `;
      return;
    }

    const rowTemplate = (label, grade) => `
      <tr>
        <td><strong>${label}</strong></td>
        <td>${esc(description)}</td>
        <td class="center">${grade?.midterm != null ? Number(grade.midterm).toFixed(2) : '-'}</td>
        <td class="center">${grade?.final_term != null ? Number(grade.final_term).toFixed(2) : '-'}</td>
        <td class="center"><strong>${grade?.grade != null ? Number(grade.grade).toFixed(2) : '-'}</strong></td>
        <td class="center">3</td>
        <td class="center">${grade ? badge(grade.status) : '-'}</td>
      </tr>
    `;

    content.innerHTML = `
      <section class="panel student-grade-panel">
        <div class="table-wrap">
          <table class="data-table student-grade-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Description</th>
                <th>Midterm</th>
                <th>Final Term</th>
                <th>Average</th>
                <th>Unit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowTemplate('NSTP 1', ms1)}
              ${rowTemplate('NSTP 2', ms2)}
            </tbody>
          </table>
        </div>
      </section>
    `;
  },
}));
