'use strict';
/*
 * Afnon LG's service (tv.afnon.launcher.service), from Afnon for LG webOS's tv.afnon.lg.service, so the
 * launcher needs no other app. The page can't run while it is closed or behind another app, so this schedules the
 * one next event with the TV's Activity Manager, and each event schedules the one after it:
 *   reminder  N minutes before a prayer: a system toast, and the spoken "اقترب موعد صلاة …" clip;
 *   call      at the time, when that prayer's adhan is on: opens Afnon on the call screen (the only thing that
 *             ever brings Afnon to the front);
 *   announce  at the time, when its adhan is off and announcing is on: a toast and "حان الآن موعد صلاة …".
 * The settings come from the page (configure) and travel in the activity's own params, so the chain carries on
 *   end       before the current prayer's time ends: "أوشك وقت صلاة … على الانتهاء".
 * The settings come from the page (configure) and travel in the activity's own params, so the chain carries on
 * without the page. Node 8: CommonJS, async/await, no newer syntax. prayer.js, text.js and adhan.js are the app's
 * own (app/js), copied in when it is packaged. Log: /tmp/afnon-launcher-service.log.
 */
const fs = require('fs');
const path = require('path');
const Service = require('webos-service');
const Prayer = require('./prayer.js');
const Text = require('./text.js');

const APP = 'tv.afnon.launcher';
const SELF = APP + '.service';
const LOG = '/tmp/afnon-launcher-service.log';
/**
 * The spoken lines: announce/ beside this file (the service runs sealed off from the app's folder; the package and
 * the boot script put them there), else the app's own sounds/announce where a TV lets the service read it.
 */
const CLIP_DIRS = [path.join(__dirname, 'announce'), path.join(__dirname, '..', '..', 'applications', APP, 'sounds', 'announce')];
const STATE = path.join(__dirname, 'state.json');
const AM = 'luna://com.palm.activitymanager';
const CHAIN = 'afnon-next', TEST = 'afnon-test';
/** An event this late (the TV was off or asleep and Quick Start+ resumed it) is skipped. */
const LATE_MS = 180000;
/** How long the page's "I'm in front" stays believable without being repeated (it repeats once a minute). */
// (90 s, was 3 min: a page closed by an install or by the TV kept the reminders quiet for up to 3 min.)
const PAGE_FRESH_MS = 90000;
/** File names by prayer index; Sunrise has none. On Friday, Dhuhr is "jumuah" (Announce.java). */
const CLIPS = ['fajr', null, 'dhuhr', 'asr', 'maghrib', 'isha'];

const service = new Service(SELF);

// ---------------------------------------------------------------- small helpers

function log(s) {
    try {
        const st = fs.existsSync(LOG) ? fs.statSync(LOG) : null;
        if (st && st.size > 65536) {
            const tail = fs.readFileSync(LOG, 'utf8').slice(-16384);
            fs.writeFileSync(LOG, tail.slice(tail.indexOf('\n') + 1));
        }
        fs.appendFileSync(LOG, new Date().toISOString().slice(5, 19).replace('T', ' ') + 'Z ' + s + '\n');
    } catch (e) { /* no log; nothing else depends on it */ }
}

function call(uri, params, timeoutMs) {
    return new Promise(resolve => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; resolve({ returnValue: false, errorText: 'timeout' }); } }, timeoutMs || 10000);
        try {
            service.call(uri, params, m => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(m.payload || {});
            });
        } catch (e) {
            done = true;
            clearTimeout(timer);
            resolve({ returnValue: false, errorText: String(e) });
        }
    });
}

/** Keeps this process alive (webos-service exits a few seconds after its last request) until release(). */
function hold(name) {
    let activity = null, released = false;
    try {
        service.activityManager.create(name, a => {
            activity = a;
            if (released) service.activityManager.complete(a, () => {});
        });
    } catch (e) { log('hold ' + name + ': ' + e.message); }
    return function release() {
        if (released) return;
        released = true;
        if (activity) try { service.activityManager.complete(activity, () => {}); } catch (e) { /* gone */ }
    };
}

