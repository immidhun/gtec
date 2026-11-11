/* Student screen: sign in with register number + mobile, then see attendance, fees, leave and the next course to take. */
(function () {
  'use strict';
  var G = window.GTEC_APP, h = G.h;
  var S = window.GTEC_STUDENT = {};
  var st = { auth: null, data: null };

  function rs(n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
  function dt(ymd) { var p = String(ymd || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + G.MONTHS[Number(p[1]) - 1].slice(0, 3) + ' ' + p[0] : (ymd || ''); }
  function api(action, extra) { var b = { action: action, auth: st.auth }; Object.keys(extra || {}).forEach(function (k) { b[k] = extra[k]; }); return G.mApi(b); }
  function root() { var r = document.getElementById('app'); r.innerHTML = ''; r.appendChild(G.phonebar('')); var w = h('div', { class: 'phone-wrap' }); r.appendChild(w); return w; }
  function card(title, kids) { return h('div', { class: 'card' }, [h('h2', { text: title })].concat(kids)); }
  function stat(value, label, bad) { return h('span', null, [h('b', { text: value, style: bad ? 'color:#c4141b' : null }), label]); }

  S.start = function () {
    document.body.className = 'phone';
    st.auth = G.store.get('sAuth', null);
    if (st.auth) load(); else login();
  };

  function login(msg) {
    var reg = h('input', { id: 's-reg', inputmode: 'numeric', autocomplete: 'username', placeholder: 'On your ID card, e.g. 2051868' });
    var ph = h('input', { id: 's-phone', type: 'tel', autocomplete: 'tel', placeholder: 'The number you gave at admission' });
    var err = h('p', { class: 'hint', role: 'alert', text: msg || '' });
    root().appendChild(h('form', { class: 'card', onsubmit: function (e) {
      e.preventDefault();
      st.auth = { regNo: reg.value.trim(), phone: ph.value.trim() };
      err.textContent = 'Checking…';
      load(function (e2) { st.auth = null; err.textContent = e2.message; });
    } }, [h('h2', { text: 'Student sign-in' }), h('label', { class: 'field' }, ['Register number', reg]), h('label', { class: 'field' }, ['Mobile number', ph]), err,
      h('div', { class: 'btns' }, [h('button', { class: 'btn primary', type: 'submit', text: 'Sign in' })]),
      h('p', { class: 'hint', text: 'Cannot sign in? Ask the front office to check the mobile number saved for you.' })]));
  }

  function load(onFail) {
    api('me').then(function (d) { G.store.set('sAuth', st.auth); st.data = d; render(); }, function (e) {
      if (onFail) return onFail(e);
      if (/match|attempts/i.test(e.message)) { G.store.del('sAuth'); return login(e.message); }
      if (st.data) G.toast(e.message, 4000); else login(e.message);
    });
  }

  function render() {
    var d = st.data, s = d.student, L = d.ledger, a = d.attendance, w = root();
    var first = String(s.name).split(' ')[0], nice = first.charAt(0) + first.slice(1).toLowerCase();
    w.appendChild(h('div', { class: 'phone-head' }, [
      h('div', null, [h('h1', { text: 'Hi ' + nice }), h('div', { class: 'sub', text: [s.regNo, s.courses].filter(Boolean).join(' · ') })]),
      h('div', { class: 'btns' }, [h('button', { class: 'btn', type: 'button', text: 'Refresh', onclick: function () { load(); } }),
        h('button', { class: 'btn', type: 'button', text: 'Sign out', onclick: function () { G.store.del('sAuth'); st.auth = st.data = null; login(); } })])
    ]));

    w.appendChild(card('My class', d.batches.length ? d.batches.map(function (b) {
      return h('div', { class: 'lrow' }, [h('div', { class: 'lmain' }, [h('div', { class: 'nm', text: 'Batch ' + b.id + ' · ' + G.fmt12(b.start) + ' – ' + G.fmt12(b.end) }),
        h('div', { class: 'meta', text: [b.faculty ? 'Faculty: ' + b.faculty : '', b.room, s.computer ? 'Your computer: ' + s.computer : ''].filter(Boolean).join(' · ') })])]);
    }) : [h('p', { class: 'hint', text: 'Your batch is not set yet. Ask the front office.' })]));

    w.appendChild(card('Attendance · ' + G.MONTHS[Number(d.attendanceMonth.slice(5)) - 1], [a ? h('div', { class: 'summary' }, [
      stat(a.pct === null ? '—' : a.pct + '%', 'attendance', a.pct !== null && a.pct < 75), stat(String(a.present), 'present'), stat(String(a.absent), 'absent', a.absent > 0), stat(String(a.leave), 'leave')
    ]) : h('p', { class: 'hint', text: 'No attendance recorded for you this month yet.' }),
      a && a.pct !== null && a.pct < 75 ? h('p', { class: 'hint', text: 'You need 75% attendance. Try not to miss more classes this month.' }) : null]));

    var n = L.nextDue, upi = d.centre.upi && L.balance > 0 ? 'upi://pay?pa=' + encodeURIComponent(d.centre.upi) + '&pn=' + encodeURIComponent(d.centre.name) + '&am=' + (L.overdue || (n && n.amount) || L.balance) + '&cu=INR&tn=' + encodeURIComponent('Fee ' + s.regNo) : '';
    w.appendChild(card('Fees', [
      h('div', { class: 'summary' }, [stat(rs(L.payable), 'total'), stat(rs(L.paid), 'paid'), stat(rs(L.balance), 'balance'), L.overdue ? stat(rs(L.overdue), 'overdue', true) : null]),
      L.balance > 0 && n ? h('p', { class: 'hint', text: (L.overdue ? 'Please pay ' + rs(L.overdue) + ' now. It was due on ' + dt(L.overdueSince) + '.' : 'Next: ' + rs(n.amount) + ' by ' + dt(n.date) + '.') }) :
        h('p', { class: 'hint', text: L.payable ? 'Your fee is fully paid. Thank you.' : 'Your fee plan is not entered yet.' }),
      upi ? h('div', { class: 'btns' }, [h('a', { class: 'btn primary', href: upi, text: 'Pay by UPI' })]) : null,
      upi ? h('p', { class: 'hint', text: 'After paying, show the payment screen at the front office to get your receipt.' }) : null,
      d.payments.length ? h('h3', { text: 'Payments' }) : null
    ].concat(d.payments.map(function (p) {
      return h('div', { class: 'lrow' }, [h('div', { class: 'lmain' }, [h('div', { class: 'nm', text: rs(p.amount) + ' · ' + dt(p.date) }), h('div', { class: 'meta', text: [p.receiptNo, p.mode].filter(Boolean).join(' · ') })])]);
    }))));

    var from = h('input', { id: 'l-from', type: 'date', value: d.today, min: d.today }), to = h('input', { id: 'l-to', type: 'date', min: d.today });
    var why = h('textarea', { id: 'l-why', rows: '2', maxlength: '300', placeholder: 'e.g. Fever, family function' }), lerr = h('p', { class: 'hint', role: 'alert' });
    w.appendChild(card('Leave', [
      h('form', { class: 'stack tight', onsubmit: function (e) {
        e.preventDefault(); lerr.textContent = 'Sending…';
        api('leaveApply', { fromDate: from.value, toDate: to.value, reason: why.value }).then(function () { G.toast('Leave request sent to the office'); load(); }, function (e2) { lerr.textContent = e2.message; });
      } }, [h('div', { class: 'fgrid' }, [h('label', { class: 'field' }, ['From', from]), h('label', { class: 'field' }, ['To (leave empty for one day)', to]), h('label', { class: 'field wide' }, ['Reason', why])]), lerr,
        h('div', { class: 'btns' }, [h('button', { class: 'btn primary', type: 'submit', text: 'Apply for leave' })])])
    ].concat(d.leaves.slice(0, 6).map(function (l) {
      return h('div', { class: 'lrow' }, [h('div', { class: 'lmain' }, [h('div', { class: 'nm', text: dt(l.fromDate) + (l.toDate !== l.fromDate ? ' – ' + dt(l.toDate) : '') }), h('div', { class: 'meta', text: l.reason })]),
        h('div', { class: 'lright' }, [h('span', { class: 'pill ' + (l.status === 'approved' ? 'ok' : l.status === 'rejected' ? 'bad' : 'warn'), text: l.status })])]);
    }))));

    var sug = d.suggestions.filter(function (x) { return x.status !== 'converted' && x.status !== 'declined'; }).slice(0, 4);
    if (sug.length) w.appendChild(card('Your next course', [h('p', { class: 'hint', text: 'Picked for you based on what you are learning now.' })].concat(sug.map(function (x) {
      var asked = x.status === 'interested';
      return h('div', { class: 'lrow col' }, [h('div', { class: 'lmain' }, [h('div', { class: 'nm', text: x.name }), h('div', { class: 'meta', text: [x.durationMonths ? x.durationMonths + ' months' : '', x.pitch].filter(Boolean).join(' · ') })]),
        h('div', { class: 'btns' }, [h('button', { class: 'btn' + (asked ? '' : ' primary'), type: 'button', disabled: asked ? 'disabled' : null, text: asked ? 'We will call you' : 'I am interested', onclick: function () {
          api('interest', { course: x.code }).then(function () { G.toast('Thank you. The office will talk to you about ' + x.name + '.', 4000); load(); }, function (e) { G.toast(e.message, 4000); });
        } })])]);
    }))));

    var digits = String(d.centre.phone || '').replace(/\D/g, '');
    if (digits.length >= 10) w.appendChild(h('div', { class: 'btns' }, [h('a', { class: 'btn', href: 'tel:+91' + digits.slice(-10), text: 'Call the office' }),
      h('a', { class: 'btn', href: 'https://wa.me/91' + digits.slice(-10), target: '_blank', rel: 'noopener', text: 'WhatsApp the office' })]));
  }
})();
