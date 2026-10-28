/* 日文單字測驗 — store.js：題庫、學習紀錄、設定（存在本機） */
(function (root) {
  'use strict';
  var K = { decks: 'jpq1.decks', progress: 'jpq1.progress', settings: 'jpq1.settings' };
  var DEFAULTS = {
    fontScale: 'std',        // std ／ large ／ xl
    theme: 'color',          // color 一般彩色 ／ eink 黑白電子紙 ／ ecolor 彩色電子紙
    themeChosen: false,      // Android 第一次開啟時會請使用者選螢幕類型
    types: { mc: true, fill: true, card: true },
    count: 20,
    autoplay: 'after',       // off ／ after ／ show
    rate: 0.9,
    source: 'auto',          // auto ／ tts ／ online
    showAccent: true,
    fillInput: 'tiles',      // tiles ／ keyboard
    selected: {}
  };
  function read(k, d) {
    try { var v = root.localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
  }
  function write(k, v) {
    try { root.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function merge(def, v) {
    var out = {}, k;
    for (k in def) if (def.hasOwnProperty(k)) out[k] = def[k];
    for (k in v) if (v.hasOwnProperty(k)) out[k] = v[k];
    out.types = { mc: true, fill: true, card: true };
    if (v && v.types) for (k in v.types) out.types[k] = !!v.types[k];
    if (!out.selected || typeof out.selected !== 'object') out.selected = {};
    return out;
  }
  root.JPStore = {
    load: function () {
      return {
        decks: read(K.decks, []) || [],
        progress: read(K.progress, {}) || {},
        settings: merge(DEFAULTS, read(K.settings, {}) || {})
      };
    },
    saveDecks: function (d) { return write(K.decks, d); },
    saveProgress: function (p) { return write(K.progress, p); },
    saveSettings: function (s) { return write(K.settings, s); },
    defaults: DEFAULTS
  };
})(typeof self !== 'undefined' ? self : this);
