import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputDir = path.resolve('../../outputs/serial-number-upload-examples');
const outputPath = path.join(outputDir, 'ROTC-Serial-Number-Upload-Current-4-Students.xlsx');
const previewPath = path.join(outputDir, 'rotc-current-4-students-preview.png');

const values = [
  ['Serial Number', 'Surname', 'First Name', 'Middle Name', 'Course', 'Platoon', 'ID No.', 'Birthdate', 'Sex', 'Barangay', 'Present Address'],
  ['BO-R23-555555 PA (Res)', 'Lolo', 'Realyn', 'Candado', 'BS Information Technology', 'Medics', '343434-3433', new Date('2026-09-28T00:00:00'), 'Male', 'Cangawa', 'Cangawa, Buenavista, Bohol'],
  ['BO-R23-005118 PA (Res)', 'Mama', 'Malou', 'Caa', 'BS Tourism Management', 'MP', '232325-4656', new Date('2026-09-28T00:00:00'), 'Male', 'Cangawa', 'Cangawa, Buenavista, Bohol'],
  ['BO-R23-005119 PA (Res)', 'Vistal', 'Realyn', 'Candado', 'BS Hospitality Management', 'Echo - Platoon 1', '242242-2424', new Date('2026-09-28T00:00:00'), 'Female', 'Cangawa', 'Cangawa, Buenavista, Bohol'],
  ['BO-R23-005120 PA (Res)', 'Welson', 'Vistal', 'Candado', 'BS Criminology', 'Alpha - Platoon 1', '787878-7887', new Date('2026-09-28T00:00:00'), 'Male', 'Cangawa', 'Cangawa, Buenavista, Bohol'],
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add('ROTC Serial Upload');
const lastRow = values.length;

sheet.getRange(`A1:K${lastRow}`).values = values;
sheet.showGridLines = true;
sheet.freezePanes.freezeRows(1);

sheet.getRange(`A1:K${lastRow}`).format = {
  font: { name: 'Arial', size: 10, color: '#111827' },
  verticalAlignment: 'center',
  borders: { preset: 'all', style: 'thin', color: '#D8DEE8' },
};
sheet.getRange('A1:K1').format = {
  fill: '#EAF0F6',
  font: { name: 'Arial', size: 10, bold: true, color: '#0F2942' },
  horizontalAlignment: 'left',
  verticalAlignment: 'center',
  borders: { preset: 'all', style: 'thin', color: '#B8C4D1' },
};
sheet.getRange(`A2:A${lastRow}`).format.numberFormat = '@';
sheet.getRange(`G2:G${lastRow}`).format.numberFormat = '@';
sheet.getRange(`H2:H${lastRow}`).format.numberFormat = 'yyyy-mm-dd';
sheet.getRange('A:A').format.columnWidth = 20;
sheet.getRange('B:B').format.columnWidth = 16;
sheet.getRange('C:C').format.columnWidth = 16;
sheet.getRange('D:D').format.columnWidth = 17;
sheet.getRange('E:E').format.columnWidth = 29;
sheet.getRange('F:F').format.columnWidth = 22;
sheet.getRange('G:G').format.columnWidth = 18;
sheet.getRange('H:H').format.columnWidth = 14;
sheet.getRange('I:I').format.columnWidth = 10;
sheet.getRange('J:J').format.columnWidth = 16;
sheet.getRange('K:K').format.columnWidth = 34;
sheet.getRange('1:1').format.rowHeight = 24;
sheet.getRange(`2:${lastRow}`).format.rowHeight = 20;

workbook.recalculate();

const topCheck = await workbook.inspect({
  kind: 'table',
  range: 'ROTC Serial Upload!A1:K5',
  include: 'values,formulas',
  tableMaxRows: 5,
  tableMaxCols: 11,
});
console.log(topCheck.ndjson);

const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 50 },
  summary: 'final formula error scan',
});
console.log(errors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({
  sheetName: 'ROTC Serial Upload',
  range: 'A1:K5',
  scale: 1,
  format: 'png',
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
