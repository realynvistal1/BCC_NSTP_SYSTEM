document.addEventListener('DOMContentLoaded', () => bootstrapPortalPage({
  expectedPortal: 'rotc-admin',
  shellRole: 'rotc',
  moduleSrc: '/assets/js/admin/rotc/pages.js',
  render: async (content) => {
    const requests = await API.get('/api/admin/rotc/withdrawals');

    content.innerHTML = `
      <div class="withdraw-tabs" id="withdrawTabs"></div>
      <div id="withdrawList" class="withdraw-list"></div>
      <div id="withdrawRejectModal" class="app-dialog hidden">
        <div class="app-dialog-backdrop"></div>
        <div class="app-dialog-card small-modal">
          <div class="app-dialog-head">
            <div>
              <span class="modal-eyebrow">Withdrawal Request</span>
              <h3>Reject Request</h3>
              <p id="withdrawRejectName"></p>
            </div>
            <button class="modal-close" id="withdrawRejectClose">x</button>
          </div>
          <form id="withdrawRejectForm" class="modal-form-body">
            <input type="hidden" name="id">
            <label class="field">
              Admin Remarks
              <textarea name="remarks" rows="4" required placeholder="Enter rejection reason..."></textarea>
            </label>
            <div class="app-dialog-actions">
              <button type="button" class="btn" id="withdrawRejectCancel">Cancel</button>
              <button class="btn danger">Reject Request</button>
            </div>
          </form>
        </div>
      </div>
    `;

    let filter = 'all';

    function draw() {
      const pending = requests.filter((request) => request.status === 'pending').length;

      $('#withdrawTabs').innerHTML = ['all', 'pending', 'approved', 'rejected'].map((status) => `
        <button class="${filter === status ? 'active' : ''}" data-wfilter="${status}">
          ${status[0].toUpperCase() + status.slice(1)}
          ${status === 'pending' && pending ? ` <b>${pending}</b>` : ''}
        </button>
      `).join('');

      const rows = filter === 'all'
        ? requests
        : requests.filter((request) => request.status === filter);

      $('#withdrawList').innerHTML = rows.length
        ? rows.map((row) => `
          <article class="withdraw-card">
            <div class="withdraw-card-top">
              <div class="withdraw-avatar">${esc((row.first_name || '?')[0])}${esc((row.last_name || '?')[0])}</div>
              <div class="withdraw-student">
                <h3>${esc(row.last_name)}, ${esc(row.first_name)}</h3>
                <p>${esc(row.student_no)} - ${esc(row.course)} - ${esc(row.year_level)}</p>
                <small>Submitted ${formatWithdrawDate(row.created_at)}</small>
              </div>
              ${badge(row.status)}
            </div>
            <div class="withdraw-reason">
              <small>Reason for Withdrawal</small>
              <p>${esc(row.reason)}</p>
            </div>
            ${row.status === 'rejected' && row.admin_remarks
              ? `<div class="notice error"><strong>Admin Remarks:</strong> ${esc(row.admin_remarks)}</div>`
              : ''}
            ${row.status === 'approved'
              ? '<div class="notice success">Student has been reverted to a regular cadet and assigned to the regular ROTC roster.</div>'
              : ''}
            ${row.status === 'pending'
              ? '<div class="actions"><button class="btn success" data-wapprove="' + row.id + '">Approve</button><button class="btn danger ghost" data-wreject="' + row.id + '">Reject</button></div>'
              : ''}
          </article>
        `).join('')
        : `<div class="panel empty">No ${filter === 'all' ? '' : `${filter} `}withdrawal requests.</div>`;

      $$('[data-wfilter]').forEach((button) => {
        button.onclick = () => {
          filter = button.dataset.wfilter;
          draw();
        };
      });

      $$('[data-wapprove]').forEach((button) => {
        button.onclick = async () => {
          button.disabled = true;
          try {
            const result = await API.patch(`/api/admin/rotc/withdrawals/${button.dataset.wapprove}`, {
              status: 'approved',
            });
            toast(result.message);
            setTimeout(() => location.reload(), 700);
          } catch (error) {
            toast(error.message, true);
            button.disabled = false;
          }
        };
      });

      $$('[data-wreject]').forEach((button) => {
        button.onclick = () => openReject(Number(button.dataset.wreject));
      });
    }

    function openReject(id) {
      const request = requests.find((item) => Number(item.id) === id);
      const modal = $('#withdrawRejectModal');
      const form = $('#withdrawRejectForm');

      $('#withdrawRejectName').textContent = `Rejecting request from ${request.first_name} ${request.last_name}.`;
      form.id.value = id;
      form.remarks.value = '';
      modal.classList.remove('hidden');
    }

    const close = () => $('#withdrawRejectModal').classList.add('hidden');

    $('#withdrawRejectClose').onclick = close;
    $('#withdrawRejectCancel').onclick = close;
    $('#withdrawRejectModal').querySelector('.app-dialog-backdrop').onclick = close;

    $('#withdrawRejectForm').onsubmit = async (event) => {
      event.preventDefault();

      const id = event.target.id.value;
      const remarks = event.target.remarks.value.trim();

      if (!remarks) {
        return;
      }

      try {
        const result = await API.patch(`/api/admin/rotc/withdrawals/${id}`, {
          status: 'rejected',
          admin_remarks: remarks,
        });
        toast(result.message);
        setTimeout(() => location.reload(), 650);
      } catch (error) {
        toast(error.message, true);
      }
    };

    draw();
  },
}));

function formatWithdrawDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
}
