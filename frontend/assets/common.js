'use strict';
const API=async(route,{method='GET',data,token}={})=>{
 const options={method,headers:{}};
 if(data!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(data);}
 if(token)options.headers.Authorization=`Bearer ${token}`;
 let response;
 try{response=await fetch('/api'+route,options);}catch{throw Error('Cannot reach the server. Check your connection.');}
 const json=await response.json().catch(()=>({}));
 if(!response.ok){
  if(response.status===401 && token){
    sessionStorage.removeItem('faculty_eval_token');
    sessionStorage.removeItem('faculty_eval_role');
    const currentRole=location.pathname.startsWith('/admin/')?'admin':'faculty';
    if(location.pathname.includes('/dashboard.html')){
      toast('Session expired. Please sign in again.','error');
      setTimeout(()=>location.replace(`/${currentRole}/login.html`),700);
    }
  }
  throw Error(json.message||`Request failed (${response.status}).`);
 }
 return json;
};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=selector=>document.querySelector(selector);
const el=(tag,text)=>{const x=document.createElement(tag);x.textContent=String(text??'');return x;};
const toast=(message,type='')=>{document.querySelector('.toast')?.remove();const e=el('div',message);e.className='toast '+type;document.body.append(e);setTimeout(()=>e.remove(),4200);};
const pill=status=>`<span class="pill ${esc(status)}">${esc(status)}</span>`;
const niceDate=d=>d?String(d).slice(0,16).replace('T',' '):'—';
const moneyNumber=n=>Number(n||0).toLocaleString();
const getToken=()=>sessionStorage.getItem('faculty_eval_token');
function signOut(role){sessionStorage.removeItem('faculty_eval_token');sessionStorage.removeItem('faculty_eval_role');window.location.href=`/${role}/login.html`;}
function requireRole(role){if(!getToken()||sessionStorage.getItem('faculty_eval_role')!==role){window.location.replace(`/${role}/login.html`);return false;}return true;}
const authApi=(route,data)=>API(route,{method:'POST',data});
const privateApi=(route,{method='GET',data}={})=>API(route,{method,data,token:getToken()});
const formData=form=>Object.fromEntries(new FormData(form).entries());
function showTab(tab){document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===tab));document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===tab));}
function makeModal(title,content){const back=document.createElement('div');back.className='popup-backdrop';const pop=document.createElement('div');pop.className='popup';pop.innerHTML=`<div class="row spaced"><h2>${esc(title)}</h2><button type="button" class="btn secondary small" id="closeModal">Close ✕</button></div>`;pop.append(content);back.append(pop);document.body.append(back);pop.querySelector('#closeModal').onclick=()=>back.remove();back.addEventListener('click',e=>{if(e.target===back)back.remove();});return back;}

// Accessible, numeric rating distribution (based only on answer counts).
function paintRatingBars(target,distribution){
 if(!target)return;
 const counts=Array.from({length:5},(_,i)=>Number(distribution?.find?.(v=>Number(v.rating)===5-i)?.n||0));
 const peak=Math.max(1,...counts);
 target.innerHTML=counts.map((n,i)=>`<div class="rating-row"><span>${5-i} ★</span><div class="rating-track"><div style="width:${n/peak*100}%"></div></div><strong>${moneyNumber(n)}</strong></div>`).join('');
}
function updateRing(target,value){if(!target)return;const n=Number(value||0);target.style.setProperty('--ring-fill',Math.max(0,Math.min(100,n/5*100))+'%');}
function photoUrl(id){return id?`/api/public/faculty/${encodeURIComponent(id)}/photo`: '/assets/avatar.svg';}
// Allow section switching from quick action buttons.
document.addEventListener('click',e=>{const b=e.target.closest('[data-jump]');if(!b)return;showTab(b.dataset.jump);if(typeof load==='function')void load(b.dataset.jump);});

// Chart bars use real response counts, grouped by evaluation period or school year.
function drawYearBars(target,rows){
 if(!target)return;
 if(!rows?.length){target.innerHTML='<p class="muted">No evaluation history yet.</p>';return;}
 const values=rows.slice(0,12).reverse(),peak=Math.max(1,...values.map(x=>Number(x.responses||0)));
 target.innerHTML=values.map(x=>{const n=Number(x.responses||0),w=n?Math.max(3,n/peak*100):0;
  return `<div class="year-bar-row"><span title="${esc(x.title||x.school_year)}">${esc(x.school_year||x.title||'')}</span><div class="year-track"><div style="width:${w}%" title="${n} student evaluations"></div></div><strong>${moneyNumber(n)}</strong></div>`;
 }).join('');
}

