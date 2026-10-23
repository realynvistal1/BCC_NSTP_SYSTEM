'use strict';
const token=location.pathname.split('/').pop();let evaluation=null;
const status=$('#evalStatus');
async function init(){try{
 evaluation=await API('/public/evaluate/'+encodeURIComponent(token));
 $('#teacherName').textContent=evaluation.facultyName;
 $('#studentTeacherPhoto').src=photoUrl(evaluation.facultyId);
 $('#subjectInfo').textContent=`${evaluation.subjectCode} – ${evaluation.subjectName} · ${evaluation.yearLevel} · ${evaluation.section} · ${evaluation.periodTitle}`;
 $('#questions').replaceChildren();
 const categoryCounts=new Map();
 const orderedQuestions=[...new Set(evaluation.questions.map(q=>q.category))].flatMap(category=>evaluation.questions.filter(q=>q.category===category));
 orderedQuestions.forEach((q,i)=>{
  const number=(categoryCounts.get(q.category)||0)+1;categoryCounts.set(q.category,number);
  if(number===1){const heading=document.createElement('h2');heading.className='evaluation-category-heading';heading.textContent=q.category;$('#questions').append(heading);}
  const outer=document.createElement('div');outer.className='question';
  outer.innerHTML=`<span class="student-question-number">Question ${number}</span><h3>${esc(q.question_text)}</h3><div class="rating" role="radiogroup" aria-label="${esc(q.question_text)}">${[1,2,3,4,5].map(n=>`<label><input type="radio" name="q_${Number(q.id)}" value="${n}" ${n===1?'required':''}><span>${n}</span><small>${['','Strongly disagree','Disagree','Neutral','Agree','Strongly agree'][n]}</small></label>`).join('')}</div>`;
  $('#questions').append(outer);
 });
 if(evaluation.requiresCode){$('#codeArea').classList.remove('hidden');$('#accessCode').required=true;}
 function updateProgress(){const checked=$('#questions').querySelectorAll('input[type=radio]:checked').length;$('#answeredProgress').textContent=`${checked} of ${evaluation.questions.length} answered`;$('#evalProgressBar').style.width=`${checked/evaluation.questions.length*100}%`;}
 $('#questions').addEventListener('change',updateProgress);updateProgress();
 status.classList.add('hidden');$('#evalContent').classList.remove('hidden');
 }catch(e){status.textContent=e.message;status.className='notice error';}
}
$('#studentEval').addEventListener('submit',async e=>{
 e.preventDefault();if(!evaluation)return;
 const answers=evaluation.questions.map(q=>({questionId:Number(q.id),rating:Number(document.querySelector(`input[name="q_${q.id}"]:checked`)?.value||0)}));
 if(answers.some(x=>x.rating<1||x.rating>5))return toast('Please answer all questions.','error');
 if(!confirm('Submit your evaluation? You will not be able to edit it afterward.'))return;
 const button=$('#submitEval');button.disabled=true;button.textContent='Submitting…';
 try{
  await API('/public/evaluate/'+encodeURIComponent(token),{method:'POST',data:{answers,comment:$('#feedback').value,accessCode:$('#accessCode').value,website:document.querySelector('[name="website"]').value}});
  $('#evalContent').classList.add('hidden');$('#thanks').classList.remove('hidden');toast('Evaluation submitted. Thank you!','success');
 }catch(err){toast(err.message,'error');button.disabled=false;button.textContent='Submit evaluation';}
});
void init();
