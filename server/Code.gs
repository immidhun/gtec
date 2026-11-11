/**
 * G-TEC Charummood — Centre Manager server (Google Apps Script web app).
 *
 * Students, fees and dues, payment reminders, leaves, batches, lab computers,
 * upgrade-course suggestions, enquiries and a daily digest. All data lives in
 * one Google Sheet ("G-TEC CENTRE MANAGER") that this script creates.
 *
 * It is separate from the TV display / tutor script and never changes that
 * script's sheets. It only READS the monthly "STUDENT ATTENDANCE - <MONTH> <YEAR>"
 * file to work out attendance percentages (and writes "L" for approved leave
 * only when WRITE_LEAVE_TO_ATTENDANCE is set to Y).
 *
 * First run: choose the function `setup` and press Run. See README.md.
 */
var VERSION = '2.0.0';

var TABLES = {
  SETTINGS: ['Key', 'Value', 'Notes'],
  STAFF: ['id', 'name', 'pin', 'role', 'phone', 'active'],
  COURSES: ['id', 'code', 'name', 'category', 'durationMonths', 'fee', 'active'],
  UPGRADES: ['id', 'fromCode', 'toCode', 'pitch'],
  BATCHES: ['id', 'start', 'end', 'faculty', 'room', 'capacity', 'active'],
  STUDENTS: ['id', 'regNo', 'name', 'phone', 'parentPhone', 'email', 'courses', 'batch', 'joinDate', 'endDate', 'status', 'computer', 'dob', 'address', 'notes', 'updatedAt'],
  DUES: ['id', 'studentId', 'course', 'dueDate', 'amount', 'note'],
  PAYMENTS: ['id', 'studentId', 'date', 'amount', 'mode', 'receiptNo', 'course', 'collectedBy', 'note', 'createdAt'],
  LEAVES: ['id', 'type', 'personId', 'personName', 'batch', 'fromDate', 'toDate', 'reason', 'status', 'requestedAt', 'requestedBy', 'decidedBy', 'decidedAt'],
  COMPUTERS: ['id', 'label', 'lab', 'cpu', 'ram', 'storage', 'os', 'software', 'status', 'notes'],
  ISSUES: ['id', 'computerId', 'date', 'problem', 'reportedBy', 'status', 'resolvedDate', 'resolution', 'cost'],
  ENQUIRIES: ['id', 'date', 'name', 'phone', 'course', 'source', 'status', 'nextFollowUp', 'assignedTo', 'notes', 'updatedAt'],
  REMINDERS: ['id', 'at', 'studentId', 'kind', 'channel', 'by'],
  UPSELL: ['id', 'studentId', 'course', 'status', 'by', 'updatedAt', 'note']
};

/* Who may read (r), add or edit (w) and delete (x) each tab through the generic list/save/remove calls.
   d = director, o = office, t = tutor. Payments, leaves and settings have their own calls. */
var PERM = {
  COURSES: { r: 'dot', w: 'd', x: 'd' }, UPGRADES: { r: 'dot', w: 'd', x: 'd' },
  BATCHES: { r: 'dot', w: 'do', x: 'd' }, STUDENTS: { r: 'dot', w: 'do', x: 'd' },
  DUES: { r: 'do', w: 'do', x: 'do' }, PAYMENTS: { r: 'do', w: 'd', x: 'd' },
  LEAVES: { r: 'dot', w: '', x: 'd' }, COMPUTERS: { r: 'dot', w: 'do', x: 'd' },
  ISSUES: { r: 'dot', w: 'dot', x: 'd' }, ENQUIRIES: { r: 'do', w: 'do', x: 'd' },
  REMINDERS: { r: 'do', w: '', x: '' }, UPSELL: { r: 'do', w: '', x: '' }, STAFF: { r: 'd', w: 'd', x: 'd' }
};
var REQUIRED = {
  STUDENTS: ['name'], COURSES: ['code', 'name'], BATCHES: ['id'], COMPUTERS: ['label'], ENQUIRIES: ['name', 'phone'],
  STAFF: ['name', 'pin', 'role'], UPGRADES: ['fromCode', 'toCode'], DUES: ['studentId', 'dueDate', 'amount'], ISSUES: ['computerId', 'problem']
};
var UNIQUE = { STUDENTS: 'regNo', COURSES: 'code', STAFF: 'name', COMPUTERS: 'label' };

var DEFAULT_SETTINGS = [
  ['CENTRE_NAME', 'G-TEC Charummood', 'Shown on receipts and messages'],
  ['CENTRE_PHONE', '', 'Front office number students should call or WhatsApp'],
  ['UPI_ID', '', 'Optional. If filled, students see a Pay by UPI button'],
  ['RECEIPT_PREFIX', 'GC', 'Receipt numbers look like GC-000123'],
  ['MONTHLY_TARGET', '', 'Collection target for the month in rupees (optional)'],
  ['LOW_ATTENDANCE_PCT', '75', 'Students below this percentage are flagged'],
  ['ABSENT_STREAK_DAYS', '3', 'Flag a student absent this many class days in a row'],
  ['ATTENDANCE_FILE_PATTERN', 'STUDENT ATTENDANCE - {MONTH} {YEAR}', 'Name of the monthly attendance file'],
  ['ATTENDANCE_TAB', 'ATTENDANCE', 'Tab inside the attendance file'],
  ['WRITE_LEAVE_TO_ATTENDANCE', 'N', 'Y = an approved student leave writes L into empty cells of the attendance file'],
  ['ALERT_EMAIL', '', 'Daily digest is mailed here at 8 AM. Empty = no mail'],
  ['AUTO_EMAIL_REMINDERS', 'N', 'Y = students with an email get an overdue-fee mail automatically'],
  ['REMINDER_GAP_DAYS', '7', 'Minimum days between automatic reminder mails to one student'],
  ['TPL_FEE_DUE', 'Dear {name}, a fee instalment of Rs.{amount} for {course} is due on {date} at {centre}. Kindly pay on time. Thank you.', 'WhatsApp text: instalment coming up'],
  ['TPL_FEE_OVERDUE', 'Dear {name}, your fee of Rs.{amount} at {centre} has been pending since {date}. Kindly clear it at the earliest. Please ignore if already paid.', 'WhatsApp text: overdue fee'],
  ['TPL_RECEIPT', 'Receipt {receipt} - {centre}\nReceived Rs.{amount} from {name} ({regNo}) on {date} by {mode}.\nBalance: Rs.{balance}. Thank you.', 'WhatsApp text: receipt'],
  ['TPL_ABSENT', 'Dear parent, {name} has been absent from class at {centre} for {days} days. Please contact the front office.', 'WhatsApp text: absentee'],
  ['TPL_UPGRADE', 'Hi {name}, since you are doing {current}, {course} is the best next step for your career. {pitch} Ask us about the upgrade offer at {centre}.', 'WhatsApp text: upgrade course'],
  ['TPL_ENQUIRY', 'Hi {name}, thank you for your interest in {course} at {centre}. When can you visit us for a free counselling session?', 'WhatsApp text: enquiry follow-up']
];
var PUBLIC_SETTINGS = ['CENTRE_NAME', 'CENTRE_PHONE', 'UPI_ID', 'MONTHLY_TARGET', 'LOW_ATTENDANCE_PCT', 'ABSENT_STREAK_DAYS',
  'TPL_FEE_DUE', 'TPL_FEE_OVERDUE', 'TPL_RECEIPT', 'TPL_ABSENT', 'TPL_UPGRADE', 'TPL_ENQUIRY'];

