/* Runs the real server/Code.gs against in-memory sheets. Usage: node tests/server.test.js */
'use strict';
const assert = require('assert');
const { create, addAttendance } = require('./mock-gas');

let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; } }
const ok = r => { assert.strictEqual(r.ok, true, r.error); return r; };
const fails = (r, re) => { assert.strictEqual(r.ok, false, 'expected an error'); assert.match(r.error, re); };

// Wednesday 11 Nov 2026, 10:00 IST
const gas = create({ now: '2026-11-11T04:30:00Z' });
gas.run('setup()');
const pin = gas.data().getSheetByName('STAFF').data[1][2];
const D = { name: 'Director', pin };
const call = (action, extra, auth) => gas.call(Object.assign({ action, auth: auth || D }, extra));

addAttendance(gas, 'STUDENT ATTENDANCE - NOVEMBER 2026', [
  { batch: 'A,B', regNo: '2051868', name: 'AMALA B', course: 'PCAIASP', marks: ' PPPPPP PPP' },
  { batch: 'A', regNo: '2017211', name: 'SREELEKSHMI S', course: 'PCAIA', marks: ' LPPPLP P  ' },
  { batch: 'D', regNo: '2039365, 2039366', name: 'AMITH RAJ', course: 'DAIMSO, ADVEX', marks: ' PP        ' },
  { batch: 'B', regNo: '2058851-52', name: 'DEVA NARAYANAN A', course: 'TALLY, GCC VAT, ZOHO', marks: '     PP PPP' }
], 30);

test('setup creates every tab, a director login, the catalogue and one daily trigger', () => {
  const names = gas.data().getSheets().map(s => s.getName());
  ['SETTINGS', 'STAFF', 'COURSES', 'UPGRADES', 'BATCHES', 'STUDENTS', 'DUES', 'PAYMENTS', 'LEAVES', 'COMPUTERS', 'ISSUES', 'ENQUIRIES', 'REMINDERS', 'UPSELL'].forEach(n => assert(names.includes(n), n));
  assert.match(pin, /^\d{6}$/);
  gas.run('setup()');
  assert.strictEqual(gas.triggers.length, 1);
  assert.strictEqual(gas.data().getSheetByName('STAFF').data.length, 2, 'setup twice must not add a second director');
});

test('wrong PIN is refused and repeated guesses are locked out', () => {
  fails(call('bootstrap', {}, { name: 'Director', pin: '000000' }), /Wrong name or PIN/);
  for (let i = 0; i < 8; i++) call('bootstrap', {}, { name: 'someone', pin: '1' });
  fails(call('bootstrap', {}, { name: 'someone', pin: '1' }), /Too many wrong attempts/);
  ok(call('bootstrap'));
});

let office, tutor;
test('director adds staff; roles limit what each login can do', () => {
  ok(call('save', { table: 'STAFF', row: { name: 'Nisha', pin: '4321', role: 'office' } }));
  ok(call('save', { table: 'STAFF', row: { name: 'Anjali', pin: '1111', role: 'tutor' } }));
  fails(call('save', { table: 'STAFF', row: { name: 'nisha', pin: '9999', role: 'office' } }), /Already exists/);
  fails(call('save', { table: 'STAFF', row: { name: 'X', pin: '12', role: 'office' } }), /PIN must be/);
  office = { name: 'nisha', pin: '4321' }; tutor = { name: 'Anjali', pin: '1111' };
  fails(call('list', { table: 'STAFF' }, office), /cannot open/);
  fails(call('dashboard', {}, tutor), /not allowed/);
  fails(call('settings', {}, office), /not allowed/);
  const b = ok(call('bootstrap', {}, tutor));
  assert.strictEqual(b.me.role, 'tutor');
  assert(b.staff.every(s => s.pin === undefined), 'PINs must never be sent to the app');
});

let amala, sree, amith, deva;
test('students are pulled in from the attendance file without duplicates', () => {
  const preview = ok(call('syncStudents', {}, office));
  assert.strictEqual(preview.missing.length, 4); assert.strictEqual(preview.added, 0);
  assert.strictEqual(ok(call('syncStudents', { apply: true }, office)).added, 4);
  assert.strictEqual(ok(call('syncStudents', { apply: true }, office)).added, 0);
  const list = ok(call('students', {}, office)).students;
  [amala, sree, amith, deva] = ['AMALA B', 'SREELEKSHMI S', 'AMITH RAJ', 'DEVA NARAYANAN A'].map(n => list.find(s => s.name === n));
  assert.strictEqual(amith.regNo, '2039365, 2039366');
  fails(call('save', { table: 'STUDENTS', row: { name: 'Copy', regNo: '2051868' } }, office), /Already exists/);
});

