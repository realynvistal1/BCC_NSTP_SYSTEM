'use strict';
// Uses isolated temporary records and removes them after the test.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const app=require('../server');
const db=require('../config/database');
const jwt=require('jsonwebtoken');
const summarize=require('../lib/rating-summary');
(async()=>{
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const root='http://127.0.0.1:'+server.address().port;
 const users=[];let periodId;
 async function request(path,method='GET',body,token){
  const r=await fetch(root+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  return {status:r.status,data:await r.json()};
 }
 try{
  const empty=summarize({required_students:40,response_count:0},[]);
  assert.equal(empty.final,false);assert.equal(empty.remaining,40);
  assert.deepEqual(summarize({required_students:5,response_count:5},[1,2.49,2.5,3.49,3.5].map(score=>({score}))),{required:5,responses:5,remaining:0,final:true,positive:1,neutral:2,negative:2});
  const tokens={};
  for(const role of ['admin','faculty']){
   const [r]=await db.query("INSERT INTO users(full_name,email,password_hash,role,status) VALUES(?,?,? ,?,'approved')",['Target test',crypto.randomUUID()+'@example.test','test-disabled',role]);
   users.push(r.insertId);tokens[role]=jwt.sign({id:r.insertId},process.env.JWT_SECRET,{expiresIn:'5m'});
  }
  const form={title:'Temporary target test',startYear:2026,semester:'2nd Semester',startsAt:'2020-01-01T00:00',endsAt:'2099-01-01T00:00',requiredStudents:0};
  assert.equal((await request('/admin/periods','POST',form,tokens.admin)).status,400);
  form.requiredStudents=3;
  const created=await request('/admin/periods','POST',form,tokens.admin);assert.equal(created.status,201);periodId=created.data.id;
  const list=await request('/admin/periods','GET',undefined,tokens.admin);
  assert.equal(list.data.find(p=>Number(p.id)===Number(periodId)).semester,'2nd Semester');
  assert.equal((await request('/admin/periods','POST',{...form,semester:'Invalid'},tokens.admin)).status,400);
  assert.equal((await request('/admin/periods/'+periodId,'PATCH',{...form,requiredStudents:4},tokens.admin)).status,200);
  assert.equal((await request('/admin/periods/'+periodId,'PATCH',form,tokens.admin)).status,200);
  assert.equal((await request('/admin/periods/'+periodId+'/status','PATCH',{status:'open'},tokens.admin)).status,200);
  assert.equal((await request('/admin/periods/'+periodId,'PATCH',{...form,requiredStudents:4},tokens.admin)).status,409);
  assert.equal((await request('/faculty/periods/'+periodId+'/accept','POST',{},tokens.faculty)).status,200);
  const subject=await request('/faculty/assignments','POST',{periodId,subjectCode:'TEST',subjectName:'Target test',yearLevel:'1st Year',section:'Test'},tokens.faculty);assert.equal(subject.status,201);
  const aid=subject.data.id;
  assert.equal((await request('/admin/assignments/'+aid+'/status','PATCH',{status:'approved'},tokens.admin)).status,200);
  const [[a]]=await db.query('SELECT public_token FROM assignments WHERE id=?',[aid]);
  const endpoint='/public/evaluate/'+a.public_token;
  const qs=(await request(endpoint)).data.questions;
  const submit=rating=>request(endpoint,'POST',{answers:qs.map(q=>({questionId:Number(q.id),rating}))});
  assert.equal((await submit(5)).status,201);
  const partial=await request('/faculty/results/'+aid,'GET',undefined,tokens.faculty);
  assert.equal(partial.data.summary.final,false);assert.equal(partial.data.summary.remaining,2);
  assert.equal(partial.data.assignment.semester,'2nd Semester');
  assert.equal(partial.data.assignment.school_year,'2026-2027');
  const concurrent=await Promise.all([submit(3),submit(1),submit(4)]);
  assert.equal(concurrent.filter(r=>r.status===201).length,2);
  assert.equal(concurrent.filter(r=>r.status===409).length,1);
  const final=await request('/admin/results/'+aid,'GET',undefined,tokens.admin);
  assert.equal(final.data.summary.final,true);assert.equal(final.data.summary.responses,3);
  assert.equal(final.data.summary.positive+final.data.summary.neutral+final.data.summary.negative,3);
  const acceptedScores=[5,...[3,1,4].filter((score,i)=>concurrent[i].status===201)];
  assert.equal(Number(final.data.assignment.average_rating),Number((acceptedScores.reduce((sum,score)=>sum+score,0)/3).toFixed(2)));
  assert.equal(final.data.summary.positive,acceptedScores.filter(score=>score>=3.5).length);
  assert.equal(final.data.summary.neutral,acceptedScores.filter(score=>score>=2.5&&score<3.5).length);
  assert.equal(final.data.summary.negative,acceptedScores.filter(score=>score<2.5).length);
  assert.equal((await request(endpoint)).status,409);
  assert.equal((await submit(5)).status,409);
  console.log('PASS: validation, draft edits, count lock, acceptance, partial/final results, sentiment boundaries, concurrent cap, and completed-link rejection.');
 }finally{
  if(periodId)await db.query('DELETE FROM periods WHERE id=?',[periodId]);
  for(const uid of users)await db.query('DELETE FROM users WHERE id=?',[uid]);
  await new Promise(resolve=>server.close(resolve));await db.end();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
