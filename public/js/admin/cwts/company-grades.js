async function renderAdminGrades(program, content) {
  const base='/api/admin/cwts';
  let saved, submissions, busy=false;
  let companyAssignments=new Map();
  const filters={year:'',level:'',company:'',status:'',search:''};
  const fullName=s=>[s.last_name+',',s.first_name,s.middle_name].filter(Boolean).join(' ');
  function average(r){return r.mid==null||r.final==null?null:Math.round(((Number(r.mid)+Number(r.final))/2)*100)/100;}
  function result(r){const avg=average(r);if(avg===null)return '--';const limit=/criminology|education|\bBEED\b|\bBSED\b/i.test(r.student.course||'')?2.5:3;return avg<=limit?'Passed':'Failed';}
  const value=v=>v==null||v===''?'--':Number(v).toFixed(2);
  async function load(){
    [saved,submissions]=await Promise.all([API.get(base+'/grades'),API.get(base+'/grade-submissions')]);
    const ids=[...new Set((saved.history||[]).map(r=>Number(r.schedule_id)).filter(id=>Number.isSafeInteger(id)&&id>0))];
    const assignments=await Promise.all(ids.map(async id=>[id,await API.get(base+'/instructor-assignments?schedule_id='+id)]));
    companyAssignments=new Map(assignments);draw();
  }
  function portrait(url,name){const initials=name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('');return `<span class="company-grade-avatar"><span aria-hidden="true">${esc(initials)}</span><img src="${url}" alt="" loading="lazy" onerror="this.remove()"></span>`;}
  function instructorHeader(record){
    const scope=companyAssignments.get(Number(record.schedule_id)),assignment=scope?.assignments.find(a=>a.company===record.company);
    if(!assignment)return '<span class="company-grade-instructor-empty">No instructor assigned</span>';
    const instructor=scope.instructors.find(i=>Number(i.id)===Number(assignment.instructor_id))||assignment;
    const name=[instructor.first_name,instructor.middle_name,instructor.last_name].filter(Boolean).join(' ');
    return `<div class="company-grade-instructor">${portrait(base+'/instructors/'+Number(assignment.instructor_id)+'/photo',name)}<div><small>Instructor</small><strong>${esc(name)}</strong></div></div>`;
  }
  function records(){
    const students=new Map((saved.students||[]).map(s=>[Number(s.student_id),s]));
    const byRecord=new Map(submissions.map(s=>[Number(s.enrollment_record_id),s]));
    return (saved.history||[]).filter(r=>r.enrollment_status==='approved'||r.final_term!=null).map(r=>{
      const student=students.get(Number(r.student_id))||{},submission=byRecord.get(Number(r.enrollment_record_id));
      return {...r,student,submission,company:r.assignment_company||'',year:r.school_year||'',state:r.final_term!=null?'approved':submission?.status||'ungraded',mid:r.midterm??submission?.midterm,final:r.final_term??submission?.final_term};
    });
  }
  function filtered(){const query=filters.search.trim().toLowerCase();return records().filter(r=>(!filters.year||r.year===filters.year)&&(!filters.level||String(r.ms_level)===filters.level)&&(!filters.company||(r.company||'__none')===filters.company)&&(!filters.status||r.state===filters.status)&&(!query||(fullName(r.student)+' '+r.student.student_no).toLowerCase().includes(query)));}
  function draw(){
    const all=records(),approved=all.filter(r=>r.state==='approved').length;
    const years=[...new Set(all.map(r=>r.year).filter(Boolean))].sort().reverse(),companies=[...new Set(all.map(r=>r.company).filter(Boolean))].sort();
    content.innerHTML=`<div class="grade-summary-grid" data-summary>${[['Students',new Set(all.map(r=>r.student_id)).size,''],['Approved',approved,'green'],['For Review',all.filter(r=>r.state==='submitted').length,'blue'],['Not Submitted',all.filter(r=>r.state==='ungraded').length,'amber'],['Returned',all.filter(r=>r.state==='returned').length,'red']].map(([label,count,tone])=>`<div class="grade-summary-card ${tone}"><small>${label}</small><strong>${count}</strong></div>`).join('')}</div><section class="panel grade-panel"><div class="admin-grade-filter-panel"><header><span aria-hidden="true">&#9776;</span><div><h2>Filter Student Grades</h2><p>Find students and review submitted grades.</p></div></header><div class="grade-tools"><select data-filter="year" aria-label="School year"><option value="">All School Years</option>${years.map(y=>`<option>${esc(y)}</option>`).join('')}</select><select data-filter="level" aria-label="NSTP level"><option value="">All NSTP Levels</option><option value="1">NSTP 1</option><option value="2">NSTP 2</option></select><select data-filter="company" aria-label="Company"><option value="">All Companies</option>${companies.map(c=>`<option value="${esc(c)}">${esc(c)} Company</option>`).join('')}<option value="__none">Unassigned</option></select><select data-filter="status" aria-label="Submission status"><option value="">All Statuses</option><option value="submitted">For Review</option><option value="approved">Approved</option><option value="returned">Returned</option><option value="ungraded">Not Submitted</option></select><input type="search" data-filter="search" placeholder="Search name or student ID"><button class="btn success" data-download>Download Excel</button><button class="clear-filter-btn" data-clear>Clear Filters</button></div></div><div data-companies></div><div class="table-footer" data-total></div></section>`;
    content.querySelectorAll('[data-filter]').forEach(field=>{field.value=filters[field.dataset.filter];field[field.type==='search'?'oninput':'onchange']=()=>{filters[field.dataset.filter]=field.value;renderCompanies();};});
    content.querySelector('[data-clear]').onclick=()=>{Object.keys(filters).forEach(k=>filters[k]='');draw();};
    content.querySelector('[data-download]').onclick=download;
    renderCompanies();
  }
  function renderCompanies(){
    const rows=filtered(),groups=new Map();
    const summary=[['Students',new Set(rows.map(r=>r.student_id)).size,''],['Approved',rows.filter(r=>r.state==='approved').length,'green'],['For Review',rows.filter(r=>r.state==='submitted').length,'blue'],['Not Submitted',rows.filter(r=>r.state==='ungraded').length,'amber'],['Returned',rows.filter(r=>r.state==='returned').length,'red']];
    content.querySelector('[data-summary]').innerHTML=summary.map(([label,count,tone])=>`<div class="grade-summary-card ${tone}"><small>${label}</small><strong>${count}</strong></div>`).join('');
    rows.forEach(r=>{const key=JSON.stringify([r.year,String(r.ms_level),r.company]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});
    const ordered=[...groups.entries()].sort((a,b)=>b[1][0].year.localeCompare(a[1][0].year)||Number(a[1][0].ms_level)-Number(b[1][0].ms_level)||a[1][0].company.localeCompare(b[1][0].company));
    content.querySelector('[data-companies]').innerHTML=ordered.map(([key,list],index)=>{const first=list[0],pending=list.filter(r=>r.state==='submitted');return `<section class="company-grade-group"><header><div><h2>${first.company?esc(first.company)+' Company':'Unassigned Students'}</h2>${instructorHeader(first)}</div><button class="btn success" data-approve-group="${index}" ${!pending.length||busy?'disabled':''}>Approve All Grades (${pending.length})</button></header><div class="table-wrap"><table class="data-table grade-table"><thead><tr><th>#</th><th>Student</th><th>Course</th><th>Midterm</th><th>Final</th><th>Average</th><th>Result</th><th>Status</th><th>Action</th></tr></thead><tbody>${list.map((r,i)=>`<tr><td>${i+1}</td><td><div class="company-grade-student">${portrait(base+'/students/'+Number(r.student_id)+'/photo',fullName(r.student))}<div><strong>${esc(fullName(r.student))}</strong><small class="company-grade-student-id">${esc(r.student.student_no||'')}</small></div></div></td><td>${esc(r.student.course||'')}</td><td>${value(r.mid)}</td><td>${value(r.final)}</td><td><strong>${value(average(r))}</strong></td><td>${result(r)}</td><td><span class="badge ${r.state==='approved'?'success':r.state==='returned'?'danger':'warning'}">${({submitted:'For Review',approved:'Approved',returned:'Returned',ungraded:'Not Submitted'})[r.state]}</span></td><td>${r.state==='submitted'?`<div class="company-grade-actions"><button class="btn small success" data-approve="${Number(r.submission.id)}" ${busy?'disabled':''}>Approve</button><button class="btn small" data-return="${Number(r.submission.id)}" ${busy?'disabled':''}>Return</button></div>`:'--'}</td></tr>`).join('')}</tbody></table></div></section>`;}).join('')||'<div class="empty">No students match these filters.</div>';
    content.querySelector('[data-total]').textContent=rows.length+' records shown';
    content.querySelectorAll('[data-approve-group]').forEach(button=>button.onclick=()=>review(ordered[Number(button.dataset.approveGroup)][1].filter(r=>r.state==='submitted'),'approve'));
    content.querySelectorAll('[data-approve],[data-return]').forEach(button=>button.onclick=()=>review(rows.filter(r=>Number(r.submission?.id)===Number(button.dataset.approve||button.dataset.return)),button.dataset.approve?'approve':'return'));
  }
  async function review(rows,action){
    if(busy||!rows.length)return;let note='';
    if(action==='return'){note=prompt('What should the instructor correct?');if(note===null)return;if(!note.trim()){toast('Enter a correction note.',true);return;}}
    else if(!confirm(`Approve ${rows.length} submitted grade${rows.length===1?'':'s'}?`))return;
    busy=true;renderCompanies();let completed=0,error='';
    try{for(const row of rows){await API.patch(base+'/grade-submissions/'+Number(row.submission.id)+'/review',{action,note,expected_version:Number(row.submission.version)});completed++;}}catch(e){error=e.message;}
    finally{busy=false;try{await load();}catch(e){error=error||e.message;renderCompanies();}}
    toast(error?`${completed} processed. ${error}`:`${completed} grade${completed===1?'':'s'} ${action==='approve'?'approved':'returned'}.`,Boolean(error));
  }
  function download(){
    const rows=filtered();if(!rows.length){toast('No records to download.',true);return;}
    const xml=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const row=values=>'<Row>'+values.map(v=>`<Cell><Data ss:Type="String">${xml(v)}</Data></Cell>`).join('')+'</Row>';
    const body=row(['Student ID','Student Name','Course','School Year','NSTP Level','Company','Midterm','Final','Average','Result','Status'])+rows.map(r=>row([r.student.student_no,fullName(r.student),r.student.course,r.year,r.ms_level,r.company,value(r.mid),value(r.final),value(average(r)),result(r),r.state])).join('');
    const blob=new Blob([`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="CWTS Grades"><Table>${body}</Table></Worksheet></Workbook>`],{type:'application/vnd.ms-excel;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='CWTS_Company_Grades.xls';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  await load();
}
