const PDFDocument = require('pdfkit');
const path = require('path');
const sharp = require('sharp');

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

async function removeSignatureBackground(source) {
  if (!source) return null;

  try {
    const input = dataUrlBuffer(source) || source;
    const { data, info } = await sharp(input)
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (let index = 0; index < data.length; index += 4) {
      const lightestInkChannel = Math.min(data[index], data[index + 1], data[index + 2]);
      const inkStrength = Math.max(0, Math.min(1, (248 - lightestInkChannel) / 48));
      data[index + 3] = Math.round(data[index + 3] * inkStrength);
    }

    return await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4,
      },
    })
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    return source;
  }
}

async function prepareCertificateSettings(settings, program) {
  const prepared = { ...settings };
  const fields = program === 'ROTC'
    ? ['commandant_signature', 'school_registrar_signature']
    : ['nstp_coordinator_signature', 'municipal_mayor_signature', 'bcc_president_signature'];

  await Promise.all(fields.map(async (field) => {
    prepared[field] = await removeSignatureBackground(settings?.[field]);
  }));

  return prepared;
}

function ordinal(number) {
  const value = number % 100;
  const suffixes = ['th', 'st', 'nd', 'rd'];
  return number + (suffixes[(value - 20) % 10] || suffixes[value] || 'th');
}

function fullName(student) {
  const surname = String(student.last_name || '').trim();
  const givenNames = [student.first_name, student.middle_name, student.suffix]
    .map(value => String(value || '').trim()).filter(Boolean).join(' ');
  return [surname, givenNames].filter(Boolean).join(', ');
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
    .fontSize(23);
  const recipient = String(text || '');
  while (doc.widthOfString(recipient) > width && doc._fontSize > 12) {
    doc.fontSize(doc._fontSize - 1);
  }
  doc.text(recipient, x, y, { width, align: 'center' });

}

function drawRotcHeader(doc, assets, width) {
  doc.font('Helvetica-Bold')
    .fillColor('#111827')
    .fontSize(20)
    .text('BUENAVISTA COMMUNITY COLLEGE', 0, 54, { align: 'center' });

  doc.font('Helvetica-Bold')
    .fontSize(19)
    .fillColor('#111827')
    .text('Cangawa, Buenavista, Bohol', 0, 80, { align: 'center' });

  putImage(doc, path.join(assets, 'nstp-rotc.png'), 82, 108, 66, 66);
  const images = ['commision-rotc.png', 'republika-rotc.png', 'tesda-rotc.png'];
  const startX = width - 284;
  images.forEach((name, index) => {
    putImage(doc, path.join(assets, name), startX + index * 68, 108, 62, 62);
  });
}

function drawRotcBody(doc, { student, serial, settings }, width) {
  const academicYear = settings.academic_year || '';
  const awardY = 158;
  const titleY = 192;
  const toY = 236;
  const nameY = 266;
  const completedY = 330;
  const componentY = 364;
  const ofTheY = 390;
  const nstpY = 416;
  const givenY = 458;

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

  drawRecipientLine(doc, `Pvt ${fullName(student)} ${serial.serial_number || ''}`.trim(), 88, nameY, width - 176);

  doc.font('Helvetica-Oblique')
    .fillColor('#111827')
    .fontSize(12)
    .text('for having satisfactorily completed the', 0, completedY, { align: 'center' });

  doc.font('Helvetica-Bold')
    .fillColor('#111827')
    .fontSize(19)
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
    putImage(doc, signature, x + spacing / 2 - 75, y - 14, 150, 38);

    doc.font('Helvetica-Bold')
      .fillColor('#111827')
      .fontSize(11)
      .text((name || '').toUpperCase(), x, y + 14, { width: spacing, align: 'center' });

    doc.font('Helvetica-Oblique')
      .fontSize(10)
      .text(label, x, y + 32, { width: spacing, align: 'center' });
  });
}

