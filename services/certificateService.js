const PDFDocument = require('pdfkit');
const path = require('path');

function dataUrlBuffer(value) {
  if (!value || !/^data:image\//.test(value)) return null;

  try {
    return Buffer.from(value.split(',')[1], 'base64');
  } catch {
    return null;
  }
}

function putImage(doc, source, x, y, width, height) {
  try {
    if (!source) return;

    const buffer = dataUrlBuffer(source);
    doc.image(buffer || source, x, y, {
      fit: [width, height],
      align: 'center',
      valign: 'center',
    });
  } catch {
    // Missing or invalid images should not stop certificate generation.
  }
}

function ordinal(number) {
  const value = number % 100;
  const suffixes = ['th', 'st', 'nd', 'rd'];
  return number + (suffixes[(value - 20) % 10] || suffixes[value] || 'th');
}

function fullName(student) {
  return [
    student.first_name,
    student.middle_name ? `${String(student.middle_name).trim().charAt(0)}.` : '',
    student.last_name,
    student.suffix,
  ].filter(Boolean).join(' ');
}

function formatCeremonyDate(settings, serial) {
  let date = settings.ceremony_date
    ? new Date(`${settings.ceremony_date}T00:00:00`)
    : new Date(serial.created_at);

  if (Number.isNaN(date.getTime())) {
    date = new Date();
  }

  return `Given this ${ordinal(date.getDate())} day of ${date.toLocaleDateString('en-US', { month: 'long' })}, ${date.getFullYear()} at Buenavista Community College of Cangawa, Buenavista, Bohol.`;
}

function signerList(settings, program) {
  if (program === 'ROTC') {
    return [
      [settings.commandant, 'Commandant', settings.commandant_signature],
      [settings.school_registrar, 'School Registrar', settings.school_registrar_signature],
    ];
  }

  return [
    [settings.nstp_coordinator, 'NSTP Coordinator', settings.nstp_coordinator_signature],
    [settings.bcc_president, 'BCC President', settings.bcc_president_signature],
    [settings.municipal_mayor, 'Municipal Mayor', settings.municipal_mayor_signature],
  ];
}

function drawCertificateHeader(doc, assets, program, width) {
  doc.font('Times-Bold')
    .fillColor('#111827')
    .fontSize(18)
    .text('BUENAVISTA COMMUNITY COLLEGE', 0, 62, { align: 'center' });

  doc.font('Times-Roman')
    .fontSize(10.5)
    .fillColor('#374151')
    .text('Cangawa, Buenavista, Bohol', 0, 90, { align: 'center' });

  if (program === 'ROTC') {
    const images = [
      'nstp-rotc.png',
      'commision-rotc.png',
      'republika-rotc.png',
      'tesda-rotc.png',
    ];

    images.forEach((name, index) => {
      putImage(doc, path.join(assets, name), width / 2 - 140 + index * 72, 122, 54, 54);
    });
    return;
  }

  putImage(doc, path.join(assets, 'ched-logo.png'), width / 2 - 104, 122, 54, 54);
  putImage(doc, path.join(assets, 'bcclogo-removebg-preview.png'), width / 2 - 27, 122, 54, 54);
  putImage(doc, path.join(assets, 'cwts-logo.png'), width / 2 + 50, 122, 54, 54);
}

function drawRecipientLine(doc, text, width, y) {
  doc.font('Helvetica-Bold')
    .fillColor('#1f2937')
    .fontSize(15)
    .text(String(text || '').toUpperCase(), 78, y, {
      width: width - 156,
      align: 'center',
    });

  doc.moveTo(120, y + 30)
    .lineTo(width - 120, y + 30)
    .lineWidth(0.9)
    .stroke('#6b7280');
}

function drawCertificateBody(doc, { student, serial, settings, program }, width) {
  const academicYear = settings.academic_year || '';
  const component = program === 'ROTC'
    ? 'RESERVE OFFICERS TRAINING CORPS (ROTC) COMPONENT'
    : 'CIVIC WELFARE TRAINING SERVICE (CWTS) COMPONENT';

  const awardY = 186;
  const titleY = 212;
  const toY = 258;
  const nameY = 286;
  const completedY = 345;
  const componentY = 382;
  const ofTheY = 414;
  const nstpY = 446;
  const academicYearY = 481;
  const givenY = 520;

  doc.font('Times-Italic')
    .fillColor('#6b7280')
    .fontSize(13)
    .text('Award this', 0, awardY, { align: 'center' });

  doc.font('Helvetica-Bold')
    .fillColor('#182235')
    .fontSize(30)
    .text('CERTIFICATE OF COMPLETION', 0, titleY, { align: 'center' });

  doc.font('Times-Italic')
    .fillColor('#6b7280')
    .fontSize(12)
    .text('to', 0, toY, { align: 'center' });

  drawRecipientLine(doc, `${fullName(student)} ${serial.serial_number}`, width, nameY);

  doc.font('Times-Italic')
    .fillColor('#6b7280')
    .fontSize(12)
    .text('for having satisfactorily completed the', 0, completedY, { align: 'center' });

  doc.font('Helvetica-Bold')
    .fillColor('#1f2937')
    .fontSize(13)
    .text(component, 72, componentY, {
      width: width - 144,
      align: 'center',
    });

  doc.text('OF THE', 0, ofTheY, { align: 'center' });
  doc.text('NATIONAL SERVICE TRAINING PROGRAM (NSTP)', 72, nstpY, {
    width: width - 144,
    align: 'center',
  });

  doc.fontSize(11)
    .text(`A.Y. ${academicYear}`, 0, academicYearY, { align: 'center' });

  doc.font('Times-Italic')
    .fillColor('#4b5563')
    .fontSize(10.5)
    .text(formatCeremonyDate(settings, serial), 72, givenY, {
      width: width - 144,
      align: 'center',
    });
}

function drawCertificateSigners(doc, settings, program, assets, width) {
  const signers = signerList(settings, program);
  const y = 648;
  const spacing = (width - 170) / signers.length;

  signers.forEach(([name, label, signature], index) => {
    const x = 85 + index * spacing;

    putImage(doc, signature, x + spacing / 2 - 42, y - 30, 84, 42);

    doc.font('Helvetica-Bold')
      .fillColor('#111827')
      .fontSize(10.5)
      .text((name || '').toUpperCase(), x, y + 16, { width: spacing, align: 'center' });

    doc.moveTo(x + 22, y + 31)
      .lineTo(x + spacing - 22, y + 31)
      .lineWidth(0.9)
      .stroke('#374151');

    doc.font('Helvetica-Oblique')
      .fontSize(9.5)
      .text(label, x, y + 39, { width: spacing, align: 'center' });
  });
}

function certificatePdf(res, { student, serial, settings, program, assets }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 24 });
  const filename = `${student.student_id || 'student'}-${serial.serial_number}.pdf`
    .replace(/[^a-zA-Z0-9._-]/g, '-');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const width = doc.page.width;
  const height = doc.page.height;

  doc.rect(20, 20, width - 40, height - 40)
    .lineWidth(1.5)
    .stroke('#374151');

  doc.rect(28, 28, width - 56, height - 56)
    .lineWidth(1)
    .stroke('#9ca3af');

  drawCertificateHeader(doc, assets, program, width);
  drawCertificateBody(doc, { student, serial, settings, program }, width);
  drawCertificateSigners(doc, settings, program, assets, width);

  doc.end();
}

module.exports = {
  certificatePdf,
};