/* Starter catalogue. Names and fees are placeholders: correct them in the app (More > Courses). */
var SEED_COURSES = [
  ['PCAIA', 'PCAIA', 'Accounting', 12], ['PCAIASP', 'PCAIASP', 'Accounting', 12], ['TALLY', 'Tally Prime', 'Accounting', 3],
  ['GST', 'GST', 'Accounting', 2], ['GCC VAT', 'GCC VAT', 'Accounting', 2], ['ZOHO', 'Zoho Books', 'Accounting', 2],
  ['SAP FICO', 'SAP FICO', 'Accounting', 4], ['DAIMSO', 'DAIMSO', 'Office', 6], ['GO', 'GO', 'Office', 3],
  ['ADVEX', 'Advanced Excel', 'Office', 2], ['POWER BI', 'Power BI', 'Data', 2], ['PYTHON', 'Python', 'Software', 4],
  ['AUTOCAD', 'AutoCAD', 'CAD', 3], ['DM', 'Digital Marketing', 'Marketing', 4], ['GEDC', 'GEDC', 'Office', 3]
];
var SEED_UPGRADES = [
  ['TALLY', 'GST', 'GST filing is asked for in almost every accounts job.'], ['TALLY', 'GCC VAT', 'A must for accounting jobs in the Gulf.'],
  ['TALLY', 'ZOHO', 'Cloud accounting is what new companies use.'], ['TALLY', 'ADVEX', 'Accountants who are strong in Excel get shortlisted first.'],
  ['GST', 'SAP FICO', 'SAP opens the door to corporate accounts teams.'], ['PCAIA', 'SAP FICO', 'SAP opens the door to corporate accounts teams.'],
  ['PCAIA', 'POWER BI', 'Turn accounts data into dashboards that managers ask for.'], ['PCAIA', 'GCC VAT', 'A must for accounting jobs in the Gulf.'],
  ['PCAIASP', 'POWER BI', 'Turn accounts data into dashboards that managers ask for.'], ['DAIMSO', 'ADVEX', 'Take your Excel from basic to job-ready.'],
  ['DAIMSO', 'TALLY', 'Office skills plus Tally makes you ready for accounts assistant jobs.'], ['GO', 'ADVEX', 'Take your Excel from basic to job-ready.'],
  ['GO', 'TALLY', 'Office skills plus Tally makes you ready for accounts assistant jobs.'], ['ADVEX', 'POWER BI', 'The natural next step after Excel: live dashboards.'],
  ['POWER BI', 'PYTHON', 'Automate reports and move toward data analyst roles.'], ['AUTOCAD', 'ADVEX', 'Estimation and BOQ work needs strong Excel.'],
  ['DM', 'ADVEX', 'Campaign reporting is done in Excel every day.'], ['*', 'ADVEX', 'Useful with every course: every office job needs Excel.']
];

