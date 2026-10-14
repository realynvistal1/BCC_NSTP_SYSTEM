const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
const current = require('../services/certificateService');
const source = fs.readFileSync('services/certificateService.js', 'utf8');
const previous = execFileSync('git', ['show', 'HEAD:services/certificateService.js'], { encoding: 'utf8' });
const baselineModule = new Module(path.resolve('services/certificateService.js'), module);
baselineModule.filename = path.resolve('services/certificateService.js');
baselineModule.paths = module.paths;
baselineModule._compile(previous, baselineModule.filename);
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function fullName('), source.indexOf('function formatCeremonyDate(')), context);
assert.equal(context.fullName({ first_name: 'Realyn', middle_name: 'Candado', last_name: 'Vistal' }), 'Realyn C. Vistal');
assert.equal(context.fullName({ first_name: 'Realyn', last_name: 'Vistal' }), 'Realyn Vistal');
assert.equal(context.fullName({ first_name: 'Realyn', middle_name: 'C.', last_name: 'Vistal', suffix: 'Jr.' }), 'Realyn C. Vistal Jr.');
const recipient = source.slice(source.indexOf('function drawRecipientLine('), source.indexOf('function drawRotcHeader('));
assert.match(recipient, /underline: true/);
assert.equal(source.slice(source.indexOf('function drawCwtsFrame('), source.indexOf('function drawCertificateByProgram(')), previous.slice(previous.indexOf('function drawCwtsFrame('), previous.indexOf('function drawCertificateByProgram(')));
async function preview(service, program, filename) {
  const destination = fs.createWriteStream(filename);
  destination.setHeader = () => {};
  const finished = new Promise((resolve, reject) => { destination.on('finish', resolve); destination.on('error', reject); });
  await service.certificatePdf(destination, {
    student: { student_id: 'sample', first_name: 'Realyn', middle_name: 'Candado', last_name: 'Vistal' },
    serial: { serial_number: program === 'ROTC' ? 'BO-R23-333333 PA (Res)' : 'C-07-000001-26', created_at: '2026-10-14' },
    settings: { academic_year: '2026-2027', ceremony_date: '2026-10-14', commandant: 'Sample Commandant', school_registrar: 'Sample Registrar' },
    program, assets: path.resolve('public/images'),
  });
  await finished;
}
(async () => {
  fs.mkdirSync('output/pdf', { recursive: true });
  await preview(current, 'ROTC', 'output/pdf/rotc-certificate-name-preview.pdf');
  await preview(baselineModule.exports, 'CWTS', 'output/pdf/cwts-before.pdf');
  await preview(current, 'CWTS', 'output/pdf/cwts-after.pdf');
  console.log('PASS: ROTC name order, middle initials, suffix, underline, and unchanged CWTS drawing code.');
})().catch(error => { console.error(error); process.exitCode = 1; });
