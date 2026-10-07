const assert = require('node:assert/strict');
const db = require('../config/database');
const { schedules } = require('../controllers/sharedAdminController');

const originalExecute = db.execute;

function response() {
  return {
    code: 200,
    body: null,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function submit(program, level, year, existing = [], dates = {}) {
  const writes = [];
  db.execute = async (sql, params) => {
    if (sql.includes('FROM enrollment_schedules WHERE program=? ORDER BY')) return [existing];
    if (sql.includes('WHERE program=? AND ms_level=? AND year=?')) return [[]];
    if (sql.startsWith('INSERT INTO enrollment_schedules')) {
      writes.push(params);
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const res = response();
  await schedules({
    method: 'POST',
    params: { program: program.toLowerCase() },
    body: {
      ms_level: level,
      year,
      open_date: dates.open || '2030-06-01T08:00:00',
      deadline: dates.deadline || '2030-06-30T17:00:00',
    },
  }, res);
  return { res, writes };
}

(async () => {
  const missing = await submit('ROTC', '2', '2030-2031');
  assert.equal(missing.res.code, 409);
  assert.match(missing.res.body.message, /next schedule must be MS 1/);
  assert.equal(missing.writes.length, 0);

  const openLevelOne = [{ ms_level: '1', year: '2030-2031', deadline: '2999-06-30T17:00:00' }];
  const stillOpen = await submit('CWTS', '2', '2030-2031', openLevelOne);
  assert.equal(stillOpen.res.code, 409);
  assert.match(stillOpen.res.body.message, /Wait until the CWTS 1 schedule/);
  assert.equal(stillOpen.writes.length, 0);

  const wrongYear = [{ ms_level: '1', year: '2029-2030', deadline: '2020-06-30T17:00:00' }];
  const mismatched = await submit('ROTC', '2', '2030-2031', wrongYear);
  assert.equal(mismatched.res.code, 409);
  assert.equal(mismatched.writes.length, 0);

  const closedLevelOne = [{ ms_level: '1', year: '2030-2031', deadline: '2020-06-30T17:00:00' }];
  const allowed = await submit('CWTS', '2', '2030-2031', closedLevelOne);
  assert.equal(allowed.res.code, 200);
  assert.equal(allowed.writes.length, 1);

  const firstLevel = await submit('ROTC', '1', '2030-2031');
  assert.equal(firstLevel.res.code, 200);
  assert.equal(firstLevel.writes.length, 1);

  const sameDateTime = await submit('ROTC', '1', '2030-2031', [], {
    open: '2030-06-01T08:00:00',
    deadline: '2030-06-01T08:00:00',
  });
  assert.equal(sameDateTime.res.code, 400);
  assert.match(sameDateTime.res.body.message, /later than the opening date\/time/);
  assert.equal(sameDateTime.writes.length, 0);

  const earlierDateTime = await submit('CWTS', '1', '2030-2031', [], {
    open: '2030-06-01T08:00:00',
    deadline: '2030-06-01T07:59:00',
  });
  assert.equal(earlierDateTime.res.code, 400);
  assert.match(earlierDateTime.res.body.message, /later than the opening date\/time/);
  assert.equal(earlierDateTime.writes.length, 0);

  console.log('PASS: schedule progression and strictly later deadline rules are enforced.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  db.execute = originalExecute;
  db.end();
});
