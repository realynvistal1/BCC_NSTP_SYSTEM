const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/js/shared/layout.js'), 'utf8');
const helper = source.slice(source.indexOf('async function enrollmentFileAsDataUrl'), source.indexOf('function confirmLogout()'));
function setup(outputs) {
  let calls=0;
  const original='data:image/png;base64,'+'a'.repeat(2000000);
  const canvas={getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=>outputs[Math.min(calls++,outputs.length-1)]};
  const context={fileAsDataUrl:async()=>original,Image:class {set src(value){this.naturalWidth=4800;this.naturalHeight=3200;this.onload();}},document:{createElement:()=>canvas}};
  vm.createContext(context); vm.runInContext(helper,context);
  return {context,original,canvas,calls:()=>calls};
}
test('small images and PDFs are unchanged',async()=>{
  const s=setup([]);
  for(const file of [{size:500000,type:'image/png'},{size:5000000,type:'application/pdf'}]) assert.equal(await s.context.enrollmentFileAsDataUrl(file),s.original);
  assert.equal(s.calls(),0);
});
test('large images retry compression until below 1 MiB',async()=>{
  const small='data:image/jpeg;base64,AAAA';
  const s=setup(['data:image/jpeg;base64,'+'a'.repeat(1500000),small]);
  assert.equal(await s.context.enrollmentFileAsDataUrl({size:5*1024*1024,type:'image/jpeg'}),small);
  assert.equal(s.calls(),2);
  assert.equal(s.canvas.width,0);
});
test('compression failure does not send original large image',async()=>{
  const s=setup(['data:image/jpeg;base64,'+'a'.repeat(1500000)]);
  await assert.rejects(s.context.enrollmentFileAsDataUrl({size:5*1024*1024,type:'image/png'}),/reduced to 1 MB/);
  s.context.document.createElement=()=>{throw Error('unsupported');};
  await assert.rejects(s.context.enrollmentFileAsDataUrl({size:5*1024*1024,type:'image/png'}),/reduced to 1 MB/);
});
