const db = require('../config/database');
const DEFAULTS = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot'];
const NAMES = [...DEFAULTS,'Golf','Hotel','India','Juliet','Kilo','Lima','Mike','November','Oscar','Papa','Quebec','Romeo','Sierra','Tango','Uniform','Victor','Whiskey','Xray','Yankee','Zulu'];

function fail(message, status = 409) { const error = new Error(message); error.status = status; throw error; }
function decode(value) {
  if (value == null) return null;
  const rows = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(rows) || rows.some(row => !/^[A-Za-z][A-Za-z -]{0,29}$/.test(row.name) || !validCapacity(row.capacity))) fail('Invalid saved company setup.');
  return rows.map(row => ({ name: row.name, capacity: Number(row.capacity) }));
}
async function legacy(connection = db) {
  const [rows] = await connection.execute('SELECT name,capacity FROM cwts_companies ORDER BY id');
  return rows.map(row => ({name: row.name, capacity: Number(row.capacity)}));
}
async function schedule(connection, scheduleId, lock = false) {
  if (!/^[1-9]\d*$/.test(String(scheduleId || ''))) fail('Select an enrollment schedule.', 400);
  const [[row]] = await connection.execute("SELECT id,ms_level,year,platoons_assigned_at,cwts_company_setup FROM enrollment_schedules WHERE id=? AND program='CWTS'" + (lock ? ' FOR UPDATE' : ''), [Number(scheduleId)]);
  if (!row) fail('CWTS enrollment schedule not found.', 404);
  return row;
}
async function details(connection = db, scheduleId = null) {
  if (scheduleId == null) return legacy(connection);
  const row = await schedule(connection, scheduleId);
  const saved = decode(row.cwts_company_setup);
  // Older assigned cycles remain readable. New cycles always begin with an empty setup.
  return saved ?? (row.platoons_assigned_at ? await legacy(connection) : []);
}
async function list(connection = db, scheduleId = null) {
  return scheduleId == null ? [...new Set((await catalog(connection)).map(row=>row.name))] : (await details(connection, scheduleId)).map(row => row.name);
}
function total(rows) { return rows.reduce((sum,row)=>sum+Number(row.capacity),0); }
function validCapacity(value) { return /^(?:[1-9]\d{0,3})$/.test(String(value)) && Number(value)<=1000; }
function assignmentSlots(rows) { return rows.flatMap(row=>Array(Number(row.capacity)).fill(row.name)); }
async function configurationLocked(connection = db, scheduleId) {
  if ((await schedule(connection, scheduleId)).platoons_assigned_at) return true;
  const [[usage]]=await connection.execute("SELECT COUNT(*) total FROM student_ms_records WHERE program='CWTS' AND CAST(schedule_id AS UNSIGNED)=? AND NULLIF(assignment_company,'') IS NOT NULL", [Number(scheduleId)]);
  return Number(usage.total)>0;
}
async function lockConfiguration(connection, scheduleId) {
  const row = await schedule(connection, scheduleId, true);
  if (row.platoons_assigned_at) fail('Companies are already assigned for this enrollment schedule. Its setup is locked.');
  const [[usage]] = await connection.execute("SELECT COUNT(*) total FROM student_ms_records WHERE program='CWTS' AND CAST(schedule_id AS UNSIGNED)=? AND NULLIF(assignment_company,'') IS NOT NULL", [Number(scheduleId)]);
  if (Number(usage.total)) fail('This enrollment schedule already has company assignments. Its setup is locked.');
  return row;
}
async function save(connection, scheduleId, rows) {
  const validated = decode(rows);
  if (new Set(validated.map(row=>row.name.toLowerCase())).size !== validated.length) fail('Company names must be unique.', 400);
  await connection.execute("UPDATE enrollment_schedules SET cwts_company_setup=? WHERE id=? AND program='CWTS'", [JSON.stringify(validated), Number(scheduleId)]);
}
async function catalog(connection = db) {
  const base = await legacy(connection);
  const [schedules] = await connection.execute("SELECT id,ms_level,year,cwts_company_setup FROM enrollment_schedules WHERE program='CWTS' ORDER BY id");
  const rows = base.map(row=>({...row,schedule_id:null}));
  for (const cycle of schedules) for (const row of decode(cycle.cwts_company_setup) || []) rows.push({...row,schedule_id:Number(cycle.id),ms_level:String(cycle.ms_level),school_year:cycle.year});
  // Include historical assignments even if their old global configuration was removed.
  const [assigned] = await connection.execute("SELECT DISTINCT assignment_company name FROM student_ms_records WHERE program='CWTS' AND NULLIF(assignment_company,'') IS NOT NULL");
  for (const row of assigned) if (!rows.some(item=>item.name===row.name)) rows.push({name:row.name,capacity:null,schedule_id:null});
  return rows;
}
module.exports = { configurationLocked, lockConfiguration, schedule, save, catalog, decode, list, details, total, validCapacity, assignmentSlots, DEFAULTS, NAMES };
