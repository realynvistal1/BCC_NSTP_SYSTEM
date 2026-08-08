async function initLogin(){
  const form=$('#loginForm');
  form?.addEventListener('submit',async e=>{e.preventDefault();const portal=form.dataset.portal;const btn=form.querySelector('button[type="submit"],button');const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='Signing in...'}try{const d=await API.post('/api/auth/login',{email:form.email.value,password:form.password.value,portal});location.href=d.portal==='student'?'/student/dashboard':d.portal==='officer'?'/officer/dashboard':d.portal==='cwts-admin'?'/admin/cwts/dashboard':'/admin/rotc/dashboard'}catch(err){$('#msg').textContent=err.message;$('#msg').className='notice error'}finally{if(btn){btn.disabled=false;btn.textContent=old}}})
}
document.addEventListener("DOMContentLoaded", () => { initPasswordToggles(); initLogin(); });
