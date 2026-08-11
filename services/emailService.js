const nodemailer = require('nodemailer');

function hasEmailConfig() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function transporter() {
  if (!hasEmailConfig()) {
    throw new Error('Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

async function sendPasswordResetCode({ to, code, portalLabel }) {
  const mailer = transporter();
  const from = process.env.GMAIL_USER;

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

module.exports = {
  hasEmailConfig,
  sendPasswordResetCode,
};
