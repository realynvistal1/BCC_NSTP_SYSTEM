const ROTC_SERIAL_CORE_PATTERN = /^R\d{2}-\d{6}$/i;
const ROTC_SERIAL_COMPACT_PATTERN = /^R\d{8}$/i;
const ROTC_SERIAL_FULL_PATTERN = /^BO-\s*(R\d{2}-\d{6})\s+PA\s*\(RES\)$/i;
const CWTS_SERIAL_CORE_PATTERN = /^\d{2}-\d{6}-\d{2}$/;
const CWTS_SERIAL_COMPACT_PATTERN = /^\d{10}$/;
const CWTS_SERIAL_FULL_PATTERN = /^C-\s*(\d{2}-\d{6}-\d{2})$/i;

function formatRotcCore(value) {
  const normalizedValue = String(value || '').trim().toUpperCase();
  if (ROTC_SERIAL_CORE_PATTERN.test(normalizedValue)) return normalizedValue;
  if (!ROTC_SERIAL_COMPACT_PATTERN.test(normalizedValue)) return null;
  return `${normalizedValue.slice(0, 3)}-${normalizedValue.slice(3)}`;
}

function formatCwtsCore(value) {
  const normalizedValue = String(value || '').trim();
  if (CWTS_SERIAL_CORE_PATTERN.test(normalizedValue)) return normalizedValue;
  if (!CWTS_SERIAL_COMPACT_PATTERN.test(normalizedValue)) return null;
  return `${normalizedValue.slice(0, 2)}-${normalizedValue.slice(2, 8)}-${normalizedValue.slice(8)}`;
}

function normalizeSerialNumber(value, programCode) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  const normalizedProgram = String(programCode || '').toUpperCase();

  if (normalizedProgram === 'ROTC') {
    const fullMatch = rawValue.match(ROTC_SERIAL_FULL_PATTERN);
    const core = formatRotcCore(fullMatch?.[1] || rawValue);

    return core ? `BO-${core} PA (Res)` : null;
  }

  if (normalizedProgram === 'CWTS') {
    const fullMatch = rawValue.match(CWTS_SERIAL_FULL_PATTERN);
    const core = formatCwtsCore(fullMatch?.[1] || rawValue);

    return core ? `C-${core}` : null;
  }

  return rawValue.toUpperCase();
}

module.exports = {
  formatCwtsCore,
  formatRotcCore,
  normalizeSerialNumber,
};
