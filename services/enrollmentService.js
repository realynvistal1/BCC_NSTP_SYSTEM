function nowWithin(schedule, now = Date.now()) {
  const open = new Date(schedule.open_date).getTime();
  const deadline = new Date(schedule.deadline).getTime();
  return Number.isFinite(open) && Number.isFinite(deadline) && now >= open && now <= deadline;
}

function levelLabel(program, level) {
  return `${program === "ROTC" ? "MS" : "CWTS"} ${level}`;
}

function statusMessageForClosedSchedule(schedule, program) {
  const open = new Date(schedule.open_date).getTime();
  const deadline = new Date(schedule.deadline).getTime();
  const label = levelLabel(program, schedule.ms_level);
  const now = Date.now();

  if (now < open) return { open: false, schedule, message: `Enrollment opens on ${schedule.open_date}.` };
  if (now > deadline) return { open: false, schedule, message: `Enrollment closed on ${schedule.deadline}.` };
  return { open: true, schedule, message: `${label} enrollment is open.` };
}

function normalizeMedicalCondition(value) {
  return value === "" ? null : Number(value || 0);
}

module.exports = {
  levelLabel,
  normalizeMedicalCondition,
  nowWithin,
  statusMessageForClosedSchedule,
};
