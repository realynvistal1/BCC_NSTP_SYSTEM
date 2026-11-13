const test=require('node:test');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const {build}=require('../services/recordWorkbookService');

for(const program of ['CWTS','ROTC'])test(`${program} instructor records retain visible table borders and grade formulas`,()=>{
 const records=[{school_year:'2026-2027',ms_level:'1',company:'Alpha',student_no:'000001-2026',last_name:'Test',first_name:'Student',course:'BSIT',midterm:1,final_term:2},
  {school_year:'2026-2027',ms_level:'1',company:'Alpha',student_no:'000002-2026',last_name:'Blank',first_name:'Grade',course:'BSIT',midterm:null,final_term:null}];
 const buffer=build(program,records),archive=XLSX.CFB.read(buffer,{type:'buffer'});
 const part=path=>{const index=archive.FullPaths.findIndex(name=>name.endsWith('/'+path));assert(index>=0,`Missing ${path}`);return archive.FileIndex[index].content.toString();};
 const styles=part('xl/styles.xml'),sheet=part('xl/worksheets/sheet1.xml');
 assert(!/<name\b[^>]*\/><color\b/.test(styles),'Excel requires font color before font name');
 assert(sheet.includes('showGridLines="1"'));
 assert(sheet.includes('gridLines="1" gridLinesSet="1"'));
 assert(sheet.includes('state="frozen"'));
 assert(sheet.includes('r="A24" s="5"'),'Blank rows keep the visible table through row 24');
 assert(sheet.includes('autoFilter ref="A4:'));
 const formats=styles.match(/<cellXfs[^>]*>(.*?)<\/cellXfs>/s)[1].match(/<xf\b[^>]*>/g);
 for(const format of formats.filter(f=>f.includes('borderId="1"')))assert(format.includes('applyBorder="1"'));
 assert(styles.includes('FF0F9F82'));
 const workbook=XLSX.read(buffer,{type:'buffer',cellFormula:true});
 const data=workbook.Sheets[workbook.SheetNames[0]];
 assert.equal(data.A5.v,1);
 const idColumn=program==='CWTS'?'H':'I',averageColumn=program==='CWTS'?'O':'P';
 assert.equal(data[idColumn+'5'].v,'000001-2026');
 assert.equal(data[averageColumn+'5'].v,1.5);
 assert(data[averageColumn+'5'].f.includes('ROUND(AVERAGE('));
 const blankAverage=sheet.match(new RegExp(`<c r="${averageColumn}6"[^>]*>(.*?)</c>`))[1];
 assert(blankAverage.includes('<v></v>'));
 assert(blankAverage.includes('<f>IF(COUNT('));
 const cells=[...sheet.matchAll(/<c r="([A-Z]+[456])" s="(\d+)"/g)];
 for(const [,address,style] of cells)assert(formats[Number(style)].includes('applyBorder="1"'),`${address} must have an explicit border`);
});
