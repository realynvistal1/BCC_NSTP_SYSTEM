const MAX_LOGIN_IDENTIFIER_LENGTH = 255;
const RESET_CODE_PATTERN = /^\d{6}$/;
const STUDENT_ID_PATTERN = /^\d{6}-\d{4}$/;
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseIdList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map(parsePositiveInt).filter((value) => value !== null))];
}

function readLevel(value, { allowBlank = false } = {}) {
  const normalized = String(value ?? '').trim();

  if (allowBlank && normalized === '') {
    return '';
  }

  return ['1', '2'].includes(normalized) ? normalized : null;
}

function readSchoolYear(value, { allowBlank = false } = {}) {
  const normalized = String(value ?? '').trim();

  if (allowBlank && normalized === '') {
    return '';
  }

  if (!normalized) {
    return null;
  }

  return normalized.length <= 50 ? normalized : null;
}

function readSearchTerm(value, { allowBlank = false } = {}) {
  const normalized = String(value ?? '').trim();

  if (allowBlank && normalized === '') {
    return '';
  }

  if (!normalized) {
    return null;
  }

  return normalized.length <= 100 ? normalized : null;
}

function escapeLikePattern(value) {
  return String(value ?? '').replace(/[\\%_]/g, '\\$&');
}

function readLimitedText(value, maxLength) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length <= maxLength ? normalized : null;
}

function isReasonableEmail(value) {
  const normalized = String(value || '').trim();
  return normalized.length > 0
    && normalized.length <= 255
    && SIMPLE_EMAIL_PATTERN.test(normalized);
}

function isValidStudentId(value) {
  return STUDENT_ID_PATTERN.test(String(value || '').trim());
}

function isValidResetCode(value) {
  return RESET_CODE_PATTERN.test(String(value || '').trim());
}

module.exports = {
  MAX_LOGIN_IDENTIFIER_LENGTH,
  parsePositiveInt,
  parseIdList,
  readLevel,
  readSchoolYear,
  readSearchTerm,
  escapeLikePattern,
  readLimitedText,
  isReasonableEmail,
  isValidStudentId,
  isValidResetCode,
};
