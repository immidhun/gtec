/* In-memory stand-ins for the Google Apps Script services that server/Code.gs uses,
   so the real server code can be run and tested under Node. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr: nr || 1, nc: nc || 1 }); }
  _grow() { const d = this.sheet.data; while (d.length < this.r + this.nr - 1) d.push([]); }
  setValues(v) { this._grow(); v.forEach((row, i) => row.forEach((x, j) => { this.sheet.data[this.r - 1 + i][this.c - 1 + j] = x; })); return this; }
  setValue(x) { return this.setValues([[x]]); }
  getValues() { return this.sheet._block(this.r, this.c, this.nr, this.nc); }
  getDisplayValues() { return this.getValues().map(r => r.map(String)); }
  setNumberFormat() { return this; }
}
class Sheet {
  constructor(name, data) { this.name = name; this.data = data || []; }
  _width() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  _block(r, c, nr, nc) {
    const out = [];
    for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (this.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); }
    return out;
  }
  getName() { return this.name; }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.data.length), Math.max(1, this._width())); }
  appendRow(row) { this.data.push(row.slice()); return this; }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  setFrozenRows() {}
  getMaxRows() { return 1000; }
  getLastRow() { return this.data.length; }
}
class Book {
  constructor(id, name) { this.id = id; this.name = name; this.sheets = []; }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  getSheets() { return this.sheets; }
  insertSheet(n, data) { const s = new Sheet(n, data); this.sheets.push(s); return s; }
}

function create(opts) {
  opts = opts || {};
  const books = {}, props = {}, cache = {}, mails = [], triggers = [];
  let seq = 0;
  const newBook = name => { const b = new Book('BOOK' + (++seq), name); books[b.id] = b; return b; };
  const ctx = {
    console, JSON, Math, Date, Object, Array, String, Number, RegExp, Error, isFinite, parseInt, parseFloat,
    SpreadsheetApp: { getActiveSpreadsheet: () => null, create: newBook, openById: id => books[id], open: f => f.book },
    DriveApp: { getFilesByName: name => { const hits = Object.values(books).filter(b => b.name === name); let i = 0; return { hasNext: () => i < hits.length, next: () => ({ book: hits[i++] }) }; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    MailApp: { sendEmail: (to, subject, body) => mails.push({ to, subject, body }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.map(t => ({ getHandlerFunction: () => t })),
      newTrigger: fn => { const b = { timeBased: () => b, atHour: () => b, everyDays: () => b, inTimezone: () => b, create: () => { triggers.push(fn); } }; return b; }
    },
    Logger: { log() {} }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'server', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  if (opts.now) vm.runInContext('now_ = function () { return new Date(' + new Date(opts.now).getTime() + '); };', ctx);
  const api = {
    ctx, books, props, cache, mails, triggers, newBook,
    run: code => vm.runInContext(code, ctx),
    /** One web request, exactly as the app sends it. Each request starts with a clean in-script memo, like a fresh Apps Script run. */
    call(body) { vm.runInContext('SS_ = null; MEMO_ = {};', ctx); return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text); },
    data: () => books[props.SS_ID],
    clearCache() { Object.keys(cache).forEach(k => delete cache[k]); }
  };
  return api;
}

/** A monthly attendance file laid out like the centre's real one. */
function addAttendance(gas, title, students, dayCount) {
  const b = gas.newBook(title), wd = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const head = ['S.No', 'Batch', 'Reg No', 'Name', 'Course(s)', 'Mail (Nisha)'];
  for (let d = 1; d <= dayCount; d++) head.push((d < 10 ? '0' : '') + d + ' ' + wd[(d - 1) % 7]);
  const rows = [[title], ['PRESENT: pick ✓ under the date.'], head, ['BATCH A', '', '', '', 'Batch time: 8:30 AM - 9:30 AM']];
  students.forEach((s, i) => rows.push([String(i + 1), s.batch, s.regNo, s.name, s.course, '✓'].concat(s.marks.split('').map(m => (m === 'P' ? '✓' : m === 'L' ? 'L' : '')))));
  b.insertSheet('ATTENDANCE', rows);
  return b;
}

module.exports = { create, addAttendance };
