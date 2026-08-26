const path = require('path');

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const EXCEL_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

const EXCEL_EXTENSIONS = new Set(['.xls', '.xlsx']);
const DATA_URL_PATTERN = /^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=]+)$/i;

function parseDataUrl(value) {
  const normalized = String(value || '').trim();
  const match = DATA_URL_PATTERN.exec(normalized);

  if (!match) {
    return null;
  }

  const mimeType = String(match[1] || '').toLowerCase();
  const base64 = match[2];

  try {
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length || buffer.toString('base64') !== base64.replace(/=+$/, (padding) => '='.repeat(padding.length))) {
      return null;
    }

    return {
      raw: normalized,
      mimeType,
      buffer,
      size: buffer.length,
    };
  } catch {
    return null;
  }
}

function validateDataUrlUpload(value, options) {
  const {
    label,
    allowedMimeTypes,
    allowedLabel,
    maxBytes,
    required = false,
  } = options;

  const normalized = String(value || '').trim();
  if (!normalized) {
    if (required) {
      throw new Error(`${label} is required.`);
    }
    return null;
  }

  const parsed = parseDataUrl(normalized);
  if (!parsed) {
    throw new Error(`${label} must be a valid base64 data URL.`);
  }

  if (!allowedMimeTypes.has(parsed.mimeType)) {
    throw new Error(`${label} must be ${allowedLabel}.`);
  }

  if (parsed.size > maxBytes) {
    throw new Error(`${label} is too large. Maximum size is ${Math.round(maxBytes / (1024 * 1024))}MB.`);
  }

  return parsed.raw;
}

function validateImageUpload(value, { label, required = false, maxBytes = 5 * 1024 * 1024 } = {}) {
  return validateDataUrlUpload(value, {
    label,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    allowedLabel: 'a JPG, PNG, or WEBP image',
    maxBytes,
    required,
  });
}

function validateDocumentUpload(value, { label, required = false, maxBytes = 5 * 1024 * 1024 } = {}) {
  return validateDataUrlUpload(value, {
    label,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
    allowedLabel: 'a PDF, JPG, PNG, or WEBP file',
    maxBytes,
    required,
  });
}

function validateExcelFile(file, { label = 'Excel file', maxBytes = 8 * 1024 * 1024 } = {}) {
  if (!file || !file.buffer) {
    throw new Error(`${label} is required.`);
  }

  if (Number(file.size || 0) > maxBytes) {
    throw new Error(`${label} is too large. Maximum size is ${Math.round(maxBytes / (1024 * 1024))}MB.`);
  }

  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  const mimeType = String(file.mimetype || '').toLowerCase();

  if (!EXCEL_EXTENSIONS.has(extension) || !EXCEL_MIME_TYPES.has(mimeType)) {
    throw new Error(`${label} must be an XLS or XLSX file.`);
  }

  return file;
}

module.exports = {
  validateImageUpload,
  validateDocumentUpload,
  validateExcelFile,
};
