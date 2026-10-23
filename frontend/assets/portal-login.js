"use strict";
const role=location.pathname.startsWith('/admin/')?'admin':'faculty';
if(getToken()&&sessionStorage.getItem('faculty_eval_role')===role)location.replace('/'+role+'/dashboard.html');
function showRegister(yes){if(role==='admin')return;$('#loginView').classList.toggle('hidden',yes);$('#registerView').classList.toggle('hidden',!yes);history.replaceState(null,'',yes?'#register':location.pathname);}
if(role==='faculty'){
 $('#showRegister').onclick=()=>showRegister(true);
 $('#showLogin').onclick=()=>showRegister(false);
 if(location.hash==='#register')showRegister(true);
}
document.querySelectorAll('.pass-toggle').forEach(b=>b.onclick=()=>{const f=document.getElementById(b.dataset.target);f.type=f.type==='password'?'text':'password';const visible=f.type==='text';b.textContent=visible?'Hide':'Show';b.setAttribute('aria-pressed',String(visible));b.setAttribute('aria-label',`${visible?'Hide':'Show'} ${f.name==='confirm'?'confirm password':'password'}`);});
$('#login').onsubmit=async(e)=>{e.preventDefault();const button=$('#login button[type="submit"]');button.disabled=true;button.textContent='Signing in…';try{const data=await authApi('/auth/login',{...formData(e.target),portal:role});if(data.user.role!==role)throw Error('Please sign in through your own portal.');sessionStorage.setItem('faculty_eval_token',data.token);sessionStorage.setItem('faculty_eval_role',data.user.role);location.assign('/'+role+'/dashboard.html');}catch(err){toast(err.message,'error');button.disabled=false;button.textContent='Sign in →';}};
if(role==='faculty'){
 let step=0,photo=null;
 const steps=[...document.querySelectorAll('.wizard-step')];
 const preview=$('#photoPreview');
 function setStep(next){step=Math.max(0,Math.min(steps.length-1,next));steps.forEach((s,i)=>s.classList.toggle('hidden',i!==step));document.querySelectorAll('.wizard-dot').forEach((d,i)=>{d.classList.toggle('active',i===step);d.classList.toggle('done',i<step);});$('#wizardBack').disabled=step===0;$('#wizardNext').classList.toggle('hidden',step===steps.length-1);$('#registerSubmit').classList.toggle('hidden',step!==steps.length-1);$('#registrationProgress').style.width=((step+1)/steps.length*100)+'%';$('#stepLabel').textContent=`Step ${step+1} of ${steps.length}`;}
 function valid(i){for(const element of steps[i].querySelectorAll('input,select,textarea')){if(element.type==='file')continue;if(!element.checkValidity()){element.reportValidity();element.focus();return false;}}return true;}
 $('#wizardNext').onclick=()=>{if(valid(step))setStep(step+1);};$('#wizardBack').onclick=()=>setStep(step-1);
 $('#profilePhoto').onchange=async(e)=>{const file=e.target.files[0];if(!file)return;const status=$('#registerPhotoState');status.textContent='Preparing photo…';try{photo=await compressFacultyPhoto(file);const image=document.createElement('img');image.src=photo;image.alt='Selected profile photo';preview.replaceChildren(image);status.textContent='Photo ready ✓';}catch(err){photo=null;e.target.value='';status.textContent='Photo not selected';toast(err.message,'error');}};
 $('#removePhoto').onclick=()=>{photo=null;$('#profilePhoto').value='';preview.innerHTML='<img src="/assets/avatar.svg" alt="Photo preview">';$('#registerPhotoState').textContent='';};
 $('#register').onsubmit=async(e)=>{e.preventDefault();if(!steps.every((s,i)=>valid(i)))return;const d=formData(e.target);if(d.password!==d.confirm){toast('Passwords do not match.','error');return;}delete d.confirm;d.imageDataUrl=photo;const b=$('#registerSubmit');b.disabled=true;b.textContent='Creating…';try{await authApi('/auth/register',d);e.target.reset();photo=null;preview.innerHTML='<img src="/assets/avatar.svg" alt="Photo preview">';setStep(0);showRegister(false);toast('Account created. Wait for admin approval.','success');}catch(err){toast(err.message,'error');}finally{b.disabled=false;b.textContent='Create account ✓';}};
 setStep(0);
}
async function compressFacultyPhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPG, PNG, or WebP image.');
 if(file.size>15*1024*1024)throw Error('Photo is too large. Choose one under 15 MB.');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=url;await img.decode();
  const scale=Math.min(1,600/Math.max(img.naturalWidth,img.naturalHeight));const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.naturalWidth*scale));cv.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=cv.getContext('2d');if(!ctx)throw Error('Could not process this photo.');ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);ctx.drawImage(img,0,0,cv.width,cv.height);
  let result=cv.toDataURL('image/jpeg',.82);if(result.length>900000)result=cv.toDataURL('image/jpeg',.60);if(result.length>900000)throw Error('Please use a smaller photo.');return result;
 }catch(err){if(err instanceof Error&&err.message.includes('photo'))throw err;throw Error('Cannot open this image. Try a JPG or PNG photo.');}
 finally{URL.revokeObjectURL(url);}
}
window.compressFacultyPhoto=compressFacultyPhoto;
