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

function passwordCard() {
  return `
    <section class="settings-card">
      <div class="settings-card-head">
        <div>
          <h2>Change Password</h2>
          <p>Confirm your current password and enter the code sent to your registered email.</p>
        </div>
      </div>

      <form id="passwordForm" class="form-grid">
        <div class="field">
          <label for="settingsCurrentPassword">Current Password</label>
          <div class="settings-password-input">
            <input id="settingsCurrentPassword" type="password" name="currentPassword" autocomplete="current-password" required>
            <button type="button" class="settings-password-toggle" aria-controls="settingsCurrentPassword" aria-label="Show current password">Show</button>
          </div>
        </div>

        <div class="field">
          <label for="settingsNewPassword">New Password</label>
          <div class="settings-password-input">
            <input id="settingsNewPassword" type="password" name="newPassword" autocomplete="new-password" minlength="8" required>
            <button type="button" class="settings-password-toggle" aria-controls="settingsNewPassword" aria-label="Show new password">Show</button>
          </div>
        </div>

        <div class="field">
          <label for="settingsConfirmPassword">Confirm New Password</label>
          <div class="settings-password-input">
            <input id="settingsConfirmPassword" type="password" name="confirmPassword" autocomplete="new-password" minlength="8" required>
            <button type="button" class="settings-password-toggle" aria-controls="settingsConfirmPassword" aria-label="Show password confirmation">Show</button>
          </div>
        </div>

        <div class="field full">
          <button type="button" id="sendPasswordCode" class="btn">Send Verification Code</button>
          <p id="passwordCodeStatus" role="status" aria-live="polite">The code will be sent to the email registered to your account. Check your inbox or spam folder.</p>
        </div>

        <div class="field full">
          <label for="passwordVerificationCode">Email Verification Code</label>
          <input id="passwordVerificationCode" name="verification_code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="6-digit code" aria-describedby="passwordCodeStatus" required>
        </div>

        <div class="field full">
          <button type="submit" class="btn primary">Verify &amp; Update Password</button>
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
    displayNamePart(student.first_name),
    displayNamePart(student.middle_name),
    displayNamePart(student.last_name),
    displayNamePart(student.suffix),
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

function bindSettingsPasswordToggles(form) {
  const passwordToggles = form.querySelectorAll('.settings-password-toggle');
  const setPasswordVisibility = (button, visible) => {
    const input = form.querySelector(`#${button.getAttribute('aria-controls')}`);
    input.type = visible ? 'text' : 'password';
    button.textContent = visible ? 'Hide' : 'Show';
    button.setAttribute('aria-label', button.getAttribute('aria-label').replace(/^(Show|Hide)/, button.textContent));
  };
  passwordToggles.forEach((button) => {
    button.onclick = () => {
      const input = form.querySelector(`#${button.getAttribute('aria-controls')}`);
      setPasswordVisibility(button, input.type === 'password');
    };
  });
  form.addEventListener('reset', () => {
    passwordToggles.forEach((button) => setPasswordVisibility(button, false));
  });
}

function bindSettingsUi() {
  const form = $('#passwordForm');
  if (!form) return;
  bindSettingsPasswordToggles(form);
  const sendButton = form.querySelector('#sendPasswordCode');
  const submitButton = form.querySelector('[type="submit"]');
  const status = form.querySelector('#passwordCodeStatus');
  let busy = false;
  let resendAt = 0;
  let countdown;
  const refreshButtons = () => {
    const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    sendButton.disabled = busy || seconds > 0;
    submitButton.disabled = busy;
    sendButton.textContent = seconds > 0 ? `Resend Code (${seconds}s)` : 'Send Verification Code';
    if (!form.isConnected || seconds === 0) clearInterval(countdown);
  };
  sendButton.onclick = async () => {
    if (busy || Date.now() < resendAt) return;
    const currentPassword = form.elements.currentPassword;
    if (!currentPassword.reportValidity()) return;
    busy = true;
    refreshButtons();
    sendButton.textContent = 'Sending Code...';
    try {
      const response = await API.post('/api/auth/change-password/request-code', {
        currentPassword: currentPassword.value,
      });
      status.textContent = response.message;
      form.elements.verification_code.value = '';
      form.elements.verification_code.focus();
      resendAt = Date.now() + (response.retryAfter || 60) * 1000;
      clearInterval(countdown);
      countdown = setInterval(refreshButtons, 1000);
      toast(response.message);
    } catch (error) {
      status.textContent = error.message;
      toast(error.message, true);
    } finally {
      busy = false;
      refreshButtons();
    }
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;

    const body = formToObject(form);
    if (body.newPassword !== body.confirmPassword) {
      return toast('New password and confirmation do not match.', true);
    }

    busy = true;
    refreshButtons();
    try {
      const response = await API.post('/api/auth/change-password', {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        verification_code: body.verification_code,
      });
      toast(response.message);
      form.reset();
      status.textContent = 'Password changed successfully. Request a new code for any future password change.';
    } catch (error) {
      toast(error.message, true);
    } finally {
      busy = false;
      refreshButtons();
    }
  };
}

