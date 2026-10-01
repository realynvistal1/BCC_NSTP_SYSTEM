const assert = require('node:assert/strict');
const serialNumbers = require('../services/serialNumberService');

assert.equal(
  serialNumbers.normalizeSerialNumber('R23-005118', 'ROTC'),
  'BO-R23-005118 PA (Res)'
);
assert.equal(serialNumbers.formatRotcCore('R23005118'), 'R23-005118');
assert.equal(
  serialNumbers.normalizeSerialNumber('R23005118', 'ROTC'),
  'BO-R23-005118 PA (Res)'
);
assert.equal(
  serialNumbers.normalizeSerialNumber('bo-r23-005118 pa (res)', 'ROTC'),
  'BO-R23-005118 PA (Res)'
);
assert.equal(serialNumbers.normalizeSerialNumber('R23-5118', 'ROTC'), null);
assert.equal(
  serialNumbers.normalizeSerialNumber('07-039395-24', 'CWTS'),
  'C-07-039395-24'
);
assert.equal(serialNumbers.formatCwtsCore('0703939524'), '07-039395-24');
assert.equal(
  serialNumbers.normalizeSerialNumber('0703939524', 'CWTS'),
  'C-07-039395-24'
);
assert.equal(
  serialNumbers.normalizeSerialNumber('c-07-039395-24', 'CWTS'),
  'C-07-039395-24'
);
assert.equal(serialNumbers.normalizeSerialNumber('07-39395-24', 'CWTS'), null);

console.log('PASS: ROTC and CWTS serial numbers use their required certificate formats.');
