const ATTENDANCE_RADIUS_METERS = 100;
const LATE_THRESHOLD_MINUTES = 15;
const SESSION_COUNT = 15;

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function lateDeadline(closeDate) {
  const close = toDate(closeDate);
  return close ? new Date(close.getTime() + LATE_THRESHOLD_MINUTES * 60 * 1000) : null;
}

function getEffectiveStatus(session, now = new Date()) {
  const open = toDate(session.open_date || session.openDate);
  const close = toDate(session.close_date || session.closeDate);
  if (!open || !close) return "closed";
  const lateUntil = new Date(close.getTime() + LATE_THRESHOLD_MINUTES * 60 * 1000);
  if (now < open) return "scheduled";
  if (now < close) return "open";
  if (now < lateUntil) return "late";
  return "closed";
}

function attendanceStatusForMark(session, now = new Date()) {
  const status = getEffectiveStatus(session, now);
  if (status === "open") return "present";
  if (status === "late") return "late";
  return null;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const values = [lat1, lon1, lat2, lon2].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return NaN;
  const [aLat, aLon, bLat, bLon] = values;
  const radius = 6371000;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCycleSchoolYear(value, fallbackDate = new Date()) {
  if (value && /^\d{4}-\d{4}$/.test(String(value))) return String(value);
  const year = fallbackDate.getFullYear();
  return fallbackDate.getMonth() >= 5 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

module.exports = {
  ATTENDANCE_RADIUS_METERS,
  LATE_THRESHOLD_MINUTES,
  SESSION_COUNT,
  getEffectiveStatus,
  attendanceStatusForMark,
  haversineMeters,
  lateDeadline,
  normalizeCycleSchoolYear,
};
