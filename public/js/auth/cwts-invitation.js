(() => {
  const storageKey='cwts-invitation-setup';
  const params=new URLSearchParams(location.hash.slice(1));
  let token=params.get('token')||'';
  const validToken=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  const clearSaved=()=>{try{sessionStorage.removeItem(storageKey);}catch{}};
  if(params.has('token')){
    clearSaved();
    if(validToken(token)){
      try{
        sessionStorage.setItem(storageKey,JSON.stringify({token,expires:Date.now()+24*60*60*1000}));
        history.replaceState(null,'',location.pathname);
      }catch{/* Keep the fragment when tab storage is unavailable so refresh still works. */}
    }
  }else{
    try{
      const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');
      if(saved&&validToken(saved.token)&&Number(saved.expires)>Date.now())token=saved.token;
      else clearSaved();
    }catch{clearSaved();}
  }
  const form=document.getElementById('instructorPasswordForm'),message=document.getElementById('invitationMessage');
  if(!validToken(token)){form.hidden=true;message.textContent='The invitation code is missing or incomplete. Reopen the full link from your latest invitation email. If it still does not work, ask the NSTP Director for a new invitation.';return;}
  document.getElementById('showInvitationPassword').onchange=event=>{
    form.elements.password.type=form.elements.confirm.type=event.target.checked?'text':'password';
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    if(form.elements.password.value!==form.elements.confirm.value){message.textContent='The passwords do not match. Please enter them again.';return;}
    const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Setting your password…';
    try{
      const result=await API.post('/api/auth/cwts-instructor/accept-invitation',{token,password:form.elements.password.value});
      clearSaved();history.replaceState(null,'',location.pathname);
      form.reset();form.hidden=true;message.textContent=result.message;message.classList.add('success');
      document.querySelector('.cwts-login-link').classList.add('btn','primary');
    }catch(error){message.textContent=error.message;}
    finally{button.disabled=false;button.textContent='Set password';}
  };
})();
