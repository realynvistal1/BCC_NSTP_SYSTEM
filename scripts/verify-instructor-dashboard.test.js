const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('Dashboard, Grades and Attendance stay in the instructor shell and load assigned students',async()=>{
  const nodes=new Map(),events={},timers=[],requests=[];let attendanceLoads=0,gradeRows=[];
  function node(id){
    if(!nodes.has(id)){
      let html='';const element={value:'',textContent:'',disabled:false,hidden:false,classList:{toggle(){},add(){},remove(){}},querySelectorAll:selector=>id==='assignedStudents'&&selector==='[data-row]'?gradeRows:[]};
      Object.defineProperty(element,'innerHTML',{get:()=>html,set:value=>{html=value;if(id==='assignedStudents')gradeRows=[...value.matchAll(/data-row="(\d+)"/g)].map(m=>({dataset:{row:m[1]},hidden:false}));if(id==='assignmentSelect'){const selected=/<option value="([^"]+)"/.exec(value);element.value=selected?.[1]||'';}}});nodes.set(id,element);
    }
    return nodes.get(id);
  }
  const views=['dashboard','profile','grades','attendance'].map(view=>({dataset:{instructorView:view},hidden:false}));
  const links=views.map(view=>({dataset:{instructorTab:view.dataset.instructorView},classList:{toggle(){}},setAttribute(){},removeAttribute(){}}));
  const user={first_name:'Test',last_name:'Instructor',email:'teacher@example.invalid',program:'CWTS',photo_url:'/api/instructor/profile/photo',requested_year:'2026-2027',requested_level:'1'};
  const assigned={id:10,company:'Alpha',year:'2026-2027',ms_level:'1',student_count:1};
  const assignments=[assigned,{...assigned,id:11,company:'Bravo'},{...assigned,id:12,ms_level:'2'},{...assigned,id:13,year:'2027-2028',company:'Charlie'}];
  const context={document:{getElementById:node,querySelectorAll:s=>s==='[data-instructor-view]'?views:links,querySelector:()=>null,hidden:false,activeElement:{matches:()=>false}},window:{addEventListener:(event,fn)=>events[event]=fn,setInterval:fn=>{timers.push(fn);return 1;},clearInterval(){}},location:{hash:'',assign:()=>assert.fail('Must stay in the instructor portal')},shell(){},toast(){},loadCwtsAssignedAttendance:async()=>attendanceLoads++,API:{get:async url=>{
    if(url==='/api/instructor/profile')return user;
    requests.push(url);if(url==='/api/instructor/assignments')return assignments;
    if(url==='/api/instructor/dashboard')return {assignments:[assigned],open_attendance:[],stats:{students:1,assignments:1,for_review:0,returned:0}};
    if(/\/assignments\/\d+\/records$/.test(url))return {assignment:assignments.find(a=>url.includes('/'+a.id+'/')),students:[{enrollment_record_id:20,first_name:'Assigned',last_name:'Student',student_no:'123456-2026',course:'BSIT',saved_midterm:null,saved_final:null},{enrollment_record_id:21,first_name:'Draft',last_name:'Student',student_no:'123457-2026',saved_midterm:null,saved_final:null,submission:{status:'draft'}},{enrollment_record_id:22,first_name:'Review',last_name:'Student',student_no:'123458-2026',saved_midterm:null,saved_final:null,submission:{status:'submitted'}}]};
    assert.fail('Unexpected endpoint '+url);
  }}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/instructor/dashboard.js'),'utf8'),context);
  for(let i=0;i<20&&!nodes.get('instructorDashboardAssignments')?.innerHTML;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert(!views[0].hidden);assert(node('instructorDashboardStats').innerHTML.includes('Assigned Students'));assert(node('instructorDashboardAssignments').innerHTML.includes('Alpha Company'));
  context.location.hash='#grades';await events.hashchange();assert(!views[2].hidden);assert(node('assignedStudents').innerHTML.includes('Assigned Student'));assert(node('assignedStudents').innerHTML.includes('Submit to Admin'));assert(node('assignedStudents').innerHTML.includes('name="midterm"'));assert(node('assignedStudents').innerHTML.includes('name="final_term"'));
  assert(!node('assignedStudents').innerHTML.includes('ip-grade-summary'));assert(!node('assignedStudents').innerHTML.includes('portal-badge empty'));
  node('instructorGradeStatus').value='submitted';node('instructorGradeStatus').onchange();assert(gradeRows[0].hidden);assert(gradeRows[1].hidden);assert(!gradeRows[2].hidden);
  node('instructorGradeStatus').value='';node('instructorGradeSearch').value='123457';node('instructorGradeSearch').oninput();assert(gradeRows[0].hidden);assert(!gradeRows[1].hidden);assert(gradeRows[2].hidden);
  node('gradeCompany').value='11';await node('gradeCompany').onchange();assert.equal(requests.at(-1),'/api/instructor/assignments/11/records');
  node('gradeLevel').value='2';await node('gradeLevel').onchange();assert.equal(requests.at(-1),'/api/instructor/assignments/12/records');
  node('gradeSchoolYear').value='2027-2028';await node('gradeSchoolYear').onchange();assert.equal(requests.at(-1),'/api/instructor/assignments/13/records');assert.equal(node('gradeLevel').value,'1');
  context.location.hash='#attendance';await events.hashchange();assert(!views[3].hidden);assert.equal(attendanceLoads,1);timers[0]();assert.equal(attendanceLoads,2);
  context.location.hash='#profile';await events.hashchange();assert(!views[1].hidden);assert(node('instructorProfile').innerHTML.includes('Test Instructor'));
});