function readState() {
    try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; }
}

function writeState(patch) {
    const st = readState();
    Object.keys(patch).forEach(k => { st[k] = patch[k]; });
    try { fs.writeFileSync(STATE, JSON.stringify(st)); } catch (e) { log('state not saved: ' + e.message); }
    return st;
}

/** "YYYY-MM-DD HH:MM:SS" in UTC, the Activity Manager's schedule format. */
function utc(ms) {
    return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

// ---------------------------------------------------------------- settings and events

/** Six whole minutes, -30 to 30, or null. */
function adjustOf(a) {
    if (!Array.isArray(a) || a.length !== 6) return null;
    return a.map(x => Math.max(-30, Math.min(30, Math.round(+x) || 0)));
}

/**
 * The page's settings, with Android's defaults for anything missing. The minutes each time is adjusted by come
 * from the launcher's Settings; a message without them keeps the saved ones (prev).
 */
function settings(s, prev) {
    s = s || {};
    const bells = Array.isArray(s.bells) && s.bells.length === 6 ? s.bells : [1, 0, 1, 1, 1, 1];
    return {
        adjust: adjustOf(s.adjust) || adjustOf(prev && prev.adjust) || [0, 0, 0, 0, 0, 0],
        // Minutes before a prayer's time ends for «أوشك وقت صلاة … على الانتهاء» (the launcher's setting; 0 off).
        endRemind: s.endRemind != null ? Math.max(0, +s.endRemind || 0)
            : prev && prev.endRemind != null ? prev.endRemind : 0,
        city: s.city || 'cairo', method: s.method || null, madhab: s.madhab === 'hanafi' ? 'hanafi' : 'shafi',
        bells: bells.map(b => (b ? 1 : 0)), adhan: s.adhan !== false, remind: s.remind == null ? 15 : +s.remind,
        remindVoice: s.remindVoice !== false, announce: s.announce !== false,
        ar: s.ar !== false, eastern: s.eastern == null ? s.ar !== false : !!s.eastern, h24: !!s.h24
    };
}

function clockFor(s) {
    return Prayer.clockFor(Prayer.cityById(s.city));
}

/**
 * Every reminder, call, announcement and "time is ending" warning from yesterday to the day after tomorrow,
 * earliest first. A prayer's time ends (event `end`, its `time` the end): Fajr at sunrise, Dhuhr, Asr and Maghrib at
 * the next prayer, Isha at the next day's Fajr.
 */
function events(s) {
    const clock = clockFor(s), now = Date.now(), out = [];
    for (let d = -1; d <= 2; d++) {
        const t = Prayer.timesFor(s, clock, now, d);
        const next = Prayer.timesFor(s, clock, now, d + 1);
        for (let i = 0; i < 6; i++) {
            if (i === Prayer.SUNRISE) continue;
            if (s.remind > 0) out.push({ kind: 'reminder', prayer: i, time: t[i], at: t[i] - s.remind * 60000 });
            if (s.adhan && s.bells[i]) out.push({ kind: 'call', prayer: i, time: t[i], at: t[i] });
            else if (s.announce) out.push({ kind: 'announce', prayer: i, time: t[i], at: t[i] });
            if (s.endRemind > 0) {
                const end = i === Prayer.FAJR ? t[Prayer.SUNRISE] : i === Prayer.ISHA ? next[Prayer.FAJR] : t[i + 1];
                // 10 s after the moment itself: with the same minutes as the reminder, a prayer's end is the next
                // prayer's reminder, and the chain keeps one event per moment. Then the second line follows the first.
                out.push({ kind: 'end', prayer: i, time: end, at: end - s.endRemind * 60000 + 10000 });
            }
        }
    }
    return out.sort((a, b) => a.at - b.at);
}

function nextEvent(s, after) {
    const list = events(s);
    for (let i = 0; i < list.length; i++) if (list[i].at > after) return list[i];
    return null;
}

/** The next prayer (never Sunrise) from now, for the test hook. */
function nextPrayer(s) {
    const clock = clockFor(s), now = Date.now();
    for (let d = 0; d <= 1; d++) {
        const t = Prayer.timesFor(s, clock, now, d);
        for (let i = 0; i < 6; i++) if (i !== Prayer.SUNRISE && t[i] > now) return { prayer: i, time: t[i] };
    }
    return { prayer: Prayer.DHUHR, time: now };
}

let persist = true;

async function createActivity(name, ev, s) {
    const activity = {
        name, description: 'Afnon: ' + ev.kind + ' for prayer ' + ev.prayer,
        type: { foreground: true, persist },
        schedule: { start: utc(ev.at), precise: true },
        callback: { method: 'luna://' + SELF + '/fire', params: { ev, s } }
    };
    let r = await call(AM + '/create', { activity, start: true, replace: true });
    if (!(r && r.returnValue) && persist) {
        // Not allowed to outlive a reboot on this firmware: keep the chain for this session at least.
        log('persist refused (' + JSON.stringify(r) + '), scheduling without it');
        persist = false;
        activity.type = { foreground: true };
        r = await call(AM + '/create', { activity, start: true, replace: true });
    }
    return r;
}

async function scheduleNext(s, after) {
    const ev = nextEvent(s, Math.max(after || 0, Date.now() + 1000));
    if (!ev) { log('nothing to schedule'); return null; }
    const r = await createActivity(CHAIN, ev, s);
    log('next ' + ev.kind + ' p' + ev.prayer + ' at ' + utc(ev.at) + 'Z -> ' + (r && r.returnValue ? 'ok #' + r.activityId : JSON.stringify(r)));
    return ev;
}

// ---------------------------------------------------------------- what an event does

function text(s) {
    const t = new Text(s.ar, s.eastern);
    const city = Prayer.cityById(s.city);
    t.cityName = s.ar ? city.ar : city.en;
    return t;
}

function prayerName(t, s, ev, forceFriday) {
    const names = t.prayerNames();
    const friday = ev.prayer === Prayer.DHUHR && (forceFriday || Prayer.isFriday(clockFor(s), ev.time));
    if (friday) names[Prayer.DHUHR] = t.jumuah();
    return { name: names[ev.prayer], friday };
}

function toast(message) {
    return call('luna://com.webos.notification/createToast', { message, noaction: true });
}

/**
 * Plays one of the announce clips through the TV's media server and stays alive until it has ended: the load is
 * kept subscribed, and the pipeline is unloaded at endOfStream (or after 20 s). opts.mtype changes the pipeline
 * type for tests ("media" by default).
 */
function voice(clip, opts) {
    opts = opts || {};
    const file = CLIP_DIRS.map(d => path.join(d, clip + '.wav')).filter(f => fs.existsSync(f))[0];
    if (!file) { log('voice: no ' + clip); return Promise.resolve(false); }
    const release = hold('afnon-voice');
    return new Promise(resolve => {
        let mediaId = null, finished = false, timer = null;
        const subs = [];
        const finish = why => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            log('voice ' + clip + ' ends: ' + why);
            const done = () => {
                subs.forEach(s => { try { s.cancel(); } catch (e) { /* gone */ } });
                release();
                resolve(why === 'endOfStream');
            };
            if (mediaId) call('luna://com.webos.media/unload', { mediaId }, 4000).then(r => { log('voice unload ' + JSON.stringify(r)); done(); });
            else done();
        };
        // The pipeline's events, from the load itself or from subscribe (firmwares differ in which one talks).
        const events = m => {
            const p = (m && m.payload) || {};
            const key = Object.keys(p).filter(k => k !== 'returnValue' && k !== 'subscribed' && k !== 'mediaId')[0];
            if (key && key !== 'currentTime' && key !== 'bufferRange') log('voice event ' + key + ' ' + JSON.stringify(p[key]).slice(0, 120));
            if (p.endOfStream || p.unloadCompleted) finish(p.endOfStream ? 'endOfStream' : 'unloaded');
            else if (p.error) finish('error ' + JSON.stringify(p.error));
            else if (p.returnValue === false) finish('failed ' + JSON.stringify(p).slice(0, 160));
        };
        timer = setTimeout(() => finish('timeout'), 20000);
        // The load stays subscribed for as long as the clip plays: the media server ties the pipeline to it.
        const params = { uri: 'file://' + file, type: opts.mtype || 'media', payload: { option: { appId: APP } }, subscribe: true };
        let load;
        try { load = service.subscribe('luna://com.webos.media/load', params); } catch (e) { return finish('load threw ' + e.message); }
        subs.push(load);
        load.on('response', m => {
            const r = (m && m.payload) || {};
            if (mediaId) return events(m);
            log('voice load ' + clip + ' (' + params.type + ') -> ' + JSON.stringify(r).slice(0, 200));
            if (!r.mediaId) return finish('load failed');
            mediaId = r.mediaId;
            try {
                const sub = service.subscribe('luna://com.webos.media/subscribe', { mediaId, subscribe: true });
                subs.push(sub);
                sub.on('response', events);
            } catch (e) { log('voice subscribe: ' + e.message); }
            call('luna://com.webos.media/play', { mediaId }).then(p => log('voice play -> ' + JSON.stringify(p)));
        });
    });
}