function emailChangeCard() {
  return `
    <section class="settings-card email-wizard">
      <div class="email-wizard-header">
        <span class="email-wizard-icon" aria-hidden="true">@</span>
        <div><h2>Change email</h2><p>Update where you receive sign-in and verification emails.</p></div>
      </div>
      <ol class="email-wizard-progress" aria-label="Email change progress">
        <li data-email-step="start" aria-current="step"><span>1</span><strong>New details</strong></li>
        <li data-email-step="old"><span>2</span><strong>Current email</strong></li>
        <li data-email-step="new"><span>3</span><strong>New email</strong></li>
      </ol>
      <form id="emailChangeForm">
        <div id="emailDetailsStep" class="email-wizard-panel">
          <div class="email-step-heading"><span class="email-step-caption">STEP 1 OF 3</span><h3>Enter your new email</h3><p>Use a different email address that you can open.</p></div>
          <div class="email-current-address"><span>YOUR CURRENT EMAIL</span><strong id="currentAdminEmail">Loading...</strong></div>
          <div class="field"><label for="newAdminEmail">New email address</label><input id="newAdminEmail" name="newEmail" type="email" autocomplete="off" maxlength="255" placeholder="Enter your new email address" required></div>
          <div class="field"><label for="emailChangePassword">Current password</label><div class="settings-password-input">
            <input id="emailChangePassword" name="currentPassword" type="password" autocomplete="current-password" placeholder="Enter your account password" required>
            <button type="button" class="settings-password-toggle" aria-controls="emailChangePassword" aria-label="Show current password">Show</button>
          </div></div>
          <p class="email-step-hint">Next, we?ll send a code to your current email to confirm it?s you.</p>
        </div>
        <div id="emailCodeStep" class="email-wizard-panel" hidden>
          <div class="email-step-heading"><span id="emailCodeStepNumber" class="email-step-caption">STEP 2 OF 3</span><h3 id="emailCodeHeading">Check your current email</h3><p id="emailCodeDescription">We sent a 6-digit code to:</p></div>
          <div id="emailCodeDestination" class="email-code-destination"></div>
          <div class="field"><label id="emailChangeCodeLabel" for="emailChangeCode">6-digit verification code</label>
            <input id="emailChangeCode" name="code" class="email-otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" minlength="6" placeholder="000000" aria-describedby="emailCodeHelp emailChangeStatus" required disabled>
          </div>
          <p id="emailCodeHelp" class="email-step-hint">Check your inbox or spam folder. Complete this step within 10 minutes.</p>
          <button id="sendEmailChangeCode" type="button" class="email-resend">Resend code</button>
        </div>
        <div id="emailChangeStatus" class="email-wizard-status" role="status" aria-live="polite" hidden></div>
        <div id="emailWizardActions" class="email-wizard-actions">
          <button id="saveAdminEmail" type="submit" class="btn primary">Continue</button>
          <button id="emailStartOver" type="reset" class="email-start-over" hidden>Start over</button>
        </div>
        <div id="emailSuccessStep" class="email-wizard-success" hidden>
          <span class="email-success-icon" aria-hidden="true">?</span><h3>Email updated</h3>
          <p>Your new email is</p><strong id="emailSavedAddress"></strong>
          <p>Use it to sign in and receive verification codes.</p>
          <button type="reset" class="btn">Done</button>
        </div>
      </form>
    </section>
  `;
}

