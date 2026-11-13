const eligibleSql = `EXISTS (SELECT 1 FROM student_ms_records vr
  JOIN enrollment_schedules ves ON ves.id=CAST(vr.schedule_id AS UNSIGNED)
  WHERE vr.student_id=a.verifier_id AND vr.program='ROTC' AND vr.status='approved'
    AND vr.ms_level=a.ms_level AND ves.program='ROTC' AND ves.year=a.school_year
    AND vr.assignment_is_advance=1 AND vr.assignment_special_unit IS NULL
    )
  AND EXISTS (SELECT 1 FROM students vs WHERE vs.id=a.verifier_id
    AND vs.role='student' AND vs.nstp_component='ROTC'
    AND vs.willing_to_take_advance_course=1
    AND ((a.special_unit IN ('Medics','HQ','MP') AND ((a.platoon=1 AND vs.sex='Male') OR (a.platoon=2 AND vs.sex='Female')))
      OR (a.special_unit='' AND a.battalion=1 AND vs.sex='Male') OR (a.special_unit='' AND a.battalion=2 AND vs.sex='Female')))`;
async function groupList(db){
 const [rows]=await db.execute(`SELECT DISTINCT r.ms_level,es.year school_year,r.assignment_battalion battalion,r.assignment_company company,r.assignment_platoon platoon,'' special_unit
 FROM student_ms_records r JOIN enrollment_schedules es ON es.id=CAST(r.schedule_id AS UNSIGNED)
 WHERE r.program='ROTC' AND es.program='ROTC' AND r.status='approved' AND es.platoons_assigned_at IS NOT NULL AND r.assignment_special_unit IS NULL AND COALESCE(r.assignment_is_advance,0)=0 AND r.assignment_company IS NOT NULL
 UNION
 SELECT DISTINCT r.ms_level,es.year school_year,0 battalion,'' company,p.platoon,r.assignment_special_unit special_unit
 FROM student_ms_records r JOIN enrollment_schedules es ON es.id=CAST(r.schedule_id AS UNSIGNED) CROSS JOIN (SELECT 1 platoon UNION ALL SELECT 2) p
 WHERE r.program='ROTC' AND es.program='ROTC' AND r.status='approved' AND es.platoons_assigned_at IS NOT NULL AND r.assignment_special_unit IN ('Medics','MP','HQ')`);
 const [setups]=await db.execute(`SELECT es.ms_level,es.year school_year,d.published_configuration,d.configuration
   FROM enrollment_schedules es JOIN rotc_roster_drafts d ON d.schedule_id=es.id
   WHERE es.program='ROTC' AND es.platoons_assigned_at IS NOT NULL`);
 for(const setup of setups){
   const saved=setup.published_configuration||setup.configuration;
   const slots=typeof saved==='string'?JSON.parse(saved):saved||[];
   for(const slot of slots){
     if(slot.unit&&!['Medics','MP','HQ'].includes(slot.unit))continue;
     rows.push({ms_level:setup.ms_level,school_year:setup.school_year,battalion:slot.unit?0:slot.battalion,company:slot.unit?'':slot.company,platoon:slot.platoon,special_unit:slot.unit||''});
   }
 }
 return [...new Map(rows.map(g=>[JSON.stringify([String(g.ms_level),g.school_year,Number(g.battalion),g.company,Number(g.platoon),g.special_unit]),g])).values()];
}
const same=(a,g)=>a.special_unit===g.special_unit&&Number(a.platoon)===Number(g.platoon)&&(g.special_unit||Number(a.battalion)===Number(g.battalion)&&a.company===g.company);
async function coverage(db,level,year){
 const groups=(await groupList(db)).filter(g=>String(g.ms_level)===String(level)&&g.school_year===year);
 const [assignments]=await db.execute(`SELECT a.* FROM rotc_verifier_assignments a WHERE a.active=1 AND a.ms_level=? AND a.school_year=? AND a.mi_number=0 AND a.mi_type='' AND ${eligibleSql}`,[level,year]);
 const missing=groups.filter(g=>!assignments.some(a=>same(a,g)));
 const ready=groups.length>0&&!missing.length;
 return {ready,total:groups.length,missing,warning:ready?'':groups.length?'Assign an eligible attendance verifier to every platoon before creating ROTC attendance. '+missing.length+' group(s) still need a verifier.':'Finalize the ROTC platoon roster and assign attendance verifiers before creating attendance.'};
}
module.exports={eligibleSql,groupList,coverage};
