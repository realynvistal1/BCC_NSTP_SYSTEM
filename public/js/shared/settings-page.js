const SETTINGS_ACCENTS = {
  ocean: ['#0284c7', '#06b6d4'],
  emerald: ['#059669', '#14b8a6'],
  violet: ['#7c3aed', '#a855f7'],
};

function applySettingsAppearance() {
  const theme = localStorage.getItem('bcc-theme') || 'light';
  const accent = localStorage.getItem('bcc-accent') || 'ocean';
  const colors = SETTINGS_ACCENTS[accent] || SETTINGS_ACCENTS.ocean;

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--accent-1', colors[0]);
  document.documentElement.style.setProperty('--accent-2', colors[1]);
}

function appearanceCard() {
  const theme = localStorage.getItem('bcc-theme') || 'light';
  const accent = localStorage.getItem('bcc-accent') || 'ocean';

  return `
    <section class="settings-card">
      <div class="settings-card-head">
        <div>
          <h2>Appearance</h2>
          <p>Choose how the system looks while you are using it.</p>
        </div>
        <span class="settings-pill">${esc(theme)} mode</span>
      </div>

      <h3>Theme</h3>
      <div class="appearance-options">
        ${['light', 'dark', 'system'].map((option) => `
          <button class="appearance-option ${theme === option ? 'selected' : ''}" data-theme="${option}">
            <strong>${option[0].toUpperCase() + option.slice(1)}</strong>
            <span>${option === 'light'
              ? 'Bright interface for daytime use.'
              : option === 'dark'
                ? 'Dimmed interface for nighttime use.'
                : 'Match your device theme automatically.'}</span>
          </button>
        `).join('')}
      </div>

      <h3>Gradient Theme</h3>
      <div class="accent-options">
        ${[
          ['ocean', 'Ocean'],
          ['emerald', 'Emerald'],
          ['violet', 'Violet'],
        ].map(([value, label]) => `
          <button class="accent-option ${accent === value ? 'selected' : ''}" data-accent="${value}">
            <span class="accent-preview ${value}"></span>
            <strong>${label}</strong>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function passwordCard() {
  return `
    <section class="settings-card">
      <div class="settings-card-head">
        <div>
          <h2>Change Password</h2>
          <p>Use your current password to protect account changes.</p>
        </div>
      </div>

      <form id="passwordForm" class="form-grid">
        <div class="field">
          <label>Current Password</label>
          <input type="password" name="currentPassword" required>
        </div>

        <div class="field">
          <label>New Password</label>
          <input type="password" name="newPassword" minlength="8" required>
        </div>

        <div class="field">
          <label>Confirm New Password</label>
          <input type="password" name="confirmPassword" minlength="8" required>
        </div>

        <div class="field full">
          <button class="btn primary">Update Password</button>
        </div>
      </form>
    </section>
  `;
}

function row(label, value) {
  return `
    <div class="profile-row">
      <span>${esc(label)}</span>
      <strong>${esc(value || 'Not provided')}</strong>
    </div>
  `;
}

function assignment(student) {
  if (student.nstp_component === 'CWTS') {
    return student.company ? `Company ${student.company}` : 'Not assigned yet';
  }

  if (Number(student.willing_to_take_advance_course)) return 'Advance Course';
  if (student.special_unit) return student.special_unit;

  return [
    student.battalion ? `Battalion ${student.battalion}` : '',
    student.rotc_company ? `Company ${student.rotc_company}` : '',
    student.rotc_platoon ? `Platoon ${student.rotc_platoon}` : '',
  ].filter(Boolean).join(' - ') || 'Not assigned yet';
}

function studentProfile(student) {
  const name = [
    student.first_name,
    student.middle_name,
    student.last_name,
    student.suffix,
  ].filter(Boolean).join(' ');
  const temporaryAddress = [
    student.temporary_barangay,
    student.temporary_municipality,
    student.temporary_province,
  ].filter(Boolean).join(', ');
  const permanentAddress = [
    student.permanent_barangay,
    student.permanent_municipality,
    student.permanent_province,
  ].filter(Boolean).join(', ');

  return `
    <section class="settings-card student-profile-settings">
      <div class="profile-hero">
        ${student.photo
          ? `<img src="${student.photo}" alt="Student photo">`
          : '<div class="profile-initials">ST</div>'}
        <div>
          <h2>${esc(name)}</h2>
          <p>View your personal and academic information.</p>
          <div class="actions">
            ${badge(student.nstp_component || 'NSTP')}
            ${badge(student.status || 'student')}
          </div>
        </div>
      </div>
    </section>

    <section class="settings-card">
      <h2>Personal Information</h2>
      ${row('Student ID', student.student_id)}
      ${row('Full Name', name)}
      ${row('Sex', student.sex)}
      ${row('Birthdate', student.birthdate ? String(student.birthdate).slice(0, 10) : '')}
      ${row('Religion', student.religion)}
      ${row('Place of Birth', student.place_of_birth)}
      ${row('Contact Number', student.contact_number)}
      ${row('Email', student.email)}
      ${row('Username', student.username)}
    </section>

    <section class="settings-card">
      <h2>Address Information</h2>
      ${row('Temporary Address', temporaryAddress)}
      ${row('Permanent Address', permanentAddress)}
    </section>

    <section class="settings-card">
      <h2>Family & Emergency Contact</h2>
      ${row('Father', student.father_name)}
      ${row('Father Occupation', student.father_occupation)}
      ${row('Mother', student.mother_name)}
      ${row('Mother Occupation', student.mother_occupation)}
      ${row('Emergency Contact', student.emergency_contact_name)}
      ${row('Relationship', student.emergency_contact_relationship)}
      ${row('Emergency Number', student.emergency_contact_contact_number)}
    </section>

    <section class="settings-card">
      <h2>Academic & NSTP Information</h2>
      ${row('Course', student.course)}
      ${row('Year Level', student.year_level)}
      ${row('NSTP Component', student.nstp_component)}
      ${row('Assignment', assignment(student))}
      ${row('Advance Course', Number(student.willing_to_take_advance_course) ? 'Enrolled' : 'Not enrolled')}
    </section>
  `;
}

function bindSettingsUi() {
  $$('[data-theme]').forEach((button) => {
    button.onclick = () => {
      localStorage.setItem('bcc-theme', button.dataset.theme);
      applySettingsAppearance();
      location.reload();
    };
  });

  $$('[data-accent]').forEach((button) => {
    button.onclick = () => {
      localStorage.setItem('bcc-accent', button.dataset.accent);
      applySettingsAppearance();
      location.reload();
    };
  });

  const form = $('#passwordForm');
  if (!form) return;

  form.onsubmit = async (event) => {
    event.preventDefault();

    const body = formToObject(form);
    if (body.newPassword !== body.confirmPassword) {
      return toast('New password and confirmation do not match.', true);
    }

    try {
      const response = await API.post('/api/auth/change-password', {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });
      toast(response.message);
      form.reset();
    } catch (error) {
      toast(error.message, true);
    }
  };
}

async function renderSettingsPage(content, role) {
  applySettingsAppearance();

  if (role === 'student') {
    const auth = await API.get('/api/auth/me');
    content.innerHTML = `
      <div class="settings-stack">
        ${studentProfile(auth.user)}
        ${appearanceCard()}
        ${passwordCard()}
      </div>
    `;
  } else {
    content.innerHTML = `
      <div class="settings-stack">
        ${appearanceCard()}
        ${passwordCard()}
      </div>
    `;
  }

  bindSettingsUi();
}

applySettingsAppearance();
