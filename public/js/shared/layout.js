function openAttendanceUpdateHistory() {
  if (location.hash !== '#attendanceChanges') return;
  const history = document.getElementById('attendanceChanges');
  if (!history) return;
  const disclosure = history.querySelector('details');
  if (disclosure) disclosure.open = true;
  const focusTarget = history.querySelector('summary') || history;
  if (!history.querySelector('summary')) history.tabIndex = -1;
  requestAnimationFrame(() => {
    history.scrollIntoView({ behavior: 'smooth', block: 'start' });
    focusTarget.focus({ preventScroll: true });
  });
}
window.addEventListener('hashchange', openAttendanceUpdateHistory);

const NAV = {
  student: [
    ['Dashboard', '/student/dashboard', 'dashboard'],
    ['Enrollment Status', '/student/enrollment-status', 'enrollment'],
    ['Enroll', '/student/re-enrollment', 'refresh'],
    ['My Platoon', '/student/assigned-platoon', 'platoon'],
    ['Attendance', '/student/attendance', 'attendance'],
    ['Grades', '/student/grades', 'grades'],
    ['Serial Number', '/student/serial-number', 'serial'],
    ['Settings', '/student/settings', 'settings'],
  ],
  rotc: [],
  cwts: [],
  officer: [],
};

function navIconName(href, label) {
  const text = `${label} ${href}`.toLowerCase();

  if (text.includes('dashboard')) return 'dashboard';
  if (text.includes('schedule')) return 'schedule';
  if (text.includes('enrollment')) return 'enrollment';
  if (text.includes('platoon') || text.includes('roster') || text.includes('company')) return 'platoon';
  if (text.includes('attendance')) return 'attendance';
  if (text.includes('record')) return 'records';
  if (text.includes('grade')) return 'grades';
  if (text.includes('serial') || text.includes('certificate')) return 'serial';
  if (text.includes('offense')) return 'offense';
  if (text.includes('setting')) return 'settings';
  if (text.includes('withdraw')) return 'refresh';
  return 'dashboard';
}

function decorateSidebar(role) {
  document.body.dataset.portalTheme = role;

  document.querySelectorAll('.nav-link').forEach((link) => {
    if (link.dataset.enhanced === 'true') return;

    const href = link.getAttribute('href') || '';
    const label = link.textContent.trim();
    const iconName = navIconName(href, label);

    link.innerHTML = `
      <span class="nav-icon" aria-hidden="true">${icon(iconName)}</span>
      <span class="nav-copy">
        <span class="nav-label">${esc(label)}</span>
      </span>
    `;
    link.dataset.enhanced = 'true';
  });
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton && logoutButton.dataset.enhanced !== 'true') {
    logoutButton.innerHTML = `<span class="nav-icon" aria-hidden="true">${icon('logout')}</span><span>Logout</span>`;
    logoutButton.dataset.enhanced = 'true';
  }

  const mobileMenuButton = document.getElementById('mobileMenuButton');
  if (mobileMenuButton && mobileMenuButton.dataset.enhanced !== 'true') {
    const studentHeader = document.body.dataset.role === 'student' || document.body.dataset.page === 'cwts-instructor-attendance';
    const menuIcon = studentHeader
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
      : icon('dashboard');
    mobileMenuButton.innerHTML = `${menuIcon}<span>Menu</span>`;
    mobileMenuButton.dataset.enhanced = 'true';
  }
  if (document.body.dataset.role === 'student' || document.body.dataset.page === 'cwts-instructor-attendance') {
    const mobileBrand = document.querySelector('.top-mobile > strong');
    if (mobileBrand && mobileBrand.dataset.enhanced !== 'true') {
      mobileBrand.classList.add('student-mobile-brand');
      mobileBrand.innerHTML = `<img src="/assets/images/bcclogo-removebg-preview.png" alt=""><span>BCC NSTP<small>${document.body.dataset.page === 'cwts-instructor-attendance' ? 'CWTS Instructor' : 'Student Portal'}</small></span>`;
      mobileBrand.dataset.enhanced = 'true';
    }
  }
}

function portalLabel(role) {
  if (role === 'student') return 'Student Portal';
  if (role === 'officer') return 'NSTP Director';
  if (role === 'rotc') return 'ROTC Administrator';
  return 'CWTS Administrator';
}

