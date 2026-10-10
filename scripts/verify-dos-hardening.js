const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createRateLimit, createConcurrencyLimit } = require('../middleware/rateLimitMiddleware');
function response() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.set = (name, value) => { res.headers[name] = value; return res; };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; return res; };
  return res;
}
async function main() {
  const rate = createRateLimit({ keyPrefix: 'test-rate', windowMs: 60000, maxRequests: 2 });
  let admitted = 0;
  for (let i = 0; i < 4; i++) {
    const res = response();
    rate({ip:'test-client'}, res, () => admitted++);
    assert.equal(res.statusCode, i < 2 ? 200 : 429);
  }
  assert.equal(admitted, 2);
  const realNow = Date.now;
  let clock = 1000000;
  Date.now = () => clock;
  try {
    const burst = createRateLimit({keyPrefix:'short-retry',windowMs:10000,maxRequests:2});
    for (let i = 0; i < 2; i++) burst({ip:'school'}, response(), () => {});
    const rejected = response();
    burst({ip:'school'}, rejected, () => assert.fail('burst limit bypassed'));
    assert.equal(rejected.statusCode, 429);
    assert.equal(rejected.headers['Retry-After'], '10');
    clock += 9000;
    const retry = response();
    burst({ip:'school'}, retry, () => assert.fail('window has not reset'));
    assert.equal(retry.headers['Retry-After'], '1');
    clock += 1000;
    let resumed = false;
    burst({ip:'school'}, response(), () => { resumed = true; });
    assert(resumed, 'ordinary burst must recover without a long IP penalty');
  } finally { Date.now = realNow; }

  const limit = createConcurrencyLimit({ keyPrefix: 'test-concurrency', maxConcurrent: 1, maxTotalConcurrent: 2 });
  const first = response(), second = response();
  limit({ip:'one'}, first, () => {});
  const same = response(); limit({ip:'one'}, same, () => assert.fail('per-IP limit bypassed'));
  assert.equal(same.statusCode, 429);
  limit({ip:'two'}, second, () => {});
  const busy = response(); limit({ip:'three'}, busy, () => assert.fail('global limit bypassed'));
  assert.equal(busy.statusCode, 503);
  first.emit('finish'); first.emit('close');
  const third = response(); limit({ip:'three'}, third, () => {});
  assert.equal(third.statusCode, 200);
  const stillBusy = response(); limit({ip:'four'}, stillBusy, () => assert.fail('double release allowed excess work'));
  assert.equal(stillBusy.statusCode, 503);
  second.emit('close'); third.emit('finish');

  // Load the real middleware order without startup migrations or database-backed routes.
  process.env.JWT_SECRET = 'test-only-secret-for-security-regression';
  const filename = path.resolve(__dirname, '../server.js');
  let source = fs.readFileSync(filename, 'utf8');
  assert(source.includes('startServer().catch('));
  source = source.replace('startServer().catch(', 'Promise.resolve().catch(');
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = name => name.startsWith('./routes/')
    ? originalRequire('express').Router() : originalRequire(name);
  loaded._compile(source + '\nmodule.exports = app;\n', filename);
  const app = loaded.exports;
  const stack = app.router.stack;
  const parserIndex = stack.findIndex(layer => layer.name === 'jsonParser');
  for (const name of ['rateLimit', 'concurrencyLimit']) {
    const matches = stack.map((layer, index) => layer.name === name ? index : -1).filter(index => index >= 0);
    assert.equal(matches.length, 2);
    assert(matches.every(index => index < parserIndex), 'limit must run before body parsing');
  }
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/api/health';
  try {
    let res = await fetch(url); assert.equal(res.status, 200);
    res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{bad'});
    assert.equal(res.status, 400);
    res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json','Content-Encoding':'gzip'}, body:'invalid'});
    assert.equal(res.status, 415);
    res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({data:'a'.repeat(10 * 1024 * 1024)})});
    assert.equal(res.status, 413);
    res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:Array.from({length:101},(_,i)=>'k'+i+'=v').join('&')});
    assert.equal(res.status, 413);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  const dbPath = require.resolve('../config/database');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    async execute() { const error = new Error('SQL secret_table internal details'); error.code = 'ER_TEST'; throw error; },
    async getConnection() { throw new Error('SQL secret_table internal details'); },
  }};
  for (const controller of ['studentController', 'officerController', 'sharedAdminController']) {
    const res = response();
    await require('../controllers/' + controller).dashboard({ user: { id: 1, program: 'ROTC', portal: 'rotc-admin' }, query: {}, baseUrl: '/api/admin/rotc' }, res);
    assert.equal(res.statusCode, 500);
    assert(!JSON.stringify(res.body).includes('secret_table'), 'database details leaked');
  }
  const bounded = createRateLimit({keyPrefix:'capacity-test',windowMs:60000,maxRequests:2});
  let rejected = 0;
  for (let i = 0; i < 10010; i++) {
    const res = response();
    bounded({ip:'capacity-' + i}, res, () => {});
    if (res.statusCode === 503) rejected++;
  }
  assert(rejected > 0, 'client tracking must stop growing at capacity');
  console.log('DoS hardening verification passed: rate blocks, per-IP/global concurrency, single release, pre-parser limits, malformed/oversized/compressed bodies and form field bounds.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
