const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let poll, blocked = false;
let user = { id: 1, portal: 'officer' };
let log = [{ id: 1, first_name: 'Juan', last_name: 'Cruz', student_id: '123', mi_number: 1, mi_type: 'in', battalion: 1, company: 'Alpha', platoon: 1, ms_level: 1, school_year: '2026-2027', previous_status: 'present', status: 'absent', reason: '<img src=x onerror=alert(1)>', verifier_first_name: 'Anna', verifier_last_name: 'Santos', verified_at: '2026-10-04 11:00:00' }];
const dialogs = [], events = [], storage = new Map();
const context = {
  console, CustomEvent: function(type) { this.type = type; },
  esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
  icon: () => '<svg></svg>',
  localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  API: { get: async url => url.endsWith('/me') ? { user } : log },
  window: { addEventListener() {}, dispatchEvent(event) { events.push(event.type); }, setInterval(fn) { poll = fn; } },
  document: { hidden: false, addEventListener() {}, querySelector: () => blocked ? {} : null,
    body: { appendChild() {} },
    createElement() {
      const dialog = { open: false, buttons: [{}, {}], historyLink: {}, setAttribute() {},
        querySelector() { return this.historyLink; },
        querySelectorAll() { return this.buttons; }, addEventListener(type, fn) { if (type === 'close') this.onclose = fn; },
        showModal() { this.open = true; }, close() { this.open = false; this.onclose(); }, remove() {},
      }; dialogs.push(dialog); return dialog;
    },
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/js/shared/layout.js', 'utf8'), context);
const cwts=process.argv.includes('--cwts');
if(cwts)log=log.map(row=>({...row,program:'CWTS',verifier_role:'Instructor'}));
vm.runInContext(fs.readFileSync(cwts?'public/js/officer/cwts-attendance-updates.js':'public/js/officer/attendance-updates.js', 'utf8'), context);
if(cwts)context.window.DirectorAttendanceUpdates=context.window.DirectorCWTSAttendanceUpdates;
(async () => {
  context.window.DirectorAttendanceUpdates.start(user);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0].innerHTML, /Anna Santos/);
  assert.match(dialogs[0].innerHTML, /update-status absent/);
  assert.match(dialogs[0].innerHTML, /&lt;img/);
  assert(!dialogs[0].innerHTML.includes('<img'), 'Reasons are escaped before rendering');
  await poll(); assert.equal(dialogs.length, 1, 'An open popup is not duplicated');
  dialogs[0].close(); await poll(); assert.equal(dialogs.length, 1, 'Read updates stay dismissed');
  log = [{ ...log[0], id: 2 }]; blocked = true;
  await poll(); assert.equal(dialogs.length, 1, 'Updates do not interrupt another open form');
  blocked = false; await poll(); assert.equal(dialogs.length, 2);
  assert(events.includes('director-attendance-updated'), 'New updates refresh Director attendance');
  dialogs[1].close(); user = { id: 2, portal: 'officer' }; log = [{ ...log[0], id: 3 }];
  await poll(); assert.equal(dialogs.length, 2, 'Account changes stop notifications');
  console.log('PASS: attendance popup names, safe reason rendering, dismissal, live refresh, open-form protection and account changes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
