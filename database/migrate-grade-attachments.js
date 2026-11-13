async function ensureGradeAttachments(db){
 await db.execute(`CREATE TABLE IF NOT EXISTS instructor_grade_attachments (
   id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
   program ENUM('ROTC','CWTS') NOT NULL,assignment_id INT UNSIGNED NOT NULL,instructor_id INT UNSIGNED NOT NULL,
   original_name VARCHAR(180) NOT NULL,file_size INT UNSIGNED NOT NULL,file_data MEDIUMBLOB NOT NULL,
   created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
   KEY idx_grade_attachment_owner(assignment_id,instructor_id,id),
   FOREIGN KEY(assignment_id) REFERENCES grade_instructor_assignments(id)
 ) ENGINE=InnoDB`);
 const [columns]=await db.execute("SHOW COLUMNS FROM instructor_grade_submissions LIKE 'attachment_id'");
 if(!columns.length)await db.execute('ALTER TABLE instructor_grade_submissions ADD COLUMN attachment_id INT UNSIGNED DEFAULT NULL, ADD CONSTRAINT fk_grade_submission_attachment FOREIGN KEY(attachment_id) REFERENCES instructor_grade_attachments(id)');
}
module.exports={ensureGradeAttachments};
