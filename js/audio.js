/* 日文單字測驗 — audio.js
 * 發音來源：
 *   1. 線上真人發音：JapanesePod101 字典音檔（與開源工具 Yomitan 相同來源，非官方介面）
 *      App 版會檢查「此字無音檔」的佔位音檔（SHA-256 比對），沒有就改用系統語音
 *   2. 系統語音：Android 的文字轉語音（建議 Google 文字轉語音＋日文語音包，可離線）
 *      瀏覽器版改用 Web Speech API
 */
(function (root) {
  'use strict';
  var INVALID_JPOD = 'ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906';
  var bridge = root.JPBridge;
  var getSettings = function () { return { source: 'auto', rate: 0.9 }; };
  var mem = {};
  var ttsWaiters = {}, ttsSeq = 0;
  var current = null;
  var onlineDownUntil = 0;

  root.__ttsEvent = function (id, type, detail) {
    var w = ttsWaiters[id];
    if (!w) return;
    if (type === 'start') { if (w.onStart) w.onStart(); return; }
    delete ttsWaiters[id];
    clearTimeout(w.timer);
    if (type === 'done') w.resolve(); else w.reject(new Error(detail || 'tts_error'));
  };

  // ---------- IndexedDB 音檔快取（下載過的真人發音可離線播放） ----------
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        if (!root.indexedDB) return resolve(null);
        var r = root.indexedDB.open('jpq-audio', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('clips'); };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  function idbGet(k) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (resolve) {
        try {
          var q = d.transaction('clips', 'readonly').objectStore('clips').get(k);
          q.onsuccess = function () { resolve(q.result || null); };
          q.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }
  function idbPut(k, v) {
    return db().then(function (d) {
      if (!d) return;
      try { d.transaction('clips', 'readwrite').objectStore('clips').put(v, k); } catch (e) { /* 空間不足時略過快取 */ }
    });
  }
  function idbCount() {
    return db().then(function (d) {
      if (!d) return 0;
      return new Promise(function (resolve) {
        try { var q = d.transaction('clips', 'readonly').objectStore('clips').count(); q.onsuccess = function () { resolve(q.result || 0); }; q.onerror = function () { resolve(0); }; }
        catch (e) { resolve(0); }
      });
    });
  }

  function clipKey(e) { return (e.kanji || '') + '|' + (e.kana || ''); }
  function jpodUrl(e) {
    var p = [];
    if (e.kanji && e.kanji !== e.kana) p.push('kanji=' + encodeURIComponent(e.kanji));
    if (e.kana) p.push('kana=' + encodeURIComponent(e.kana));
    return 'https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?' + p.join('&');
  }

  // ---------- 系統語音 ----------
  var RE_BETTER_VOICE = /enhanced|premium|neural|natural|拡張|高品質|高音質|增強|強化|優化|プレミアム/i;
  var lastCancelAt = 0;
  function webVoices() {
    try { return (root.speechSynthesis && root.speechSynthesis.getVoices()) || []; } catch (e) { return []; }
  }
  // 挑日文語音：高品質（Enhanced／Premium）優先，其次是裝置內建、預設
  function webJaVoice() {
    var ja = webVoices().filter(function (v) { return /^ja([-_]|$)/i.test(v.lang || ''); });
    if (!ja.length) return null;
    function score(v) { return (RE_BETTER_VOICE.test(v.name || '') ? 4 : 0) + (v.localService ? 2 : 0) + (v['default'] ? 1 : 0); }
    ja.sort(function (a, b) { return score(b) - score(a); });
    return ja[0];
  }
  function ttsStatus() {
    if (bridge && bridge.available()) return bridge.sync('ttsStatus', []) || { state: 'unknown', ja: 'unknown' };
    if (root.speechSynthesis && root.SpeechSynthesisUtterance) {
      var all = webVoices(), v = webJaVoice();
      return { state: 'ready', ja: v ? 'ok' : (all.length ? 'no_voice' : 'unknown'), engine: 'browser', voice: v ? v.name : '' };
    }
    return { state: 'none', ja: 'none' };
  }

  function speakTTS(text, rate, onStart) {
    if (bridge && bridge.available()) {
      return new Promise(function (resolve, reject) {
        var id = 't' + (++ttsSeq);
        var timer = setTimeout(function () { if (ttsWaiters[id]) { delete ttsWaiters[id]; resolve(); } }, 15000);
        ttsWaiters[id] = { resolve: resolve, reject: reject, onStart: onStart, timer: timer };
        var r = bridge.sync('speak', [text, String(rate), id]);
        if (!r || !r.ok) { clearTimeout(timer); delete ttsWaiters[id]; reject(new Error((r && r.error) || 'tts_unavailable')); }
      });
    }
    if (root.speechSynthesis && root.SpeechSynthesisUtterance) {
      var synth = root.speechSynthesis;
      var all = webVoices(), v = webJaVoice();
      // 語音清單還沒載入時（iPhone 第一次常見）只指定語言，交給系統挑日文語音
      if (all.length && !v) return Promise.reject(new Error('no_ja_voice'));
      return new Promise(function (resolve, reject) {
        var u = new root.SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP';
        if (v) u.voice = v;
        u.rate = rate;
        var done = false;
        function finish() { if (!done) { done = true; clearTimeout(guard); resolve(); } }
        // iPhone 偶爾不觸發結束事件，時間到就當作唸完
        var guard = setTimeout(finish, Math.max(4000, String(text).length * 900));
        u.onstart = function () { if (onStart) onStart(); };
        u.onend = finish;
        u.onerror = function (ev) {
          if (done) return;
          done = true; clearTimeout(guard);
          var err = ev && ev.error;
          if (err === 'interrupted' || err === 'canceled') resolve(); else reject(new Error(err || 'tts_error'));
        };
        // iPhone Safari：剛取消就馬上說話，有時會沒聲音，所以先停一下
        if (synth.speaking || synth.pending) { synth.cancel(); lastCancelAt = Date.now(); }
        var wait = 150 - (Date.now() - lastCancelAt);
        if (wait > 0) setTimeout(function () { synth.speak(u); }, wait); else synth.speak(u);
      });
    }
    return Promise.reject(new Error('no_tts'));
  }

  // ---------- 線上真人發音 ----------
  function playSrc(src, rate, onStart) {
    return new Promise(function (resolve, reject) {
      var a = new root.Audio();
      current = a;
      a.preload = 'auto';
      a.onplaying = function () { if (onStart) onStart(); };
      a.onended = function () { resolve(); };
      a.onerror = function () { reject(new Error('audio_error')); };
      a.src = src;
      try { a.defaultPlaybackRate = rate; a.playbackRate = rate; } catch (e) { /* 部分版本不支援變速 */ }
      var p = a.play();
      if (p && p.catch) p.catch(function (err) { reject(err || new Error('play_blocked')); });
    });
  }

  function getClip(e) {
    var k = clipKey(e);
    if (mem[k]) return Promise.resolve(mem[k]);
    return idbGet(k).then(function (hit) {
      if (hit && (hit.u || (hit.missing && Date.now() - hit.t < 30 * 86400000))) { mem[k] = hit; return hit; }
      if (!(bridge && bridge.available())) return { u: jpodUrl(e), direct: true };
      if (Date.now() < onlineDownUntil || (root.navigator && root.navigator.onLine === false)) throw new Error('offline');
      return bridge.call('fetchUrl', [jpodUrl(e), 'audio'], 9000).then(function (r) {
        if (!r || !r.ok) {
          if (!r || !r.status) onlineDownUntil = Date.now() + 60000;
          throw new Error('fetch_failed');
        }
        var rec = (r.sha256 === INVALID_JPOD || !r.base64 || r.base64.length < 200)
          ? { missing: true, t: Date.now() }
          : { u: 'data:' + (/audio/.test(r.contentType || '') ? r.contentType.split(';')[0] : 'audio/mpeg') + ';base64,' + r.base64, t: Date.now() };
        mem[k] = rec;
        idbPut(k, rec);
        return rec;
      });
    });
  }

  function playOnline(e, rate, onStart) {
    if (!e.kana && !e.kanji) return Promise.reject(new Error('no_word'));
    return getClip(e).then(function (rec) {
      if (rec.missing) throw new Error('no_clip');
      return playSrc(rec.u, rate, onStart);
    });
  }

  function stop() {
    try { if (current) { current.pause(); current.src = ''; } } catch (e) { /* 已停止 */ }
    current = null;
    if (bridge && bridge.available()) bridge.sync('stopSpeak', []);
    else if (root.speechSynthesis) {
      try {
        if (root.speechSynthesis.speaking || root.speechSynthesis.pending) { root.speechSynthesis.cancel(); lastCancelAt = Date.now(); }
      } catch (e) { /* 無 */ }
    }
  }

  // onState(state, info)：loading → playing → done ／ error
  function speak(e, onState) {
    stop();
    var s = getSettings();
    var rate = parseFloat(s.rate) || 0.9;
    var hasBridge = bridge && bridge.available();
    var order;
    if (s.source === 'tts') order = ['tts'];
    else if (s.source === 'online') order = ['online', 'tts'];
    else order = hasBridge ? ['online', 'tts'] : ['tts', 'online'];
    var text = e.kana || e.kanji || '';
    var errors = [];
    if (onState) onState('loading');
    var i = 0;
    function attempt() {
      if (i >= order.length) {
        if (onState) onState('error', errors);
        return Promise.resolve({ ok: false, errors: errors });
      }
      var src = order[i++];
      var started = function () { if (onState) onState('playing', src); };
      var p = src === 'online' ? playOnline(e, rate, started) : speakTTS(text, rate, started);
      return p.then(function () {
        if (onState) onState('done', src);
        return { ok: true, source: src };
      }, function (err) {
        errors.push(src + ':' + (err && err.message || err));
        return attempt();
      });
    }
    return attempt();
  }

  // 預先下載整個題庫的真人發音（App 版）
  function prefetch(entries, onProgress, isCancelled) {
    if (!(bridge && bridge.available())) return Promise.resolve({ done: 0, ok: 0, missing: 0, failed: 0, unsupported: true });
    var stat = { done: 0, ok: 0, missing: 0, failed: 0 };
    var list = entries.slice();
    function next() {
      if (!list.length || (isCancelled && isCancelled())) return Promise.resolve(stat);
      var e = list.shift();
      return getClip(e).then(function (rec) {
        if (rec.missing) stat.missing++; else stat.ok++;
      }, function () { stat.failed++; }).then(function () {
        stat.done++;
        if (onProgress) onProgress(stat, entries.length);
        return new Promise(function (r) { setTimeout(r, 250); }).then(next);
      });
    }
    return next();
  }

  root.JPAudio = {
    init: function (fn) { getSettings = fn; },
    speak: speak,
    stop: stop,
    ttsStatus: ttsStatus,
    prefetch: prefetch,
    cachedCount: idbCount,
    jpodUrl: jpodUrl
  };
  // 預先載入語音清單；清單更新時通知畫面（設定頁會重新顯示語音狀態）
  if (root.speechSynthesis && root.speechSynthesis.getVoices) {
    try { root.speechSynthesis.getVoices(); } catch (e) { /* 無語音清單 */ }
    try {
      var onVoices = function () { if (root.__ttsReady) root.__ttsReady(); };
      if (root.speechSynthesis.addEventListener) root.speechSynthesis.addEventListener('voiceschanged', onVoices);
      else root.speechSynthesis.onvoiceschanged = onVoices;
    } catch (e) { /* 舊版瀏覽器 */ }
  }
})(typeof self !== 'undefined' ? self : this);
