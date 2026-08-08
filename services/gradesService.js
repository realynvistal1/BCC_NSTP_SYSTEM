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

module.exports = {
  calculateGrade,
  hasRequiredGradeLevels,
  statusFromGrade,
};
