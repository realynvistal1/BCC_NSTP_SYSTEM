const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const parser = require('../middleware/requestBodyMiddleware');

test('enrollment body allowance is bounded and limited to enrollment POST requests', async () => {
  const app = express();
  app.use(parser);
  app.use((req, res) => res.json({ok: true}));
  app.use((err, req, res, next) => res.status(err.status || 500).json({type: err.type}));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  async function send(path, body) {
    return fetch(url + path, {method:'POST', headers:{'Content-Type':'application/json'}, body});
  }
  try {
    const largestValidSet = JSON.stringify({files:Array(4).fill('a'.repeat(4 * Math.ceil(5 * 1024 * 1024 / 3)))});
    for (const path of ['/api/student/register', '/api/student/re-enroll']) {
      assert.equal((await send(path, largestValidSet)).status, 200);
    }
    const oversized = JSON.stringify({file:'a'.repeat(28 * 1024 * 1024)});
    assert.equal((await send('/api/student/register', oversized)).status, 413);
    const medium = JSON.stringify({file:'a'.repeat(11 * 1024 * 1024)});
    assert.equal((await send('/api/auth/login', medium)).status, 413);
    assert.equal((await send('/api/student/register/other', medium)).status, 413);
    assert.equal((await send('/api/student/register', '{broken')).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
