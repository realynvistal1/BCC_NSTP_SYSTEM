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

  return `Given this ${ordinal(date.getDate())} day of ${date.toLocaleDateString('en-US', { month: 'long' })}, ${date.getFullYear()} at the Buenavista Cultural Center, Poblacion, Buenavista, Bohol.`;
}

function signerList(settings, program) {
  if (program === 'ROTC') {
    return [
      [settings.commandant, 'Commandant', settings.commandant_signature],
      [settings.school_registrar, 'School Registrar', settings.school_registrar_signature],
    ];
  }

  return [
    [settings.nstp_coordinator, 'NSTP - Coordinator', settings.nstp_coordinator_signature],
    [settings.bcc_president, 'BCC President', settings.bcc_president_signature],
    [settings.municipal_mayor, 'Municipal Mayor/Chairman, BCC-BOT', settings.municipal_mayor_signature],
  ];
}

function drawRecipientLine(doc, text, x, y, width) {
  doc.font('Helvetica-Bold')
    .fillColor('#111827')
    .fontSize(17)
    .text(String(text || '').toUpperCase(), x, y, { width, align: 'center' });

  doc.moveTo(x + 12, y + 34)
    .lineTo(x + width - 12, y + 34)
    .lineWidth(1.5)
    .stroke('#111827');
}

function drawRotcHeader(doc, assets, width) {
  doc.font('Helvetica-Bold')
    .fillColor('#111827')
    .fontSize(20)
    .text('BUENAVISTA COMMUNITY COLLEGE', 0, 54, { align: 'center' });

  doc.font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#111827')
    .text('Cangawa, Buenavista, Bohol', 0, 80, { align: 'center' });

  const images = [
    'nstp-rotc.png',
    'republika-rotc.png',
    'commision-rotc.png',
    'tesda-rotc.png',
  ];

  const totalWidth = 4 * 54 + 3 * 18;
  const startX = width / 2 - totalWidth / 2;
  images.forEach((name, index) => {
    putImage(doc, path.join(assets, name), startX + index * 72, 112, 54, 54);
  });
}

function drawRotcBody(doc, { student, serial, settings }, width) {
  const academicYear = settings.academic_year || '';
  const awardY = 176;
  const titleY = 208;
  const toY = 254;
  const nameY = 282;
  const completedY = 346;
  const componentY = 380;
  const ofTheY = 412;
  const nstpY = 444;
  const givenY = 490;

  doc.font('Helvetica-Oblique')
    .fillColor('#111827')
    .fontSize(13)
    .text('Award this', 0, awardY, { align: 'center' });

  doc.font('Helvetica-Bold')
    .fillColor('#111827')
    .fontSize(31)
    .text('CERTIFICATE OF COMPLETION', 0, titleY, { align: 'center' });

  doc.font('Helvetica-Oblique')
    .fillColor('#111827')
    .fontSize(12)
    .text('to', 0, toY, { align: 'center' });

  drawRecipientLine(doc, `${fullName(student)} ${serial.serial_number || ''}`.trim(), 88, nameY, width - 176);

  doc.font('Helvetica-Oblique')
    .fillColor('#111827')
    .fontSize(12)
    .text('for having satisfactorily completed the', 0, completedY, { align: 'center' });

  doc.font('Helvetica-Bold')
    .fillColor('#111827')
    .fontSize(14)
    .text('RESERVE OFFICERS TRAINING CORPS (ROTC) COMPONENT', 56, componentY, {
      width: width - 112,
      align: 'center',
    });

  doc.text('OF THE', 0, ofTheY, { align: 'center' });
  doc.text('NATIONAL SERVICE TRAINING PROGRAM (NSTP)', 56, nstpY, {
    width: width - 112,
      align: 'center',
    });

  doc.font('Helvetica')
    .fillColor('#111827')
    .fontSize(11)
    .text(`Given this ${ordinal(new Date(settings.ceremony_date || new Date()).getDate())} day of ${
      new Date(settings.ceremony_date || new Date()).toLocaleDateString('en-US', { month: 'long' })
    } ${new Date(settings.ceremony_date || new Date()).getFullYear()} at Buenavista Community College of Cangawa, Buenavista, Bohol`, 42, givenY, {
      width: width - 84,
      align: 'center',
    });

  if (academicYear) {
    doc.font('Helvetica')
      .fillColor('#111827')
      .fontSize(10)
      .text(`A.Y. ${academicYear}`, 0, givenY + 20, { align: 'center' });
  }
}

