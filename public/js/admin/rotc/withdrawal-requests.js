document.addEventListener('DOMContentLoaded',()=>bootstrapPortalPage({
  expectedPortal:'rotc-admin',shellRole:'rotc',moduleSrc:'/assets/js/admin/rotc/pages.js',render:async(content)=>{
    const requests=await API.get('/api/admin/rotc/withdrawals');
    content.innerHTML=`<div class="withdraw-tabs" id="withdrawTabs"></div><div id="withdrawList" class="withdraw-list"></div><div id="withdrawRejectModal" class="app-dialog hidden"><div class="app-dialog-backdrop"></div><div class="app-dialog-card small-modal"><div class="app-dialog-head"><div><span class="modal-eyebrow">Withdrawal Request</span><h3>Reject Request</h3><p id="withdrawRejectName"></p></div><button class="modal-close" id="withdrawRejectClose">x</button></div><form id="withdrawRejectForm" class="modal-form-body"><input type="hidden" name="id"><label class="field">Admin Remarks<textarea name="remarks" rows="4" required placeholder="Enter rejection reason..."></textarea></label><div class="app-dialog-actions"><button type="button" class="btn" id="withdrawRejectCancel">Cancel</button><button class="btn danger">Reject Request</button></div></form></div></div>`;
    let filter='all';
    function draw(){
      const pending=requests.filter(x=>x.status==='pending').length;
      $('#withdrawTabs').innerHTML=['all','pending','approved','rejected'].map(f=>`<button class="${filter===f?'active':''}" data-wfilter="${f}">${f[0].toUpperCase()+f.slice(1)}${f==='pending'&&pending?` <b>${pending}</b>`:''}</button>`).join('');
      const rows=filter==='all'?requests:requests.filter(x=>x.status===filter);
      $('#withdrawList').innerHTML=rows.length?rows.map(r=>`<article class="withdraw-card"><div class="withdraw-card-top"><div class="withdraw-avatar">${esc((r.first_name||'?')[0])}${esc((r.last_name||'?')[0])}</div><div class="withdraw-student"><h3>${esc(r.last_name)}, ${esc(r.first_name)}</h3><p>${esc(r.student_no)} - ${esc(r.course)} - ${esc(r.year_level)}</p><small>Submitted ${formatWithdrawDate(r.created_at)}</small></div>${badge(r.status)}</div><div class="withdraw-reason"><small>Reason for Withdrawal</small><p>${esc(r.reason)}</p></div>${r.status==='rejected'&&r.admin_remarks?`<div class="notice error"><strong>Admin Remarks:</strong> ${esc(r.admin_remarks)}</div>`:''}${r.status==='approved'?`<div class="notice success">Student has been reverted to a regular cadet and assigned to the regular ROTC roster.</div>`:''}${r.status==='pending'?`<div class="actions"><button class="btn success" data-wapprove="${r.id}">Approve</button><button class="btn danger ghost" data-wreject="${r.id}">Reject</button></div>`:''}</article>`).join(''):`<div class="panel empty">No ${filter==='all'?'':filter+' '}withdrawal requests.</div>`;
      $$('[data-wfilter]').forEach(b=>b.onclick=()=>{filter=b.dataset.wfilter;draw()});
      $$('[data-wapprove]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const x=await API.patch(`/api/admin/rotc/withdrawals/${b.dataset.wapprove}`,{status:'approved'});toast(x.message);setTimeout(()=>location.reload(),700)}catch(e){toast(e.message,true);b.disabled=false}});
      $$('[data-wreject]').forEach(b=>b.onclick=()=>openReject(Number(b.dataset.wreject)));
    }
    function openReject(id){const r=requests.find(x=>Number(x.id)===id),modal=$('#withdrawRejectModal');$('#withdrawRejectName').textContent=`Rejecting request from ${r.first_name} ${r.last_name}.`;const f=$('#withdrawRejectForm');f.id.value=id;f.remarks.value='';modal.classList.remove('hidden')}
    const close=()=>$('#withdrawRejectModal').classList.add('hidden');$('#withdrawRejectClose').onclick=close;$('#withdrawRejectCancel').onclick=close;$('#withdrawRejectModal').querySelector('.app-dialog-backdrop').onclick=close;$('#withdrawRejectForm').onsubmit=async e=>{e.preventDefault();const id=e.target.id.value,remarks=e.target.remarks.value.trim();if(!remarks)return;try{const x=await API.patch(`/api/admin/rotc/withdrawals/${id}`,{status:'rejected',admin_remarks:remarks});toast(x.message);setTimeout(()=>location.reload(),650)}catch(err){toast(err.message,true)}};
    draw();
  }
}));
function formatWithdrawDate(v){if(!v)return'-';const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}


