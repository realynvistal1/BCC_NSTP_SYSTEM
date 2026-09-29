const assert = require('node:assert/strict');
const grades = require('../services/gradesService');

assert.equal(grades.statusFromGrade(2.50, 'BS Criminology'), 'Passed');
assert.equal(grades.statusFromGrade(2.60, 'BS Criminology'), 'Failed');
assert.equal(grades.statusFromGrade(3.00, 'BS Information Technology'), 'Passed');
assert.equal(grades.statusFromGrade(3.01, 'BS Information Technology'), 'Failed');

assert.equal(grades.isCertificateEligible([
  { ms_level: '1', grade: 2.60, status: 'Failed' },
  { ms_level: '2', grade: 2.00, status: 'Passed' },
], 'BS Criminology'), false);

console.log('PASS: course-specific grade cutoffs and saved eligibility statuses are enforced.');
