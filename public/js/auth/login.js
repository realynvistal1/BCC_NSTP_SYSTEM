async function initLogin() {
  const form = $('#loginForm');
  let checkboxId = null;
  let checkboxRequired = false;
  const checkboxReady = (async () => {
    if (!form) return;
    const config = await Captcha.config();
    checkboxRequired = Boolean(config.loginCheckbox?.enabled);
    if (!checkboxRequired) return;
    if (!config.loginCheckbox.siteKey) throw new Error('Security check is not configured correctly. Please contact the administrator.');
    const container = document.createElement('div');
    container.className = 'login-captcha';
    form.querySelector('[type="submit"]').before(container);
    await Captcha.load('explicit');
    await new Promise(resolve => window.grecaptcha.ready(resolve));
    checkboxId = window.grecaptcha.render(container, {
      sitekey: config.loginCheckbox.siteKey,
      size: window.matchMedia('(max-width: 380px)').matches ? 'compact' : 'normal',
      'expired-callback': () => { $('#msg').textContent = 'Security check expired. Please check the box again.'; $('#msg').className = 'notice error'; },
      'error-callback': () => { $('#msg').textContent = 'Unable to load security check. Please refresh and try again.'; $('#msg').className = 'notice error'; },
    });
  })();
  checkboxReady.catch(error => {
    $('#msg').textContent = error.message;
    $('#msg').className = 'notice error';
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"],button');
    const previousText = button?.textContent;

    if (button) {
      button.disabled = true;
      button.textContent = 'Logging in...';
    }

    try {
      await checkboxReady;
      const recaptchaToken = checkboxRequired
        ? window.grecaptcha.getResponse(checkboxId)
        : await Captcha.token('login');
      if (checkboxRequired && !recaptchaToken) throw new Error('Please check “I’m not a robot” before logging in.');
      const data = await API.post('/api/auth/login', {
        portal: form.dataset.portal,
        email: form.email.value,
        password: form.password.value,
        recaptcha_token: recaptchaToken,
      });

      await API.get('/api/auth/me');
      location.assign(data.redirect || '/student/dashboard');
    } catch (error) {
      if (checkboxId !== null) window.grecaptcha.reset(checkboxId);
      $('#msg').textContent = error.message === 'Please log in again.'
        ? 'Login succeeded but the browser did not keep the session cookie. Try using localhost, allow cookies for this site, then refresh and log in again.'
        : error.message;
      $('#msg').className = 'notice error';
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = previousText;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggles();
  initLogin();
});