// The Jumu'ah lines are said with Dhuhr's recordings until Jumu'ah has its own (Lutfi Khamis recorded Dhuhr's);
// true again once before_jumuah / now_jumuah are recorded in the same voice. The page has the same switch.
const JUMUAH_CLIPS = false;
// The reminder before the prayer says «حان الآن موعد صلاة …» (Lutfi Khamis), the maintainer's choice over «اقترب
// موعد صلاة …» (before_*, the old computer voice). false plays before_* again.
const BEFORE_AS_NOW = true;

function clipName(kind, ev, friday) {
    const base = CLIPS[ev.prayer];
    if (!base) return null;
    if (kind === 'before_' && BEFORE_AS_NOW) kind = 'now_';
    return kind + (friday && JUMUAH_CLIPS ? 'jumuah' : base);
}

async function act(ev, s, opts) {
    opts = opts || {};
    const t = text(s), clock = clockFor(s);
    const p = prayerName(t, s, ev, !!opts.friday);
    const at = t.clock(clock.wall(ev.time), s.h24);
    // In front, the page says the lines itself (its <audio> is heard; this service's voice may not be), and on
    // Home it shows its own reminder card instead of the toast, as Android's Home does instead of the banner.
    const page = opts.test ? null : pageState();
    const pageInFront = page !== null, pageHome = page === 'home';
    if (ev.kind === 'call') {
        // What is on screen now (an HDMI input, YouTube…), so the call can go back to it when it closes. Allowed
        // only where the launcher's boot script grants it; otherwise the page just steps back.
        const app = callApp(), f = await call('luna://com.webos.applicationManager/getForegroundAppInfo', {}, 3000);
        const from = f.appId && f.appId !== app ? f.appId : '';
        const r = await call('luna://com.webos.applicationManager/launch',
            { id: app, params: { call: ev.prayer, time: ev.time, test: opts.test ? 1 : 0, from } });
        log('call p' + ev.prayer + ' over ' + (from || f.errorText || 'nothing') + ' -> launch ' + JSON.stringify(r));
        return;
    }
    if (ev.kind === 'reminder') {
        const left = Text.secondsUntil(ev.time, Date.now());
        const minutes = Math.floor((left + 59) / 60);
        if (pageHome) log('reminder p' + ev.prayer + ': Afnon is on Home, its card shows it');
        else log('reminder p' + ev.prayer + ' toast -> ' + JSON.stringify(await toast(t.toastReminder(p.name, minutes, Text.duration(left, false), at))));
        if (s.remindVoice && !pageInFront) await voice(clipName('before_', ev, p.friday), opts);
        return;
    }
    if (ev.kind === 'announce') {
        if (pageHome) log('announce p' + ev.prayer + ': Afnon is on Home, it says it');
        else log('announce p' + ev.prayer + ' toast -> ' + JSON.stringify(await toast(t.toastNow(p.name, at))));
        if (!pageInFront) await voice(clipName('now_', ev, p.friday), opts);
        return;
    }
    if (ev.kind === 'end') {
        // «أوشك وقت صلاة … على الانتهاء». In front, the page says it itself. Jumu'ah has no recording of its own:
        // Dhuhr's is said, since its time ends at Asr too.
        if (pageInFront) log('end p' + ev.prayer + ': Afnon is in front, it says it');
        else await voice(clipName('end_', ev, false), opts);
        return;
    }
    if (ev.kind === 'voice') await voice(opts.clip || clipName('before_', ev, p.friday), opts);
}

