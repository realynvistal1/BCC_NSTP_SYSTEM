async function removeStudentUsernameColumn(db) {
  const [columns] = await db.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='username'"
  );
  if (!columns.length) return false;

  const [indexes] = await db.execute(
    "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND INDEX_NAME='uk_username'"
  );
  if (indexes.length) await db.execute('ALTER TABLE students DROP INDEX uk_username');
  await db.execute('ALTER TABLE students DROP COLUMN username');
  return true;
}

module.exports = { removeStudentUsernameColumn };

if (require.main === module) {
  const db = require('../config/database');
  removeStudentUsernameColumn(db)
    .then((changed) => console.log(changed
      ? 'Student username column removed.'
      : 'Student username column is already absent.'))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.end());
}