function roleEmblem(role) {
  if (role === 'rotc') return '/assets/images/nstp-rotc.png';
  if (role === 'cwts') return '/assets/images/cwts-logo.png';
  if (role === 'officer') return '/assets/images/ched-logo.png';
  return '/assets/images/bcclogo-removebg-preview.png';
}

function setStudentMobileMenu(open, restoreFocus = false) {
  const sidebar = document.getElementById('sidebar');
  const button = document.getElementById('mobileMenuButton');
  const mobile = window.matchMedia('(max-width: 800px)').matches;
  const expanded = Boolean(open && mobile);
  sidebar?.classList.toggle('open', expanded);
  if (sidebar) sidebar.inert = mobile && !expanded;
  button?.setAttribute('aria-expanded', String(expanded));
  document.body.classList.toggle('student-menu-open', expanded);
  const backdrop = document.getElementById('studentMenuBackdrop');
  if (backdrop) backdrop.hidden = !expanded;
  if (expanded) sidebar?.querySelector('button, a[href]')?.focus();
  else if (restoreFocus && mobile) button?.focus();
}

function setupStudentMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const button = document.getElementById('mobileMenuButton');
  if (!sidebar || !button || button.dataset.mobileBound) return;
  button.dataset.mobileBound = 'true';
  button.setAttribute('aria-controls', 'sidebar');
  button.setAttribute('aria-label', 'Open student navigation');
  const backdrop = document.createElement('button');
  backdrop.id = 'studentMenuBackdrop';
  backdrop.className = 'student-menu-backdrop';
  backdrop.type = 'button';
  backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', 'Close student navigation');
  backdrop.hidden = true;
  document.body.appendChild(backdrop);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'student-menu-close';
  close.setAttribute('aria-label', 'Close student navigation');
  close.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7"/></svg>';
  sidebar.prepend(close);
  button.addEventListener('click', () => setStudentMobileMenu(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setStudentMobileMenu(false, true));
  close.addEventListener('click', () => setStudentMobileMenu(false, true));
  document.addEventListener('keydown', event => {
    if (!sidebar.classList.contains('open')) return;
    if (event.key === 'Escape') setStudentMobileMenu(false, true);
    if (event.key !== 'Tab') return;
    const focusable = [...sidebar.querySelectorAll('a[href], button:not(:disabled)')]
      .filter(element => element.getClientRects().length > 0);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  window.matchMedia('(max-width: 800px)').addEventListener('change', () => setStudentMobileMenu(false));
  setStudentMobileMenu(false);
}

function shell(role, title, subtitle, auth) {
  if (!document.querySelector('link[data-attendance-design]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet'; style.href = '/assets/css/rotc-verifiers.css';
    style.dataset.attendanceDesign = 'true'; document.head.appendChild(style);
  }
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = subtitle;
  preparePortalShell(role);

  if (role === 'student' || document.body.dataset.page === 'cwts-instructor-attendance') setupStudentMobileMenu();
  else document.getElementById('mobileMenuButton')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });

  document.getElementById('logoutButton')?.addEventListener('click', logout);
  if (role === 'officer') {
    loadScriptOnce('/assets/js/officer/attendance-updates.js')
      .then(() => window.DirectorAttendanceUpdates.start(auth.user))
      .catch((error) => console.warn('Attendance updates unavailable:', error.message));
    loadScriptOnce('/assets/js/officer/cwts-attendance-updates.js')
      .then(()=>window.DirectorCWTSAttendanceUpdates.start(auth.user))
      .catch(error=>console.warn('CWTS attendance updates unavailable:',error.message));
  }
  if (role === 'student') {
    if (auth.user?.approved_advance_course === true) {
      if (!document.querySelector('a[href="/student/verify-attendance"]')) {
      const nav=document.querySelector('.sidebar .nav');
      if (nav) {
      const link=document.createElement('a');link.className='nav-link';
      link.href='/student/verify-attendance';link.textContent='My Assigned Attendance';
      const attendanceLink=nav.querySelector('a[href="/student/attendance"]');
      if (attendanceLink) attendanceLink.after(link); else nav.appendChild(link);
      preparePortalShell(role);
      }
      }
    }
    loadScriptOnce('/assets/js/student/attendance-alerts.js')
      .then(() => window.StudentAttendanceAlerts.start(auth.user))
      .catch((error) => console.warn('Attendance alerts unavailable:', error.message));
  }
}

function attendanceUpdateDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function attendanceUpdateDetails(row) {
  if (!row.verified_at) return '';
  return `<div class="attendance-update-meta"><span>Updated by <strong>${esc(row.verified_by_name || 'Attendance staff')}</strong></span>
    <time>${esc(attendanceUpdateDate(row.verified_at))}</time>${row.update_reason ? `<span class="attendance-meta-reason">Reason: ${esc(row.update_reason)}</span>` : ''}</div>`;
}

function attendanceAssignmentCard(a) {
  const group = a.special_unit ? 'Special Platoon / '+a.special_unit : 'Battalion '+a.battalion+' / '+a.company+' / Platoon '+a.platoon;
  return '<article class="attendance-assignment-card"><div class="attendance-eyebrow">Assigned group</div><h3>'+esc(group)+'</h3><dl class="attendance-assignment-details"><div><dt>Level</dt><dd>MS '+esc(a.ms_level)+'</dd></div><div><dt>School year</dt><dd>'+esc(a.school_year)+'</dd></div><div><dt>Attendance session</dt><dd>'+(Number(a.mi_number) ? 'MI '+esc(a.mi_number) : 'All MIs')+' / '+esc(String(a.mi_type || 'All types').toUpperCase())+'</dd></div></dl></article>';
}

function attendanceChangeCard(row) {
  const cwts=row.program==='CWTS';
  const status = value => ['present', 'late', 'absent'].includes(value) ? value : 'unmarked';
  const initials = [row.first_name, row.last_name].filter(Boolean).map(name => String(name).charAt(0)).join('');
  return `<article class="attendance-change-card" data-status="${status(row.status)}">
    <div class="attendance-change-top"><div class="attendance-person"><span class="attendance-avatar" aria-hidden="true">${esc(initials)}</span><div><h3>${esc(row.first_name + ' ' + row.last_name)}</h3><span>Student ID · ${esc(row.student_id)}</span></div></div>
      <time>${icon('schedule')}<span>${esc(attendanceUpdateDate(row.verified_at))}</span></time></div>
    <div class="attendance-change-session"><strong>${icon('attendance')} ${cwts?'CS':'MI'} ${esc(row.mi_number)} ${esc(String(row.mi_type || '').toUpperCase())}</strong>
      <span>${esc(cwts?`Company ${row.company}`:row.special_unit || `Battalion ${row.battalion} · ${row.company} · Platoon ${row.platoon}`)}</span>
      <span>${cwts?'CWTS':'MS'} ${esc(row.ms_level)} · ${esc(row.school_year)}</span></div>
    <div class="attendance-change-status"><div><span class="attendance-status-label">Previous status</span><span class="update-status ${status(row.previous_status)}">${esc(row.previous_status || 'Unmarked')}</span></div>
      <span class="attendance-change-arrow" aria-label="changed to">→</span><div><span class="attendance-status-label">Updated status</span><span class="update-status ${status(row.status)}">${esc(row.status || 'Unmarked')}</span></div></div>
    <div class="attendance-change-reason"><span>Reason for update</span><p>${esc(row.reason || 'No reason recorded.')}</p></div>
    <div class="attendance-change-actor"><span class="attendance-actor-icon" aria-hidden="true">${icon('platoon')}</span><div><span class="attendance-meta-label">Updated by</span><strong>${esc(row.verifier_first_name + ' ' + row.verifier_last_name)}</strong></div><span class="attendance-role-chip">${cwts?'CWTS Instructor':'Advance Course'}</span></div>
  </article>`;
}

// Keep attendance views current across portals without interrupting open forms.
function startAttendanceRefresh(user, refresh) {
  let busy = false;
  let stopped = false;
  async function check() {
    if (busy || stopped || document.hidden || document.querySelector('dialog[open], .modal:not(.hidden), .app-dialog:not(.hidden)')) return;
    busy = true;
    try {
      const auth = await API.get('/api/auth/me');
      if (auth.user?.portal !== user.portal || String(auth.user.id) !== String(user.id)) {
        stopped = true;
        return;
      }
      await refresh();
    } catch (error) {
      console.warn('Attendance refresh will retry:', error.message);
    } finally { busy = false; }
  }
  const timer = window.setInterval(check, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('pagehide', () => { stopped = true; });
  window.addEventListener('pageshow', event => { if (event.persisted) { stopped = false; check(); } });
  return () => { stopped = true; window.clearInterval(timer); };
}

function preparePortalShell(role) {
  if (role === 'officer') {
    const nav = document.querySelector('.sidebar .nav');
    const items = [
      ['/officer/dashboard', 'Dashboard'],
      ['/officer/rotc/battalion-1', 'ROTC Battalion 1'],
      ['/officer/rotc/battalion-2', 'ROTC Battalion 2'],
      ['/officer/rotc/advance-course', 'Advance Course'],
      ['/officer/rotc/special-platoon', 'Special Platoon'],
      ['/officer/cwts', 'CWTS'],
      ['/officer/create-attendance', 'Create Attendance'],
      ['/officer/view-attendance', 'View Attendance'],
      ['/officer/cwts-instructors', 'CWTS Attendance Verifiers'],
      ['/officer/rotc-verifiers', 'ROTC Attendance Verifiers'],
      ['/officer/view-records', 'View Student Records'],
      ['/officer/settings', 'Settings'],
    ];
    if (nav) nav.innerHTML = items.map(([href, label]) =>
      '<a class="nav-link" href="' + href + '">' + esc(label) + '</a>'
    ).join('');
  }
  decorateSidebar(role);

  const emblem = document.getElementById('portalEmblem');
  if (emblem) emblem.src = document.body.dataset.page === 'cwts-instructor-attendance'
    ? '/assets/images/bcclogo-removebg-preview.png'
    : roleEmblem(role);

  const current = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === current);
  });
}

