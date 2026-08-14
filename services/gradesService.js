function calculateGrade(midterm, finalTerm) {
  return Math.round(((Number(midterm) + Number(finalTerm)) / 2) * 100) / 100;
}

function statusFromGrade(grade) {
  return grade >= 1.0 && grade <= 3.0 ? "Passed" : "Failed";
}

function hasRequiredGradeLevels(rows) {
  const has1 = rows.some((row) => String(row.ms_level) === "1");
  const has2 = rows.some((row) => String(row.ms_level) === "2");
  return has1 && has2;
}

function rowPassed(row) {
  if (!row) {
    return false;
  }

  if (String(row.status || '').toLowerCase() === 'passed') {
    return true;
  }

  const grade = Number(row.grade);
  return Number.isFinite(grade) && grade >= 1.0 && grade <= 3.0;
}

function isCertificateEligible(rows) {
  const ms1 = rows.find((row) => String(row.ms_level) === "1");
  const ms2 = rows.find((row) => String(row.ms_level) === "2");
  return rowPassed(ms1) && rowPassed(ms2);
}

function certificateEligibilityMessage(rows) {
  if (!hasRequiredGradeLevels(rows)) {
    return 'Grades Incomplete';
  }

  return isCertificateEligible(rows) ? 'Eligible' : 'Not Eligible';
}

module.exports = {
  certificateEligibilityMessage,
  calculateGrade,
  hasRequiredGradeLevels,
  isCertificateEligible,
  statusFromGrade,
};
