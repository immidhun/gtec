/* Tutor phone screen: sign in with name + PIN, pick a batch, tap Present / Leave for today. */
(function () {
  'use strict';
  var G = window.GTEC_APP, h = G.h;
  var T = window.GTEC_TUTOR = {};
  var st = { me: null, data: null, batch: null, busy: {} };

  T.start = function () {
    document.body.className = 'phone';
    st.me = G.store.get('tutor', null);
    if (st.me) load(); else login();
  };

  function root() { var r = document.getElementById('app'); r.innerHTML = ''; r.appendChild(G.phonebar('Tutor')); return r; }

  function login(msg) {
    var name = h('input', { id: 't-name', autocomplete: 'username', placeholder: 'Your name as given to the director' });
    var pin = h('input', { id: 't-pin', type: 'password', inputmode: 'numeric', autocomplete: 'current-password', placeholder: '4–6 digit PIN' });
    var err = h('p', { class: 'hint', role: 'alert', text: msg || (G.demo ? 'Demo: the name and PIN are filled in. Just tap Sign in.' : '') });
    if (G.demo) { name.value = 'Anjali'; pin.value = '1234'; }
    var form = h('form', { class: 'card', onsubmit: function (e) {
      e.preventDefault();
      st.me = { name: name.value.trim(), pin: pin.value.trim() };
      err.textContent = 'Signing in…';
      load(function (e2) { st.me = null; err.textContent = e2.message; });
    } }, [
      h('h2', { text: 'Tutor sign-in' }),
      h('label', { class: 'field' }, ['Name', name]),
      h('label', { class: 'field' }, ['PIN', pin]),
      err,
      h('div', { class: 'btns' }, [h('button', { class: 'btn primary', type: 'submit', text: 'Sign in' }), h('button', { class: 'btn', type: 'button', text: 'Settings', onclick: G.openSettings })])
    ]);
    root().appendChild(h('div', { class: 'phone-wrap' }, [form]));
  }

  function load(onFail) {
    G.apiPost({ action: 'tutorRoster', name: st.me.name, pin: st.me.pin }).then(function (d) {
      G.store.set('tutor', st.me);
      st.data = d;
      if (!st.batch || !d.batches.some(function (b) { return b.id === st.batch; })) st.batch = pickBatch(d.batches);
      render();
    }, function (e) {
      if (onFail) return onFail(e);
      if (/PIN|name/i.test(e.message)) { G.store.del('tutor'); return login(e.message); }
      G.toast(e.message, 4000);
      if (!st.data) login(e.message);
    });
  }

  /** The batch that is running now, or the next one, or the first. */
  function pickBatch(bs) {
    var m = G.ist(G.now()).min, best = bs[0];
    for (var i = 0; i < bs.length; i++) { if (G.toMin(bs[i].end) > m) { best = bs[i]; break; } }
    return best ? best.id : null;
  }

  function render() {
    var d = st.data, b = d.batches.filter(function (x) { return x.id === st.batch; })[0];
    var r = root();
    var p = 0, l = 0;
    if (b) b.students.forEach(function (s) { if (s.status === 'P') p++; if (s.status === 'L') l++; });
    r.appendChild(h('div', { class: 'phone-wrap' }, [
      h('div', { class: 'phone-head' }, [
        h('div', null, [h('h1', { text: 'Attendance' }), h('div', { class: 'sub', text: d.tutor + ' · ' + niceDate(d.date) + ' · today only' })]),
        h('div', { class: 'btns' }, [
          h('button', { class: 'btn', text: 'Refresh', onclick: function () { load(); } }),
          h('button', { class: 'btn', text: 'Sign out', onclick: function () { G.store.del('tutor'); st.me = null; login(); } })
        ])
      ]),
      d.canMark ? null : h('p', { class: 'hint', role: 'alert', text: 'Today has no column in this month’s attendance sheet, so marks cannot be saved. Tell the director.' }),
      h('div', { class: 'tabs', role: 'tablist' }, d.batches.map(function (x) {
        return h('button', { class: 'tab', role: 'tab', 'aria-selected': x.id === st.batch ? 'true' : 'false', onclick: function () { st.batch = x.id; render(); } },
          [h('b', { text: x.id }), h('small', { text: G.fmt12(x.start) })]);
      })),
      b ? h('div', { class: 'summary' }, [
        h('span', null, [h('b', { text: String(p) }), 'present']),
        h('span', null, [h('b', { text: String(l) }), 'on leave']),
        h('span', null, [h('b', { text: String(b.students.length - p - l) }), 'not marked'])
      ]) : null,
      b ? h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, b.students.map(row)) : h('p', { class: 'hint', text: 'No batches are assigned to you.' }),
      h('p', { class: 'hint', text: 'Each tap saves straight to the attendance sheet and the TV board. Past days are locked.' })
    ]));
  }

  function row(s) {
    var k = s.regNo + '|' + s.name;
    function btn(code, label) {
      var on = (s.status || 'X') === code;
      return h('button', { class: code, 'aria-pressed': on ? 'true' : 'false', disabled: st.busy[k] ? 'disabled' : null,
        onclick: function () { mark(s, code === 'X' ? '' : code); } , text: label });
    }
    return h('div', { class: 'srow ' + (s.status || '') }, [
      h('div', { style: 'min-width:0' }, [h('div', { class: 'nm', text: s.name }), h('div', { class: 'meta', text: [s.regNo, s.course].filter(Boolean).join(' · ') })]),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Mark ' + s.name }, [btn('P', 'Present'), btn('L', 'Leave'), btn('X', '—')])
    ]);
  }

  function mark(s, status) {
    var k = s.regNo + '|' + s.name, before = s.status;
    if (before === status) return;
    s.status = status; st.busy[k] = true; render();
    G.apiPost({ action: 'mark', name: st.me.name, pin: st.me.pin, studentName: s.name, regNo: s.regNo, status: status, date: st.data.date })
      .then(function () { st.busy[k] = false; render(); },
            function (e) { s.status = before; st.busy[k] = false; render(); G.toast(e.message, 4500); });
  }

  function niceDate(ymd) { var p = ymd.split('-'); return Number(p[2]) + ' ' + G.MONTHS[Number(p[1]) - 1].slice(0, 3); }
})();
