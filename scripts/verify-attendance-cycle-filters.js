const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/officer/view-attendance.js', 'utf8');
const fields = { viewProgram: { value: 'ROTC' }, viewCycle: { value: '2026-2027__1' }, viewMI: { value: '1' }, viewType: { value: 'in' } };
const context = vm.createContext({ $: selector => fields[selector.slice(1)], officerSessions: [
  { id: 1, program: 'ROTC', school_year: '2026-2027', ms_level: '1', mi_number: 1, mi_type: 'in' },
  { id: 2, program: 'ROTC', school_year: '2026-2027', ms_level: '2', mi_number: 1, mi_type: 'in' },
  { id: 3, program: 'ROTC', school_year: '2025-2026', ms_level: '1', mi_number: 1, mi_type: 'in' },
  { id: 4, program: 'ROTC', school_year: '2026-2027', ms_level: '1', mi_number: 1, mi_type: 'out' },
  { id: 5, program: 'CWTS', school_year: '2026-2027', ms_level: '1', mi_number: 1, mi_type: 'in' },
] });
vm.runInContext(source.slice(source.indexOf('function attendanceCycleKey('), source.indexOf('function populateOfficerFilters(')), context);
vm.runInContext(source.slice(source.indexOf('function filteredOfficerSessions('), source.indexOf('function renderOfficerAttendanceTable(')), context);
const ids = () => Array.from(context.filteredOfficerSessions(), session => session.id);
assert.deepEqual(ids(), [1]);
fields.viewCycle.value = '2026-2027__2';
assert.deepEqual(ids(), [2]);
fields.viewCycle.value = '2025-2026__1';
assert.deepEqual(ids(), [3]);
fields.viewCycle.value = '';
assert.deepEqual(ids(), []);
assert.equal(context.attendanceCycleKey({ school_year: ' 2026-2027 ', ms_level: 1 }), '2026-2027__1');
assert.equal(context.buildCycles(context.officerSessions)[0].key, '2026-2027__2');
console.log('PASS: MI 1 Time In stays separate by school year, level, type, and program; no mixed-cycle fallback.');