function bindEmailChangeUi() {
  const form = $('#emailChangeForm');
  if (!form) return;
  bindSettingsPasswordToggles(form);
  const card = form.closest('.email-wizard');
  const send = form.querySelector('#sendEmailChangeCode');
  const submit = form.querySelector('#saveAdminEmail');
  const status = form.querySelector('#emailChangeStatus');
  const reset = form.querySelector('#emailStartOver');
  let phase = 'start';
  let busy = false;
  let currentEmail = '';
  const resendAt = { old: 0, new: 0 };
  let timer;
  const message = (text = '', error = false) => {
    status.textContent = text;
    status.hidden = !text;
    status.classList.toggle('is-error', error);
  };
  const refresh = () => {
    const verifying = phase === 'old' || phase === 'new';
    const destination = phase === 'new' ? 'new' : 'old';
    const seconds = Math.max(0, Math.ceil((resendAt[destination] - Date.now()) / 1000));
    const index = ['start', 'old', 'new', 'done'].indexOf(phase);
    card.querySelectorAll('[data-email-step]').forEach((item, i) => {
      item.classList.toggle('is-complete', i < index);
      if (i === index) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    form.querySelector('#emailDetailsStep').hidden = phase !== 'start';
    form.querySelector('#emailCodeStep').hidden = !verifying;
    form.querySelector('#emailSuccessStep').hidden = phase !== 'done';
    form.querySelector('#emailWizardActions').hidden = phase === 'done';
    reset.hidden = !verifying;
    reset.disabled = busy;
    send.disabled = busy || seconds > 0;
    send.textContent = seconds ? 'Resend code in ' + seconds + 's' : 'Resend code';
    submit.disabled = busy || !currentEmail || (phase === 'start' && seconds > 0);
    submit.textContent = busy ? 'Please wait?' : phase === 'new' ? 'Save new email' : phase === 'old' ? 'Verify & continue' : seconds ? 'Continue in ' + seconds + 's' : 'Continue';
    form.elements.currentPassword.readOnly = busy || phase !== 'start';
    form.elements.newEmail.readOnly = busy || phase !== 'start';
    form.elements.code.disabled = busy || !verifying;
    form.querySelector('#emailCodeStepNumber').textContent = phase === 'new' ? 'STEP 3 OF 3' : 'STEP 2 OF 3';
    form.querySelector('#emailCodeHeading').textContent = phase === 'new' ? 'Verify your new email' : 'Check your current email';
    form.querySelector('#emailCodeDescription').textContent = phase === 'new' ? 'One last check. Enter the code we sent to:' : 'Enter the 6-digit code we sent to:';
    form.querySelector('#emailCodeDestination').textContent = phase === 'new' ? form.elements.newEmail.value.trim() : currentEmail;
    if (!form.isConnected || !seconds) clearInterval(timer);
  };
  const request = async step => {
    if (busy) return;
    const body = formToObject(form);
    busy = true;
    message();
    refresh();
    try {
      const response = await API.post('/api/auth/change-email/' + step, body);
      if (response.email) {
        currentEmail = response.email;
        form.reset();
        phase = 'done';
        $('#currentAdminEmail').textContent = currentEmail;
        form.querySelector('#emailSavedAddress').textContent = currentEmail;
      } else {
        phase = response.phase;
        resendAt[phase] = Date.now() + (response.retryAfter || 60) * 1000;
        form.elements.code.value = '';
        clearInterval(timer);
        timer = setInterval(refresh, 1000);
        if (step === 'request-new' || (step === 'request-old' && body.code)) message('A new code is on its way. Use the latest email.');
      }
    } catch (error) {
      message(error.message, true);
    } finally {
      busy = false;
      refresh();
      if (phase === 'old' || phase === 'new') form.elements.code.focus();
      if (phase === 'done') form.querySelector('#emailSuccessStep button').focus();
    }
  };
  send.onclick = () => {
    if (busy || Date.now() < resendAt[phase] || !['old', 'new'].includes(phase)) return;
    return request(phase === 'new' ? 'request-new' : 'request-old');
  };
  form.onsubmit = event => {
    event.preventDefault();
    if (busy || phase === 'done' || !currentEmail || !form.reportValidity()) return;
    if (phase === 'start') {
      if (Date.now() < resendAt.old) return;
      if (form.elements.newEmail.value.trim().toLowerCase() === currentEmail.toLowerCase()) {
        message('Enter a different email address. This is already your current email.', true);
        form.elements.newEmail.focus();
        return;
      }
    }
    return request(phase === 'start' ? 'request-old' : phase === 'old' ? 'verify-old' : 'confirm');
  };
  form.addEventListener('reset', () => {
    phase = 'start';
    message();
    refresh();
    clearInterval(timer);
    if (resendAt.old > Date.now()) timer = setInterval(refresh, 1000);
  });
  refresh();
  API.get('/api/auth/change-email').then(response => {
    currentEmail = response.email;
    $('#currentAdminEmail').textContent = currentEmail;
    refresh();
  }).catch(error => {
    $('#currentAdminEmail').textContent = 'Unable to load email';
    message(error.message + ' Refresh Settings to try again.', true);
  });
}

async function renderSettingsPage(content, role) {
  applySettingsAppearance();

  if (role === 'student') {
    const profile = await API.get('/api/student/profile');
    content.innerHTML = `
      <div class="settings-stack">
        ${studentProfile(profile.student || {})}
        ${passwordCard()}
      </div>
    `;
  } else {
    content.innerHTML = `
      <div class="settings-stack">
        ${passwordCard()}
        ${emailChangeCard()}
      </div>
    `;
  }

  bindSettingsUi();
  bindEmailChangeUi();
}

applySettingsAppearance();
