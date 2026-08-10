async function initLogin(){
  const form=$('#loginForm');
  form?.addEventListener('submit',async e=>{e.preventDefault();const btn=form.querySelector('button[type="submit"],button');const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='Signing in...'}try{const d=await API.post('/api/auth/login',{email:form.email.value,password:form.password.value});await API.get('/api/auth/me');location.assign(d.redirect||'/student/dashboard')}catch(err){$('#msg').textContent=err.message==='Please log in again.'?'Login succeeded but the browser did not keep the session cookie. Try using localhost, allow cookies for this site, then refresh and log in again.':err.message;$('#msg').className='notice error'}finally{if(btn){btn.disabled=false;btn.textContent=old}}})
}
document.addEventListener("DOMContentLoaded", () => { initPasswordToggles(); initLogin(); });
