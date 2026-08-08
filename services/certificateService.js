const PDFDocument=require('pdfkit');
const path=require('path');
function dataUrlBuffer(v){if(!v||!/^data:image\//.test(v))return null;try{return Buffer.from(v.split(',')[1],'base64')}catch{return null}}
function putImage(doc,src,x,y,w,h){try{if(src){const b=dataUrlBuffer(src);doc.image(b||src,x,y,{fit:[w,h],align:'center',valign:'center'})}}catch{}}
function ordinal(n){const v=n%100;return n+(['th','st','nd','rd'][(v-20)%10]||['th','st','nd','rd'][v]||'th')}
function fullName(s){return [s.first_name,s.middle_name?String(s.middle_name).trim().charAt(0)+'.':'',s.last_name,s.suffix].filter(Boolean).join(' ')}
function certificatePdf(res,{student,serial,settings,program,assets}){
 const doc=new PDFDocument({size:'A4',layout:'landscape',margin:26});
 const fn=`${student.student_id||'student'}-${serial.serial_number}.pdf`.replace(/[^a-zA-Z0-9._-]/g,'-');
 res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${fn}"`);doc.pipe(res);
 const W=doc.page.width,H=doc.page.height; doc.rect(20,20,W-40,H-40).lineWidth(program==='CWTS'?5:3).stroke(program==='CWTS'?'#d8a47f':'#374151');
 doc.rect(28,28,W-56,H-56).lineWidth(1).stroke('#9ca3af');
 doc.font('Times-Bold').fillColor('#111827').fontSize(19).text('BUENAVISTA COMMUNITY COLLEGE',0,46,{align:'center'});
 doc.font('Times-Roman').fontSize(11).text('Cangawa, Buenavista, Bohol',0,69,{align:'center'});
 if(program==='ROTC'){
  const imgs=['nstp-rotc.png','commision-rotc.png','republika-rotc.png','tesda-rotc.png'];
  imgs.forEach((n,i)=>putImage(doc,path.join(assets,n),W/2-145+i*75,88,62,58));
 }else{
  putImage(doc,path.join(assets,'ched-logo.png'),75,68,65,65);putImage(doc,path.join(assets,'bcclogo-removebg-preview.png'),145,68,65,65);putImage(doc,path.join(assets,'cwts-logo.png'),W-145,68,65,65);
 }
 doc.moveDown(); doc.font(program==='CWTS'?'Helvetica-Bold':'Times-Bold').fillColor(program==='CWTS'?'#166534':'#111827').fontSize(29).text('CERTIFICATE OF COMPLETION',0,160,{align:'center'});
 doc.font('Times-Italic').fillColor('#4b5563').fontSize(12).text('is hereby presented to',0,202,{align:'center'});
 doc.font('Helvetica-Bold').fillColor('#111827').fontSize(22).text(fullName(student),110,231,{width:W-220,align:'center',underline:true});
 const ay=settings.academic_year||''; const comp=program==='ROTC'?'Reserve Officers Training Corps (NSTP-ROTC)':'Civic Welfare Training Service (NSTP-CWTS)';
 doc.font('Times-Roman').fontSize(13).text(`for having satisfactorily completed the National Service Training Program – ${comp} A.Y. ${ay} with SERIAL NUMBER`,105,287,{width:W-210,align:'center',lineGap:4});
 doc.font('Helvetica-Bold').fontSize(15).text(serial.serial_number,0,331,{align:'center'});
 let date=settings.ceremony_date?new Date(settings.ceremony_date+'T00:00:00'):new Date(serial.created_at); if(Number.isNaN(date.getTime()))date=new Date();
 const dateText=`Given this ${ordinal(date.getDate())} day of ${date.toLocaleDateString('en-US',{month:'long'})}, ${date.getFullYear()} at Buenavista, Bohol.`;
 doc.font('Times-Italic').fillColor('#4b5563').fontSize(11).text(dateText,90,365,{width:W-180,align:'center'});
 const y=435;
 const people=program==='ROTC'?
  [[settings.commandant, 'Commandant',settings.commandant_signature],[settings.school_registrar,'School Registrar',settings.school_registrar_signature]]:
  [[settings.nstp_coordinator,'NSTP Coordinator',settings.nstp_coordinator_signature],[settings.bcc_president,'BCC President',settings.bcc_president_signature],[settings.municipal_mayor,'Municipal Mayor',settings.municipal_mayor_signature]];
 const spacing=(W-140)/people.length;
 people.forEach((a,i)=>{const x=70+i*spacing;putImage(doc,a[2],x+spacing/2-38,y-28,76,44);doc.font('Helvetica-Bold').fillColor('#111827').fontSize(10).text(a[0]||'',x,y+20,{width:spacing,align:'center'});doc.moveTo(x+18,y+38).lineTo(x+spacing-18,y+38).stroke('#374151');doc.font('Helvetica-Oblique').fontSize(9).text(a[1],x,y+42,{width:spacing,align:'center'})});
 doc.end();
}
module.exports={certificatePdf};
