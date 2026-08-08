function isAdvanceCourseCadet(student) {
  return student.nstp_component === "ROTC"
    && Number(student.willing_to_take_advance_course || 0) === 1
    && !student.special_unit
    && Number(student.has_medical_condition || 0) === 0;
}

function specialUnitForStudent(student) {
  if (Number(student.has_medical_condition || 0) === 1) return "HQ";
  if (Number(student.willing_to_be_medics || 0) === 1) return "Medics";
  if (Number(student.willing_to_be_military_police || 0) === 1) return "MP";
  return null;
}

function isRegularRotcCandidate(student) {
  return !student.rotc_company
    && !student.special_unit
    && !student.has_medical_condition
    && !student.willing_to_take_advance_course
    && !student.willing_to_be_medics
    && !student.willing_to_be_military_police;
}

module.exports = {
  isAdvanceCourseCadet,
  isRegularRotcCandidate,
  specialUnitForStudent,
};
