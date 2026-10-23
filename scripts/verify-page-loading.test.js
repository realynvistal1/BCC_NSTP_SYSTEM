const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/shared/layout.js', 'utf8');
const loader = source.slice(source.indexOf('function loadScriptOnce('), source.indexOf('async function bootstrapPortalPage('));
const guard = source.slice(source.indexOf('async function guard('), source.indexOf('function table('));
const bootstrap = source.slice(source.indexOf('async function bootstrapPortalPage('), source.indexOf('// Warm likely destinations'));

function scriptFixture(existing = false) {
  const listeners = new Map(), timers = new Map();
  const script = { dataset: {}, addEventListener(n, f) { listeners.set(n, f); }, removeEventListener(n) { listeners.delete(n); } };
  const context = vm.createContext({
    document: { querySelector: () => existing ? script : null, createElement: () => script, body: { appendChild() {} } },
    setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(loader, context);
  return { context, script, listeners, timers };
}

test('new page module resolves and clears its deadline when loaded', async () => {
  const { context, script, listeners, timers } = scriptFixture();
  const pending = context.loadScriptOnce('/records.js');
  assert.equal(script.src, '/records.js');
  listeners.get('load')();
  await pending;
  assert.equal(script.dataset.loaded, 'true');
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
});

for (const existing of [false, true]) test(`stalled ${existing ? 'existing' : 'new'} page module rejects instead of spinning forever`, async () => {
  const { context, timers, listeners } = scriptFixture(existing);
  const pending = context.loadScriptOnce('/records.js');
  const rejected = assert.rejects(pending, /took too long/);
  [...timers.values()][0]();
  await rejected;
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
});

test('failed module download reports an error and clears its timer', async () => {
  const { context, listeners, timers } = scriptFixture();
  const pending = context.loadScriptOnce('/records.js');
  const rejected = assert.rejects(pending, /could not be loaded/);
  listeners.get('error')();
  await rejected;
  assert.equal(timers.size, 0);
});

test('session network failure has a deadline and does not discard the login', async () => {
  const location = { href: '' };
  const context = vm.createContext({ location, API: { async get(url, options) {
    assert.equal(url, '/api/auth/me');
    assert.equal(options.timeoutMs, 20000);
    throw new Error('Network timeout');
  } }, portalLogin: () => '/login' });
  vm.runInContext(guard, context);
  await assert.rejects(context.guard('rotc-admin'), /Network timeout/);
  assert.equal(location.href, '');
});

test('expired login still redirects to the correct login portal', async () => {
  const location = { href: '' };
  const context = vm.createContext({ location, API: { async get() { throw Object.assign(new Error('Expired'), { status: 401 }); } }, portalLogin: () => '/admin/rotc/login' });
  vm.runInContext(guard, context);
  assert.equal(await context.guard('rotc-admin'), null);
  assert.equal(location.href, '/admin/rotc/login');
});

test('bootstrap displays the failed loading step and leaves records untouched', async () => {
  let error, rendered = false;
  const context = vm.createContext({
    preparePortalShell() {}, showPageLoading() {}, guard: async () => ({ user: {} }), shell() {},
    loadScriptOnce: async () => { throw new Error('Page module timeout'); },
    document: { body: { dataset: {} } }, console: { error() {} }, showPageError(e) { error = e; },
  });
  vm.runInContext(bootstrap, context);
  await context.bootstrapPortalPage({ expectedPortal: 'rotc-admin', shellRole: 'rotc', moduleSrc: '/records.js', render() { rendered = true; } });
  assert.match(error.message, /Preparing this page: Page module timeout/);
  assert.equal(rendered, false);
});
