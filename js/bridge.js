/* 日文單字測驗 — bridge.js
 * 與 Android 外殼（AndroidBridge）溝通；在一般瀏覽器裡則回報「無外殼」
 */
(function (root) {
  'use strict';
  var pending = {}, seq = 0;

  function parse(x) {
    if (typeof x !== 'string') return x;
    try { return JSON.parse(x); } catch (e) { return { ok: false, error: x }; }
  }
  function native() { return root.AndroidBridge || null; }
  function invoke(B, method, a) {
    switch (a.length) {
      case 0: return B[method]();
      case 1: return B[method](a[0]);
      case 2: return B[method](a[0], a[1]);
      case 3: return B[method](a[0], a[1], a[2]);
      case 4: return B[method](a[0], a[1], a[2], a[3]);
      default: return B[method](a[0], a[1], a[2], a[3], a[4]);
    }
  }

  // 原生端完成後呼叫 window.__bridgeDone(id, json)
  root.__bridgeDone = function (id, payload) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    clearTimeout(p.timer);
    p.resolve(parse(payload));
  };

  function call(method, args, timeoutMs) {
    var B = native();
    if (!B || typeof B[method] !== 'function') return Promise.resolve({ ok: false, error: 'no_bridge' });
    return new Promise(function (resolve) {
      var id = 'c' + (++seq) + '_' + Date.now();
      var timer = setTimeout(function () {
        if (pending[id]) { delete pending[id]; resolve({ ok: false, error: 'timeout' }); }
      }, timeoutMs || 20000);
      pending[id] = { resolve: resolve, timer: timer };
      try { invoke(B, method, (args || []).concat([id])); }
      catch (e) { clearTimeout(timer); delete pending[id]; resolve({ ok: false, error: String(e && e.message || e) }); }
    });
  }

  function sync(method, args) {
    var B = native();
    if (!B || typeof B[method] !== 'function') return null;
    try { return parse(invoke(B, method, args || [])); } catch (e) { return null; }
  }

  root.JPBridge = {
    available: function () { return !!native(); },
    call: call,
    sync: sync
  };
})(typeof self !== 'undefined' ? self : this);
