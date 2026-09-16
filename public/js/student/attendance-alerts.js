/* Student portal alerts run only while a page is open. No attendance is marked here. */
(() => {
  function pendingSessions(sessions, history) {
    const marked = new Set(history.map((row) => String(row.attendance_session_id)));
    return sessions.filter((session) => ['open', 'late'].includes(session.effective_status)
      && !marked.has(String(session.id)));
  }

  function sessionKey(session) {
    return `${session.id}:${session.open_date}`;
  }

  function sessionLabel(session) {
    const unit = session.program === 'CWTS' ? 'CS (Community Service)' : 'MI (Military Instruction)';
    return `${unit} ${session.mi_number || ''} ${String(session.mi_type || '').toUpperCase()}`.trim();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pendingSessions, sessionKey, sessionLabel };
    return;
  }

  let started = false;
  window.StudentAttendanceAlerts = { start };

  function start(user) {
    if (started || user?.portal !== 'student' || !user.id) return;
    started = true;
    let busy = false;
    let stopped = false;
    let timer;
    let lastSessions = [];
    let dismissed = '';

    const host = document.createElement('section');
    host.className = 'student-attendance-alerts';
    host.setAttribute('aria-label', 'Attendance alerts');
    host.innerHTML = `
      <p id="attendanceAlertHint" class="location-reading-details" hidden></p>
      <div class="attendance-live-alert" hidden>
        <div role="status" aria-live="polite" aria-atomic="true"><strong>Attendance is open</strong><p class="attendance-live-copy"></p></div>
        <a class="btn primary" href="/student/attendance">View attendance</a>
        <button class="btn" type="button" aria-label="Dismiss attendance notification">Dismiss</button>
      </div>`;
    document.querySelector('.intro')?.insertAdjacentElement('afterend', host);
    const hint = host.querySelector('#attendanceAlertHint');
    const banner = host.querySelector('.attendance-live-alert');
    const copy = host.querySelector('.attendance-live-copy');
    function render(sessions) {
      lastSessions = sessions;
      const signature = sessions.map(sessionKey).join('|');
      banner.hidden = !sessions.length || signature === dismissed;
      if (sessions.length) {
        copy.textContent = `${sessionLabel(sessions[0])} is available.${sessions.length > 1 ? ` ${sessions.length} sessions need your attention.` : ''} Open attendance to check in.`;
      }
    }

    banner.querySelector('button').onclick = () => {
      dismissed = lastSessions.map(sessionKey).join('|');
      banner.hidden = true;
    };
    async function poll() {
      if (busy || stopped) return;
      busy = true;
      try {
        // Stop polling if another portal/account replaced this page's login cookie.
        const auth = await API.get('/api/auth/me');
        if (auth.user?.portal !== 'student' || String(auth.user.id) !== String(user.id)) {
          stopped = true;
          clearTimeout(timer);
          banner.hidden = true;
          hint.hidden = false;
          hint.textContent = 'Your sign-in changed. Reload this page to reconnect attendance alerts.';
          return;
        }
        const [sessions, history] = await Promise.all([
          API.get('/api/student/attendance/sessions'),
          API.get('/api/student/attendance'),
        ]);
        hint.hidden = true;
        render(pendingSessions(sessions, history));
      } catch {
        // Retry transient connection errors without interrupting student tasks.
        hint.hidden = false;
        hint.textContent = 'Attendance alerts could not connect. Retrying automatically while this page is open.';
      } finally {
        busy = false;
        clearTimeout(timer);
        if (!stopped) timer = setTimeout(poll, 20000);
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) poll();
    });
    window.addEventListener('pagehide', () => {
      stopped = true;
      clearTimeout(timer);
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        stopped = false;
        poll();
      }
    });
    poll();
  }
})();
