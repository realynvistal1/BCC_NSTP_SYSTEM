const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const sharp = require('sharp');
const service = require('../services/certificateService');

async function verifyPdf(program, bulk) {
  const chunks = [];
  const headers = {};
  const response = new Writable({ write(chunk, encoding, done) { chunks.push(chunk); done(); } });
  response.setHeader = (key, value) => { headers[key] = value; };
  const finished = new Promise((resolve, reject) => {
    response.on('finish', resolve);
    response.on('error', reject);
  });
  const record = {
    student: { student_id: 'TEST-001', first_name: 'Sample', last_name: 'Student' },
    serial: { serial_number: 'TEST-001', created_at: '2026-10-01' },
  };
  const options = { ...record, records: [record, record], program,
    assets: path.join(__dirname, '../public/images'),
    settings: { academic_year: '2026-2027', ceremony_date: '2026-10-01' } };
  const signature = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><path d="M10 45 Q50 0 80 40 T180 20" fill="none" stroke="black" stroke-width="3"/></svg>')).png().toBuffer();
  for (const key of ['commandant_signature', 'school_registrar_signature', 'nstp_coordinator_signature', 'bcc_president_signature', 'municipal_mayor_signature']) {
    options.settings[key] = `data:image/png;base64,${signature.toString('base64')}`;
  }
  await service[bulk ? 'certificatesPdf' : 'certificatePdf'](response, options);
  await finished;
  const pdf = Buffer.concat(chunks).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.7'));
  assert.match(pdf, /\/Encrypt\s+\d+\s+0\s+R/);
  const permissions = Number(pdf.match(/\/P\s+(-?\d+)/)?.[1]);
  assert.ok(Number.isFinite(permissions));
  for (const bit of [8, 16, 32, 256, 1024]) assert.equal(permissions & bit, 0);
  assert.equal(permissions & 2052, 2052, 'High resolution printing remains available');
  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.match(headers['Content-Disposition'], /attachment; filename=".*\.pdf"/);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)) });
  try {
    const parsed = await task.promise;
    assert.equal(parsed.numPages, bulk ? 2 : 1);
    for (let number = 1; number <= parsed.numPages; number++) {
      const page = await parsed.getPage(number);
      assert.equal((await page.getTextContent()).items.length, 0, 'No editable text layer');
      const operations = await page.getOperatorList();
      const images = operations.fnArray.filter(operation => operation === pdfjs.OPS.paintImageXObject);
      assert.equal(images.length, 1, 'Exactly one image: signatures cannot be selected separately');
    }
  } finally { await task.destroy(); }
}

async function main() {
  for (const program of ['ROTC', 'CWTS']) {
    await verifyPdf(program, false);
    await verifyPdf(program, true);
  }
  const source = fs.readFileSync(path.join(__dirname, '../controllers/studentController.js'), 'utf8');
  const handler = source.slice(source.indexOf('exports.certificateSettings ='), source.indexOf('exports.certificate ='));
  const context = { exports: {}, db: { execute: async (sql) => sql.includes('nstp_component')
    ? [[{ nstp_component: 'CWTS' }]]
    : [[{ academic_year: '2026-2027', nstp_coordinator_signature: 'PRIVATE', commandant_signature: 'PRIVATE' }]] } };
  vm.runInNewContext(handler, context);
  let result;
  await context.exports.certificateSettings({ user: { id: 1 } }, {
    setHeader() {}, json(value) { result = value; }, status() { throw new Error('Unexpected error response'); },
  });
  assert.equal(result.academic_year, '2026-2027');
  assert.ok(Object.keys(result).every(key => !key.includes('signature')));
  console.log('PASS: individual and bulk ROTC/CWTS certificates have one image per page, no text layer, PDF restrictions, and no student signature data.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
