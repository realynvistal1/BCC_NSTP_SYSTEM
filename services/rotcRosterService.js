const { specialUnitForStudent } = require('./platoonService');

function fail(message) { const error = new Error(message); error.status = 409; throw error; }
const COMPANY_ORDER = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'];
function validateCompanyOrder(companies, previous = []) {
  const names = new Set(companies.map(company=>company.name));
  const previousNames = new Set(previous.map(company=>company.name));
  for (const name of names) {
    if (previousNames.has(name)) continue;
    const missing = COMPANY_ORDER.slice(0,COMPANY_ORDER.indexOf(name)).find(prior=>!names.has(prior));
    if (missing) fail(`Add ${missing} Company before ${name} Company.`);
  }
  for (const name of previousNames) {
    if (names.has(name)) continue;
    if (COMPANY_ORDER.slice(COMPANY_ORDER.indexOf(name)+1).some(later=>names.has(later))) fail(`Remove later companies before removing ${name} Company.`);
  }
}
function validateSetup(slots, companies, { requirePlatoon = false } = {}) {
  for (const company of companies) {
    if (!slots.some(slot=>!slot.unit && slot.company===company.name && slot.battalion===company.battalion)) fail(`Add at least one platoon to ${company.name} Company before saving.`);
  }
  if (requirePlatoon && !slots.some(slot=>slot.unit!=='HQ')) fail('Add at least one platoon before saving the setup.');
}
function defaults() {
  const slots = [];
  [['Alpha','Bravo','Charlie','Delta'], ['Echo','Foxtrot','Golf','Hotel']].forEach((companies, index) => {
    companies.forEach(company => {
      for (let platoon = 1; platoon <= 4; platoon++) slots.push({ key: `${company}-${platoon}`, battalion: index + 1, company, platoon, unit: null, capacity: 37 });
    });
  });
  for (const unit of ['Medics', 'MP', 'HQ']) {
    for (let platoon = 1; platoon <= 2; platoon++) {
      slots.push({ key: `${unit}-${platoon}`, battalion: null, company: null, platoon, unit, capacity: unit === 'HQ' ? null : 37 });
    }
  }
  return slots;
}
function configuration(value) {
  if (!Array.isArray(value) || value.length > 250) fail('Configure up to 250 platoons.');
  const keys = new Set(), positions = new Set(), companies = new Map();
  const result = value.map(raw => {
    const slot = { key: String(raw.key || ''), battalion: raw.unit ? null : Number(raw.battalion), company: raw.unit ? null : String(raw.company || '').trim(), platoon: Number(raw.platoon), unit: raw.unit || null, capacity: raw.unit === 'HQ' ? null : Number(raw.capacity) };
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(slot.key) || keys.has(slot.key)) fail('Platoon identifiers must be unique.');
    keys.add(slot.key);
    if ((slot.unit !== 'HQ' && (!Number.isInteger(slot.capacity) || slot.capacity < 1 || slot.capacity > 10000)) || !Number.isInteger(slot.platoon) || slot.platoon < 1 || slot.platoon > 255) fail('Enter valid platoon numbers (1–255) and capacities (1–10000).');
    if (slot.unit && !['HQ','Medics','MP'].includes(slot.unit)) fail('Invalid special group.');
    if (!slot.unit && (![1,2].includes(slot.battalion) || !['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'].includes(slot.company))) fail('Select a battalion and a valid ROTC company (Alpha through Hotel).');
    if (!slot.unit) {
      const company = slot.company.toLowerCase();
      if (companies.has(company) && companies.get(company) !== slot.battalion) fail('A company can belong to only one battalion.');
      companies.set(company, slot.battalion);
    }
    if (slot.unit && ![1,2].includes(slot.platoon)) fail(slot.unit+' uses only Platoon 1 (male) and Platoon 2 (female).');
    const position = `${slot.unit || slot.company.toLowerCase()}|${slot.platoon}`;
    if (positions.has(position)) fail('Duplicate platoon in the same company or special group.');
    positions.add(position);
    return slot;
  });
  for (const unit of ['MP','Medics']) {
    if (!result.some(slot=>slot.unit===unit)) continue;
    for (const platoon of [1,2]) {
      if (result.some(slot=>slot.unit===unit&&slot.platoon===platoon)) continue;
      let key=unit+'-'+platoon;
      while(keys.has(key))key+='_';
      keys.add(key);
      result.push({key,battalion:null,company:null,platoon,unit,capacity:37});
    }
  }
  return automaticHQ(result);
}
function automaticHQ(slots) {
  const result = slots.map(slot => slot.unit === 'HQ' ? { ...slot, capacity:null } : { ...slot });
  const keys = new Set(result.map(slot=>slot.key));
  for (const platoon of [1,2]) {
    if (result.some(slot=>slot.unit === 'HQ' && slot.platoon === platoon)) continue;
    let key = `HQ-${platoon}`;
    while (keys.has(key)) key += '_';
    keys.add(key);
    result.push({ key, battalion:null, company:null, platoon, unit:'HQ', capacity:null });
  }
  return result;
}
function alphabetical(students) {
  return [...students].sort((a,b) => {
    for (const field of ['last_name','first_name','middle_name']) {
      const order = String(a[field] || '').localeCompare(String(b[field] || ''), 'en', { sensitivity: 'base' });
      if (order) return order;
    }
    return Number(a.id) - Number(b.id);
  });
}
function eligible(student, slot) {
  if (slot.unit === 'HQ') return slot.platoon === (student.sex === 'Male' ? 1 : student.sex === 'Female' ? 2 : 0);
  if (Number(student.has_medical_condition) === 1) return false;
  if (slot.unit) return slot.platoon === (student.sex === 'Male' ? 1 : student.sex === 'Female' ? 2 : 0);
  if (!slot.unit) return slot.battalion === (student.sex === 'Male' ? 1 : student.sex === 'Female' ? 2 : 0);
  return true;
}
function assign(students, slots) {
  const counts = new Map(slots.map(slot => [slot.key, 0]));
  return alphabetical(students).map(student => {
    const unit = specialUnitForStudent(student);
    if (!unit && Number(student.willing_to_take_advance_course) === 1) return { record_id: student.record_id, slot: 'advance' };
    const choices = slots.filter(slot => unit ? slot.unit === unit && eligible(student, slot) : !slot.unit && slot.battalion === (student.sex === 'Male' ? 1 : student.sex === 'Female' ? 2 : 0));
    const slot = choices.find(candidate => candidate.unit === 'HQ' || counts.get(candidate.key) < candidate.capacity);
    if (!slot) fail(`Not enough platoon capacity for ${unit || 'regular'} students. Increase capacity before assigning.`);
    counts.set(slot.key, counts.get(slot.key) + 1);
    return { record_id: student.record_id, slot: slot.key };
  });
}
function validate(students, slots, assignments) {
  if (!Array.isArray(assignments) || assignments.length !== students.length) fail('Assign every approved student before finalizing.');
  const seen = new Set(), counts = new Map();
  for (const assignment of assignments) {
    const student = students.find(row => Number(row.record_id) === Number(assignment.record_id));
    if (!student || seen.has(Number(assignment.record_id))) fail('Roster contains a duplicate or ineligible student. Assign again.');
    seen.add(Number(assignment.record_id));
    if (assignment.slot === 'advance') {
      if (Number(student.has_medical_condition) === 1) fail('Medical students remain in their HQ platoon.');
      continue;
    }
    const slot = slots.find(row => row.key === assignment.slot);
    if (!slot || !eligible(student, slot)) fail('Invalid platoon assignment. Battalion 1 is for males, Battalion 2 is for females, and HQ platoons follow the same separation.');
    const count = (counts.get(slot.key) || 0) + 1;
    if (slot.unit !== 'HQ' && count > slot.capacity) fail(`${label(slot)} exceeds its capacity.`);
    counts.set(slot.key, count);
  }
}
function expandTransferCapacity(slots, assignments) {
  const counts = new Map();
  for (const assignment of assignments || []) counts.set(assignment.slot, (counts.get(assignment.slot) || 0) + 1);
  for (const slot of slots) {
    if (slot.unit !== 'HQ') slot.capacity = Math.max(slot.capacity, counts.get(slot.key) || 0);
  }
}
function label(slot) { return slot ? `${slot.unit || slot.company} - Platoon ${slot.platoon}` : 'Advance Course'; }
module.exports = { expandTransferCapacity, defaults, configuration, automaticHQ, alphabetical, assign, validate, validateSetup, validateCompanyOrder, COMPANY_ORDER, label, fail };
