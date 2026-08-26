const API = {
  async req(url, options = {}) {
    const isForm = options.body instanceof FormData;
    const headers = isForm
      ? (options.headers || {})
      : {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };

    const response = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
    });

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }

    return data;
  },

  get(url) {
    return this.req(url);
  },

  post(url, body) {
    return this.req(url, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  patch(url, body) {
    return this.req(url, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
};

const Captcha = {
  configPromise: null,
  scriptPromise: null,
  scriptUrls(siteKey) {
    const encodedKey = encodeURIComponent(siteKey);
    return [
      `https://www.google.com/recaptcha/api.js?render=${encodedKey}`,
      `https://www.recaptcha.net/recaptcha/api.js?render=${encodedKey}`,
    ];
  },

  async config() {
    if (!this.configPromise) {
      this.configPromise = API.get('/api/auth/captcha-config').catch((error) => {
        this.configPromise = null;
        throw error;
      });
    }

    return this.configPromise;
  },

  async load(siteKey) {
    if (window.grecaptcha?.execute) {
      return;
    }

    if (!this.scriptPromise) {
      this.scriptPromise = (async () => {
        const existing = document.querySelector('script[data-recaptcha="true"]');
        if (existing) {
          await new Promise((resolve, reject) => {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', () => reject(new Error('Unable to load security check.')), { once: true });
          });
          return;
        }

        let lastError = null;

        for (const scriptUrl of this.scriptUrls(siteKey)) {
          try {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = scriptUrl;
              script.async = true;
              script.defer = true;
              script.dataset.recaptcha = 'true';
              script.onload = () => resolve();
              script.onerror = () => {
                script.remove();
                reject(new Error('Unable to load security check.'));
              };
              document.head.appendChild(script);
            });

            if (window.grecaptcha?.execute) {
              return;
            }
          } catch (error) {
            lastError = error;
          }
        }

        throw lastError || new Error('Unable to load security check.');
      })().catch((error) => {
        this.scriptPromise = null;
        throw error;
      });
    }

    await this.scriptPromise;
  },

  async token(action) {
    const config = await this.config();
    if (!config?.enabled) {
      return '';
    }

    if (!config.siteKey) {
      throw new Error('Security check is not configured correctly.');
    }

    try {
      await this.load(config.siteKey);
    } catch (error) {
      const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (config.localhostBypass && isLocalHost) {
        return '';
      }
      throw error;
    }
    await new Promise((resolve) => window.grecaptcha.ready(resolve));
    return await window.grecaptcha.execute(config.siteKey, { action });
  },
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

function esc(value = '') {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (match) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[match])
  );
}

function icon(name) {
  const paths = {
    dashboard: 'M3 12l9-9 9 9v8a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-8z',
    enrollment: 'M8 7V3m8 4V3M5 11h14M6 5h12a2 2 0 012 2v12H4V7a2 2 0 012-2z',
    platoon: 'M17 20h5v-2a4 4 0 00-4-4h-1M9 20H2v-2a4 4 0 014-4h3m6 6v-2a4 4 0 00-8 0v2m4-9a4 4 0 100-8 4 4 0 000 8zm7 0a3 3 0 100-6',
    attendance: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-13v5l3 2',
    grades: 'M4 19h16M6 16V9m6 7V5m6 11v-4',
    serial: 'M7 20l4-16m2 16l4-16M6 9h14M4 15h14',
    settings: 'M12 15.5A3.5 3.5 0 1012 8a3.5 3.5 0 000 7.5zm8.5-3.5l-2.1-.8a7 7 0 00-.6-1.5l.9-2-2.4-2.4-2 .9a7 7 0 00-1.5-.6L12 3.5H8.6l-.8 2.1a7 7 0 00-1.5.6l-2-.9L1.9 7.7l.9 2a7 7 0 00-.6 1.5L.1 12l2.1.8a7 7 0 00.6 1.5l-.9 2 2.4 2.4 2-.9a7 7 0 001.5.6l.8 2.1H12l.8-2.1a7 7 0 001.5-.6l2 .9 2.4-2.4-.9-2a7 7 0 00.6-1.5l2.1-.8z',
    records: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
    schedule: 'M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 011 1v14H4V6a1 1 0 011-1z',
    offense: 'M12 9v4m0 4h.01M10.3 3.7L2.4 17.4A2 2 0 004.1 20h15.8a2 2 0 001.7-2.6L13.7 3.7a2 2 0 00-3.4 0z',
    logout: 'M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 012 2v12a2 2 0 01-2 2h-5',
    users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m7-10a4 4 0 100-8 4 4 0 000 8zm7 0a3 3 0 100-6',
    location: 'M12 21s6-5.3 6-12A6 6 0 106 9c0 6.7 6 12 6 12zm0-9a3 3 0 100-6 3 3 0 000 6z',
    refresh: 'M20 6v6h-6M4 18v-6h6M5.5 9A7 7 0 0118 6m.5 9A7 7 0 016 18',
    check: 'M5 12l4 4L19 6',
  };
  const path = paths[name] || paths.dashboard;

  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

function badge(status) {
  const normalized = String(status || '').toLowerCase();
  const tone = normalized.includes('approve')
    || normalized === 'present'
    || normalized === 'passed'
    || normalized === 'open'
    ? 'success'
    : normalized.includes('reject')
      || normalized === 'absent'
      || normalized === 'failed'
      || normalized === 'closed'
      ? 'danger'
      : 'warning';

  return `<span class="badge ${tone}">${esc(status || 'N/A')}</span>`;
}

function toast(message, error = false) {
  let node = $('#toast');

  if (!node) {
    node = document.createElement('div');
    node.id = 'toast';
    document.body.appendChild(node);
  }

  node.style.background = error ? '#dc2626' : '#16a34a';
  node.textContent = message;
  node.classList.remove('hidden');

  setTimeout(() => node.classList.add('hidden'), 3200);
}
