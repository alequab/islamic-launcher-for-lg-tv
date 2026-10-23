/*
 * Afnon LG: the TV's own remote-control connection (SSAP, the one phone remote apps use), opened by the page on
 * this TV itself, for the one thing a Developer Mode app is not allowed through luna: turning the panel off while
 * the radio plays (com.webos.service.tvpower is denied to it). The TV asks once, with its own "Allow" prompt; the
 * key it then gives is kept in localStorage, so it never asks again. Loaded only when the screen is first turned
 * off. The pairing manifest is lgtv2's pairing.json (MIT, (c) Sebastian Raff and contributors). ES5.
 */
(function (root) {
  'use strict';

  var PAIRING = {"forcePairing":false,"pairingType":"PROMPT","manifest":{"manifestVersion":1,"appVersion":"1.1","signed":{"created":"20140509","appId":"com.lge.test","vendorId":"com.lge","localizedAppNames":{"":"LG Remote App","ko-KR":"리모컨 앱","zxx-XX":"ЛГ Rэмotэ AПП"},"localizedVendorNames":{"":"LG Electronics"},"permissions":["TEST_SECURE","CONTROL_INPUT_TEXT","CONTROL_MOUSE_AND_KEYBOARD","READ_INSTALLED_APPS","READ_LGE_SDX","READ_NOTIFICATIONS","SEARCH","WRITE_SETTINGS","WRITE_NOTIFICATION_ALERT","CONTROL_POWER","READ_CURRENT_CHANNEL","READ_RUNNING_APPS","READ_UPDATE_INFO","UPDATE_FROM_REMOTE_APP","READ_LGE_TV_INPUT_EVENTS","READ_TV_CURRENT_TIME"],"serial":"2f930e2d2cfe083771f68e4fe7bb07"},"permissions":["LAUNCH","LAUNCH_WEBAPP","APP_TO_APP","CLOSE","TEST_OPEN","TEST_PROTECTED","CONTROL_AUDIO","CONTROL_DISPLAY","CONTROL_INPUT_JOYSTICK","CONTROL_INPUT_MEDIA_RECORDING","CONTROL_INPUT_MEDIA_PLAYBACK","CONTROL_INPUT_TV","CONTROL_POWER","READ_APP_STATUS","READ_CURRENT_CHANNEL","READ_INPUT_DEVICE_LIST","READ_NETWORK_STATE","READ_RUNNING_APPS","READ_TV_CHANNEL_LIST","WRITE_NOTIFICATION_TOAST","READ_POWER_STATE","READ_COUNTRY_INFO","READ_SETTINGS","CONTROL_TV_SCREEN","CONTROL_TV_STANBY","CONTROL_FAVORITE_GROUP","CONTROL_USER_INFO","CHECK_BLUETOOTH_DEVICE","CONTROL_BLUETOOTH","CONTROL_TIMER_INFO","STB_INTERNAL_CONNECTION","CONTROL_RECORDING","READ_RECORDING_STATE","WRITE_RECORDING_LIST","READ_RECORDING_LIST","READ_RECORDING_SCHEDULE","WRITE_RECORDING_SCHEDULE","READ_STORAGE_DEVICE_LIST","READ_TV_PROGRAM_INFO","CONTROL_BOX_CHANNEL","READ_TV_ACR_AUTH_TOKEN","READ_TV_CONTENT_STATE","READ_TV_CURRENT_TIME","ADD_LAUNCHER_CHANNEL","SET_CHANNEL_SKIP","RELEASE_CHANNEL_SKIP","CONTROL_CHANNEL_BLOCK","DELETE_SELECT_CHANNEL","CONTROL_CHANNEL_GROUP","SCAN_TV_CHANNELS","CONTROL_TV_POWER","CONTROL_WOL"],"signatures":[{"signatureVersion":1,"signature":"eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRyaMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQojoa7NQnAtw=="}]}};
  var KEY = 'afnon-ssap-key';
  /** How long the TV's Allow prompt may wait for an answer. */
  var PROMPT_MS = 90000, REPLY_MS = 8000;

  var ws = null, ready = false, waiting = [], calls = {}, n = 0, timer = 0;

  function getKey() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setKey(k) { try { localStorage.setItem(KEY, k); } catch (e) { /* this session only */ } }

  function settle(ok, why) {
    clearTimeout(timer);
    var list = waiting;
    waiting = [];
    if (!ok) close();
    for (var i = 0; i < list.length; i++) list[i](ok, why);
  }

  function close() {
    ready = false;
    if (ws) { try { ws.onclose = ws.onerror = ws.onmessage = null; ws.close(); } catch (e) { /* gone */ } }
    ws = null;
    var list = calls;
    calls = {};
    for (var id in list) list[id]({ returnValue: false, errorText: 'closed' });
    calls = {};
  }

  function register(signed) {
    var p = JSON.parse(JSON.stringify(PAIRING));
    if (!signed) {
      // Some firmwares refuse the signed test manifest; lgtv2 then registers unsigned, and so do we.
      delete p.manifest.signed;
      p.manifest.appVersion = '1.0';
    }
    var key = getKey();
    if (key) p['client-key'] = key;
    ws.send(JSON.stringify({ id: signed ? 'reg' : 'reg2', type: 'register', payload: p }));
  }

  /**
   * Opens and registers. cb(ok, why). With allowPrompt false and no key yet, it fails at once instead of
   * showing the TV's prompt; onPrompt() is called when the TV is showing it.
   */
  function open(allowPrompt, onPrompt, cb) {
    if (ready) return cb(true);
    waiting.push(cb);
    if (ws) return;
    if (!getKey() && !allowPrompt) return settle(false, 'not allowed yet');
    try { ws = new WebSocket('ws://127.0.0.1:3000'); } catch (e) { return settle(false, 'socket: ' + e.message); }
    timer = setTimeout(function () { settle(false, 'no answer'); }, REPLY_MS);
    ws.onopen = function () { register(true); };
    ws.onerror = function () { settle(false, 'socket error'); };
    ws.onclose = function () { var was = ready; close(); if (!was) settle(false, 'socket closed'); };
    ws.onmessage = function (m) {
      var r;
      try { r = JSON.parse(m.data); } catch (e) { return; }
      if (r.id === 'reg' || r.id === 'reg2') {
        if (r.type === 'registered' && r.payload && r.payload['client-key']) {
          setKey(r.payload['client-key']);
          ready = true;
          settle(true);
        } else if (r.type === 'error') {
          if (r.id === 'reg' && /blacklisted/i.test(r.error || '')) return register(false);
          settle(false, 'register: ' + r.error);
        } else if (r.payload && r.payload.pairingType === 'PROMPT') {
          // The TV is asking the viewer; give them time to answer.
          clearTimeout(timer);
          timer = setTimeout(function () { settle(false, 'prompt not answered'); }, PROMPT_MS);
          if (onPrompt) onPrompt();
        }
        return;
      }
      var cb = calls[r.id];
      if (!cb) return;
      delete calls[r.id];
      cb(r.type === 'error' ? { returnValue: false, errorText: r.error } : (r.payload || { returnValue: true }));
    };
  }

  /** One request: cb(payload), with returnValue false on any failure. */
  function request(uri, payload, opts, cb) {
    open(!!opts.allowPrompt, opts.onPrompt, function (ok, why) {
      if (!ok) return cb({ returnValue: false, errorText: why });
      var id = 'c' + (++n);
      var t = setTimeout(function () { if (calls[id]) { delete calls[id]; cb({ returnValue: false, errorText: 'timeout' }); } }, REPLY_MS);
      calls[id] = function (r) { clearTimeout(t); cb(r); };
      ws.send(JSON.stringify({ id: id, type: 'request', uri: uri, payload: payload || {} }));
    });
  }

  /** A subscription on the open connection (never prompts): cb(payload) for every message until close(). */
  function subscribe(uri, payload, cb) {
    open(false, null, function (ok) {
      if (!ok) return;
      var id = 's' + (++n);
      calls[id] = function each(r) { calls[id] = each; cb(r); };
      ws.send(JSON.stringify({ id: id, type: 'subscribe', uri: uri, payload: payload || {} }));
    });
  }

  root.AfnonSsap = { request: request, subscribe: subscribe, close: close, hasKey: function () { return !!getKey(); } };
})(this);
