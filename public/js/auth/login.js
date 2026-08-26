async function initLogin() {
  const form = $('#loginForm');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"],button');
    const previousText = button?.textContent;

    if (button) {
      button.disabled = true;
      button.textContent = 'Signing in...';
    }

    try {
      const recaptchaToken = await Captcha.token('login');
      const data = await API.post('/api/auth/login', {
        email: form.email.value,
        password: form.password.value,
        recaptcha_token: recaptchaToken,
      });

      await API.get('/api/auth/me');
      location.assign(data.redirect || '/student/dashboard');
    } catch (error) {
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
