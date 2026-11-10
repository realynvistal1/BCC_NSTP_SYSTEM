const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const MIN_PASSWORD_LENGTH = 8;

function portalFor(row) {
  if (row.role === 'student') return 'student';
  if (row.role === 'officer') return 'officer';
  return /cwts/i.test(row.username || row.email) ? 'cwts-admin' : 'rotc-admin';
}

// Require at least eight characters, a number, and a symbol for new passwords.
function passwordValidationMessage(password, label = 'Password') {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `${label} must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[0-9]/.test(password) || !/[^a-zA-Z0-9\s]/.test(password)) {
    return `${label} must include at least one number and one symbol (e.g. !, @, #).`;
  }
  return null;
}

function newPasswordValidationMessage(password) {
  return passwordValidationMessage(password, 'New password');
}

// Check a submitted password against its saved bcrypt hash.
async function comparePassword(plainText, hashed) {
  return bcrypt.compare(plainText, hashed);
}

// Store a salted, one-way bcrypt hash instead of the original password.
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// Sign session details so changes to the token can be detected; this token expires in 12 hours.
// A signed token is not encrypted, so do not put passwords in its contents.
function signLoginToken(user, portal) {
  return jwt.sign(
    { id: user.id, role: user.role, portal, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  comparePassword,
  hashPassword,
  newPasswordValidationMessage,
  passwordValidationMessage,
  portalFor,
  signLoginToken,
};
