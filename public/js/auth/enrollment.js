async function initEnrollment(){
  let step=0;
  const labels=['Academic Info','Personal Info','Physical & Health','Account Setup'];
  const sections=$$('.enroll-step'),progress=$$('.enrollment-progress-item'),f=$('#enrollmentForm'),msg=$('#enrollMsg');
  const MAX_FILE=5*1024*1024;
  const fmt=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`;
  const showError=text=>{
    msg.textContent=text;
    msg.className='enrollment-form-error';
    msg.classList.remove('hidden');
    msg.scrollIntoView({behavior:'smooth',block:'nearest'})
  }
  ;
  const clearError=()=>msg.classList.add('hidden');
  const program=()=>f.nstp_component.value;
  const course=()=>f.course.value;
  const isMedicalNA=()=>program()==='CWTS'||course()==='BS Criminology';
  const checkFile=(input,label)=>{
    const file=input?.files?.[0];
    if(file&&file.size>MAX_FILE){
      input.value='';
      throw new Error(`File "${file.name}" is too large (${(file.size/1048576).toFixed(2)}MB). Maximum size is 5MB.`)
    }
    if(file&&label)label.textContent=`${file.name} (${fmt(file.size)})`;
    return file
  }
  ;
  function setProgram(value){
    if(course()==='BS Criminology'&&value==='CWTS')return;
    f.nstp_component.value=value;
    f.ms_level.value='1';
    $$('.enrollment-program-btn').forEach(b=>b.classList.toggle('selected',b.dataset.program===value));
    $('#levelLabel').textContent=value==='CWTS'?'CWTS Level':'MS Level';
    $('#levelDisplay').textContent=value==='CWTS'?'CWTS 1':'MS 1';
    $('#scheduleHint').classList.add('hidden');
    updateConditionalFields();
  }
  function updateConditionalFields(){
    const rotc=program()==='ROTC',crim=course()==='BS Criminology',cwts=program()==='CWTS';
    $('#rotcWillingness')?.classList.toggle('hidden',!rotc);
    $('#medicsOption')?.classList.toggle('hidden',crim);
    $('#mpOption')?.classList.toggle('hidden',crim);
    if(!rotc){
      const none=f.querySelector('input[name="willingness_option"][value="none"]');
      if(none)none.checked=true
    }
    $('#medicalQuestion')?.classList.toggle('hidden',isMedicalNA());
    if(isMedicalNA()){
      f.has_medical_condition.value='0';
      $('#medicalConditionName')?.classList.add('hidden');
      $('#uploadArea')?.classList.remove('hidden');
      $('#uploadIntro').textContent=cwts?'Upload your Medical Certificate':'Upload your Medical Certificate and X-ray';
    }  else{
      const chosen=f.querySelector('input[name="has_medical_condition_choice"]:checked');
      $('#uploadArea')?.classList.toggle('hidden',!chosen);
      if(chosen)$('#uploadIntro').textContent='Upload your Medical Certificate and X-ray';
    }
    $('#xrayGroup')?.classList.toggle('hidden',!rotc);
    if(f.xray_file_input)f.xray_file_input.required=rotc;
  }
  function show(){
    sections.forEach((x,i)=>x.classList.toggle('hidden',i!==step));
    progress.forEach((x,i)=>{x.classList.toggle('active',i===step);x.classList.toggle('complete',i<step);const c=x.querySelector('.enrollment-progress-circle');if(c)c.innerHTML=i<step?'<svg viewBox="0 0 24 24" style="width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:3"><path d="M5 13l4 4L19 7"/></svg>':String(i+1)});
    $('#backBtn').classList.toggle('hidden',step===0);
    $('#nextBtn').textContent=step===sections.length-1?'Submit Enrollment':'Next';
    $('#stepHeading').textContent=`Step ${step+1} - ${labels[step]}`;
    $('#mobileStepLabel').textContent=`Step ${step+1} of ${sections.length} - ${labels[step]}`;
    clearError();
    updateConditionalFields();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function customValidate(){
    if(step===0){
      if(!f.course.value)return 'Course is required.';
      if(!f.year_level.value)return 'Year level is required.';
      if(!f.nstp_component.value)return 'NSTP component is required.';
      if(!f.ms_level.value)return 'MS level is required.';
    }
    if(step===1){
      const id=f.student_id.value.trim();
      if(!/^\d{6}-\d{4}$/.test(id))return 'Student ID must be in format 000000-0000 (e.g. 202020-0404).';
      if(!/^09\d{9}$/.test(f.contact_number.value))return 'Contact number must be 11 digits (e.g. 09XXXXXXXXX).';
      if(!/^09\d{9}$/.test(f.emergency_contact_contact_number.value))return 'Emergency contact number must be 11 digits (e.g. 09XXXXXXXXX).';
    }
    if(step===2){
      if(!$('#heightFeet').value||$('#heightInches').value==='')return 'Height is required.';
      if(!isMedicalNA()&&!f.querySelector('input[name="has_medical_condition_choice"]:checked'))return 'Please select if you have a medical condition.';
      if(f.has_medical_condition.value==='1'&&!f.medical_condition.value.trim())return 'Please specify your medical condition.';
      if(!f.medical_certificate_file.files[0])return 'Medical certificate is required.';
      if(program()==='ROTC'&&!f.xray_file_input.files[0])return 'X-ray is required.';
    }
    if(step===3){
      if(f.password.value.length<6)return 'Password must be at least 6 characters.';
      if(f.password.value!==f.confirm_password.value)return 'Passwords do not match.';
      if(!f.photo_file.files[0])return '2x2 photo is required.';
      if(!f.cor_file_input.files[0])return 'Certificate of Registration (COR) is required.';
    }
    const invalid=sections[step].querySelector(':invalid');
    if(invalid){
      invalid.reportValidity();
      return 'Please complete all required fields before continuing.'
    }
    return '';
  }
  $$('.enrollment-program-btn').forEach(b=>b.addEventListener('click',()=>setProgram(b.dataset.program)));
  f.course.addEventListener('change',()=>{
  const crim=course()==='BS Criminology';
  const cwtsBtn=$('.enrollment-program-btn[data-program="CWTS"]');
  cwtsBtn.disabled=crim;
  $('#rotcOnlyHint').classList.toggle('hidden',!crim);
  if(crim)setProgram('ROTC');
  updateConditionalFields();
  });
  f.student_id.addEventListener('input',e=>{const d=e.target.value.replace(/\D/g,'').slice(0,10);e.target.value=d.length>6?`${d.slice(0,6)}-${d.slice(6)}`:d});
  [f.contact_number,f.emergency_contact_contact_number].forEach(input=>input.addEventListener('input',e=>{let d=e.target.value.replace(/\D/g,'').slice(0,11);if(d.length>=2&&!d.startsWith('09'))d='09'+d.slice(2);e.target.value=d}));
  f.username.addEventListener('input',e=>e.target.value=e.target.value.toUpperCase());
  $('#heightFeet').addEventListener('change',()=>f.height.value=`${$('#heightFeet').value}'${$('#heightInches').value||0}"`);
  $('#heightInches').addEventListener('change',()=>f.height.value=`${$('#heightFeet').value}'${$('#heightInches').value}"`);
  $$('input[name="has_medical_condition_choice"]').forEach(r=>r.addEventListener('change',e=>{
  const yes=e.target.value==='yes';f.has_medical_condition.value=yes?'1':'0';
  $('#medicalConditionName').classList.toggle('hidden',!yes);
  if(!yes)f.medical_condition.value='';
  $('#uploadArea').classList.remove('hidden');
  $('#uploadIntro').textContent='Upload your Medical Certificate and X-ray';
  }));
  f.medical_certificate_file.addEventListener('change',()=>{try{checkFile(f.medical_certificate_file,$('#medicalCertificateLabel'));clearError()}catch(e){showError(e.message)}});
  f.xray_file_input.addEventListener('change',()=>{try{checkFile(f.xray_file_input,$('#xrayLabel'));clearError()}catch(e){showError(e.message)}});
  f.cor_file_input.addEventListener('change',()=>{try{checkFile(f.cor_file_input,$('#corLabel'));clearError()}catch(e){showError(e.message)}});
  f.photo_file.addEventListener('change',()=>{try{const file=checkFile(f.photo_file,$('#photoLabel'));if(file){const img=$('#photoPreview');img.src=URL.createObjectURL(file);img.classList.remove('hidden')}clearError()}catch(e){showError(e.message)}});
  f.querySelectorAll('input[name="willingness_option"]').forEach(r=>r.addEventListener('change',()=>{}));
  $('#backBtn').onclick=()=>{
    if(step>0){
      step--;
      show()
    }
  }
  ;
  $('#nextBtn').onclick=async()=>{
    const err=customValidate();
    if(err){
      showError(err);
      return
    }
    clearError();
    try{
      if(step===0){
        $('#nextBtn').disabled=true;
        $('#nextBtn').textContent='Loading...';
        const check=await API.get(`/api/student/enrollment-schedule?program=${encodeURIComponent(program())}&ms_level=1`);
        $('#nextBtn').disabled=false;
        $('#nextBtn').textContent='Next';
        if(!check.open){
          $('#scheduleHint').textContent=check.message||`No enrollment schedule is currently open for ${program()}.`;
          $('#scheduleHint').classList.remove('hidden');
          throw new Error(check.message||`${program()} MS 1 is not yet open for enrollment.`)
        }
      }
      if(step===1){
        const chk=await API.get(`/api/student/check-student-id?student_id=${encodeURIComponent(f.student_id.value)}`);
        if(chk.exists)throw new Error('This Student ID is already registered. Please use Student Login or contact your administrator.');
      }
      if(step<sections.length-1){
        step++;
        show();
        return
      }
      ['medical_certificate_file','xray_file_input','photo_file','cor_file_input'].forEach(n=>{const inp=f.elements[n];if(inp?.files?.[0]&&inp.files[0].size>MAX_FILE)throw new Error(`File "${inp.files[0].name}" is too large. Maximum size is 5MB.`)});
      const data=formToObject(f);
      const w=f.querySelector('input[name="willingness_option"]:checked')?.value||'none';
      data.willing_to_take_advance_course=w==='advance'?1:0;
      data.willing_to_be_medics=w==='medics'?1:0;
      data.willing_to_be_military_police=w==='military_police'?1:0;
      data.has_medical_condition=Number(f.has_medical_condition.value||0);
      data.medical_certificate=await fileAsDataUrl(f.medical_certificate_file.files[0]);
      data.xray_file=await fileAsDataUrl(f.xray_file_input.files[0]);
      data.photo=await fileAsDataUrl(f.photo_file.files[0]);
      data.cor_file=await fileAsDataUrl(f.cor_file_input.files[0]);
      data.recaptcha_token=await Captcha.token('student_enrollment');
      delete data.medical_certificate_file;
      delete data.xray_file_input;
      delete data.photo_file;
      delete data.cor_file_input;
      delete data.willingness_option;
      delete data.has_medical_condition_choice;
      const btn=$('#nextBtn');
      btn.disabled=true;
      btn.textContent='Submitting...';
      await API.post('/api/student/register',data);
      $('#enrollWrap').innerHTML=`<div class="enrollment-success-page"><div class="enrollment-success-card"><div class="enrollment-success-icon"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div><h2>Successfully Enrolled!</h2><p>Login to check your Enrollment status</p><a href="/student/login">Login</a></div></div>`;
      $('.enrollment-signin-note')?.classList.add('hidden');
    }  catch(e){
      const btn=$('#nextBtn');
      if(btn){
        btn.disabled=false;
        btn.textContent=step===sections.length-1?'Submit Enrollment':'Next'
      }
      showError(e.message);
      toast(e.message,true)
    }
  }
  ;
  show();
}
document.addEventListener("DOMContentLoaded", () => { initEnrollment(); });

