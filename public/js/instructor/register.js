(()=>{
  const form=document.getElementById('instructorRegistration'),preview=document.getElementById('portraitPreview'),message=document.getElementById('registrationMessage');
  let photo='',upload=0;
  let yearRequest=0;
  const years=form.elements.school_year,yearHint=document.getElementById('schoolYearHint');
  function yearPlaceholder(text){years.replaceChildren(new Option(text,''));years.disabled=true;}
  async function loadSchoolYears(){
    const version=++yearRequest,program=form.elements.program.value,level=form.elements.level.value;
    yearPlaceholder('Select component and NSTP level first');
    yearHint.textContent='School years follow the enrollment schedules.';
    if(!program||!level)return;
    yearPlaceholder('Loading school years…');
    try{
      const data=await API.get(`/api/auth/instructor/school-years?program=${encodeURIComponent(program)}&level=${encodeURIComponent(level)}`);
      if(version!==yearRequest)return;
      if(!data.years.length){yearPlaceholder('No enrollment schedule available');yearHint.textContent=`No school year is available for ${program} NSTP ${level}. Contact the admin.`;return;}
      years.replaceChildren(new Option('Select school year',''),...data.years.map(year=>new Option(year,year)));years.disabled=false;
      yearHint.textContent=`Available school years for ${program} NSTP ${level}.`;
    }catch(e){if(version!==yearRequest)return;yearPlaceholder('School years unavailable');yearHint.textContent=e.message+' Select your component or NSTP level again to retry.';}
  }
  form.elements.program.onchange=loadSchoolYears;
  form.elements.level.onchange=loadSchoolYears;
  loadSchoolYears();
  function show(text,error=true){message.textContent=text;message.hidden=false;message.classList.toggle('error',error);}
  form.elements.portrait.onchange=async()=>{
    const version=++upload;photo='';preview.hidden=true;
    const file=form.elements.portrait.files[0];if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024){form.elements.portrait.value='';show('Choose a JPG, PNG, or WEBP photo up to 3 MB.');return;}
    try{
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Unable to read this photo.'));reader.readAsDataURL(file);});
      if(version!==upload)return;photo=data;preview.src=data;preview.hidden=false;message.hidden=true;
    }catch(e){show(e.message);}
  };
  form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;
    if(years.disabled||!years.value){show('Select a school year from the enrollment schedules first.');return;}
    if(!photo){show('Choose your profile photo and wait for the preview.');return;}
    button.disabled=true;button.textContent='Submitting…';message.hidden=true;
    try{
      const body=Object.fromEntries(new FormData(form));delete body.portrait;body.profile_photo=photo;
      body.recaptcha_token=await Captcha.token('instructor_register');
      const result=await API.post('/api/auth/instructor/register',body);
      form.innerHTML='';const notice=document.createElement('div');notice.className='portal-message full';notice.setAttribute('role','status');notice.textContent=result.message;
      const link=document.createElement('a');link.href='/instructor/login';link.textContent='Return to Sign In';form.append(notice,link);
    }catch(e){show(e.message);button.disabled=false;button.textContent='Submit Registration';}
  };
})();
