const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { displaySuffix, enrollmentSuffix } = require('../services/nameSuffixService');

test('no-suffix choices are omitted and save as null', () => {
  for (const value of [undefined, null, '', 'N/A', 'n/a', ' NA ', 'None', 'NONE', 'not applicable', 'null', '-']) {
    assert.equal(displaySuffix(value), '');
    assert.equal(enrollmentSuffix(value), null);
  }
});
test('real suffixes are preserved and enrollment validates choices', () => {
  assert.equal(enrollmentSuffix('Jr'), 'JR.');
  assert.equal(enrollmentSuffix('sr.'), 'SR.');
  for (const suffix of ['II','III','IV','V','VI','VII','VIII','IX','X']) assert.equal(enrollmentSuffix(suffix), suffix);
  assert.equal(displaySuffix('Jr.'), 'Jr.');
  assert.throws(() => enrollmentSuffix('something'), {status:400});
});
test('browser uses matching placeholder rules and dropdown stores blank N/A', () => {
  const source = fs.readFileSync(require.resolve('../public/js/shared/layout.js'),'utf8');
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function displaySuffix('),source.indexOf('function formToObject(')),context);
  for (const value of ['N/A','none','NA','JR.','III','']) assert.equal(context.displaySuffix(value),displaySuffix(value));
  const html = fs.readFileSync(require.resolve('../views/auth/enrollment.html'),'utf8');
  assert.match(html, /<select name="suffix"/);
  assert.match(html, /<option value="">N\/A \(No suffix\)<\/option>/);
  assert.doesNotMatch(html, /<input name="suffix"/);
});
