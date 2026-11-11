/* TV display: decides what to show from the clock, then draws it.
   08:00 brief → board from 15 min before each batch until 5 min after → content loop the rest of the day. */
(function () {
  'use strict';
  var G = window.GTEC_APP, h = G.h;
  var D = window.GTEC_DISPLAY = {};

  var DEFAULTS = { screenOn: '07:45', screenOff: '17:15', briefStart: '08:00', briefEnd: '08:15', preMinutes: 15, postMinutes: 5, voice: true, musicVolume: 0.35, reviewLink: '' };
  var BUILTIN = [
    { type: 'TEXT', title: (window.GTEC_CONFIG && window.GTEC_CONFIG.centreName) || 'G-TEC Charummood', content: 'Learn the skills employers ask for: Accounting, Software, Multimedia, CAD and Digital Marketing.', seconds: 12 },
    { type: 'TEXT', title: 'Tech tip', content: 'Windows + V opens your clipboard history. Turn it on once and paste anything you copied today.', seconds: 10 },
    { type: 'TEXT', title: 'Be on time', content: 'Your batch board appears here 15 minutes before class. Check your name when you walk in.', seconds: 10 }
  ];

  var st = {
    data: null, lastOk: 0, demo: null, key: '', phase: '', spoken: {},
    idx: -1, slideTimer: null, video: null, audio: null, track: 0, musicFails: 0,
    shift: { x: 0, y: 0 }, fetchTimer: null, sig: '', shown: '', demoTick: 0
  };
  var els = {};

  /* ---------------- start ---------------- */
  D.start = function (opts) {
    opts = opts || {};
    st.demo = opts.demo || null;
    document.body.className = 'tv';
    var root = document.getElementById('app');
    root.innerHTML = '';
    els.viewport = h('div', { id: 'viewport' }, [els.stage = h('div', { id: 'stage' })]);
    root.appendChild(els.viewport);
    window.addEventListener('resize', fit);
    fit();

    if (st.demo) { st.data = st.demo(G.now()); st.lastOk = Date.now(); }
    else {
      st.data = G.store.get('lastData', null);
      if (!G.config().apiUrl) setTimeout(function () { G.toast('Server link not set — press Menu (or OK five times) to open Settings', 8000); }, 1500);
      fetchLoop();
      setInterval(heartbeat, 5 * 60000); setTimeout(heartbeat, 20000);
    }
    setInterval(tick, 1000);
    setInterval(function () { st.shift = { x: Math.round(Math.random() * 8 - 4), y: Math.round(Math.random() * 8 - 4) }; fit(); }, 120000);
    tick();
  };

  /** Used by the preview page after it moves the clock. */
  D.refresh = function () { if (st.demo) st.data = st.demo(G.now()); st.key = ''; st.phase = ''; tick(); };
  D.unlockAudio = function () { ensureAudio(); if (st.key.indexOf('content') === 0) playMusic(); };

  function fit() {
    var vw = els.viewport.clientWidth, vh = els.viewport.clientHeight;
    var s = Math.min(vw / 1920, vh / 1080);
    els.stage.style.transform = 'translate(-50%,-50%) translate(' + st.shift.x + 'px,' + st.shift.y + 'px) scale(' + s + ')';
  }

  /* ---------------- data ---------------- */
  function fetchLoop() {
    clearTimeout(st.fetchTimer);
    var cfg = G.config();
    G.apiGet({ action: 'display', key: cfg.displayKey }).then(function (d) {
      st.data = d; st.lastOk = Date.now();
      G.offset = d.serverTime - Date.now();
      G.store.set('lastData', d);
      onData();
    }, function () { /* keep showing the last saved data */ }).then(function () {
      var live = st.key.indexOf('board') === 0 || st.key === 'brief';
      st.fetchTimer = setTimeout(fetchLoop, live ? 20000 : 60000);
    });
  }

  function heartbeat() {
    var cfg = G.config();
    if (!cfg.apiUrl) return;
    G.apiGet({ action: 'heartbeat', key: cfg.displayKey, screen: st.key || 'starting', version: G.VERSION,
               device: (G.native && G.native.deviceName) ? G.native.deviceName() : navigator.userAgent.slice(0, 60) }).catch(function () {});
  }

  function onData() {
    // Boards and the brief redraw only when their data changed; the content loop just refreshes its ticker.
    var sig = signature();
    if (sig !== st.sig) {
      st.sig = sig;
      if (st.key.indexOf('board') === 0 || st.key === 'brief' || st.key === 'urgent') st.key = '';
    }
    if (st.key === 'content') updateTicker(G.ist(G.now()));
    tick();
  }
  function signature() {
    var d = st.data || {};
    return JSON.stringify([d.today, d.batches, d.leaveToday, d.staffLeave, d.announcements, d.brief]);
  }

  function settings() { return (st.data && st.data.settings) || DEFAULTS; }
  function batchesToday(p) { return st.data && st.data.today && st.data.today.date === p.ymd ? st.data.batches : []; }
  function isClassDay(p) { return st.data && st.data.today && st.data.today.date === p.ymd ? st.data.today.isClassDay : (p.wd >= 1 && p.wd <= 5); }

  /* ---------------- scheduler ---------------- */
  D.decide = decide;
  function decide(p) {
    var s = settings(), now = G.now();
    var anns = (st.data && st.data.announcements) || [];
    for (var i = 0; i < anns.length; i++) if (anns[i].urgentUntil && anns[i].urgentUntil > now) return { kind: 'urgent', ann: anns[i] };
    var m = p.min;
    if (m < G.toMin(s.screenOn) || m >= G.toMin(s.screenOff)) return { kind: 'off' };
    if (!isClassDay(p)) return { kind: 'content' };
    if (m >= G.toMin(s.briefStart) && m < G.toMin(s.briefEnd)) return { kind: 'brief' };
    var bs = batchesToday(p);
    for (var j = 0; j < bs.length; j++) {
      var start = G.toMin(bs[j].start);
      if (m >= start - s.preMinutes && m < start + s.postMinutes) return { kind: 'board', batch: bs[j] };
    }
    return { kind: 'content' };
  }

  function tick() {
    if (st.demo && ++st.demoTick % 5 === 0) { st.data = st.demo(G.now()); onData(); return; }
    var p = G.ist(G.now());
    var dec = decide(p);
    var key = dec.kind + (dec.batch ? ':' + dec.batch.id : '');
    if (dec.kind === 'board') {
      var phase = p.min >= G.toMin(dec.batch.start) ? 'post' : 'pre';
      if (phase !== st.phase) { st.phase = phase; if (key === st.key) st.key = ''; }
    }
    if (key !== st.key) {
      leaveContent();
      st.key = key;
      els.stage.innerHTML = '';
      var screen = { brief: renderBrief, board: renderBoard, content: renderContent, urgent: renderUrgent, off: renderOff }[dec.kind](dec, p);
      if (st.shown === key) screen.style.animation = 'none';   // same screen with fresh data: no fade
      st.shown = key;
      els.stage.appendChild(screen);
      // A WebView left running for days slowly leaks memory: start fresh when the TV goes dark after 6+ hours.
      if (dec.kind === 'off' && !st.demo && window.performance && performance.now() > 6 * 3600000) setTimeout(function () { location.reload(); }, 5000);
    }
    updateLive(dec, p);
    announce(p);
  }

  function announce(p) {
    var s = settings();
    if (!s.voice || !isClassDay(p)) return;
    batchesToday(p).forEach(function (b) {
      var start = G.toMin(b.start), m = Math.floor(p.min);
      [[start - 5, 'Batch ' + b.id + ' starts in five minutes.'], [start, 'Batch ' + b.id + ' is starting now. Please take your seats.']].forEach(function (a) {
        var k = p.ymd + b.id + a[0];
        if (m === a[0] && !st.spoken[k]) { st.spoken[k] = 1; G.speak(a[1]); }
      });
    });
  }

  /* ---------------- shared bits ---------------- */
  function topbar() {
    return h('header', { class: 'brandbar' }, [G.lockup(), clockEl()]);
  }
  function clockEl() {
    return h('div', { class: 'clock', 'data-clock': '1' }, ['--:--', h('span', { class: 'netdot', 'data-net': '1' })]);
  }
  function setClocks(p) {
    var hh = ((p.h + 11) % 12 + 1), txt = hh + ':' + G.pad(p.mi);
    var stale = !st.demo && Date.now() - st.lastOk > 180000;
    els.stage.querySelectorAll('[data-clock]').forEach(function (c) {
      if (c.firstChild && c.firstChild.nodeType === 3) c.firstChild.nodeValue = txt;
      var sm = c.querySelector('small'); if (!sm) { sm = h('small'); c.insertBefore(sm, c.childNodes[1] || null); }
      sm.textContent = p.h >= 12 ? 'PM' : 'AM';
      var dot = c.querySelector('[data-net]'); if (dot) { dot.className = 'netdot' + (stale ? ' stale' : ''); dot.title = stale ? 'Offline — showing last saved data' : 'Live'; }
    });
  }
  function dateLine(p) { return G.DAYS[p.wd] + ', ' + p.d + ' ' + G.MONTHS[p.mo] + ' ' + p.y; }
  function timeRange(b, bare) {
    var a = G.fmt12(b.start), z = G.fmt12(b.end);
    if (bare) return a.slice(0, -3) + ' – ' + z.slice(0, -3);
    if (a.slice(-2) === z.slice(-2)) a = a.slice(0, -3);
    return a + ' – ' + z;
  }

  /* ---------------- morning brief ---------------- */
  function renderBrief(dec, p) {
    var d = st.data || {};
    var bs = batchesToday(p);
    var greet = p.h < 12 ? ['Good morning', 'സുപ്രഭാതം'] : ['Good afternoon', 'ശുഭ ഉച്ച'];
    var leave = (d.leaveToday || []);
    var staff = d.staffLeave || [];
    var anns = (d.announcements || []).filter(function (a) { return !a.urgentUntil; });
    var brief = d.brief || {};
    var dated = (brief.exams || []).map(function (e) { return { date: e.date, text: e.text, tag: 'Exam' }; })
      .concat((brief.events || []).map(function (e) { return { date: e.date, text: e.text, tag: 'Event' }; }))
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 4);

    return h('section', { class: 'screen' }, [
      topbar(),
      h('div', { class: 'brief' }, [
        h('div', { class: 'hello' }, [h('h1', { text: greet[0] }), /* demo: English only */ G.demo ? null : h('span', { class: 'ml', lang: 'ml', text: greet[1] }), h('span', { class: 'date', text: dateLine(p) })]),
        h('div', { class: 'col' }, [
          h('h2', { class: 'label', text: 'Today’s batches' }),
          bs.length ? h('div', { class: 'daylist' }, bs.map(function (b) {
            return h('div', { class: 'row' }, [
              h('span', { class: 'letter', text: b.id }),
              h('span', null, [h('span', { class: 'time', text: timeRange(b) }), b.faculty ? h('div', { class: 'who', text: b.faculty + (b.room ? ' · ' + b.room : '') }) : null]),
              h('span', { class: 'count' }, [String(b.counts.expected), h('small', { text: 'expected' })])
            ]);
          })) : h('p', { class: 'empty', text: d.attendanceError ? 'Attendance sheet not readable: ' + d.attendanceError : 'Waiting for today’s attendance sheet.' })
        ]),
        h('div', { class: 'col' }, [
          h('h2', { class: 'label', text: 'Students on leave today' }),
          leave.length ? h('div', { class: 'chips' }, leave.slice(0, 18).map(function (l) {
            return h('span', { class: 'chip' }, [h('span', { class: 'b', text: l.batch }), l.n]);
          }).concat(leave.length > 18 ? [h('span', { class: 'chip', text: '+' + (leave.length - 18) + ' more' })] : [])) : h('p', { class: 'empty', text: 'No leave recorded for today.' }),
          staff.length ? h('h2', { class: 'label', text: 'Staff on leave' }) : null,
          staff.length ? h('div', { class: 'chips' }, staff.map(function (n) { return h('span', { class: 'chip staff', text: n }); })) : null
        ]),
        h('div', { class: 'col' }, [
          h('h2', { class: 'label', text: 'Notices' }),
          anns.length || dated.length ? h('div', { class: 'notes' }, anns.slice(0, 3).map(function (a) { return h('div', { class: 'note', text: a.text }); })
            .concat(dated.map(function (e) {
              var dt = new Date(e.date + 'T12:00:00+05:30'), q = G.ist(dt.getTime());
              return h('div', { class: 'note' }, [h('span', { class: 'when', text: e.tag + ' · ' + G.DAYS[q.wd].slice(0, 3) + ' ' + q.d + ' ' + G.MONTHS[q.mo].slice(0, 3) }), e.text]);
            }))) : h('p', { class: 'empty', text: 'No notices today.' })
        ]),
        brief.thought ? h('div', { class: 'thought' }, [h('span', { class: 'label', text: 'Thought for the day' }), h('span', { text: brief.thought })]) : null
      ])
    ]);
  }

  /* ---------------- batch board ---------------- */
  function renderBoard(dec, p) {
    var b = dec.batch, post = st.phase === 'post';
    var order = { P: 0, '': 1, L: 2 };
    var list = b.students.slice().sort(function (x, y) { return (order[x.s] - order[y.s]) || (x.n < y.n ? -1 : 1); });
    var n = list.length;
    var cols = n <= 6 ? 2 : n <= 12 ? 3 : n <= 20 ? 4 : n <= 30 ? 5 : 6;
    var rows = Math.max(1, Math.ceil(n / cols));
    var tileH = (860 - (rows - 1) * 14) / rows;
    var fs = Math.max(20, Math.min(40, tileH * 0.34));
    var tp = Math.max(6, Math.min(22, (tileH - fs * 2.1) / 2));

    var tiles = h('div', { class: 'tiles', style: '--cols:' + cols + ';--fs:' + fs.toFixed(1) + 'px;--tp:' + tp.toFixed(1) + 'px' }, list.map(function (s) {
      var cls = s.s === 'P' ? 'p' : s.s === 'L' ? 'l' : 'w' + (post ? ' late' : '');
      var label = s.s === 'P' ? 'Present' : s.s === 'L' ? 'On leave' : post ? 'Not marked yet' : 'Expected';
      return h('div', { class: 'tile ' + cls }, [
        h('div', { class: 'nm' }, [s.seat ? h('span', { class: 'seat', text: s.seat }) : null, s.seat ? ' ' : null, s.n]),
        h('div', { class: 'meta' }, [h('span', { text: s.c || '' }), h('span', { class: 'st', text: label })])
      ]);
    }));

    return h('section', { class: 'screen' }, [
      h('div', { class: 'board' }, [
        h('aside', { class: 'side' }, [
          G.lockup(),
          h('div', { class: 'label', text: 'Batch' }),
          h('h1', { class: 'bigletter', text: b.id }),
          h('div', { class: 'rule' }),
          h('div', { class: 'bt', text: timeRange(b, true) }),
          b.faculty ? h('div', { class: 'fac', text: 'Faculty: ' + b.faculty + (b.room ? ' · ' + b.room : '') }) : null,
          h('div', { class: 'countdown' }, [h('div', { class: 'label', 'data-cdl': '1', text: post ? 'Started' : 'Starts in' }), h('div', { class: 'big' + (post ? ' live' : ''), 'data-cd': '1', text: '--:--' })]),
          h('div', { class: 'tally' }, [
            h('div', null, ['Expected', h('b', { text: String(b.counts.expected) })]),
            h('div', { class: 'p' }, ['Present', h('b', { text: String(b.counts.present) })]),
            h('div', { class: 'l' }, ['Leave', h('b', { text: String(b.counts.leave) })])
          ])
        ]),
        h('div', { class: 'main' }, [
          h('div', { class: 'head' }, [
            h('div', { class: 'legend' }, [
              h('span', null, [h('i', { style: 'background:var(--present)' }), 'Present']),
              h('span', null, [h('i', { style: 'background:var(--waiting)' }), post ? 'Not marked yet' : 'Expected']),
              h('span', null, [h('i', { style: 'background:var(--leave)' }), 'On leave'])
            ]),
            clockEl()
          ]),
          n ? tiles : h('p', { class: 'empty', text: 'No students are listed for batch ' + b.id + ' in this month’s attendance sheet.' })
        ])
      ])
    ]);
  }

  /* ---------------- content loop ---------------- */
  function renderContent(dec, p) {
    els.slidebox = h('div', { class: 'slidebox' });
    els.ticker = h('div', { class: 'ticker' }, [
      G.lockup(),
      els.next = h('div', { class: 'next' }),
      els.marquee = h('div', { class: 'marquee' }),
      clockEl()
    ]);
    var screen = h('section', { class: 'screen content' }, [els.slidebox, els.ticker]);
    setTimeout(function () { updateTicker(p); nextSlide(); playMusic(); }, 0);
    return screen;
  }

  function contentItems(p) {
    var pl = (st.data && st.data.playlist && st.data.playlist.items) || [];
    var slot = p.h < 13 ? 'AM' : 'PM';
    var items = pl.filter(function (i) { return i.slot === 'ALL' || i.slot === slot || !i.slot; });
    var link = settings().reviewLink;
    items = items.filter(function (i) { return i.type !== 'QR' || link; });
    return items.length ? items : BUILTIN;
  }

  function nextSlide() {
    clearTimeout(st.slideTimer);
    if (!els.slidebox || st.key !== 'content') return;
    var p = G.ist(G.now());
    var items = contentItems(p);
    st.idx = (st.idx + 1) % items.length;
    var it = items[st.idx], slide;
    stopVideo();
    if (it.type === 'IMAGE') {
      slide = h('div', { class: 'slide' }, [h('img', { src: it.content, alt: it.title || '', onerror: function () { st.slideTimer = setTimeout(nextSlide, 800); } })]);
    } else if (it.type === 'VIDEO') {
      var v = h('video', { src: it.content, playsinline: 'playsinline', preload: 'auto' });
      v.addEventListener('ended', nextSlide);
      v.addEventListener('error', function () { st.slideTimer = setTimeout(nextSlide, 800); });
      slide = h('div', { class: 'slide' }, [v]);
      st.video = v;
      pauseMusic();
      var pr = v.play();
      if (pr && pr.catch) pr.catch(function () { v.muted = true; v.play().catch(function () { nextSlide(); }); });
    } else if (it.type === 'QR') {
      slide = h('div', { class: 'slide text qr' }, [
        h('div', { style: 'display:grid;gap:34px' }, [h('div', { class: 'kicker', text: 'Google review' }), h('h1', { text: it.title || 'Enjoying your course? Leave us a review' }), h('p', { text: 'Scan with your phone camera. It takes one minute.' })]),
        h('img', { alt: 'QR code for the Google review page', src: 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=0&data=' + encodeURIComponent(settings().reviewLink) })
      ]);
    } else {
      var body = String(it.content || '');
      slide = h('div', { class: 'slide text' }, [
        it.title ? h('div', { class: 'kicker', text: it.title }) : null,
        body.length <= 90 ? h('h1', { text: body }) : h('p', { text: body })
      ]);
    }
    els.slidebox.innerHTML = '';
    els.slidebox.appendChild(slide);
    var secs = it.type === 'VIDEO' ? (it.seconds || 600) : (it.seconds || 12);
    st.slideTimer = setTimeout(nextSlide, secs * 1000);
  }

  function stopVideo() {
    if (st.video) { try { st.video.pause(); st.video.removeAttribute('src'); st.video.load(); } catch (e) { /* ignore */ } st.video = null; if (st.key === 'content') playMusic(); }
  }

  function leaveContent() {
    clearTimeout(st.slideTimer);
    stopVideo();
    pauseMusic();
    els.slidebox = null;
  }

  function updateTicker(p) {
    if (!els.next || !els.marquee) return;
    var bs = batchesToday(p), nb = null;
    if (isClassDay(p)) for (var i = 0; i < bs.length; i++) if (G.toMin(bs[i].start) > p.min) { nb = bs[i]; break; }
    els.next.innerHTML = '';
    var hol = st.data && st.data.today && st.data.today.date === p.ymd ? st.data.today.holiday : null;
    if (hol) els.next.appendChild(document.createTextNode('Holiday today: ' + hol));
    else if (!isClassDay(p)) els.next.appendChild(document.createTextNode('No classes today'));
    else if (nb) {
      var mins = Math.round(G.toMin(nb.start) - p.min);
      els.next.appendChild(document.createTextNode('Next'));
      els.next.appendChild(h('b', { text: nb.id }));
      els.next.appendChild(document.createTextNode(G.fmt12(nb.start) + ' · in ' + (mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min')));
    } else els.next.appendChild(document.createTextNode('Classes are over for today'));

    var anns = ((st.data && st.data.announcements) || []).map(function (a) { return a.text; });
    var text = anns.length ? anns.join('     •     ') : dateLine(p);
    if (els.marquee.getAttribute('data-t') !== text) {
      els.marquee.setAttribute('data-t', text);
      els.marquee.innerHTML = '';
      els.marquee.appendChild(h('span', { style: '--dur:' + Math.max(18, text.length * 0.28) + 's', text: text }));
    }
  }

  /* ---------------- music ---------------- */
  function ensureAudio() {
    if (st.audio) return st.audio;
    var a = new Audio();
    a.preload = 'auto';
    a.addEventListener('ended', function () { st.track++; playMusic(); });
    a.addEventListener('error', function () { st.musicFails++; st.track++; if (st.musicFails < 5) setTimeout(playMusic, 1500); });
    a.addEventListener('playing', function () { st.musicFails = 0; });
    st.audio = a;
    return a;
  }
  function playMusic() {
    var music = (st.data && st.data.playlist && st.data.playlist.music) || [];
    if (!music.length || st.video || st.key !== 'content') return;
    var a = ensureAudio(), tr = music[st.track % music.length];
    a.volume = settings().musicVolume;
    if (a.getAttribute('data-src') !== tr.content) { a.setAttribute('data-src', tr.content); a.src = tr.content; }
    var pr = a.play(); if (pr && pr.catch) pr.catch(function () { /* needs a tap in a browser; the TV app allows autoplay */ });
  }
  function pauseMusic() { if (st.audio) try { st.audio.pause(); } catch (e) { /* ignore */ } }

  /* ---------------- urgent / off ---------------- */
  function renderUrgent(dec) {
    return h('section', { class: 'screen' }, [topbar(), h('div', { class: 'urgent' }, [h('div', { class: 'label', text: 'Announcement' }), h('h1', { text: dec.ann.text })])]);
  }
  function renderOff() {
    var c = clockEl();
    c.style.left = '820px'; c.style.top = '500px';
    return h('section', { class: 'screen off' }, [c]);
  }

  /* ---------------- per-second updates ---------------- */
  function updateLive(dec, p) {
    setClocks(p);
    if (dec.kind === 'board') {
      var cd = els.stage.querySelector('[data-cd]');
      if (cd) {
        var diff = Math.round((G.toMin(dec.batch.start) - p.min) * 60);
        if (diff > 0) cd.textContent = Math.floor(diff / 60) + ':' + G.pad(diff % 60);
        else { var ago = Math.floor(-diff / 60); cd.textContent = ago < 1 ? 'Now' : ago + ' min ago'; }
      }
    } else if (dec.kind === 'content') {
      if (p.s === 0) updateTicker(p);
    } else if (dec.kind === 'off' && p.s === 0 && p.mi % 2 === 0) {
      var c = els.stage.querySelector('[data-clock]');
      if (c) { c.style.left = (100 + Math.random() * 1500) + 'px'; c.style.top = (100 + Math.random() * 800) + 'px'; }
    }
  }
})();
