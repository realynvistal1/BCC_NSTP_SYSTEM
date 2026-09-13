const nodemailer = require('nodemailer');

function hasEmailConfig() {
  return Boolean(
    String(process.env.GMAIL_USER || '').trim()
    && String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')
  );
}

function transporter() {
  if (!hasEmailConfig()) {
    throw new Error('Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: {
      user: String(process.env.GMAIL_USER || '').trim(),
      pass: String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
    },
  });
}

async function sendPasswordResetCode({ to, code, portalLabel }) {
  const mailer = transporter();
  const from = String(process.env.GMAIL_USER || '').trim();

  await mailer.sendMail({
    from: `"BCC NSTP System" <${from}>`,
    to,
    subject: `${portalLabel} Password Reset Code`,
    text: [
      `You requested a password reset for the ${portalLabel}.`,
      '',
      `Your verification code is: ${code}`,
      '',
      'This code expires in 10 minutes.',
      'If you did not request this reset, you may ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">
        <h2 style="margin:0 0 12px">BCC NSTP Password Reset</h2>
        <p>You requested a password reset for the <strong>${portalLabel}</strong>.</p>
        <p style="margin:18px 0;font-size:24px;font-weight:700;letter-spacing:4px;color:#1d4ed8">${code}</p>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p>If you did not request this reset, you may ignore this email.</p>
      </div>
    `,
  });
}

async function sendPasswordChangeCode({ to, code, portalLabel }) {
  await transporter().sendMail({
    from: `"BCC NSTP System" <${String(process.env.GMAIL_USER || '').trim()}>`,
    to,
    subject: `${portalLabel} Password Change Code`,
    text: [
      `You requested to change your password in Settings for the ${portalLabel}.`,
      '',
      `Your verification code is: ${code}`,
      '',
      'This code expires in 10 minutes and can only be used once.',
      'Do not share this code with anyone.',
      'If you did not request this change, secure your account and contact your administrator.',
    ].join('\n'),
  });
}

async function sendEmailChangeCode({ to, code, portalLabel, destination, newEmail }) {
  await transporter().sendMail({
    from: `"BCC NSTP System" <${String(process.env.GMAIL_USER || '').trim()}>`,
    to,
    subject: `${portalLabel} Email Change Verification`,
    text: [
      destination === 'old'
        ? `You requested to change your account email to ${newEmail} in the ${portalLabel}.`
        : `Verify this new email address for your account in the ${portalLabel}.`,
      `Your verification code is: ${code}`,
      'Complete this verification step within 10 minutes. Resending does not extend a verified email change.',
      'Do not share this code. Your account email will change only after both email addresses are verified.',
      'If you did not request this change, do not use this code and contact your administrator.',
    ].join('\n\n'),
  });
}

module.exports = {
  hasEmailConfig,
  sendPasswordResetCode,
  sendPasswordChangeCode,
  sendEmailChangeCode,
};
