window.buildCwtsAttendanceWord=function(records,filters={}){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>value?new Date(value).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'numeric'}):'--';
  const time=value=>value?new Date(value).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'}):'--';
  const groups=new Map();records.forEach(r=>{const key=r.attendance_scope.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});
  const sections=[...groups.values()].sort((a,b)=>String(a[0].attendance_scope.school_year).localeCompare(String(b[0].attendance_scope.school_year))||Number(a[0].attendance_scope.mi_number)-Number(b[0].attendance_scope.mi_number)||String(a[0].attendance_scope.mi_type).localeCompare(String(b[0].attendance_scope.mi_type))||String(a[0].attendance_scope.company).localeCompare(String(b[0].attendance_scope.company))).map((list,index)=>{
    const a=list[0].attendance_scope,counts={present:0,late:0,absent:0,unmarked:0};list.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);
    const sorted=list.slice().sort((a,b)=>String(a.last_name).localeCompare(String(b.last_name))||String(a.first_name).localeCompare(String(b.first_name)));
    return `${index?'<br clear="all" class="word-page-break" style="mso-special-character:line-break;page-break-before:always">':''}<div class="word-page"><div class="word-title">CWTS ${esc(String(a.company).toUpperCase())} ATTENDANCE SUMMARY</div><table class="word-meta"><tr><td class="label">CS / Type</td><td>CS ${esc(a.mi_number)} - ${esc(a.mi_type.toUpperCase())}</td><td class="label">Session Date</td><td>${esc(date(a.open_date))}</td></tr><tr><td class="label">Time Window</td><td colspan="3">${esc(a.mi_type.toUpperCase())}: ${esc(time(a.open_date))} - ${esc(time(a.close_date))}</td></tr><tr><td class="label">School Year</td><td>${esc(a.school_year)}</td><td class="label">CWTS Level</td><td>${esc(a.ms_level)}</td></tr><tr><td class="label">NSTP Component</td><td>CWTS</td><td class="label">Sessions Included</td><td>1</td></tr></table><table class="word-totals"><tr><td>TOTAL: ${list.length}</td><td class="tone-present">PRESENT: ${counts.present}</td><td class="tone-late">LATE: ${counts.late}</td><td class="tone-absent">ABSENT: ${counts.absent}</td><td class="tone-unmarked">NOT MARKED: ${counts.unmarked}</td></tr></table><div class="word-section"><table class="word-group-banner"><tr class="word-heading-row"><td>${esc(String(a.company).toUpperCase())} COMPANY</td></tr></table><table class="word-table"><colgroup><col style="width:8%"><col style="width:42%"><col style="width:22%"><col style="width:15%"><col style="width:13%"></colgroup><thead><tr><th>No.</th><th>Name</th><th>ID Number</th><th>Status</th><th>Time ${esc(a.mi_type.toUpperCase())}</th></tr></thead><tbody>${sorted.map((r,i)=>`<tr><td>${i+1}</td><td>${esc([r.last_name+',',r.first_name,r.middle_name].filter(Boolean).join(' '))}</td><td>${esc(r.student_id)}</td><td>${esc(r.status==='unmarked'?'Not Yet Marked':r.status[0].toUpperCase()+r.status.slice(1))}</td><td>${esc(time(r.created_at))}</td></tr>`).join('')}</tbody></table><div class="word-section-summary">Total: ${list.length} &nbsp; Present: ${counts.present} &nbsp; Late: ${counts.late} &nbsp; Absent: ${counts.absent}</div><p class="word-filter-note">Status: ${esc(filters.status||'All')} &bull; Search: ${esc(filters.search||'All students')}</p></div></div>`;
  }).join('');
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>CWTS Attendance Summary</title><style>@page{size:11in 8.5in;margin:.5in}          body { font-family: Arial, sans-serif; color:#17345f; margin:32px; }
          .word-doc { max-width: 980px; margin: 0 auto; }
          .word-page { width:100%; }
          .word-page-break { mso-special-character:line-break; page-break-before:always; }
          .word-title { text-align:center; font-size:18px; font-weight:700; color:#183f93; margin-bottom:16px; }
          .word-meta { width:100%; border-collapse:collapse; table-layout:fixed; margin-bottom:12px; }
          .word-meta td { border:1px solid #9aa9bf; padding:4px 7px; font-size:12px; line-height:1.2; vertical-align:middle; }
          .word-meta .label { background:#dbe8f7; font-weight:700; width:18%; }
          .word-meta .word-time-windows { font-size:11px; line-height:1.25; padding-top:5px; padding-bottom:5px; }
          .word-meta .word-time-grid { width:100%; border-collapse:collapse; table-layout:fixed; }
          .word-meta .word-time-grid td { width:50%; border:0; padding:0 8px 0 0; font-size:11px; line-height:1.25; text-align:left; }
          .word-totals { width:100%; border-collapse:collapse; margin-bottom:24px; }
          .word-totals td { border:1px solid #9aa9bf; padding:7px 10px; font-weight:700; text-align:center; font-size:14px; }
          .tone-present { background:#e4f7e8; color:#167a2d; }
          .tone-late { background:#fff4d6; color:#b86d00; }
          .tone-absent { background:#ffe1de; color:#c1281f; }
          .word-section { margin: 16px 0 0; }
          .word-group-banner { width:100%; border-collapse:collapse; margin:0 0 8px; page-break-after:avoid; }
          .word-group-banner td { border:1px solid #9aa9bf; font-weight:700; text-align:center; }
          .word-group-banner .word-heading-row td { background:#1f4297; color:#fff; font-size:17px; padding:8px 12px; }
          .word-group-banner .word-assignment-row td { background:#dbe8f7; color:#173f86; font-size:15px; padding:8px 12px; }
          .word-table { width:100%; border-collapse:collapse; margin-top:8px; }
          .word-table thead { display:table-header-group; }
          .word-table tr { page-break-inside:avoid; }
          .word-table th { background:#1f2937; color:#fff; font-size:12px; padding:5px 6px; text-align:left; border:1px solid #9aa9bf; }
          .word-table td { font-size:12px; padding:5px 6px; border:1px solid #9aa9bf; color:#111827; }
          .word-empty { padding:18px 8px !important; text-align:center; color:#64748b !important; font-style:italic; }
          .word-section-summary { margin-top:8px; display:flex; gap:18px; flex-wrap:wrap; font-size:12px; font-weight:700; color:#334155; }
        .tone-unmarked{background:#edf0f6;color:#61748e}.word-filter-note{font-size:11px;color:#64748b}</style></head><body><div class="word-doc">${sections}</div></body></html>`;
};
