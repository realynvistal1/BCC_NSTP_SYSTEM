window.DirectorAttendanceUpdates = (() => {
  let started = false;
  let busy = false;
  let dialog;
  let seen = 0;
  let storageKey;
  let lastLatest;
  let account;
  let stopped = false;

  async function check() {
    if (busy || stopped || dialog?.open || document.hidden || document.querySelector('dialog[open], .app-dialog:not(.hidden), .modal:not(.hidden)')) return;
    busy = true;
    try {
      const auth = await API.get('/api/auth/me');
      if (auth.user?.portal !== account.portal || String(auth.user.id) !== String(account.id)) {
        stopped = true;
        return;
      }
      const log = await API.get('/api/officer/rotc-verification-log');
      const newest = Number(log[0]?.id) || 0;
      if (lastLatest !== undefined && newest !== lastLatest) {
        window.dispatchEvent(new CustomEvent('director-attendance-updated'));
      }
      lastLatest = newest;
      const unread = log.filter(row => Number(row.id) > seen);
      if (!unread.length) return;
      const latest = Math.max(...unread.map(row => Number(row.id)));
      dialog = document.createElement('dialog');
      dialog.className = 'attendance-update-dialog director-update-notification';
      dialog.setAttribute('aria-labelledby', 'attendanceUpdateTitle');
      dialog.innerHTML = `<header class="attendance-dialog-header"><div class="attendance-dialog-icon" aria-hidden="true">${icon('attendance')}</div>
        <div class="director-notification-heading"><span class="attendance-eyebrow">NSTP Director &middot; Attendance activity</span><h2 id="attendanceUpdateTitle">${unread.length === 1 ? 'Attendance updated' : `${unread.length} attendance updates`}</h2><p>Review the student, status change, and verifier&#39;s reason.</p></div>
        <button type="button" class="attendance-dialog-close" aria-label="Close attendance updates">&times;</button></header>
        <div class="director-notification-summary"><span class="director-notification-saved">${icon('attendance')} Changes saved</span><span>${unread.length} new ${unread.length === 1 ? 'update' : 'updates'}</span></div>
        <div class="attendance-dialog-body"><p class="director-notification-intro">These changes are already reflected in attendance records.</p>${unread.map(attendanceChangeCard).join('')}</div>
        <footer class="attendance-dialog-footer"><a class="btn director-notification-history" href="/officer/rotc-verifiers#attendanceChanges">${icon('records')} View update history</a><button type="button" class="btn primary">Done</button></footer>`;
      dialog.querySelectorAll('button').forEach(button => button.onclick = () => dialog.close());
      dialog.addEventListener('close', () => {
        seen = latest;
        try { localStorage.setItem(storageKey, String(seen)); } catch (_) { /* Keep working with in-memory tracking. */ }
        dialog.remove();
      }, { once: true });
      document.body.appendChild(dialog);
      dialog.showModal();
    } catch (error) {
      console.warn('Unable to load attendance updates:', error.message);
    } finally {
      busy = false;
    }
  }

  function start(user) {
    if (started) return;
    started = true;
    account = user;
    storageKey = `director-attendance-updates:${user.id || user.email}`;
    try { seen = Number(localStorage.getItem(storageKey)) || 0; } catch (_) { seen = 0; }
    check();
    window.setInterval(check, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }
  return { start };
})();
