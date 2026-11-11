/* Demo server: made-up students and staff, kept entirely on the device. No real data, no server link.
   Used by the demo build (config demo: true), the demo web page and the preview page.
   - Students "walk in" by the clock; a tutor's tap overrides that and is remembered.
   - Director announcements show on the TV; full-screen ones expire after the minutes chosen.
   - A tour clock cycles through the day (brief → board → class started → ads → after hours) so the TV shows everything in a few minutes. */
(function () {
  'use strict';

  // In the demo web page the TV and the phone are separate frames: share one server and one clock with the page.
  try {
    if (window.parent !== window && window.parent.GTEC_DEMO_SERVER) {
      window.GTEC_DEMO_SERVER = window.parent.GTEC_DEMO_SERVER;
      window.GTEC_DEMO = window.GTEC_DEMO_SERVER.display;
      return;
    }
  } catch (e) { /* not same origin: run our own */ }

  var CENTRE = (window.GTEC_CONFIG && window.GTEC_CONFIG.centreName) || 'G-TEC Demo Centre';
  var NAMES = ['Anand Krishnan', 'Devika Menon', 'Fathima Rasheed', 'Gokul Prasad', 'Haritha Nair', 'Irfan Ali', 'Jishnu Raj', 'Kavya Suresh',
    'Lakshmi Priya', 'Manu Lal', 'Nandana Ajith', 'Rahul Varma', 'Sneha Joseph', 'Thomas Mathew', 'Vishnu Mohan', 'Aswathy Babu',
    'Basil Paul', 'Christy Jose', 'Diya Shaji', 'Elsa Varghese', 'Faisal Kareem', 'Gayathri Das', 'Hima Sunil', 'Jeevan Kumar',
    'Keerthana Pillai', 'Meera Unni', 'Nikhil Sasi', 'Parvathy Anil', 'Revathi Gopan', 'Sreehari Ram', 'Ann Maria', 'Abhijith Saji',
    'Riya Thomas', 'Sanjay Dev', 'Ameena Salim', 'Arjun Mohan', 'Athira Vinod', 'Bincy George', 'Deepak Raj', 'Neha Fathima'];
  var LAST = ['Krishnan', 'Menon', 'Rasheed', 'Prasad', 'Nair', 'Ali', 'Raj', 'Suresh', 'Pillai', 'Lal', 'Ajith', 'Varma', 'Joseph',
    'Mathew', 'Mohan', 'Babu', 'Paul', 'Jose', 'Shaji', 'Varghese', 'Kareem', 'Das', 'Sunil'];
  var COURSES = ['Tally Prime', 'MS Office', 'Adv. Excel', 'PCAIA', 'DAIMSO', 'Python', 'AutoCAD', 'Digital Mktg', 'SAP FICO', 'GST'];
  var BATCHES = [['A', '08:30', '09:30', 'Anjali', 14], ['B', '09:30', '10:30', 'Rohit', 10], ['C', '10:30', '12:00', 'Sreeja', 16],
                 ['D', '12:00', '13:30', 'Arun', 21], ['E', '14:00', '15:30', 'Anjali', 18], ['F', '15:30', '17:00', 'Divya', 7]];
  function rnd(seed) { var x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }
  function short(n) { var p = n.split(' '); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); }
  function toMin(hm) { var p = String(hm).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ist(ms) {
    var d = new Date(ms + 330 * 60000);
    return { wd: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60,
             ymd: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) };
  }

  /* ---------- roster (fixed, made up) ---------- */
  var k = 0;
  var ROSTER = BATCHES.map(function (b) {
    var start = toMin(b[1]), students = [];
    for (var i = 0; i < b[4]; i++, k++) {
      var full = NAMES[k % NAMES.length].split(' ')[0] + ' ' + LAST[(k * 7) % LAST.length];   // 40 x 23: every student unique
      students.push({ sid: 'S' + (100 + k), regNo: String(2030100 + k), name: full, short: short(full),
        course: COURSES[Math.floor(rnd(k + 1) * COURSES.length)],
        arrive: start - 15 + Math.floor(rnd(k + 101) * 22),
        leave: rnd(k + 211) < 0.09, never: rnd(k + 307) < 0.12 });
    }
    return { id: b[0], start: b[1], end: b[2], faculty: b[3], students: students };
  });

  /* ---------- state (tutor marks, announcements) ---------- */
  var KEY = 'gtec.demoState';
  var state = load();
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.marks) return s; } catch (e) { /* storage blocked */ }
    return { marks: {}, anns: [] };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ } }

  function statusAt(s, min) {
    if (Object.prototype.hasOwnProperty.call(state.marks, s.sid)) return state.marks[s.sid];
    if (s.leave) return 'L';
    return !s.never && min >= s.arrive ? 'P' : '';
  }
  function counts(students) {
    var c = { total: students.length, present: 0, leave: 0 };
    students.forEach(function (x) { if (x.s === 'P') c.present++; if (x.s === 'L') c.leave++; });
    c.expected = c.total - c.leave;
    return c;
  }
  function anns(now) {
    var real = Date.now();
    var list = state.anns.map(function (a) {
      var live = a.urgentReal && a.urgentReal > real;
      // the demo clock jumps around the day, so a full-screen message lasts for real minutes, not demo minutes
      return { text: a.text, urgentUntil: live ? Math.ceil((now + a.urgentReal - real) / 60000) * 60000 : null };
    });
    return list.concat([
      { text: 'Please keep your phones on silent inside the labs.', urgentUntil: null },
      { text: 'Tally Prime certification exam registration closes on Friday. See the front office.', urgentUntil: null }
    ]);
  }

  /* ---------- the "server" ---------- */
  var S = window.GTEC_DEMO_SERVER = {};
  S.listeners = [];
  function changed() { save(); S.listeners.forEach(function (f) { try { f(); } catch (e) { /* frame gone */ } }); }

  S.display = function (now) {
    var p = ist(now), leaveToday = [];
    var batches = ROSTER.map(function (b) {
      var students = b.students.map(function (s) {
        var st = statusAt(s, p.min);
        if (st === 'L') leaveToday.push({ n: s.short, batch: b.id });
        return { n: s.short, c: s.course, s: st, seat: '' };
      });
      return { id: b.id, start: b.start, end: b.end, faculty: b.faculty, room: '', students: students, counts: counts(students) };
    });
    return {
      ok: true, serverTime: now, centre: CENTRE,
      settings: { screenOn: '07:45', screenOff: '17:15', briefStart: '08:00', briefEnd: '08:15', preMinutes: 15, postMinutes: 5, voice: true, musicVolume: 0.35, reviewLink: '' },
      today: { date: p.ymd, weekday: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][p.wd], isClassDay: true, holiday: null },
      batches: batches, leaveToday: leaveToday, staffLeave: ['Divya'],
      announcements: anns(now),
      brief: { thought: 'Small daily improvements add up to big results.',
               exams: [{ date: p.ymd, text: 'Online exam: Batch D, Software lab' }], events: [{ date: p.ymd, text: 'Certificate distribution at 4:30 PM' }] },
      playlist: { items: [
        { type: 'TEXT', title: 'Admissions open', content: 'Accounting, Software, Multimedia, CAD and Digital Marketing. Ask at the front office today.', seconds: 8, slot: 'ALL' },
        { type: 'TEXT', title: 'Tally tip', content: 'Alt + F2 changes the period in Tally Prime.', seconds: 8, slot: 'ALL' },
        { type: 'TEXT', title: 'Excel tip', content: 'Ctrl + T turns your data into a Table: filters, banded rows and formulas that grow with the data.', seconds: 8, slot: 'ALL' }
      ], music: [] }
    };
  };

  S.handle = function (body, now) {
    var p = ist(now), a = body.action;
    if (a === 'display') return S.display(now);
    if (a === 'heartbeat') return { ok: true };
    if (a === 'tutorRoster') {
      return { ok: true, tutor: body.name || 'Demo tutor', date: p.ymd, canMark: true,
        batches: ROSTER.map(function (b) {
          return { id: b.id, start: b.start, end: b.end, students: b.students.map(function (s) {
            return { name: s.name, regNo: s.regNo, course: s.course, status: statusAt(s, p.min) };
          }) };
        }) };
    }
    if (a === 'mark') {
      ROSTER.forEach(function (b) { b.students.forEach(function (s) { if (s.regNo === body.regNo) state.marks[s.sid] = body.status || ''; }); });
      changed();
      return { ok: true };
    }
    if (a === 'adminStatus') {
      var d = S.display(now);
      return { ok: true, today: d.today, heartbeat: { at: Date.now() - 60000, screen: 'demo' }, batches: d.batches,
        staffLeave: d.staffLeave, announcements: d.announcements, attendanceError: null,
        leaveReview: [{ subject: 'Leave request', from: 'parent of a student', received: 'today 7:42 AM',
                        note: 'No register number or date found in the mail. Example of a mail the app could not match on its own.' }] };
    }
    if (a === 'announce') {
      var text = String(body.text || '').trim();
      if (!text) throw new Error('Type the announcement first');
      state.anns.unshift({ text: text.slice(0, 240), urgentReal: body.urgent ? Date.now() + Math.max(1, Number(body.minutes) || 30) * 60000 : null });
      state.anns = state.anns.slice(0, 6);
      changed();
      return { ok: true };
    }
    if (a === 'clearUrgent') { state.anns.forEach(function (x) { x.urgentReal = null; }); changed(); return { ok: true }; }
    throw new Error('Not available in the demo');
  };

  S.reset = function () { state = { marks: {}, anns: [] }; changed(); };

  /* ---------- demo clock ---------- */
  // Scenes of a weekday at the centre. speed = demo minutes per real minute.
  S.SCENES = [
    { id: 'brief', name: 'Morning brief', from: '08:03', secs: 30, speed: 1 },
    { id: 'board', name: 'Batch board', from: '10:20', secs: 80, speed: 7.5 },
    { id: 'started', name: 'Class started', from: '10:30', secs: 25, speed: 2 },
    { id: 'content', name: 'Ads and notices', from: '12:40', secs: 40, speed: 1 },
    { id: 'off', name: 'After hours', from: '17:20', secs: 15, speed: 1 }
  ];
  var TOUR = S.SCENES.reduce(function (a, s) { return a + s.secs; }, 0);
  S.clock = { mode: 'tour', scene: 0, t0: Date.now() };
  function dayBase() {   // midnight IST of today, moved to a weekday so the boards appear
    var p = ist(Date.now()), d = new Date(p.ymd + 'T00:00:00Z').getTime() - 330 * 60000;
    if (p.wd === 0) d += 864e5; if (p.wd === 6) d += 2 * 864e5;
    return d;
  }
  /** Where the tour is now: scene index and seconds into it. */
  S.where = function () {
    if (S.clock.mode !== 'tour') {     // a held scene runs at real speed and loops over its own stretch of the day
      var h = S.SCENES[S.clock.scene];
      return { i: S.clock.scene, t: ((Date.now() - S.clock.t0) / 1000) % (h.secs * h.speed) };
    }
    var t = ((Date.now() - S.clock.t0) / 1000) % TOUR, i = 0;
    while (t >= S.SCENES[i].secs) { t -= S.SCENES[i].secs; i++; }
    return { i: i, t: t };
  };
  S.now = function () {
    var w = S.where(), sc = S.SCENES[w.i];
    var speed = S.clock.mode === 'tour' ? sc.speed : 1;      // a held scene runs at real speed
    return dayBase() + toMin(sc.from) * 60000 + w.t * 1000 * speed;
  };
  S.tour = function () { S.clock = { mode: 'tour', scene: 0, t0: Date.now() }; };
  S.hold = function (i) { S.clock = { mode: 'hold', scene: i, t0: Date.now() }; };

  window.GTEC_DEMO = S.display;     // older preview page
})();
