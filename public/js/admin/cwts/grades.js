function gradeValue(v){ return v === null || v === undefined || v === '' ? '' : Number(v).toFixed(2); }
function gradeMap(rows){ const m=new Map(); (rows||[]).forEach(g=>m.set(`${g.student_id}|${g.ms_level}`,g)); return m; }
function gradeStatus(avg){ if(avg===null) return {label:'-', cls:'neutral'}; return avg>=1&&avg<=3?{label:'Passed',cls:'success'}:{label:'Failed',cls:'danger'}; }
function avgGrade(a,b){ const x=Number(a),y=Number(b); if(!Number.isFinite(x)||!Number.isFinite(y)||x<1||x>5||y<1||y>5)return null; return Math.round(((x+y)/2)*100)/100; }

async function renderAdminGrades(_program, content){
  const program='CWTS', p='cwts', prefix='CWTS';
  const data=await API.get(`/api/admin/${p}/grades`);
  const students=data.students||[], gm=gradeMap(data.grades||[]);
  const schoolYears=[...new Set(students.flatMap(s=>[s.ms1_year,s.ms2_year]).filter(Boolean))].sort().reverse();
  content.innerHTML=`
    <div class="grade-summary-grid">
      <div class="grade-summary-card"><small>Total Students</small><strong id="gradeTotal">${students.length}</strong></div>
      <div class="grade-summary-card green"><small>Graded</small><strong id="gradeGraded">0</strong></div>
      <div class="grade-summary-card amber"><small>Ungraded</small><strong id="gradeUngraded">0</strong></div>
    </div>
    <section class="panel grade-panel">
      <div class="grade-filter-head"><div><h2>Student Grades</h2><p>Encode or update ${program} NSTP 1 and NSTP 2 midterm and final term grades.</p></div></div>
      <div class="grade-tools">
        <select id="gradeLevel"><option value="">All ${prefix} Levels</option><option value="1">${prefix} 1</option><option value="2">${prefix} 2</option></select>
        <select id="gradeSY"><option value="">All School Years</option>${schoolYears.map(y=>`<option value="${esc(y)}">SY ${esc(y)}</option>`).join('')}</select>
        <select id="gradeYear"><option value="">All Years</option><option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option>4th Year</option></select>
        <input id="gradeSearch" placeholder="Search by name, student ID, or course...">
      </div>
      <div class="table-wrap"><table class="data-table grade-table"><thead><tr><th>#</th><th>Student ID</th><th>Student Name</th><th>Course & Year</th><th>Grade Status</th><th>Action</th></tr></thead><tbody id="gradeRows"></tbody></table></div>
      <div class="table-footer" id="gradeFooter"></div>
    </section>
    <div id="gradeModal" class="app-dialog hidden"><div class="app-dialog-backdrop"></div><div class="app-dialog-card grade-modal-card"><div id="gradeModalBody"></div></div></div>`;

  function hasGrade(s, level){ return level?gm.has(`${s.student_id}|${level}`):(gm.has(`${s.student_id}|1`)||gm.has(`${s.student_id}|2`)); }
  function filtered(){
    const level=$('#gradeLevel').value, sy=$('#gradeSY').value, yr=$('#gradeYear').value, q=$('#gradeSearch').value.trim().toLowerCase();
    return students.filter(s=>{
      if(level && !Number(s[`approved_ms${level}`])) return false;
      if(sy && !(s.ms1_year===sy||s.ms2_year===sy)) return false;
      if(yr && s.year_level!==yr) return false;
      if(q && !`${s.last_name} ${s.first_name} ${s.middle_name||''} ${s.student_no} ${s.course}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderRows(){
    const rows=filtered(), level=$('#gradeLevel').value;
    const graded=rows.filter(s=>hasGrade(s,level)).length;
    $('#gradeTotal').textContent=rows.length; $('#gradeGraded').textContent=graded; $('#gradeUngraded').textContent=rows.length-graded;
    $('#gradeRows').innerHTML=rows.length?rows.map((s,i)=>{
      const yes=hasGrade(s,level);
      return `<tr><td>${i+1}</td><td>${esc(s.student_no)}</td><td><strong>${esc(s.last_name)}, ${esc(s.first_name)}${s.middle_name?` ${esc(s.middle_name[0])}.`:''}${s.suffix?` ${esc(s.suffix)}`:''}</strong></td><td>${esc(s.course)} - ${esc(s.year_level)}</td><td>${yes?'<span class="badge success">Graded</span>':'<span class="badge warning">Ungraded</span>'}</td><td><button class="btn small ${yes?'success':'secondary'}" data-grade-student="${s.student_id}">${yes?'View / Edit':'Encode'}</button></td></tr>`;
    }).join(''):`<tr><td colspan="6"><div class="empty">No students found.</div></td></tr>`;
    $('#gradeFooter').textContent=`${rows.length} student${rows.length===1?'':'s'} shown`;
    $$('[data-grade-student]').forEach(b=>b.onclick=()=>openModal(students.find(s=>String(s.student_id)===b.dataset.gradeStudent)));
  }
  function section(s, level){
    const approved=Number(s[`approved_ms${level}`])===1, g=gm.get(`${s.student_id}|${level}`), disabled=!approved;
    return `<div class="grade-level-card ${disabled?'disabled':''}" data-level="${level}"><div class="grade-level-top"><div><span class="grade-level-number">${level}</span><strong>NSTP ${level}</strong>${disabled?'<em>Not enrolled</em>':''}</div><div><span class="grade-average" id="avg${level}">${g?`Avg: ${Number(g.grade).toFixed(2)}`:''}</span><span class="badge ${g?.status==='Passed'?'success':g?.status==='Failed'?'danger':'neutral'}" id="st${level}">${g?.status||'-'}</span></div></div><div class="grade-input-grid"><label>Midterm<input id="mid${level}" type="number" min="1" max="5" step="0.01" value="${g?.midterm??''}" ${disabled?'disabled':''} placeholder="1.00 - 5.00"></label><label>Final Term<input id="fin${level}" type="number" min="1" max="5" step="0.01" value="${g?.final_term??''}" ${disabled?'disabled':''} placeholder="1.00 - 5.00"></label></div></div>`;
  }
  function openModal(s){
    const modal=$('#gradeModal');
    $('#gradeModalBody').innerHTML=`<div class="app-dialog-head"><div class="grade-student-head"><div class="grade-avatar">${esc((s.first_name||'?')[0])}${esc((s.last_name||'?')[0])}</div><div><small>${esc(s.student_no)}</small><h3>${esc(s.last_name)}, ${esc(s.first_name)}</h3><p>${esc(s.course)} - ${esc(s.year_level)}</p></div></div><button class="modal-close" id="closeGradeModal">x</button></div><div class="grade-modal-content">${section(s,'1')}${section(s,'2')}<div id="gradeMessage"></div></div><div class="app-dialog-actions"><button class="btn" id="cancelGrade">Close</button><button class="btn primary" id="saveGrades">Save Grades</button></div>`;
    modal.classList.remove('hidden');
    const close=()=>modal.classList.add('hidden'); $('#closeGradeModal').onclick=close; $('#cancelGrade').onclick=close; modal.querySelector('.app-dialog-backdrop').onclick=close;
    ['1','2'].forEach(level=>{ ['mid','fin'].forEach(k=>{ const el=$(`#${k}${level}`); if(el&&!el.disabled)el.addEventListener('input',()=>updateCalc(level)); }); updateCalc(level); });
    $('#saveGrades').onclick=async()=>{
      const btn=$('#saveGrades'); btn.disabled=true; let saved=0;
      try{
        for(const level of ['1','2']){
          if(!Number(s[`approved_ms${level}`]))continue;
          const mid=$(`#mid${level}`).value, fin=$(`#fin${level}`).value, avg=avgGrade(mid,fin);
          if(mid===''&&fin==='')continue;
          if(avg===null)throw new Error(`${prefix} ${level} grades must both be between 1.00 and 5.00.`);
          const x=await API.post(`/api/admin/${p}/grades`,{student_id:s.student_id,ms_level:level,midterm:Number(mid),final_term:Number(fin)});
          gm.set(`${s.student_id}|${level}`,{student_id:s.student_id,ms_level:level,midterm:Number(mid),final_term:Number(fin),grade:x.grade,status:x.status}); saved++;
        }
        if(!saved)throw new Error('Enter valid grades before saving.');
        toast('Grades saved successfully.'); close(); renderRows();
      }catch(e){ $('#gradeMessage').innerHTML=`<div class="notice error">${esc(e.message)}</div>`; } finally{btn.disabled=false}
    };
  }
  function updateCalc(level){ const a=$(`#mid${level}`),b=$(`#fin${level}`); if(!a||a.disabled)return; const avg=avgGrade(a.value,b.value), st=gradeStatus(avg); $(`#avg${level}`).textContent=avg===null?'':`Avg: ${avg.toFixed(2)}`; $(`#st${level}`).textContent=st.label; $(`#st${level}`).className=`badge ${st.cls}`; }
  ['#gradeLevel','#gradeSY','#gradeYear'].forEach(x=>$(x).onchange=renderRows); $('#gradeSearch').oninput=renderRows; renderRows();
}

