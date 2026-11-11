/* Centre Manager: students, fees and reminders, attendance alerts, leaves, batches, lab computers,
   upgrade-course suggestions and enquiries. For the director, the front office and tutors.
   Talks to the Centre Manager server (server/Code.gs) through G.mApi. */
(function () {
  'use strict';
  var G = window.GTEC_APP, h = G.h;
  var M = window.GTEC_MANAGE = {};
  var st = { auth: null, boot: null, tab: 'home', students: null, seq: 0 };

  var TABS = [['home', 'Home', 'do'], ['students', 'Students', 'dot'], ['fees', 'Fees', 'do'], ['attendance', 'Attendance', 'dot'], ['leaves', 'Leaves', 'dot'],
    ['batches', 'Batches', 'dot'], ['computers', 'Computers', 'dot'], ['upgrades', 'Upgrades', 'do'], ['enquiries', 'Enquiries', 'do'], ['more', 'More', 'dot']];
  var MODES = ['CASH', 'GPAY', 'UPI', 'BANK', 'CARD', 'CHEQUE'];
  var YN = [['Y', 'Yes'], ['N', 'No']];

  /* ---------------- helpers ---------------- */
  function role() { return st.boot ? st.boot.me.role : ''; }
  function is(roles) { return roles.indexOf(role().charAt(0)) >= 0; }
  function ext(a, b) { Object.keys(b || {}).forEach(function (k) { a[k] = b[k]; }); return a; }
  function api(action, extra) { return G.mApi(ext({ action: action, auth: st.auth }, extra)); }
  function rs(n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
  function dt(ymd) { var p = String(ymd || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + G.MONTHS[Number(p[1]) - 1].slice(0, 3) + (p[0] !== st.boot.today.slice(0, 4) ? ' ' + p[0] : '') : (ymd || ''); }
  function set(k) { return (st.boot.settings || {})[k] || ''; }
  function fill(tpl, o) { return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return o[k] === undefined || o[k] === null ? '' : String(o[k]); }); }
  function people(n) { return n + (n === 1 ? ' student' : ' students'); }
  function pill(text, kind) { return h('span', { class: 'pill ' + (kind || 'info'), text: text }); }
  function btn(text, fn, cls) { return h('button', { class: 'btn ' + (cls || ''), type: 'button', text: text, onclick: fn }); }
  function fail(e) { G.toast(e.message || String(e), 4500); }
  function last10(v) { var d = String(v || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }
  M.waLink = function (phone, text) { var p = last10(phone); return 'https://wa.me/' + (p ? '91' + p : '') + '?text=' + encodeURIComponent(text); };
  function wa(phone, text) {
    if (!last10(phone)) G.toast('No mobile number saved. Pick the contact in WhatsApp.', 3500);
    var w = window.open(M.waLink(phone, text), '_blank');
    if (!w) location.href = M.waLink(phone, text);
  }
  function callLink(phone) { return last10(phone) ? h('a', { class: 'btn', href: 'tel:+91' + last10(phone), text: 'Call' }) : null; }
  function empty(text) { return h('p', { class: 'hint', text: text }); }
  function card(title, kids, extra) { return h('div', { class: 'card' }, [title ? h('div', { class: 'card-head' }, [h('h2', { text: title }), extra || null]) : null].concat(kids)); }
  function lrow(main, meta, right, onclick, cls) {
    return h(onclick ? 'button' : 'div', { class: 'lrow ' + (cls || ''), type: onclick ? 'button' : null, onclick: onclick || null }, [
      h('div', { class: 'lmain' }, [h('div', { class: 'nm', text: main }), meta ? h('div', { class: 'meta', text: meta }) : null]),
      right ? h('div', { class: 'lright' }, [].concat(right)) : null]);
  }

  /* ---------------- shell ---------------- */
  M.start = function () {
    document.body.className = 'phone';
    st.auth = G.store.get('mAuth', null);
    if (st.auth) boot(); else login();
  };
  function shell(showNav) {
    var r = document.getElementById('app');
    r.innerHTML = '';
    r.appendChild(G.phonebar(st.boot ? st.boot.me.name : 'Sign in'));
    if (showNav && st.boot) r.appendChild(h('nav', { class: 'mnav', 'aria-label': 'Sections' }, [h('div', { class: 'in' }, TABS.filter(function (t) { return is(t[2]); }).map(function (t) {
      return h('button', { type: 'button', 'aria-current': st.tab === t[0] ? 'page' : null, text: t[1], onclick: function () { go(t[0]); } });
    }))]));
    var wrap = h('div', { class: 'phone-wrap', id: 'm-wrap' });
    r.appendChild(wrap);
    return wrap;
  }
  function login(msg) {
    st.boot = null;
    var name = h('input', { id: 'm-name', autocomplete: 'username', placeholder: 'Your name in the STAFF tab' });
    var pin = h('input', { id: 'm-pin', type: 'password', inputmode: 'numeric', autocomplete: 'current-password', placeholder: '4–6 digit PIN' });
    var err = h('p', { class: 'hint', role: 'alert', text: msg || '' });
    shell(false).appendChild(h('form', { class: 'card', onsubmit: function (e) {
      e.preventDefault();
      st.auth = { name: name.value.trim(), pin: pin.value.trim() };
      err.textContent = 'Signing in…';
      boot(function (e2) { st.auth = null; err.textContent = e2.message; });
    } }, [
      h('h2', { text: 'Centre Manager sign-in' }),
      h('label', { class: 'field' }, ['Name', name]), h('label', { class: 'field' }, ['PIN', pin]), err,
      h('div', { class: 'btns' }, [h('button', { class: 'btn primary', type: 'submit', text: 'Sign in' }), btn('Settings', G.openSettings)])
    ]));
  }
  function boot(onFail) {
    api('bootstrap').then(function (b) {
      G.store.set('mAuth', st.auth);
      st.boot = b;
      if (!is((TABS.filter(function (t) { return t[0] === st.tab; })[0] || TABS[0])[2])) st.tab = 'students';
      go(st.tab);
    }, function (e) {
      if (onFail) return onFail(e);
      if (/PIN|attempts/i.test(e.message)) { G.store.del('mAuth'); return login(e.message); }
      login(e.message);
    });
  }
  function signOut() { G.store.del('mAuth'); st.auth = null; st.students = null; login(); }
  function go(tab) { st.tab = tab; st.seq++; window.scrollTo(0, 0); SCREENS[tab](); }
  M.go = go;

  /** Draw a screen: header now, body when the data arrives. A slow reply for a screen the user has left is dropped. */
  function screen(title, sub, actions, load, draw) {
    var wrap = shell(true), seq = st.seq;
    wrap.appendChild(h('div', { class: 'phone-head' }, [h('div', null, [h('h1', { text: title }), sub ? h('div', { class: 'sub', text: sub }) : null]), h('div', { class: 'btns' }, actions || [])]));
    var body = h('div', { class: 'stack' }, [empty('Loading…')]);
    wrap.appendChild(body);
    Promise.resolve(load ? load() : null).then(function (d) {
      if (seq !== st.seq) return;
      body.innerHTML = '';
      [].concat(draw(d, body) || []).forEach(function (n) { if (n) body.appendChild(n); });
    }, function (e) {
      if (seq !== st.seq) return;
      if (/Wrong name or PIN/i.test(e.message)) return signOut();
      body.innerHTML = ''; body.appendChild(h('p', { class: 'hint', role: 'alert', text: e.message })); body.appendChild(btn('Try again', function () { go(st.tab); }));
    });
  }
  function students(force) {
    if (st.students && !force) return Promise.resolve(st.students);
    return api('students').then(function (d) { st.students = d.students.sort(function (a, b) { return a.name < b.name ? -1 : 1; }); return st.students; });
  }
  function reload() { st.students = null; go(st.tab); }

  /* ---------------- form overlay ---------------- */
  /* fields: { k, l, t: text|number|date|time|tel|email|select|textarea, o: options, req, ph, hint } */
  function form(title, fields, values, onSubmit, submitText) {
    values = values || {};
    var inputs = {}, err = h('p', { class: 'hint', role: 'alert' });
    var rows = fields.map(function (f) {
      var v = values[f.k] === undefined || values[f.k] === null ? '' : String(values[f.k]), el;
      var id = 'f-' + f.k;
      if (f.t === 'select') el = h('select', { id: id }, (f.req ? [] : [['', '—']]).concat(f.o.map(function (o) { return typeof o === 'string' ? [o, o] : o; })).map(function (o) {
        return h('option', { value: o[0], selected: String(o[0]) === v ? 'selected' : null, text: o[1] });
      }));
      else if (f.t === 'textarea') { el = h('textarea', { id: id, rows: '3', placeholder: f.ph || null }); el.value = v; }
      else el = h('input', { id: id, type: f.t || 'text', value: v, placeholder: f.ph || null, inputmode: f.t === 'number' ? 'decimal' : null, step: f.t === 'number' ? 'any' : null });
      if (f.t === 'select' && v && !Array.prototype.some.call(el.options, function (o) { return o.value === v; })) el.appendChild(h('option', { value: v, selected: 'selected', text: v }));
      inputs[f.k] = el;
      return h('label', { class: 'field' + (f.t === 'textarea' || f.wide ? ' wide' : '') }, [f.l + (f.req ? ' *' : ''), el, f.hint ? h('span', { class: 'hint', text: f.hint }) : null]);
    });
    var save = h('button', { class: 'btn primary', type: 'submit', text: submitText || 'Save' });
    var ov = h('div', { class: 'overlay', role: 'dialog', 'aria-label': title }, [h('form', { class: 'card formcard', onsubmit: function (e) {
      e.preventDefault();
      var out = {}, miss = null;
      fields.forEach(function (f) { out[f.k] = inputs[f.k].value.trim(); if (f.req && !out[f.k] && !miss) miss = f; });
      if (miss) { err.textContent = 'Please fill in: ' + miss.l; inputs[miss.k].focus(); return; }
      save.disabled = true; err.textContent = 'Saving…';
      Promise.resolve().then(function () { return onSubmit(out); }).then(function () { ov.remove(); }, function (e2) { save.disabled = false; err.textContent = e2.message || String(e2); });
    } }, [h('h2', { text: title }), h('div', { class: 'fgrid' }, rows), err, h('div', { class: 'btns' }, [save, btn('Cancel', function () { ov.remove(); })])])]);
    document.body.appendChild(ov);
    var first = ov.querySelector('input,select,textarea'); if (first) first.focus();
    return ov;
  }
  function confirmBox(text, yes, fn) {
    var ov = h('div', { class: 'overlay', role: 'alertdialog', 'aria-label': 'Confirm' }, [h('div', { class: 'card' }, [h('p', { text: text, style: 'margin:0' }),
      h('div', { class: 'btns' }, [btn(yes, function () { ov.remove(); fn(); }, 'danger'), btn('Cancel', function () { ov.remove(); })])])]);
    document.body.appendChild(ov);
  }
  function save(table, row) { return api('save', { table: table, row: row }); }
  function del(table, id, what) { confirmBox('Delete ' + what + '? This cannot be undone.', 'Delete', function () { api('remove', { table: table, id: id }).then(function () { G.toast('Deleted'); reload(); }, fail); }); }

  /* ---------------- field lists ---------------- */
  function batchOpts() { return st.boot.batches.map(function (b) { return [b.id, b.id + ' · ' + G.fmt12(b.start)]; }); }
  function courseOpts() { return st.boot.courses.map(function (c) { return [c.code, c.code === c.name ? c.code : c.code + ' · ' + c.name]; }); }
  function F(table) {
    return {
      STUDENTS: [{ k: 'name', l: 'Name', req: 1 }, { k: 'regNo', l: 'Register no.' }, { k: 'phone', l: 'Student mobile', t: 'tel' }, { k: 'parentPhone', l: 'Parent mobile', t: 'tel' },
        { k: 'email', l: 'Email', t: 'email' }, { k: 'courses', l: 'Course(s)', ph: 'e.g. TALLY, GST' }, { k: 'batch', l: 'Batch', ph: 'e.g. A or A,B' },
        { k: 'status', l: 'Status', t: 'select', req: 1, o: ['active', 'completed', 'on hold', 'dropped'] }, { k: 'joinDate', l: 'Joined on', t: 'date' }, { k: 'endDate', l: 'Course ends on', t: 'date' },
        { k: 'computer', l: 'Computer', t: 'select', o: st.boot.computers.map(function (c) { return [c.label, c.label + (c.lab ? ' · ' + c.lab : '')]; }) },
        { k: 'dob', l: 'Date of birth', t: 'date' }, { k: 'address', l: 'Address', t: 'textarea' }, { k: 'notes', l: 'Notes', t: 'textarea' }],
      COURSES: [{ k: 'code', l: 'Short code', req: 1, ph: 'e.g. TALLY' }, { k: 'name', l: 'Full name', req: 1 }, { k: 'category', l: 'Category' }, { k: 'durationMonths', l: 'Duration (months)', t: 'number' },
        { k: 'fee', l: 'Course fee (₹)', t: 'number' }, { k: 'active', l: 'Offered now', t: 'select', req: 1, o: YN }],
      UPGRADES: [{ k: 'fromCode', l: 'Student has done', t: 'select', req: 1, o: [['*', 'Any course']].concat(courseOpts()) }, { k: 'toCode', l: 'Suggest next', t: 'select', req: 1, o: courseOpts() },
        { k: 'pitch', l: 'Why (one line the counsellor can say)', t: 'textarea' }],
      BATCHES: [{ k: 'id', l: 'Batch letter', req: 1 }, { k: 'start', l: 'Starts', t: 'time' }, { k: 'end', l: 'Ends', t: 'time' }, { k: 'faculty', l: 'Faculty' }, { k: 'room', l: 'Room / lab' },
        { k: 'capacity', l: 'Seats', t: 'number' }, { k: 'active', l: 'Running', t: 'select', req: 1, o: YN }],
      COMPUTERS: [{ k: 'label', l: 'Computer name', req: 1, ph: 'e.g. PC-01' }, { k: 'lab', l: 'Lab / room' }, { k: 'status', l: 'Status', t: 'select', req: 1, o: ['working', 'faulty', 'under repair', 'retired'] },
        { k: 'cpu', l: 'Processor' }, { k: 'ram', l: 'RAM' }, { k: 'storage', l: 'Storage' }, { k: 'os', l: 'Operating system' }, { k: 'software', l: 'Software installed', t: 'textarea' }, { k: 'notes', l: 'Notes', t: 'textarea' }],
      ENQUIRIES: [{ k: 'name', l: 'Name', req: 1 }, { k: 'phone', l: 'Mobile', t: 'tel', req: 1 }, { k: 'course', l: 'Interested in', t: 'select', o: courseOpts() },
        { k: 'source', l: 'Came from', t: 'select', o: ['Walk-in', 'Phone', 'Instagram', 'Facebook', 'Google', 'Website', 'Referral', 'Other'] },
        { k: 'status', l: 'Status', t: 'select', req: 1, o: ['new', 'contacted', 'visited', 'admitted', 'lost'] }, { k: 'nextFollowUp', l: 'Next follow-up', t: 'date' },
        { k: 'assignedTo', l: 'Handled by', t: 'select', o: st.boot.staff.map(function (s) { return s.name; }) }, { k: 'notes', l: 'Notes', t: 'textarea' }],
      STAFF: [{ k: 'name', l: 'Name', req: 1 }, { k: 'pin', l: 'PIN (4–6 digits)', req: 1, t: 'tel' }, { k: 'role', l: 'Role', t: 'select', req: 1, o: [['office', 'Front office'], ['tutor', 'Tutor'], ['director', 'Director']] },
        { k: 'phone', l: 'Mobile', t: 'tel' }, { k: 'active', l: 'Can sign in', t: 'select', req: 1, o: YN }]
    }[table];
  }
  function edit(table, title, row, defaults, after) {
    var isNew = !row;
    form((isNew ? 'New ' : 'Edit ') + title, F(table).filter(function (f) { return !(table === 'BATCHES' && f.k === 'id' && !isNew); }), row || defaults || {}, function (v) {
      if (!isNew) v.id = row.id; else if (table === 'BATCHES') v._new = true;
      return save(table, v).then(function (r) {
        G.toast('Saved');
        if (after) return after(r.row);
        if (['COURSES', 'UPGRADES', 'BATCHES', 'COMPUTERS', 'STAFF'].indexOf(table) >= 0) return api('bootstrap').then(function (b) { st.boot = b; reload(); });
        reload();
      });
    });
  }

  var SCREENS = {};

  /* ---------------- home ---------------- */
  SCREENS.home = function () {
    screen('Today', G.DAYS[G.ist(G.now()).wd] + ', ' + dt(st.boot.today), [btn('Refresh', function () { reload(); })], function () { return api('dashboard'); }, function (d) {
      function tile(label, value, sub, tab, kind) {
        return h('button', { class: 'tile2 ' + (kind || ''), type: 'button', onclick: function () { go(tab); } }, [h('span', { class: 'lab', text: label }), h('b', { text: value }), sub ? h('span', { class: 'sub', text: sub }) : null]);
      }
      var pct = d.target ? Math.min(100, Math.round(d.collectedMonth * 100 / d.target)) : null;
      var modes = Object.keys(d.todayByMode).map(function (m) { return m + ' ' + rs(d.todayByMode[m]); }).join(' · ');
      return [
        h('div', { class: 'tiles2' }, [
          tile('Collected today', rs(d.collectedToday), modes || 'No payments yet', 'fees'),
          tile('This month', rs(d.collectedMonth), d.target ? pct + '% of ' + rs(d.target) + ' target' : 'Set MONTHLY_TARGET in More › Settings', 'fees'),
          tile('Overdue fees', rs(d.overdue), people(d.overdueCount), 'fees', d.overdue ? 'bad' : ''),
          tile('Due in 7 days', rs(d.dueThisWeek), people(d.dueThisWeekCount) + ' · total pending ' + rs(d.outstanding), 'fees'),
          tile('Active students', String(d.activeStudents), d.newThisMonth + ' joined this month', 'students'),
          tile('Attendance alerts', String(d.attendanceAlerts), d.attendanceError ? 'Attendance file not readable' : 'absent in a row or low %', 'attendance', d.attendanceAlerts ? 'warn' : ''),
          tile('Leave requests', String(d.leavesPending), d.onLeaveToday.length ? 'On leave today: ' + d.onLeaveToday.join(', ') : 'waiting for a decision', 'leaves', d.leavesPending ? 'warn' : ''),
          tile('Follow-ups due', String(d.followUpsToday), d.openEnquiries + ' open enquiries', 'enquiries', d.followUpsToday ? 'warn' : ''),
          tile('Computers down', d.pcsDown + ' of ' + d.pcsTotal, d.openIssues + ' open issues', 'computers', d.pcsDown ? 'bad' : ''),
          tile('Upgrade leads', String(d.upsell.interested), d.upsell.pitched + ' pitched · ' + d.upsell.converted + ' converted', 'upgrades')
        ]),
        pct === null ? null : h('div', { class: 'bar', role: 'img', 'aria-label': 'Month target ' + pct + '%' }, [h('i', { style: 'width:' + pct + '%' })]),
        card('Batch strength', [h('div', { style: 'overflow-x:auto' }, [h('table', { class: 'mini' }, [
          h('thead', null, [h('tr', null, ['Batch', 'Time', 'Faculty', 'Students', 'Seats free'].map(function (t) { return h('th', { text: t }); }))]),
          h('tbody', null, d.batches.map(function (b) {
            return h('tr', null, [h('td', { text: b.id }), h('td', { text: G.fmt12(b.start) }), h('td', { text: b.faculty || '—' }), h('td', { text: String(b.strength) }),
              h('td', { text: b.capacity ? String(Math.max(0, b.capacity - b.strength)) : '—' })]);
          }))])])])
      ];
    });
  };

  /* ---------------- students ---------------- */
  SCREENS.students = function () {
    var q = '', batch = '', status = 'active';
    var acts = is('do') ? [btn('New student', function () { edit('STUDENTS', 'student', null, { status: 'active', joinDate: st.boot.today }); }, 'primary')] : [];
    screen('Students', '', acts, function () { return students(); }, function (list) {
      var box = h('div', { class: 'stack' }), count = h('p', { class: 'hint' });
      function draw() {
        var words = q.toLowerCase().split(/\s+/).filter(Boolean);
        var hit = list.filter(function (s) {
          if (status && String(s.status).toLowerCase() !== status) return false;
          if (batch && String(s.batch).split(/[,\s]+/).indexOf(batch) < 0) return false;
          var hay = (s.name + ' ' + s.regNo + ' ' + s.phone + ' ' + s.courses).toLowerCase();
          return words.every(function (w) { return hay.indexOf(w) >= 0; });
        });
        count.textContent = hit.length + ' of ' + list.length + ' students';
        box.innerHTML = '';
        hit.slice(0, 200).forEach(function (s) {
          var right = [];
          if (s.overdue > 0) right.push(pill(rs(s.overdue) + ' late', 'bad')); else if (s.balance > 0) right.push(pill(rs(s.balance) + ' pending', 'warn'));
          if (s.attPct !== undefined && s.attPct !== null) right.push(pill(s.attPct + '%', s.attPct < Number(set('LOW_ATTENDANCE_PCT') || 75) ? 'warn' : 'ok'));
          box.appendChild(lrow(s.name, [s.regNo, s.courses, s.batch ? 'Batch ' + s.batch : '', s.computer].filter(Boolean).join(' · '), right, function () { studentDetail(s.id); }));
        });
        if (!hit.length) box.appendChild(empty(list.length ? 'No student matches.' : 'No students yet. Add one, or pull the list from this month’s attendance file in More.'));
      }
      var search = h('input', { type: 'search', id: 's-q', placeholder: 'Search name, register no., mobile or course', 'aria-label': 'Search students', oninput: function () { q = search.value; draw(); } });
      var bsel = h('select', { 'aria-label': 'Batch', onchange: function () { batch = bsel.value; draw(); } }, [h('option', { value: '', text: 'All batches' })].concat(st.boot.batches.map(function (b) { return h('option', { value: b.id, text: 'Batch ' + b.id }); })));
      var ssel = h('select', { 'aria-label': 'Status', onchange: function () { status = ssel.value; draw(); } }, [['active', 'Active'], ['completed', 'Completed'], ['on hold', 'On hold'], ['dropped', 'Dropped'], ['', 'Everyone']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      draw();
      return [h('div', { class: 'filters' }, [search, bsel, ssel]), count, box];
    });
  };

  function studentDetail(id) {
    st.seq++;
    screen('Student', '', [btn('Back', function () { go(st.tab); })], function () { return api('student', { id: id }); }, function (d) {
      var s = d.student, L = d.ledger, phone = s.phone || s.parentPhone, kids = [];
      function again() { st.students = null; studentDetail(id); }
      kids.push(card(s.name, [
        h('dl', { class: 'kv' }, [['Register no.', s.regNo], ['Course(s)', s.courses], ['Batch', s.batch], ['Computer', s.computer], ['Status', s.status], ['Mobile', s.phone], ['Parent', s.parentPhone],
          ['Joined', dt(s.joinDate)], ['Ends', dt(s.endDate)], ['Notes', s.notes]].filter(function (x) { return x[1]; }).reduce(function (a, x) { return a.concat([h('dt', { text: x[0] }), h('dd', { text: x[1] })]); }, [])),
        h('div', { class: 'btns' }, [callLink(phone), phone ? btn('WhatsApp', function () { wa(phone, 'Hi ' + s.name + ', '); }) : null,
          is('do') ? btn('Edit', function () { edit('STUDENTS', 'student', s, null, again); }) : null,
          is('do') ? btn('Add leave', function () { leaveForm(s); }) : null,
          is('d') ? btn('Delete', function () { del('STUDENTS', s.id, s.name); st.tab = 'students'; }, 'danger') : null])
      ]));
      if (L) {
        kids.push(card('Fees', [
          h('div', { class: 'summary' }, [h('span', null, [h('b', { text: rs(L.payable) }), 'total']), h('span', null, [h('b', { text: rs(L.paid) }), 'paid']), h('span', null, [h('b', { text: rs(L.balance) }), 'balance']),
            L.overdue ? h('span', null, [h('b', { text: rs(L.overdue), style: 'color:#c4141b' }), 'late by ' + L.daysOverdue + ' days']) : null]),
          h('div', { class: 'btns' }, [btn('Collect fee', function () { collect(s, L, again); }, 'primary'), btn(L.items.length ? 'Add fee plan' : 'Set fee plan', function () { feePlan(s, again); }),
            btn('Add one due', function () { form('Add a due for ' + s.name, [{ k: 'dueDate', l: 'Due date', t: 'date', req: 1 }, { k: 'amount', l: 'Amount (₹)', t: 'number', req: 1 }, { k: 'course', l: 'Course' }, { k: 'note', l: 'Note' }],
              { dueDate: st.boot.today, course: s.courses }, function (v) { v.studentId = s.id; return save('DUES', v).then(again); }); }),
            L.balance > 0 ? btn('Send reminder', function () { remind(ext({ studentId: s.id, name: s.name, phone: s.phone, parentPhone: s.parentPhone, courses: s.courses }, L)); }) : null]),
          L.items.length ? h('div', { class: 'stack tight' }, L.items.map(function (i) {
            return lrow(dt(i.dueDate) + ' · ' + rs(i.amount), [i.course, i.note].filter(Boolean).join(' · '),
              [pill(i.state === 'paid' ? 'Paid' : i.state === 'overdue' ? rs(i.balance) + ' late' : rs(i.balance) + ' due', i.state === 'paid' ? 'ok' : i.state === 'overdue' ? 'bad' : 'warn'),
                i.state !== 'paid' || is('d') ? h('button', { class: 'x', type: 'button', title: 'Remove this due', 'aria-label': 'Remove this due', text: '×', onclick: function () {
                  confirmBox('Remove the due of ' + rs(i.amount) + ' on ' + dt(i.dueDate) + '?', 'Remove', function () { api('remove', { table: 'DUES', id: i.id }).then(again, fail); }); } }) : null]);
          })) : empty('No fee plan yet. Set one to track instalments and reminders.'),
          d.payments.length ? h('h3', { text: 'Payments' }) : null,
          h('div', { class: 'stack tight' }, d.payments.map(function (p) {
            return lrow(rs(p.amount) + ' · ' + dt(p.date), [p.receiptNo, p.mode, p.collectedBy, p.note].filter(Boolean).join(' · '),
              [btn('Receipt', function () { receipt(s, p, L.balance); })]);
          }))
        ]));
      }
      var a = d.attendance;
      kids.push(card('Attendance · ' + G.MONTHS[Number(d.attendanceMonth.slice(5)) - 1], [a ? h('div', { class: 'summary' }, [
        h('span', null, [h('b', { text: a.pct === null ? '—' : a.pct + '%' }), 'attendance']), h('span', null, [h('b', { text: String(a.present) }), 'present']),
        h('span', null, [h('b', { text: String(a.absent) }), 'absent']), h('span', null, [h('b', { text: String(a.leave) }), 'leave']),
        a.streak >= 2 ? h('span', null, [h('b', { text: String(a.streak), style: 'color:#c4141b' }), 'days absent in a row']) : null]) : empty('Not found in this month’s attendance file.')]));
      if (d.leaves.length) kids.push(card('Leave', d.leaves.slice().reverse().map(function (l) { return lrow(dt(l.fromDate) + (l.toDate !== l.fromDate ? ' – ' + dt(l.toDate) : ''), l.reason, [pill(l.status, l.status === 'approved' ? 'ok' : l.status === 'rejected' ? 'bad' : 'warn')]); })));
      if (d.suggestions && d.suggestions.length) kids.push(card('Next course to suggest', d.suggestions.map(function (x) { return suggestionRow(s, x, again); })));
      return kids;
    });
  }

  /* ---------------- fees ---------------- */
  function collect(s, L, after) {
    var due = L && (L.overdue || (L.nextDue && L.nextDue.amount)) || '';
    form('Collect fee · ' + s.name, [{ k: 'amount', l: 'Amount received (₹)', t: 'number', req: 1 }, { k: 'mode', l: 'Paid by', t: 'select', req: 1, o: MODES }, { k: 'date', l: 'Date', t: 'date', req: 1 },
      { k: 'course', l: 'Course' }, { k: 'receiptNo', l: 'Receipt no.', hint: 'Leave empty for the next automatic number' }, { k: 'note', l: 'Note' }],
      { amount: due, mode: 'CASH', date: st.boot.today, course: (L && L.nextDue && L.nextDue.course) || s.courses }, function (v) {
        v.studentId = s.id || s.studentId;
        return api('pay', v).then(function (r) { st.students = null; receipt(s, r.payment, r.ledger.balance, r.receiptText); if (after) after(); });
      }, 'Save payment');
  }
  function receipt(s, p, balance, text) {
    text = text || fill(set('TPL_RECEIPT'), { receipt: p.receiptNo, centre: set('CENTRE_NAME'), amount: Number(p.amount), name: s.name, regNo: s.regNo, date: p.date, mode: p.mode, balance: balance });
    var ov = h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Receipt' }, [h('div', { class: 'card' }, [
      h('div', { class: 'receipt' }, [h('h2', { text: set('CENTRE_NAME') }), h('div', { class: 'hint', text: 'Fee receipt' }),
        h('dl', { class: 'kv' }, [['Receipt no.', p.receiptNo], ['Date', dt(p.date)], ['Student', s.name], ['Register no.', s.regNo], ['Course', p.course], ['Paid by', p.mode], ['Amount', rs(p.amount)], ['Balance', rs(balance)], ['Received by', p.collectedBy]]
          .filter(function (x) { return x[1] !== '' && x[1] !== undefined; }).reduce(function (a, x) { return a.concat([h('dt', { text: x[0] }), h('dd', { text: String(x[1]) })]); }, []))]),
      h('div', { class: 'btns noprint' }, [btn('Send on WhatsApp', function () { wa(s.phone || s.parentPhone, text); }, 'primary'), btn('Print', function () { window.print(); }), btn('Close', function () { ov.remove(); })])
    ])]);
    document.body.appendChild(ov);
  }
  function feePlan(s, after) {
    var taken = st.boot.courses.filter(function (c) { return String(s.courses).toUpperCase().indexOf(String(c.code).toUpperCase()) >= 0 && Number(c.fee) > 0; })[0];
    form('Fee plan · ' + s.name, [{ k: 'course', l: 'Course' }, { k: 'total', l: 'Total course fee (₹)', t: 'number', req: 1 }, { k: 'discount', l: 'Discount (₹)', t: 'number' },
      { k: 'down', l: 'First payment now (₹)', t: 'number' }, { k: 'count', l: 'Balance in how many instalments', t: 'number', req: 1 }, { k: 'firstDue', l: 'First instalment date', t: 'date', req: 1 },
      { k: 'gapMonths', l: 'Months between instalments', t: 'number' }, { k: 'replace', l: 'Existing dues for this course', t: 'select', req: 1, o: [['N', 'Keep them and add these'], ['Y', 'Replace them']] }],
      { course: taken ? taken.code : s.courses, total: taken ? taken.fee : '', count: 3, gapMonths: 1, firstDue: st.boot.today, replace: 'N' }, function (v) {
        v.studentId = s.id; v.replace = v.replace === 'Y';
        return api('feePlan', v).then(function (r) { G.toast(r.created + ' dues created'); st.students = null; if (after) after(); });
      }, 'Create plan');
  }
  function remind(d) {
    var late = d.overdue > 0, n = d.nextDue || {};
    var text = fill(set(late ? 'TPL_FEE_OVERDUE' : 'TPL_FEE_DUE'), { name: d.name, amount: late ? d.overdue : n.amount, date: dt(late ? d.overdueSince : n.date), course: n.course || d.courses, centre: set('CENTRE_NAME') });
    wa(d.phone || d.parentPhone, text);
    api('remind', { studentId: d.studentId, kind: 'fee', channel: 'whatsapp' }).then(function () { d.lastReminder = 'just now'; }, fail);
  }
  SCREENS.fees = function () {
    var view = st.feeView || 'dues';
    function tabs() {
      return h('div', { class: 'tabs', role: 'tablist' }, [['dues', 'Pending'], ['today', 'Today'], ['month', 'This month']].map(function (t) {
        return h('button', { class: 'tab text', role: 'tab', 'aria-selected': view === t[0] ? 'true' : 'false', text: t[1], onclick: function () { st.feeView = t[0]; go('fees'); } });
      }));
    }
    if (view === 'dues') return screen('Fees', 'Who owes what, oldest first', [btn('Refresh', reload)], function () { return api('dues'); }, function (r) {
      var late = r.dues.filter(function (d) { return d.overdue > 0; }), soon = r.dues.filter(function (d) { return !(d.overdue > 0); });
      function row(d) {
        var n = d.nextDue || {};
        return h('div', { class: 'lrow col' }, [
          h('div', { class: 'lhead' }, [h('div', { class: 'lmain' }, [h('div', { class: 'nm', text: d.name }),
            h('div', { class: 'meta', text: [d.regNo, d.batch ? 'Batch ' + d.batch : '', d.lastReminder ? 'reminded ' + (d.lastReminder.length > 10 ? dt(d.lastReminder.slice(0, 10)) : d.lastReminder) : 'not reminded yet'].filter(Boolean).join(' · ') })]),
            h('div', { class: 'lright' }, [d.overdue > 0 ? pill(rs(d.overdue) + ' · ' + d.daysOverdue + ' d late', 'bad') : pill(rs(n.amount) + ' on ' + dt(n.date), 'warn')])]),
          h('div', { class: 'btns' }, [btn('Remind on WhatsApp', function () { remind(d); }), callLink(d.phone || d.parentPhone), btn('Collect', function () { collect(d, d, reload); }, 'primary'),
            btn('Open', function () { studentDetail(d.studentId); })])
        ]);
      }
      var total = r.dues.reduce(function (a, d) { return a + d.balance; }, 0), lateSum = late.reduce(function (a, d) { return a + d.overdue; }, 0);
      return [tabs(), h('div', { class: 'summary' }, [h('span', null, [h('b', { text: rs(lateSum) }), 'late from ' + late.length]), h('span', null, [h('b', { text: rs(total) }), 'pending in all'])]),
        late.length ? h('h3', { text: 'Late' }) : null].concat(late.map(row), [soon.length ? h('h3', { text: 'Coming up' }) : null], soon.map(row),
        [r.dues.length ? null : empty('Nobody has a pending fee. Fee plans are set from each student’s page.')]);
    });
    var today = st.boot.today, range = view === 'today' ? { from: today, to: today } : { from: today.slice(0, 8) + '01', to: today };
    screen('Fees', view === 'today' ? 'Collected today' : 'Collected this month', [btn('Refresh', reload)], function () { return api('collections', range); }, function (c) {
      var tsv = c.payments.map(function (p) { return [p.date.split('-').reverse().join('-'), 'FEE', p.name, p.course, p.mode, p.receiptNo, p.amount].join('\t'); }).join('\n');
      return [tabs(), h('div', { class: 'summary' }, [h('span', null, [h('b', { text: rs(c.total) }), 'total'])].concat(Object.keys(c.byMode).map(function (m) { return h('span', null, [h('b', { text: rs(c.byMode[m]) }), m]); }))),
        c.payments.length ? h('div', { class: 'btns' }, [btn('Copy rows for the daybook', function () {
          (navigator.clipboard ? navigator.clipboard.writeText(tsv) : Promise.reject()).then(function () { G.toast('Copied. Paste into the daybook at the DATE column.'); }, function () { G.toast('Copy is blocked on this device'); });
        })]) : null,
        h('div', { class: 'stack tight' }, c.payments.map(function (p) { return lrow(p.name + ' · ' + rs(p.amount), [dt(p.date), p.receiptNo, p.mode, p.course, p.collectedBy].filter(Boolean).join(' · ')); })),
        c.payments.length ? null : empty('No payments recorded in this period.')];
    });
  };

  /* ---------------- attendance ---------------- */
  SCREENS.attendance = function () {
    screen('Attendance', 'From this month’s attendance sheet', [btn('Refresh', reload)], function () { return api('attendance'); }, function (r) {
      if (r.error) return [h('p', { class: 'hint', role: 'alert', text: r.error }), empty('Check ATTENDANCE_FILE_PATTERN in More › Settings, and that the account that runs the server can open the file.')];
      function row(x) {
        var kids = [pill(x.pct === null ? 'no marks' : x.pct + '%', x.pct !== null && x.pct < r.lowPct ? 'warn' : 'ok')];
        if (x.streak >= r.streakDays) kids.unshift(pill(x.streak + ' days absent', 'bad'));
        var el = lrow(x.name, [x.regNo, x.batch ? 'Batch ' + x.batch : '', x.present + ' present', x.absent + ' absent', x.leave ? x.leave + ' leave' : ''].filter(Boolean).join(' · '), kids, x.studentId ? function () { studentDetail(x.studentId); } : null);
        if (!x.flag || !is('do')) return el;
        return h('div', { class: 'lrow col' }, [el, h('div', { class: 'btns' }, [btn('WhatsApp parent', function () {
          wa(x.parentPhone || x.phone, fill(set('TPL_ABSENT'), { name: x.name, days: x.streak || x.absent, centre: set('CENTRE_NAME') }));
        }), callLink(x.parentPhone || x.phone)])]);
      }
      var flagged = r.rows.filter(function (x) { return x.flag; }).sort(function (a, b) { return b.streak - a.streak; });
      var rest = r.rows.filter(function (x) { return !x.flag; }).sort(function (a, b) { return (a.pct === null ? 101 : a.pct) - (b.pct === null ? 101 : b.pct); });
      return [h('div', { class: 'summary' }, [h('span', null, [h('b', { text: String(r.heldDays) }), 'class days so far']), h('span', null, [h('b', { text: String(flagged.length) }), 'need a call']), h('span', null, [h('b', { text: String(r.rows.length) }), 'on the sheet'])]),
        flagged.length ? h('h3', { text: 'Needs a call (absent ' + r.streakDays + '+ days in a row, or below ' + r.lowPct + '%)' }) : null].concat(flagged.map(row), [h('h3', { text: 'Everyone else' })], rest.map(row));
    });
  };

  /* ---------------- leaves ---------------- */
  function leaveForm(student, self) {
    var staff = !student && (self || !is('do'));
    var fields = [{ k: 'fromDate', l: 'From', t: 'date', req: 1 }, { k: 'toDate', l: 'To (same day if empty)', t: 'date' }, { k: 'reason', l: 'Reason', t: 'textarea', req: 1 }];
    function open(list) {
      if (!student && !staff) fields.unshift({ k: 'who', l: 'Who is on leave', t: 'select', req: 1, o: [['staff:', 'Me (' + st.boot.me.name + ')']].concat(
        is('d') ? st.boot.staff.filter(function (x) { return x.name !== st.boot.me.name; }).map(function (x) { return ['staff:' + x.id, 'Staff · ' + x.name]; }) : [],
        list.filter(function (x) { return x.status === 'active'; }).map(function (x) { return ['student:' + x.id, x.name + (x.regNo ? ' · ' + x.regNo : '')]; })) });
      form(student ? 'Leave for ' + student.name : staff ? 'Apply for leave' : 'Record a leave', fields, { fromDate: st.boot.today }, function (v) {
        var who = student ? 'student:' + student.id : staff ? 'staff:' : v.who, p = who.split(':');
        return api('leaveApply', { type: p[0], personId: p[1], fromDate: v.fromDate, toDate: v.toDate, reason: v.reason }).then(function () { G.toast('Leave recorded'); go(st.tab === 'leaves' ? 'leaves' : st.tab); });
      });
    }
    if (student || staff) open([]); else students().then(open, fail);
  }
  SCREENS.leaves = function () {
    screen('Leaves', '', [btn(is('do') ? 'Record a leave' : 'Apply for leave', function () { leaveForm(); }, 'primary')], function () { return api('list', { table: 'LEAVES' }); }, function (r) {
      var all = r.rows.slice().reverse();
      if (role() === 'tutor') all = all.filter(function (l) { return l.type === 'student' || l.personName === st.boot.me.name; });
      function row(l) {
        var canDecide = l.status === 'pending' && (l.type === 'student' ? is('do') : is('d'));
        var days = dt(l.fromDate) + (l.toDate !== l.fromDate ? ' – ' + dt(l.toDate) : '');
        var head = lrow(l.personName + ' · ' + days, [l.type === 'staff' ? 'Staff' : l.batch ? 'Batch ' + l.batch : 'Student', l.reason, l.decidedBy ? l.status + ' by ' + l.decidedBy : 'asked by ' + l.requestedBy].filter(Boolean).join(' · '),
          [pill(l.status, l.status === 'approved' ? 'ok' : l.status === 'rejected' ? 'bad' : 'warn')]);
        if (!canDecide) return head;
        function decide(s) { api('leaveDecide', { id: l.id, status: s }).then(function (x) { G.toast('Leave ' + s + (x.attendanceCellsMarked ? ' · ' + x.attendanceCellsMarked + ' days marked L in the attendance sheet' : '')); reload(); }, fail); }
        return h('div', { class: 'lrow col' }, [head, h('div', { class: 'btns' }, [btn('Approve', function () { decide('approved'); }, 'primary'), btn('Reject', function () { decide('rejected'); }, 'danger')])]);
      }
      var pend = all.filter(function (l) { return l.status === 'pending'; }), today = st.boot.today;
      var now = all.filter(function (l) { return l.status === 'approved' && l.fromDate <= today && l.toDate >= today; });
      var rest = all.filter(function (l) { return l.status !== 'pending' && now.indexOf(l) < 0; }).slice(0, 60);
      return [pend.length ? h('h3', { text: 'Waiting for a decision' }) : null].concat(pend.map(row), [now.length ? h('h3', { text: 'On leave today' }) : null], now.map(row), [rest.length ? h('h3', { text: 'Earlier' }) : null], rest.map(row),
        [all.length ? null : empty('No leave recorded yet. Students can apply from the Student screen of this app.')]);
    });
  };

  /* ---------------- batches ---------------- */
  SCREENS.batches = function () {
    screen('Batches', '', is('do') ? [btn('New batch', function () { edit('BATCHES', 'batch', null, { active: 'Y' }); }, 'primary')] : [], function () { return students(); }, function (list) {
      return st.boot.batches.map(function (b) {
        var mine = list.filter(function (s) { return s.status === 'active' && String(s.batch).split(/[,\s]+/).indexOf(String(b.id)) >= 0; });
        var cap = Number(b.capacity) || 0, pct = cap ? Math.min(100, Math.round(mine.length * 100 / cap)) : 0;
        var box = h('div', { class: 'stack tight', hidden: 'hidden' }, mine.map(function (s) { return lrow(s.name, [s.regNo, s.courses, s.computer].filter(Boolean).join(' · '), null, function () { studentDetail(s.id); }); }));
        return card('Batch ' + b.id + ' · ' + G.fmt12(b.start) + ' – ' + G.fmt12(b.end), [
          h('div', { class: 'meta', text: [b.faculty ? 'Faculty: ' + b.faculty : 'No faculty set', b.room, String(b.active).toUpperCase() === 'N' ? 'Not running' : ''].filter(Boolean).join(' · ') }),
          h('div', { class: 'summary' }, [h('span', null, [h('b', { text: String(mine.length) }), 'students']), cap ? h('span', null, [h('b', { text: String(Math.max(0, cap - mine.length)) }), 'seats free of ' + cap]) : null]),
          cap ? h('div', { class: 'bar' + (mine.length > cap ? ' over' : ''), role: 'img', 'aria-label': pct + '% full' }, [h('i', { style: 'width:' + pct + '%' })]) : null,
          h('div', { class: 'btns' }, [mine.length ? btn('Show students', function (e) { box.hidden = !box.hidden; e.target.textContent = box.hidden ? 'Show students' : 'Hide students'; }) : null,
            is('do') ? btn('Edit', function () { edit('BATCHES', 'batch', b); }) : null, is('d') ? btn('Delete', function () { del('BATCHES', b.id, 'batch ' + b.id); }, 'danger') : null]), box
        ]);
      }).concat(st.boot.batches.length ? [] : [empty('No batches yet.')]);
    });
  };

  /* ---------------- computers ---------------- */
  SCREENS.computers = function () {
    var batch = st.pcBatch || '';
    screen('Computers', 'Lab systems, who sits where, and faults', is('do') ? [btn('New computer', function () { edit('COMPUTERS', 'computer', null, { status: 'working' }); }, 'primary')] : [], function () {
      return Promise.all([api('list', { table: 'COMPUTERS' }), api('list', { table: 'ISSUES' }), students()]);
    }, function (r) {
      var pcs = r[0].rows, issues = r[1].rows, list = r[2].filter(function (s) { return s.status === 'active' && s.computer; });
      var bsel = h('select', { 'aria-label': 'Show seats for batch', onchange: function () { st.pcBatch = bsel.value; go('computers'); } }, [h('option', { value: '', text: 'Seats: all batches' })].concat(
        st.boot.batches.map(function (b) { return h('option', { value: b.id, selected: batch === b.id ? 'selected' : null, text: 'Seats: batch ' + b.id }); })));
      var labs = {}; pcs.forEach(function (p) { (labs[p.lab || 'Lab'] = labs[p.lab || 'Lab'] || []).push(p); });
      var down = pcs.filter(function (p) { return p.status !== 'working'; }).length, open = issues.filter(function (i) { return i.status !== 'resolved'; });
      function occupants(p) { return list.filter(function (s) { return s.computer === p.label && (!batch || String(s.batch).split(/[,\s]+/).indexOf(batch) >= 0); }); }
      function detail(p) {
        var mine = issues.filter(function (i) { return i.computerId === p.id; }).reverse(), occ = list.filter(function (s) { return s.computer === p.label; });
        var ov = h('div', { class: 'overlay', role: 'dialog', 'aria-label': p.label }, [h('div', { class: 'card formcard' }, [h('h2', { text: p.label }),
          h('dl', { class: 'kv' }, [['Lab', p.lab], ['Status', p.status], ['Processor', p.cpu], ['RAM', p.ram], ['Storage', p.storage], ['OS', p.os], ['Software', p.software], ['Notes', p.notes]].filter(function (x) { return x[1]; })
            .reduce(function (a, x) { return a.concat([h('dt', { text: x[0] }), h('dd', { text: x[1] })]); }, [])),
          h('h3', { text: 'Who sits here' }), occ.length ? h('div', { class: 'stack tight' }, occ.map(function (s) { return lrow(s.name, 'Batch ' + s.batch); })) : empty('Nobody is assigned. Set the computer on a student’s page.'),
          h('h3', { text: 'Faults' }), mine.length ? h('div', { class: 'stack tight' }, mine.map(function (i) {
            return lrow(i.problem, [dt(i.date), i.reportedBy, i.resolution, i.cost ? rs(i.cost) : ''].filter(Boolean).join(' · '), i.status === 'resolved' ? [pill('fixed ' + dt(i.resolvedDate), 'ok')] :
              [is('do') ? btn('Fixed', function () { ov.remove(); form('Mark as fixed', [{ k: 'resolution', l: 'What was done', req: 1 }, { k: 'cost', l: 'Cost (₹)', t: 'number' }], {}, function (v) { v.id = i.id; v.status = 'resolved'; return save('ISSUES', v).then(reload); }); }) : pill('open', 'bad')]);
          })) : empty('No faults reported.'),
          h('div', { class: 'btns' }, [btn('Report a fault', function () { ov.remove(); form('Fault on ' + p.label, [{ k: 'problem', l: 'What is wrong', t: 'textarea', req: 1 }], {}, function (v) { v.computerId = p.id; return save('ISSUES', v).then(function () { G.toast('Fault reported'); reload(); }); }); }, 'primary'),
            is('do') ? btn('Edit', function () { ov.remove(); edit('COMPUTERS', 'computer', p); }) : null, is('d') ? btn('Delete', function () { ov.remove(); del('COMPUTERS', p.id, p.label); }, 'danger') : null, btn('Close', function () { ov.remove(); })])])]);
        document.body.appendChild(ov);
      }
      return [h('div', { class: 'filters' }, [bsel]),
        h('div', { class: 'summary' }, [h('span', null, [h('b', { text: String(pcs.length - down) }), 'working']), h('span', null, [h('b', { text: String(down) }), 'not working']), h('span', null, [h('b', { text: String(open.length) }), 'open faults'])])
      ].concat(Object.keys(labs).sort().map(function (lab) {
        return card(lab, [h('div', { class: 'pcs' }, labs[lab].sort(function (a, b) { return a.label < b.label ? -1 : 1; }).map(function (p) {
          var occ = occupants(p), bad = p.status !== 'working', faults = open.filter(function (i) { return i.computerId === p.id; }).length;
          return h('button', { class: 'pc ' + (bad ? 'bad' : occ.length ? 'used' : 'free'), type: 'button', onclick: function () { detail(p); } }, [h('b', { text: p.label }),
            h('span', { text: bad ? p.status : occ.length ? (batch && occ.length > 1 ? 'CLASH: ' : '') + occ.map(function (s) { return s.name.split(' ')[0]; }).slice(0, 3).join(', ') + (occ.length > 3 ? ' +' + (occ.length - 3) : '') : 'free' }),
            faults ? h('span', { class: 'flt', text: faults + ' fault' + (faults > 1 ? 's' : '') }) : null]);
        }))]);
      }), [pcs.length ? null : empty('No computers yet. Add each lab system once; then assign students to them and log faults here.')]);
    });
  };

  /* ---------------- upgrades ---------------- */
  function suggestionRow(s, x, after) {
    var sel = h('select', { 'aria-label': 'Status for ' + x.code, onchange: function () {
      api('upsellSet', { studentId: s.studentId || s.id, course: x.code, status: sel.value }).then(function () { x.status = sel.value; G.toast('Saved'); }, fail);
    } }, [['new', 'Not told yet'], ['pitched', 'Told'], ['interested', 'Interested'], ['converted', 'Joined'], ['declined', 'Not interested']].map(function (o) { return h('option', { value: o[0], selected: x.status === o[0] ? 'selected' : null, text: o[1] }); }));
    return h('div', { class: 'lrow col' }, [
      h('div', { class: 'lmain' }, [h('div', { class: 'nm', text: x.name + (x.name !== x.code ? ' (' + x.code + ')' : '') }),
        h('div', { class: 'meta', text: [x.because ? 'because of ' + x.because : '', x.durationMonths ? x.durationMonths + ' months' : '', x.fee ? rs(x.fee) : '', x.pitch].filter(Boolean).join(' · ') })]),
      h('div', { class: 'btns' }, [btn('Suggest on WhatsApp', function () {
        wa(s.phone, fill(set('TPL_UPGRADE'), { name: s.name, current: x.because || s.courses, course: x.name, pitch: x.pitch, centre: set('CENTRE_NAME') }));
        if (x.status === 'new') api('upsellSet', { studentId: s.studentId || s.id, course: x.code, status: 'pitched' }).then(function () { x.status = sel.value = 'pitched'; }, fail);
      }), sel])
    ]);
  }
  SCREENS.upgrades = function () {
    screen('Upgrades', 'The next course to offer each student', [btn('Refresh', reload)], function () { return api('suggestions'); }, function (r) {
      var hot = r.suggestions.filter(function (s) { return s.suggestions.some(function (x) { return x.status === 'interested'; }); });
      var ready = r.suggestions.filter(function (s) { return s.ready && hot.indexOf(s) < 0; }), rest = r.suggestions.filter(function (s) { return !s.ready && hot.indexOf(s) < 0; });
      function block(s) {
        return card(s.name, [h('div', { class: 'meta', text: [s.regNo, 'has ' + (s.courses || 'no course noted'), s.batch ? 'Batch ' + s.batch : ''].filter(Boolean).join(' · ') })].concat(
          s.suggestions.filter(function (x) { return x.status !== 'converted' && x.status !== 'declined'; }).slice(0, 3).map(function (x) { return suggestionRow(s, x); })), s.ready ? pill(s.ready, 'ok') : null);
      }
      return [hot.length ? h('h3', { text: 'Said they are interested' }) : null].concat(hot.map(block), [ready.length ? h('h3', { text: 'Good time to ask' }) : null], ready.map(block),
        [rest.length ? h('h3', { text: 'Everyone else' }) : null], rest.slice(0, 80).map(block),
        [r.suggestions.length ? null : empty('No suggestions yet. They come from each student’s Course(s) and the upgrade paths in More.')]);
    });
  };

  /* ---------------- enquiries ---------------- */
  SCREENS.enquiries = function () {
    screen('Enquiries', 'Follow-ups first', [btn('New enquiry', function () { edit('ENQUIRIES', 'enquiry', null, { status: 'new', nextFollowUp: st.boot.today, assignedTo: st.boot.me.name }); }, 'primary')], function () { return api('list', { table: 'ENQUIRIES' }); }, function (r) {
      var today = st.boot.today, open = r.rows.filter(function (e) { return e.status !== 'admitted' && e.status !== 'lost'; });
      var due = open.filter(function (e) { return e.nextFollowUp && e.nextFollowUp <= today; }).sort(function (a, b) { return a.nextFollowUp < b.nextFollowUp ? -1 : 1; });
      var later = open.filter(function (e) { return due.indexOf(e) < 0; }).reverse(), closed = r.rows.filter(function (e) { return open.indexOf(e) < 0; }).reverse().slice(0, 30);
      function row(e) {
        var isOpen = open.indexOf(e) >= 0;
        return h('div', { class: 'lrow col' }, [
          h('div', { class: 'lhead' }, [h('div', { class: 'lmain' }, [h('div', { class: 'nm', text: e.name }), h('div', { class: 'meta', text: [e.course, e.source, e.assignedTo, e.notes].filter(Boolean).join(' · ') })]),
            h('div', { class: 'lright' }, [pill(e.status, e.status === 'admitted' ? 'ok' : e.status === 'lost' ? 'bad' : 'info'), isOpen && e.nextFollowUp ? pill(e.nextFollowUp <= today ? 'due ' + dt(e.nextFollowUp) : dt(e.nextFollowUp), e.nextFollowUp <= today ? 'bad' : 'warn') : null])]),
          h('div', { class: 'btns' }, [btn('WhatsApp', function () { wa(e.phone, fill(set('TPL_ENQUIRY'), { name: e.name, course: e.course || 'our courses', centre: set('CENTRE_NAME') })); }), callLink(e.phone), btn('Edit', function () { edit('ENQUIRIES', 'enquiry', e); }),
            isOpen ? btn('Admit', function () {
              edit('STUDENTS', 'student', null, { name: e.name, phone: e.phone, courses: e.course, status: 'active', joinDate: today }, function () {
                return save('ENQUIRIES', { id: e.id, status: 'admitted', nextFollowUp: '' }).then(function () { st.students = null; G.toast('Admitted. Set the fee plan from the student page.'); go('students'); });
              });
            }, 'primary') : null, is('d') ? btn('Delete', function () { del('ENQUIRIES', e.id, 'this enquiry'); }, 'danger') : null])
        ]);
      }
      return [due.length ? h('h3', { text: 'Follow up today (' + due.length + ')' }) : null].concat(due.map(row), [later.length ? h('h3', { text: 'Open' }) : null], later.map(row), [closed.length ? h('h3', { text: 'Closed' }) : null], closed.map(row),
        [r.rows.length ? null : empty('No enquiries yet. Add every walk-in, call and ad lead here so no follow-up is missed.')]);
    });
  };

  /* ---------------- more ---------------- */
  function listScreen(table, title, sub, text) {
    st.seq++;
    screen(title, sub, [btn('Back', function () { go('more'); }), btn('Add', function () { edit(table, title.toLowerCase().replace(/s$/, ''), null, { active: 'Y' }, function () { return api('bootstrap').then(function (b) { st.boot = b; listScreen(table, title, sub, text); }); }); }, 'primary')],
      function () { return api('list', { table: table }); }, function (r) {
        function back() { return api('bootstrap').then(function (b) { st.boot = b; listScreen(table, title, sub, text); }); }
        return r.rows.map(function (x) {
          var t = text(x);
          return lrow(t[0], t[1], [btn('Edit', function () { edit(table, title.toLowerCase().replace(/s$/, ''), x, null, back); }),
            h('button', { class: 'x', type: 'button', 'aria-label': 'Delete', title: 'Delete', text: '×', onclick: function () { confirmBox('Delete ' + t[0] + '?', 'Delete', function () { api('remove', { table: table, id: x.id }).then(back, fail); }); } })]);
        }).concat(r.rows.length ? [] : [empty('Nothing here yet.')]);
      });
  }
  function settingsScreen() {
    st.seq++;
    screen('Settings', 'Stored in the SETTINGS tab of the data sheet', [btn('Back', function () { go('more'); })], function () { return api('settings'); }, function (r) {
      return r.settings.map(function (x) {
        return lrow(x.key, (x.value === '' ? '(empty)' : x.value) + (x.notes ? ' — ' + x.notes : ''), [btn('Change', function () {
          form(x.key, [{ k: 'value', l: x.notes || x.key, t: /^TPL_/.test(x.key) ? 'textarea' : 'text' }], { value: x.value }, function (v) {
            return api('setSetting', { key: x.key, value: v.value }).then(function () { return api('bootstrap'); }).then(function (b) { st.boot = b; settingsScreen(); });
          });
        })]);
      });
    });
  }
  SCREENS.more = function () {
    screen('More', 'Signed in as ' + st.boot.me.name + ' (' + st.boot.me.role + ')', [], null, function () {
      function item(title, text, fn) { return h('button', { type: 'button', onclick: fn }, [h('b', { text: title }), h('span', { text: text })]); }
      return [h('div', { class: 'modes' }, [
        is('d') ? item('Courses', 'The course list with fees and durations. Used for fee plans and suggestions.', function () {
          listScreen('COURSES', 'Courses', 'Correct the names and fill in the fees', function (c) { return [c.code + (c.name !== c.code ? ' · ' + c.name : ''), [c.category, c.durationMonths ? c.durationMonths + ' months' : '', c.fee ? rs(c.fee) : 'fee not set', String(c.active).toUpperCase() === 'N' ? 'not offered' : ''].filter(Boolean).join(' · ')]; });
        }) : null,
        is('d') ? item('Upgrade paths', 'Which course to suggest after which. Drives the Upgrades screen and the student app.', function () {
          listScreen('UPGRADES', 'Upgrade paths', 'After the first course, suggest the second', function (u) { return [(u.fromCode === '*' ? 'Any course' : u.fromCode) + ' → ' + u.toCode, u.pitch]; });
        }) : null,
        is('d') ? item('Staff logins', 'Names, PINs and roles for this Centre Manager.', function () {
          listScreen('STAFF', 'Staff logins', 'Director sees everything; front office cannot change settings; tutors never see fees', function (s) { return [s.name, [s.role, s.phone, String(s.active).toUpperCase() === 'N' ? 'sign-in off' : ''].filter(Boolean).join(' · ')]; });
        }) : null,
        is('d') ? item('Settings and message texts', 'Centre phone, UPI ID, monthly target, attendance limits and the WhatsApp message wording.', settingsScreen) : null,
        is('do') ? item('Pull students from the attendance file', 'Adds anyone on this month’s attendance sheet who is not in the student list yet.', function () {
          api('syncStudents').then(function (p) {
            if (!p.missing.length) return G.toast('Everyone on the sheet (' + p.found + ') is already in the list.', 4000);
            confirmBox('Add ' + p.missing.length + ' students from "' + p.file + '"? First few: ' + p.missing.slice(0, 5).map(function (m) { return m.name; }).join(', ') + '.', 'Add them', function () {
              api('syncStudents', { apply: true }).then(function (a) { st.students = null; G.toast(a.added + ' students added'); go('students'); }, fail);
            });
          }, fail);
        }) : null,
        is('d') ? item('Preview today’s digest', 'The summary that is mailed to ALERT_EMAIL every morning.', function () {
          api('digestNow').then(function (r) { var ov = h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Digest' }, [h('div', { class: 'card formcard' }, [h('pre', { class: 'digest', text: r.text }), h('div', { class: 'btns' }, [btn('Close', function () { ov.remove(); })])])]); document.body.appendChild(ov); }, fail);
        }) : null,
        item('Apply for my own leave', 'Goes to the director for approval.', function () { leaveForm(null, true); }),
        item('Switch screen', 'TV display, tutor marking, director or student view.', G.openSettings),
        item('Sign out', 'Use on a shared phone or PC.', signOut)
      ]), empty('Centre Manager ' + G.VERSION + ' · server ' + st.boot.version)];
    });
  };
})();
