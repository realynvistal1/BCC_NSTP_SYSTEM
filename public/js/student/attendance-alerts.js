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
    let historySignature;
    let assignmentDialog;
    const assignmentKey = `attendance-assignments:${user.id}`;
    let seenAssignments = '';
    try { seenAssignments = localStorage.getItem(assignmentKey) || ''; } catch (_) {}

    function showAssignments(assignments) {
      const signature = assignments.map(a => `${a.id}:${a.updated_at}`).sort().join('|');
      if (!assignments.length || signature === seenAssignments || assignmentDialog?.open) return;
      assignmentDialog = document.createElement('dialog');
      assignmentDialog.setAttribute('aria-label', 'Attendance verification assignment');
      assignmentDialog.className = 'attendance-update-dialog attendance-assignment-dialog';
      assignmentDialog.innerHTML = '<header class="attendance-dialog-header"><div class="attendance-dialog-icon" aria-hidden="true">'+icon('attendance')+'</div><div><span class="attendance-eyebrow">NSTP Director assignment</span><h2>Attendance assignment</h2></div><button class="attendance-dialog-close" type="button" aria-label="Close assignment">&times;</button></header><div class="attendance-dialog-body"><p>You have been assigned to check attendance for the following group and session.</p>'+assignments.map(attendanceAssignmentCard).join('')+'<div class="notice">Check students on the field, update their attendance status, and enter a reason. Saved changes take effect immediately and appear in the Director&#39;s update history.</div></div><footer class="attendance-dialog-footer"><a class="btn primary" href="/student/verify-attendance">View Assignment</a><button class="btn" type="button">Close</button></footer>';
      const remember = () => {
        seenAssignments = signature;
        try { localStorage.setItem(assignmentKey, signature); } catch (_) {}
      };
      assignmentDialog.querySelector('a').onclick = remember;
      assignmentDialog.querySelectorAll('button').forEach(button => button.onclick = () => assignmentDialog.close());
      assignmentDialog.addEventListener('close', () => { remember(); assignmentDialog.remove(); }, { once: true });
      document.body.appendChild(assignmentDialog);
      assignmentDialog.showModal();
    }

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
          hint.textContent = 'Your login session changed. Reload this page to reconnect attendance alerts.';
          return;
        }
        // Check offenses independently so session/history failures cannot hide a warning.
        const offense = await API.get('/api/student/attendance-offense');
        await showStudentAttendanceOffense(offense);
        const [sessions, history] = await Promise.all([
          API.get('/api/student/attendance/sessions'),
          API.get('/api/student/attendance'),
        ]);
        hint.hidden = true;
        render(pendingSessions(sessions, history));
        const signature = JSON.stringify(history);
        if (signature !== historySignature) {
          historySignature = signature;
          window.dispatchEvent(new CustomEvent('student-attendance-updated', { detail: { history } }));
        }
        if (String(user.program || '').toUpperCase() === 'ROTC') {
          const assignments = await API.get('/api/student/rotc-verifier/assignments');
          if (!document.getElementById('attendanceOffenseOverlay')) showAssignments(assignments);
        }
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