function portalLogin(expected) {
  if (expected === 'cwts-instructor' || document.body.dataset.page === 'cwts-instructor-attendance') return '/cwts/instructor/login';
  if (expected === 'rotc-admin') return '/admin/rotc/login';
  if (expected === 'cwts-admin') return '/admin/cwts/login';
  if (expected === 'officer') return '/officer/login';
  return '/student/login';
}

async function showStudentAttendanceOffense(offense) {
  if (!offense) return;

  const blocked = Number(offense.offend || 0) >= 2 && !Number(offense.settled || 0);
  const warning = Number(offense.offend || 0) === 1 && !offense.warning_acknowledged_at;

  if (!blocked && !warning) return;
  if (document.getElementById('attendanceOffenseOverlay')) return;

  const host = document.createElement('div');
  host.id = 'attendanceOffenseOverlay';
  host.className = 'offense-overlay';
  host.innerHTML = `
    <section class="offense-card ${blocked ? 'blocked' : ''}">
      <div class="offense-accent"></div>
      <div class="offense-body">
        <div class="offense-icon">!</div>
        <h2 class="offense-title">${blocked ? 'Action Required: Attendance Violation' : 'Warning: Attendance Violation'}</h2>
        <span class="offense-level">${blocked ? '2nd Instance - Action Required' : '1st Instance - Warning'}</span>
        <div class="offense-message">
          ${blocked
            ? '<p>This is your <strong>second attendance offense</strong>. Your attendance was updated to <strong>Absent</strong>.</p><p><strong>Your access is restricted until the offense is settled with the ROTC/CWTS office.</strong></p>'
            : '<p>Your attendance was updated to <strong>Absent</strong>, which recorded a warning in your account.</p><p>Please follow attendance instructions to avoid a second offense.</p>'}
          ${(offense.updates || []).map(update => `<div class="offense-update-reason"><strong>${esc(update.program === 'CWTS' ? 'CS' : 'MI')} ${esc(update.mi_number)} ${esc(String(update.mi_type || '').toUpperCase())}</strong><p>Updated by ${esc(update.verified_by_name || 'Attendance staff')}</p><p><strong>Reason:</strong> ${esc(update.reason || 'No reason recorded.')}</p></div>`).join('')}
        </div>
      </div>
      <div class="offense-actions">
        <button class="btn ${blocked ? 'danger' : 'primary'}" id="offenseActionButton" type="button">${blocked ? 'Log Out' : 'Got it, I understand'}</button>
      </div>
    </section>
  `;
  document.body.appendChild(host);

  document.getElementById('offenseActionButton').onclick = async () => {
    if (blocked) {
      await API.post('/api/auth/logout', {}).catch(() => {});
      location.href = '/student/login';
      return;
    }

    try {
      await API.post('/api/student/attendance-offense/acknowledge', {});
      host.remove();
    } catch (error) {
      toast(error.message || 'Unable to acknowledge warning.', true);
    }
  };
}

