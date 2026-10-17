const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const enrollment = fs.readFileSync('public/js/auth/enrollment.js', 'utf8');
const field = value => ({ value, files: [{}], disabled: false, textContent: '',
  classList: { add() {}, remove() {} }, setAttribute() {} });

async function verifyEnrollment() {
  const nodes = new Map(['#nextBtn','#backBtn','#scheduleHint','#enrollWrap'].map(id => [id, field('')]));
  const form = { password: field('1234567'), confirm_password: field('1234567'),
    photo_file: field(''), cor_file_input: field(''), medical_certificate_file: field(''),
    xray_file_input: field(''), has_medical_condition: field('0'), student_id: field('123456-2026'),
    setAttribute() {}, querySelector: () => null };
  form.elements = form;
  const context = vm.createContext({ console, MAX_FILE: 5 * 1024 * 1024,
    f: form, sections: Array.from({length:4},()=>({ querySelector:()=>null })),
    $: id => nodes.get(id), program: () => 'CWTS', clearError() {},
    showError(text) { context.lastError = text; }, toast() {},
    show() { context.shownStep = context.step; },
    API: { get: async () => ({open:true}), post: async () => { context.posts++; } },
    formToObject: () => ({}), fileAsDataUrl: async () => 'data:test',
    prepareCheckbox: async () => {}, checkboxRequired: false, checkboxId: null,
    Captcha: { token: async () => 'test-token' }, window: {},
    posts: 0, step: 3, busy: false,
  });
  const validation = enrollment.slice(enrollment.indexOf('  function customValidate(){'), enrollment.indexOf("  $$('.enrollment-program-btn').forEach(b=>b.addEventListener"));
  vm.runInContext(validation, context);
  assert.equal(context.customValidate(), 'Password must be at least 8 characters.');
  form.password.value = form.confirm_password.value = '12345678';
  assert.equal(context.customValidate(), 'Password must include at least one number and one symbol (e.g. !, @, #).');
  form.password.value = form.confirm_password.value = 'Password8!';
  assert.equal(context.customValidate(), '');
  const start = enrollment.indexOf("  $('#nextBtn').onclick=async()=>{");
  const end = enrollment.indexOf("\n  ;\n  f.addEventListener('submit'", start);
  assert(start >= 0 && end > start);
  const handler = enrollment.slice(start + "  $('#nextBtn').onclick=".length, end).trim();
  vm.runInContext(`var advance = ${handler};`, context);

  // A schedule request must finish before another tap or step can proceed.
  context.customValidate = () => '';
  context.step = 0;
  let finish;
  let scheduleCalls = 0;
  context.API.get = () => { scheduleCalls++; return new Promise(resolve => { finish = resolve; }); };
  const request = context.advance();
  assert.equal(nodes.get('#nextBtn').disabled, true);
  assert.equal(nodes.get('#backBtn').disabled, true);
  await context.advance();
  assert.equal(scheduleCalls, 1);
  finish({open:false, message:'Enrollment closed'});
  await request;
  assert.equal(context.step, 0);
  assert.equal(context.lastError, 'Enrollment closed');
  assert.equal(nodes.get('#nextBtn').disabled, false);
  assert.equal(nodes.get('#backBtn').disabled, false);

  context.step = 1;
  context.API.get = async () => ({exists:true, message:'Already registered'});
  await context.advance();
  assert.equal(context.step, 1);
  assert.equal(context.lastError, 'Already registered');
  context.API.get = async () => ({exists:false});
  await context.advance();
  assert.equal(context.step, 2);

  context.step = 3;
  let submitted;
  context.API.post = async (_url, payload) => { submitted = payload; throw new Error('Try again'); };
  await context.advance();
  assert.equal(context.lastError, 'Try again');
  assert.equal(context.busy, false);
  assert.equal(nodes.get('#nextBtn').textContent, 'Submit Enrollment');
  context.API.post = async (_url, payload) => { submitted = payload; context.posts++; };
  await context.advance();
  assert.equal(context.posts, 1);
  assert.equal(submitted.xray_file, null, 'CWTS must not submit a leftover ROTC X-ray');
  assert.match(nodes.get('#enrollWrap').innerHTML, /pending administrator review/);
}

async function verifyLogin() {
  const button = field('Log In');
  button.textContent = 'Log In';
  const message = field('');
  const form = { email:field('student@example.test'), password:field('testpassword'), dataset:{portal:'student'},
    querySelector:()=>button, addEventListener(_event,handler){this.submit=handler;} };
  let finish, calls=0;
  const context = vm.createContext({
    $: id => id === '#loginForm' ? form : message,
    Captcha: {config:async()=>({}), token:async()=>''},
    document:{addEventListener(){}},
    API:{post:()=>{calls++;return new Promise((_resolve,reject)=>{finish=reject;});}},
  });
  vm.runInContext(fs.readFileSync('public/js/auth/login.js','utf8'),context);
  await context.initLogin();
  const first = form.submit({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  await form.submit({preventDefault(){}});
  assert.equal(calls,1);
  assert.equal(button.disabled,true);
  finish(new Error('Invalid credentials'));
  await first;
  assert.equal(button.disabled,false);
  assert.equal(button.textContent,'Log In');
  assert.equal(message.textContent,'Invalid credentials');
}

(async()=>{
  await verifyEnrollment();
  await verifyLogin();
  console.log('PASS: password minimum, duplicate taps, closed schedules, existing students, retries, CWTS uploads, submission messaging, and login recovery.');
})().catch(error=>{console.error(error);process.exitCode=1;});
