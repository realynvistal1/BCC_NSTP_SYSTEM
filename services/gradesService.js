function calculateGrade(midterm, finalTerm) {
  return Math.round(((Number(midterm) + Number(finalTerm)) / 2) * 100) / 100;
}

function passingGradeLimit(course = '') {
  return /criminology/i.test(String(course)) ? 2.5 : 3.0;
}

function statusFromGrade(grade, course = '') {
  const numericGrade = Number(grade);
  return numericGrade >= 1.0 && numericGrade <= passingGradeLimit(course)
    ? "Passed"
    : "Failed";
}

function isGradeFailureRejection(reason = '') {
  const normalizedReason = String(reason).trim().toLowerCase();
  return normalizedReason.includes('grade is failed')
    && normalizedReason.includes('only students who passed');
}

function hasRequiredGradeLevels(rows) {
  const has1 = rows.some((row) => String(row.ms_level) === "1");
  const has2 = rows.some((row) => String(row.ms_level) === "2");
  return has1 && has2;
}

function rowPassed(row, course = '') {
  if (!row) {
    return false;
  }

  const grade = Number(row.grade);
  if (Number.isFinite(grade) && grade >= 1.0) {
    return statusFromGrade(grade, course) === 'Passed';
  }

  return String(row.status || '').trim().toLowerCase() === 'passed';
}

function isCertificateEligible(rows, course = '') {
  const ms1 = rows.find((row) => String(row.ms_level) === "1");
  const ms2 = rows.find((row) => String(row.ms_level) === "2");
  return rowPassed(ms1, course) && rowPassed(ms2, course);
}

function certificateEligibilityMessage(rows, course = '') {
  if (!hasRequiredGradeLevels(rows)) {
    return 'Grades Incomplete';
  }

  return isCertificateEligible(rows, course) ? 'Eligible' : 'Not Eligible';
}

module.exports = {
  certificateEligibilityMessage,
  calculateGrade,
  hasRequiredGradeLevels,
  isGradeFailureRejection,
  isCertificateEligible,
  passingGradeLimit,
  statusFromGrade,
};
