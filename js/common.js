/* Shared helpers: settings, API calls, IST time, native bridge, settings overlay, router. */
(function () {
  'use strict';
  var G = window.GTEC_APP = {};
  var NATIVE = window.GTEC || null;            // injected by the Android app
  G.native = NATIVE;
  G.VERSION = '2.0.0';

  /* ---------- storage ---------- */
  G.store = {
    get: function (k, d) { try { var v = localStorage.getItem('gtec.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('gtec.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
    del: function (k) { try { localStorage.removeItem('gtec.' + k); } catch (e) { /* ignore */ } }
  };

  G.config = function () {
    var base = window.GTEC_CONFIG || {};
    var saved = G.store.get('config', {});
    return { apiUrl: saved.apiUrl || base.apiUrl || '', displayKey: saved.displayKey || base.displayKey || '', mgmtUrl: saved.mgmtUrl || base.mgmtUrl || '' };
  };
  /* Demo build: everything runs on made-up data inside the app (js/demo.js). No server, nothing leaves the device. */
  G.demo = !!((window.GTEC_CONFIG || {}).demo && window.GTEC_DEMO_SERVER);
  G.centreLabel = (window.GTEC_CONFIG || {}).centreLabel || 'CHARUMMOOD';
  if (G.demo) document.title = 'BatchBoard Demo';
  function demoCall(body) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () { try { resolve(window.GTEC_DEMO_SERVER.handle(body, G.now())); } catch (e) { reject(e); } }, 250);
    });
  }

  /* ---------- API ---------- */
  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('No reply from the server — check the internet connection')); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  G.apiGet = function (params) {
    if (G.demo) return demoCall(params);
    var cfg = G.config();
    if (!cfg.apiUrl) return Promise.reject(new Error('Server link not set. Open Settings.'));
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return withTimeout(fetch(cfg.apiUrl + (cfg.apiUrl.indexOf('?') >= 0 ? '&' : '?') + q, { cache: 'no-store' }), 25000)
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Server error'); return j; });
  };
  // text/plain keeps this a "simple" request, so Apps Script answers without a CORS preflight.
  G.apiPost = function (body) {
    if (G.demo) return demoCall(body);
    var cfg = G.config();
    if (!cfg.apiUrl) return Promise.reject(new Error('Server link not set. Open Settings.'));
    return withTimeout(fetch(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }), 25000)
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Server error'); return j; });
  };

  /* Centre Manager server (students, fees, leaves, computers...). Separate from the TV / attendance server above. */
  G.mApi = function (body) {
    var cfg = G.config();
    if (!cfg.mgmtUrl) return Promise.reject(new Error('Centre Manager link not set. Ask the director to add it in Settings.'));
    return withTimeout(fetch(cfg.mgmtUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }), 40000)
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Server error'); return j; });
  };

  /* ---------- time (always India time, whatever the device's zone) ---------- */
  G.offset = 0;                                   // server clock minus device clock
  G.fakeNow = null;                               // demo / preview time override (ms)
  G.now = function () { return G.fakeNow !== null ? G.fakeNow : G.demo ? window.GTEC_DEMO_SERVER.now() : Date.now() + G.offset; };
  G.ist = function (ms) {
    var d = new Date(ms + 330 * 60000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(),
             h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(),
             min: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60,
             ymd: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) };
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  G.pad = pad;
  G.toMin = function (hm) { var p = String(hm || '0:0').split(':'); return Number(p[0]) * 60 + Number(p[1]); };
  G.fmt12 = function (hm) {
    var m = G.toMin(hm), h = Math.floor(m / 60), mi = m % 60, ap = h >= 12 ? 'PM' : 'AM';
    return ((h + 11) % 12 + 1) + ':' + pad(mi) + ' ' + ap;
  };
  G.DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  G.MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* ---------- DOM ---------- */
  G.h = function (tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k === 'style') el.style.cssText = attrs[k];
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  };
  /* Official G-TEC logo (cropped inside its own navy card) with the centre name right-aligned under it.
     Only ever placed on brand navy #004282. */
  G.LOGO_SRC = 'img/gtec-logo-mark.png';
  G.lockup = function () {
    return G.h('div', { class: 'lockup' }, [
      G.h('img', { src: G.LOGO_SRC, alt: 'G-TEC Education' }),
      G.h('span', { class: 'centre', text: G.centreLabel })
    ]);
  };
  G.phonebar = function (mode) {
    return G.h('header', { class: 'phonebar' }, [G.h('div', { class: 'in' }, [G.lockup(), mode ? G.h('button', { class: 'mode', type: 'button', title: 'Settings and switch screen', onclick: function () { G.openSettings(); } }, [mode, ' ⚙']) : null])]);
  };

  G.toast = function (msg, ms) {
    var old = document.querySelector('.toast'); if (old) old.remove();      // one message at a time
    var t = G.h('div', { class: 'toast', role: 'status', text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 2800);
  };

  /* ---------- speech ---------- */
  G.speak = function (text) {
    try {
      if (NATIVE && NATIVE.speak) { NATIVE.speak(text); return; }
      if (window.speechSynthesis) { var u = new SpeechSynthesisUtterance(text); u.lang = 'en-IN'; u.rate = 0.95; speechSynthesis.speak(u); }
    } catch (e) { /* speech not available */ }
  };

  /* ---------- mode / router ---------- */
  G.getMode = function () {
    if (window.GTEC_FORCE_MODE) return window.GTEC_FORCE_MODE;   // demo web page frames
    var q = location.search.match(/[?&]mode=(\w+)/);
    if (q) return q[1];
    var m = G.store.get('mode', '');
    if (!m && NATIVE && NATIVE.getMode) m = NATIVE.getMode();
    if (!m && NATIVE && NATIVE.isTv && NATIVE.isTv()) m = 'display';
    return m;
  };
  G.setMode = function (m) {
    G.store.set('mode', m);
    try { if (NATIVE && NATIVE.setMode) NATIVE.setMode(m); } catch (e) { /* older app */ }
    location.reload();
  };

  G.chooseMode = function () {
    document.body.className = 'phone';
    var root = document.getElementById('app');
    root.innerHTML = '';
    root.appendChild(G.phonebar('Set up'));
    root.appendChild(G.h('div', { class: 'phone-wrap' }, [
      G.h('div', { class: 'phone-head' }, [G.h('h1', { text: 'Set up this device' })]),
      G.h('p', { class: 'hint', text: G.demo ? 'Demo version with made-up students. Pick a screen to try. On one device, switch screens any time from Settings (five taps on the top-left corner).' : 'Choose what this device is for. You can change it later in Settings.' }),
      G.h('div', { class: 'modes' }, [
        G.h('button', { onclick: function () { G.setMode('display'); } }, [G.h('b', { text: 'TV display' }), G.h('span', { text: 'Morning brief, batch attendance boards, music and ads. Use on the TV box or the PC connected to the TV.' })]),
        G.h('button', { onclick: function () { G.setMode('tutor'); } }, [G.h('b', { text: 'Tutor' }), G.h('span', { text: 'Mark students present or on leave for today. Updates the TV straight away.' })]),
        G.h('button', { onclick: function () { G.setMode('director'); } }, [G.h('b', { text: 'Director' }), G.h('span', { text: 'See today at a glance, check the TV is online, push announcements.' })]),
        G.demo ? null : G.h('button', { onclick: function () { G.setMode('office'); } }, [G.h('b', { text: 'Centre Manager' }), G.h('span', { text: 'Students, fees and reminders, leaves, batches, lab computers, upgrade courses and enquiries. For the director, front office and tutors.' })]),
        G.demo ? null : G.h('button', { onclick: function () { G.setMode('student'); } }, [G.h('b', { text: 'Student' }), G.h('span', { text: 'See your attendance and fees, apply for leave and find your next course.' })])
      ]),
      G.h('div', { class: 'btns' }, [G.h('button', { class: 'btn', text: G.demo ? 'Demo settings' : 'Server settings', onclick: G.openSettings })])
    ]));
  };

  /* ---------- settings overlay (Menu key, 5 x OK, or 5 taps top-left) ---------- */
  G.openSettings = function () {
    if (document.querySelector('.overlay')) return;
    if (G.demo) return demoSettings();
    var cfg = G.config();
    var url = G.h('input', { id: 'set-url', type: 'url', value: cfg.apiUrl, placeholder: 'https://script.google.com/macros/s/…/exec' });
    var key = G.h('input', { id: 'set-key', type: 'text', value: cfg.displayKey, placeholder: 'DISPLAY_KEY from the SETTINGS tab' });
    var mode = G.h('select', { id: 'set-mode' }, ['display', 'tutor', 'director', 'office', 'student'].map(function (m) {
      return G.h('option', { value: m, selected: G.getMode() === m ? 'selected' : null, text: { display: 'TV display', tutor: 'Tutor', director: 'Director', office: 'Centre Manager', student: 'Student' }[m] });
    }));
    var mgmt = G.h('input', { id: 'set-mgmt', type: 'url', value: cfg.mgmtUrl, placeholder: 'https://script.google.com/macros/s/…/exec' });
    function keep() { G.store.set('config', { apiUrl: url.value.trim(), displayKey: key.value.trim(), mgmtUrl: mgmt.value.trim() }); }
    var status = G.h('p', { class: 'hint', text: 'App version ' + G.VERSION });
    var ov = G.h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Settings' }, [
      G.h('div', { class: 'card' }, [
        G.h('h2', { text: 'Settings' }),
        G.h('label', { class: 'field' }, ['Server link (Apps Script web app URL)', url]),
        G.h('label', { class: 'field' }, ['Display key', key]),
        G.h('label', { class: 'field' }, ['Centre Manager link (second Apps Script web app)', mgmt]),
        G.h('label', { class: 'field' }, ['This device is a', mode]),
        status,
        G.h('div', { class: 'btns' }, [
          G.h('button', { class: 'btn primary', text: 'Save', onclick: function () {
            keep();
            G.setMode(mode.value);
          } }),
          G.h('button', { class: 'btn', text: 'Test connection', onclick: function () {
            keep();
            status.textContent = 'Testing…';
            G.apiGet({ action: 'display', key: key.value.trim() }).then(function (d) {
              status.textContent = 'Connected. ' + d.batches.length + ' batches, ' + d.batches.reduce(function (a, b) { return a + b.counts.total; }, 0) + ' students today.';
            }, function (e) { status.textContent = 'Failed: ' + e.message; });
          } }),
          NATIVE && NATIVE.openAutostartSettings ? G.h('button', { class: 'btn', text: 'Allow start on boot', onclick: function () { NATIVE.openAutostartSettings(); } }) : null,
          G.h('button', { class: 'btn', text: 'Close', onclick: function () { ov.remove(); } })
        ]),
        G.h('p', { class: 'hint', text: 'Open this panel on the TV with the remote’s Menu key or by pressing OK five times quickly. On a phone, tap the top-left corner five times.' })
      ])
    ]);
    document.body.appendChild(ov);
    url.focus();
  };

  function demoSettings() {
    var S = window.GTEC_DEMO_SERVER;
    var mode = G.h('select', { id: 'set-mode' }, ['display', 'tutor', 'director'].map(function (m) {
      return G.h('option', { value: m, selected: G.getMode() === m ? 'selected' : null, text: { display: 'TV display', tutor: 'Tutor', director: 'Director' }[m] });
    }));
    var scene = G.h('select', { id: 'set-scene' }, [G.h('option', { value: 'tour', text: 'Tour the whole day (repeats every 3 minutes)' })].concat(
      S.SCENES.map(function (s, i) { return G.h('option', { value: String(i), selected: S.clock.mode === 'hold' && S.clock.scene === i ? 'selected' : null, text: 'Stay on: ' + s.name }); })));
    var ov = G.h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Demo settings' }, [
      G.h('div', { class: 'card' }, [
        G.h('h2', { text: 'Demo settings' }),
        G.h('p', { class: 'hint', text: 'This is the demo version. It runs on made-up students and needs no internet or server. The real version reads the centre’s own attendance sheet.' }),
        G.h('label', { class: 'field' }, ['This device is a', mode]),
        G.h('label', { class: 'field' }, ['TV clock', scene]),
        G.h('div', { class: 'btns' }, [
          G.h('button', { class: 'btn primary', text: 'Save', onclick: function () {
            if (scene.value === 'tour') S.tour(); else S.hold(Number(scene.value));
            G.store.set('demoClock', S.clock);
            if (mode.value !== G.getMode()) G.setMode(mode.value); else location.reload();
          } }),
          G.h('button', { class: 'btn', text: 'Clear demo marks', onclick: function () { S.reset(); G.toast('Demo marks and announcements cleared'); } }),
          G.h('button', { class: 'btn', text: 'Close', onclick: function () { ov.remove(); } })
        ]),
        G.h('p', { class: 'hint', text: 'Demo version ' + G.VERSION + '. Open this panel with the remote’s Menu key, OK pressed five times, or five taps on the top-left corner.' })
      ])
    ]);
    document.body.appendChild(ov);
    mode.focus();
  }
  if (G.demo) { var savedClock = G.store.get('demoClock', null); if (savedClock && savedClock.mode === 'hold') window.GTEC_DEMO_SERVER.hold(savedClock.scene); }

  var okTimes = [], taps = [];
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ContextMenu' || e.keyCode === 82 || e.key === 'F1') { e.preventDefault(); G.openSettings(); return; }
    if ((e.key === 'Enter' || e.keyCode === 23) && !document.querySelector('.overlay')) {
      var t = Date.now(); okTimes = okTimes.filter(function (x) { return t - x < 3000; }); okTimes.push(t);
      if (okTimes.length >= 5) { okTimes = []; G.openSettings(); }
    }
  });
  document.addEventListener('pointerdown', function (e) {
    if (e.clientX > 90 || e.clientY > 90) return;
    var t = Date.now(); taps = taps.filter(function (x) { return t - x < 3000; }); taps.push(t);
    if (taps.length >= 5) { taps = []; G.openSettings(); }
  });
  window.gtecOpenSettings = G.openSettings;     // called by the Android app on Menu key / long-press

  /* ---------- web app (iPhone, Windows or any browser): no Android/Windows wrapper around the page ---------- */
  G.web = !NATIVE;
  function webExtras(mode) {
    if (!G.web) return;
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline shell is optional */ });
    }
    if (mode !== 'display') return;
    // A browser only plays sound after the first click or key press; the TV keeps the screen awake while visible.
    var unlock = function () { try { window.GTEC_DISPLAY.unlockAudio(); } catch (e) { /* ignore */ } };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    var lock = null;
    function wake() { try { if (navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').then(function (l) { lock = l; }, function () {}); } catch (e) { /* not supported */ } }
    wake(); document.addEventListener('visibilitychange', wake);
    // Double-click (or F) for full screen on a Windows PC connected to the TV.
    function full() { try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) { /* not allowed */ } }
    document.addEventListener('dblclick', full);
    document.addEventListener('keydown', function (e) { if ((e.key === 'f' || e.key === 'F') && !document.querySelector('.overlay')) full(); });
    setTimeout(function () { G.toast('Double-click or press F for full screen. Click once to turn on sound.', 7000); }, 2500);
  }

  G.start = function () {
    var mode = G.getMode();
    webExtras(mode);
    if (mode === 'display' && window.GTEC_DISPLAY) {
      if (!G.demo) return window.GTEC_DISPLAY.start();
      var S = window.GTEC_DEMO_SERVER, D = window.GTEC_DISPLAY;
      D.start({ demo: S.display });
      S.listeners.push(function () { D.refresh(); });       // a tutor's tap shows on the TV at once
      return;
    }
    if (mode === 'tutor' && window.GTEC_TUTOR) return window.GTEC_TUTOR.start();
    if (mode === 'director' && window.GTEC_DIRECTOR) return window.GTEC_DIRECTOR.start();
    if (mode === 'office' && window.GTEC_MANAGE && !G.demo) return window.GTEC_MANAGE.start();
    if (mode === 'student' && window.GTEC_STUDENT && !G.demo) return window.GTEC_STUDENT.start();
    G.chooseMode();
  };
  document.addEventListener('DOMContentLoaded', function () { if (!window.GTEC_NO_AUTOSTART) G.start(); });
})();
