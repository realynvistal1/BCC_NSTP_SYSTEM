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

function formatProfileDate(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function safeText(value) {
  return String(value || '').trim();
}

function joinedAddress(parts) {
  return parts.map((item) => safeText(item)).filter(Boolean).join(', ');
}

function lineField(doc, label, value, x, y, width, options = {}) {
  const {
    labelWidth = 92,
    valueFontSize = 10.5,
    labelFontSize = 10,
  } = options;

  doc.font('Helvetica')
    .fillColor('#111827')
    .fontSize(labelFontSize)
    .text(label, x, y, { width: labelWidth });

  const lineX = x + labelWidth;
  const valueText = safeText(value) || ' ';

  doc.font('Helvetica-Bold')
    .fontSize(valueFontSize)
    .text(valueText, lineX + 6, y - 1, { width: width - labelWidth - 10 });

  doc.moveTo(lineX, y + 15)
    .lineTo(x + width, y + 15)
    .lineWidth(0.8)
    .stroke('#111827');
}

function drawCenteredHeader(doc, text, y, size, options = {}) {
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fillColor('#111827')
    .fontSize(size)
    .text(text, 0, y, { align: 'center' });
}

function drawRotcRegistrationPage(doc, record, assets, pageIndex, total) {
  if (pageIndex > 0) {
    doc.addPage();
  }

  const student = record;
  const width = doc.page.width;
  const pageHeight = doc.page.height;
  const photoX = width - 198;
  const photoY = 132;
  const photoSize = 144;
  const leftMargin = 58;

  doc.rect(28, 24, width - 56, pageHeight - 48)
    .lineWidth(0.9)
    .stroke('#9ca3af');

  drawCenteredHeader(doc, 'RESTRICTED', 32, 13, { bold: false });
  drawCenteredHeader(doc, 'ANNEX A - ROTC Form 1 - Cadet Registration Card', 50, 10.5, { bold: false });
  drawCenteredHeader(doc, 'DEPARTMENT OF MILITARY SCIENCE AND TACTICS', 67, 10.5, { bold: false });
  drawCenteredHeader(doc, 'BUENAVISTA COMMUNITY COLLEGE ROTC UNIT', 82, 15, { bold: true });
  drawCenteredHeader(doc, '702ND (BHL) COMMUNITY DEFENSE CENTER, 7RCDG, RESCOM, PA', 98, 10.3, { bold: false });
  drawCenteredHeader(doc, 'Cangawa, Buenavista, Bohol', 111, 9.8, { bold: false });
  drawCenteredHeader(doc, 'ROTC REGISTRATION FORM', 140, 13.5, { bold: true });
  drawCenteredHeader(doc, '(Print all Entries)', 156, 10, { bold: true });

  putImage(doc, path.join(assets, 'bcclogo-removebg-preview.png'), 70, 74, 54, 54);
  putImage(doc, path.join(assets, 'republika-rotc.png'), width - 156, 76, 50, 50);

  doc.rect(photoX, photoY, photoSize, photoSize)
    .lineWidth(0.8)
    .stroke('#111827');
  putImage(doc, student.photo, photoX + 4, photoY + 4, photoSize - 8, photoSize - 8);

  let y = 284;
  lineField(doc, 'Student No.', student.student_id, leftMargin, y, 230, { labelWidth: 70, valueFontSize: 9.8, labelFontSize: 8.8 });
  lineField(doc, 'MS:', student.ms_level, leftMargin + 238, y, 70, { labelWidth: 22, valueFontSize: 9.8, labelFontSize: 8.8 });
  lineField(doc, 'Date:', formatProfileDate(student.created_at), leftMargin + 316, y, 180, { labelWidth: 28, valueFontSize: 9.8, labelFontSize: 8.8 });

  y += 28;
  lineField(doc, 'Name', student.last_name, leftMargin, y, 150, { labelWidth: 34, valueFontSize: 9.6, labelFontSize: 8.8 });
  doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text('(Last Name)', leftMargin + 52, y + 17, { width: 86, align: 'center' });
  lineField(doc, '', student.first_name, leftMargin + 158, y, 170, { labelWidth: 0, valueFontSize: 9.6, labelFontSize: 8.8 });
  doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text('(First Name)', leftMargin + 194, y + 17, { width: 96, align: 'center' });
  lineField(doc, '', student.middle_name, leftMargin + 336, y, 174, { labelWidth: 0, valueFontSize: 9.6, labelFontSize: 8.8 });
  doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text('(Middle Name)', leftMargin + 370, y + 17, { width: 104, align: 'center' });

  y += 46;
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111827').text('Temporary Address:', leftMargin, y);
  y += 18;
  lineField(doc, 'No./St/Vill/Brgy:', student.temporary_barangay, leftMargin + 30, y, 445, { labelWidth: 96, valueFontSize: 9, labelFontSize: 8.2 });
  y += 22;
  lineField(doc, 'Municipality:', student.temporary_municipality, leftMargin + 30, y, 206, { labelWidth: 70, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Religion:', student.religion, leftMargin + 338, y, 158, { labelWidth: 48, valueFontSize: 9, labelFontSize: 8.2 });
  y += 22;
  lineField(doc, 'Province:', student.temporary_province, leftMargin + 30, y, 206, { labelWidth: 54, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Tel/Cell No.:', student.contact_number, leftMargin + 286, y, 210, { labelWidth: 68, valueFontSize: 9, labelFontSize: 8.2 });
  y += 22;
  lineField(doc, 'Course', student.course, leftMargin, y, 166, { labelWidth: 38, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'School:', 'Buenavista Community College', leftMargin + 172, y, 188, { labelWidth: 42, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Place of Birth', student.place_of_birth, leftMargin + 366, y, 142, { labelWidth: 72, valueFontSize: 9, labelFontSize: 8.2 });
  y += 22;
  lineField(doc, 'Date of Birth', formatProfileDate(student.birthdate), leftMargin, y, 154, { labelWidth: 66, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Height:', student.height, leftMargin + 158, y, 90, { labelWidth: 36, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Weight:', student.weight, leftMargin + 252, y, 92, { labelWidth: 40, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Complexion:', student.complexion, leftMargin + 348, y, 160, { labelWidth: 58, valueFontSize: 9, labelFontSize: 8.2 });
  y += 22;
  lineField(doc, 'Blood Type:', student.blood_type, leftMargin + 232, y, 118, { labelWidth: 58, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Sex:', student.sex, leftMargin + 354, y, 102, { labelWidth: 26, valueFontSize: 9, labelFontSize: 8.2 });

  y += 40;
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111827').text('Permanent Address:', leftMargin, y);
  y += 18;
  lineField(doc, 'No./St/Vill/Brgy:', student.permanent_barangay, leftMargin + 30, y, 445, { labelWidth: 96, valueFontSize: 9, labelFontSize: 8.2 });
  y += 22;
  lineField(doc, 'Municipality:', student.permanent_municipality, leftMargin + 30, y, 206, { labelWidth: 70, valueFontSize: 9, labelFontSize: 8.2 });
  y += 22;
  lineField(doc, 'Province:', student.permanent_province, leftMargin + 30, y, 206, { labelWidth: 54, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Tel/Cell No.:', student.contact_number, leftMargin + 286, y, 210, { labelWidth: 68, valueFontSize: 9, labelFontSize: 8.2 });

  y += 34;
  lineField(doc, 'Father:', student.father_name, leftMargin, y, 250, { labelWidth: 40, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Occupation:', student.father_occupation, leftMargin + 258, y, 250, { labelWidth: 58, valueFontSize: 9, labelFontSize: 8.2 });
  y += 22;
  lineField(doc, 'Mother:', student.mother_name, leftMargin, y, 250, { labelWidth: 46, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Occupation:', student.mother_occupation, leftMargin + 258, y, 250, { labelWidth: 58, valueFontSize: 9, labelFontSize: 8.2 });

  y += 30;
  doc.font('Helvetica').fontSize(8.6).fillColor('#111827').text('Person to be notified in case of emergency:', leftMargin, y);
  y += 18;
  lineField(doc, 'Name:', student.emergency_contact_name, leftMargin, y, 238, { labelWidth: 38, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Relationship:', student.emergency_contact_relationship, leftMargin + 246, y, 140, { labelWidth: 70, valueFontSize: 9, labelFontSize: 8.2 });
  lineField(doc, 'Contact No.:', student.emergency_contact_contact_number, leftMargin + 392, y, 116, { labelWidth: 54, valueFontSize: 9, labelFontSize: 8.2 });
  y += 22;
  lineField(doc, 'Address:', student.emergency_contact_address, leftMargin, y, 508, { labelWidth: 48, valueFontSize: 9, labelFontSize: 8.2 });

  y += 34;
  const advanceText = Number(student.willing_to_take_advance_course) ? '[ / ] YES      [ ] NO' : '[ ] YES      [ / ] NO';
  lineField(doc, 'Are you willing to take the advance course?', advanceText, leftMargin, y, 360, { labelWidth: 210, valueFontSize: 8.8, labelFontSize: 8.2 });

  const signatureY = y + 40;
  doc.moveTo(width - 232, signatureY)
    .lineTo(width - 74, signatureY)
    .lineWidth(0.8)
    .stroke('#111827');
  doc.font('Helvetica')
    .fontSize(9.5)
    .fillColor('#111827')
    .text('(Signature of Student)', width - 232, signatureY + 4, { width: 158, align: 'center' });

  doc.font('Helvetica')
    .fontSize(9.5)
    .fillColor('#111827')
    .text('BILVER F. BUTALE', leftMargin, pageHeight - 120);
  doc.text('CPT          (INF) PA', leftMargin, pageHeight - 106);
  doc.text('Commandant', leftMargin, pageHeight - 92);

  drawCenteredHeader(doc, 'RESTRICTED', pageHeight - 52, 13, { bold: false });
  doc.font('Helvetica')
    .fontSize(7)
    .fillColor('#64748b')
    .text(`Page ${pageIndex + 1} of ${total}`, 0, pageHeight - 34, { align: 'center' });
}

function drawCwtsRegistrationPage(doc, record, assets, pageIndex, total) {
  if (pageIndex > 0) {
    doc.addPage();
  }

  const student = record;
  const width = doc.page.width;
  const pageHeight = doc.page.height;
  const left = 38;
  const photoX = width - 160;
  const photoY = 98;
  const photoW = 108;
  const photoH = 108;

  doc.rect(20, 20, width - 40, pageHeight - 40)
    .lineWidth(0.9)
    .stroke('#9ca3af');

  putImage(doc, path.join(assets, 'bcclogo-removebg-preview.png'), 36, 34, 48, 48);
  putImage(doc, path.join(assets, 'cwts-logo.png'), width - 88, 32, 46, 46);

  doc.font('Helvetica-Bold')
    .fillColor('#111827')
    .fontSize(8.7)
    .text('BUENAVISTA COMMUNITY COLLEGE', 0, 38, { align: 'center' });
  doc.font('Helvetica')
    .fontSize(7.1)
    .text('Cangawa, Buenavista, Bohol', 0, 50, { align: 'center' })
    .text('Telefax: (038) 513-9169   Tel. No. 513-9179', 0, 59, { align: 'center' });

  doc.moveTo(34, 84)
    .lineTo(width - 34, 84)
    .lineWidth(0.6)
    .stroke('#9ca3af');

  doc.font('Helvetica-Bold')
    .fontSize(9.5)
    .text('NSTP - CWTS Registration Form', 0, 96, { align: 'center' });
  doc.font('Helvetica')
    .fontSize(7.5)
    .text('(Please fill all entries)', 0, 108, { align: 'center' });

  doc.rect(photoX, photoY, photoW, photoH)
    .lineWidth(0.8)
    .stroke('#111827');
  putImage(doc, student.photo, photoX + 3, photoY + 3, photoW - 6, photoH - 6);

  let y = 166;
  lineField(doc, 'Date:', formatProfileDate(student.created_at), left, y, 138, { labelWidth: 30, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Level:', student.ms_level, left + 148, y, 90, { labelWidth: 32, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Name', student.last_name, left, y + 22, 120, { labelWidth: 26, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, '', student.first_name, left + 128, y + 22, 120, { labelWidth: 0, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, '', student.middle_name, left + 256, y + 22, 120, { labelWidth: 0, valueFontSize: 8.5, labelFontSize: 7.8 });
  doc.font('Helvetica').fontSize(6.5).fillColor('#475569')
    .text('(Last Name)', left + 44, y + 38, { width: 60, align: 'center' })
    .text('(First Name)', left + 170, y + 38, { width: 60, align: 'center' })
    .text('(Middle Name)', left + 292, y + 38, { width: 72, align: 'center' });

  y += 48;
  lineField(doc, 'Course', student.course, left, y, 150, { labelWidth: 32, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Year/Level:', student.year_level, left + 156, y, 120, { labelWidth: 52, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Religion:', student.religion, left + 282, y, 110, { labelWidth: 46, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Brgy.:', student.temporary_barangay, left + 398, y, 94, { labelWidth: 34, valueFontSize: 8.5, labelFontSize: 7.8 });

  y += 18;
  lineField(doc, 'Present Address', joinedAddress([student.temporary_barangay, student.temporary_municipality, student.temporary_province]), left, y, 492, { labelWidth: 74, valueFontSize: 8.5, labelFontSize: 7.8 });
  y += 18;
  lineField(doc, 'Contact No.:', student.contact_number, left, y, 172, { labelWidth: 52, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Place of Birth:', student.place_of_birth, left + 178, y, 170, { labelWidth: 64, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Age:', '', left + 354, y, 62, { labelWidth: 24, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Sex:', student.sex, left + 422, y, 70, { labelWidth: 22, valueFontSize: 8.5, labelFontSize: 7.8 });

  y += 18;
  lineField(doc, 'Date of Birth:', formatProfileDate(student.birthdate), left, y, 148, { labelWidth: 58, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Height:', student.height, left + 154, y, 84, { labelWidth: 36, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Weight:', student.weight, left + 244, y, 86, { labelWidth: 40, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Complexion:', student.complexion, left + 336, y, 156, { labelWidth: 54, valueFontSize: 8.5, labelFontSize: 7.8 });

  y += 18;
  lineField(doc, 'Blood Type:', student.blood_type, left + 294, y, 94, { labelWidth: 52, valueFontSize: 8.5, labelFontSize: 7.8 });

  y += 22;
  lineField(doc, 'Father Name:', student.father_name, left, y, 248, { labelWidth: 56, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Occupation:', student.father_occupation, left + 254, y, 238, { labelWidth: 58, valueFontSize: 8.5, labelFontSize: 7.8 });
  y += 18;
  lineField(doc, 'Mother Name:', student.mother_name, left, y, 248, { labelWidth: 58, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Occupation:', student.mother_occupation, left + 254, y, 238, { labelWidth: 58, valueFontSize: 8.5, labelFontSize: 7.8 });

  y += 22;
  doc.font('Helvetica').fontSize(7.8).fillColor('#111827').text('Person to Notify in Case of Emergency:', left, y);
  y += 16;
  lineField(doc, 'Name:', student.emergency_contact_name, left, y, 190, { labelWidth: 30, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Relationship:', student.emergency_contact_relationship, left + 196, y, 130, { labelWidth: 64, valueFontSize: 8.5, labelFontSize: 7.8 });
  lineField(doc, 'Contact No.:', student.emergency_contact_contact_number, left + 332, y, 160, { labelWidth: 54, valueFontSize: 8.5, labelFontSize: 7.8 });
  y += 18;
  lineField(doc, 'Address:', student.emergency_contact_address, left, y, 492, { labelWidth: 42, valueFontSize: 8.5, labelFontSize: 7.8 });

  const sigY = y + 26;
  doc.font('Helvetica')
    .fontSize(7.8)
    .fillColor('#111827')
    .text('Noted by:', left + 250, sigY);
  doc.moveTo(left + 316, sigY + 15)
    .lineTo(left + 430, sigY + 15)
    .lineWidth(0.8)
    .stroke('#111827');
  doc.font('Helvetica')
    .fontSize(7)
    .text('Signature over printed name', left + 296, sigY + 18, { width: 150, align: 'center' });

  doc.font('Helvetica')
    .fontSize(7)
    .fillColor('#64748b')
    .text(`Page ${pageIndex + 1} of ${total}`, 0, pageHeight - 28, { align: 'center' });
}

function registrationFormsPdf(res, { records, program, assets, filters }) {
  const filename = `${program}-approved-profile-forms.pdf`.replace(/[^a-zA-Z0-9._-]/g, '-');
  const doc = new PDFDocument({
    size: program === 'CWTS' ? 'LETTER' : 'LEGAL',
    layout: 'portrait',
    margin: 24,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  records.forEach((record, index) => {
    if (program === 'CWTS') {
      drawCwtsRegistrationPage(doc, record, assets, index, records.length);
      return;
    }

    drawRotcRegistrationPage(doc, record, assets, index, records.length);
  });

  doc.end();
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
  registrationFormsPdf,
};
