const regularCompanies=['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'];
const specialGroups=['Medics','MP','HQ'];
const groups=[...regularCompanies,...specialGroups,'Advance Course'];
function matches(record='r',assignment='a'){
  return `(${assignment}.company<>'' AND (
    (${assignment}.company IN ('Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel') AND ${record}.assignment_company=${assignment}.company AND COALESCE(${record}.assignment_is_advance,0)=0 AND COALESCE(${record}.assignment_special_unit,'')='')
    OR (${assignment}.company IN ('Medics','MP','HQ') AND ${record}.assignment_special_unit=${assignment}.company AND COALESCE(${record}.assignment_is_advance,0)=0)
    OR (${assignment}.company='Advance Course' AND ${record}.assignment_is_advance=1 AND COALESCE(${record}.assignment_special_unit,'')='')))`;
}
async function available(db,scheduleId){
  const [drafts]=await db.execute('SELECT configuration,published_configuration FROM rotc_roster_drafts WHERE schedule_id=?',[scheduleId]);
  const parse=value=>typeof value==='string'?JSON.parse(value):value;
  const slots=parse(drafts[0]?.published_configuration)||parse(drafts[0]?.configuration)||[];
  const [records]=await db.execute("SELECT DISTINCT assignment_company,assignment_special_unit FROM student_ms_records WHERE program='ROTC' AND CAST(schedule_id AS UNSIGNED)=? AND status='approved'",[scheduleId]);
  const configured=new Set([...slots.map(s=>s.unit||s.company),...records.map(r=>r.assignment_special_unit||r.assignment_company)]);
  return groups.filter(g=>g==='Advance Course'||specialGroups.includes(g)||configured.has(g));
}
module.exports={groups,matches,available};
