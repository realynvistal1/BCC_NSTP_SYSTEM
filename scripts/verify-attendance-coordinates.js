const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseCoordinates } = require('../services/attendanceService');
for (const bad of ['', '   ', null, undefined, false, true, [], {}, 'NaN', Infinity]) {
  assert.equal(parseCoordinates(bad, 123.95), null);
  assert.equal(parseCoordinates(9.65, bad), null);
}
for (const pair of [[91, 123], [-91, 123], [9, 181], [9, -181]]) {
  assert.equal(parseCoordinates(...pair), null);
}
assert.deepEqual(parseCoordinates('9.6501234', '123.9505678'), { latitude: 9.6501234, longitude: 123.9505678 });
assert.deepEqual(parseCoordinates(0, 0), { latitude: 0, longitude: 0 });
const source = fs.readFileSync('public/js/officer/create-attendance.js', 'utf8');
const fields = { attendanceLatitude: { value: '' }, attendanceLongitude: { value: '' } };
const context = vm.createContext({ document: { getElementById: id => fields[id] } });
vm.runInContext(source.slice(source.indexOf('function readAttendanceLocation()'), source.indexOf('function formatAttendanceTime(')), context);
assert.equal(context.readAttendanceLocation(), null);
fields.attendanceLatitude.value = '9.6501234';
fields.attendanceLongitude.value = '123.9505678';
assert.equal(context.readAttendanceLocation().longitude, 123.9505678);
fields.attendanceLatitude.value = '91';
assert.equal(context.readAttendanceLocation(), null);
console.log('PASS: blank and invalid coordinates rejected; precision and valid zero coordinates preserved.');
