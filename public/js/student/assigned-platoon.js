document.addEventListener('DOMContentLoaded', () => bootstrapPortalPage({
  expectedPortal: 'student',
  shellRole: 'student',
  moduleSrc: '/assets/js/student/_pages.js',
  render: async (content) => {
    const dashboard = await API.get('/api/student/dashboard');
    const student = dashboard.student || {};
    const isAdvance = student.nstp_component === 'ROTC'
      && Number(student.willing_to_take_advance_course) === 1;

    const assignment = isAdvance
      ? 'Advance Course'
      : student.special_unit
        ? `Special Unit: ${student.special_unit}`
        : student.nstp_component === 'CWTS'
          ? `Company ${student.company || 'Not assigned'}`
          : [
            student.battalion ? `Battalion ${student.battalion}` : '',
            student.rotc_company || '',
            student.rotc_platoon ? `Platoon ${student.rotc_platoon}` : '',
          ].filter(Boolean).join(' - ') || 'Not assigned';

    let withdrawal = null;

    if (isAdvance) {
      try {
        withdrawal = await API.get('/api/student/withdrawal');
      } catch {}
    }

    content.innerHTML = `
      <div class="hero-assignment">
        <div class="assignment-icon">${icon('platoon')}</div>
        <div class="dash-label">Current Assignment</div>
        <h2>${esc(assignment)}</h2>
        <p class="muted">Your assignment is based on your approved NSTP enrollment.</p>
        ${isAdvance ? `
          <div class="advance-withdraw-box">
            <h3>Advance Course Withdrawal</h3>
            ${withdrawal ? `
              <div class="withdraw-status-row">
                ${badge(withdrawal.status)}
                <span>Submitted ${formatWithdrawDate(withdrawal.created_at)}</span>
              </div>
              <p><strong>Reason:</strong> ${esc(withdrawal.reason)}</p>
              ${withdrawal.admin_remarks ? `<p><strong>Admin remarks:</strong> ${esc(withdrawal.admin_remarks)}</p>` : ''}
              ${withdrawal.status === 'rejected' ? '<p class="muted">You may submit a new request if needed.</p>' : ''}
            ` : '<p>If you need to leave the Advance Course, submit a reason for ROTC Admin review.</p>'}
            ${!withdrawal || withdrawal.status === 'rejected'
              ? '<button class="btn danger" id="openWithdrawal">Request Withdrawal</button>'
              : ''}
          </div>
        ` : ''}
      </div>
      <div id="studentWithdrawModal" class="app-dialog hidden">
        <div class="app-dialog-backdrop"></div>
        <div class="app-dialog-card small-modal">
          <div class="app-dialog-head">
            <div>
              <span class="modal-eyebrow">ROTC Advance Course</span>
              <h3>Request Withdrawal</h3>
              <p>Explain why you want to leave the Advance Course.</p>
            </div>
            <button class="modal-close" id="closeStudentWithdraw">x</button>
          </div>
          <form id="studentWithdrawForm" class="modal-form-body">
            <label class="field">
              Reason
              <textarea name="reason" rows="5" minlength="5" required placeholder="Enter your reason..."></textarea>
            </label>
            <div class="app-dialog-actions">
              <button type="button" class="btn" id="cancelStudentWithdraw">Cancel</button>
              <button class="btn danger">Submit Request</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const openButton = $('#openWithdrawal');

    if (openButton) {
      const modal = $('#studentWithdrawModal');
      const close = () => modal.classList.add('hidden');

      openButton.onclick = () => modal.classList.remove('hidden');
      $('#closeStudentWithdraw').onclick = close;
      $('#cancelStudentWithdraw').onclick = close;
      modal.querySelector('.app-dialog-backdrop').onclick = close;

      $('#studentWithdrawForm').onsubmit = async (event) => {
        event.preventDefault();

        const reason = event.target.reason.value.trim();

        if (reason.length < 5) {
          return toast('Please enter a clear withdrawal reason.', true);
        }

        try {
          const result = await API.post('/api/student/withdrawal', { reason });
          toast(result.message);
          setTimeout(() => location.reload(), 600);
        } catch (error) {
          toast(error.message, true);
        }
      };
    }
  },
}));

function formatWithdrawDate(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
}
