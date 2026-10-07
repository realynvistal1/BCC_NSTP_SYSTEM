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
    const levelName = level => `${program === 'CWTS' ? 'CWTS' : 'MS'} ${level}`;
    const enrollment = dashboard.re_enrollment || {};
    const failed = [ms2, ms1].find(grade => grade?.status === 'Failed');
    let nextTitle = 'Your latest grades';
    let nextMessage = 'Check your result for each level below. Grades that have not been released are marked as pending.';
    if (enrollment.mode === 'retake' || enrollment.mode === 'return') {
      nextTitle = `${levelName(enrollment.target_level)} ${enrollment.mode === 'return' ? 'Enrollment' : 'Retake'}${enrollment.eligible ? ' Enrollment Open' : ' — Next Steps'}`;
      nextMessage = enrollment.message || 'Check your enrollment status for the next available schedule.';
    } else if (enrollment.eligible) {
      nextTitle = `${levelName(enrollment.target_level)} enrollment is open`;
      nextMessage = enrollment.message;
    } else if (failed) {
      nextTitle = `${levelName(failed.ms_level)} needs attention`;
      nextMessage = enrollment.message || 'Check Enrollment Status for your next step, or contact your NSTP administrator.';
    }

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
        <td class="center">${grade ? badge(grade.status) : 'Pending release'}</td>
      </tr>
    `;

    content.innerHTML = `
      <section class="panel" style="margin-bottom:18px;border-left:4px solid ${failed ? '#f59e0b' : '#3b82f6'}">
        <h2 style="margin:0 0 10px">${esc(nextTitle)}</h2>
        <p style="margin:0;line-height:1.7">${esc(nextMessage)}</p>
        ${enrollment.eligible ? '<a class="btn primary" style="margin-top:14px" href="/student/re-enrollment">Open enrollment form</a>' : ''}
      </section>
      <section class="panel student-grade-panel">
        <h2 style="margin:0 0 8px">Current Results</h2>
        <p class="muted" style="margin:0 0 18px">Your latest released grade for each level. Enrollment approval does not mean you passed the subject.</p>
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
              ${rowTemplate(levelName('1'), ms1)}
              ${rowTemplate(levelName('2'), ms2)}
            </tbody>
          </table>
        </div>
      </section>
    `;
  },
}));