test('attendance percentage, leave and absent streak are worked out per student', () => {
  const r = ok(call('attendance', {}, tutor));
  assert.strictEqual(r.heldDays, 9);                       // days 2-7 and 9-11 had a class; Sundays did not
  const by = n => r.rows.find(x => x.name === n);
  assert.deepStrictEqual([by('AMALA B').present, by('AMALA B').absent, by('AMALA B').pct], [9, 0, 100]);
  assert.deepStrictEqual([by('SREELEKSHMI S').present, by('SREELEKSHMI S').leave, by('SREELEKSHMI S').absent], [5, 2, 2]);
  assert.strictEqual(by('SREELEKSHMI S').streak, 2);
  assert.strictEqual(by('AMITH RAJ').streak, 7); assert.strictEqual(by('AMITH RAJ').flag, 'streak');
  assert.strictEqual(by('DEVA NARAYANAN A').pct, 100, 'days before a mid-month joiner started are not counted as absent');
  assert.strictEqual(by('SREELEKSHMI S').flag, 'low');     // 5 of 7 = 71%
});

test('a fee plan splits the fee into instalments and rounds onto the last one', () => {
  fails(call('feePlan', { studentId: amala.id, total: 0 }, office), /total course fee/);
  const r = ok(call('feePlan', { studentId: amala.id, course: 'PCAIASP', total: 40000, discount: 5000, down: 5000, count: 7, firstDue: '2026-10-31' }, office));
  assert.strictEqual(r.created, 8);
  const it = r.ledger.items;
  assert.strictEqual(it.reduce((a, x) => a + x.amount, 0), 35000);
  assert.strictEqual(it[it.length - 1].amount, 30000 - 4285 * 6);
  assert.deepStrictEqual(it.filter(x => x.note.startsWith('Instalment')).map(x => x.dueDate).slice(0, 5), ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  assert.strictEqual(r.ledger.overdue, 4285);              // the 31 Oct instalment; the first payment is due today, not late yet
  assert.strictEqual(r.ledger.daysOverdue, 11);
});

let receipt;
test('payments settle the oldest dues first and get a running receipt number', () => {
  fails(call('pay', { studentId: amala.id, amount: -5 }, office), /amount received/);
  fails(call('pay', { studentId: amala.id, amount: 100, date: '2026-12-01' }, office), /future/);
  const r = ok(call('pay', { studentId: amala.id, amount: 6000, mode: 'gpay' }, office));
  receipt = r.payment.receiptNo;
  assert.strictEqual(receipt, 'GC-000001');
  assert.strictEqual(r.payment.collectedBy, 'Nisha');
  assert.strictEqual(r.ledger.paid, 6000); assert.strictEqual(r.ledger.balance, 29000);
  assert.strictEqual(r.ledger.overdue, 0);
  assert.deepStrictEqual(r.ledger.items.slice(0, 3).map(x => [x.dueDate, x.state, x.balance]), [['2026-10-31', 'paid', 0], ['2026-11-11', 'due', 3285], ['2026-11-30', 'due', 4285]]);
  assert.deepStrictEqual(r.ledger.nextDue, { date: '2026-11-11', amount: 3285, course: 'PCAIASP' });
  assert.match(r.receiptText, /GC-000001[\s\S]*Rs\.6000[\s\S]*AMALA B[\s\S]*Balance: Rs\.29000/);
  assert.strictEqual(ok(call('pay', { studentId: amala.id, amount: 500, mode: 'CASH' }, office)).payment.receiptNo, 'GC-000002');
  fails(call('pay', { studentId: amala.id, amount: 500, receiptNo: 'gc-000002' }, office), /already used/);
  fails(call('remove', { table: 'PAYMENTS', id: r.payment.id }, office), /Only the director/);
});

test('dues list, reminders log and day collection for the daybook', () => {
  ok(call('feePlan', { studentId: deva.id, course: 'TALLY', total: 9000, count: 3, firstDue: '2026-11-20' }, office));
  const dues = ok(call('dues', {}, office)).dues;
  assert.deepStrictEqual(dues.map(d => d.name), ['AMALA B', 'DEVA NARAYANAN A']);
  assert.strictEqual(dues[0].balance, 28500); assert.strictEqual(dues[0].nextDue.amount, 2785);
  assert.strictEqual(dues[1].overdue, 0); assert.deepStrictEqual(dues[1].nextDue, { date: '2026-11-20', amount: 3000, course: 'TALLY' });
  ok(call('remind', { studentId: amala.id, kind: 'fee', channel: 'whatsapp' }, office));
  assert.strictEqual(ok(call('dues', {}, office)).dues[0].lastReminder, '2026-11-11 10:00');
  const c = ok(call('collections', {}, office));
  assert.strictEqual(c.total, 6500); assert.deepStrictEqual(c.byMode, { GPAY: 6000, CASH: 500 });
  assert.strictEqual(c.payments[0].name, 'AMALA B');
});

test('tutors never see money', () => {
  const s = ok(call('students', {}, tutor)).students.find(x => x.id === amala.id);
  assert.strictEqual(s.balance, undefined); assert.strictEqual(s.attPct, 100);
  const d = ok(call('student', { id: amala.id }, tutor));
  assert.strictEqual(d.ledger, undefined); assert.strictEqual(d.payments, undefined);
  fails(call('dues', {}, tutor), /not allowed/); fails(call('list', { table: 'PAYMENTS' }, tutor), /cannot open/);
});

test('upgrade suggestions skip courses already taken and track the pitch status', () => {
  const list = ok(call('suggestions', {}, office)).suggestions, by = n => list.find(x => x.name === n).suggestions.map(s => s.code);
  assert.deepStrictEqual(by('DEVA NARAYANAN A'), ['GST', 'ADVEX']);            // has TALLY, GCC VAT and ZOHO already
  assert.deepStrictEqual(by('AMITH RAJ'), ['TALLY', 'POWER BI']);              // has DAIMSO and ADVEX
  assert.deepStrictEqual(by('AMALA B'), ['POWER BI', 'ADVEX']);                // PCAIASP is not mistaken for PCAIA
  assert.deepStrictEqual(by('SREELEKSHMI S'), ['SAP FICO', 'POWER BI', 'GCC VAT', 'ADVEX']);
  ok(call('upsellSet', { studentId: deva.id, course: 'GST', status: 'pitched' }, office));
  ok(call('upsellSet', { studentId: deva.id, course: 'gst', status: 'interested' }, office));
  assert.strictEqual(gas.data().getSheetByName('UPSELL').data.length, 2, 'one row per student and course');
  assert.strictEqual(ok(call('student', { id: deva.id }, office)).suggestions[0].status, 'interested');
});

let stu;
test('a student signs in with register number and mobile and sees only their own record', () => {
  ok(call('save', { table: 'STUDENTS', row: { id: amala.id, phone: '+91 98470 12345', email: 'amala@example.com' } }, office));
  fails(call('me', {}, { regNo: '2051868', phone: '9847000000' }), /does not match/);
  fails(call('me', {}, { regNo: '2051868', phone: '12345' }), /does not match/);
  stu = { regNo: '2051868', phone: '9847012345' };
  const me = ok(call('me', {}, stu));
  assert.strictEqual(me.student.name, 'AMALA B'); assert.strictEqual(me.ledger.balance, 28500);
  assert.strictEqual(me.attendance.pct, 100); assert.deepStrictEqual(me.batches.map(b => b.id), ['A', 'B']);
  assert.strictEqual(me.student.phone, undefined);
  fails(call('students', {}, stu), /Not available/); fails(call('pay', { studentId: amala.id, amount: 1 }, stu), /Not available/);
  ok(call('interest', { course: 'POWER BI' }, stu));
  assert.strictEqual(ok(call('dashboard')).upsell.interested, 2);
});

test('leave: student applies, office approves, overlap is refused, staff leave needs the director', () => {
  fails(call('leaveApply', { fromDate: '2026-11-20', toDate: '2026-11-18', reason: 'x' }, stu), /leave dates/);
  const l = ok(call('leaveApply', { fromDate: '2026-11-12', toDate: '2026-11-13', reason: 'Family function' }, stu)).leave;
  assert.strictEqual(l.status, 'pending'); assert.strictEqual(l.personName, 'AMALA B');
  fails(call('leaveApply', { fromDate: '2026-11-13', reason: 'again' }, stu), /already recorded/);
  assert.strictEqual(ok(call('dashboard')).leavesPending, 1);
  const done = ok(call('leaveDecide', { id: l.id, status: 'approved' }, office));
  assert.strictEqual(done.leave.decidedBy, 'Nisha'); assert.strictEqual(done.attendanceCellsMarked, 0, 'attendance file is untouched unless the setting is Y');
  ok(call('setSetting', { key: 'WRITE_LEAVE_TO_ATTENDANCE', value: 'Y' }));
  const l2 = ok(call('leaveApply', { personId: sree.id, fromDate: '2026-11-11', toDate: '2026-11-14', reason: 'Fever' }, office)).leave;
  assert.strictEqual(ok(call('leaveDecide', { id: l2.id, status: 'approved' }, office)).attendanceCellsMarked, 4);
  const row = gas.books[Object.keys(gas.books).find(k => gas.books[k].name.startsWith('STUDENT ATT'))].getSheetByName('ATTENDANCE').data[5];
  assert.deepStrictEqual(row.slice(6 + 8, 6 + 14), ['✓', '', 'L', 'L', 'L', 'L'], 'existing marks are never overwritten');
  const sl = ok(call('leaveApply', { type: 'staff', fromDate: '2026-11-16', reason: 'Personal' }, tutor)).leave;
  assert.strictEqual(sl.personName, 'Anjali');
  fails(call('leaveDecide', { id: sl.id, status: 'approved' }, office), /Only the director/);
  ok(call('leaveDecide', { id: sl.id, status: 'rejected' }));
});

test('computers, issues, batches and enquiries', () => {
  const pc = ok(call('save', { table: 'COMPUTERS', row: { label: 'PC-01', lab: 'Software lab', ram: '8 GB' } }, office)).row;
  assert.strictEqual(pc.status, 'working');
  fails(call('save', { table: 'COMPUTERS', row: { label: 'pc 01' } }, office), /Already exists/);
  const is = ok(call('save', { table: 'ISSUES', row: { computerId: pc.id, problem: 'Keyboard not working' } }, tutor)).row;
  assert.strictEqual(is.reportedBy, 'Anjali'); assert.strictEqual(is.date, '2026-11-11');
  ok(call('save', { table: 'COMPUTERS', row: { id: pc.id, status: 'faulty' } }, office));
  let d = ok(call('dashboard'));
  assert.strictEqual(d.pcsDown, 1); assert.strictEqual(d.openIssues, 1);
  assert.strictEqual(ok(call('save', { table: 'ISSUES', row: { id: is.id, status: 'resolved', resolution: 'Replaced' } }, office)).row.resolvedDate, '2026-11-11');
  fails(call('save', { table: 'BATCHES', row: { id: 'A', _new: true, start: '08:00' } }, office), /already exists/);
  ok(call('save', { table: 'BATCHES', row: { id: 'A', capacity: '20', faculty: 'Anjali' } }, office));
  ok(call('save', { table: 'ENQUIRIES', row: { name: 'Rahul', phone: '9000000001', course: 'TALLY', source: 'Instagram', nextFollowUp: '2026-11-11' } }, office));
  fails(call('save', { table: 'ENQUIRIES', row: { name: 'Bad', phone: '123' } }, office), /10 digits/);
  d = ok(call('dashboard'));
  assert.strictEqual(d.followUpsToday, 1);
  assert.deepStrictEqual(d.batches.find(b => b.id === 'A'), { id: 'A', start: '08:30', end: '09:30', faculty: 'Anjali', capacity: 20, strength: 2 });
  assert.strictEqual(d.collectedToday, 6500); assert.strictEqual(d.activeStudents, 4); assert.strictEqual(d.attendanceAlerts, 2);
});

test('text typed into the app cannot become a spreadsheet formula', () => {
  const r = ok(call('save', { table: 'ENQUIRIES', row: { name: '=HYPERLINK("http://x","y")', phone: '+91 9000000002' } }, office)).row;
  const sheetRow = gas.data().getSheetByName('ENQUIRIES').data.find(x => x[0] === r.id);
  assert.strictEqual(sheetRow[2][0], "'"); assert.strictEqual(sheetRow[3], '+91 9000000002');
});

test('a student with payments cannot be deleted; the last director cannot be removed', () => {
  fails(call('remove', { table: 'STUDENTS', id: amala.id }), /has payments/);
  ok(call('remove', { table: 'STUDENTS', id: amith.id }));
  const me = ok(call('list', { table: 'STAFF' })).rows.find(s => s.role === 'director');
  fails(call('remove', { table: 'STAFF', id: me.id }), /At least one director/);
});

test('daily digest mails the director and reminds overdue students once per gap', () => {
  ok(call('setSetting', { key: 'ALERT_EMAIL', value: 'director@example.com' }));
  ok(call('setSetting', { key: 'AUTO_EMAIL_REMINDERS', value: 'Y' }));
  fails(call('setSetting', { key: 'NOPE', value: '1' }), /Unknown setting/);
  gas.run('SS_ = null; MEMO_ = {}; dailyDigest()');
  assert.strictEqual(gas.mails.length, 1, 'nothing is overdue yet, so only the digest goes out');
  assert.match(gas.mails[0].body, /Overdue: Rs\.0 from 0 students \| Due in 7 days: Rs\.2785/);
  gas.run('now_ = function () { return new Date(' + Date.parse('2026-11-19T04:30:00Z') + '); }; SS_ = null; MEMO_ = {}; dailyDigest()');
  assert.strictEqual(gas.mails.length, 3);
  assert.match(gas.mails[1].body, /AMALA B \(2051868\) Rs\.2785, 8 days/);
  assert.strictEqual(gas.mails[2].to, 'amala@example.com'); assert.match(gas.mails[2].body, /AMALA B.*Rs\.2785/);
  gas.run('SS_ = null; MEMO_ = {}; dailyDigest()');
  assert.strictEqual(gas.mails.length, 4, 'second run the same day sends the digest only');
});

console.log(process.exitCode ? '\nSOME TESTS FAILED' : '\nAll ' + passed + ' server tests passed');
