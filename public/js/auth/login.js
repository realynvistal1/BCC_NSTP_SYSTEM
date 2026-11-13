async function initLogin() {
  const form = $('#loginForm');
  let submitting = false;
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
    const compactLogin = ['student', 'cwts-instructor', 'instructor'].includes(form.dataset.portal);
    const widget = compactLogin ? document.createElement('div') : container;
    if (compactLogin) {
      widget.className = 'student-login-captcha-widget';
      container.append(widget);
    }
    form.querySelector('[type="submit"]').before(container);
    await Captcha.load('explicit');
    await new Promise(resolve => window.grecaptcha.ready(resolve));
    checkboxId = window.grecaptcha.render(widget, {
      sitekey: config.loginCheckbox.siteKey,
      size: compactLogin ? 'normal' : window.matchMedia('(max-width: 380px)').matches ? 'compact' : 'normal',
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
    if (submitting) return;
    submitting = true;

    const button = form.querySelector('button[type="submit"]');
    const previousMarkup = button?.innerHTML;
    let redirecting = false;
    const message = $('#msg');
    message.textContent = '';
    message.className = 'notice hidden';

    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = '<span class="login-loading-spinner" aria-hidden="true"></span><span>Logging in...</span>';
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
      redirecting = true;
      if (button) button.innerHTML = '<span>Opening dashboard...</span>';
      location.assign(data.redirect || '/student/dashboard');
    } catch (error) {
      if (checkboxId !== null) window.grecaptcha.reset(checkboxId);
      $('#msg').textContent = error.message === 'Please log in again.'
        ? 'Login succeeded but the browser did not keep the session cookie. Try using localhost, allow cookies for this site, then refresh and log in again.'
        : error.message;
      $('#msg').className = 'notice error';
    } finally {
      if (!redirecting) submitting = false;
      if (button && !redirecting) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.innerHTML = previousMarkup;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggles();
  initLogin();
});
