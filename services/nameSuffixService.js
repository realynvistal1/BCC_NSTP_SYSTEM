function displaySuffix(value) {
  const text = String(value ?? '').trim();
  return /^(?:n\s*\/?\s*a\.?|none|null|not applicable|no suffix|-+)$/i.test(text) ? '' : text;
}

function enrollmentSuffix(value) {
  const text = displaySuffix(value).toUpperCase();
  if (!text) return null;
  if (/^JR\.?$/.test(text)) return 'JR.';
  if (/^SR\.?$/.test(text)) return 'SR.';
  if (['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'].includes(text)) return text;
  const error = new Error('Please select a valid name suffix.');
  error.status = 400;
  throw error;
}

module.exports = { displaySuffix, enrollmentSuffix };
