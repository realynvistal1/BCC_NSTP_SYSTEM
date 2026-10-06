const assert = require('node:assert/strict');
const grades = require('../services/gradesService');

assert.equal(grades.statusFromGrade(2.50, 'BS Criminology'), 'Passed');
assert.equal(grades.statusFromGrade(2.60, 'BS Criminology'), 'Failed');
for (const course of ['BEED - Bachelor of Elementary Education', 'BSED - Major in English', 'BSED - Major in Mathematics']) {
  assert.equal(grades.statusFromGrade(2.50, course), 'Passed');
  assert.equal(grades.statusFromGrade(2.51, course), 'Failed');
  assert.equal(grades.statusFromGrade(2.60, course), 'Failed');
  assert.equal(grades.isCertificateEligible([
    { ms_level: '1', grade: 2.60 }, { ms_level: '2', grade: 2.00 },
  ], course), false);
}
assert.equal(grades.statusFromGrade(3.00, 'BS Information Technology'), 'Passed');
assert.equal(grades.statusFromGrade(3.01, 'BS Information Technology'), 'Failed');
assert.equal(grades.isGradeFailureRejection(
  'Not qualified for MS 2: the MS 1 grade is Failed. Only students who passed MS 1 can enroll.'
), true);
assert.equal(grades.isGradeFailureRejection('Rejected because the submitted X-ray is unclear.'), false);

assert.equal(grades.isCertificateEligible([
  { ms_level: '1', grade: 2.60, status: 'Failed' },
  { ms_level: '2', grade: 2.00, status: 'Passed' },
], 'BS Criminology'), false);

console.log('PASS: course-specific grade cutoffs and saved eligibility statuses are enforced.');
