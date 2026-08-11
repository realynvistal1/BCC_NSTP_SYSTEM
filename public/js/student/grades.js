document.addEventListener('DOMContentLoaded',()=>bootstrapPortalPage({
  expectedPortal:'student',shellRole:'student',moduleSrc:'/assets/js/student/_pages.js',render:async(content)=>{
    const [rows,dash]=await Promise.all([API.get('/api/student/grades'),API.get('/api/student/dashboard')]);
    const program=dash.student?.nstp_component||'-';
    const desc=program==='CWTS'?'Civic Welfare Training Service':'National Service Training Program';
    const m=new Map((rows||[]).map(g=>[String(g.ms_level),g]));
    const ms1=m.get('1'),ms2=m.get('2');
    if(!ms1&&!ms2){
      content.innerHTML=`<div class="panel student-grade-empty"><div class="empty-icon">${icon('grades')}</div><h3>No grades released yet</h3><p>Your grades will appear here once released by your administrator.</p></div>`;
      return;
    }
    const tr=(label,g)=>`<tr><td><strong>${label}</strong></td><td>${esc(desc)}</td><td class="center">${g?.midterm!=null?Number(g.midterm).toFixed(2):'-'}</td><td class="center">${g?.final_term!=null?Number(g.final_term).toFixed(2):'-'}</td><td class="center"><strong>${g?.grade!=null?Number(g.grade).toFixed(2):'-'}</strong></td><td class="center">3</td><td class="center">${g?badge(g.status):'-'}</td></tr>`;
    content.innerHTML=`<section class="panel student-grade-panel"><div class="table-wrap"><table class="data-table student-grade-table"><thead><tr><th>Subject</th><th>Description</th><th>Midterm</th><th>Final Term</th><th>Average</th><th>Unit</th><th>Status</th></tr></thead><tbody>${tr('NSTP 1',ms1)}${tr('NSTP 2',ms2)}</tbody></table></div></section>`;
  }
}));

