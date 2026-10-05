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
let offense = null;
const warnings = [], updates = [], dialogs = [];
let assignments = [];
const storage = new Map();
function createElement(tag) {
  if (tag !== 'dialog') return element();
  const dialog = { ...element(), style: {}, open: false, links: { a: {}, button: {} },
    querySelector(selector) { return this.links[selector]; },
    querySelectorAll() { return [this.links.button]; },
    addEventListener(type, callback) { if (type === 'close') this.onclose = callback; },
    showModal() { this.open = true; }, close() { this.open = false; this.onclose(); }, remove() {},
  };
  dialogs.push(dialog);
  return dialog;
}
const context = {
  window: { addEventListener() {}, dispatchEvent(event) { updates.push(event.detail.history); } },
  CustomEvent: function(type, options) { this.type = type; this.detail = options.detail; },
  showStudentAttendanceOffense: async value => { if (value) warnings.push(value); },
  document: { createElement, body: { appendChild() {} }, getElementById: () => null, querySelector: () => ({ insertAdjacentElement() {} }), addEventListener() {} },
  localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  esc: value => String(value),
  icon: () => '<svg></svg>',
  navigator: {},
  setTimeout: fn => { nextPoll = fn; return 1; }, clearTimeout() {},
  API: { get: async url => url.endsWith('/me') ? { user } : url.endsWith('/assignments') ? assignments : url.endsWith('/attendance-offense') ? offense : url.endsWith('/sessions') ? sessions : history },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../public/js/shared/layout'), 'utf8'), context);
context.showStudentAttendanceOffense = async value => { if (value) warnings.push(value); };
vm.runInContext(fs.readFileSync(require.resolve('../public/js/student/attendance-alerts'), 'utf8'), context);
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
  history = [{ attendance_session_id: 2, status: 'absent', verified_at: '2026-10-04 10:00:00' }];
  offense = { offend: 1, warning_acknowledged_at: null };
  await nextPoll();
  assert.equal(warnings.at(-1).offend, 1, 'A new correction triggers a warning without navigating');
  assert.equal(updates.at(-1)[0].status, 'absent', 'History receives the corrected status');
  const updateCount = updates.length;
  await nextPoll();
  assert.equal(updates.length, updateCount, 'Unchanged history does not rerender');
  offense = { offend: 2, settled: 0 };
  await nextPoll();
  assert.equal(warnings.at(-1).offend, 2, 'Second offense reaches the existing restriction popup');
  offense = null;
  user.program = 'ROTC';
  assignments = [{ id: 10, battalion: 1, company: 'Alpha', platoon: 2, ms_level: 1, school_year: '2026-2027', mi_number: 3, mi_type: 'out', updated_at: '2026-10-04 11:00:00' }];
  await nextPoll();
  assert.equal(dialogs.length, 1, 'A new Director assignment pops up in the open student portal');
  assert.match(dialogs[0].innerHTML, /Battalion 1 \/ Alpha \/ Platoon 2/);
  assert.match(dialogs[0].innerHTML, /MI 3 \/ OUT/);
  dialogs[0].close();
  await nextPoll();
  assert.equal(dialogs.length, 1, 'Acknowledged assignments do not repeatedly pop up');
  assignments[0].updated_at = '2026-10-04 12:00:00';
  await nextPoll();
  assert.equal(dialogs.length, 2, 'A changed assignment is announced again');
  user = { id: 8, portal: 'student' };
  await nextPoll();
  assert.equal(nodes['.attendance-live-alert'].hidden, true, 'Account change hides alerts');
  assert.equal(nodes['#attendanceAlertHint'].hidden, false);
  console.log('PASS: session alerts, corrected history events, live offense warnings, assignment popups, dismissal and account-change handling.');
})().catch(error => { console.error(error); process.exitCode = 1; });