function drawCwtsFrame(doc, width, height) {
  doc.rect(44, 44, width - 88, height - 88)
    .lineWidth(3)
    .stroke('#e5c0a7');

  doc.moveTo(82, 356).lineTo(82, 82).lineTo(420, 82)
    .lineWidth(8).stroke('#d97706');
  doc.moveTo(width - 82, 270).lineTo(width - 82, height - 82)
    .lineTo(width - 228, height - 82)
    .lineWidth(8).stroke('#d97706');

  doc.rect(32, 48, 34, 308).fill('#1f3b73');
  // Two continuous corner accents, matching the printed certificate reference.
  doc.rect(width - 66, 214, 34, height - 262).fill('#1f3b73');
  doc.rect(32, 48, 388, 18).fill('#1f3b73');
  doc.rect(width - 228, height - 66, 196, 18).fill('#1f3b73');

}

function drawCwtsHeader(doc, assets, width) {
  putImage(doc, path.join(assets, 'ched-logo.png'), 96, 98, 82, 82);
  putImage(doc, path.join(assets, 'bcclogo-removebg-preview.png'), 184, 102, 74, 74);
  putImage(doc, path.join(assets, 'cwts-logo-transparent.png'), width - 174, 104, 66, 66);

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
    .fontSize(34)
    .text('CERTIFICATE OF COMPLETION', 0, 198, { align: 'center' });

  doc.font('Times-Italic')
    .fillColor('#111827')
    .fontSize(13)
    .text('Present this', 106, 246);

  doc.font('Times-Italic')
    .fillColor('#111827')
    .fontSize(13)
    .text('to', 0, 282, { align: 'center' });

  doc.font('Helvetica-Bold').fillColor('#111827').fontSize(25);
  const surname = String(student.last_name || '').trim();
  const givenNames = [student.first_name, student.middle_name, student.suffix]
    .map(value => String(value || '').trim()).filter(Boolean).join(' ');
  const recipient = [surname, givenNames].filter(Boolean).join(', ').toUpperCase();
  while (doc.widthOfString(recipient) > width - 216 && doc._fontSize > 14) {
    doc.fontSize(doc._fontSize - 1);
  }
  doc.text(recipient, 108, 304, { width: width - 216, align: 'center' });
  doc.moveTo(160, 334).lineTo(width - 160, 334)
    .lineWidth(0.9).stroke('#111827');

  const paragraph = `for having satisfactorily completed the National Service Training Program - Civic Welfare Training Service (NSTP-CWTS) A.Y. ${academicYear} with a`;
  doc.font('Times-Italic')
    .fillColor('#111827')
    .fontSize(10)
    .text(paragraph, 108, 346, {
      width: width - 216,
      align: 'center',
    });

  doc.font('Helvetica-Bold').fillColor('#111827').fontSize(12.5);
  const serialLabel = 'SERIAL NUMBER ';
  const serialText = String(serial.serial_number || '');
  const labelWidth = doc.widthOfString(serialLabel);
  const serialWidth = doc.widthOfString(serialText);
  const serialX = (width - labelWidth - serialWidth) / 2;
  doc.text(serialLabel + serialText, serialX, 364, { lineBreak: false });
  doc.moveTo(serialX + labelWidth, 380)
    .lineTo(serialX + labelWidth + serialWidth, 380)
    .lineWidth(0.9).stroke('#111827');

  doc.font('Times-Italic')
    .fillColor('#374151')
    .fontSize(8.5)
    .text(formatCeremonyDate(settings, serial), 136, 386, {
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
      y: 460,
      width: 220,
    },
    {
      name: settings.bcc_president || '',
      label: 'BCC President',
      signature: settings.bcc_president_signature,
      x: width - 316,
      y: 460,
      width: 220,
    },
    {
      name: settings.municipal_mayor || '',
      label: 'Municipal Mayor/Chairman, BCC-BOT',
      signature: settings.municipal_mayor_signature,
      x: width / 2 - 150,
      y: 510,
      width: 300,
    },
  ];

  signers.forEach((signer) => {
    putImage(doc, signer.signature, signer.x + signer.width / 2 - 70, signer.y - 34, 140, 40);

    doc.font('Helvetica-Bold')
      .fillColor('#111827')
      .fontSize(11)
      .text((signer.name || '').toUpperCase(), signer.x, signer.y + 2, {
        width: signer.width,
        align: 'center',
      });

    const labelY = Math.max(signer.y + 18, doc.y + 3);

    doc.font('Helvetica')
      .fillColor('#111827')
      .fontSize(10)
      .text(signer.label, signer.x, labelY, {
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
  const valueWidth = Math.max(1, width - labelWidth - 10);
  const minimumFontSize = 6.5;
  let fittedFontSize = valueFontSize;

  doc.font('Helvetica-Bold')
    .fontSize(fittedFontSize);

  while (fittedFontSize > minimumFontSize && doc.widthOfString(valueText) > valueWidth) {
    fittedFontSize -= 0.25;
    doc.fontSize(fittedFontSize);
  }

  let displayValue = valueText;
  if (doc.widthOfString(displayValue) > valueWidth) {
    while (displayValue.length > 1 && doc.widthOfString(`${displayValue}...`) > valueWidth) {
      displayValue = displayValue.slice(0, -1);
    }
    displayValue = `${displayValue.trimEnd()}...`;
  }

  doc.text(displayValue, lineX + 6, y - 1, { width: valueWidth, lineBreak: false });

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

function drawRotcRegistrationPage(doc, record, assets, pageIndex, total, commandantName) {
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
  drawCenteredHeader(doc, 'DEPARTMENT OF MILITARY SCIENCE AND TACTICS', 67, 9, { bold: false });
  drawCenteredHeader(doc, 'BUENAVISTA COMMUNITY COLLEGE ROTC UNIT', 82, 10.5, { bold: true });
  drawCenteredHeader(doc, '702ND (BHL) COMMUNITY DEFENSE CENTER, 7RCDG, RESCOM, PA', 98, 8.5, { bold: false });
  drawCenteredHeader(doc, 'Cangawa, Buenavista, Bohol', 111, 9.8, { bold: false });
  drawCenteredHeader(doc, 'ROTC REGISTRATION FORM', 128, 13.5, { bold: true });
  drawCenteredHeader(doc, '(Print all Entries)', 146, 10, { bold: true });

  const logoSize = 56;
  for (const [filename, logoX] of [['Rescom.png', 88], ['BCCrotcu.png', width - 144]]) {
    doc.save();
    doc.circle(logoX + logoSize / 2, 64 + logoSize / 2, logoSize / 2).clip();
    doc.image(path.join(assets, filename), logoX, 64, {
      cover: [logoSize, logoSize], align: 'center', valign: 'center',
    });
    doc.restore();
  }

  putImage(doc, student.photo, photoX, photoY, photoSize, photoSize);

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

  doc.font('Helvetica')
    .fontSize(9.5)
    .fillColor('#111827')
    .text(safeText(commandantName || 'BILVER F. BUTALE').toUpperCase(), leftMargin, pageHeight - 120);
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
  const photoX = width - 182;
  const photoY = 110;
  const photoSize = 144;

  doc.rect(20, 20, width - 40, pageHeight - 40)
    .lineWidth(0.9)
    .stroke('#9ca3af');

  putImage(doc, path.join(assets, 'bcclogo-removebg-preview.png'), 130, 28, 58, 58);
  // Match the visible BCC emblem size; its source image includes extra padding.
  putImage(doc, path.join(assets, 'cwts-logo-transparent.png'), width - 184, 33, 48, 48);

  doc.font('Helvetica-Bold')
    .fillColor('#111827')
    .fontSize(12)
    .text('BUENAVISTA COMMUNITY COLLEGE', 0, 36, { align: 'center' });
  doc.font('Helvetica')
    .fontSize(9.5)
    .text('Cangawa, Buenavista, Bohol', 0, 51, { align: 'center' })
    .fontSize(8.5)
    .text('Telefax: (038) 513-9169   Tel. No. 513-9179', 0, 62, { align: 'center' });

  doc.font('Helvetica-Bold')
    .fontSize(13)
    .text('NSTP - CWTS Registration Form', 0, 78, { align: 'center' });
  doc.font('Helvetica')
    .fontSize(9.5)
    .text('(Please fill all entries)', 0, 93, { align: 'center' });

  putImage(doc, student.photo, photoX, photoY, photoSize, photoSize);

  // Keep the opening student details level with the photo while preserving a
  // clear 24-point gutter before the photo's left edge.
  const detailsRight = photoX - 24;
  let y = photoY + 22;
  lineField(doc, 'Date:', formatProfileDate(student.created_at), left, y, 174, { labelWidth: 30, valueFontSize: 10.25, labelFontSize: 9.2 });
  lineField(doc, 'Level:', student.ms_level, left + 184, y, detailsRight - (left + 184), { labelWidth: 32, valueFontSize: 10.25, labelFontSize: 9.2 });

  y += 30;
  lineField(doc, 'Name', student.last_name, left, y, 116, { labelWidth: 26, valueFontSize: 10.25, labelFontSize: 9.2 });
  lineField(doc, '', student.first_name, left + 124, y, 116, { labelWidth: 0, valueFontSize: 10.25, labelFontSize: 9.2 });
  lineField(doc, '', student.middle_name, left + 248, y, detailsRight - (left + 248), { labelWidth: 0, valueFontSize: 10.25, labelFontSize: 9.2 });
  doc.font('Helvetica').fontSize(7.5).fillColor('#475569')
    .text('(Last Name)', left + 42, y + 17, { width: 60, align: 'center' })
    .text('(First Name)', left + 166, y + 17, { width: 60, align: 'center' })
    .text('(Middle Name)', left + 278, y + 17, { width: 72, align: 'center' });

  y += 44;
  lineField(doc, 'Course:', student.course, left, y, 200, { labelWidth: 38, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Year/Level:', student.year_level, left + 208, y, detailsRight - (left + 208), { labelWidth: 54, valueFontSize: 10, labelFontSize: 9 });

  y += 26;
  lineField(doc, 'Religion:', student.religion, left, y, 200, { labelWidth: 46, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Brgy.:', student.temporary_barangay, left + 208, y, detailsRight - (left + 208), { labelWidth: 34, valueFontSize: 10, labelFontSize: 9 });

  y = photoY + photoSize + 24;
  lineField(doc, 'Present Address:', joinedAddress([student.temporary_barangay, student.temporary_municipality, student.temporary_province]), left, y, 536, { labelWidth: 82, valueFontSize: 10, labelFontSize: 9 });
  y += 25;
  lineField(doc, 'Contact No.:', student.contact_number, left, y, 170, { labelWidth: 54, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Place of Birth:', student.place_of_birth, left + 176, y, 200, { labelWidth: 68, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Age:', '', left + 382, y, 70, { labelWidth: 25, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Sex:', student.sex, left + 458, y, 78, { labelWidth: 24, valueFontSize: 10, labelFontSize: 9 });

  y += 25;
  lineField(doc, 'Date of Birth:', formatProfileDate(student.birthdate), left, y, 150, { labelWidth: 60, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Height:', student.height, left + 156, y, 85, { labelWidth: 36, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Weight:', student.weight, left + 247, y, 85, { labelWidth: 40, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Complexion:', student.complexion, left + 338, y, 120, { labelWidth: 56, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Blood Type:', student.blood_type, left + 464, y, 72, { labelWidth: 52, valueFontSize: 10, labelFontSize: 9 });

  y += 30;
  lineField(doc, 'Father Name:', student.father_name, left, y, 265, { labelWidth: 62, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Occupation:', student.father_occupation, left + 271, y, 265, { labelWidth: 60, valueFontSize: 10, labelFontSize: 9 });
  y += 25;
  lineField(doc, 'Mother Name:', student.mother_name, left, y, 265, { labelWidth: 64, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Occupation:', student.mother_occupation, left + 271, y, 265, { labelWidth: 60, valueFontSize: 10, labelFontSize: 9 });

  y += 32;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text('Person to Notify in Case of Emergency:', left, y);
  y += 20;
  lineField(doc, 'Name:', student.emergency_contact_name, left, y, 250, { labelWidth: 34, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Relationship:', student.emergency_contact_relationship, left + 256, y, 130, { labelWidth: 66, valueFontSize: 10, labelFontSize: 9 });
  lineField(doc, 'Contact No.:', student.emergency_contact_contact_number, left + 392, y, 144, { labelWidth: 56, valueFontSize: 10, labelFontSize: 9 });
  y += 25;
  lineField(doc, 'Address:', student.emergency_contact_address, left, y, 536, { labelWidth: 44, valueFontSize: 10, labelFontSize: 9 });

  doc.font('Helvetica')
    .fontSize(8)
    .fillColor('#64748b')
    .text(`Page ${pageIndex + 1} of ${total}`, 0, pageHeight - 42, { align: 'center' });
}

async function registrationFormsPdf(res, { records, program, assets, filters }) {
  const preparedRecords = [];
  for (const record of records) {
    let photo = null;
    if (record.photo) {
      const source = dataUrlBuffer(record.photo);
      if (!source) throw new Error('Student photo is invalid. Please upload the photo again.');
      try {
        photo = await sharp(source, { limitInputPixels: 40000000 })
          .rotate()
          .resize(600, 600, { fit: 'contain', background: '#ffffff' })
          .png()
          .toBuffer();
      } catch {
        throw new Error('Student photo could not be added to the profile. Please upload a valid JPG, PNG, or WebP photo.');
      }
    }
    preparedRecords.push({ ...record, photo });
  }
  const filename = `${program}-approved-profile-forms.pdf`.replace(/[^a-zA-Z0-9._-]/g, '-');
  const doc = new PDFDocument({
    // CWTS uses the Letter width with a compact 8-inch page height.
    size: program === 'CWTS' ? [612, 576] : 'LEGAL',
    layout: 'portrait',
    margin: 24,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  preparedRecords.forEach((record, index) => {
    if (program === 'CWTS') {
      drawCwtsRegistrationPage(doc, record, assets, index, records.length);
      return;
    }

    drawRotcRegistrationPage(doc, record, assets, index, records.length, filters.commandantName);
  });

  doc.end();
}

async function certificatePdf(res, { student, serial, settings, program, assets }) {
  const preparedSettings = await prepareCertificateSettings(settings, program);
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

  drawCertificateByProgram(doc, {
    student,
    serial,
    settings: preparedSettings,
    program,
    assets,
  });
  doc.end();
}

async function certificatesPdf(res, { records, settings, program, assets }) {
  const preparedSettings = await prepareCertificateSettings(settings, program);
  const pageOptions = {
    size: program === 'ROTC' ? 'LEGAL' : 'A4',
    layout: 'landscape',
    margin: 24,
  };
  const doc = new PDFDocument(pageOptions);
  const filename = `${String(program || 'nstp').toLowerCase()}-filtered-certificates.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  records.forEach((record, index) => {
    if (index > 0) {
      doc.addPage(pageOptions);
    }

    drawCertificateByProgram(doc, {
      student: record.student,
      serial: record.serial,
      settings: preparedSettings,
      program,
      assets,
    });
  });

  doc.end();
}

module.exports = {
  certificatePdf,
  certificatesPdf,
  removeSignatureBackground,
  registrationFormsPdf,
};
