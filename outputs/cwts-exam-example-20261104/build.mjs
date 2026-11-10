import fs from 'node:fs/promises';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
const wb=Workbook.create();
const sheet=wb.worksheets.add('Exam Results');
sheet.showGridLines=false;
sheet.getRange('A1:G7').values=[
  ['Student ID','First Name','Middle Name','Last Name','Sex','Course','Result'],
  ['900001-2026','Juan','Santos','Dela Cruz','Male','BS Information Technology','Passed'],
  ['900002-2026','Maria','Reyes','Santos','Female','BS Hospitality Management','Passed'],
  ['900003-2026','Carlo','','Reyes','Male','BS Tourism Management','Failed'],
  ['900004-2026','Ana','Lopez','Garcia','Female','BEED - Bachelor of Elementary Education','Passed'],
  ['900005-2026','Paolo','Garcia','Mendoza','Male','BSED - Major in English','Passed'],
  ['900006-2026','Sofia','Cruz','Ramos','Female','BSED - Major in Mathematics','Failed'],
];
sheet.getRange('A1:G7').format.rowHeight=27;
sheet.getRange('A1:G7').format.verticalAlignment='center';
sheet.getRange('A1:D7').format.columnWidth=21;
sheet.getRange('E1:E7').format.columnWidth=12;
sheet.getRange('F1:F7').format.columnWidth=50;
sheet.getRange('G1:G7').format.columnWidth=14;
sheet.getRange('A2:A7').setNumberFormat('@');
sheet.getRange('A1:G1').format.fill='#167D66';
sheet.getRange('A1:G1').format.font={bold:true,color:'#FFFFFF'};
sheet.getRange('A1:G1').format.horizontalAlignment='center';
sheet.getRange('E2:E7').dataValidation={rule:{type:'list',values:['Male','Female']}};
sheet.getRange('G2:G7').dataValidation={rule:{type:'list',values:['Passed','Failed']}};
for(const row of [2,4,6])sheet.getRange(`A${row}:G${row}`).format.fill='#F2F8F5';
sheet.freezePanes.freezeRows(1);
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:'Exam Results!A1:G7',include:'values',tableMaxRows:7,tableMaxCols:7,maxChars:1200})).ndjson);
const output=await SpreadsheetFile.exportXlsx(wb);
await output.save(new URL('./cwts-1-exam-results-example.xlsx',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const png=await wb.render({sheetName:'Exam Results',range:'A1:G7',scale:1.5,format:'png'});
await fs.writeFile(new URL('./preview.png',import.meta.url),new Uint8Array(await png.arrayBuffer()));
console.log('Example workbook and preview exported.');