async function guard(expected) {
  try {
    const data = await API.get('/api/auth/me', { timeoutMs: 20000 });
    const session = data.user || data;

    if (expected && session.portal !== expected) {
      location.href = portalLogin(expected);
      return null;
    }

    if (expected === 'student') {
      if (typeof session.approved_advance_course !== 'boolean') {
        const dashboard = await API.get('/api/student/dashboard');
        const student = dashboard.student || {};
        const record = dashboard.record || {};
        session.approved_advance_course = student.nstp_component === 'ROTC'
          && Number(student.willing_to_take_advance_course) === 1
          && record.status === 'approved' && Number(record.assignment_is_advance) === 1
          && !student.special_unit && !record.assignment_special_unit;
      }
      if (document.body.dataset.page === 'verify-attendance' && session.approved_advance_course !== true) {
        location.href = '/student/dashboard';
        return null;
      }
      try {
        const offense = await API.get('/api/student/attendance-offense');
        setTimeout(() => showStudentAttendanceOffense(offense), 0);
      } catch {
        // Offense checks should not prevent page loading.
      }
    }

    return { ...data, user: session };
  } catch (error) {
    // A slow network is not an expired login. Let the page display a retry
    // instead of sending the user back through the sign-in flow.
    if (error.status !== 401 && error.status !== 403) throw error;
    location.href = portalLogin(expected);
    return null;
  }
}

