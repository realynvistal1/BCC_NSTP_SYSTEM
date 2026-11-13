// One bound instructor ID; assignment logs retain access after removal or replacement.
function readAccess(alias,column){
  return `EXISTS(SELECT 1 FROM (SELECT ? instructor_id) history_viewer WHERE ${alias}.${column}=history_viewer.instructor_id OR EXISTS(SELECT 1 FROM grade_instructor_assignment_log history_log WHERE history_log.assignment_id=${alias}.id AND (history_log.instructor_id=history_viewer.instructor_id OR history_log.previous_instructor_id=history_viewer.instructor_id)))`;
}
module.exports={readAccess};