// ---------------------------------------------------------------- methods

/**
 * The app that opens for the call: the launcher, or whichever app's page names itself in its messages.
 */
function callApp() { return readState().app || APP; }
/** { app } from a page's message, if it names one. */
function appPatch(payload, patch) {
    if (typeof payload.app === 'string' && /^[a-z0-9.]+$/i.test(payload.app)) patch.app = payload.app;
    return patch;
}

/** From the page whenever it opens or a setting changes: { settings, visible, app }. Schedules the next event. */
service.register('configure', async msg => {
    const release = hold('afnon-configure');
    try {
        const s = settings(msg.payload.settings, readState().settings);
        const patch = appPatch(msg.payload, { settings: s });
        if (typeof msg.payload.visible === 'boolean') { patch.visible = msg.payload.visible; patch.visibleAt = Date.now(); }
        writeState(patch);
        const ev = await scheduleNext(s, Date.now());
        msg.respond({ returnValue: true, next: ev, persist });
    } catch (e) {
        log('configure failed: ' + e.stack);
        msg.respond({ returnValue: false, errorText: String(e) });
    }
    release();
});

/**
 * The page came to the front, went behind something or changed screen: { visible, home }. It repeats this once a
 * minute while it is in front.
 */
service.register('visible', msg => {
    const before = readState();
    const v = !!msg.payload.visible, home = !!msg.payload.home;
    if (before.visible !== v || !!before.home !== home) log('page ' + (v ? 'in front' + (home ? ' on Home' : '') : 'behind or closed'));
    writeState(appPatch(msg.payload, { visible: v, home, visibleAt: Date.now() }));
    msg.respond({ returnValue: true });
});

