const NAV = {
  student: [
  ["Dashboard", "/student/dashboard", "dashboard"],
  ["Enrollment Status", "/student/enrollment-status", "enrollment"],
  ["Apply Enrollment", "/student/re-enrollment", "refresh"],
  ["My Platoon", "/student/assigned-platoon", "platoon"],
  ["Attendance", "/student/attendance", "attendance"],
  ["Grades", "/student/grades", "grades"],
  ["Serial Number", "/student/serial-number", "serial"],
  ["Settings", "/student/settings", "settings"],
  ],
  rotc: [],
  cwts: [],
  officer: [],
}
;
function portalLabel(role) {
  if (role === "student") return "Student Portal";
  if (role === "officer") return "NSTP Director";
  if (role === "rotc") return "ROTC Administrator";
  return "CWTS Administrator";
}
function roleEmblem(role) {
  if (role === "rotc") return "/assets/images/nstp-rotc.png";
  if (role === "cwts") return "/assets/images/cwts-logo.png";
  if (role === "officer") return "/assets/images/ched-logo.png";
  return "/assets/images/bcclogo-removebg-preview.png";
}
function shell(role, title, subtitle, auth) {
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageSubtitle").textContent = subtitle;
  const emblem = document.getElementById("portalEmblem");
  if (emblem) emblem.src = roleEmblem(role);
  const current = window.location.pathname;
  document.querySelectorAll(".nav-link").forEach((link) => {
  link.classList.toggle("active", link.getAttribute("href") === current);
  });
  document.getElementById("mobileMenuButton")?.addEventListener("click", () => {
  document.getElementById("sidebar")?.classList.toggle("open");
  });
  document.getElementById("logoutButton")?.addEventListener("click", logout);
}
function portalLogin(expected){
  return expected==='rotc-admin'?'/admin/rotc/login':expected==='cwts-admin'?'/admin/cwts/login':expected==='officer'?'/officer/login':'/student/login'
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
        <div class="offense-icon">${blocked ? '!' : '⚠'}</div>
        <h2 class="offense-title">${blocked ? 'Action Required: Attendance Violation' : 'Warning: Attendance Violation'}</h2>
        <span class="offense-level">${blocked ? '2nd Instance — Action Required' : '1st Instance — Warning'}</span>
        <div class="offense-message">
          ${blocked
            ? '<p>This is your <strong>second occurrence</strong> of being marked present/late but not found during verification. Your attendance was updated to <strong>Absent</strong>.</p><p><strong>Your access is restricted until the offense is settled with the ROTC/CWTS office.</strong></p>'
            : '<p>You were previously marked present/late but were not found during attendance verification. Your attendance was updated to <strong>Absent</strong>.</p><p>Please follow attendance instructions to avoid a second offense.</p>'}
        </div>
      </div>
      <div class="offense-actions">
        <button class="btn ${blocked ? 'danger' : 'primary'}" id="offenseActionButton" type="button">${blocked ? 'Log Out' : 'Got it, I understand'}</button>
      </div>
    </section>`;
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

async function guard(expected){
  try{
    const d=await API.get('/api/auth/me');
    if(expected&&d.portal!==expected){
      location.href=portalLogin(expected);
      return null
    }
    if(expected==='student'){
      try{
        const offense=await API.get('/api/student/attendance-offense');
        setTimeout(()=>showStudentAttendanceOffense(offense),0);
      }catch{/* offense check should not prevent page loading */}
    }
    return d
  }   catch{
    location.href=portalLogin(expected);
    return null
  }
}
function table(headers,rows){
  return `<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${
    x
  }
  </th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td class="empty" colspan="${headers.length}"><div class="empty-icon">${
    icon('records')
  }
  </div>No records found.</td></tr>`}</tbody></table></div>`
}
function dashCard(label,value,desc,href,ico='dashboard',tone='blue'){
  return `<a class="dashboard-card" href="${href}"><div class="dash-top"><span class="dash-icon ${tone}">${icon(ico)}</span><span class="dash-arrow">›</span></div><div class="dash-label">${esc(label)}</div><div class="dash-value">${value}</div><div class="dash-desc">${esc(desc)}</div></a>`
}
function statCard(label,value,ico='dashboard'){
  return `<div class="stat-card"><div class="metric"><div><div class="dash-label">${esc(label)}</div><div class="value">${esc(value)}</div></div><div class="metric-icon">${icon(ico)}</div></div></div>`
}
function showForgotMessage(){
  const m=$('#msg');
  if(!m)return;
  m.textContent='Password recovery is available only inside this portal. Please contact the assigned administrator if you cannot access your account.';
  m.className='notice';
}
function initPasswordToggles(){
  $$('.password-toggle').forEach(b=>b.addEventListener('click',()=>{const i=b.closest('.input-shell')?.querySelector('input');if(!i)return;const show=i.type==='password';i.type=show?'text':'password';b.textContent=show?'Hide':'Show'}))
}
function formToObject(form){
  return Object.fromEntries(new FormData(form).entries())
}
async function fileAsDataUrl(file){
  if(!file)return null;
  return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Unable to read the selected file.'));r.readAsDataURL(file)})
}
async function logout(){
  if(!confirm('Are you sure you want to log out?'))return;
  const p=location.pathname;
  const dest=p.startsWith('/admin/rotc')?'/admin/rotc/login':p.startsWith('/admin/cwts')?'/admin/cwts/login':p.startsWith('/officer')?'/officer/login':'/student/login';
  try{
    await API.post('/api/auth/logout',{})
  }   finally{
    location.href=dest
  }
}

function showPageLoading(message = 'Loading page...') {
  const content = document.getElementById('content');
  if (!content) return;
  content.innerHTML = `
    <div class="page-loading" role="status" aria-live="polite">
      <span class="page-spinner" aria-hidden="true"></span>
      <strong>${esc(message)}</strong>
    </div>
  `;
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
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Page module failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.dataset.pageModule = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('Page module failed to load.')), { once: true });
    document.body.appendChild(script);
  });
}

async function bootstrapPortalPage({ expectedPortal, shellRole, moduleSrc, render }) {
  showPageLoading();
  try {
    const auth = await guard(expectedPortal);
    if (!auth) return;
    shell(
      shellRole,
      document.body.dataset.title || 'Dashboard',
      document.body.dataset.subtitle || 'BCC NSTP management and monitoring.',
      auth
    );
    await loadScriptOnce(moduleSrc);
    const content = document.getElementById('content');
    if (!content) throw new Error('Page content container was not found.');
    await render(content, auth);
  } catch (error) {
    console.error('Page bootstrap error:', error);
    showPageError(error);
  }
}

// Always close the mobile sidebar after a navigation item is selected.
document.addEventListener('click', (event) => {
  const link = event.target.closest('.nav-link');
  if (!link) return;
  document.getElementById('sidebar')?.classList.remove('open');
});