function drawRotcSigners(doc, settings, width) {
  const signers = signerList(settings, 'ROTC');
  const y = 520;
  const spacing = (width - 140) / signers.length;

  signers.forEach(([name, label, signature], index) => {
    const x = 70 + index * spacing;
    putImage(doc, signature, x + spacing / 2 - 44, y - 8, 88, 28);

    doc.font('Helvetica-Bold')
      .fillColor('#111827')
      .fontSize(11)
      .text((name || '').toUpperCase(), x, y + 14, { width: spacing, align: 'center' });

    doc.moveTo(x + 50, y + 30)
      .lineTo(x + spacing - 50, y + 30)
      .lineWidth(0.9)
      .stroke('#111827');

    doc.font('Helvetica-Oblique')
      .fontSize(10)
      .text(label, x, y + 40, { width: spacing, align: 'center' });
  });
}

function drawCwtsFrame(doc, width, height) {
  doc.rect(44, 44, width - 88, height - 88)
    .lineWidth(3)
    .stroke('#e5c0a7');

  doc.rect(56, 56, width - 112, height - 112)
    .lineWidth(1.8)
    .stroke('#d97706');

  doc.rect(32, 48, 34, 308).fill('#1f3b73');
  doc.rect(32, height - 120, 34, 72).fill('#1f3b73');
  doc.rect(width - 66, 214, 34, 194).fill('#1f3b73');
  doc.rect(24, 42, 388, 18).fill('#1f3b73');
  doc.rect(width - 228, height - 76, 196, 18).fill('#1f3b73');

  doc.rect(width / 2 - 129, 84, 258, 8).fill('#d97706');
  doc.rect(width - 80, 246, 8, 116).fill('#d97706');
}

function drawCwtsHeader(doc, assets, width) {
  putImage(doc, path.join(assets, 'ched-logo.png'), 96, 98, 82, 82);
  putImage(doc, path.join(assets, 'bcclogo-removebg-preview.png'), 184, 102, 74, 74);
  putImage(doc, path.join(assets, 'cwts-logo.png'), width - 184, 92, 86, 86);

  doc.font('Times-Bold')
    .fillColor('#111827')
    .fontSize(18)
    .text('BUENAVISTA COMMUNITY COLLEGE', 0, 104, { align: 'center' });

  doc.font('Times-Italic')
    .fillColor('#374151')
    .fontSize(10.5)
    .text('"Caring your future"', 0, 128, { align: 'center' });

  doc.font('Times-Roman')
    .fillColor('#374151')
    .fontSize(9)
    .text('Cangawa, Buenavista, Bohol', 0, 146, { align: 'center' })
    .text('Telefax: (038)5139169/Tel.: 513-9179', 0, 160, { align: 'center' });
}