function table(headers, rows) {
  const headerHtml = headers.map((header) => `<th>${header}</th>`).join('');
  const bodyHtml = rows.length
    ? rows.map(row => {
      let column = 0;
      return row.replace(/<td\b([^>]*)>/g, (cell, attributes) => {
        const label = headers[column++];
        return /\bdata-label=/.test(attributes) ? cell : `<td data-label="${esc(label || '')}"${attributes}>`;
      });
    }).join('')
    : `<tr><td class="empty" colspan="${headers.length}"><div class="empty-icon">${icon('records')}</div>No records found.</td></tr>`;

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

function dashCard(label, value, desc, href, ico = 'dashboard', tone = 'blue') {
  return `
    <a class="dashboard-card" href="${href}">
      <div class="dash-top">
        <span class="dash-icon ${tone}">${icon(ico)}</span>
        <span class="dash-arrow">></span>
      </div>
      <div class="dash-label">${esc(label)}</div>
      <div class="dash-value">${value}</div>
      <div class="dash-desc">${esc(desc)}</div>
    </a>
  `;
}

function statCard(label, value, ico = 'dashboard') {
  return `
    <div class="stat-card">
      <div class="metric">
        <div>
          <div class="dash-label">${esc(label)}</div>
          <div class="value">${esc(value)}</div>
        </div>
        <div class="metric-icon">${icon(ico)}</div>
      </div>
    </div>
  `;
}

function ensureForgotModal() {
  let modal = $('#forgotPasswordModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'forgotPasswordModal';
  modal.className = 'forgot-modal hidden';
  modal.innerHTML = `
    <div class="forgot-modal-backdrop" onclick="closeForgotModal()"></div>
    <div class="forgot-modal-card">
      <button class="forgot-close" type="button" onclick="closeForgotModal()">x</button>
      <div class="forgot-modal-body" id="forgotModalBody"></div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function closeForgotModal() {
  $('#forgotPasswordModal')?.classList.add('hidden');
}

async function submitForgotPassword(event) {
  event.preventDefault();
  const form = $('#forgotPasswordForm');
  const message = $('#forgotPasswordMsg');
  const button = $('#resetStudentPasswordBtn');
  if (!form || !message || !button) return;

  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'Resetting...';
  message.className = 'notice hidden';
  message.textContent = '';

  try {
    const payload = formToObject(form);
    payload.recaptcha_token = await Captcha.token('student_reset_confirm');
    const result = await API.post('/api/auth/forgot-password/reset-student', payload);
    message.textContent = result.message;
    message.className = 'notice';
    form.reset();
  } catch (error) {
    message.textContent = error.message;
    message.className = 'notice error';
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

async function requestStudentResetCode(event) {
  event.preventDefault();
  const form = $('#forgotPasswordForm');
  const message = $('#forgotPasswordMsg');
  const button = $('#sendStudentResetCodeBtn');
  if (!form || !message || !button) return;

  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'Sending...';
  message.className = 'notice hidden';
  message.textContent = '';

  try {
    const payload = formToObject(form);
    payload.recaptcha_token = await Captcha.token('student_reset_request');
    const result = await API.post('/api/auth/forgot-password/request-code-student', payload);
    message.textContent = result.message;
    message.className = 'notice';
    $('#studentVerificationCode')?.focus();
  } catch (error) {
    message.textContent = error.message;
    message.className = 'notice error';
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

async function requestAdminResetCode(event) {
  event.preventDefault();
  const form = $('#adminForgotPasswordForm');
  const message = $('#forgotPasswordMsg');
  const button = $('#sendResetCodeBtn');
  if (!form || !message || !button) return;

  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'Sending...';
  message.className = 'notice hidden';
  message.textContent = '';

  try {
    const payload = formToObject(form);
    payload.recaptcha_token = await Captcha.token('admin_reset_request');
    const result = await API.post('/api/auth/forgot-password/request-code', payload);
    message.textContent = result.message;
    message.className = 'notice';
  } catch (error) {
    message.textContent = error.message;
    message.className = 'notice error';
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

async function submitAdminForgotPassword(event) {
  event.preventDefault();
  const form = $('#adminForgotPasswordForm');
  const message = $('#forgotPasswordMsg');
  const button = $('#resetAdminPasswordBtn');
  if (!form || !message || !button) return;

  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'Resetting...';
  message.className = 'notice hidden';
  message.textContent = '';

  try {
    const payload = formToObject(form);
    payload.recaptcha_token = await Captcha.token('admin_reset_confirm');
    const result = await API.post('/api/auth/forgot-password/reset-admin', payload);
    message.textContent = result.message;
    message.className = 'notice';
    form.reset();
  } catch (error) {
    message.textContent = error.message;
    message.className = 'notice error';
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

function showForgotMessage() {
  const loginForm = $('#loginForm');
  const portal = loginForm?.dataset?.portal || 'student';
  const modal = ensureForgotModal();
  const body = $('#forgotModalBody');
  if (!body) return;

  modal.classList.toggle('student-reset-mode', portal === 'student');

  if (portal !== 'student') {
    body.innerHTML = `
      <div class="forgot-header">
        <h3>${portal === 'cwts-instructor' ? 'Reset Instructor Password' : portal === 'cwts-admin' ? 'Reset CWTS Password' : 'Reset Admin Password'}</h3>
        <p>Request a verification code through Gmail, then enter the code to create a new password.</p>
      </div>
      <div class="notice hidden" id="forgotPasswordMsg"></div>
      <form class="auth-form forgot-form" id="adminForgotPasswordForm">
        <input type="hidden" name="portal" value="${portal}">
        <label>
          Email Address
          <div class="input-shell">
            <span class="field-icon">@</span>
            <input name="email" placeholder="Enter your admin email" required type="email">
          </div>
        </label>
        <div class="forgot-action-row">
          <button class="auth-submit ${['cwts-admin','cwts-instructor'].includes(portal) ? 'cwts-submit' : portal === 'officer' ? 'officer-submit' : 'rotc-submit'}" id="sendResetCodeBtn" type="button">Send Code</button>
        </div>
        <label>
          Verification Code
          <div class="input-shell">
            <span class="field-icon">#</span>
            <input name="verification_code" placeholder="Enter 6-digit code" required type="text">
          </div>
        </label>
        <label>
          New Password
          <div class="input-shell">
            <span class="field-icon">*</span>
            <input name="newPassword" minlength="8" pattern="(?=.*[0-9])(?=.*[^a-zA-Z0-9&#92;s]).{8,}" title="Use at least 8 characters, including a number and a symbol (e.g. !, @, #)." placeholder="8+ characters, number &amp; symbol" required type="password">
          </div>
        </label>
        <label>
          Confirm New Password
          <div class="input-shell">
            <span class="field-icon">*</span>
            <input name="confirmPassword" minlength="8" placeholder="Confirm new password" required type="password">
          </div>
        </label>
        <button class="auth-submit ${['cwts-admin','cwts-instructor'].includes(portal) ? 'cwts-submit' : portal === 'officer' ? 'officer-submit' : 'rotc-submit'}" id="resetAdminPasswordBtn" type="submit">Reset Password</button>
      </form>
    `;
    $('#sendResetCodeBtn')?.addEventListener('click', requestAdminResetCode);
    $('#adminForgotPasswordForm')?.addEventListener('submit', submitAdminForgotPassword);
    modal.classList.remove('hidden');
    return;
  }

  body.innerHTML = `
    <div class="forgot-header">
      <h3>Reset Student Password</h3>
      <p>Request a verification code through Gmail, then enter the code to create a new password.</p>
    </div>
    <div class="notice hidden" id="forgotPasswordMsg"></div>
    <form class="auth-form forgot-form student-forgot-form" id="forgotPasswordForm">
      <input type="hidden" name="portal" value="student">
      <label>
        Registered Email
        <div class="input-shell">
          <span class="field-icon">@</span>
          <input name="email" placeholder="Enter your email" required type="email">
        </div>
      </label>
      <div class="forgot-action-row">
        <button class="auth-submit student-submit" id="sendStudentResetCodeBtn" type="button">Send Code</button>
      </div>
      <label>
        Verification Code
        <div class="input-shell">
          <span class="field-icon">#</span>
          <input id="studentVerificationCode" name="verification_code" placeholder="Enter 6-digit code" required type="text">
        </div>
      </label>
      <label>
        New Password
        <div class="input-shell">
          <span class="field-icon">*</span>
          <input name="newPassword" minlength="8" pattern="(?=.*[0-9])(?=.*[^a-zA-Z0-9&#92;s]).{8,}" title="Use at least 8 characters, including a number and a symbol (e.g. !, @, #)." placeholder="8+ characters, number &amp; symbol" required type="password">
        </div>
      </label>
      <label>
        Confirm New Password
        <div class="input-shell">
          <span class="field-icon">*</span>
          <input name="confirmPassword" minlength="8" placeholder="Confirm new password" required type="password">
        </div>
      </label>
      <button class="auth-submit student-submit" id="resetStudentPasswordBtn" type="submit">Reset Password</button>
    </form>
  `;

  $('#sendStudentResetCodeBtn')?.addEventListener('click', requestStudentResetCode);
  $('#forgotPasswordForm')?.addEventListener('submit', submitForgotPassword);
  modal.classList.remove('hidden');
}

function initPasswordToggles() {
  $$('.password-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const input = button.closest('.input-shell')?.querySelector('input');
      if (!input) return;

      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.innerHTML = passwordEyeIcon(show);
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', String(show));
    });
  });
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function fileAsDataUrl(file) {
  if (!file) return null;

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function confirmLogout() {
  if (document.getElementById('logoutDialog')) return Promise.resolve(false);
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = 'logoutDialog';
    dialog.className = 'logout-dialog';
    dialog.setAttribute('aria-labelledby', 'logoutDialogTitle');
    dialog.setAttribute('aria-describedby', 'logoutDialogDescription');
    dialog.innerHTML = `<form method="dialog" class="logout-dialog-content"><div class="logout-dialog-top"><span class="logout-dialog-icon" aria-hidden="true">${icon('logout')}</span><button type="submit" value="cancel" class="logout-dialog-close" aria-label="Close">&times;</button></div><span class="logout-dialog-eyebrow">BCC NSTP PORTAL</span><h2 id="logoutDialogTitle">Ready to log out?</h2><p id="logoutDialogDescription">Your session will end and you will return to the login page.</p><div class="logout-dialog-actions"><button type="submit" value="cancel" class="btn logout-dialog-cancel" autofocus>Cancel</button><button type="submit" value="logout" class="btn primary">Log Out</button></div></form>`;
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'logout';
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(confirmed);
    }, { once: true });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close('cancel');
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

async function logout() {
  if (!await confirmLogout()) return;

  const path = location.pathname;
  const destination = document.body.dataset.page === 'cwts-instructor-attendance'
    ? '/cwts/instructor/login'
    : path.startsWith('/admin/rotc')
    ? '/admin/rotc/login'
    : path.startsWith('/admin/cwts')
      ? '/admin/cwts/login'
      : path.startsWith('/officer')
        ? '/officer/login'
        : '/student/login';

  try {
    await API.post('/api/auth/logout', {});
  } finally {
    location.href = destination;
  }
}

function showPageLoading(message = 'Loading page...') {
  const content = document.getElementById('content');
  if (!content) return;

  content.classList.remove('content-ready');

  content.innerHTML = `
    <div class="page-loading" role="status" aria-live="polite">
      <span class="page-spinner" aria-hidden="true"></span>
      <strong>${esc(message)}</strong>
    </div>
  `;
}

function showRouteLoading(message = 'Opening page...') {
  let overlay = document.getElementById('routeLoadingOverlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'routeLoadingOverlay';
    overlay.className = 'route-loading-overlay';
    overlay.innerHTML = `
      <span class="route-loading-bar" aria-hidden="true"></span>
      <span class="route-loading-status" role="status" aria-live="polite">
        <span class="route-loading-dot" aria-hidden="true"></span>
        <span id="routeLoadingMessage">${esc(message)}</span>
      </span>
    `;
    document.body.appendChild(overlay);
  } else {
    const messageNode = document.getElementById('routeLoadingMessage');
    if (messageNode) messageNode.textContent = message;
  }

  overlay.classList.add('visible');
  document.body.classList.add('route-leaving');
}

function showPageError(error) {
  const content = document.getElementById('content');
  if (!content) return;

  const message = error?.message || 'Unable to load this page. Please try again.';
  content.innerHTML = `
    <div class="page-load-error">
      <div class="empty-icon">${icon('offense')}</div>
      <h3>Unable to load this page</h3>
      <p>${esc(message)}</p>
      <button class="btn primary" type="button" id="retryPageLoad">Try Again</button>
    </div>
  `;
  document.getElementById('retryPageLoad')?.addEventListener('click', () => window.location.reload());
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-page-module="${src}"]`);
    if (existing?.dataset.loaded === 'true') return resolve();
    const script = existing || document.createElement('script');
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onLoad = () => {
      script.dataset.loaded = 'true';
      finish();
    };
    const onError = () => finish(new Error('The page tools could not be loaded. Please try again.'));
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    timer = setTimeout(() => finish(new Error('The page tools took too long to load. Please try again.')), 20000);
    if (!existing) {
      script.src = src;
      script.dataset.pageModule = src;
      document.body.appendChild(script);
    }
  });
}