/**
 * Where the page is, as it last said: 'home' (it shows the reminder card and speaks itself), 'front' (another of
 * its screens: it speaks, the toast is still wanted) or null (closed or behind another app). Its word counts for
 * three minutes only, so a page that was killed can't keep the reminders quiet.
 */
function pageState() {
    const st = readState();
    if (st.visible !== true || !(Date.now() - (st.visibleAt || 0) < PAGE_FRESH_MS)) return null;
    return st.home ? 'home' : 'front';
}

/** The Activity Manager's callback: { ev, s, test, opts, $activity }. */
service.register('fire', async msg => {
    const release = hold('afnon-fire');
    const p = msg.payload || {};
    const id = p.$activity && p.$activity.activityId;
    msg.respond({ returnValue: true });
    if (id) await call(AM + '/complete', { activityId: id });
    const s = settings(p.s || readState().settings);
    const ev = p.ev || {};
    const late = Date.now() - (ev.at || 0);
    try {
        if (late > LATE_MS) log('skip ' + ev.kind + ' p' + ev.prayer + ', ' + Math.round(late / 1000) + ' s late');
        else {
            log('fire ' + ev.kind + ' p' + ev.prayer + (p.test ? ' (test)' : '') + ', ' + Math.round(late / 1000) + ' s late');
            await act(ev, s, Object.assign({ test: !!p.test }, p.opts || {}));
        }
    } catch (e) { log('fire failed: ' + e.stack); }
    // A test leaves the chain alone; a real event schedules the one after itself.
    if (!p.test) await scheduleNext(s, Math.max(Date.now(), ev.at || 0));
    release();
});

