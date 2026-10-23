'use strict';
// A single sign-in for both administrator and instructor accounts.
if(getToken()&&['admin','faculty'].includes(sessionStorage.getItem('faculty_eval_role'))){
 location.replace('/'+sessionStorage.getItem('faculty_eval_role')+'/dashboard.html');
}
const login=$('#login'),register=$('#register');
let currentStep=0,profilePhoto=null;
function switchView(wizard){
 $('#loginView').classList.toggle('hidden',wizard);
 $('#registerView').classList.toggle('hidden',!wizard);
 if(wizard)history.replaceState(null,'','#register');else history.replaceState(null,'',location.pathname);
}
$('#showRegister').onclick=e=>{e.preventDefault();switchView(true);};
$('#showLogin').onclick=()=>switchView(false);
if(location.hash==='#register')switchView(true);
login.addEventListener('submit',async e=>{
 e.preventDefault();const button=login.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Signing in…';
 try{
  const data=await authApi('/auth/login',formData(login));
  if(!['admin','faculty'].includes(data.user.role))throw Error('Unknown account type.');
  sessionStorage.setItem('faculty_eval_token',data.token);
  sessionStorage.setItem('faculty_eval_role',data.user.role);
  location.assign('/'+data.user.role+'/dashboard.html');
 }catch(error){toast(error.message,'error');button.disabled=false;button.textContent='Sign in →';}
});
function setStep(n){
 currentStep=Math.max(0,Math.min(3,n));
 document.querySelectorAll('.wizard-step').forEach((e,i)=>e.classList.toggle('hidden',i!==currentStep));
 document.querySelectorAll('.wizard-dot').forEach((e,i)=>{e.classList.toggle('active',i===currentStep);e.classList.toggle('done',i<currentStep);});
 $('#registrationProgress').style.width=((currentStep+1)*25)+'%';
 $('#stepLabel').textContent=`Step ${currentStep+1} of 4`;
 $('#wizardBack').disabled=currentStep===0;
 $('#wizardNext').classList.toggle('hidden',currentStep===3);
 $('#registerSubmit').classList.toggle('hidden',currentStep!==3);
 $('#registerView').scrollIntoView({block:'nearest',behavior:'smooth'});
}
function validateStep(i){
 const step=document.querySelectorAll('.wizard-step')[i];
 for(const field of step.querySelectorAll('input,select,textarea')){
  if(field.type==='file')continue;
  if(!field.checkValidity()){field.reportValidity();field.focus();return false;}
 }
 return true;
}
$('#wizardNext').onclick=()=>{if(validateStep(currentStep))setStep(currentStep+1);};
$('#wizardBack').onclick=()=>setStep(currentStep-1);
document.querySelectorAll('.pass-toggle').forEach(button=>button.onclick=()=>{
 const input=document.getElementById(button.dataset.target);input.type=input.type==='password'?'text':'password';button.textContent=input.type==='password'?'Show':'Hide';
});
// Resize on the client's device before saving in MySQL. Nothing is uploaded until registration.
async function compressPhoto(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPG, PNG or WebP image.');
 if(file.size>12*1024*1024)throw Error('Choose a smaller photo (maximum 12 MB before resizing).');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  const scale=Math.min(1,420/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL('image/jpeg',0.78);
  if(data.length>620000)throw Error('Photo is still too large. Try a smaller image.');
  return data;
 }finally{URL.revokeObjectURL(url);}
}
window.compressFacultyPhoto=compressPhoto;
$('#profilePhoto').addEventListener('change',async e=>{
 try{
  const file=e.target.files[0];if(!file)return;
  profilePhoto=await compressPhoto(file);$('#photoPreview').innerHTML=`<img src="${profilePhoto}" alt="Your selected portrait">`;
 }catch(err){profilePhoto=null;e.target.value='';toast(err.message,'error');}
});
$('#removePhoto').onclick=()=>{profilePhoto=null;$('#profilePhoto').value='';$('#photoPreview').textContent='👩‍🏫';};
register.addEventListener('submit',async e=>{
 e.preventDefault();if(!validateStep(3))return;
 const data=formData(register);
 if(data.password!==data.confirm)return toast('Passwords do not match. Please try again.','error');
 const button=$('#registerSubmit');button.disabled=true;button.textContent='Creating account…';
 try{
  delete data.confirm;data.imageDataUrl=profilePhoto;
  await authApi('/auth/register',data);
  register.reset();profilePhoto=null;$('#photoPreview').textContent='👩‍🏫';setStep(0);switchView(false);
  toast('Account submitted! The administrator will review your instructor profile.','success');
 }catch(err){toast(err.message,'error');}
 finally{button.disabled=false;button.textContent='Create my account ✓';}
});
setStep(0);