/* =============================== web entry points =============================== */
function doGet() { return json_({ ok: true, service: 'G-TEC Centre Manager', version: VERSION }); }
function doPost(e) {
  var out;
  try {
    out = route_(JSON.parse((e && e.postData && e.postData.contents) || '{}')) || {};
    out.ok = true;
  } catch (err) { out = { ok: false, error: String((err && err.message) || err) }; }
  return json_(out);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

var STAFF_ACTIONS = {
  login: 'dot', bootstrap: 'dot', dashboard: 'do', list: 'dot', save: 'dot', remove: 'dot', students: 'dot', student: 'dot',
  feePlan: 'do', pay: 'do', dues: 'do', remind: 'do', collections: 'do', attendance: 'dot', syncStudents: 'do',
  leaveApply: 'dot', leaveDecide: 'do', suggestions: 'do', upsellSet: 'do', settings: 'd', setSetting: 'd', digestNow: 'd'
};
function route_(b) {
  var who = auth_(b), a = String(b.action || '');
  if (who.role === 'student') {
    if (a === 'me' || a === 'login') return studentHome_(who.student);
    if (a === 'leaveApply') return withLock_(function () { return leaveApply_(b, who); });
    if (a === 'interest') return withLock_(function () { return upsellSet_({ studentId: who.student.id, course: b.course, status: 'interested' }, who); });
    throw new Error('Not available');
  }
  var allowed = STAFF_ACTIONS[a];
  if (!allowed) throw new Error('Unknown action: ' + a);
  if (allowed.indexOf(who.role.charAt(0)) < 0) throw new Error('Your login is not allowed to do this');
  switch (a) {
    case 'login': return { name: who.name, role: who.role };
    case 'bootstrap': return bootstrap_(who);
    case 'dashboard': return dashboard_();
    case 'list': return { rows: list_(b.table, who) };
    case 'save': return withLock_(function () { return { row: save_(b.table, b.row || {}, who) }; });
    case 'remove': return withLock_(function () { return remove_(b.table, b.id, who); });
    case 'students': return { students: studentList_(who) };
    case 'student': return studentDetail_(b.id, who);
    case 'feePlan': return withLock_(function () { return feePlan_(b); });
    case 'pay': return withLock_(function () { return pay_(b, who); });
    case 'dues': return { dues: duesList_() };
    case 'remind': return withLock_(function () { return remind_(b, who); });
    case 'collections': return collections_(b);
    case 'attendance': return attendanceReport_(b.month);
    case 'syncStudents': return withLock_(function () { return syncStudents_(b.apply === true); });
    case 'leaveApply': return withLock_(function () { return leaveApply_(b, who); });
    case 'leaveDecide': return withLock_(function () { return leaveDecide_(b, who); });
    case 'suggestions': return { suggestions: suggestionList_() };
    case 'upsellSet': return withLock_(function () { return upsellSet_(b, who); });
    case 'settings': return { settings: rows_('SETTINGS').map(function (r) { return { key: r.Key, value: r.Value, notes: r.Notes }; }) };
    case 'setSetting': return withLock_(function () { return setSetting_(b.key, b.value); });
    case 'digestNow': return { text: digestText_() };
  }
}
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* =============================== small helpers =============================== */
function now_() { return new Date(); }
function ist_(d) { return new Date(d.getTime() + 330 * 60000).toISOString(); }
function today_() { return ist_(now_()).slice(0, 10); }
function stamp_() { return ist_(now_()).slice(0, 16).replace('T', ' '); }
function num_(v) { var n = Number(String(v === null || v === undefined ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function digits_(v) { return String(v || '').replace(/\D/g, ''); }
function last10_(v) { var d = digits_(v); return d.length >= 10 ? d.slice(-10) : ''; }
function regKey_(v) { var m = String(v || '').match(/\d{5,}/); return m ? m[0] : ''; }
function code_(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }
function uid_(p) { return p + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase(); }
function addMonths_(ymd, n) {
  var p = ymd.split('-').map(Number), m0 = p[1] - 1 + n, y = p[0] + Math.floor(m0 / 12), m = ((m0 % 12) + 12) % 12;
  var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), d = Math.min(p[2], last);
  return y + '-' + (m < 9 ? '0' : '') + (m + 1) + '-' + (d < 10 ? '0' : '') + d;
}
function daysBetween_(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
function norm_(v) {
  if (v instanceof Date) return ist_(v).slice(0, 10);
  return typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : v;
}
/** Text typed into the app must never run as a spreadsheet formula. */
function cell_(v) { var s = norm_(v); return typeof s === 'string' && /^[=+@]/.test(s) && !/^\+\d[\d\s-]*$/.test(s) ? "'" + s : s; }
function fill_(tpl, o) { return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return o[k] === undefined || o[k] === null ? '' : String(o[k]); }); }

/* =============================== sheet storage =============================== */
var SS_ = null, MEMO_ = {};
function ss_() {
  if (SS_) return SS_;
  var id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  SS_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!SS_) throw new Error('The server is not set up yet. Run setup in the Apps Script editor.');
  return SS_;
}
function sheet_(name) {
  if (!TABLES[name]) throw new Error('Unknown tab: ' + name);
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    sh.getRange(1, 1, 1, TABLES[name].length).setValues([TABLES[name]]);
    sh.setFrozenRows(1);
    try { sh.getRange(1, 1, sh.getMaxRows(), TABLES[name].length).setNumberFormat('@'); } catch (e) { /* formatting is optional */ }
  }
  return sh;
}
function table_(name) {
  if (MEMO_[name]) return MEMO_[name];
  var sh = sheet_(name), v = sh.getDataRange().getValues();
  var head = (v[0] || []).map(function (h) { return String(h).trim(); });
  TABLES[name].forEach(function (h) {           // a newer version added a column: add its heading
    if (head.indexOf(h) < 0) { head.push(h); sh.getRange(1, head.length).setValue(h); }
  });
  var rows = [];
  for (var i = 1; i < v.length; i++) {
    var o = { _r: i + 1 }, any = false;
    for (var c = 0; c < head.length; c++) { if (!head[c]) continue; o[head[c]] = norm_(v[i][c]); if (o[head[c]] !== '') any = true; }
    if (any) rows.push(o);
  }
  return (MEMO_[name] = { sh: sh, head: head, rows: rows });
}
function rows_(name) { return table_(name).rows; }
function byId_(name, id) { var r = rows_(name); for (var i = 0; i < r.length; i++) if (String(r[i].id) === String(id)) return r[i]; return null; }
function insert_(name, obj) {
  var t = table_(name);
  t.sh.appendRow(t.head.map(function (h) { return cell_(obj[h]); }));
  delete MEMO_[name];
  return obj;
}
function update_(name, id, patch) {
  var t = table_(name), row = byId_(name, id);
  if (!row) throw new Error('Record not found. Refresh and try again.');
  Object.keys(patch).forEach(function (k) { if (t.head.indexOf(k) >= 0) row[k] = norm_(patch[k]); });
  t.sh.getRange(row._r, 1, 1, t.head.length).setValues([t.head.map(function (h) { return cell_(row[h]); })]);
  delete MEMO_[name];
  return row;
}
function delete_(name, id) {
  var row = byId_(name, id);
  if (!row) throw new Error('Record not found. Refresh and try again.');
  table_(name).sh.deleteRow(row._r);
  delete MEMO_[name];
}
function clean_(r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_r') o[k] = r[k]; }); return o; }
function settings_() {
  var m = {};
  DEFAULT_SETTINGS.forEach(function (d) { m[d[0]] = d[1]; });
  rows_('SETTINGS').forEach(function (r) { if (r.Key) m[r.Key] = str_(r.Value); });
  return m;
}
function setSetting_(key, value) {
  if (!DEFAULT_SETTINGS.some(function (d) { return d[0] === key; })) throw new Error('Unknown setting: ' + key);
  var t = table_('SETTINGS'), row = null;
  t.rows.forEach(function (r) { if (r.Key === key) row = r; });
  if (row) t.sh.getRange(row._r, 2).setValue(cell_(value)); else t.sh.appendRow([key, cell_(value), '']);
  delete MEMO_.SETTINGS;
  return { key: key, value: str_(value) };
}

/* =============================== sign-in =============================== */
function auth_(b) {
  var a = b.auth || {}, cache = CacheService.getScriptCache();
  var ident = 'fail:' + String(a.regNo ? regKey_(a.regNo) : str_(a.name).toLowerCase()).slice(0, 60);
  var fails = Number(cache.get(ident) || 0);
  if (fails >= 8) throw new Error('Too many wrong attempts. Try again after 15 minutes.');
  var who = a.regNo ? authStudent_(a) : authStaff_(a);
  if (!who) { cache.put(ident, String(fails + 1), 900); throw new Error(a.regNo ? 'Register number or mobile number does not match our records' : 'Wrong name or PIN'); }
  return who;
}
function authStaff_(a) {
  var name = str_(a.name).toLowerCase(), pin = str_(a.pin);
  if (!name || !pin) return null;
  var hit = null;
  rows_('STAFF').forEach(function (s) {
    if (str_(s.name).toLowerCase() === name && str_(s.pin) === pin && String(s.active).toUpperCase() !== 'N') hit = s;
  });
  if (!hit) return null;
  var role = str_(hit.role).toLowerCase();
  if (['director', 'office', 'tutor'].indexOf(role) < 0) return null;
  return { role: role, name: hit.name, id: hit.id };
}
function authStudent_(a) {
  var key = regKey_(a.regNo), ph = last10_(a.phone);
  if (!key || !ph) return null;
  var hit = null;
  rows_('STUDENTS').forEach(function (s) {
    if (regKey_(s.regNo) === key && (last10_(s.phone) === ph || last10_(s.parentPhone) === ph)) hit = s;
  });
  return hit ? { role: 'student', name: hit.name, student: hit } : null;
}

/* =============================== generic list / save / remove =============================== */
function can_(table, kind, who) { var p = PERM[table]; return !!p && p[kind].indexOf(who.role.charAt(0)) >= 0; }
function list_(table, who) {
  if (!can_(table, 'r', who)) throw new Error('Your login cannot open this list');
  return rows_(table).map(clean_);
}
function save_(table, row, who) {
  if (!can_(table, 'w', who)) throw new Error('Your login cannot change this');
  var spec = TABLES[table], isNew = !row.id || row._new === true, o = {};
  spec.forEach(function (k) { if (row[k] !== undefined) o[k] = typeof row[k] === 'string' ? row[k].trim() : row[k]; });
  var existing = isNew ? null : byId_(table, row.id);
  if (!isNew && !existing) throw new Error('Record not found. Refresh and try again.');
  var merged = {}; spec.forEach(function (k) { merged[k] = o[k] !== undefined ? o[k] : existing ? existing[k] : ''; });
  (REQUIRED[table] || []).forEach(function (k) { if (str_(merged[k]) === '') throw new Error('Please fill in: ' + k); });
  validate_(table, merged);
  var u = UNIQUE[table];
  if (u && str_(merged[u]) !== '') {
    var key = table === 'STUDENTS' ? regKey_(merged[u]) || str_(merged[u]) : code_(merged[u]);
    rows_(table).forEach(function (r) {
      var rk = table === 'STUDENTS' ? regKey_(r[u]) || str_(r[u]) : code_(r[u]);
      if (rk === key && String(r.id) !== String(merged.id)) throw new Error('Already exists: ' + merged[u]);
    });
  }
  if (spec.indexOf('updatedAt') >= 0) o.updatedAt = merged.updatedAt = stamp_();
  if (isNew) {
    if (table === 'BATCHES') {
      merged.id = str_(merged.id).toUpperCase();
      if (byId_(table, merged.id)) throw new Error('Batch ' + merged.id + ' already exists');
    } else merged.id = uid_(table.charAt(0));
    if (table === 'ISSUES') { merged.date = merged.date || today_(); merged.status = merged.status || 'open'; merged.reportedBy = merged.reportedBy || who.name; }
    if (table === 'ENQUIRIES') { merged.date = merged.date || today_(); merged.status = merged.status || 'new'; }
    if (table === 'STUDENTS') { merged.status = merged.status || 'active'; merged.joinDate = merged.joinDate || today_(); }
    if (table === 'COMPUTERS') merged.status = merged.status || 'working';
    insert_(table, merged);
    return merged;
  }
  if (table === 'ISSUES' && merged.status === 'resolved' && !merged.resolvedDate) o.resolvedDate = today_();
  return clean_(update_(table, row.id, o));
}
function validate_(table, r) {
  ['dueDate', 'joinDate', 'endDate', 'date', 'nextFollowUp', 'resolvedDate', 'dob'].forEach(function (k) {
    if (r[k] !== undefined && str_(r[k]) !== '' && !isDate_(r[k])) throw new Error('Date must look like 2026-11-30: ' + k);
  });
  if (table === 'STAFF') {
    if (!/^\d{4,6}$/.test(str_(r.pin))) throw new Error('PIN must be 4 to 6 digits');
    if (['director', 'office', 'tutor'].indexOf(str_(r.role).toLowerCase()) < 0) throw new Error('Role must be director, office or tutor');
  }
  if (table === 'DUES') { if (num_(r.amount) <= 0) throw new Error('Amount must be more than zero'); if (!byId_('STUDENTS', r.studentId)) throw new Error('Student not found'); }
  if (table === 'ISSUES' && !byId_('COMPUTERS', r.computerId)) throw new Error('Computer not found');
  if (table === 'STUDENTS' || table === 'ENQUIRIES') ['phone', 'parentPhone'].forEach(function (k) {
    if (str_(r[k]) !== '' && !last10_(r[k])) throw new Error('Mobile number needs 10 digits');
  });
}
function remove_(table, id, who) {
  if (!can_(table, 'x', who)) throw new Error('Only the director can delete this');
  if (table === 'STUDENTS') {
    var used = rows_('PAYMENTS').some(function (p) { return String(p.studentId) === String(id); });
    if (used) throw new Error('This student has payments. Set the status to dropped or completed instead of deleting.');
    rows_('DUES').filter(function (d) { return String(d.studentId) === String(id); }).map(function (d) { return d.id; }).forEach(function (did) { delete_('DUES', did); });
  }
  if (table === 'STAFF' && rows_('STAFF').filter(function (s) { return str_(s.role).toLowerCase() === 'director' && String(s.id) !== String(id); }).length === 0) throw new Error('At least one director login must remain');
  delete_(table, id);
  return { removed: id };
}

/* =============================== reference data =============================== */
function bootstrap_(who) {
  var s = settings_(), pub = {};
  PUBLIC_SETTINGS.forEach(function (k) { pub[k] = s[k]; });
  return {
    me: { name: who.name, role: who.role }, today: today_(), version: VERSION, settings: pub,
    courses: rows_('COURSES').map(clean_), batches: rows_('BATCHES').map(clean_), upgrades: rows_('UPGRADES').map(clean_),
    computers: rows_('COMPUTERS').map(function (c) { return { id: c.id, label: c.label, lab: c.lab, status: c.status }; }),
    staff: rows_('STAFF').filter(function (x) { return String(x.active).toUpperCase() !== 'N'; }).map(function (x) { return { id: x.id, name: x.name, role: x.role }; })
  };
}

/* =============================== fees =============================== */
function group_(rows, key) { var m = {}; rows.forEach(function (r) { (m[r[key]] = m[r[key]] || []).push(r); }); return m; }
/** Payments are set against the oldest instalment first. */
function ledger_(dues, pays, today) {
  var d = (dues || []).slice().sort(function (a, b) { return String(a.dueDate) < String(b.dueDate) ? -1 : 1; });
  var paid = 0, payable = 0; (pays || []).forEach(function (p) { paid += num_(p.amount); });
  var rem = paid, overdue = 0, nextDue = null, since = '';
  var items = d.map(function (x) {
    var amt = num_(x.amount), cover = Math.min(rem, amt), bal = amt - cover;
    rem -= cover; payable += amt;
    var late = bal > 0 && String(x.dueDate) < today;        // due today is not late yet
    if (late) { overdue += bal; if (!since) since = x.dueDate; }
    if (bal > 0 && !nextDue) nextDue = { date: x.dueDate, amount: bal, course: x.course };
    return { id: x.id, course: x.course, dueDate: x.dueDate, amount: amt, note: x.note, paid: cover, balance: bal, state: bal <= 0 ? 'paid' : late ? 'overdue' : 'due' };
  });
  return { payable: payable, paid: paid, balance: Math.max(0, payable - paid), advance: Math.max(0, paid - payable), overdue: overdue,
    daysOverdue: since ? daysBetween_(since, today) : 0, overdueSince: since, nextDue: nextDue, items: items };
}
function feePlan_(b) {
  var st = byId_('STUDENTS', b.studentId);
  if (!st) throw new Error('Student not found');
  var total = num_(b.total), discount = num_(b.discount), down = num_(b.down), count = Math.floor(num_(b.count));
  var net = total - discount, first = str_(b.firstDue) || today_(), gap = Math.max(1, Math.floor(num_(b.gapMonths)) || 1);
  if (total <= 0) throw new Error('Enter the total course fee');
  if (discount < 0 || discount >= total) throw new Error('Discount must be less than the total fee');
  if (down < 0 || down > net) throw new Error('First payment cannot be more than the fee after discount');
  if (!isDate_(first)) throw new Error('Choose the first instalment date');
  var rest = net - down;
  if (rest > 0 && (count < 1 || count > 36)) throw new Error('Number of instalments must be between 1 and 36');
  var course = str_(b.course);
  if (b.replace === true) rows_('DUES').filter(function (d) { return String(d.studentId) === String(st.id) && str_(d.course) === course; })
    .map(function (d) { return d.id; }).forEach(function (id) { delete_('DUES', id); });
  var made = [];
  if (down > 0) made.push({ id: uid_('D'), studentId: st.id, course: course, dueDate: today_(), amount: down, note: 'Admission / first payment' });
  if (rest > 0) {
    var each = Math.floor(rest / count);
    for (var i = 0; i < count; i++) made.push({ id: uid_('D'), studentId: st.id, course: course, dueDate: addMonths_(first, i * gap),
      amount: i === count - 1 ? rest - each * (count - 1) : each, note: 'Instalment ' + (i + 1) + ' of ' + count + (discount ? ' (discount ' + discount + ')' : '') });
  }
  made.forEach(function (m) { insert_('DUES', m); });
  return { created: made.length, ledger: studentLedger_(st.id) };
}
function studentLedger_(id) {
  return ledger_(rows_('DUES').filter(function (d) { return String(d.studentId) === String(id); }),
                 rows_('PAYMENTS').filter(function (p) { return String(p.studentId) === String(id); }), today_());
}
function pay_(b, who) {
  var st = byId_('STUDENTS', b.studentId);
  if (!st) throw new Error('Student not found');
  var amount = num_(b.amount), date = str_(b.date) || today_(), mode = str_(b.mode).toUpperCase() || 'CASH';
  if (amount <= 0) throw new Error('Enter the amount received');
  if (!isDate_(date) || date > today_()) throw new Error('Payment date cannot be in the future');
  var s = settings_(), receipt = str_(b.receiptNo);
  if (receipt) { if (rows_('PAYMENTS').some(function (p) { return str_(p.receiptNo).toUpperCase() === receipt.toUpperCase(); })) throw new Error('Receipt number ' + receipt + ' is already used'); }
  else {
    var props = PropertiesService.getScriptProperties(), seq = Number(props.getProperty('RCPT_SEQ') || 0) + 1;
    props.setProperty('RCPT_SEQ', String(seq));
    receipt = (s.RECEIPT_PREFIX || 'GC') + '-' + ('000000' + seq).slice(-6);
  }
  var p = { id: uid_('P'), studentId: st.id, date: date, amount: amount, mode: mode, receiptNo: receipt, course: str_(b.course),
            collectedBy: who.name, note: str_(b.note), createdAt: stamp_() };
  insert_('PAYMENTS', p);
  var led = studentLedger_(st.id);
  return { payment: p, ledger: led, receiptText: fill_(s.TPL_RECEIPT, { receipt: receipt, centre: s.CENTRE_NAME, amount: amount, name: st.name, regNo: st.regNo, date: date, mode: mode, balance: led.balance }) };
}
function lastReminders_() { var m = {}; rows_('REMINDERS').forEach(function (r) { if (!m[r.studentId] || String(r.at) > m[r.studentId]) m[r.studentId] = String(r.at); }); return m; }
function duesList_() {
  var today = today_(), dues = group_(rows_('DUES'), 'studentId'), pays = group_(rows_('PAYMENTS'), 'studentId'), last = lastReminders_(), out = [];
  rows_('STUDENTS').forEach(function (s) {
    if (!dues[s.id]) return;
    var l = ledger_(dues[s.id], pays[s.id], today);
    if (l.balance <= 0) return;
    out.push({ studentId: s.id, name: s.name, regNo: s.regNo, phone: s.phone, parentPhone: s.parentPhone, batch: s.batch, courses: s.courses, status: s.status,
      balance: l.balance, overdue: l.overdue, daysOverdue: l.daysOverdue, overdueSince: l.overdueSince, nextDue: l.nextDue, lastReminder: last[s.id] || '' });
  });
  return out.sort(function (a, b) { return (b.daysOverdue - a.daysOverdue) || (String((a.nextDue || {}).date) < String((b.nextDue || {}).date) ? -1 : 1); });
}
function remind_(b, who) {
  if (!byId_('STUDENTS', b.studentId)) throw new Error('Student not found');
  insert_('REMINDERS', { id: uid_('R'), at: stamp_(), studentId: b.studentId, kind: str_(b.kind) || 'fee', channel: str_(b.channel) || 'whatsapp', by: who.name });
  return { logged: true };
}
function collections_(b) {
  var from = str_(b.from) || today_(), to = str_(b.to) || from, names = {};
  rows_('STUDENTS').forEach(function (s) { names[s.id] = s; });
  var list = rows_('PAYMENTS').filter(function (p) { return String(p.date) >= from && String(p.date) <= to; }).map(function (p) {
    var s = names[p.studentId] || {};
    return { id: p.id, date: p.date, amount: num_(p.amount), mode: p.mode, receiptNo: p.receiptNo, course: p.course || s.courses || '', name: s.name || '(deleted student)', regNo: s.regNo || '', collectedBy: p.collectedBy, note: p.note };
  }).sort(function (a, c) { return a.date < c.date ? 1 : a.date > c.date ? -1 : 0; });
  var byMode = {}, total = 0;
  list.forEach(function (p) { byMode[p.mode] = (byMode[p.mode] || 0) + p.amount; total += p.amount; });
  return { from: from, to: to, total: total, byMode: byMode, payments: list };
}

/* =============================== students =============================== */
function studentList_(who) {
  var money = who.role !== 'tutor', today = today_();
  var dues = money ? group_(rows_('DUES'), 'studentId') : {}, pays = money ? group_(rows_('PAYMENTS'), 'studentId') : {};
  var att = attendanceSafe_();
  return rows_('STUDENTS').map(function (s) {
    var o = clean_(s), a = att.byReg[regKey_(s.regNo)];
    if (money) { var l = ledger_(dues[s.id], pays[s.id], today); o.balance = l.balance; o.overdue = l.overdue; }
    if (a) { o.attPct = a.pct; o.absentStreak = a.streak; }
    return o;
  });
}
function studentDetail_(id, who) {
  var s = byId_('STUDENTS', id);
  if (!s) throw new Error('Student not found');
  var money = who.role !== 'tutor', att = attendanceSafe_();
  var out = { student: clean_(s), attendance: att.byReg[regKey_(s.regNo)] || null, attendanceMonth: att.month,
    leaves: rows_('LEAVES').filter(function (l) { return String(l.personId) === String(id); }).map(clean_) };
  if (money) {
    out.ledger = studentLedger_(id);
    out.payments = rows_('PAYMENTS').filter(function (p) { return String(p.studentId) === String(id); }).map(clean_).reverse();
    out.suggestions = suggestFor_(s, catalogue_());
    out.reminders = rows_('REMINDERS').filter(function (r) { return String(r.studentId) === String(id); }).map(clean_).reverse().slice(0, 10);
  }
  return out;
}
function studentHome_(s) {
  var st = settings_(), att = attendanceSafe_(), batches = rows_('BATCHES');
  var mine = String(s.batch || '').split(/[,\s]+/).filter(Boolean);
  return {
    student: { id: s.id, name: s.name, regNo: s.regNo, courses: s.courses, batch: s.batch, computer: s.computer, status: s.status, joinDate: s.joinDate, endDate: s.endDate },
    centre: { name: st.CENTRE_NAME, phone: st.CENTRE_PHONE, upi: st.UPI_ID }, today: today_(),
    batches: batches.filter(function (b) { return mine.indexOf(String(b.id)) >= 0; }).map(function (b) { return { id: b.id, start: b.start, end: b.end, faculty: b.faculty, room: b.room }; }),
    attendance: att.byReg[regKey_(s.regNo)] || null, attendanceMonth: att.month,
    ledger: studentLedger_(s.id),
    payments: rows_('PAYMENTS').filter(function (p) { return String(p.studentId) === String(s.id); }).map(function (p) { return { date: p.date, amount: num_(p.amount), mode: p.mode, receiptNo: p.receiptNo }; }).reverse(),
    leaves: rows_('LEAVES').filter(function (l) { return String(l.personId) === String(s.id); }).map(function (l) { return { fromDate: l.fromDate, toDate: l.toDate, reason: l.reason, status: l.status }; }).reverse(),
    suggestions: suggestFor_(s, catalogue_()).map(function (x) { return { code: x.code, name: x.name, pitch: x.pitch, durationMonths: x.durationMonths, status: x.status }; })
  };
}
function syncStudents_(apply) {
  var att = attendance_(today_().slice(0, 7));
  if (att.error) throw new Error(att.error);
  var have = {}; rows_('STUDENTS').forEach(function (s) { have[regKey_(s.regNo)] = true; });
  var fresh = att.rows.filter(function (r) { return r.key && !have[r.key] && r.name; });
  var seen = {}; fresh = fresh.filter(function (r) { if (seen[r.key]) return false; seen[r.key] = true; return true; });
  if (apply) fresh.forEach(function (r) {
    insert_('STUDENTS', { id: uid_('S'), regNo: r.regNo, name: r.name, courses: r.course, batch: r.batch, status: 'active', joinDate: '', updatedAt: stamp_() });
  });
  return { file: att.file, found: att.rows.length, added: apply ? fresh.length : 0, missing: fresh.map(function (r) { return { regNo: r.regNo, name: r.name, batch: r.batch }; }) };
}

/* =============================== attendance (read from the monthly file) =============================== */
var MONTHS_ = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
function attendanceFile_(ym) {
  var s = settings_(), p = ym.split('-');
  var name = fill_(s.ATTENDANCE_FILE_PATTERN, { MONTH: MONTHS_[Number(p[1]) - 1], YEAR: p[0] });
  var it = DriveApp.getFilesByName(name);
  if (!it.hasNext()) return { name: name, sheet: null };
  var book = SpreadsheetApp.open(it.next());
  return { name: name, sheet: book.getSheetByName(s.ATTENDANCE_TAB) || book.getSheets()[0] };
}
function attendanceGrid_(sh) {
  var v = sh.getDataRange().getDisplayValues(), hr = -1, col = {}, days = [];
  for (var i = 0; i < Math.min(v.length, 15) && hr < 0; i++) for (var c = 0; c < v[i].length; c++) if (/^reg\.?\s*no/i.test(String(v[i][c]).trim())) { hr = i; break; }
  if (hr < 0) return null;
  v[hr].forEach(function (h, c) {
    var t = String(h).trim(), m = t.match(/^(\d{1,2})(\s|$)/);
    if (/^reg\.?\s*no/i.test(t)) col.reg = c; else if (/^name/i.test(t)) col.name = c; else if (/^batch/i.test(t)) col.batch = c;
    else if (/^course/i.test(t)) col.course = c; else if (m) days.push({ c: c, day: Number(m[1]) });
  });
  return { v: v, hr: hr, col: col, days: days };
}
function attendance_(ym) {
  var cache = CacheService.getScriptCache(), ck = 'att:' + ym, hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  var out = { month: ym, file: '', heldDays: 0, rows: [], byReg: {}, error: '' };
  var f = attendanceFile_(ym);
  out.file = f.name;
  if (!f.sheet) { out.error = 'Attendance file "' + f.name + '" was not found in Google Drive'; return out; }
  var g = attendanceGrid_(f.sheet);
  if (!g || g.col.reg === undefined) { out.error = 'Could not find the "Reg No" heading in ' + f.name; return out; }
  var today = today_(), limit = today.slice(0, 7) === ym ? Number(today.slice(8)) : ym < today.slice(0, 7) ? 31 : 0;
  var days = g.days.filter(function (d) { return d.day <= limit; }), held = {};
  var rows = [];
  for (var i = g.hr + 1; i < g.v.length; i++) {
    var key = regKey_(g.v[i][g.col.reg]);
    if (!key) continue;
    var marks = days.map(function (d) { var t = String(g.v[i][d.c]).trim(); return /^[✓✔Pp]$/.test(t) ? 'P' : /^L/i.test(t) ? 'L' : ''; });
    marks.forEach(function (m, k) { if (m === 'P') held[k] = true; });
    rows.push({ key: key, regNo: String(g.v[i][g.col.reg]).trim(), name: String(g.v[i][g.col.name] || '').trim(),
      batch: g.col.batch === undefined ? '' : String(g.v[i][g.col.batch]).trim(), course: g.col.course === undefined ? '' : String(g.v[i][g.col.course]).trim(), marks: marks });
  }
  var heldIdx = days.map(function (d, k) { return k; }).filter(function (k) { return held[k]; });
  out.heldDays = heldIdx.length;
  rows.forEach(function (r) {
    var first = -1; heldIdx.forEach(function (k) { if (first < 0 && r.marks[k]) first = k; });
    var P = 0, L = 0, A = 0, streak = 0, lastDay = 0;
    heldIdx.forEach(function (k) {
      if (first >= 0 && k < first) return;                 // joined part-way through the month
      var m = r.marks[k];
      if (m === 'P') { P++; streak = 0; lastDay = days[k].day; } else if (m === 'L') { L++; streak = 0; } else { A++; streak++; }
    });
    var stat = { present: P, leave: L, absent: A, pct: P + A ? Math.round(P * 100 / (P + A)) : null, streak: streak, lastPresentDay: lastDay };
    out.rows.push({ key: r.key, regNo: r.regNo, name: r.name, batch: r.batch, course: r.course, stat: stat });
    out.byReg[r.key] = stat;
  });
  try { cache.put(ck, JSON.stringify(out), 300); } catch (e) { /* too large to cache: read again next time */ }
  return out;
}
function attendanceSafe_() {
  try { return attendance_(today_().slice(0, 7)); } catch (e) { return { month: today_().slice(0, 7), rows: [], byReg: {}, error: String(e.message || e) }; }
}
function attendanceReport_(month) {
  var ym = /^\d{4}-\d{2}$/.test(String(month)) ? month : today_().slice(0, 7), att = attendance_(ym), s = settings_();
  var low = num_(s.LOW_ATTENDANCE_PCT) || 75, streakMin = num_(s.ABSENT_STREAK_DAYS) || 3, byKey = {};
  rows_('STUDENTS').forEach(function (x) { byKey[regKey_(x.regNo)] = x; });
  var rows = att.rows.map(function (r) {
    var st = byKey[r.key] || {};
    return { studentId: st.id || '', regNo: r.regNo, name: r.name, batch: r.batch, phone: st.phone || '', parentPhone: st.parentPhone || '',
      present: r.stat.present, leave: r.stat.leave, absent: r.stat.absent, pct: r.stat.pct, streak: r.stat.streak,
      flag: r.stat.streak >= streakMin ? 'streak' : r.stat.pct !== null && r.stat.pct < low ? 'low' : '' };
  });
  return { month: ym, file: att.file, heldDays: att.heldDays, error: att.error, lowPct: low, streakDays: streakMin, rows: rows };
}
/** Approved student leave: write L into the empty cells of the attendance file (only when the setting is Y). */
function writeLeave_(student, from, to) {
  var ym = from.slice(0, 7), f = attendanceFile_(ym);
  if (!f.sheet) return 0;
  var g = attendanceGrid_(f.sheet), key = regKey_(student.regNo), n = 0;
  if (!g || !key) return 0;
  for (var i = g.hr + 1; i < g.v.length; i++) {
    if (regKey_(g.v[i][g.col.reg]) !== key) continue;
    g.days.forEach(function (d) {
      var ymd = ym + '-' + (d.day < 10 ? '0' : '') + d.day;
      if (ymd >= from && ymd <= to && String(g.v[i][d.c]).trim() === '') { f.sheet.getRange(i + 1, d.c + 1).setValue('L'); n++; }
    });
  }
  return n;
}

/* =============================== leaves =============================== */
function leaveApply_(b, who) {
  var from = str_(b.fromDate), to = str_(b.toDate) || from, reason = str_(b.reason).slice(0, 300);
  if (!isDate_(from) || !isDate_(to) || to < from) throw new Error('Choose the leave dates');
  if (daysBetween_(from, to) > 60) throw new Error('A leave cannot be longer than 60 days');
  if (!reason) throw new Error('Write the reason for the leave');
  var row = { id: uid_('L'), fromDate: from, toDate: to, reason: reason, status: 'pending', requestedAt: stamp_(), requestedBy: who.name };
  if (who.role === 'student') { row.type = 'student'; row.personId = who.student.id; row.personName = who.student.name; row.batch = who.student.batch; }
  else if (b.type === 'staff') { row.type = 'staff'; row.personId = who.role === 'director' && b.personId ? b.personId : who.id; row.personName = (byId_('STAFF', row.personId) || {}).name || who.name; }
  else {
    var st = byId_('STUDENTS', b.personId);
    if (!st) throw new Error('Choose the student');
    row.type = 'student'; row.personId = st.id; row.personName = st.name; row.batch = st.batch;
  }
  rows_('LEAVES').forEach(function (l) {
    if (String(l.personId) === String(row.personId) && l.status !== 'rejected' && l.fromDate <= to && l.toDate >= from) throw new Error('A leave for these dates is already recorded');
  });
  insert_('LEAVES', row);
  return { leave: row };
}
function leaveDecide_(b, who) {
  var l = byId_('LEAVES', b.id), status = str_(b.status);
  if (!l) throw new Error('Leave request not found');
  if (['approved', 'rejected'].indexOf(status) < 0) throw new Error('Choose approve or reject');
  if (l.type === 'staff' && who.role !== 'director') throw new Error('Only the director can decide staff leave');
  var row = clean_(update_('LEAVES', l.id, { status: status, decidedBy: who.name, decidedAt: stamp_() })), wrote = 0;
  if (status === 'approved' && l.type === 'student' && settings_().WRITE_LEAVE_TO_ATTENDANCE.toUpperCase() === 'Y') {
    var st = byId_('STUDENTS', l.personId);
    try { if (st) wrote = writeLeave_(st, l.fromDate, l.toDate); } catch (e) { /* the leave is still approved */ }
  }
  return { leave: row, attendanceCellsMarked: wrote };
}

/* =============================== upgrade suggestions =============================== */
function catalogue_() {
  var courses = rows_('COURSES').filter(function (c) { return String(c.active).toUpperCase() !== 'N'; });
  return { courses: courses, byCode: (function () { var m = {}; courses.forEach(function (c) { m[code_(c.code)] = c; }); return m; })(),
    upgrades: rows_('UPGRADES'), upsell: group_(rows_('UPSELL'), 'studentId') };
}
/** Which catalogue courses a student's free-text "courses" cell mentions. */
function coursesTaken_(text, cat) {
  var tokens = String(text || '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean), joined = tokens.join(' '), squashed = ' ' + joined + ' ';
  var codes = Object.keys(cat.byCode).sort(function (a, b) { return b.length - a.length; }), taken = [];
  codes.forEach(function (c) {
    var spaced = String(cat.byCode[c].code).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    var hit = c.length <= 3 ? tokens.indexOf(c) >= 0 : squashed.indexOf(' ' + spaced) >= 0 || tokens.some(function (t) { return t.indexOf(c) === 0; });
    if (hit) { taken.push(c); squashed = squashed.split(' ' + spaced).join(' '); tokens = tokens.filter(function (t) { return t.indexOf(c) !== 0 || c.length <= 3 && t !== c; }); }
  });
  return taken;
}
function suggestFor_(s, cat) {
  var taken = coursesTaken_(s.courses, cat), out = [], seen = {}, status = {};
  (cat.upsell[s.id] || []).forEach(function (u) { status[code_(u.course)] = u.status; });
  function add(from, u) {
    var to = code_(u.toCode), c = cat.byCode[to];
    if (!c || taken.indexOf(to) >= 0 || seen[to]) return;
    seen[to] = true;
    out.push({ code: c.code, name: c.name, pitch: u.pitch, fee: num_(c.fee), durationMonths: c.durationMonths, because: from === '*' ? '' : cat.byCode[from] ? cat.byCode[from].code : from, status: status[to] || 'new' });
  }
  taken.forEach(function (t) { cat.upgrades.forEach(function (u) { if (code_(u.fromCode) === t) add(t, u); }); });
  cat.upgrades.forEach(function (u) { if (str_(u.fromCode) === '*') add('*', u); });
  return out;
}
function suggestionList_() {
  var cat = catalogue_(), today = today_(), dues = group_(rows_('DUES'), 'studentId'), pays = group_(rows_('PAYMENTS'), 'studentId'), out = [];
  rows_('STUDENTS').forEach(function (s) {
    var status = str_(s.status).toLowerCase();
    if (status === 'dropped') return;
    var sug = suggestFor_(s, cat);
    if (!sug.length) return;
    var l = ledger_(dues[s.id], pays[s.id], today), left = s.endDate && isDate_(s.endDate) ? daysBetween_(today, s.endDate) : null;
    var ready = status === 'completed' ? 'Completed' : left !== null && left <= 30 ? (left < 0 ? 'Course over' : 'Finishing in ' + left + ' days') : dues[s.id] && l.balance <= 0 ? 'Fee fully paid' : '';
    out.push({ studentId: s.id, name: s.name, regNo: s.regNo, phone: s.phone, batch: s.batch, courses: s.courses, ready: ready, suggestions: sug });
  });
  return out.sort(function (a, b) { return (b.ready ? 1 : 0) - (a.ready ? 1 : 0) || (a.name < b.name ? -1 : 1); });
}
function upsellSet_(b, who) {
  var status = str_(b.status), course = str_(b.course);
  if (['new', 'pitched', 'interested', 'converted', 'declined'].indexOf(status) < 0) throw new Error('Unknown status');
  if (!byId_('STUDENTS', b.studentId) || !course) throw new Error('Student or course missing');
  var hit = null;
  rows_('UPSELL').forEach(function (u) { if (String(u.studentId) === String(b.studentId) && code_(u.course) === code_(course)) hit = u; });
  var patch = { status: status, by: who.name, updatedAt: stamp_(), note: str_(b.note) };
  if (hit) update_('UPSELL', hit.id, patch);
  else { patch.id = uid_('U'); patch.studentId = b.studentId; patch.course = course; insert_('UPSELL', patch); }
  return { status: status };
}

/* =============================== dashboard and daily digest =============================== */
function dashboard_() {
  var today = today_(), ym = today.slice(0, 7), s = settings_(), students = rows_('STUDENTS');
  var active = students.filter(function (x) { return str_(x.status).toLowerCase() === 'active'; });
  var pays = rows_('PAYMENTS'), todayAmt = 0, monthAmt = 0, modes = {};
  pays.forEach(function (p) {
    var a = num_(p.amount);
    if (String(p.date) === today) { todayAmt += a; modes[p.mode] = (modes[p.mode] || 0) + a; }
    if (String(p.date).slice(0, 7) === ym) monthAmt += a;
  });
  var dues = duesList_(), outstanding = 0, overdue = 0, overdueCount = 0, week = 0, weekCount = 0, in7 = addDays_(today, 7);
  dues.forEach(function (d) {
    outstanding += d.balance; overdue += d.overdue; if (d.overdue > 0) overdueCount++;
    if (d.nextDue && d.nextDue.date >= today && d.nextDue.date <= in7) { week += d.nextDue.amount; weekCount++; }
  });
  var strength = {};
  active.forEach(function (x) { String(x.batch || '').split(/[,\s]+/).filter(Boolean).forEach(function (b) { strength[b] = (strength[b] || 0) + 1; }); });
  var att = attendanceSafe_(), low = num_(s.LOW_ATTENDANCE_PCT) || 75, streakMin = num_(s.ABSENT_STREAK_DAYS) || 3, attAlerts = 0;
  att.rows.forEach(function (r) { if (r.stat.streak >= streakMin || (r.stat.pct !== null && r.stat.pct < low)) attAlerts++; });
  var ups = { interested: 0, pitched: 0, converted: 0 };
  rows_('UPSELL').forEach(function (u) { if (ups[u.status] !== undefined) ups[u.status]++; });
  var enq = rows_('ENQUIRIES'), open = enq.filter(function (e) { return ['admitted', 'lost'].indexOf(str_(e.status).toLowerCase()) < 0; });
  return {
    today: today, target: num_(s.MONTHLY_TARGET), collectedToday: todayAmt, collectedMonth: monthAmt, todayByMode: modes,
    outstanding: outstanding, overdue: overdue, overdueCount: overdueCount, dueThisWeek: week, dueThisWeekCount: weekCount,
    activeStudents: active.length, totalStudents: students.length,
    newThisMonth: students.filter(function (x) { return String(x.joinDate).slice(0, 7) === ym; }).length,
    leavesPending: rows_('LEAVES').filter(function (l) { return l.status === 'pending'; }).length,
    onLeaveToday: rows_('LEAVES').filter(function (l) { return l.status === 'approved' && l.fromDate <= today && l.toDate >= today; }).map(function (l) { return l.personName; }),
    pcsDown: rows_('COMPUTERS').filter(function (c) { return str_(c.status).toLowerCase() !== 'working'; }).length, pcsTotal: rows_('COMPUTERS').length,
    openIssues: rows_('ISSUES').filter(function (i) { return i.status !== 'resolved'; }).length,
    followUpsToday: open.filter(function (e) { return e.nextFollowUp && e.nextFollowUp <= today; }).length, openEnquiries: open.length,
    attendanceAlerts: attAlerts, attendanceError: att.error || '', upsell: ups,
    batches: rows_('BATCHES').map(function (b) { return { id: b.id, start: b.start, end: b.end, faculty: b.faculty, capacity: num_(b.capacity), strength: strength[b.id] || 0 }; })
  };
}
function addDays_(ymd, n) { return new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
function digestText_() {
  var d = dashboard_(), dues = duesList_(), L = [];
  L.push(settings_().CENTRE_NAME + ' — daily digest for ' + d.today);
  L.push('');
  L.push('Collection this month: Rs.' + d.collectedMonth + (d.target ? ' of Rs.' + d.target + ' target (' + Math.round(d.collectedMonth * 100 / d.target) + '%)' : ''));
  L.push('Outstanding fees: Rs.' + d.outstanding + ' | Overdue: Rs.' + d.overdue + ' from ' + d.overdueCount + ' students | Due in 7 days: Rs.' + d.dueThisWeek);
  L.push('Active students: ' + d.activeStudents + ' | New this month: ' + d.newThisMonth);
  L.push('Pending leave requests: ' + d.leavesPending + ' | Enquiry follow-ups due: ' + d.followUpsToday + ' | Attendance alerts: ' + d.attendanceAlerts);
  L.push('Computers not working: ' + d.pcsDown + ' | Open computer issues: ' + d.openIssues);
  var late = dues.filter(function (x) { return x.overdue > 0; }).slice(0, 15);
  if (late.length) { L.push(''); L.push('Top overdue:'); late.forEach(function (x) { L.push('  ' + x.name + ' (' + x.regNo + ') Rs.' + x.overdue + ', ' + x.daysOverdue + ' days, ' + (x.phone || 'no phone')); }); }
  return L.join('\n');
}
/** Runs every morning from the time trigger that setup installs. */
function dailyDigest() {
  var s = settings_();
  if (s.ALERT_EMAIL) MailApp.sendEmail(s.ALERT_EMAIL, s.CENTRE_NAME + ' daily digest ' + today_(), digestText_());
  if (String(s.AUTO_EMAIL_REMINDERS).toUpperCase() !== 'Y') return;
  var gap = num_(s.REMINDER_GAP_DAYS) || 7, today = today_(), last = lastReminders_(), byId = {};
  rows_('STUDENTS').forEach(function (x) { byId[x.id] = x; });
  duesList_().forEach(function (d) {
    var st = byId[d.studentId];
    if (!st || !st.email || d.overdue <= 0) return;
    if (last[d.studentId] && daysBetween_(last[d.studentId].slice(0, 10), today) < gap) return;
    MailApp.sendEmail(st.email, 'Fee reminder - ' + s.CENTRE_NAME, fill_(s.TPL_FEE_OVERDUE, { name: st.name, amount: d.overdue, date: d.overdueSince, centre: s.CENTRE_NAME }));
    insert_('REMINDERS', { id: uid_('R'), at: stamp_(), studentId: d.studentId, kind: 'fee', channel: 'email-auto', by: 'system' });
  });
}

/* =============================== one-time setup =============================== */
function setup() {
  var props = PropertiesService.getScriptProperties(), book = SpreadsheetApp.getActiveSpreadsheet();
  if (!props.getProperty('SS_ID')) {
    if (!book) book = SpreadsheetApp.create('G-TEC CENTRE MANAGER');
    props.setProperty('SS_ID', book.getId());
  }
  SS_ = null; MEMO_ = {};
  Object.keys(TABLES).forEach(function (t) { sheet_(t); });
  var have = {}; rows_('SETTINGS').forEach(function (r) { have[r.Key] = true; });
  DEFAULT_SETTINGS.forEach(function (d) { if (!have[d[0]]) table_('SETTINGS').sh.appendRow(d); });
  delete MEMO_.SETTINGS;
  var pin = '';
  if (!rows_('STAFF').length) {
    pin = String(Math.floor(100000 + Math.random() * 900000));
    insert_('STAFF', { id: uid_('T'), name: 'Director', pin: pin, role: 'director', phone: '', active: 'Y' });
  }
  if (!rows_('COURSES').length) SEED_COURSES.forEach(function (c, i) { insert_('COURSES', { id: 'C' + (i + 1), code: c[0], name: c[1], category: c[2], durationMonths: c[3], fee: '', active: 'Y' }); });
  if (!rows_('UPGRADES').length) SEED_UPGRADES.forEach(function (u, i) { insert_('UPGRADES', { id: 'G' + (i + 1), fromCode: u[0], toCode: u[1], pitch: u[2] }); });
  if (!rows_('BATCHES').length) [['A', '08:30', '09:30'], ['B', '09:30', '10:30'], ['C', '10:30', '12:00'], ['D', '12:00', '13:30'], ['E', '14:00', '15:30'], ['F', '15:30', '17:00']]
    .forEach(function (b) { insert_('BATCHES', { id: b[0], start: b[1], end: b[2], faculty: '', room: '', capacity: '', active: 'Y' }); });
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dailyDigest'; });
  if (!has) ScriptApp.newTrigger('dailyDigest').timeBased().atHour(8).everyDays(1).inTimezone('Asia/Kolkata').create();
  var msg = 'Centre Manager is ready.\nData sheet: ' + ss_().getUrl() + (pin ? '\nFirst login -> name: Director, PIN: ' + pin + ' (change it in the STAFF tab)' : '') +
    '\nNext: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone) and paste the web app link into the app Settings.';
  Logger.log(msg);
  return msg;
}