/**
 * Test hook (the page passes on `ares-launch … -p test=<kind> -p seconds=N`): a reminder, call, announce or just
 * the voice for the next prayer, through the Activity Manager N seconds from now (8 by default).
 * { kind, seconds, prayer?, clip?, mtype? }
 */
service.register('test', async msg => {
    const release = hold('afnon-test');
    const q = msg.payload || {};
    const s = settings(q.settings || readState().settings);
    const next = nextPrayer(s);
    const prayer = q.prayer == null ? next.prayer : +q.prayer;
    const seconds = q.seconds == null ? 8 : Math.max(0, +q.seconds);
    const ev = { kind: q.kind || 'reminder', prayer, time: q.prayer == null ? next.time : Date.now() + seconds * 1000 + 60000, at: Date.now() + seconds * 1000 };
    // friday: the test takes Dhuhr as Jumu'ah (its name and its clip) whatever the day.
    const opts = { clip: q.clip, mtype: q.mtype, friday: !!q.friday };
    const activity = {
        name: TEST, description: 'Afnon test: ' + ev.kind,
        type: { foreground: true },
        schedule: { start: utc(ev.at), precise: true },
        callback: { method: 'luna://' + SELF + '/fire', params: { ev, s, test: true, opts } }
    };
    const r = await call(AM + '/create', { activity, start: true, replace: true });
    log('test ' + ev.kind + ' p' + prayer + ' in ' + seconds + ' s -> ' + JSON.stringify(r));
    msg.respond({ returnValue: !!(r && r.returnValue), at: utc(ev.at), result: r });
    release();
});

/**
 * The TV's own panel-off over luna. This firmware denies it to Developer Mode apps ("Denied method call
 * turnOffScreen for category /power"), so the page goes through the TV's remote-control connection instead
 * (app/js/ssap.js); kept for the page's test=lunaoff, to check again after a firmware update.
 */
service.register('screenOff', async msg => {
    const r = await call('luna://com.webos.service.tvpower/power/turnOffScreen', { standbyMode: 'active' });
    log('turnOffScreen -> ' + JSON.stringify(r));
    msg.respond({ returnValue: !!(r && r.returnValue), result: r });
});

service.register('screenOn', async msg => {
    const r = await call('luna://com.webos.service.tvpower/power/turnOnScreen', { standbyMode: 'active' });
    log('turnOnScreen -> ' + JSON.stringify(r));
    msg.respond({ returnValue: !!(r && r.returnValue), result: r });
});

/** What the page wants kept in the log (timings, memory, test results). */
service.register('note', msg => {
    log('page: ' + String(msg.payload.text).slice(0, 400));
    msg.respond({ returnValue: true });
});

service.register('status', msg => {
    const st = readState();
    const s = settings(st.settings);
    msg.respond({ returnValue: true, visible: st.visible, next: nextEvent(s, Date.now()), tzOffset: new Date().getTimezoneOffset(),
        zone: Prayer.deviceZoneName(), deviceClock: clockFor(s).useDevice, node: process.version });
});

service.register('log', msg => {
    let s = '';
    try { s = fs.readFileSync(LOG, 'utf8'); } catch (e) { s = '(no log)'; }
    msg.respond({ returnValue: true, log: s.split('\n').slice(-40).join('\n') });
});
