const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { pendingSessions, sessionLabel, sessionKey } = require('../public/js/student/attendance-alerts');

const active = { id: 1, program: 'ROTC', open_date: '2026-09-13T08:00:00', effective_status: 'open', mi_number: 2, mi_type: 'in' };
assert.equal(sessionLabel(active), 'MI (Military Instruction) 2 IN');
assert.equal(sessionLabel({ ...active, program: 'CWTS' }), 'CS (Community Service) 2 IN');
assert.deepEqual(pendingSessions([active], [{ attendance_session_id: '1' }]), []);
assert.deepEqual(pendingSessions(['scheduled', 'closed'].map(effective_status => ({ ...active, effective_status })), []), []);
assert.equal(pendingSessions([{ ...active, effective_status: 'late' }], []).length, 1);
assert.notEqual(sessionKey(active), sessionKey({ ...active, open_date: '2026-09-14T08:00:00' }));

function element() {
  return { textContent: '', hidden: true, disabled: false, setAttribute() {}, querySelector(selector) { return nodes[selector]; } };
}
const nodes = Object.fromEntries(['#attendanceAlertHint', '.attendance-live-alert', '.attendance-live-copy', 'button'].map(key => [key, element()]));
let sessions = [active], history = [], user = { id: 7, portal: 'student' }, nextPoll;
const context = {
  window: { addEventListener() {} },
  document: { createElement: element, querySelector: () => ({ insertAdjacentElement() {} }), addEventListener() {} },
  navigator: {},
  setTimeout: fn => { nextPoll = fn; return 1; }, clearTimeout() {},
  API: { get: async url => url.endsWith('/me') ? { user } : url.endsWith('/sessions') ? sessions : history },
};
vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/student/attendance-alerts'), 'utf8'), context);
const settle = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  context.window.StudentAttendanceAlerts.start(user);
  await settle();
  assert.equal(nodes['.attendance-live-alert'].hidden, false);
  await nextPoll();
  sessions = [{ ...active, id: 2, program: 'CWTS' }];
  await nextPoll();
  assert.match(nodes['.attendance-live-copy'].textContent, /CS \(Community Service\)/);
  history = [{ attendance_session_id: 2 }];
  await nextPoll();
  assert.equal(nodes['.attendance-live-alert'].hidden, true, 'Marked attendance hides the banner');
  sessions = [{ ...active, id: 3 }];
  await nextPoll();
  assert.equal(nodes['.attendance-live-alert'].hidden, false, 'New attendance shows a visual alert');
  nodes.button.onclick();
  await nextPoll();
  assert.equal(nodes['.attendance-live-alert'].hidden, true, 'Dismissal survives polling');
  user = { id: 8, portal: 'student' };
  await nextPoll();
  assert.equal(nodes['.attendance-live-alert'].hidden, true, 'Account change hides alerts');
  assert.equal(nodes['#attendanceAlertHint'].hidden, false);
  console.log('PASS: MI/CS labels, eligibility, silent notifications, dismissal, marked-session filtering, and account-change handling.');
})().catch(error => { console.error(error); process.exitCode = 1; });
