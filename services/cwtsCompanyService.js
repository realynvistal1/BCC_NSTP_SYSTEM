const db = require('../config/database');
const DEFAULTS = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot'];
const NAMES = [...DEFAULTS,'Golf','Hotel','India','Juliet','Kilo','Lima','Mike','November','Oscar','Papa','Quebec','Romeo','Sierra','Tango','Uniform','Victor','Whiskey','Xray','Yankee','Zulu'];
async function list(connection = db) {
  const [rows] = await connection.execute('SELECT name FROM cwts_companies ORDER BY id');
  return rows.map(row => row.name);
}
module.exports = { list, DEFAULTS, NAMES };