function responseProgress(a={}){
 const n=Math.max(0,Number(a.response_count)||0),target=Number(a.required_students);
 if(!Number.isInteger(target)||target<1)return `<div class="response-progress"><strong>${n} responses</strong></div>`;
 return `<div class="response-progress"><strong>${n} / ${target}</strong><progress value="${Math.min(n,target)}" max="${target}" aria-label="Responses received"></progress><small>${n>=target?'Complete':(target-n)+' more needed'}</small></div>`;
}
function ratingSummary(data={}){
 const a=data.assignment||{},summary=data.summary;
 const target=Number(summary?.required??a.required_students),responses=Math.max(0,Number(a.response_count)||0);
 const hasTarget=Number.isInteger(target)&&target>0;
 const final=typeof summary?.final==='boolean'?summary.final:hasTarget&&responses>=target;
 const message=final?'Required responses received.':hasTarget?Math.max(0,target-responses)+' more responses needed for a final rating.':'';
 const score=a.average_rating!=null&&Number.isFinite(Number(a.average_rating))?Number(a.average_rating).toFixed(2)+' / 5':'No ratings';
 const breakdown=summary&&['positive','neutral','negative'].every(key=>Number.isInteger(Number(summary[key]))&&Number(summary[key])>=0)?`<div class="student-sentiment"><div><strong>${Number(summary.positive)}</strong><span>Positive</span><small>Average 3.50 to 5</small></div><div><strong>${Number(summary.neutral)}</strong><span>Neutral</span><small>Average 2.50 to 3.49</small></div><div><strong>${Number(summary.negative)}</strong><span>Negative</span><small>Average 1 to 2.49</small></div></div>`:'';
 return `<div class="result-summary"><div><small>Student responses</small>${responseProgress({...a,required_students:target})}</div><div><small>${final?'Final rating':'Current average'}</small><strong class="result-score">${score}</strong><span>${message}</span></div></div>${breakdown}`;
}

function termMetadata(record,periods){
 const period=periods.find(p=>String(p.id)===String(record.period_id));
 return {school_year:String(record.school_year??period?.school_year??'').trim(),semester:String(record.semester??period?.semester??'').trim()};
}
function termFilters(prefix,records,onChange,countRecords=records){
 const year=document.getElementById(prefix+'Year'),semester=document.getElementById(prefix+'Semester');
 const previous=year.value,previousSemester=semester.value;
 const metadata=countRecords.map(r=>termMetadata(r,records));
 const years=[...new Set(metadata.map(r=>r.school_year).filter(Boolean))].sort().reverse();
 year.innerHTML='<option value="">All school years</option>'+years.map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('');
 year.value=years.includes(previous)?previous:'';
 const box=year.closest('.term-filter-box');
 let summary=box.querySelector('.term-filter-summary');
 if(!summary){summary=document.createElement('div');summary.className='term-filter-summary';summary.setAttribute('role','status');box.append(summary);}
 let reset=box.querySelector('.term-filter-reset');
 if(!reset){reset=document.createElement('button');reset.type='button';reset.className='btn secondary small term-filter-reset';box.querySelector('.term-filter-controls').append(reset);}
 reset.textContent='Reset filters';
 function fillSemesters(selected){
  const available=metadata.filter(r=>!year.value||r.school_year===year.value);
  const terms=[...new Set(['1st Semester','2nd Semester',...available.map(r=>r.semester).filter(Boolean)])];
  const order=['1st Semester','2nd Semester','Summer','Full Year'];terms.sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  semester.innerHTML='<option value="">All semesters</option>'+terms.map(t=>`<option value="${esc(t)}">${esc(t)}${available.some(r=>r.semester===t)?'':' (no records yet)'}</option>`).join('');
  semester.value=terms.includes(selected)?selected:'';
  semester.disabled=false;
 }
 function matches(record){const term=termMetadata(record,records);return (!year.value||term.school_year===year.value)&&(!semester.value||term.semester===semester.value);}
 function update(){
  document.getElementById(prefix+'Heading').textContent=prefix==='teachingTerm'?'Filter my subjects':'Filter evaluations';
  const total=countRecords.filter(matches).length,noun=prefix==='teachingTerm'?'subject':prefix==='reportTerm'?'report':'evaluation';
  summary.textContent=total+' '+noun+(total===1?'':'s')+' shown'+(year.value?' / '+year.value:' / All years')+(semester.value?' / '+semester.value:' / All semesters');
  reset.disabled=!year.value&&!semester.value;
  onChange(matches);
 }
 fillSemesters(previousSemester);
 reset.onclick=()=>{year.value='';fillSemesters('');update();};
 year.onchange=()=>{fillSemesters(semester.value);update();};semester.onchange=update;update();
}

function commentPage(comments,page,size=5){
 const pages=Math.max(1,Math.ceil(comments.length/size)),current=Math.max(0,Math.min(pages-1,page));
 return {page:current,pages,start:current*size,items:comments.slice(current*size,(current+1)*size)};
}
function renderResultComments(container,comments){
 container.innerHTML=`<details class="comments-dropdown"><summary><strong>Student comments <span class="comment-count">${comments.length}</span></strong><span class="comments-chevron" aria-hidden="true">&#8964;</span></summary><div class="comments-content"><ol class="comments-list"></ol><div class="comments-pagination"><button type="button" class="btn secondary small comments-prev">Previous</button><span class="comments-page" role="status"></span><button type="button" class="btn secondary small comments-next">Next</button></div></div></details>`;
 let page=0;
 const list=container.querySelector('.comments-list'),prev=container.querySelector('.comments-prev'),next=container.querySelector('.comments-next');
 function render(){
  const result=commentPage(comments,page);page=result.page;
  list.start=result.start+1;
  list.innerHTML=result.items.map(c=>`<li><span>${esc(c.comment_text)}</span></li>`).join('');
  container.querySelector('.comments-page').textContent=comments.length?(result.start+1)+'?'+(result.start+result.items.length)+' of '+comments.length:'No comments yet';
  prev.disabled=page===0;next.disabled=page===result.pages-1;
  prev.hidden=next.hidden=comments.length<=5;
 }
 prev.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};render();
}
