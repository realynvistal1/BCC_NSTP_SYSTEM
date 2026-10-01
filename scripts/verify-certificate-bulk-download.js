const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const sharp = require('sharp');
const certificateService = require('../services/certificateService');

class PdfResponse extends PassThrough {
  constructor() {
    super();
    this.headers = {};
  }

  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  }
}

async function sampleSignature() {
  const signature = Buffer.from(`
    <svg width="480" height="150" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 105 C75 15, 95 145, 150 55 S210 130, 270 70 S345 118, 455 42"
            fill="none" stroke="#111827" stroke-width="8" stroke-linecap="round"/>
    </svg>
  `);
  const jpeg = await sharp({
    create: { width: 480, height: 150, channels: 3, background: '#ffffff' },
  }).composite([{ input: signature }]).jpeg().toBuffer();

  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

function sampleRecords(program) {
  return [1, 2].map((number) => ({
    student: {
      id: number,
      student_id: `240001-000${number}`,
      first_name: number === 1 ? 'Sample' : 'Example',
      middle_name: 'Q',
      last_name: 'Student',
      course: 'BSIT',
    },
    serial: {
      serial_number: program === 'ROTC'
        ? `BO-R23-00000${number} PA (Res)`
        : `C-07-00000${number}-24`,
      created_at: '2026-10-01T00:00:00.000Z',
    },
  }));
}

async function writePreview(program, signature) {
  const outputDir = path.join(__dirname, '../output/pdf');
  const outputPath = path.join(outputDir, `${program.toLowerCase()}-filtered-certificates-preview.pdf`);
  const response = new PdfResponse();
  const destination = fs.createWriteStream(outputPath);
  const complete = new Promise((resolve, reject) => {
    destination.on('finish', resolve);
    destination.on('error', reject);
    response.on('error', reject);
  });

  response.pipe(destination);
  await certificateService.certificatesPdf(response, {
    records: sampleRecords(program),
    program,
    assets: path.join(__dirname, '../public/images'),
    settings: program === 'ROTC'
      ? {
        academic_year: '2026-2027',
        ceremony_date: '2026-10-01',
        commandant: 'Sample Commandant',
        school_registrar: 'Sample Registrar',
        commandant_signature: signature,
        school_registrar_signature: signature,
      }
      : {
        academic_year: '2026-2027',
        ceremony_date: '2026-10-01',
        nstp_coordinator: 'Sample Coordinator',
        municipal_mayor: 'Sample Mayor',
        bcc_president: 'Sample President',
        nstp_coordinator_signature: signature,
        municipal_mayor_signature: signature,
        bcc_president_signature: signature,
      },
  });
  await complete;

  return outputPath;
}

async function main() {
  fs.mkdirSync(path.join(__dirname, '../output/pdf'), { recursive: true });
  const signature = await sampleSignature();
  const transparentSignature = await certificateService.removeSignatureBackground(signature);
  const { data: signaturePixels, info: signatureInfo } = await sharp(transparentSignature)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let transparentPixels = 0;

  for (let index = 3; index < signaturePixels.length; index += 4) {
    if (signaturePixels[index] === 0) transparentPixels += 1;
  }

  if (transparentPixels === 0) {
    throw new Error('Signature background removal did not produce transparent pixels.');
  }

  const outputs = await Promise.all([
    writePreview('ROTC', signature),
    writePreview('CWTS', signature),
  ]);

  console.log(`Transparent signature pixels: ${transparentPixels}/${signatureInfo.width * signatureInfo.height}`);
  outputs.forEach((output) => console.log(output));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