function drawCwtsBody(doc, { student, serial, settings }, width) {
  const academicYear = settings.academic_year || '';

  doc.font('Helvetica-Bold')
    .fillColor('#466b1f')
    .fontSize(27)
    .text('CERTIFICATE OF COMPLETION', 0, 198, { align: 'center' });

  doc.font('Times-Italic')
    .fillColor('#111827')
    .fontSize(13)
    .text('Present this', 106, 246);

  doc.font('Times-Italic')
    .fillColor('#111827')
    .fontSize(13)
    .text('to', 0, 282, { align: 'center' });

  drawRecipientLine(doc, fullName(student), 210, 304, width - 420);

  const paragraph = `for having satisfactorily completed the National Service Training Program - Civic Welfare Training Service (NSTP-CWTS) A.Y. ${academicYear} with a`;
  doc.font('Times-Italic')
    .fillColor('#111827')
    .fontSize(10)
    .text(paragraph, 108, 376, {
      width: width - 216,
      align: 'center',
    });

  doc.font('Helvetica-Bold')
    .fillColor('#111827')
    .fontSize(12.5)
    .text(`SERIAL NUMBER ${serial.serial_number}`, 108, 392, {
      width: width - 216,
      align: 'center',
    });

  doc.font('Times-Italic')
    .fillColor('#374151')
    .fontSize(8.5)
    .text(formatCeremonyDate(settings, serial), 136, 424, {
      width: width - 272,
      align: 'center',
    });
}

function drawCwtsSigners(doc, settings, width) {
  const signers = [
    {
      name: settings.nstp_coordinator || '',
      label: 'NSTP - Coordinator',
      signature: settings.nstp_coordinator_signature,
      x: 96,
      y: 456,
      width: 220,
    },
    {
      name: settings.bcc_president || '',
      label: 'BCC President',
      signature: settings.bcc_president_signature,
      x: width - 316,
      y: 456,
      width: 220,
    },
    {
      name: settings.municipal_mayor || '',
      label: 'Municipal Mayor/Chairman, BCC-BOT',
      signature: settings.municipal_mayor_signature,
      x: width / 2 - 150,
      y: 500,
      width: 300,
    },
  ];

  signers.forEach((signer) => {
    putImage(doc, signer.signature, signer.x + signer.width / 2 - 38, signer.y - 28, 76, 26);

    doc.font('Helvetica-Bold')
      .fillColor('#111827')
      .fontSize(8)
      .text((signer.name || '').toUpperCase(), signer.x, signer.y + 2, {
        width: signer.width,
        align: 'center',
      });

    doc.moveTo(signer.x + 24, signer.y + 17)
      .lineTo(signer.x + signer.width - 24, signer.y + 17)
      .lineWidth(0.9)
      .stroke('#111827');

    doc.font('Helvetica')
      .fillColor('#111827')
      .fontSize(7)
      .text(signer.label, signer.x, signer.y + 20, {
        width: signer.width,
        align: 'center',
      });
  });
}

function drawCertificateSigners(doc, settings, program, width) {
  if (program === 'CWTS') {
    drawCwtsSigners(doc, settings, width);
    return;
  }

  drawRotcSigners(doc, settings, width);
}

function drawCertificateByProgram(doc, payload) {
  const { student, serial, settings, program, assets } = payload;
  const width = doc.page.width;
  const height = doc.page.height;

  if (program === 'CWTS') {
    drawCwtsFrame(doc, width, height);
    drawCwtsHeader(doc, assets, width);
    drawCwtsBody(doc, { student, serial, settings }, width);
    drawCwtsSigners(doc, settings, width);
    return;
  }

  doc.rect(20, 20, width - 40, height - 40)
    .lineWidth(1.5)
    .stroke('#374151');

  doc.rect(28, 28, width - 56, height - 56)
    .lineWidth(1)
    .stroke('#9ca3af');

  drawRotcHeader(doc, assets, width);
  drawRotcBody(doc, { student, serial, settings }, width);
  drawRotcSigners(doc, settings, width);
}

function certificatePdf(res, { student, serial, settings, program, assets }) {
  const doc = new PDFDocument({
    size: program === 'ROTC' ? 'LEGAL' : 'A4',
    layout: 'landscape',
    margin: 24,
  });
  const filename = `${student.student_id || 'student'}-${serial.serial_number}.pdf`
    .replace(/[^a-zA-Z0-9._-]/g, '-');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  drawCertificateByProgram(doc, { student, serial, settings, program, assets });
  doc.end();
}

module.exports = {
  certificatePdf,
};
