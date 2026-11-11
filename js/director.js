/* Director phone screen: today at a glance, TV online check, announcements, leave mails to review. */
(function () {
  'use strict';
  var G = window.GTEC_APP, h = G.h;
  var R = window.GTEC_DIRECTOR = {};
  var st = { pin: null, data: null, timer: null };

  R.start = function () {
    document.body.className = 'phone';
    st.pin = G.store.get('adminPin', null);
    if (st.pin) load(); else login();
  };

  function root() { var r = document.getElementById('app'); r.innerHTML = ''; r.appendChild(G.phonebar('Director')); return r; }

  function login(msg) {
    var pin = h('input', { id: 'd-pin', type: 'password', inputmode: 'numeric', placeholder: 'ADMIN_PIN from the SETTINGS tab' });
    var err = h('p', { class: 'hint', role: 'alert', text: msg || (G.demo ? 'Demo: the PIN is filled in. Just tap Open.' : '') });
    if (G.demo) pin.value = '1234';
    root().appendChild(h('div', { class: 'phone-wrap' }, [
      h('div', { class: 'phone-head' }, [h('h1', { text: 'Director' })]),
      h('form', { class: 'card', onsubmit: function (e) { e.preventDefault(); st.pin = pin.value.trim(); err.textContent = 'Checking…'; load(function (e2) { st.pin = null; err.textContent = e2.message; }); } }, [
        h('label', { class: 'field' }, ['Director PIN', pin]), err,
        h('div', { class: 'btns' }, [h('button', { class: 'btn primary', type: 'submit', text: 'Open' }), h('button', { class: 'btn', type: 'button', text: 'Settings', onclick: G.openSettings })])
      ])
    ]));
  }

  function load(onFail) {
    clearTimeout(st.timer);
    G.apiPost({ action: 'adminStatus', pin: st.pin }).then(function (d) {
      G.store.set('adminPin', st.pin);
      st.data = d; render();
      st.timer = setTimeout(load, 60000);
    }, function (e) {
      if (onFail) return onFail(e);
      if (/PIN/.test(e.message)) { G.store.del('adminPin'); return login(e.message); }
      G.toast(e.message, 4000);
      st.timer = setTimeout(load, 60000);
    });
  }

  function render() {
    var d = st.data, hb = d.heartbeat;
    var age = hb ? Math.round((Date.now() - hb.at) / 60000) : null;
    var online = age !== null && age <= 10;
    var text = h('textarea', { id: 'ann-text', rows: '3', maxlength: '240', placeholder: 'e.g. Batch E moved to the Software lab today' });
    var urgent = h('input', { id: 'ann-urgent', type: 'checkbox' });
    var mins = h('input', { id: 'ann-mins', type: 'number', min: '5', max: '480', value: '30', style: 'width:90px' });
    var tot = { total: 0, present: 0, leave: 0 };
    d.batches.forEach(function (b) { tot.total += b.counts.total; tot.present += b.counts.present; tot.leave += b.counts.leave; });

    root().appendChild(h('div', { class: 'phone-wrap' }, [
      h('div', { class: 'phone-head' }, [
        h('div', null, [h('h1', { text: 'Today' }), h('div', { class: 'sub', text: d.today.weekday + ' ' + d.today.date + (d.today.holiday ? ' · Holiday: ' + d.today.holiday : d.today.isClassDay ? '' : ' · no classes') })]),
        h('div', { class: 'btns' }, [h('button', { class: 'btn', text: 'Refresh', onclick: function () { load(); } }), h('button', { class: 'btn', text: 'Settings', onclick: G.openSettings })])
      ]),
      h('div', { class: 'card' }, [
        h('dl', { class: 'kv' }, [
          h('dt', { text: 'TV display' }), h('dd', null, [h('span', { class: 'pill ' + (online ? 'ok' : 'bad'), text: online ? 'Online' : 'Offline' }),
            ' ' + (hb ? 'last seen ' + age + ' min ago · ' + hb.screen : 'never connected')]),
          h('dt', { text: 'Students today' }), h('dd', { text: tot.present + ' present · ' + tot.leave + ' on leave · ' + tot.total + ' on roll' }),
          d.staffLeave.length ? h('dt', { text: 'Staff on leave' }) : null, d.staffLeave.length ? h('dd', { text: d.staffLeave.join(', ') }) : null
        ]),
        d.attendanceError ? h('p', { class: 'hint', role: 'alert', text: 'Attendance sheet problem: ' + d.attendanceError }) : null
      ]),
      h('div', { class: 'card' }, [
        h('h2', { text: 'Batches' }),
        h('div', { style: 'overflow-x:auto' }, [h('table', { class: 'mini' }, [
          h('thead', null, [h('tr', null, ['Batch', 'Time', 'Present', 'Leave', 'Roll'].map(function (t) { return h('th', { text: t }); }))]),
          h('tbody', null, d.batches.map(function (b) {
            return h('tr', null, [h('td', { text: b.id }), h('td', { text: G.fmt12(b.start) }), h('td', { text: String(b.counts.present) }), h('td', { text: String(b.counts.leave) }), h('td', { text: String(b.counts.total) })]);
          }))
        ])])
      ]),
      h('form', { class: 'card', onsubmit: function (e) {
        e.preventDefault();
        G.apiPost({ action: 'announce', pin: st.pin, text: text.value, urgent: urgent.checked, minutes: Number(mins.value) })
          .then(function () { G.toast(urgent.checked ? 'Showing full screen on the TV now' : 'Added to today’s notices'); load(); }, function (e2) { G.toast(e2.message, 4000); });
      } }, [
        h('h2', { text: 'Announcement' }),
        h('label', { class: 'field' }, ['Text', text]),
        h('label', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [urgent, 'Show full screen on the TV for', mins, 'minutes']),
        h('div', { class: 'btns' }, [
          h('button', { class: 'btn primary', type: 'submit', text: 'Send to TV' }),
          d.announcements.some(function (a) { return a.urgentUntil; }) ? h('button', { class: 'btn danger', type: 'button', text: 'Clear full-screen message', onclick: function () {
            G.apiPost({ action: 'clearUrgent', pin: st.pin }).then(function () { G.toast('Cleared'); load(); }, function (e2) { G.toast(e2.message, 4000); });
          } }) : null
        ]),
        h('p', { class: 'hint', text: 'Without the full-screen tick, the text goes into the morning brief and the scrolling ticker for today.' })
      ]),
      h('div', { class: 'card' }, [
        h('h2', { text: 'Leave mails to check' }),
        d.leaveReview.length ? h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, d.leaveReview.map(function (r) {
          return h('div', { class: 'hint' }, [h('b', { text: r.subject || '(no subject)' }), h('br'), r.from + ' · ' + r.received, h('br'), r.note]);
        })) : h('p', { class: 'hint', text: 'Every leave mail was matched to a student and a date.' }),
        h('p', { class: 'hint', text: 'These could not be read automatically. Mark them by hand in the attendance sheet or the tutor screen.' })
      ])
    ]));
  }
})();