async function bootstrapPortalPage({ expectedPortal, shellRole, moduleSrc, render }) {
  // Build the final shell before the auth request so the sidebar does not restyle
  // or resize after the first paint.
  preparePortalShell(shellRole);
  showPageLoading('Checking your session...');
  let loadingStep = 'Checking your session';

  try {
    const auth = await guard(expectedPortal);
    if (!auth) return;

    shell(
      shellRole,
      document.body.dataset.title || 'Dashboard',
      document.body.dataset.subtitle || 'BCC NSTP management and monitoring.',
      auth
    );

    loadingStep = 'Preparing this page';
    showPageLoading('Preparing this page...');
    await loadScriptOnce(moduleSrc);

    const content = document.getElementById('content');
    if (!content) throw new Error('Page content container was not found.');

    loadingStep = 'Loading page data';
    showPageLoading('Loading page data...');
    await render(content, auth);
    window.requestAnimationFrame(() => content.classList.add('content-ready'));
  } catch (error) {
    console.error('Page bootstrap error:', error);
    showPageError(new Error(`${loadingStep}: ${error.message || 'Please try again.'}`));
  }
}

// Warm likely destinations so normal multi-page navigation feels immediate.
document.addEventListener('pointerover', (event) => {
  const link = event.target.closest('.nav-link');
  if (!link || link.dataset.prefetched === 'true') return;

  const href = link.getAttribute('href');
  if (!href) return;

  const nextUrl = new URL(href, window.location.origin);
  if (nextUrl.origin !== window.location.origin || nextUrl.href === window.location.href) return;

  const prefetch = document.createElement('link');
  prefetch.rel = 'prefetch';
  prefetch.href = nextUrl.href;
  document.head.appendChild(prefetch);
  link.dataset.prefetched = 'true';
}, { passive: true });

// Always close the mobile sidebar after a navigation item is selected.
document.addEventListener('click', (event) => {
  const link = event.target.closest('.nav-link');
  if (!link) return;

  if (document.body.dataset.role === 'student' || document.body.dataset.page === 'cwts-instructor-attendance') setStudentMobileMenu(false);
  else document.getElementById('sidebar')?.classList.remove('open');

  const href = link.getAttribute('href');
  if (!href) return;
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const target = link.getAttribute('target');
  if (target && target !== '_self') return;

  const nextUrl = new URL(href, window.location.origin);
  if (nextUrl.origin !== window.location.origin) return;
  if (nextUrl.href === window.location.href) return;
  if (document.body.classList.contains('route-leaving')) return;

  event.preventDefault();
  showRouteLoading('Opening page...');
  window.setTimeout(() => {
    window.location.assign(nextUrl.href);
  }, 1000);
});

// A page restored from the browser's back-forward cache must not remain dimmed.
window.addEventListener('pageshow', () => {
  document.body.classList.remove('route-leaving');
  document.getElementById('routeLoadingOverlay')?.classList.remove('visible');
});
