/*
 * Afnon Launcher for LG webOS TV: the page. Home (the arch, today's six times, favourites and more apps, the
 * radio and network pills), All apps, Prayer day with the Qibla, Settings, and the call to prayer. Ported from
 * the Android app's MainActivity, AllAppsActivity, PrayerDayActivity, SettingsActivity and NowActivity. The
 * boot script (boot/90-afnon-launcher) gives it the permissions and icons a web app can't get by itself.
 *
 * Rules for this TV (webOS 5, Chromium 68, ~320 MB free): ES5 only; every screen is built once, the first time
 * it opens, and then shown or hidden; the countdown changes one text node a second; only transform and opacity
 * animate. Focus is a class ("f") moved by our own D-pad map, as on Android (FocusMap.dc.html, swapped in RTL).
 * The launcher's own service (tv.afnon.launcher.service) does everything that must happen while the page is closed.
 */
(function () {
  'use strict';

  var P = window.Prayer, Text = window.Text, DATA = window.AfnonData;
  var TV = typeof window.PalmServiceBridge === 'function' || typeof window.PalmServiceBridge === 'object';
  /** The launcher's own service (service/), which keeps the adhan and reminders on time while the page is away. */
  var SVC = 'luna://tv.afnon.launcher.service/';
  /**
   * Named to the service in every message, so it opens this app for the call to prayer (the service once served
   * the Afnon app too): the adhan voice and the call's other settings are the launcher's own.
   */
  var APP_ID = 'tv.afnon.launcher';
  var SVG = 'http://www.w3.org/2000/svg', XLINK = 'http://www.w3.org/1999/xlink';
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461 };
  var FAJR = 0, SUNRISE = 1, DHUHR = 2, ASR = 3, MAGHRIB = 4, ISHA = 5;
  /** Minutes before a prayer when the arch switches to its approaching outline (Tokens.APPROACH_MIN). */
  var APPROACH_S = 15 * 60;
  /** How long after a prayer time the call or announcement may still happen (Reminders.CALL_WINDOW_MS). */
  var CALL_WINDOW_MS = 120000;
  /** "When the adhan ends" with no adhan playing: close after this instead (NowActivity.NO_ADHAN_CLOSE_MS). */
  var NO_ADHAN_CLOSE_MS = 60000;

  var started = Date.now();
  var stage = document.getElementById('stage');
  var html = document.documentElement;

  // In a desktop browser: the TV's objects stubbed, launch params from the query string.
  var PS = window.PalmSystem || {
    launchParams: JSON.stringify(queryParams()), locale: navigator.language, timeFormat: '',
    activate: function () {}, deactivate: function () {}, platformBack: function () {}
  };

  function queryParams() {
    var o = {};
    location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      o[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '1' : decodeURIComponent(kv.slice(i + 1));
    });
    return o;
  }

  // ---------------------------------------------------------------- luna

  var bridges = [];
  function luna(uri, params, cb) {
    if (!TV) {
      if (window.console) console.log('luna', uri, JSON.stringify(params || {}).slice(0, 200));
      if (cb) setTimeout(function () { cb({ returnValue: true, stub: true }); }, 0);
      return;
    }
    var b = new PalmServiceBridge();
    bridges.push(b);
    b.onservicecallback = function (m) {
      var i = bridges.indexOf(b);
      if (i >= 0) bridges.splice(i, 1);
      var r;
      try { r = JSON.parse(m); } catch (e) { r = { returnValue: false }; }
      if (cb) cb(r);
    };
    b.call(uri, JSON.stringify(params || {}));
  }
  function note(s) { luna(SVC + 'note', { text: s }); }

  // ---------------------------------------------------------------- settings (localStorage "afnon")

  var DEFAULTS = {
    locale: 'system', digits: '', clock: 'system', city: 'cairo', method: null, madhab: 'shafi', hijri: 0,
    facing: -1, remind: 15, remindVoice: true, announce: true, adhan: true, callClose: 10,
    bells: [1, 0, 1, 1, 1, 1], voice: 'alafasy', voiceFajr: 'chebae_fajr', station: 'nablus', radioResume: true,
    radioDark: 0, night: false, liveQuality: 480, favs: null,
    // Minutes added to Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha (Settings → Adjust the times).
    adjust: [0, 0, 0, 0, 0, 0],
    // Minutes before the current prayer's time ends for «أوشك وقت صلاة … على الانتهاء»; 0 is off.
    endRemind: 15
  };
  var S = loadSettings();

  function loadSettings() {
    var o = {}, s = {};
    try { o = JSON.parse(localStorage.getItem('afnon') || '{}') || {}; } catch (e) { o = {}; }
    for (var k in DEFAULTS) s[k] = o[k] !== undefined ? o[k] : DEFAULTS[k];
    if (!s.bells || s.bells.length !== 6) s.bells = DEFAULTS.bells.slice();
    if (!s.adjust || s.adjust.length !== 6) s.adjust = DEFAULTS.adjust.slice();
    return s;
  }
  function saveSettings() {
    try { localStorage.setItem('afnon', JSON.stringify(S)); } catch (e) { /* private mode: this session only */ }
  }

  // ---------------------------------------------------------------- language, clock, place

  var t, rtl, h24, city, clock;
  var tvLocale = String(PS.locale || navigator.language || 'en');

  function tvH24() {
    var f = String(PS.timeFormat || '');
    if (/24/.test(f)) return true;
    if (/12/.test(f)) return false;
    try { return new Intl.DateTimeFormat(tvLocale, { hour: 'numeric' }).resolvedOptions().hour12 === false; } catch (e) { return false; }
  }

  /** Everything that follows from the settings: Text, direction, 12/24 h, the city and its clock. */
  function derive() {
    var ar = S.locale === 'system' ? /^ar/i.test(tvLocale) : S.locale === 'ar';
    var eastern = S.digits === '' ? ar : S.digits === 'eastern';
    rtl = ar;
    h24 = S.clock === 'system' ? tvH24() : S.clock === '24';
    city = P.cityById(S.city);
    // cityclock=1 (desktop previews and screenshots): the city's own clock even where the browser has another zone.
    clock = launchParams().cityclock ? new P.Clock(city, false) : P.clockFor(city);
    t = new Text(ar, eastern);
    t.cityName = ar ? city.ar : city.en;
    html.lang = ar ? 'ar' : 'en';
    html.dir = ar ? 'rtl' : 'ltr';
    html.className = (h24 ? 'h24' : 'h12') + (S.night ? ' night' : '') + (ar && !eastern ? ' latn' : '');
  }

  /** Night mode: one class on <html> swaps the colour set (css/afnon.css); nothing is rebuilt. */
  function setNight(on) {
    S.night = !!on;
    saveSettings();
    html.classList.toggle('night', S.night);
    if (home.nightIcon) setIcon(home.nightIcon, S.night ? 'sun' : 'night');
    if (cur === home.night) home.night._focus();
    if (screen === set) refreshSettings();
  }

  function method() { return S.method || city.method; }

  // ---------------------------------------------------------------- the prayer day (PrayerDay.java)

  var hijriFmt = null;
  /** The Umm al-Qura date of a calendar day (month 0-based), as Android's ICU IslamicCalendar gives it. */
  function hijriOf(y, m, d) {
    try {
      if (!hijriFmt) hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric' });
      var o = {};
      hijriFmt.formatToParts(new Date(Date.UTC(y, m, d, 12))).forEach(function (p) { o[p.type] = parseInt(p.value, 10); });
      if (o.month) return { day: o.day, month: o.month - 1, year: o.year };
    } catch (e) { /* below */ }
    // No Intl calendar: the tabular (Kuwaiti) calendar, at most a day off Umm al-Qura.
    var jd = Math.floor(Date.UTC(y, m, d) / 86400000) + 2440588;
    var l = jd - 1948440 + 10632, n = Math.floor((l - 1) / 10631);
    l = l - 10631 * n + 354;
    var j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    var mo = Math.floor((24 * l) / 709);
    return { day: l - Math.floor((709 * mo) / 24), month: mo - 1, year: 30 * n + j - 30 };
  }

  /** One moment's view of the day: the six times, the current and next prayer, Friday, Ramadan, the Qibla. */
  function dayAt(now) {
    var s = { method: method(), madhab: S.madhab, adjust: S.adjust };
    var today = P.timesFor(s, clock, now, 0), tomorrow = P.timesFor(s, clock, now, 1);
    var times = today.slice(), latest = -1, next = -1, i;
    for (i = 0; i < 6; i++) if (times[i] <= now) latest = i;
    for (i = 0; i < 6; i++) if (i !== SUNRISE && times[i] > now) { next = i; break; }
    if (next < 0) { next = FAJR; times[FAJR] = tomorrow[FAJR]; }
    var wall = clock.wall(now);
    // The Hijri day begins at Maghrib: from then until midnight the date and weekday are the next day's (Friday
    // evening is ليلة السبت). Ramadan follows it, so its first night has a suhoor and the night of Eid has none.
    var eve = now >= today[MAGHRIB] ? 1 : 0;
    var h = hijriOf(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + eve + (S.hijri | 0));
    var weekday = (wall.getUTCDay() + eve) % 7;
    return {
      times: times, nowIndex: latest === SUNRISE ? -1 : latest, nextIndex: next, nextTime: times[next],
      suhoorEnd: today[FAJR] > now ? today[FAJR] : tomorrow[FAJR],
      // Jumu'ah is the Friday noon prayer: it names Dhuhr on Friday until its Maghrib, when the Hijri Saturday
      // begins and the strip says الظهر again (Afnon's TCL build). Surat al-Kahf follows the Hijri Friday,
      // Thursday's Maghrib to Friday's.
      friday: wall.getUTCDay() === 5 && !eve, kahf: weekday === 5, weekday: weekday,
      hijriDay: h.day, hijriMonth: h.month, hijriYear: h.year, ramadan: h.month === 8,
      qibla: P.qibla(city.lat, city.lng), wall: wall
    };
  }

  function names(day) {
    var n = t.prayerNames();
    if (day.friday) n[DHUHR] = t.jumuah();
    return n;
  }
  /** The Hijri date with its weekday, which turns at Maghrib with it ("السبت 13 جمادى الأولى 1448 هـ"). */
  function hijriText(day) {
    return t.d(t.weekdays()[day.weekday] + ' ' + day.hijriDay + ' ' + t.hijriMonths()[day.hijriMonth] + ' ' +
      day.hijriYear + t.hijriSuffix());
  }

  // ---------------------------------------------------------------- DOM helpers

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  /** Places at a design rect measured from the start edge, so Arabic mirrors it (Screen.place). */
  function place(e, x, y, w, h) {
    e.style.position = 'absolute';
    e.style.top = y + 'px';
    e.style[rtl ? 'right' : 'left'] = x + 'px';
    if (w != null) e.style.width = w + 'px';
    if (h != null) e.style.height = h + 'px';
    return e;
  }
  /** Measured from the end edge (Screen.placeEnd). */
  function placeEnd(e, inset, y, w, h) {
    e.style.position = 'absolute';
    e.style.top = y + 'px';
    e.style[rtl ? 'left' : 'right'] = inset + 'px';
    if (w != null) e.style.width = w + 'px';
    if (h != null) e.style.height = h + 'px';
    return e;
  }
  /** Changes a text only when it differs, as one text node. */
  function setText(e, s) {
    s = s == null ? '' : String(s);
    if (e._t === s) return;
    e._t = s;
    if (e.childNodes.length === 1 && e.firstChild.nodeType === 3) e.firstChild.nodeValue = s;
    else e.textContent = s;
  }
  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(SVG, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function icon(name, size, stroke, extra) {
    var s = svgEl('svg', { viewBox: '0 0 24 24', 'class': 'ic' + (extra ? ' ' + extra : ''), width: size, height: size });
    s.style.strokeWidth = stroke;
    var u = svgEl('use', {}, s);
    u.setAttributeNS(XLINK, 'href', '#i-' + name);
    return s;
  }
  function setIcon(s, name) {
    if (s._i === name) return;
    s._i = name;
    s.firstChild.setAttributeNS(XLINK, 'href', '#i-' + name);
  }
  /** A clock time: the digits and, in 12-hour, a smaller marker (ص/م, AM/PM). */
  function timeEl(parent, cls) {
    var e = el('span', cls, parent);
    e.appendChild(document.createTextNode(''));
    el('span', 'm', e).appendChild(document.createTextNode(''));
    return e;
  }
  function setTime(e, ms) {
    var p = t.clockParts(clock.wall(ms), h24);
    var key = p.hm + '|' + p.marker;
    if (e._t === key) return;
    e._t = key;
    e.firstChild.nodeValue = p.marker ? p.hm + ' ' : p.hm;
    e.lastChild.firstChild.nodeValue = p.marker;
  }
  function clockText(ms) { return t.clock(clock.wall(ms), h24); }

  /** The key hints along the bottom, 40px apart. */
  function hintsEl(parent, x, y) {
    var e = place(el('div', 'hints', parent), x, y);
    for (var i = 0; i < 3; i++) el('span', null, e);
    return e;
  }
  function setHints(e, list) {
    for (var i = 0; i < 3; i++) {
      var s = e.childNodes[i];
      setText(s, list[i] || '');
      s.style.display = list[i] ? '' : 'none';
    }
  }

  // ---------------------------------------------------------------- focus

  var cur = null;
  function focus(e) {
    if (!e || cur === e) return;
    if (cur) cur.classList.remove('f');
    cur = e;
    e.classList.add('f');
    if (e._focus) e._focus();
  }
  function blur() {
    if (cur) cur.classList.remove('f');
    cur = null;
  }

  // ---------------------------------------------------------------- screens

  var screens = {}, screen = null;
  function show(name) {
    var s = screens[name];
    if (!s.built) { s.build(); s.built = true; }
    if (screen && screen !== s) {
      screen.el.classList.remove('on');
      if (screen.hide) screen.hide();
    }
    screen = s;
    s.el.classList.add('on');
    if (s.show) s.show();
    tellService();
    tick(true);
  }

  // ---------------------------------------------------------------- the arch (Screen.buildArch)

  /** The mihrab: a 600×900 pointed arch at scale k (design/Home.dc.html path). */
  function archD(k) {
    function p(x, y) { return (x * k).toFixed(1) + ' ' + (y * k).toFixed(1); }
    return {
      outer: 'M' + p(0, 900) + 'L' + p(0, 330) + 'C' + p(0, 170) + ' ' + p(140, 70) + ' ' + p(300, 0) +
        'C' + p(460, 70) + ' ' + p(600, 170) + ' ' + p(600, 330) + 'L' + p(600, 900) + 'Z',
      inner: 'M' + p(18, 900) + 'L' + p(18, 334) + 'C' + p(18, 184) + ' ' + p(150, 92) + ' ' + p(300, 22) +
        'C' + p(450, 92) + ' ' + p(582, 184) + ' ' + p(582, 334) + 'L' + p(582, 900)
    };
  }
  function archSvg(parent, x, y, w, h, k, cls) {
    var s = svgEl('svg', { width: w, height: h, 'class': 'arch' + (cls ? ' ' + cls : '') }, parent);
    s.style.overflow = 'hidden';
    var d = archD(k);
    svgEl('path', { d: d.outer, 'class': 'fillp' }, s);
    svgEl('path', { d: d.inner, 'class': 'inner' }, s);
    svgEl('path', { d: d.outer, 'class': 'edge' }, s);
    place(s, x, y);
    return s;
  }

  function buildArch(parent, infoTop, subSize, subGap, sub2Color, sub2Gap) {
    var a = { state: '' };
    a.svg = archSvg(parent, 96, 120, 600, 900, 1, '');
    var verse = place(el('div', 'sacred verse center', parent), 156, 238, 480);
    verse.style.whiteSpace = 'pre-line';
    verse.textContent = 'إِنَّ الصَّلَاةَ كَانَتْ\nعَلَى الْمُؤْمِنِينَ\nكِتَابًا مَّوْقُوتًا';
    var ref = place(el('div', 'mist center', parent, t.ref()), 156, 410, 480);
    ref.style.fontSize = '20px';
    var rule = place(el('div', null, parent), 336, 460, 120, 2);
    rule.style.background = 'var(--gold)';
    rule.style.opacity = '0.6';
    var info = place(el('div', 'archinfo', parent), 136, infoTop, 520);
    a.label = el('div', 'lbl caps mist', info);
    a.name = el('div', 'name dispb', info);
    a.count = el('div', 'count disp num tnum ltr', info);
    a.sub = el('div', 'sub', info);
    a.sub.style.fontSize = subSize + 'px';
    a.sub.style.marginTop = subGap + 'px';
    a.sub2 = el('div', 'sub2', info);
    a.sub2.style.fontSize = '24px';
    a.sub2.style.color = sub2Color;
    a.sub2.style.marginTop = sub2Gap + 'px';
    return a;
  }

  /** mm:ss under an hour at 150px, h:mm:ss above at 120px; gold-200 outline inside the last 15 minutes. */
  function renderCountdown(a, day, now, focused) {
    var left = Text.secondsUntil(day.nextTime, now);
    var count = t.d(Text.duration(left, true));
    setText(a.count, count);
    var hours = left >= 3600;
    if (a.hours !== hours) { a.hours = hours; a.count.classList.toggle('h', hours); a.head = null; }
    // Marcellus has no tabular digits (its 0 is nearly three 1s wide), so a centred countdown would sway every
    // second. It starts where the text is centred with average-width seconds, set again only when something
    // before the seconds changes: a digit that isn't changing never moves (Screen.renderCountdown).
    if (!marcellusDigits()) {
      if (a.head !== '') { a.head = ''; a.count.style.paddingLeft = ''; a.count.style.fontSize = ''; }
    } else {
      var head = count.slice(0, -2);
      if (head !== a.head) {
        // Ten hours or more ("10:00:00" is 575px at 120px) would overflow the 520px arch: a little smaller until it
        // fits (Afnon's TCL fix). Measured with the minutes and seconds as zeros, the widest digit in Marcellus, so
        // the size changes at most when the hour does, never every second.
        var px = hours ? 120 : 150, zeros = textWidth(count.replace(/[0-9]{2}:[0-9]{2}$/, '00:00'), px);
        if (zeros > 500) px = Math.floor(px * 500 / zeros);
        a.count.style.fontSize = px === (hours ? 120 : 150) ? '' : px + 'px';
        var w = textWidth(head, px) + textWidth('0123456789', px) / 5;
        a.count.style.paddingLeft = Math.max(0, Math.round((520 - w) / 2)) + 'px';
        // Until the font has loaded, the width is the fallback's: measure again next second.
        a.head = document.fonts && document.fonts.status !== 'loaded' ? null : head;
      }
    }
    var st = left <= APPROACH_S ? 'near' : focused ? 'focused' : '';
    if (a.state !== st) { a.state = st; a.svg.setAttribute('class', 'arch ' + st); }
    return left;
  }

  /** Whether the big numbers are in Marcellus: English, or Arabic with Western digits (html.latn). */
  function marcellusDigits() { return !t.ar || !t.eastern; }

  var measure = null;
  /** The width of s in Marcellus (Amiri for what it lacks) at px, from a canvas: no layout. */
  function textWidth(s, px) {
    if (!measure) measure = document.createElement('canvas').getContext('2d');
    measure.font = px + 'px Marcellus, Amiri, serif';
    return measure.measureText(s).width;
  }

  // ---------------------------------------------------------------- sound: one radio player, one for the rest

  var radioA = document.getElementById('radioPlayer');
  var soundA = document.getElementById('soundPlayer');

  var Radio = { OFF: 0, CONNECTING: 1, PLAYING: 2, RETRYING: 3, PAUSED: 4, state: 0, wanted: false, failures: 0, timer: 0, since: 0, listeners: [] };

  function stationIndex() {
    for (var i = 0; i < DATA.STATIONS.length; i++) if (DATA.STATIONS[i].id === S.station) return i;
    return 0;
  }
  function station() { return DATA.STATIONS[stationIndex()]; }

  function radioSet(s) {
    if (Radio.state === s) return;
    Radio.state = s;
    for (var i = 0; i < Radio.listeners.length; i++) Radio.listeners[i](s);
  }
  function radioRelease() {
    clearTimeout(Radio.timer);
    if (radioA.getAttribute('src')) {
      radioA.pause();
      radioA.removeAttribute('src');
      radioA.load();
    }
  }
  function radioConnect() {
    clearTimeout(Radio.timer);
    if (!Radio.wanted) return;
    radioRelease();
    radioSet(Radio.failures ? Radio.RETRYING : Radio.CONNECTING);
    Radio.since = Date.now();
    radioA.src = station().url;
    var p = radioA.play();
    if (p && p.catch) p.catch(function (e) { if (Radio.wanted && radioA.getAttribute('src')) radioRetry('play: ' + e.name); });
    // A stream that never starts counts as a drop.
    Radio.timer = setTimeout(function () { if (Radio.state !== Radio.PLAYING) radioRetry('no sound after 25 s'); }, 25000);
  }
  /** Waits a little longer each time (3 s, 6 s … up to 30 s) and tries again, for as long as it is wanted. */
  function radioRetry(why) {
    radioRelease();
    if (!Radio.wanted) return;
    Radio.failures++;
    note('radio ' + station().id + ' retry ' + Radio.failures + ': ' + why);
    radioSet(Radio.RETRYING);
    Radio.timer = setTimeout(radioConnect, Math.min(30000, 3000 * Radio.failures));
  }
  function radioStart() {
    if (Radio.wanted) return;
    liveStop();
    Radio.wanted = true;
    Radio.failures = 0;
    radioConnect();
  }
  function radioStop() {
    Radio.wanted = false;
    radioRelease();
    radioSet(Radio.OFF);
  }
  function radioToggle() { if (Radio.wanted) radioStop(); else radioStart(); }
  /** The adhan (or a preview) takes the sound: a live stream can't pause, so drop it and reconnect later. */
  function radioHold() {
    if (!Radio.wanted || Radio.state === Radio.PAUSED) return false;
    radioRelease();
    radioSet(Radio.PAUSED);
    return true;
  }
  function radioResume(resume) {
    if (Radio.state !== Radio.PAUSED) return;
    if (resume) { Radio.failures = 0; radioConnect(); } else radioStop();
  }
  function radioSwitch(i) {
    S.station = DATA.STATIONS[i].id;
    saveSettings();
    if (Radio.wanted) { Radio.failures = 0; radioConnect(); }
    for (var k = 0; k < Radio.listeners.length; k++) Radio.listeners[k](Radio.state);
  }
  radioA.addEventListener('playing', function () {
    if (!Radio.wanted) return;
    clearTimeout(Radio.timer);
    if (Radio.state !== Radio.PLAYING) note('radio ' + station().id + ' playing after ' + ((Date.now() - Radio.since) / 1000).toFixed(1) + ' s');
    Radio.failures = 0;
    radioSet(Radio.PLAYING);
  });
  radioA.addEventListener('error', function () {
    if (!Radio.wanted || !radioA.getAttribute('src')) return;
    radioRetry('error ' + (radioA.error ? radioA.error.code : '?'));
  });
  // A live stream never ends; if it does, the connection dropped.
  radioA.addEventListener('ended', function () { if (Radio.wanted) radioRetry('ended'); });

  var Sound = { kind: null, onEnd: null };
  /** The adhan, a voice preview or a spoken clip, on the second player. onEnd(ok) when it ends or fails. */
  function playSound(url, kind, onEnd) {
    stopSound();
    Sound.kind = kind;
    Sound.onEnd = onEnd || null;
    soundA.src = url;
    var p = soundA.play();
    if (p && p.catch) p.catch(function (e) { if (Sound.kind === kind) { note('sound ' + kind + ' failed: ' + e.name); soundDone(false); } });
  }
  function stopSound() {
    if (!Sound.kind) return;
    Sound.kind = null;
    Sound.onEnd = null;
    soundA.pause();
    soundA.removeAttribute('src');
    soundA.load();
    radioA.volume = 1;
  }
  function soundDone(ok) {
    var cb = Sound.onEnd;
    stopSound();
    if (cb) cb(ok);
  }
  soundA.addEventListener('ended', function () { if (Sound.kind) soundDone(true); });
  soundA.addEventListener('playing', function () {
    if (Sound.kind && Sound.kind !== 'clip') note('sound ' + Sound.kind + ' playing ' + String(soundA.getAttribute('src')).split('/').pop() + ' (' + Math.round(soundA.duration || 0) + ' s long)');
  });
  soundA.addEventListener('error', function () { if (Sound.kind && soundA.getAttribute('src')) soundDone(false); });

  /**
   * A spoken line (Announce.java): before_/now_/end_ + the prayer, jumuah for Friday Dhuhr. The radio is lowered.
   * Jumu'ah is said with Dhuhr's recordings for now (JUMUAH_CLIPS, as in the service): Lutfi Khamis recorded
   * Dhuhr's lines, and Jumu'ah's own are still the old computer voice. There is no end_jumuah at all.
   */
  var CLIPS = ['fajr', null, 'dhuhr', 'asr', 'maghrib', 'isha'];
  var JUMUAH_CLIPS = false;
  // The reminder before the prayer says «حان الآن» in Lutfi Khamis's voice for now (BEFORE_AS_NOW, as in the
  // service): «اقترب موعد» exists only in the old computer voice.
  var BEFORE_AS_NOW = true;
  function speak(kind, prayer, friday) {
    var name = CLIPS[prayer];
    if (!name || (Sound.kind && Sound.kind !== 'clip')) return;
    if (kind === 'before_' && BEFORE_AS_NOW) kind = 'now_';
    if (JUMUAH_CLIPS && friday && prayer === DHUHR && kind !== 'end_') name = 'jumuah';
    radioA.volume = 0.3;
    playSound('sounds/announce/' + kind + name + '.wav', 'clip');
  }

  // ---------------------------------------------------------------- live from Makkah and Madinah (Live.java)

  /**
   * The live video from Makkah and Madinah for Home's panel: Aloula's (aloula.sba.sa, the Saudi Broadcasting
   * Authority) Quran channel (7) and Sunnah channel (6), H.264 and AAC over HLS, which webOS plays in a <video>.
   * Each start asks Aloula's player API for a fresh master playlist (its token lasts minutes, so it is never kept),
   * takes the rendition for the saved quality (S.liveQuality, else the nearest below) and, when it answers, that
   * rendition's live list (three segments) in place of its six-hour DVR list (~3600, 300 KB, read every few
   * seconds). The CDN ties each rendition to the User-Agent that read the master; here both are the page's own.
   * One try: a failure says so. The <video> exists only while one plays, so a stopped one holds no decoder.
   */
  var Live = {
    OFF: 0, CONNECTING: 1, PLAYING: 2, FAILED: 3, CHANNELS: [7, 6],
    API: 'https://aloula.faulio.com/api/v1.1/channels/',
    state: 0, place: -1, gen: 0, renditions: [], height: 0, v: null, timer: 0, since: 0, full: false,
    switching: false, refetched: false, listeners: []
  };

  function liveGet(url, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url);
    x.timeout = 8000;
    x.onload = function () { cb(x.status === 200 ? x.responseText : null); };
    x.onerror = x.ontimeout = function () { cb(null); };
    x.send();
  }
  function liveSet(s) {
    Live.state = s;
    for (var i = 0; i < Live.listeners.length; i++) Live.listeners[i](s);
  }
  /** The rendition of that height, or the nearest below it, or the lowest there is (renditions lowest first). */
  function liveChoose(h) {
    var pick = Live.renditions[0];
    Live.renditions.forEach(function (r) { if (r.height <= h && r.height > pick.height) pick = r; });
    return pick;
  }

  /** Stops whatever plays (the radio too) and starts Makkah (0) or Madinah (1). */
  function liveStart(which) {
    liveRelease();
    if (Radio.wanted) radioStop();
    Live.place = which;
    Live.renditions = [];
    Live.height = 0;
    Live.switching = Live.refetched = false;
    Live.since = Date.now();
    liveSet(Live.CONNECTING);
    liveFetch(S.liveQuality);
  }

  /** Reads a fresh master playlist and its renditions, then plays the one for quality. */
  function liveFetch(quality) {
    var gen = ++Live.gen, ch = Live.CHANNELS[Live.place];
    liveGet(Live.API + ch + '/player', function (body) {
      if (gen !== Live.gen) return;
      var master = null;
      try { master = JSON.parse(body).streams.hls; } catch (e) { /* below */ }
      if (!master) return liveFail('no address from Aloula');
      liveGet(master, function (m) {
        if (gen !== Live.gen) return;
        var list = [], lines = String(m || '').split('\n');
        for (var i = 0; i + 1 < lines.length; i++) {
          var info = lines[i], uri = lines[i + 1].trim();
          if (info.indexOf('#EXT-X-STREAM-INF:') !== 0 || !uri || uri.charAt(0) === '#') continue;
          var h = /RESOLUTION=\d+x(\d+)/.exec(info), b = /(?:^|[:,])BANDWIDTH=(\d+)/.exec(info);
          list.push({ height: h ? +h[1] : 0, bandwidth: b ? +b[1] : 0, url: new URL(uri, master).toString() });
        }
        if (!m) return liveFail('no master playlist');
        if (!list.length) list.push({ height: 0, bandwidth: 0, url: master });
        list.sort(function (x, y) { return x.height - y.height; });
        var dvr = '/chunks_dvr.m3u8', liveList = '/chunks.m3u8';
        function play() {
          Live.renditions = list;
          var r = liveChoose(quality);
          Live.height = r.height;
          liveLoad(r.url);
        }
        if (list[0].url.indexOf(dvr) < 0) return play();
        liveGet(list[0].url.replace(dvr, liveList), function (l) {
          if (gen !== Live.gen) return;
          if (l && l.indexOf('#EXTM3U') === 0) list.forEach(function (x) { x.url = x.url.replace(dvr, liveList); });
          play();
        });
      });
    });
  }

  /** Plays url on the panel's <video>, made now if there is none. */
  function liveLoad(url) {
    var gen = ++Live.gen, v = Live.v;
    if (!v) {
      // Under the panel's message and full-screen hint.
      v = Live.v = document.createElement('video');
      home.panel.insertBefore(v, home.panel.firstChild);
      v.addEventListener('playing', function () {
        if (Live.v !== v || Live.state === Live.PLAYING) return;
        clearTimeout(Live.timer);
        note('live ' + Live.CHANNELS[Live.place] + ' ' + Live.height + 'p playing after ' + ((Date.now() - Live.since) / 1000).toFixed(1) + ' s');
        Live.switching = false;
        liveSet(Live.PLAYING);
      });
      v.addEventListener('error', function () {
        if (Live.v !== v || !v.getAttribute('src')) return;
        // A rendition's token may have run out: a fresh master, once, for the quality just picked.
        if (Live.switching && !Live.refetched) { Live.refetched = true; liveFetch(Live.height); }
        else liveFail('error ' + (v.error ? v.error.code : '?'));
      });
      // A live stream never ends; if it does, the connection dropped. One try: it stops.
      v.addEventListener('ended', function () { if (Live.v === v) liveFail('ended'); });
    }
    clearTimeout(Live.timer);
    Live.timer = setTimeout(function () { if (gen === Live.gen && Live.state !== Live.PLAYING) liveFail('no picture after 25 s'); }, 25000);
    v.src = url;
    var p = v.play();
    if (p && p.catch) p.catch(function (e) { if (gen === Live.gen && e.name !== 'AbortError') liveFail('play: ' + e.name); });
  }

  /** Another quality (a picture height), saved for next time; a playing stream moves to it at once. */
  function liveQuality(h) {
    S.liveQuality = h;
    saveSettings();
    if (!Live.v || !Live.renditions.length) return;
    var r = liveChoose(h);
    if (r.height === Live.height) return;
    Live.height = r.height;
    Live.switching = true;
    Live.since = Date.now();
    liveSet(Live.CONNECTING);
    liveLoad(r.url);
  }

  function liveRelease() {
    Live.gen++;
    clearTimeout(Live.timer);
    var v = Live.v;
    if (!v) return;
    Live.v = null;
    v.pause();
    v.removeAttribute('src');
    v.load();
    if (v.parentNode) v.parentNode.removeChild(v);
  }
  /** Couldn't play: everything is released, and the panel says so until it is stopped. */
  function liveFail(why) {
    note('live ' + Live.CHANNELS[Live.place] + ' failed: ' + why);
    liveRelease();
    liveSet(Live.FAILED);
  }
  /** Stops and releases everything; Home's strip and radio card come back. */
  function liveStop() {
    if (Live.place < 0) return;
    liveRelease();
    Live.place = -1;
    liveSet(Live.OFF);
  }

  // ---------------------------------------------------------------- Home (MainActivity)

  var home = screens.home = {
    lastMinute: -1, day: null, shift: 0, archFocused: false, lastRadio: null, card: null,
    build: buildHome,
    show: function () { if (!home.card) focus(home.foot); },
    // The live video plays only on Home: Today's prayers, Settings, the call or the black screen stop it.
    hide: function () { liveStop(); }
  };

  function buildHome() {
    var e = home.el = el('div', 'screen', stage);
    e.id = 'home';
    home.arch = buildArch(e, 488, 26, 12, 'var(--gold2)', 8);

    var foot = home.foot = place(el('div', 't archfoot', e), 176, 904, 440, 72);
    foot.appendChild(icon('compass', 30, 1.8));
    el('span', null, foot, t.today());
    foot._ok = function () { openDay(); };

    var when = place(el('div', 'col when', e), 760, 56);
    home.clock = timeEl(when, 'clock disp num tnum');
    // Under the clock the Hijri date (with the city) first, then the Gregorian, smaller and in mist.
    home.date1 = el('div', null, when);
    home.date1.style.marginTop = '6px';
    home.date2 = el('div', 'mist', when);
    home.date2.style.cssText = 'margin-top:6px;font-size:24px';

    var gear = home.gear = placeEnd(el('div', 't gear', e), 96, 56, 72, 72);
    gear.appendChild(icon('gear', 34, 1.8));
    gear._ok = function () { openSettings(); };
    // Night mode, beside Settings: a full moon with a star while it is off, a sun while it is on.
    var night = home.night = placeEnd(el('div', 't gear', e), 96 + 72 + 20, 56, 72, 72);
    home.nightIcon = icon(S.night ? 'sun' : 'night', 34, 1.8);
    night.appendChild(home.nightIcon);
    night._ok = function () { setNight(!S.night); };
    night._focus = function () { setArchFocused(false); setHints(home.hints, [t.hintOk(S.night ? t.nightOff() : t.nightOn())]); };

    // Live, Radio and Wi-Fi side by side, ending 20px before the night button (MainActivity).
    var pills = placeEnd(el('div', 'pills', e), 96 + 2 * (72 + 20), 56, null, 72);
    // Live from Makkah and Madinah: its list picks one (or Stop while one is on).
    var livePill = home.livePill = el('div', 't pill livepill', pills);
    livePill.appendChild(icon('live', 30, 1.8));
    el('span', 'gap', livePill);
    el('span', null, livePill, t.live());
    livePill._ok = chooseLive;
    livePill._focus = function () {
      setArchFocused(false);
      setHints(home.hints, [t.hintOk(Live.place < 0 ? t.livePlaces()[0] : t.liveTitle())]);
    };
    // Radio: a broadcast icon and «الإذاعة» when off; level bars and its state (gold outline) when on. OK opens its card.
    var radioPill = home.radioPill = el('div', 't pill livepill', pills);
    home.pillIcon = icon('radio', 30, 1.8);
    radioPill.appendChild(home.pillIcon);
    home.pillBars = bars(radioPill, 3, 22, 22);
    home.pillBars.style.margin = '0 4px';
    home.pillBars.style.color = 'var(--gold)';
    el('span', 'gap', radioPill);
    home.pillLabel = el('span', null, radioPill, t.radio());
    radioPill._ok = openRadioCard;
    radioPill._focus = function () { setArchFocused(false); setHints(home.hints, [t.hintOk(t.station(station()))]); };
    // Wi-Fi: the network's name; OK opens the TV's network settings.
    var wifi = home.wifi = el('div', 't pill livepill', pills);
    wifi.appendChild(icon('wifi', 30, 1.8));
    el('span', 'gap', wifi);
    home.wifiName = el('span', 'ssid nowrap ltr', wifi, 'Wi-Fi');
    wifi._ok = function () { launchApp('com.palm.app.settings', { target: 'network' }); };
    wifi._focus = function () { setArchFocused(false); setHints(home.hints, [t.hintOk(t.network())]); };

    // The prayer strip: information only, never focusable.
    var cw = (1064 - 5 * 12) / 6;
    home.cells = [];
    for (var i = 0; i < 6; i++) {
      var c = place(el('div', 'cell', e), 760 + i * (cw + 12), 290, cw, 146);
      home.cells.push({ el: c, tag: el('div', 'tag caps', c), nm: el('div', 'nm', c), tm: timeEl(c, 'tm tnum'), cls: '' });
    }

    buildHomeApps(e);
    buildLivePanel(e);
    buildRadioCard(e);
    home.hints = hintsEl(e, 760, 962);

    foot._focus = function () { setArchFocused(true); setHints(home.hints, [t.hintOk(t.today()), t.hintApps()]); };
    gear._focus = function () { setArchFocused(false); setHints(home.hints, [t.hintOk(t.settings())]); };
    home.header = [livePill, radioPill, wifi, night, gear];
    home.ready = true;
    styleRadio();
    updateWifi();
  }

  function setArchFocused(f) {
    home.archFocused = f;
    if (home.day) renderCountdown(home.arch, home.day, Date.now() + home.shift, f);
  }

  /** Bars: rounded bars from a common baseline, resting as steps (RadioBars.REST), breathing while it plays. */
  function bars(parent, count, w, h) {
    var REST = [0.35, 0.6, 0.45, 0.75, 0.3];
    var b = el('div', 'bars', parent);
    b.style.width = w + 'px';
    b.style.height = h + 'px';
    var gap = w / (count * 3 - 1), bar = gap * 2;
    for (var i = 0; i < count; i++) {
      var x = el('i', null, b);
      x.style.width = bar.toFixed(1) + 'px';
      x.style.borderRadius = (bar / 2).toFixed(1) + 'px';
      if (i) x.style.marginLeft = gap.toFixed(1) + 'px';
      x._rest = REST[count >= 5 ? i : Math.min(4, i + 1)];
      x.style.transform = 'scaleY(' + x._rest + ')';
    }
    return b;
  }
  function setBarsLive(b, live) {
    if (b._live === live) return;
    b._live = live;
    b.classList.toggle('live', live);
    for (var i = 0; i < b.childNodes.length; i++) {
      var x = b.childNodes[i];
      x.style.transform = live ? '' : 'scaleY(' + x._rest + ')';
    }
  }

  /**
   * The card under the Radio pill (MainActivity.showRadioCard): the station, its state and live bars; Play/Stop
   * (focused), Station and Screen off. It hangs from the header, end-aligned with Settings, over the dates and the
   * prayer strip. Back closes it and the radio carries on.
   */
  function buildRadioCard(parent) {
    var r = home.radio = placeEnd(el('div', 'radio pop', parent), 96, 56 + 72 + 24, 720);
    var top = el('div', 'row', r);
    home.bars = bars(top, 5, 72, 64);
    home.bars.style.color = 'var(--gold)';
    var words = el('div', 'words col', top);
    el('div', 'lbl caps', words, t.radio());
    home.rTitle = el('div', 'title dispb nowrap', words);
    home.rStatus = el('div', 'status nowrap', words);
    var btns = el('div', 'btns', r);
    var play = home.play = el('div', 't rbtn', btns);
    home.playIcon = icon('play', 26, 2);
    play.appendChild(home.playIcon);
    el('span', 'gap', play);
    home.playLabel = el('span', 'plbl', play);
    play._ok = radioToggle;
    var pick = home.pick = el('div', 't rbtn', btns);
    pick.appendChild(icon('radio', 26, 2));
    el('span', 'gap', pick);
    el('span', null, pick, t.stationRow());
    pick._ok = function () { chooseStation(); };
    // Screen off while listening (ScreenOffActivity): it starts the radio if it isn't on.
    var dark = home.dark = el('div', 't rbtn', btns);
    dark.appendChild(icon('moon', 26, 2));
    el('span', 'gap', dark);
    el('span', null, dark, t.screenOff());
    dark._ok = function () { closeRadioCard(true); screenOff(true); };
    el('div', 'note', r, t.radioNoteLg());
    play._focus = pick._focus = dark._focus = function () { setArchFocused(false); radioHints(); };
    home.cardBtns = [play, pick, dark];
    Radio.listeners.push(styleRadio);
  }

  function openRadioCard() {
    if (home.rcOpen || home.card) return;
    home.rcOpen = true;
    home.radio.classList.add('open');
    styleRadio();
    focus(home.play);
  }
  function closeRadioCard(focusPill) {
    if (!home.rcOpen) return;
    home.rcOpen = false;
    home.radio.classList.remove('open');
    if (focusPill) focus(home.radioPill);
  }
  /** ◀▶ move along the three buttons (mirrored in Arabic); Back closes the card. */
  function radioCardKey(k) {
    if (k === KEY.BACK) return closeRadioCard(true);
    if (k === KEY.OK) { if (cur && cur._ok) cur._ok(); return; }
    var i = home.cardBtns.indexOf(cur);
    if (i < 0) return focus(home.play);
    var toEnd = (k === KEY.RIGHT) !== rtl, toStart = (k === KEY.LEFT) !== rtl;
    if (k !== KEY.LEFT && k !== KEY.RIGHT) return;
    if (toEnd && i < 2) focus(home.cardBtns[i + 1]);
    else if (toStart && i > 0) focus(home.cardBtns[i - 1]);
  }

  /**
   * The live panel: 16:9 across the courtyard where the prayer strip and the radio card were (they come back when
   * it stops); the clock, dates and arch stay. Under it the place and state, Full screen, the other mosque and
   * Stop. Full screen lays the same <video> over the whole screen.
   */
  function buildLivePanel(parent) {
    home.panel = place(el('div', 'livepanel', parent), 760, 280, 1064, 598);
    home.panelMsg = el('div', 'msg', home.panel);
    home.fullHint = el('div', 'fullhint', home.panel, t.fullScreenHint());
    var bar = home.liveBar = place(el('div', 'livebar', parent), 760, 892, 1064, 60);
    home.liveWords = el('div', 'words nowrap', bar);
    function btn(iconName, label, ok) {
      var b = el('div', 't rbtn', bar);
      b.appendChild(icon(iconName, 24, 2));
      el('span', 'gap', b);
      b._label = el('span', null, b, label);
      b._ok = ok;
      b._focus = function () { setArchFocused(false); setHints(home.hints, [t.hintOk(b._label.textContent)]); };
      return b;
    }
    home.lFull = btn('expand', t.fullScreen(), function () { liveFull(true); });
    home.lOther = btn('live', '', function () { liveStart(1 - Live.place); });
    home.lStop = btn('stop', t.radioStop(), function () { liveStop(); focus(home.livePill); });
    Live.listeners.push(styleLive);
  }

  // ---------------------------------------------------------------- launcher: the apps (Apps.java)

  var Apps = { list: [], key: '', loaded: false, badIcon: {} };
  var FAV_SLOTS = 4;
  var DEFAULT_FAVS = ['youtube.leanback.v4', 'net.mbc.shahid-lgapp', 'com.webos.app.browser', 'com.webos.app.livetv'];
  /** Home's "More" row picks these first (minus favourites), then fills from the rest. */
  var MORE_FIRST = ['com.webos.app.hdmi1', 'com.webos.app.photovideo', 'com.webos.app.music', 'com.palm.app.settings',
    'com.webos.app.discovery'];
  /** Never listed: Afnon itself (both apps) and the TV's own Home. */
  var HIDDEN_IDS = { 'tv.afnon.launcher': 1, 'tv.afnon.lg': 1, 'com.webos.app.home': 1 };
  /** The TV's own apps its launch list leaves out (the boot script copies their icons too). */
  var EXTRA_APPS = [
    { id: 'com.webos.app.livetv', title: 'Live TV' }, { id: 'com.webos.app.hdmi1', title: 'HDMI 1' },
    { id: 'com.webos.app.hdmi2', title: 'HDMI 2' }, { id: 'com.palm.app.settings', title: 'Settings' }
  ];
  /** The browser preview's apps (and the website's demo): the TV's usual ones, with their real ids. */
  var STUB_APPS = [['youtube.leanback.v4', 'YouTube'], ['net.mbc.shahid-lgapp', 'MBC Shahid'],
    ['com.webos.app.browser', 'Web Browser'], ['com.webos.app.livetv', 'Live TV'], ['com.webos.app.hdmi1', 'HDMI 1'],
    ['com.webos.app.hdmi2', 'HDMI 2'], ['com.webos.app.photovideo', 'Photo & Video'], ['com.webos.app.music', 'Music'],
    ['com.palm.app.settings', 'Settings'], ['com.webos.app.discovery', 'LG Content Store'],
    ['org.webosbrew.hbchannel', 'Homebrew Channel'], ['de.2kit.castbrowserlg', 'TV Cast']];

  function launchApp(id, params) {
    luna('luna://com.webos.applicationManager/launch', params ? { id: id, params: params } : { id: id }, function (r) {
      if (!r.returnValue) note('launch failed: ' + id + ' ' + (r.errorText || ''));
    });
  }

  /**
   * Back on Home, a second time: the open apps, to close them (as LG's Home lists its recent apps; the idea is
   * cleanyourtv's). «Close all» first, then each app by name; OK closes, Back leaves. Only apps of the app list.
   */
  function openRunning() {
    var got = function (ids) {
      var apps = [];
      ids.forEach(function (id) { var a = appById(id); if (a && !HIDDEN_IDS[id]) apps.push(a); });
      if (!apps.length) { setHints(home.hints, [t.noOpenApps()]); return; }
      var names = [t.closeAll()].concat(apps.map(appName));
      openChooser(t.openApps(), names, -1, function (i) {
        var close = i === 0 ? apps : [apps[i - 1]];
        close.forEach(function (a) {
          luna('luna://com.webos.applicationManager/closeByAppId', { id: a.id }, function (r) {
            if (!r.returnValue) note('close failed: ' + a.id + ' ' + (r.errorText || ''));
          });
        });
        // One closed and others still open: the list again (the app manager's own list lags, so it is not reread).
        if (i > 0 && apps.length > 1) setTimeout(function () { got(ids.filter(function (id) { return id !== apps[i - 1].id; })); }, 300);
      });
    };
    if (!TV) return got(STUB_APPS.slice(0, 3).map(function (a) { return a[0]; }));
    luna('luna://com.webos.applicationManager/running', {}, function (r) {
      if (!r.returnValue) { note('running apps denied: ' + (r.errorText || '')); return; }
      got((r.running || []).map(function (x) { return x.id; }));
    });
  }

  /** "Favourites first, in their saved order; then the rest by name in the screen's language" (Apps.sorted). */
  function sortedApps() {
    var favs = savedFavs(), out = [], rest = [];
    favs.forEach(function (id) { var a = appById(id); if (a) out.push(a); });
    Apps.list.forEach(function (a) { if (favs.indexOf(a.id) < 0) rest.push(a); });
    var order = null;
    try { order = new Intl.Collator(t.ar ? 'ar' : 'en'); } catch (e) { /* code-point order below */ }
    rest.sort(function (a, b) {
      var x = appName(a), y = appName(b);
      return order ? order.compare(x, y) : x < y ? -1 : x > y ? 1 : 0;
    });
    return out.concat(rest);
  }
  function appById(id) {
    for (var i = 0; i < Apps.list.length; i++) if (Apps.list[i].id === id) return Apps.list[i];
    return null;
  }
  function appName(a) { return t.appName(a.id, a.title); }
  /** At most four, in Home order. Uninstalled ones are kept, so a reinstall brings them back (Apps.favourites). */
  function savedFavs() { return (S.favs || DEFAULT_FAVS).slice(0, FAV_SLOTS); }
  /** Always four for Home: the saved favourites that are installed, topped up from the rest (Apps.slots). */
  function favSlots() {
    var out = [];
    savedFavs().forEach(function (id) { var a = appById(id); if (a && out.length < FAV_SLOTS) out.push(a); });
    sortedApps().forEach(function (a) { if (out.length < FAV_SLOTS && out.indexOf(a) < 0) out.push(a); });
    return out;
  }
  /** Home's More row: the preferred picks that are installed and not favourites, filled up from the rest. */
  function moreApps(favs, count) {
    var out = [];
    MORE_FIRST.forEach(function (id) { var a = appById(id); if (a && out.length < count && favs.indexOf(a) < 0) out.push(a); });
    sortedApps().forEach(function (a) { if (out.length < count && favs.indexOf(a) < 0 && out.indexOf(a) < 0) out.push(a); });
    return out;
  }

  /**
   * An app's icon, or the first letter of its name on a tile when there is none. The TV doesn't let a web app
   * read other apps' folders, so the boot script copies every icon into this app's own icons/ (on each boot and
   * whenever an app comes or goes). Night mode dims and warms it in CSS (Apps.showIcon).
   */
  function appIcon(parent, a, size) {
    var box = el('div', 'appicon', parent);
    box.style.width = box.style.height = size + 'px';
    if (TV && a && !Apps.badIcon[a.id]) {
      var img = el('img', null, box);
      img.onerror = function () {
        Apps.badIcon[a.id] = true;
        if (img.parentNode) img.parentNode.removeChild(img);
        letter(box, a);
      };
      img.src = 'icons/' + a.id + '.png';
    } else letter(box, a);
    return box;
  }
  function letter(box, a) {
    box.classList.add('mono');
    // The name's first letter, after «ال» (التلفاز → ت).
    el('span', null, box, a ? appName(a).replace(/^ال(?=.)/, '').charAt(0).toUpperCase() : '');
  }

  // ---------------------------------------------------------------- Home's favourites and More rows

  /** The two rows under the prayer strip: four favourites, then five more apps and All apps (MainActivity). */
  function buildHomeApps(parent) {
    var lf = home.favLabel = place(el('div', 'rowlbl caps approw', parent, t.fav()), 760, 476);
    lf.style.lineHeight = '30px';
    var lm = home.moreLabel = place(el('div', 'rowlbl caps approw', parent, t.more()), 760, 720);
    lm.style.lineHeight = '30px';
    home.favs = [];
    home.more = [];
    var fw = (1064 - 3 * 24) / 4, mw = (1064 - 5 * 20) / 6, i;
    for (i = 0; i < FAV_SLOTS; i++) {
      var f = place(el('div', 't r4 favtile approw', parent), 760 + i * (fw + 24), 520, fw, 150);
      f._i = i;
      f._focus = favFocus;
      home.favs.push(f);
    }
    for (i = 0; i < 6; i++) {
      var m = place(el('div', 't r4 moretile approw', parent), 760 + i * (mw + 20), 764, mw, 112);
      m._i = i;
      m._focus = moreFocus;
      home.more.push(m);
    }
    var all = home.more[5];
    all.classList.add('alltile');
    all._label = el('div', 'nm', all);
    all._ok = function () { show('apps'); };
    fillHomeApps();
  }

  /** Puts the apps in the two rows; called again when the list or the favourites change. */
  function fillHomeApps() {
    if (!home.favs) return;
    var favs = favSlots(), more = moreApps(favs, 5), i;
    for (i = 0; i < FAV_SLOTS; i++) appTile(home.favs[i], favs[i], 48, true);
    for (i = 0; i < 5; i++) appTile(home.more[i], more[i], 28, false);
    var all = home.more[5];
    all._label.textContent = Apps.loaded ? t.all(Apps.list.length) : t.loadingApps();
  }

  function appTile(e, a, size, big) {
    var id = a ? a.id + '|' + appName(a) + '|' + !!Apps.badIcon[a.id] : '';
    if (e._key === id) return;
    e._key = id;
    e.textContent = '';
    e._app = a || null;
    e.style.visibility = a ? '' : 'hidden';
    if (!a) { e._ok = null; return; }
    appIcon(e, a, size);
    nameEl(e, 'nm' + (big ? ' nowrap' : ''), appName(a));
    e._ok = function () { launchApp(a.id); };
  }
  /** An app's name; a Latin one reads left to right, so it is cut at its end (Apps.isLatin). */
  function nameEl(parent, cls, name) {
    var n = el('div', cls, parent, name);
    if (!/[؀-ۿ]/.test(name)) n.dir = 'ltr';
    return n;
  }

  function favFocus() {
    home.lastFav = this._i;
    setArchFocused(false);
    if (this._app) setHints(home.hints, [t.hintOk(t.open(appName(this._app))), t.hintMore()]);
  }
  function moreFocus() {
    setArchFocused(false);
    var label = this._i === 5 ? t.allTitle() : this._app ? t.open(appName(this._app)) : '';
    setHints(home.hints, [t.hintOk(label), t.hintFavs()]);
  }

  /** The network's name for the Wi-Fi pill, as the TV reports it. */
  function updateWifi() {
    if (!home.wifiName) return;
    luna('luna://com.palm.connectionmanager/getStatus', {}, function (r) {
      var name = 'Wi-Fi';
      if (r.wifi && r.wifi.state === 'connected' && r.wifi.ssid) name = r.wifi.ssid;
      else if (r.wired && r.wired.state === 'connected') name = t.wired();
      setText(home.wifiName, name);
    });
  }

  /**
   * The app list, from the TV's application manager (the launcher's boot script lets it ask), plus the TV's own
   * Live TV, inputs and Settings, which the list leaves out. Read when Afnon starts and each time it comes back to
   * the front; the screens are rebuilt only if something changed.
   */
  function loadApps() {
    if (!TV) return setTimeout(function () { gotApps(STUB_APPS.map(function (a) { return { id: a[0], title: a[1] }; })); }, 200);
    luna('luna://com.webos.applicationManager/listLaunchPoints', {}, function (r) {
      if (!r.returnValue || !r.launchPoints) {
        note('app list denied: ' + (r.errorText || JSON.stringify(r).slice(0, 120)));
        return gotApps([]);
      }
      gotApps(r.launchPoints);
    });
  }
  function gotApps(points) {
    var list = [], seen = {}, i;
    for (i = 0; i < points.length; i++) {
      var a = points[i];
      if (!a.id || HIDDEN_IDS[a.id] || seen[a.id]) continue;
      seen[a.id] = 1;
      list.push({ id: a.id, title: a.title || a.id });
    }
    if (TV) EXTRA_APPS.forEach(function (a) { if (!seen[a.id]) list.push(a); });
    var key = list.map(function (a) { return a.id + a.title; }).join('|');
    Apps.loaded = true;
    if (key === Apps.key) return;
    Apps.key = key;
    Apps.list = list;
    fillHomeApps();
    if (allv.built) {
      fillAllApps();
      // All apps opened before the list came: focus its first app now.
      if (screen === allv && (!cur || !cur.classList.contains('alltile'))) focusAllTile(0);
    }
  }

  /** Puts Home in step with the live video: the panel or the strip and radio card, and its words. */
  function styleLive() {
    var on = Live.place >= 0;
    home.el.classList.toggle('living', on);
    if (!on) {
      liveFull(false);
      if (cur === home.lFull || cur === home.lOther || cur === home.lStop) focus(home.livePill);
      return;
    }
    var places = t.livePlaces();
    setText(home.liveWords, places[Live.place] + t.sep() + t.liveStatus(Live.state) +
      (Live.state === Live.PLAYING && Live.height ? t.sep() + t.d(Live.height + 'p') : ''));
    setText(home.lOther._label, places[1 - Live.place]);
    setText(home.panelMsg, Live.state === Live.PLAYING ? '' : t.liveStatus(Live.state));
    home.panelMsg.style.display = Live.state === Live.PLAYING ? 'none' : '';
  }

  /** Full screen on or off; its hint shows for 4 s. ▲▼ there open the quality list, Back comes out. */
  function liveFull(on) {
    if (on && Live.place < 0) return;
    if (Live.full === on) return;
    Live.full = on;
    home.panel.classList.toggle('full', on);
    clearTimeout(home.fullHintTimer);
    home.fullHint.classList.toggle('on', on);
    if (on) home.fullHintTimer = setTimeout(function () { home.fullHint.classList.remove('on'); }, 4000);
    else if (Live.place >= 0) focus(home.lFull);
  }

  /**
   * The Live pill (as Afnon's TCL build now does): with nothing on it plays Makkah at once; with a mosque on it goes
   * down to the buttons under the panel (Full screen, the other mosque, Stop). A failed stream is tried again.
   */
  function chooseLive() {
    if (Live.place < 0 || Live.state === Live.FAILED) liveStart(Live.place < 0 ? 0 : Live.place);
    focus(home.lFull);
  }

  /** Full screen's quality list: each rendition with what an hour costs, the one playing chosen. */
  function chooseQuality() {
    var list = Live.renditions.slice().reverse();
    if (!list.length) return;
    var sel = 0;
    list.forEach(function (r, i) { if (r.height === Live.height) sel = i; });
    openChooser(t.quality(), list.map(function (r) { return t.qualityItem(r.height, r.bandwidth); }), sel,
      function (i) { liveQuality(list[i].height); });
  }

  function radioHints() {
    if (cur === home.play) setHints(home.hints, [t.hintOk(Radio.wanted ? t.radioStop() : t.radioPlay())]);
    else if (cur === home.pick) setHints(home.hints, [t.hintOk(t.stationRow())]);
    else if (cur === home.dark) setHints(home.hints, [t.hintOk(t.screenOff())]);
  }

  /** Puts the pill and the card in step with the radio (MainActivity.styleRadio). */
  function styleRadio() {
    if (!home.radio) return;
    var st = Radio.state, on = Radio.wanted;
    // The pill keeps to a short word; "retrying" reads as connecting there, the card says more.
    setText(home.pillLabel, on ? t.radioStatus(st === Radio.RETRYING ? Radio.CONNECTING : st) : t.radio());
    home.pillIcon.style.display = on ? 'none' : '';
    home.pillBars.style.display = on ? '' : 'none';
    setBarsLive(home.pillBars, st === Radio.PLAYING);
    home.radioPill.classList.toggle('on', on);
    setText(home.rTitle, t.station(station()));
    setText(home.rStatus, t.stationWhere(station()) + t.sep() + t.radioStatus(st));
    setBarsLive(home.bars, st === Radio.PLAYING);
    home.radio.classList.toggle('on', on);
    setText(home.playLabel, on ? t.radioStop() : t.radioPlay());
    setIcon(home.playIcon, on ? 'stop' : 'play');
    radioHints();
  }

  /** Called every second: the countdown; once a minute (or when a prayer arrives) everything else. */
  function renderHome(force) {
    var now = Date.now() + home.shift;
    var minute = Math.floor(now / 60000);
    if (force || minute !== home.lastMinute || !home.day) {
      home.lastMinute = minute;
      home.day = dayAt(now);
      renderHomeMinute(now);
    }
    if (Text.secondsUntil(home.day.nextTime, now) === 0) {
      // The prayer time has arrived: move on to the next one at once.
      home.day = dayAt(now + 1000);
      renderHomeMinute(now);
    }
    renderCountdown(home.arch, home.day, now, home.archFocused);
  }

  function renderHomeMinute(now) {
    var day = home.day, a = home.arch, n = names(day);
    setTime(home.clock, now);
    setText(home.date1, hijriText(day) + t.sep() + t.city());
    setText(home.date2, t.gregorianDate(clock.wall(now)));
    var nextTime = clockText(day.nextTime);
    var label = t.nextPrayer(), name = n[day.nextIndex];
    var sub = t.adhanAt() + ' ' + nextTime + t.sep() + t.city(), sub2 = '';
    if (day.friday && day.nextIndex === DHUHR) label = t.jumuahLabel();
    if (day.kahf) sub2 = t.kahf();
    if (day.ramadan) {
      sub2 = t.suhoorEnds(clockText(day.suhoorEnd));
      if (day.nextIndex === MAGHRIB) {
        label = t.iftarIn();
        name = t.iftar();
        sub = t.prayerNames()[MAGHRIB] + ' ' + nextTime + t.sep() + t.city();
      }
    }
    setText(a.label, label);
    setText(a.name, name);
    setText(a.sub, t.d(sub));
    setText(a.sub2, t.d(sub2));
    a.sub2.style.display = sub2 ? '' : 'none';

    for (var i = 0; i < 6; i++) {
      var c = home.cells[i];
      var tag = i === day.nowIndex ? t.nowTag() : (i === day.nextIndex ? t.nextTag() : '');
      if (day.ramadan && i === FAJR) tag = t.suhoorTag();
      if (day.ramadan && i === MAGHRIB) tag = t.iftarTag();
      var past = i !== day.nextIndex && day.times[i] <= now;
      var cls = i === day.nowIndex ? 'now' : i === day.nextIndex ? 'next' : past ? 'past' : '';
      if (c.cls !== cls) { c.cls = cls; c.el.className = 'cell ' + cls; }
      setText(c.tag, tag);
      setText(c.nm, n[i]);
      setTime(c.tm, day.times[i]);
    }
  }

  /** The tile in a row nearest to index i that has an app (the More row can be short); All apps always has one. */
  function tileNear(row, i) {
    for (var d = 0; d < row.length; d++) {
      if (row[i - d] && row[i - d].style.visibility !== 'hidden') return row[i - d];
      if (row[i + d] && row[i + d].style.visibility !== 'hidden') return row[i + d];
    }
    return null;
  }
  /** The next tile with an app along a row, or null at its end. */
  function stepRow(row, i, dir) {
    for (var j = i + dir; j >= 0 && j < row.length; j += dir) if (row[j].style.visibility !== 'hidden') return row[j];
    return null;
  }

  /** Home's focus map (MainActivity), written for LTR; in Arabic Left/Right swap. */
  function homeKey(k) {
    if (home.card) return cardKey(k);
    if (home.rcOpen) return radioCardKey(k);
    // Full screen: ▲▼ or OK open the quality list, Back comes out.
    if (Live.full) {
      if (k === KEY.BACK) liveFull(false);
      else if (k === KEY.UP || k === KEY.DOWN || k === KEY.OK) chooseQuality();
      return;
    }
    if (k === KEY.BACK) {
      // Back stops the live video, then returns focus to the arch, then lists the open apps to close them. Afnon is
      // the Home screen: it never leaves.
      if (Live.place >= 0) { liveStop(); focus(home.foot); }
      else if (cur !== home.foot) focus(home.foot);
      else openRunning();
      return;
    }
    if (k === KEY.OK) { if (cur && cur._ok) cur._ok(); return; }
    var toEnd = (k === KEY.RIGHT) !== rtl, toStart = (k === KEY.LEFT) !== rtl;
    if (k !== KEY.LEFT && k !== KEY.RIGHT) toEnd = toStart = false;
    var up = k === KEY.UP, down = k === KEY.DOWN, to = null;
    // While the live panel is on, its buttons stand where the two rows of apps were.
    var living = Live.place >= 0;
    var head = home.header, hi = head.indexOf(cur), fi = home.favs.indexOf(cur), mi = home.more.indexOf(cur);
    var lastFav = home.lastFav == null ? 0 : home.lastFav;
    if (cur === home.foot) to = toEnd || down ? (living ? home.lFull : tileNear(home.favs, lastFav)) : up ? head[0] : null;
    else if (hi >= 0) {
      to = toStart ? (hi > 0 ? head[hi - 1] : home.foot) : toEnd ? head[hi + 1] || null
        : down ? (living ? home.lFull : tileNear(home.favs, Math.min(hi, FAV_SLOTS - 1))) : null;
    } else if (cur === home.lFull) to = toStart ? home.foot : toEnd ? home.lOther : up ? home.livePill : null;
    else if (cur === home.lOther) to = toStart ? home.lFull : toEnd ? home.lStop : up ? home.livePill : null;
    else if (cur === home.lStop) to = toStart ? home.lOther : up ? home.livePill : null;
    else if (fi >= 0) {
      to = toStart ? (fi > 0 ? home.favs[fi - 1] : home.foot) : toEnd ? home.favs[fi + 1] || null
        : up ? head[Math.min(fi, head.length - 1)] : down ? tileNear(home.more, Math.round(fi * 5 / 3)) : null;
    } else if (mi >= 0) {
      to = toStart ? (stepRow(home.more, mi, -1) || home.foot) : toEnd ? stepRow(home.more, mi, 1)
        : up ? tileNear(home.favs, Math.round(mi * 3 / 5)) : null;
    } else to = home.foot;
    if (to && to.style.visibility !== 'hidden') focus(to);
  }

  // ---------------------------------------------------------------- All apps (AllAppsActivity)

  /**
   * Five columns, three rows in view, paging a row at a time. The info bar names the focused app and its place in
   * favourites. Hold OK arranges favourites: a favourite moves earlier or later; any other app can take a
   * favourite's place (Home always has four). The chip shows the next prayer and opens Prayer day; Back returns Home.
   */
  var ALL_COLS = 5, ALL_ROWS = 3, ALL_TOP = 200, ALL_H = 168, ALL_GAP = 32;
  var allv = screens.apps = {
    tiles: [], topRow: 0, focusId: null,
    build: buildAllApps,
    show: function () {
      fillAllApps();
      var i = -1;
      allv.tiles.forEach(function (x, j) { if (x._app && x._app.id === allv.focusId) i = j; });
      allv.focusId = null;
      focusAllTile(Math.max(0, i));
    }
  };

  function buildAllApps() {
    var e = allv.el = el('div', 'screen', stage);
    e.id = 'apps';
    var back = allv.back = place(el('div', 't gear', e), 96, 56, 72, 72);
    back.appendChild(icon('back', 32, 2, 'flip'));
    back._ok = function () { show('home'); };
    back._focus = function () { allInfo(t.back(), t.hintBackHome()); };
    var head = place(el('div', 'row allhead', e), 96 + 72 + 28, 56, null, 72);
    el('div', 'dispb', head, t.allTitle());
    allv.count = el('div', 'mist count', head);
    var chip = allv.chip = placeEnd(el('div', 't pill clear chip', e), 96, 56, null, 72);
    chip.appendChild(icon('mihrab', 26, 2));
    allv.chipLabel = el('span', 'lbl', chip);
    allv.chipTime = el('span', 'disp tm ltr num', chip);
    chip._ok = function () { openDay(); };
    chip._focus = function () { allInfo(t.today(), t.hintOk(t.today())); };
    // The grid's window: three rows in view; the rows inside move a row at a time.
    // 16px wider all round than the tiles, so a focused tile's ring is not cut off.
    allv.view = place(el('div', 'allview', e), 96 - 16, ALL_TOP - 16, 1728 + 32, ALL_ROWS * (ALL_H + ALL_GAP) - ALL_GAP + 32);
    allv.grid = el('div', 'allgrid', allv.view);
    var bar = place(el('div', 'infobar', e), 96, 830, 1728);
    var who = el('div', 'col who', bar);
    allv.infoName = el('div', 'name nowrap', who);
    allv.infoNote = el('div', 'note mist', who);
    var keys = el('div', 'hints', bar);
    [t.hintOpen(), t.hintHold(), t.hintBackHome()].forEach(function (h) { el('span', null, keys, h); });
    allv.built = true;
  }

  function fillAllApps() {
    if (!allv.el) return;
    var apps = sortedApps(), favs = favSlots(), w = (1728 - (ALL_COLS - 1) * ALL_GAP) / ALL_COLS;
    setText(allv.count, t.d(String(apps.length)));
    while (allv.tiles.length < apps.length) {
      var x = el('div', 't r4 alltile', allv.grid);
      x._focus = allTileFocus;
      allv.tiles.push(x);
    }
    allv.tiles.forEach(function (x, i) {
      var a = apps[i];
      if (!a) { x.style.display = 'none'; x._app = null; x._key = null; return; }
      x.style.display = '';
      x._i = i;
      x._fav = favs.indexOf(a);
      place(x, 16 + (i % ALL_COLS) * (w + ALL_GAP), 16 +Math.floor(i / ALL_COLS) * (ALL_H + ALL_GAP), w, ALL_H);
      var key = a.id + '|' + appName(a) + '|' + x._fav + '|' + !!Apps.badIcon[a.id];
      if (x._key === key) return;
      x._key = key;
      x._app = a;
      x.textContent = '';
      var top = el('div', 'top', x);
      appIcon(top, a, 56);
      if (x._fav >= 0) top.appendChild(icon('star', 26, 2, 'star'));
      nameEl(x, 'nm nowrap', appName(a));
      x._ok = function () { launchApp(a.id); };
    });
    allv.count._n = apps.length;
  }

  function allInfo(name, note) {
    setText(allv.infoName, name);
    allv.infoName.style.direction = /[؀-ۿ]/.test(name) ? 'rtl' : 'ltr';
    allv.infoName.style.textAlign = rtl ? 'right' : 'left';
    setText(allv.infoNote, note);
  }
  function allTileFocus() {
    if (this._app) allInfo(appName(this._app), this._fav >= 0 ? t.favNote(this._fav + 1) : t.notFav());
  }

  function allCount() { return allv.count._n || 0; }
  function focusAllTile(i) {
    var n = allCount();
    if (!n) return focus(allv.back);
    i = Math.max(0, Math.min(n - 1, i));
    var row = Math.floor(i / ALL_COLS);
    if (row < allv.topRow) allv.topRow = row;
    else if (row >= allv.topRow + ALL_ROWS) allv.topRow = row - ALL_ROWS + 1;
    allv.grid.style.transform = allv.topRow ? 'translateY(' + (-allv.topRow * (ALL_H + ALL_GAP)) + 'px)' : '';
    focus(allv.tiles[i]);
  }

  function allKey(k) {
    if (k === KEY.BACK) return show('home');
    if (k === KEY.OK) { if (cur && cur._ok) cur._ok(); return; }
    var toEnd = (k === KEY.RIGHT) !== rtl, toStart = (k === KEY.LEFT) !== rtl;
    if (k !== KEY.LEFT && k !== KEY.RIGHT) toEnd = toStart = false;
    var n = allCount(), from = cur && cur._app && cur.classList.contains('alltile') ? cur._i : -1;
    if (cur === allv.back) {
      if (toEnd) focus(allv.chip);
      else if (k === KEY.DOWN) focusAllTile(allv.topRow * ALL_COLS);
    } else if (cur === allv.chip) {
      if (toStart) focus(allv.back);
      else if (k === KEY.DOWN) focusAllTile(Math.min(n - 1, allv.topRow * ALL_COLS + ALL_COLS - 1));
    } else if (from < 0) focusAllTile(0);
    else {
      var col = from % ALL_COLS;
      if (toStart && col > 0) focusAllTile(from - 1);
      else if (toEnd && col < ALL_COLS - 1 && from + 1 < n) focusAllTile(from + 1);
      else if (k === KEY.DOWN && from + ALL_COLS < n) focusAllTile(from + ALL_COLS);
      else if (k === KEY.DOWN && Math.floor(from / ALL_COLS) < Math.floor((n - 1) / ALL_COLS)) focusAllTile(n - 1);
      else if (k === KEY.UP && from >= ALL_COLS) focusAllTile(from - ALL_COLS);
      else if (k === KEY.UP) focus(col < 3 ? allv.back : allv.chip);
    }
  }

  /** The chip's prayer and countdown, every second while All apps is in front. */
  function renderAll() {
    var now = Date.now() + home.shift;
    if (!home.day || Text.secondsUntil(home.day.nextTime, now) === 0) home.day = dayAt(now + 1000);
    setText(allv.chipLabel, t.chip(names(home.day)[home.day.nextIndex]));
    setText(allv.chipTime, t.d(Text.duration(Text.secondsUntil(home.day.nextTime, now), false)));
  }

  /** Hold OK on an app: the arrange list (AllAppsActivity.openMenu), over the grid. */
  function arrange(x) {
    var a = x._app, favs = favSlots().map(function (f) { return f.id; }), at = favs.indexOf(a.id);
    var labels = [], acts = [];
    if (at >= 0) {
      if (at > 0) { labels.push(t.moveEarlier()); acts.push(function () { swapFav(favs, at, at - 1); }); }
      if (at < favs.length - 1) { labels.push(t.moveLater()); acts.push(function () { swapFav(favs, at, at + 1); }); }
    } else {
      favs.forEach(function (id, j) {
        var f = appById(id);
        labels.push(t.putInPlaceOf(f ? appName(f) : id));
        acts.push(function () { favs[j] = a.id; saveFavs(favs); });
      });
    }
    labels.push(t.cancel());
    acts.push(null);
    openChooser(appName(a), labels, 0, function (i) {
      if (!acts[i]) return;
      acts[i]();
      allv.focusId = a.id;
      allv.show();
    });
  }
  function swapFav(favs, i, j) {
    var x = favs[i];
    favs[i] = favs[j];
    favs[j] = x;
    saveFavs(favs);
  }
  function saveFavs(favs) {
    S.favs = favs.slice(0, FAV_SLOTS);
    saveSettings();
    fillHomeApps();
  }

  // ---------------------------------------------------------------- the reminder card (mode "approach")

  /** "Asr in 13 minutes" at the bottom end; it takes focus until Got it, Today's prayers or Back. */
  function showReminder() {
    if (!home.ready) return;
    if (home.card) dismissReminder();
    var now = Date.now(), day = dayAt(now), n = names(day);
    var card = home.card = el('div', 'card', home.el);
    placeEnd(card, 96, 1080 - 56 - 300);
    card.style.top = '';
    card.style.bottom = '56px';
    el('div', 'lbl caps', card, t.apLabel());
    var left = Text.secondsUntil(day.nextTime, now);
    el('div', 'title dispb', card, t.apTitle(n[day.nextIndex], Math.floor((left + 59) / 60), Text.duration(left, false)));
    el('div', 'sub', card, t.apSub(clockText(day.nextTime)));
    var btns = el('div', 'btns', card);
    var ok = el('div', 't cbtn fill', btns, t.apOk());
    var go = el('div', 't cbtn line', btns, t.dayTitle());
    ok._ok = dismissReminder;
    go._ok = function () { dismissReminder(); openDay(); };
    home.cardFor = day.nextTime;
    home.cardOk = ok;
    home.cardDay = go;
    home.cardReturn = cur;
    focus(ok);
    setHints(home.hints, [t.hintOk(t.apOk()), t.hintBackHome().replace(t.home(), t.dismiss())]);
  }
  function dismissReminder() {
    if (!home.card) return;
    home.el.removeChild(home.card);
    home.card = null;
    if (screen === home) focus(home.foot);
  }
  function cardKey(k) {
    if (k === KEY.BACK) return dismissReminder();
    if (k === KEY.OK) return cur && cur._ok && cur._ok();
    if (k === KEY.LEFT || k === KEY.RIGHT) focus(((k === KEY.RIGHT) !== rtl) ? home.cardDay : home.cardOk);
  }

  // ---------------------------------------------------------------- Prayer day (PrayerDayActivity)

  var day = screens.day = {
    lastMinute: -1, d: null, lastRow: 0, fromSettings: false, picker: null,
    build: buildDay,
    show: function () {
      day.lastMinute = -1;
      renderDay(true);
      focus(day.rows[day.d.nextIndex].el);
      if (day.fromSettings) openPicker();
    },
    hide: function () { closePickerView(); }
  };

  function openDay(fromSettings) {
    day.fromSettings = !!fromSettings;
    show('day');
  }

  function buildDay() {
    var e = day.el = el('div', 'screen', stage);
    e.id = 'day';
    day.arch = buildArch(e, 500, 24, 16, 'var(--mist)', 0);
    var head = place(el('div', 'col', e), 760, 56);
    var title = el('div', 'dispb', head, t.dayTitle());
    title.style.cssText = 'font-size:64px;line-height:1.1';
    day.dates = el('div', 'mist', head);
    day.dates.style.marginTop = '8px';

    var pill = day.homePill = placeEnd(el('div', 't pill clear', e), 96, 56, null, 72);
    pill.style.padding = '0 28px';
    pill.appendChild(icon('back', 28, 2, 'flip'));
    var hl = el('span', null, pill, t.home());
    hl.style.cssText = 'font-size:24px;margin:0 12px';
    pill._ok = function () { show('home'); };
    pill._focus = function () { setHints(day.hints, [t.hintOk(t.home())]); };

    day.rows = [];
    for (var i = 0; i < 6; i++) day.rows.push(dayRow(e, i));
    buildQibla(e);
    day.hints = hintsEl(e, 760, 976);
  }

  function dayRow(parent, i) {
    var r = { state: -1 };
    var b = r.el = place(el('div', 't r4 dayrow', parent), 760, 236 + i * 116, 620, 104);
    r.nm = el('div', 'nm', b);
    r.st = el('div', 'st', b);
    r.tm = timeEl(b, 'tm disp num');
    r.bell = el('div', 'bell', b);
    r.bell.appendChild(icon('bell', 26, 2));
    b._ok = function () {
      S.bells[i] = S.bells[i] ? 0 : 1;
      saveSettings();
      paintBell(i);
      configureService();
    };
    b._focus = function () {
      day.lastRow = i;
      setHints(day.hints, [t.hintOk(t.bellToggle()), t.hintQibla(), t.hintBackHome()]);
    };
    return r;
  }

  function paintBell(i) {
    var on = !!S.bells[i], r = day.rows[i];
    r.bell.className = 'bell ' + (on ? 'on' : 'off');
  }

  function buildQibla(parent) {
    var q = place(el('div', 'qpanel', parent), 1424, 236);
    el('div', 'lbl caps', q, t.qibla());
    day.dial = dial(q, 260);
    day.dial.svg.style.marginTop = '14px';
    day.northLabel = el('div', 'mist', q);
    day.northLabel.style.cssText = 'font-size:20px;margin-top:8px';
    day.degrees = el('div', 'deg disp num ltr', q);
    day.direction = el('div', 'dir', q);
    day.qHint = el('div', 'hint', q);
    var b = day.room = place(el('div', 't roombtn', parent), 1424 + 32, 236 + 698 - 28 - 64, 400 - 64, 64);
    day.roomLabel = el('span', null, b);
    b._ok = openPicker;
    b._focus = function () { setHints(day.hints, [t.hintOk(day.roomLabel._t || ''), t.hintTimes()]); };
  }

  /** The Qibla dial (QiblaView, 360 viewBox): north up, a gold needle at the bearing, the Kaaba at its tip. */
  function dial(parent, size) {
    var d = {};
    var s = d.svg = svgEl('svg', { viewBox: '0 0 360 360', width: size, height: size, 'class': 'dial' }, parent);
    svgEl('circle', { cx: 180, cy: 180, r: 160, 'class': 'ring' }, s);
    svgEl('circle', { cx: 180, cy: 180, r: 120, 'class': 'ring2' }, s);
    svgEl('path', { d: 'M180 20V38M180 322V340M20 180H38M322 180H340', 'class': 'tick' }, s);
    svgEl('path', { d: 'M180 34L170 56H190Z', 'class': 'n' }, s);
    d.tv = svgEl('path', { d: 'M180 66L173 82H187Z', 'class': 'tvn' }, s);
    d.needle = svgEl('g', {}, s);
    svgEl('line', { x1: 180, y1: 180, x2: 180, y2: 30, 'class': 'needle' }, d.needle);
    svgEl('rect', { x: 167, y: 14, width: 26, height: 26, rx: 3, 'class': 'kaaba' }, d.needle);
    svgEl('circle', { cx: 180, cy: 180, r: 10, 'class': 'hub' }, s);
    return d;
  }
  function setDial(d, bearing, north) {
    d.needle.setAttribute('transform', 'rotate(' + bearing.toFixed(1) + ' 180 180)');
    if (north == null) d.tv.style.display = 'none';
    else { d.tv.style.display = ''; d.tv.setAttribute('transform', 'rotate(' + north.toFixed(1) + ' 180 180)'); }
  }

  /** Every second: countdown and row statuses. Once a minute, or when a prayer time arrives: everything else. */
  function renderDay(force) {
    var now = Date.now();
    var minute = Math.floor(now / 60000);
    var arrived = day.d && Text.secondsUntil(day.d.nextTime, now) === 0;
    if (force || arrived || minute !== day.lastMinute || !day.d) {
      day.lastMinute = minute;
      day.d = dayAt(arrived ? now + 1000 : now);
      renderDayMinute(now);
    }
    renderCountdown(day.arch, day.d, now, false);
    for (var i = 0; i < 6; i++) {
      var r = day.rows[i], s = r.state;
      setText(r.st, s === 1 ? t.rowNow() : s === 0 ? t.passed(i === SUNRISE) : t.in(Text.duration(Text.secondsUntil(day.d.times[i], now), false)));
    }
  }

  function renderDayMinute(now) {
    var d = day.d, a = day.arch, n = names(d);
    setText(day.dates, hijriText(d) + t.sep() + t.gregorianDate(clock.wall(now)) + t.sep() + t.city());
    setText(a.label, d.friday && d.nextIndex === DHUHR ? t.jumuahLabel() : t.nextPrayer());
    setText(a.name, n[d.nextIndex]);
    setText(a.sub, t.methodName(method()));
    setText(a.sub2, t.school(S.madhab));
    for (var i = 0; i < 6; i++) {
      var r = day.rows[i];
      var st = i === d.nowIndex ? 1 : (i !== d.nextIndex && d.times[i] <= now ? 0 : 2);
      if (r.state !== st) {
        r.state = st;
        r.el.classList.toggle('now', st === 1);
        r.el.classList.toggle('past', st === 0);
      }
      setText(r.nm, n[i]);
      setTime(r.tm, d.times[i]);
      paintBell(i);
    }
    setText(day.degrees, t.d(Math.round(d.qibla) + '°'));
    var facing = S.facing;
    setText(day.roomLabel, t.roomButton(facing >= 0));
    if (facing < 0) {
      // Room direction unknown: north-up, as in the design.
      setDial(day.dial, d.qibla, null);
      setText(day.northLabel, t.north());
      setText(day.direction, t.qiblaDirection(d.qibla));
      setText(day.qHint, t.qiblaHint());
    } else {
      // The top of the dial is the TV, so the needle points the way to turn from the sofa.
      var rel = (((d.qibla - facing) % 360) + 360) % 360;
      setDial(day.dial, rel, (360 - facing) % 360);
      setText(day.northLabel, t.tvMarker());
      setText(day.direction, t.qiblaRelative(rel));
      setText(day.qHint, t.facingLine(facing));
    }
  }

  function dayKey(k) {
    if (day.picker && day.picker.on) return pickerKey(k);
    if (k === KEY.BACK) return leaveDay();
    if (k === KEY.OK) return cur && cur._ok && cur._ok();
    // Written for LTR, where the Qibla side is to the right; in Arabic Left/Right swap.
    if (rtl && k === KEY.LEFT) k = KEY.RIGHT;
    else if (rtl && k === KEY.RIGHT) k = KEY.LEFT;
    var rows = day.rows, from = -1, i;
    for (i = 0; i < 6; i++) if (rows[i].el === cur) from = i;
    var to = null;
    if (cur === day.room) to = k === KEY.LEFT ? rows[day.lastRow].el : k === KEY.UP ? day.homePill : null;
    else if (cur === day.homePill) to = k === KEY.DOWN ? rows[0].el : null;
    else if (from < 0) to = rows[day.d.nextIndex].el;
    else if (k === KEY.RIGHT) to = day.room;
    else if (k === KEY.UP) to = from === 0 ? day.homePill : rows[from - 1].el;
    else if (k === KEY.DOWN) to = rows[Math.min(5, from + 1)].el;
    if (to) focus(to);
  }

  function leaveDay() {
    if (day.fromSettings) { day.fromSettings = false; show('settings'); }
    else show('home');
  }

  // The room-direction picker: a dimmed screen with the tip, the value and a preview dial.
  function openPicker() {
    if (!day.picker) {
      var p = day.picker = { scrim: el('div', 'scrim', day.el) };
      var box = el('div', 'box', p.scrim);
      box.style.cssText = 'width:1100px;left:410px;top:170px;padding:48px 56px';
      var title = el('div', 'dispb gold', box, t.roomTitle());
      title.style.cssText = 'font-size:52px;line-height:1.2';
      var tip = el('div', null, box, t.roomTip());
      tip.style.cssText = 'font-size:26px;line-height:1.6;margin-top:20px';
      var body = el('div', 'row', box);
      body.style.marginTop = '32px';
      p.dial = dial(body, 240);
      var vals = el('div', 'col', body);
      vals.style[rtl ? 'marginRight' : 'marginLeft'] = '48px';
      p.value = el('div', 'disp', vals);
      p.value.style.cssText = 'font-size:64px;line-height:1.1';
      p.where = el('div', null, vals);
      p.where.style.cssText = 'font-size:28px;color:var(--gold2)';
      var keys = el('div', 'mist', box, t.roomKeys());
      keys.style.cssText = 'font-size:22px;margin-top:32px;white-space:pre';
    }
    day.picker.facing = S.facing < 0 ? 0 : S.facing;
    day.picker.on = true;
    day.picker.scrim.classList.add('on');
    blur();
    renderPicker();
  }
  function renderPicker() {
    var p = day.picker, rel = (((day.d.qibla - p.facing) % 360) + 360) % 360;
    setDial(p.dial, rel, (360 - p.facing) % 360);
    setText(p.value, t.bearingLabel(p.facing));
    setText(p.where, t.qiblaRelative(rel));
  }
  function closePickerView() {
    if (!day.picker || !day.picker.on) return;
    day.picker.on = false;
    day.picker.scrim.classList.remove('on');
  }
  function closePicker(saveIt) {
    if (saveIt) { S.facing = day.picker.facing; saveSettings(); }
    closePickerView();
    if (day.fromSettings) return leaveDay();
    renderDayMinute(Date.now());
    focus(day.room);
    day.room._focus();
  }
  /** Right/Left turn by 5° (clockwise is always Right), Up/Down by 45° to the next whole direction. */
  function pickerKey(k) {
    var p = day.picker, v = p.facing;
    if (k === KEY.BACK || k === KEY.OK) return closePicker(k === KEY.OK);
    if (k === KEY.RIGHT) v += 5;
    else if (k === KEY.LEFT) v -= 5;
    else if (k === KEY.UP) v = (Math.floor(v / 45) + 1) * 45;
    else if (k === KEY.DOWN) v = (Math.floor((v + 44) / 45) - 1) * 45;
    p.facing = ((v % 360) + 360) % 360;
    renderPicker();
  }

  // ---------------------------------------------------------------- Settings (SettingsActivity)

  var PRAYER_S = 0, ADJUST_S = 1, REMIND_S = 2, RADIO_S = 3, DISPLAY_S = 4, NEWS_S = 5, SECTIONS = 6;
  var VALUE = 0, SEG = 1, STEP = 2, TOGGLE = 3;
  var set = screens.settings = {
    section: PRAYER_S, onNav: true, rowIndex: 0,
    build: buildSettings,
    show: function () {
      showSection(set.section);
      if (set.onNav) focusNav(); else if (set.section === NEWS_S) focusNews(); else focusRow(set.rowIndex);
      refreshSettings();
    },
    hide: function () { stopPreview(); set.editing = null; }
  };

  function openSettings() { set.onNav = true; show('settings'); }

  function sectionName(i) {
    return [t.sectionPrayer(), t.sectionAdjust(), t.sectionReminders(), t.sectionRadio(), t.sectionDisplay(),
      t.sectionNews()][i];
  }

  function digitsOf(a) { return a.map(function (s) { return t.d(s); }); }
  function idx(a, v, dflt) { var i = a.indexOf(v); return i < 0 ? dflt : i; }

  /** Rows by section: what each shows and what ◀▶ and OK do (Row in SettingsActivity). */
  function rowsFor(s) {
    var REMIND = [5, 10, 15, 20, 30, 0], CLOSE = [0, 1, 5, 10], DARK = [0, 15, -1];
    if (s === NEWS_S) return [];
    // Adjust the times (meypod/al-azan's adjustments): each of the six, − and + by a minute, -30 to 30. Home,
    // Prayer day, the reminders and the adhan all use the adjusted times.
    if (s === ADJUST_S) return [0, 1, 2, 3, 4, 5].map(function (i) {
      return { kind: STEP, label: function () { return t.prayerNames()[i]; }, low: -30, high: 30, signed: true,
        help: function () {
          var today = P.timesFor({ method: method(), madhab: S.madhab, adjust: S.adjust }, clock, Date.now(), 0);
          return t.adjustTimeHelp(clockText(today[i]));
        },
        amount: function () { return S.adjust[i] | 0; },
        value: function (n) { return t.minutesSigned(n == null ? S.adjust[i] | 0 : n); },
        setAmount: function (n) { S.adjust[i] = n; changed(true); } };
    });
    if (s === PRAYER_S) return [
      { kind: VALUE, label: t.location, help: function () { return t.locationHelp(city.lat, city.lng); },
        value: function () { return t.ar ? t.place(city.ar, city.countryAr) : t.place(city.en, city.countryEn); },
        open: chooseRegion },
      { kind: VALUE, label: t.method, help: function () { return t.methodAngles(P.angles(method())); },
        value: function () { return t.methodName(method()); },
        open: function () {
          openChooser(t.method(), P.METHODS.map(function (m) { return t.methodName(m); }), P.METHODS.indexOf(method()),
            function (i) { S.method = P.METHODS[i]; changed(true); });
        } },
      { kind: SEG, label: t.asrSchool, help: t.asrSchoolHelp, segs: t.asrSchools,
        selected: function () { return S.madhab === 'hanafi' ? 1 : 0; },
        select: function (i) { S.madhab = i === 1 ? 'hanafi' : 'shafi'; changed(true); } },
      { kind: STEP, label: t.hijriAdjust, help: function () { return t.hijriToday(hijriText(dayAt(Date.now()))); },
        low: -2, high: 2, amount: function () { return S.hijri | 0; },
        value: function (n) { return t.days(n == null ? S.hijri | 0 : n); },
        setAmount: function (n) { S.hijri = n; changed(false); } },
      { kind: VALUE, label: t.roomRow, help: t.roomHelp,
        value: function () { return S.facing < 0 ? t.notSet() : t.bearingLabel(S.facing); },
        open: function () { openDay(true); } }
    ];
    if (s === REMIND_S) return [
      { kind: VALUE, label: t.remind, help: t.remindHelp,
        value: function () { return digitsOf(t.remindChoices())[idx(REMIND, S.remind, 2)]; },
        open: function () {
          openChooser(t.remind(), digitsOf(t.remindChoices()), idx(REMIND, S.remind, 2), function (i) { S.remind = REMIND[i]; changed(true); });
        } },
      { kind: TOGGLE, label: t.remindVoiceRow, help: t.remindVoiceHelp, on: function () { return S.remindVoice; },
        set: function (b) { S.remindVoice = b; changed(true); } },
      // «أوشك وقت صلاة … على الانتهاء»: how long before the current prayer's time ends, or off.
      { kind: VALUE, label: t.endRemindRow, help: t.endRemindHelp,
        value: function () { return digitsOf(t.remindChoices())[idx(REMIND, S.endRemind, 2)]; },
        open: function () {
          openChooser(t.endRemindRow(), digitsOf(t.remindChoices()), idx(REMIND, S.endRemind, 2),
            function (i) { S.endRemind = REMIND[i]; changed(true); });
        } },
      { kind: TOGGLE, label: t.adhanRow, help: t.adhanHelp, on: function () { return S.adhan; },
        set: function (b) { S.adhan = b; changed(true); } },
      { kind: TOGGLE, label: t.announceRow, help: t.announceHelp, on: function () { return S.announce; },
        set: function (b) { S.announce = b; changed(true); } },
      { kind: SEG, label: t.callCloseRow, help: t.callCloseHelp, segs: function () { return digitsOf(t.callCloseChoices()); },
        selected: function () { return idx(CLOSE, S.callClose, 3); },
        select: function (i) { S.callClose = CLOSE[i]; changed(false); } },
      voiceRow(false),
      voiceRow(true)
    ];
    if (s === RADIO_S) return [
      { kind: TOGGLE, label: function () { return t.station(station()); }, help: function () { return t.radioRowHelp(station()); },
        // Plays or stops the radio: an action, not a saved setting, so no ✓ Saved.
        on: function () { return Radio.wanted; }, set: function (b) { if (b) radioStart(); else radioStop(); }, saves: false },
      { kind: VALUE, label: t.stationRow, help: function () { return t.stationGroups()[station().reciter ? 1 : 0]; },
        value: function () { return t.stationChoice(station()); }, open: chooseStation },
      { kind: SEG, label: t.afterAdhanRow, help: t.afterAdhanHelp, segs: t.afterAdhanChoices,
        selected: function () { return S.radioResume ? 0 : 1; },
        select: function (i) { S.radioResume = i === 0; changed(false); } },
      { kind: SEG, label: t.radioDarkRow, help: t.radioDarkHelp, segs: function () { return digitsOf(t.radioDarkChoices()); },
        selected: function () { return idx(DARK, S.radioDark, 0); },
        select: function (i) { S.radioDark = DARK[i]; changed(false); } }
    ];
    return [
      { kind: SEG, label: t.language, help: t.languageHelp, segs: t.languages,
        selected: function () { return idx(['system', 'ar', 'en'], S.locale, 0); },
        select: function (i) { S.locale = ['system', 'ar', 'en'][i]; relaunch(); } },
      { kind: SEG, label: t.digits, help: function () { return ''; }, segs: function () { return ['0123', '٠١٢٣']; },
        selected: function () { return t.eastern ? 1 : 0; },
        select: function (i) { S.digits = i === 1 ? 'eastern' : 'western'; relaunch(); } },
      { kind: SEG, label: t.clockRow, help: t.clockHelp, segs: function () { return digitsOf(t.clocks()); },
        selected: function () { return idx(['system', '12', '24'], S.clock, 0); },
        select: function (i) { S.clock = ['system', '12', '24'][i]; changed(true); } },
      { kind: TOGGLE, label: t.nightRow, help: t.nightHelp, on: function () { return S.night; },
        set: function (b) { setNight(b); } }
    ];
  }

  function call(fn) { return typeof fn === 'function' ? fn.call(t) : ''; }

  /** The adhan recording for every prayer but Fajr, or for Fajr: a list that plays each voice as focus reaches it. */
  function voiceRow(fajr) {
    var key = fajr ? 'voiceFajr' : 'voice';
    function vname(id) {
      for (var i = 0; i < DATA.VOICES.length; i++) if (DATA.VOICES[i][0] === id) return DATA.VOICES[i][t.ar ? 1 : 2];
      return DATA.VOICES[0][t.ar ? 1 : 2];
    }
    return {
      kind: VALUE, label: fajr ? t.fajrVoiceRow : t.voiceRow, help: fajr ? t.fajrVoiceHelp : t.voiceHelp,
      value: function () { return vname(S[key]); },
      open: function () {
        var ids = DATA.VOICES.map(function (v) { return v[0]; });
        openChooser(fajr ? t.fajrVoiceRow() : t.voiceRow(), ids.map(vname), Math.max(0, ids.indexOf(S[key])),
          function (i) { S[key] = ids[i]; changed(false); },
          function (i) { preview(ids[i]); });
      }
    };
  }

  var previewHeld = false;
  function preview(id) {
    if (!previewHeld) previewHeld = radioHold();
    playSound('sounds/adhan/' + id + '.mp3', 'preview');
  }
  function stopPreview() {
    if (Sound.kind === 'preview') stopSound();
    if (previewHeld) { previewHeld = false; radioResume(true); }
  }

  /** A setting changed: save it; with `service`, tell the service (debounced) and recompute the day. */
  function changed(service) {
    saveSettings();
    derive();
    home.lastMinute = -1;
    day.lastMinute = -1;
    watch.day = null;
    watchRearm(Date.now());
    if (service) configureService();
    styleRadio();
  }

  /** Language or digits: every string changes, so the page starts again where it was. */
  function relaunch() {
    saveSettings();
    try { sessionStorage.setItem('afnon-return', JSON.stringify({ section: set.section, row: set.rowIndex })); } catch (e) { /* */ }
    location.reload();
  }

  function buildSettings() {
    var e = set.el = el('div', 'screen', stage);
    e.id = 'settings';
    place(el('div', 'side', e), 0, 0);
    var head = place(el('div', 'row', e), 96, 56);
    var m = icon('mihrab', 36, 1.3);
    m.setAttribute('height', 46);
    m.style.color = 'var(--gold)';
    head.appendChild(m);
    var title = el('div', 'dispb', head, t.settings());
    title.style.cssText = 'font-size:52px;line-height:1.1;margin:0 16px';
    set.nav = [];
    for (var i = 0; i < SECTIONS; i++) set.nav.push(navItem(e, i));
    var pv = place(el('div', 'preview', e), 96, 1080 - 56 - 124);
    el('div', 'mist', pv, t.preview()).style.fontSize = '20px';
    set.previewValue = timeEl(pv, 'disp gold');
    set.previewValue.style.cssText = 'display:block;font-size:36px;line-height:1.2;margin-top:6px';
    set.label = place(el('div', 'mist caps', e), 640, 56);
    set.label.style.fontSize = '22px';
    set.hints = hintsEl(e, 640, 976);
    // ✓ Saved: on the hint line at the rows' end edge, apart from the hints so they never shift.
    set.saved = placeEnd(el('div', 'saved', e, t.saved()), 96, 976);
    // Every section's rows, built now and shown or hidden by section.
    set.rows = [];
    set.groups = [];
    for (var s = 0; s < SECTIONS; s++) {
      var g = el('div', null, e);
      g.style.display = 'none';
      set.groups.push(g);
      set.rows.push(rowsFor(s).map(function (r, k) { return buildRow(g, r, k); }));
    }
  }

  function navItem(parent, i) {
    var b = place(el('div', 't r4 nav', parent), 96, 152 + i * 86, 424, 76);
    el('span', 'nowrap', b, sectionName(i));
    b._focus = function () { setHints(set.hints, [t.hintMove(), t.hintOpen(), t.hintBackHome()]); };
    return b;
  }

  function buildRow(g, r, k) {
    var b = r.el = place(el('div', 't r2 srow', g), 640, 112 + k * 98, 1184, 88);
    var words = el('div', 'words', b);
    r.lb = el('div', 'lb nowrap', words);
    r.hp = el('div', 'hp', words);
    var c = el('div', 'ctl', b);
    c.style[rtl ? 'marginRight' : 'marginLeft'] = '24px';
    if (r.kind === VALUE) {
      r.val = el('span', 'val', c);
      c.appendChild(icon('chev', 22, 2.2, 'chev flip'));
    } else if (r.kind === SEG) {
      var seg = el('div', 'seg', c);
      r.segEls = call(r.segs).map(function (s, i) {
        var x = el('span', null, seg, s);
        if (i) x.style[rtl ? 'marginRight' : 'marginLeft'] = '6px';
        return x;
      });
    } else if (r.kind === STEP) {
      // − value + (mirrored in Arabic: + value −); the pointer presses the buttons themselves.
      el('div', 'step', c, '−')._d = -1;
      r.val = el('div', 'stepv', c);
      // A signed number reads left to right ("-3"), also with Eastern digits in an Arabic row.
      if (r.signed) r.val.dir = 'ltr';
      el('div', 'step', c, '+')._d = 1;
    } else {
      r.sw = el('div', 'sw', c);
      el('i', null, r.sw);
    }
    r.ctl = c;
    b._focus = function () {
      setHints(set.hints, [t.hintMove(), r.kind === VALUE ? t.hintChoose() : r.kind === TOGGLE ? t.hintSwitch() : t.hintEdit(),
        t.hintBackMenu()]);
    };
    b._ok = function () { rowAction(r); };
    return r;
  }

  /** A row as saved, or, for the row being edited, with its unsaved draft and a ring round its control. */
  function renderRow(r) {
    setText(r.lb, call(r.label));
    var help = call(r.help);
    setText(r.hp, help);
    r.hp.style.display = help ? '' : 'none';
    var edit = set.editing === r;
    r.ctl.classList.toggle('editing', edit);
    if (r.kind === VALUE) setText(r.val, call(r.value));
    else if (r.kind === STEP) setText(r.val, r.value(edit ? set.draft : null));
    else if (r.kind === SEG) {
      var sel = edit ? set.draft : r.selected();
      for (var i = 0; i < r.segEls.length; i++) r.segEls[i].classList.toggle('on', i === sel);
    } else r.sw.classList.toggle('on', !!r.on());
  }

  // ---------------------------------------------------------------- editing a row (the TCL build's Settings keys)

  /** OK on a SEG or STEP row: ◀▶ now move an unsaved draft, OK saves it, Back cancels. */
  function startEditing(r) {
    set.editing = r;
    set.draft = r.kind === SEG ? r.selected() : r.amount();
    renderRow(r);
    setHints(set.hints, [t.hintChange(), t.hintSave(), t.hintBackCancel()]);
  }
  /** Leaves editing; save keeps the draft if it differs from what is saved. */
  function stopEditing(save) {
    var r = set.editing;
    set.editing = null;
    if (save && set.draft !== (r.kind === SEG ? r.selected() : r.amount())) {
      if (r.kind === SEG) r.select(set.draft);
      else r.setAmount(set.draft);
      showSaved();
    }
    if (!set.rows) return;
    refreshSettings();
    focusRow(set.rowIndex);
    r.el._focus();
  }
  /** One step of the draft while editing, within the row's range. */
  function moveDraft(d) {
    var r = set.editing;
    var lo = r.kind === SEG ? 0 : r.low, hi = r.kind === SEG ? r.segEls.length - 1 : r.high;
    var to = Math.max(lo, Math.min(hi, set.draft + d));
    if (to === set.draft) return;
    set.draft = to;
    renderRow(r);
  }
  /** ✓ Saved at the end of the hint line for 2 s (motion.saved-lifetime); a new save starts it again. */
  function showSaved() {
    if (!set.saved) return;
    clearTimeout(set.savedTimer);
    set.saved.classList.add('on');
    set.savedTimer = setTimeout(function () { set.saved.classList.remove('on'); }, 2000);
  }

  /**
   * The pointer on a Settings row: − or + steps and saves at once, a segment is chosen at once; anything else on
   * the row is OK. Returns true when it handled the click.
   */
  function pointerSetting(target) {
    var rows = set.rows && set.rows[set.section];
    if (!rows) return false;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.el.contains(target)) continue;
      if (set.editing) stopEditing(false);
      if (r.kind === STEP && target._d) {
        var n = Math.max(r.low, Math.min(r.high, r.amount() + target._d));
        if (n !== r.amount()) { r.setAmount(n); showSaved(); }
      } else if (r.kind === SEG && r.segEls.indexOf(target) >= 0) {
        var s = r.segEls.indexOf(target);
        if (s !== r.selected()) { r.select(s); showSaved(); }
      } else return false;
      refreshSettings();
      return true;
    }
    return false;
  }

  function refreshSettings() {
    if (!set.rows) return;
    var rows = set.rows[set.section];
    for (var i = 0; i < rows.length; i++) renderRow(rows[i]);
    setTime(set.previewValue, dayAt(Date.now()).times[ASR]);
  }

  /**
   * What's new: the latest releases, newest first, each its version and a few short lines (Text.news), in the
   * app's language. Read-only, built the first time its section opens.
   */
  function buildNews(g) {
    var page = set.news = place(el('div', 'news ui', g), 640, 112, 1184, 976 - 24 - 112);
    var list = set.newsList = el('div', null, page);
    t.news().forEach(function (group) {
      el('div', 'nhead gold', list, t.newsVersion(group[0]));
      for (var i = 1; i < group.length; i++) el('div', 'nline', list, '•  ' + t.d(group[i]));
    });
    page._focus = function () { setHints(set.hints, [t.hintMove(), t.hintBackMenu()]); };
  }

  /** Into What's new: ▲▼ scroll it, toward the start or Back return to the sections. */
  function focusNews() {
    set.onNav = false;
    focus(set.news);
  }

  function showSection(s) {
    set.section = s;
    if (s === NEWS_S && !set.news) buildNews(set.groups[NEWS_S]);
    for (var i = 0; i < SECTIONS; i++) {
      set.groups[i].style.display = i === s ? '' : 'none';
      set.nav[i].classList.toggle('open', i === s);
    }
    setText(set.label, sectionName(s));
    refreshSettings();
  }

  function focusNav() {
    set.onNav = true;
    focus(set.nav[set.section]);
    set.nav[set.section]._focus();
  }
  function focusRow(i) {
    set.onNav = false;
    set.rowIndex = i;
    focus(set.rows[set.section][i].el);
  }

  /**
   * OK on a row, the only key that changes anything (the TCL build's fix): a list opens, a switch flips, a choice
   * or a stepper starts editing.
   */
  function rowAction(r) {
    if (r.kind === SEG || r.kind === STEP) return startEditing(r);
    if (r.kind === TOGGLE) {
      r.set(!r.on());
      if (r.saves !== false) showSaved();
      refreshSettings();
      return;
    }
    r.open();
  }

  /**
   * The arrows only move: ▲▼ through the sections or the rows, toward the end (or OK) into the rows, toward the
   * start back to the sections. While a row is edited ◀▶ move its draft, OK saves and Back cancels.
   */
  function settingsKey(k) {
    var toEnd = (k === KEY.RIGHT) !== rtl;
    if (set.editing) {
      if (k === KEY.OK) stopEditing(true);
      else if (k === KEY.BACK) stopEditing(false);
      else if (k === KEY.LEFT || k === KEY.RIGHT) moveDraft(toEnd ? 1 : -1);
      return;
    }
    if (k === KEY.BACK) {
      if (set.onNav) show('home');
      else focusNav();
      return;
    }
    var vertical = k === KEY.UP || k === KEY.DOWN, up = k === KEY.UP ? -1 : 1;
    if (set.onNav) {
      if (vertical) {
        var to = set.section + up;
        if (to >= 0 && to < SECTIONS) { showSection(to); focusNav(); }
      } else if (k === KEY.OK || (toEnd && (k === KEY.LEFT || k === KEY.RIGHT))) {
        if (set.section === NEWS_S) focusNews(); else focusRow(0);
      }
      return;
    }
    if (set.section === NEWS_S) {
      if (vertical) set.news.scrollTop += up * 240;
      else if (!toEnd && (k === KEY.LEFT || k === KEY.RIGHT)) focusNav();
      return;
    }
    var rows = set.rows[set.section];
    if (vertical) {
      var r = set.rowIndex + up;
      if (r >= 0 && r < rows.length) focusRow(r);
      return;
    }
    if (k === KEY.OK) rowAction(rows[set.rowIndex]);
    else if (!toEnd && (k === KEY.LEFT || k === KEY.RIGHT)) focusNav();
  }

  // ---------------------------------------------------------------- the list chooser (cities, methods, voices…)

  var ch = { on: false, items: [], index: 0, scroll: 0, back: null };

  function buildChooser() {
    ch.scrim = el('div', 'scrim', stage);
    var box = ch.box = el('div', 'box chooser', ch.scrim);
    ch.head = el('div', 'head dispb', box);
    ch.view = el('div', 'view', box);
    ch.list = el('div', 'list', ch.view);
    ch.hints = el('div', 'hints', box);
    ch.hints.style.marginTop = '20px';
    for (var i = 0; i < 3; i++) el('span', null, ch.hints);
  }

  /**
   * A list over the screen: OK picks, Back cancels, or opens the list before it when the caller sets ch.back after
   * this. onFocus, if given, hears each item as focus reaches it.
   */
  function openChooser(title, items, selected, pick, onFocus) {
    if (!ch.scrim) buildChooser();
    ch.pick = pick;
    ch.back = null;
    ch.onFocus = onFocus || null;
    ch.returnTo = cur;
    setText(ch.head, title);
    while (ch.items.length < items.length) {
      var it = el('div', 't r0 item', ch.list);
      it._focus = (function (x) { return function () { chooserFocused(x); }; })(ch.items.length);
      ch.items.push(it);
    }
    for (var i = 0; i < ch.items.length; i++) {
      var e = ch.items[i];
      if (i < items.length) {
        setText(e, items[i]);
        e.style.display = '';
        e.classList.toggle('chosen', i === selected);
      } else e.style.display = 'none';
    }
    ch.count = items.length;
    var viewH = Math.min(items.length, 8) * 74 - 6;
    ch.viewH = viewH;
    ch.view.style.height = viewH + 'px';
    var boxH = 40 + 53 + 10 + 20 + viewH + 20 + 20 + 28 + 32;
    ch.box.style.top = Math.max(40, Math.round((1080 - boxH) / 2)) + 'px';
    ch.box.style.left = '510px';
    ch.scroll = 0;
    ch.list.style.transform = '';
    setHints(ch.hints, [t.hintMove(), t.hintChoose(), t.hintBackMenu().replace(t.ar ? 'القائمة' : 'Menu', t.cancel())]);
    ch.on = true;
    ch.scrim.classList.add('on');
    focus(ch.items[Math.max(0, selected)]);
  }

  function chooserFocused(i) {
    ch.index = i;
    var top = i * 74, s = ch.scroll;
    if (top < s) s = top;
    if (top + 68 > s + ch.viewH) s = top + 68 - ch.viewH;
    if (s !== ch.scroll) {
      ch.scroll = s;
      ch.list.style.transform = 'translateY(' + (-s) + 'px)';
    }
    if (ch.onFocus) ch.onFocus(i);
  }

  function closeChooser(picked) {
    ch.on = false;
    ch.scrim.classList.remove('on');
    if (ch.onFocus) stopPreview();
    var back = ch.returnTo, pick = ch.pick;
    ch.pick = null;
    focus(back);
    if (picked != null && pick) {
      pick(picked);
      // A list in Settings saves what was picked; one that leads to another list (region, then country) opens it
      // first, in its own timeout, and saves only at the last one.
      setTimeout(function () { if (screen === set && !ch.on) showSaved(); }, 0);
    }
    if (screen === set) refreshSettings();
  }

  function chooserKey(k) {
    if (k === KEY.BACK) {
      var back = ch.back;
      closeChooser(null);
      if (back) setTimeout(back, 0);
      return;
    }
    if (k === KEY.OK) return closeChooser(ch.index);
    if (k === KEY.UP && ch.index > 0) focus(ch.items[ch.index - 1]);
    else if (k === KEY.DOWN && ch.index < ch.count - 1) focus(ch.items[ch.index + 1]);
  }

  /**
   * Location: the region, then its countries, then the country's cities, so no list is longer than 16. A country
   * with a single city takes it at once. Back goes one step back.
   */
  function chooseRegion() {
    openChooser(t.region(), t.regions(), P.region(city), function (r) { setTimeout(function () { chooseCountry(r); }, 0); });
  }
  /** One region's countries, A to Z in the app's language ("ال" not counted), as SettingsActivity sorts them. */
  function chooseCountry(r) {
    var countries = [];
    P.REGIONS[r].forEach(function (en) {
      for (var i = 0; i < P.CITIES.length; i++) {
        if (P.CITIES[i].countryEn === en) { countries.push(t.ar ? P.CITIES[i].countryAr : en); break; }
      }
    });
    var order = null;
    try { order = new Intl.Collator(t.ar ? 'ar' : 'en'); } catch (e) { /* code-point order below */ }
    function bare(n) { return n.replace(/^ال/, ''); }
    countries.sort(function (a, b) {
      a = bare(a); b = bare(b);
      return order ? order.compare(a, b) : a < b ? -1 : a > b ? 1 : 0;
    });
    var sel = countries.indexOf(t.ar ? city.countryAr : city.countryEn);
    openChooser(t.regions()[r], countries, sel, function (i) { setTimeout(function () { chooseCity(countries[i], r); }, 0); });
    ch.back = chooseRegion;
  }
  /** A city also takes its usual method and Asr school (Prefs.setCity); their rows can still change them. */
  function chooseCity(country, r) {
    var found = [];
    P.CITIES.forEach(function (c) { if ((t.ar ? c.countryAr : c.countryEn) === country) found.push(c); });
    function take(c) { S.city = c.id; S.method = c.method; S.madhab = c.madhab; changed(true); refreshSettings(); }
    if (found.length === 1) return take(found[0]);
    var sel = 0;
    found.forEach(function (c, i) { if (c.id === city.id) sel = i; });
    openChooser(country, found.map(function (c) { return t.ar ? c.ar : c.en; }), sel, function (i) { take(found[i]); });
    ch.back = function () { chooseCountry(r); };
  }

  /** Station: the broadcast stations or the reciters, then one of them. Playing radio moves to it at once. */
  function chooseStation() {
    openChooser(t.stationRow(), t.stationGroups(), station().reciter ? 1 : 0, function (g) {
      setTimeout(function () {
        var found = [];
        DATA.STATIONS.forEach(function (s, i) { if (s.reciter === (g === 1)) found.push(i); });
        var sel = Math.max(0, found.indexOf(stationIndex()));
        openChooser(t.stationGroups()[g], found.map(function (i) { return t.stationChoice(DATA.STATIONS[i]); }), sel,
          function (k) { radioSwitch(found[k]); if (screen === set) refreshSettings(); });
      }, 0);
    });
  }

  // ---------------------------------------------------------------- the call to prayer (NowActivity)

  var now = screens.now = { build: buildNow, ctx: null };

  function buildNow() {
    var e = now.el = el('div', 'screen', stage);
    e.id = 'now';
    archSvg(e, 600, 110, 720, 900, 1.2, 'near');
    var c = place(el('div', 'col', e), 640, 230, 640);
    el('div', 'verse2 sacred', c, 'حَيَّ عَلَى الصَّلَاةِ');
    now.label = el('div', 'lbl caps', c, t.nowLabel());
    now.name = el('div', 'name dispb', c);
    now.when = timeEl(c, 'when disp num');
    var play = now.play = el('div', 't callbtn a', c);
    var dismiss = now.dismiss = el('div', 't callbtn b', c, t.dismiss());
    play._ok = function () { if (Sound.kind === 'adhan') stopAdhan(); else startAdhan(); };
    dismiss._ok = function () { closeCall(); };
    now.hint = el('div', 'hint', c);
  }

  /**
   * Opens the call for a prayer at its time. ctx: { cold } when Afnon was started just for it (it closes again
   * afterwards), { hidden } when it was behind another app (it goes back there), else it returns to the screen.
   */
  function openCall(prayer, time, ctx) {
    var key = prayer + ':' + time;
    watch.called = key;
    // The page and the service both open it (the service a few seconds later): once per prayer.
    if (!ctx.test && now.lastKey === key) return;
    now.lastKey = key;
    // The call wakes the screen and the panel, as AfnonDream steps aside for it.
    wake();
    if (now.ctx) endCall(false);
    ctx.key = key;
    ctx.opened = Date.now();
    ctx.prev = screen && screen !== now ? screen : null;
    ctx.prevFocus = cur;
    now.ctx = ctx;
    if (ch.on) closeChooser(null);
    show('now');
    var n = t.prayerNames();
    if (prayer === DHUHR && P.isFriday(clock, time)) n[DHUHR] = t.jumuah();
    setText(now.name, n[prayer]);
    setTime(now.when, time);
    setText(now.hint, t.nowHint(S.callClose));
    focus(now.play);
    ctx.radioHeld = radioHold();
    ctx.prayer = prayer;
    if (S.adhan || ctx.test) startAdhan();
    else updatePlayLabel();
    var minutes = S.callClose;
    if (minutes > 0) ctx.timer = setTimeout(closeCall, minutes * 60000);
    else if (Sound.kind !== 'adhan') ctx.timer = setTimeout(closeCall, NO_ADHAN_CLOSE_MS);
    note('call p' + prayer + ' open (' + (ctx.cold ? 'cold start' : ctx.hidden ? 'from background' : 'in front') + '), closes ' + (minutes ? 'after ' + minutes + ' min' : 'with the adhan'));
  }

  function startAdhan() {
    var ctx = now.ctx;
    if (!ctx) return;
    var id = ctx.prayer === FAJR ? S.voiceFajr : S.voice;
    var begun = Date.now();
    playSound('sounds/adhan/' + id + '.mp3', 'adhan', function (ok) {
      note('adhan ' + id + (ok ? ' ended after ' + Math.round((Date.now() - begun) / 1000) + ' s' : ' failed'));
      updatePlayLabel();
      if (now.ctx !== ctx) return;
      if (S.callClose === 0) {
        if (ok) closeCall();
        else { clearTimeout(ctx.timer); ctx.timer = setTimeout(closeCall, NO_ADHAN_CLOSE_MS); }
      }
    });
    updatePlayLabel();
  }
  function stopAdhan() {
    if (Sound.kind === 'adhan') stopSound();
    updatePlayLabel();
  }
  function updatePlayLabel() {
    if (now.play) setText(now.play, Sound.kind === 'adhan' ? t.stop() : t.play());
  }

  /** Ends the call: the adhan stops, the radio comes back (Settings → Radio), and Afnon returns to where it was. */
  function endCall(leave) {
    var ctx = now.ctx;
    if (!ctx) return;
    now.ctx = null;
    note('call closes after ' + Math.round((Date.now() - ctx.opened) / 1000) + ' s' + (leave ? (ctx.from ? ', back to ' + ctx.from : ctx.cold || ctx.hidden ? ', back behind' : '') : ', Afnon left'));
    clearTimeout(ctx.timer);
    stopAdhan();
    if (ctx.radioHeld) radioResume(S.radioResume);
    if (!leave) return;
    show(ctx.prev ? nameOf(ctx.prev) : 'home');
    if (ctx.prevFocus && ctx.prev) focus(ctx.prevFocus);
    // Opened for the call over another app or input: back to it, by name when the service saw which it was. The
    // service's word counts even when the page thought it was in front (webOS brings it forward before the page
    // hears the launch), and stepping back from a call that started the launcher would land on LG's Home bar.
    // The launcher never closes itself, so it is ready the next time (the Afnon app closed here).
    if (ctx.from) launchApp(ctx.from);
    else if (ctx.hidden || ctx.cold) toBackground();
  }
  function closeCall() { endCall(true); }

  /** Afnon went behind another app during the call: end it quietly, back on the screen it came from. */
  function leaveCall() {
    var ctx = now.ctx;
    endCall(false);
    show(ctx.prev ? nameOf(ctx.prev) : 'home');
    if (ctx.prevFocus && ctx.prev) focus(ctx.prevFocus);
  }

  function nameOf(s) { for (var k in screens) if (screens[k] === s) return k; return 'home'; }

  function nowKey(k) {
    if (k === KEY.BACK) return closeCall();
    if (k === KEY.UP) focus(now.play);
    else if (k === KEY.DOWN) focus(now.dismiss);
    else if (k === KEY.OK && cur && cur._ok) cur._ok();
  }

  // ---------------------------------------------------------------- the watch while the page is in front

  /**
   * PrayerWatch for the page: while Afnon is in front, the reminder card and spoken line, the call at the time
   * and the announcement come from here at once (the service's events land a few seconds later and are skipped).
   * Only changes while the page runs count: arm() takes whatever is already due as done.
   */
  var watch = { reminded: '', called: '', announced: '', day: null, minute: -1 };

  function due(nowMs) {
    var minute = Math.floor(nowMs / 60000);
    if (!watch.day || watch.minute !== minute || Text.secondsUntil(watch.day.nextTime, nowMs) === 0) {
      watch.minute = minute;
      watch.day = dayAt(nowMs);
    }
    var d = watch.day, r = { call: -1, announce: -1, remind: false };
    for (var i = 0; i < 6; i++) {
      if (i === SUNRISE) continue;
      var since = nowMs - d.times[i];
      if (since < 0 || since >= CALL_WINDOW_MS) continue;
      if (S.adhan && S.bells[i]) r.call = i;
      else if (S.announce) r.announce = i;
    }
    if (S.remind > 0) {
      var left = Text.secondsUntil(d.nextTime, nowMs);
      r.remind = left > 0 && left <= S.remind * 60;
    }
    // «أوشك وقت صلاة … على الانتهاء» (Afnon's TCL build), S.endRemind minutes before the current prayer's time ends
    // (Settings → Reminders; 0 is off). Fajr ends at sunrise, Dhuhr, Asr and Maghrib at the next prayer, Isha at
    // Fajr (before Fajr, the night's Isha is the current one).
    if (S.endRemind > 0) {
      var cur = d.nowIndex, end = 0;
      if (cur === FAJR) end = d.times[SUNRISE];
      else if (cur > SUNRISE) end = d.nextTime;
      else if (nowMs < d.times[FAJR]) { cur = ISHA; end = d.times[FAJR]; }
      var toEnd = end ? Text.secondsUntil(end, nowMs) : 0;
      if (toEnd > 0 && toEnd <= S.endRemind * 60) r.end = { prayer: cur, time: end };
    }
    return r;
  }
  // A reminder that began less than this before the page started or came back is still the page's to give: the
  // service, which fires a few seconds late, may have left it to the page (it thought Afnon was on Home).
  var ARM_GRACE_MS = 30000;
  function watchArm(nowMs) {
    var r = due(nowMs), d = watch.day;
    if (r.call >= 0) watch.called = r.call + ':' + d.times[r.call];
    if (r.announce >= 0 && nowMs - d.times[r.announce] > ARM_GRACE_MS) watch.announced = r.announce + ':' + d.times[r.announce];
    if (r.remind && nowMs - (d.nextTime - S.remind * 60000) > ARM_GRACE_MS) watch.reminded = d.nextIndex + ':' + d.nextTime;
    if (r.end && nowMs - (r.end.time - S.endRemind * 60000) > ARM_GRACE_MS) watch.ended = r.end.prayer + ':' + r.end.time;
  }
  /** After a settings change: a reminder that is not due with the new minutes may come again (5 → 10 → 5). */
  function watchRearm(nowMs) {
    var r = due(nowMs);
    if (!r.remind) watch.reminded = '';
    if (!r.end) watch.ended = '';
    if (r.announce < 0) watch.announced = '';
  }
  function watchTick(nowMs) {
    var r = due(nowMs), d = watch.day, key;
    if (r.call >= 0) {
      key = r.call + ':' + d.times[r.call];
      if (key !== watch.called) openCall(r.call, d.times[r.call], {});
      return;
    }
    if (r.announce >= 0) {
      key = r.announce + ':' + d.times[r.announce];
      if (key !== watch.announced) { watch.announced = key; speak('now_', r.announce, d.friday); }
    }
    // While the screen is off or dim the reminder waits (AfnonDream.running), as on Android.
    if (r.remind && !dream.on && !offv.on) {
      key = d.nextIndex + ':' + d.nextTime;
      if (key !== watch.reminded) {
        watch.reminded = key;
        if (screen === home) showReminder();
        if (S.remindVoice) speak('before_', d.nextIndex, d.friday);
      }
    }
    // After any line that is playing (the next prayer's reminder often comes at the same moment).
    if (r.end && !dream.on && !offv.on && !Sound.kind) {
      key = r.end.prayer + ':' + r.end.time;
      if (key !== watch.ended) { watch.ended = key; speak('end_', r.end.prayer, d.friday); }
    }
  }

  // ---------------------------------------------------------------- the panel, screen off and the dim screen

  function localGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* this session only */ } }

  /**
   * The TV's panel, off while the radio plays. A Developer Mode app is denied com.webos.service.tvpower, so this
   * goes through the TV's own remote-control connection (js/ssap.js, loaded the first time it is needed), which
   * the TV asks the viewer to allow once. Until it is allowed (or if it is declined) the screen is just black,
   * as on Android where TCL's Audio Only is missing. want: what the screen should be; off: what it is.
   */
  var Panel = { want: false, off: false, busy: false, explicit: false };
  var PANEL_URI = 'ssap://com.webos.service.tvpower/power/', PANEL_KEY = 'afnon-panel';
  var ssapWaiting = null;

  function withSsap(cb) {
    if (window.AfnonSsap) return cb(window.AfnonSsap);
    if (ssapWaiting) return ssapWaiting.push(cb);
    ssapWaiting = [cb];
    var s = document.createElement('script');
    s.src = 'js/ssap.js';
    s.onload = s.onerror = function () {
      var list = ssapWaiting;
      ssapWaiting = null;
      for (var i = 0; i < list.length; i++) list[i](window.AfnonSsap || null);
    };
    document.head.appendChild(s);
  }

  /** explicit: the Screen off button, which may show the TV's Allow prompt again after a No. */
  function panel(want, explicit) {
    Panel.want = want;
    if (want && explicit) Panel.explicit = true;
    panelSync();
  }
  function panelSync() {
    if (Panel.busy || Panel.want === Panel.off) return;
    // PANEL_KEY: null (never asked), 'asked' (the prompt went unanswered), 'declined' or 'ok' (allowed). The TV's
    // prompt comes up by itself once at most; after that only the Screen off button brings it back.
    var off = Panel.want, st = localGet(PANEL_KEY);
    var canPrompt = Panel.explicit || st == null;
    if (off && st !== 'ok' && !canPrompt && Panel.luna === false) return;
    if (!TV) { Panel.off = off; return; }
    Panel.busy = true;
    // The page's own luna first, once per session: the service is denied it, the page may not be.
    if (Panel.luna !== false) {
      return luna('luna://com.webos.service.tvpower/power/' + (off ? 'turnOffScreen' : 'turnOnScreen'), { standbyMode: 'active' }, function (r) {
        note('panel ' + (off ? 'off' : 'on') + ' (luna) -> ' + JSON.stringify(r).slice(0, 160));
        Panel.busy = false;
        if (r.returnValue) { Panel.luna = true; Panel.off = off; }
        else Panel.luna = false;
        panelSync();
      });
    }
    if (off && st !== 'ok' && !canPrompt) { Panel.busy = false; Panel.want = false; return; }
    withSsap(function (ssap) {
      if (!ssap) { Panel.busy = false; return; }
      ssap.request(PANEL_URI + (off ? 'turnOffScreen' : 'turnOnScreen'), { standbyMode: 'active' }, {
        allowPrompt: off && canPrompt,
        onPrompt: function () {
          note('panel: the TV asks to allow Afnon');
          if (localGet(PANEL_KEY) !== 'ok') localSet(PANEL_KEY, 'asked');
          showAsk(true);
        }
      }, function (r) {
        var ok = r.returnValue !== false;
        Panel.busy = false;
        if (off) Panel.explicit = false;
        showAsk(false);
        note('panel ' + (off ? 'off' : 'on') + ' -> ' + JSON.stringify(r).slice(0, 160));
        if (ok) {
          Panel.off = off;
          Panel.at = Date.now();
          localSet(PANEL_KEY, 'ok');
          // The TV turns the panel back on by itself for a remote key, which Afnon may never see: its power
          // state says so, and then the screen comes back here too.
          if (off && !Panel.watching) {
            Panel.watching = true;
            ssap.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', { subscribe: true }, function (p) {
              if (p.returnValue === false) { Panel.watching = false; return; }
              if (p.state) note('panel state ' + p.state);
              if (p.state === 'Active' && Panel.off && !Panel.busy && Date.now() - Panel.at > 3000) {
                Panel.off = false;
                Panel.want = false;
                wake();
                setTimeout(function () { if (!Panel.off && !Panel.busy) ssap.close(); }, 0);
              }
            });
          }
        } else if (off) {
          // Not allowed: the in-app black screen stays instead.
          if (/cancel|reject|denied|declin/i.test(r.errorText || '')) localSet(PANEL_KEY, 'declined');
          Panel.want = false;
        } else Panel.off = false; // the key that came back has woken it anyway
        if (Panel.want !== Panel.off && (ok || !off)) return panelSync();
        // The socket is only kept while the panel is off, for a quick way back.
        if (!Panel.off && window.AfnonSsap) window.AfnonSsap.close();
      });
    });
  }

  /** The line asking to choose Allow, while the TV shows its prompt; the black screen's note stays up for it. */
  function showAsk(on) {
    if (offv.ask) offv.ask.style.display = on ? '' : 'none';
    if (dream.ask) dream.ask.style.display = on ? '' : 'none';
    if (offv.on) fadeOffNote(on ? 0 : 6000);
  }

  /** Any key, the call, the radio stopping or Afnon going behind another app: the screen and panel come back. */
  function wake() {
    lastInput = Date.now();
    var was = offv.on || dream.on;
    if (offv.on) hideOff();
    if (dream.on) hideDream();
    if (was) { tellService(); setTimeout(function () { tick(true); }, 0); }
    return was;
  }

  // Screen off (ScreenOffActivity): black, the bars and the station with "press any key", fading after 6 s.
  var offv = { on: false };
  function buildOff() {
    var v = offv.el = el('div', 'veil', stage);
    var c = offv.col = el('div', 'offcol', v);
    offv.bars = bars(c, 5, 56, 48);
    offv.note = el('div', 'offnote', c);
    offv.ask = el('div', 'offnote ask', c, t.allowPanel());
    offv.ask.style.display = 'none';
  }
  function screenOff(explicit) {
    if (dream.on) hideDream();
    if (!Radio.wanted) radioStart();
    if (!offv.el) buildOff();
    setText(offv.note, t.station(station()) + '\n' + t.screenOffNote());
    offv.el.classList.add('on');
    offv.on = true;
    fadeOffNote(6000);
    tellService();
    note('screen off (' + (explicit ? 'button' : 'auto') + ')');
    panel(true, explicit);
  }
  /** Shows the note and bars, and fades them after ms (0: they stay). */
  function fadeOffNote(ms) {
    clearTimeout(offv.timer);
    offv.col.style.opacity = '';
    setBarsLive(offv.bars, true);
    if (!ms) return;
    offv.timer = setTimeout(function () {
      offv.col.style.opacity = '0';
      offv.timer = setTimeout(function () { setBarsLive(offv.bars, false); }, 1600);
    }, ms);
  }
  function hideOff() {
    offv.on = false;
    clearTimeout(offv.timer);
    offv.el.classList.remove('on');
    setBarsLive(offv.bars, false);
    panel(false);
  }

  /**
   * The dim screen (AfnonDream), in Afnon itself since LG keeps its own screensaver: after IDLE_MS without a key
   * while the radio plays, black with a dim arch outline, the clock, the date and the next prayer. The group moves
   * every 60 s with an 800 ms fade. After Settings → Radio → Screen off while listening (at once by default) the
   * panel goes off too. Any key comes back.
   */
  var IDLE_MS = 5 * 60000, DRIFT_MS = 60000, FADE_MS = 800, DREAM_W = 440, DREAM_H = 640;
  var lastInput = Date.now();
  var dream = { on: false, start: 0, lastDrift: 0, minute: -1, dark: false, day: null };

  function buildDream() {
    var v = dream.el = el('div', 'veil', stage);
    var g = dream.group = el('div', 'dgroup', v);
    var s = svgEl('svg', { width: DREAM_W, height: DREAM_H, 'class': 'dline' }, g);
    svgEl('path', { d: 'M2 580L2 230C2 120 100 52 220 2C340 52 438 120 438 230L438 580' }, s);
    var c = el('div', 'dcol', g);
    dream.clock = timeEl(c, 'dclock disp num tnum');
    dream.date = el('div', 'ddate', c);
    el('div', 'drule', c);
    dream.next = el('div', 'dnext', c);
    dream.left = el('div', 'dleft', c);
    var r = dream.radio = el('div', 'drow', c);
    dream.bars = bars(r, 3, 22, 20);
    dream.rtext = el('div', 'dradio', r);
    dream.ask = el('div', 'dleft', c, t.allowPanel());
    dream.ask.style.display = 'none';
  }
  function placeDream(x, y) {
    dream.group.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }
  function showDream() {
    if (dream.on) return;
    if (!dream.el) buildDream();
    dream.on = true;
    dream.start = dream.lastDrift = Date.now();
    dream.minute = -1;
    dream.dark = false;
    dream.group.style.visibility = '';
    dream.group.style.opacity = '';
    // The design's own spot first; drifting starts a minute later.
    placeDream(1140, 250);
    dream.el.classList.add('on');
    tellService();
    note('dim screen on');
    renderDream(Date.now());
  }
  function hideDream() {
    dream.on = false;
    clearTimeout(dream.fade);
    dream.el.classList.remove('on');
    setBarsLive(dream.bars, false);
    if (dream.dark) { dream.dark = false; panel(false); }
  }
  function drift() {
    dream.lastDrift = Date.now();
    var x = 96 + Math.random() * (1920 - 2 * 96 - DREAM_W), y = 56 + Math.random() * (1080 - 2 * 56 - DREAM_H);
    dream.group.style.opacity = '0';
    clearTimeout(dream.fade);
    dream.fade = setTimeout(function () { placeDream(x, y); dream.group.style.opacity = ''; }, FADE_MS);
  }
  function renderDream(nowMs) {
    var minute = Math.floor(nowMs / 60000), d = dream.day;
    var arrived = d && Text.secondsUntil(d.nextTime, nowMs) === 0;
    if (!d || arrived || minute !== dream.minute) {
      dream.minute = minute;
      d = dream.day = dayAt(arrived ? nowMs + 1000 : nowMs);
      setTime(dream.clock, nowMs);
      setText(dream.date, t.d(t.weekdays()[d.weekday] + t.sep() + d.hijriDay + ' ' + t.hijriMonths()[d.hijriMonth]));
      setText(dream.next, names(d)[d.nextIndex] + ' ' + clockText(d.nextTime));
    }
    var secs = Text.secondsUntil(d.nextTime, nowMs);
    setText(dream.left, t.inMinutes(Math.floor((secs + 59) / 60), Text.duration(secs, false)));
    var on = Radio.wanted;
    dream.radio.style.display = on ? '' : 'none';
    if (on) setText(dream.rtext, t.station(station()) + t.sep() + t.radioStatus(Radio.state));
    var minutes = S.radioDark;
    var due = on && minutes >= 0 && nowMs - dream.start >= minutes * 60000;
    if (due !== dream.dark) {
      dream.dark = due;
      dream.group.style.visibility = due ? 'hidden' : '';
      panel(due, false);
    }
    setBarsLive(dream.bars, on && !due && Radio.state === Radio.PLAYING);
    if (!due && nowMs - dream.lastDrift >= DRIFT_MS) drift();
  }

  // Radio off ends both (ScreenOffActivity finishes; on LG the dim screen is the radio's).
  Radio.listeners.push(function () { if (!Radio.wanted && (offv.on || dream.on)) wake(); });

  // ---------------------------------------------------------------- the clock

  /**
   * Whether the TV's clock is set. After a power cut the TV starts with a wrong date (1 January) until LG's time
   * server answers, sometimes minutes later, and the launcher opens before that: it showed the wrong next prayer
   * (Fajr) until its next once-a-minute look. Now, while the clock isn't set (getSystemTime's timeValid), Home
   * says so instead of times and nothing is called or spoken; the moment it is set, or jumps, everything is
   * worked out again and the service is told, so it reschedules the adhan.
   */
  var Time = { valid: true, lastTick: 0 };
  function lunaSubscribe(uri, params, cb) {
    if (!TV) return;
    var b = new PalmServiceBridge();
    Time.bridge = b;   // kept, or the subscription would end with it
    b.onservicecallback = function (m) { try { cb(JSON.parse(m)); } catch (e) { /* not JSON */ } };
    b.call(uri, JSON.stringify(params));
  }
  lunaSubscribe('luna://com.palm.systemservice/time/getSystemTime', { subscribe: true }, function (r) {
    if (r.timeValid === undefined) return;
    var valid = r.timeValid !== false;
    if (valid === Time.valid) return;
    Time.valid = valid;
    note('clock ' + (valid ? 'set: ' + new Date().toISOString() : 'not set yet'));
    clockChanged();
  });
  /** The clock was set or jumped: the day, the watch and the service's schedule from the new time. */
  function clockChanged() {
    home.lastMinute = -1;
    home.day = null;
    watch.day = null;
    day.lastMinute = -1;
    watchArm(Date.now());
    if (Time.valid) configureService(500);
    tick(true);
  }

  var tickTimer = 0, toldMinute = -1;
  function tick(force) {
    clearTimeout(tickTimer);
    if (document.hidden) { Time.lastTick = 0; return; }
    var nowMs = Date.now();
    // A jump of more than a minute between seconds: the clock was set (or changed by hand).
    if (Time.lastTick && Math.abs(nowMs - Time.lastTick - 1000) > 60000) {
      note('clock jumped ' + Math.round((nowMs - Time.lastTick) / 1000) + ' s');
      Time.lastTick = nowMs;
      return clockChanged();
    }
    Time.lastTick = nowMs;
    // Until the clock is set: no times on Home, nothing called or spoken.
    home.el && home.el.classList.toggle('notime', !Time.valid);
    if (!Time.valid) {
      if (screen === home && home.arch) {
        setText(home.arch.label, t.settingTime());
        setText(home.arch.name, '');
        setText(home.arch.count, '');
        setText(home.arch.sub, '');
        home.arch.sub2.style.display = 'none';
        home.lastMinute = -1;
      }
      tickTimer = setTimeout(tick, 1000);
      return;
    }
    if (Math.floor(nowMs / 60000) !== toldMinute) { toldMinute = Math.floor(nowMs / 60000); tellService(true); }
    // Under the black or dim screen the screen beneath is left alone; it catches up when it shows again.
    if (dream.on) renderDream(nowMs);
    else if (offv.on) { /* nothing to draw */ }
    else if (screen === home) {
      renderHome(force === true);
      // The card outlived its prayer (the call took over, or the time passed).
      if (home.card && Text.secondsUntil(home.cardFor, nowMs) === 0) dismissReminder();
    } else if (screen === day) renderDay(force === true);
    else if (screen === allv) renderAll();
    watchTick(nowMs);
    if (!dream.on && !offv.on && Radio.wanted && screen !== now && nowMs - lastInput >= IDLE_MS) showDream();
    tickTimer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  }

  // ---------------------------------------------------------------- keys

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    // Volume belongs to the TV, and 1536+ are the Magic Remote pointer's own events: neither counts as a key.
    if (k === 447 || k === 448 || k === 449 || k >= 1536) return;
    // Desktop preview: Escape and Backspace are Back.
    if (k === 27 || k === 8) k = KEY.BACK;
    lastInput = Date.now();
    // Any other key brings the screen back from off or dim, and does nothing else.
    if (offv.on || dream.on) { e.preventDefault(); wake(); return; }
    if (k !== KEY.LEFT && k !== KEY.RIGHT && k !== KEY.UP && k !== KEY.DOWN && k !== KEY.OK && k !== KEY.BACK) return;
    e.preventDefault();
    // Held keys repeat: OK and Back act once, so holding Back does not run back through every screen to Home.
    if ((k === KEY.OK || k === KEY.BACK) && e.repeat) return;
    // On an app in All apps, OK acts when it is let go: held for HOLD_MS it opens the arrange list instead.
    if (k === KEY.OK && screen === allv && !ch.on && cur && cur._app && cur.classList.contains('alltile')) {
      var x = cur;
      clearTimeout(hold.timer);
      hold.on = x;
      hold.timer = setTimeout(function () { if (hold.on === x) { hold.on = null; arrange(x); } }, HOLD_MS);
      return;
    }
    key(k);
  });
  var HOLD_MS = 700, hold = { on: null, timer: 0 };
  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== KEY.OK || !hold.on) return;
    clearTimeout(hold.timer);
    var x = hold.on;
    hold.on = null;
    if (cur === x) key(KEY.OK);
  });

  // The pointer, when it really moves, counts as using Afnon (and wakes the screen).
  var mouseAt = null;
  document.addEventListener('mousemove', function (e) {
    if (mouseAt && Math.abs(e.screenX - mouseAt[0]) + Math.abs(e.screenY - mouseAt[1]) < 24) return;
    mouseAt = [e.screenX, e.screenY];
    lastInput = Date.now();
    if (offv.on || dream.on) wake();
  });

  function key(k) {
    lastInput = Date.now();
    if (wake()) return;
    if (ch.on) return chooserKey(k);
    if (screen === home) homeKey(k);
    else if (screen === day) dayKey(k);
    else if (screen === set) settingsKey(k);
    else if (screen === now) nowKey(k);
    else if (screen === allv) allKey(k);
  }

  // The Magic Remote's pointer: hovering focuses, clicking is OK.
  stage.addEventListener('mouseover', function (e) {
    var x = e.target;
    while (x && x !== stage && !(x.classList && x.classList.contains('t'))) x = x.parentNode;
    if (!x || x === stage || x === cur) return;
    if (ch.on && x.parentNode !== ch.list) return;
    if (day.picker && day.picker.on) return;
    // With the radio card open, only its buttons; while a Settings row is edited, nothing else.
    if (screen === home && home.rcOpen && home.cardBtns.indexOf(x) < 0) return;
    if (screen === set && set.editing) return;
    if (screen === set) {
      for (var s = 0; s < SECTIONS; s++) if (set.nav[s] === x) { if (set.section !== s) showSection(s); return focusNav(); }
      var rows = set.rows[set.section];
      for (var i = 0; i < rows.length; i++) if (rows[i].el === x) return focusRow(i);
      return;
    }
    if (x.offsetParent) focus(x);
  });
  stage.addEventListener('click', function (e) {
    lastInput = Date.now();
    if (wake()) return;
    // Settings: − / + and a choice's segments act at once under the pointer.
    if (screen === set && !ch.on && pointerSetting(e.target)) return;
    if (cur) key(KEY.OK);
  });

  // ---------------------------------------------------------------- leaving and coming back

  function toBackground() {
    luna(SVC + 'visible', { visible: false });
    if (PS.platformBack) PS.platformBack();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      // Leaving Afnon (Home, another app) ends the call, as NowActivity.onStop does, and stops the radio and any
      // preview: nothing of Afnon's keeps playing behind another app.
      if (now.ctx) leaveCall();
      if (ch.on && ch.onFocus) closeChooser(null);
      stopPreview();
      radioStop();
      liveStop();
    }
    tellService();
    if (!document.hidden) {
      // The service looked after anything that came due while Afnon was behind another app.
      watchArm(Date.now());
      // Back as the Home screen: Home itself, with the apps and the network as they are now.
      if (screen === allv && !ch.on) show('home');
      // Icons missing last time may have been copied since (a new app): try those again.
      if (Object.keys(Apps.badIcon).length) { Apps.badIcon = {}; Apps.key = ''; }
      loadApps();
      updateWifi();
      tick(true);
    }
  });

  /**
   * Tells the service whether Afnon is in front and on Home, where it shows the reminder card and says the
   * spoken lines itself (the service then leaves out its toast and voice). Sent on every change and once a
   * minute; the service trusts it for only a few minutes, so a page that died can't silence the reminders.
   */
  var told = '';
  function tellService(force) {
    // Under the black or dim screen the reminder waits, as Android's does for its screensaver: no toast either.
    var v = !document.hidden, h = v && (screen === home || dream.on || offv.on);
    var key = v + '|' + h;
    if (!force && key === told) return;
    told = key;
    luna(SVC + 'visible', { visible: v, home: h, app: APP_ID });
  }

  // ---------------------------------------------------------------- the service

  var configTimer = 0;
  /** What the service needs to schedule on its own, sent when Afnon opens and (debounced) when a setting changes. */
  function configureService(delay) {
    clearTimeout(configTimer);
    configTimer = setTimeout(function () {
      luna(SVC + 'configure', {
        visible: !document.hidden,
        app: APP_ID,
        settings: {
          city: S.city, method: method(), madhab: S.madhab, adjust: S.adjust, bells: S.bells, adhan: S.adhan, remind: S.remind,
          endRemind: S.endRemind,
          remindVoice: S.remindVoice, announce: S.announce, ar: t.ar, eastern: t.eastern, h24: h24
        }
      }, function (r) {
        if (r.next) note('scheduled ' + r.next.kind + ' p' + r.next.prayer + ' at ' + new Date(r.next.at).toISOString() + (r.persist ? ' (persist)' : ''));
      });
    }, delay == null ? 1500 : delay);
  }

  // ---------------------------------------------------------------- launch params and test hooks

  /**
   * Launch params (luna-send … applicationManager/launch '{"id":"tv.afnon.launcher","params":{…}}', or the
   * address in a browser):
   *   call=<index> time=<ms>          (from the service) the call screen
   *   test=call|reminder|announce|voice  the service fires it through the Activity Manager after `seconds`
   *                                    (8 by default; prayer=<index>, clip=<name>, mtype=<type> optional;
   *                                    friday=1 with prayer=2 takes it as Jumu'ah)
   *   test=card                       Home's own reminder card at once (Android's test=reminder)
   *   test=friday|ramadan|now         Home's clock jumps to Friday 10:30, 15 Ramadan 16:30, or back
   *   at=<ISO time>                   Home's clock jumps to that moment
   *   test=radio                      the radio on or off;  station=<id> picks a station first
   *   test=screenoff                  Home's Screen off button (radio on, panel off through the TV's remote
   *                                   connection, or the black screen); any key comes back
   *   test=dream                      the dim screen now (radio on);  idle=<seconds> its idle time, this session
   *   test=lunaoff                    the service's luna turnOffScreen for 4 s (denied on this firmware)
   *   test=mem                        logs the page's memory
   *   live=makkah|madinah|off         the live video on Home;  quality=<height> first;  full=1 full screen
   *   set=key:value,…                 changes saved settings (callClose:10, night:1, radioDark:15 …)
   *   locale=ar|en|system digits=eastern|western clock=12|24|system
   *   open=day|settings|apps|radio    opens a screen (radio: Home's radio card);  keys=down,ok,back,…  presses keys
   *                                   450 ms apart
   */
  function params(p, relaunch) {
    // Language, digits and clock were applied before anything was built; a relaunch starts the page again.
    if (relaunch && displayParams(p)) {
      try { sessionStorage.setItem('afnon-return', JSON.stringify({ home: true })); } catch (e) { /* */ }
      location.reload();
      return;
    }
    if (p.station) {
      for (var i = 0; i < DATA.STATIONS.length; i++) if (DATA.STATIONS[i].id === p.station) radioSwitch(i);
    }
    if (+p.idle > 0) { IDLE_MS = +p.idle * 1000; lastInput = Date.now(); note('idle time ' + p.idle + ' s'); }
    if (p.set) applySettings(String(p.set));
    if (p.call != null && p.call !== '') {
      var hidden = relaunch && document.hidden;
      if (PS.activate) PS.activate();
      openCall(+p.call, +p.time || Date.now(), { cold: !relaunch, hidden: hidden, test: +p.test === 1, from: p.from || '' });
      return;
    }
    if (p.open === 'day') openDay();
    else if (p.open === 'settings') openSettings();
    else if (p.open === 'apps') show('apps');
    else if (p.open === 'radio') { if (screen !== home) show('home'); openRadioCard(); }
    var kind = p.test;
    if (kind === 'reminder' || kind === 'call' || kind === 'announce' || kind === 'voice') {
      luna(SVC + 'test', { kind: kind, seconds: p.seconds == null ? 8 : +p.seconds, prayer: p.prayer == null ? null : +p.prayer, clip: p.clip, mtype: p.mtype, friday: !!+p.friday }, function (r) {
        note('test ' + kind + ' scheduled: ' + JSON.stringify(r).slice(0, 200));
      });
    } else if (kind === 'screenoff') {
      screenOff(true);
    } else if (kind === 'dream') {
      if (!Radio.wanted) radioStart();
      showDream();
    } else if (kind === 'card') {
      // Android's test=reminder: Home's own reminder card, now.
      if (screen !== home) show('home');
      showReminder();
    } else if (kind === 'friday' || kind === 'ramadan' || kind === 'now') shiftTo(kind);
    // at=<ISO time>: Home's clock jumps there (e.g. a winter night in London, for a 12-hour countdown).
    if (p.at && !isNaN(Date.parse(p.at))) {
      home.shift = Date.parse(p.at) - Date.now();
      home.day = null;
      if (screen !== home) show('home');
      tick(true);
    }
    else if (kind === 'radio') radioToggle();
    else if (kind === 'lunaoff') {
      // The service's own luna route, which this firmware denies to Developer Mode apps (kept to check again).
      luna(SVC + 'screenOff', {}, function (r) {
        note('service screenOff ' + JSON.stringify(r));
        setTimeout(function () { luna(SVC + 'screenOn', {}, function (q) { note('service screenOn ' + JSON.stringify(q)); }); }, 4000);
      });
    } else if (kind === 'mem') memNote('mem');
    if (p.live) {
      if (screen !== home) show('home');
      if (+p.quality > 0) { S.liveQuality = +p.quality; saveSettings(); }
      var which = ['makkah', 'madinah'].indexOf(String(p.live));
      if (which < 0) liveStop();
      else { liveStart(which); focus(home.lFull); if (+p.full) liveFull(true); }
    }
    if (p.keys) pressKeys(String(p.keys).split(','));
  }

  /**
   * Test only: set=key:value,… changes saved settings without the remote (numbers, true/false, 1/0 for a switch),
   * e.g. set=callClose:10,night:0. Only keys Afnon has; language, digits and clock have their own params.
   */
  function applySettings(list) {
    var done = [];
    list.split(',').forEach(function (kv) {
      var i = kv.indexOf(':'), k = kv.slice(0, i), v = kv.slice(i + 1);
      if (i < 0 || !(k in DEFAULTS) || k === 'locale' || k === 'digits' || k === 'clock' || typeof DEFAULTS[k] === 'object') return;
      var d = DEFAULTS[k];
      S[k] = typeof d === 'boolean' ? (v === '1' || v === 'true') : typeof d === 'number' ? +v : v;
      done.push(k + '=' + JSON.stringify(S[k]));
    });
    if (!done.length) return;
    if ('night' in S) setNight(S.night);
    changed(true);
    note('set ' + done.join(' '));
  }

  /** Test only: Home's clock jumps to the coming Friday 10:30 or to 15 Ramadan 16:30; "now" puts it back. */
  function shiftTo(kind) {
    var nowMs = Date.now(), target = nowMs;
    function at(dayStart, h, m) { return dayStart + (h * 60 + m) * 60000; }
    if (kind === 'friday') {
      for (var d = 0; d < 7; d++) {
        var s = clock.dayStart(nowMs, d);
        if (clock.wall(s + 43200000).getUTCDay() === 5) { target = at(s, 10, 30); break; }
      }
    } else if (kind === 'ramadan') {
      for (var k = 0; k < 400; k++) {
        var s2 = clock.dayStart(nowMs, k), w = clock.wall(s2 + 43200000);
        var h = hijriOf(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
        if (h.month === 8 && h.day === 15) { target = at(s2, 16, 30); break; }
      }
    }
    home.shift = kind === 'now' ? 0 : target - nowMs;
    home.day = null;
    if (screen !== home) show('home');
    tick(true);
    note('shift ' + kind + ' -> ' + new Date(nowMs + home.shift).toISOString());
  }

  var NAMES = { left: KEY.LEFT, right: KEY.RIGHT, up: KEY.UP, down: KEY.DOWN, ok: KEY.OK, back: KEY.BACK };
  function describe(e) {
    if (!e) return '-';
    var s = (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    return (e.className.baseVal || e.className).replace(/\bt\b|\bf\b|\br\d\b/g, '').trim().split(' ')[0] + '[' + s + ']';
  }
  function pressKeys(list) {
    var out = [];
    function next(i) {
      if (i >= list.length) { note('keys: ' + out.join(' > ')); return; }
      var k = NAMES[list[i].trim()];
      if (k) key(k);
      out.push(list[i].trim() + '=' + nameOf(screen) + (ch.on ? '+chooser' : '') + (day.picker && day.picker.on ? '+picker' : '') + ':' + describe(cur));
      setTimeout(function () { next(i + 1); }, 450);
    }
    setTimeout(function () { next(0); }, 600);
  }

  function memNote(why) {
    var m = window.performance && performance.memory;
    note(why + ': js heap ' + (m ? Math.round(m.usedJSHeapSize / 1048576) + '/' + Math.round(m.totalJSHeapSize / 1048576) + ' MB' : '?') +
      ', dom ' + document.getElementsByTagName('*').length + ' nodes, screen ' + nameOf(screen));
  }

  function launchParams() {
    try { return JSON.parse(PS.launchParams || '{}') || {}; } catch (e) { return {}; }
  }

  document.addEventListener('webOSRelaunch', function (e) {
    var p = (e && e.detail) || launchParams();
    if (!(p.call != null && p.call !== '') && PS.activate) PS.activate();
    params(p, true);
  });

  function displayParams(p) {
    if (!(p.locale || p.digits || p.clock)) return false;
    if (p.locale) S.locale = p.locale;
    if (p.digits) S.digits = p.digits === 'auto' ? '' : p.digits;
    if (p.clock) S.clock = p.clock;
    saveSettings();
    return true;
  }

  // ---------------------------------------------------------------- start

  var first = launchParams();
  var back = null;
  try { back = JSON.parse(sessionStorage.getItem('afnon-return') || 'null'); sessionStorage.removeItem('afnon-return'); } catch (e) { back = null; }
  if (!back) displayParams(first);
  derive();
  // The desktop preview scales the 1920×1080 stage to the window; the TV is 1920×1080 already.
  // shot=1: a 1920×1080 screenshot as the TV shows it, unscaled.
  if (!window.PalmSystem && !first.shot && window.innerWidth && window.innerWidth !== 1920) {
    var k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = 'scale(' + k + ')';
    // The page is narrower than 1920 here; in Arabic it would otherwise scroll to the right end.
    html.style.width = document.body.style.width = window.innerWidth + 'px';
    html.style.height = document.body.style.height = window.innerHeight + 'px';
  }

  // The first screen appears whole: the faces it uses load first (1.5 s at most; as the Home screen it opens at
  // every power-on, so it mustn't keep a blank screen longer), so no screen shows its shapes without its words.
  var revealed = false;
  function reveal() { if (!revealed) { revealed = true; stage.style.opacity = ''; } }
  stage.style.opacity = '0';
  try {
    var faces = ['400 26px Alexandria', '500 26px Alexandria', '600 26px Alexandria', '400 32px Amiri',
      rtl ? '700 88px Amiri' : '400 88px Marcellus'];
    Promise.all(faces.map(function (f) { return document.fonts.load(f); })).then(reveal, reveal);
  } catch (e) { reveal(); }
  setTimeout(reveal, 1500);

  watchArm(Date.now());
  if (back && back.home) show('home');
  else if (back) {
    // Back from a language or digits change: Settings again, where it was; the launch params were done.
    set.section = back.section | 0;
    set.onNav = false;
    set.rowIndex = back.row | 0;
    show('settings');
  } else {
    if (!(first.call != null && first.call !== '')) show('home');
    params(first, false);
  }
  if (!screen) show('home');
  loadApps();
  // From the engine starting the page to the first screen built (scripts parsed, fonts not yet necessarily).
  var timing = window.performance && performance.timing;
  var readyMs = Date.now() - (timing && timing.navigationStart ? timing.navigationStart : started);
  configureService(2500);
  var fontsMs = 0;
  if (window.document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontsMs = Date.now() - started; });
  setTimeout(function () {
    var zone = '';
    try { zone = new Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* */ }
    memNote('first screen ' + readyMs + ' ms after the page started, fonts ' + (fontsMs || '?') + ' ms; zone ' + zone +
      ' ' + (-new Date().getTimezoneOffset()) + ' min, ' + (clock.useDevice ? 'the TV\'s' : 'the city\'s (' + city.zone + ')') + ' clock');
  }, 3000);
  window.afnon = { key: key, show: show, openCall: openCall, showReminder: showReminder, S: S, radio: Radio, time: Time,
    showDream: showDream, screenOff: screenOff, drift: drift };
})();
