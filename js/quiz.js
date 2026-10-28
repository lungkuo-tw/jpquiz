/* 日文單字測驗 — quiz.js
 * 出題（加權隨機）、選項產生、填充題評分、熟練度更新
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.JPQuiz = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var W = null;
  function kanaLib() {
    if (W) return W;
    if (typeof self !== 'undefined' && self.wanakana) return self.wanakana;
    return null;
  }
  function setKanaLib(w) { W = w; }

  var CIRCLED = '⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  function accentText(acc) {
    if (!acc) return '';
    return String(acc).split(',').map(function (n) {
      var i = parseInt(n, 10);
      return (i >= 0 && i < CIRCLED.length) ? CIRCLED.charAt(i) : '[' + n + ']';
    }).join('');
  }

  function shortMeaning(m) {
    m = String(m || '').replace(/^\s*[①-⑳❶-❿⑴-⒇]\s*/, '');
    var first = m.split(/[；;／\/|｜]|\s{2,}|[②-⑳]/)[0].trim() || m.trim();
    if (first.length > 24) first = first.slice(0, 23) + '…';
    return first;
  }

  // ---------- 加權隨機 ----------
  function weightOf(p, now) {
    if (!p || !p.seen) return 6;
    var w = [9, 6, 4, 3, 2, 1][Math.max(0, Math.min(5, p.box | 0))];
    if (p.lastWrong && now - p.lastWrong < 2 * 86400000) w += 3;
    return w;
  }

  function sampleWeighted(items, weights, n, rnd) {
    var keyed = items.map(function (it, i) {
      var w = Math.max(0.0001, weights[i]);
      return { it: it, k: Math.pow(rnd(), 1 / w) };
    });
    keyed.sort(function (a, b) { return b.k - a.k; });
    return keyed.slice(0, n).map(function (x) { return x.it; });
  }

  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---------- 選擇題選項 ----------
  function distinctMeanings(pool, exclude) {
    var seen = {}, out = [];
    exclude.forEach(function (m) { seen[m] = 1; });
    pool.forEach(function (e) {
      if (!e.meaning) return;
      var s = shortMeaning(e.meaning);
      if (!s || seen[s]) return;
      seen[s] = 1;
      out.push({ text: s, pos: e.pos || '', len: s.length, id: e.id });
    });
    return out;
  }

  function buildOptions(entry, pool, rnd) {
    var correct = shortMeaning(entry.meaning);
    var others = distinctMeanings(pool.filter(function (e) { return e.id !== entry.id && e.meaning !== entry.meaning; }), [correct]);
    // 避免選項彼此包含（例如「死路」和「死路；死巷」）
    others = others.filter(function (o) { return o.text.indexOf(correct) < 0 && correct.indexOf(o.text) < 0; });
    if (others.length < 3) return null;
    var picked = [];
    if (entry.pos) {
      var same = shuffle(others.filter(function (o) { return o.pos === entry.pos; }), rnd);
      picked = same.slice(0, 2);
    }
    var rest = shuffle(others.filter(function (o) { return picked.indexOf(o) < 0; }), rnd);
    while (picked.length < 3 && rest.length) picked.push(rest.shift());
    var opts = [{ text: correct, correct: true, id: entry.id }].concat(picked.map(function (o) { return { text: o.text, correct: false, id: o.id }; }));
    shuffle(opts, rnd);
    return opts;
  }

  // ---------- 一回題目 ----------
  // opts: { count, types:['mc','fill','card'], rnd, now }
  function buildRound(entries, progress, opts) {
    opts = opts || {};
    var rnd = opts.rnd || Math.random;
    var now = opts.now || Date.now();
    var types = (opts.types && opts.types.length) ? opts.types : ['mc', 'fill', 'card'];
    var count = Math.min(opts.count || 20, entries.length);
    var weights = entries.map(function (e) { return weightOf(progress[e.id], now); });
    var chosen = opts.fixedOrder ? entries.slice(0, count) : sampleWeighted(entries, weights, count, rnd);
    var meaningPool = entries.filter(function (e) { return !!e.meaning; });
    var poolForOptions = meaningPool.length >= 4 ? meaningPool : (opts.extraPool || meaningPool);

    return chosen.map(function (e) {
      var feasible = [];
      if (types.indexOf('mc') >= 0 && e.meaning) feasible.push('mc');
      if (types.indexOf('fill') >= 0 && e.kana && (e.meaning || e.kanji)) feasible.push('fill');
      if (types.indexOf('card') >= 0) feasible.push('card');
      var q = null;
      var order = shuffle(feasible.slice(), rnd);
      for (var i = 0; i < order.length && !q; i++) {
        var t = order[i];
        if (t === 'mc') {
          var o = buildOptions(e, poolForOptions, rnd);
          if (o) q = { type: 'mc', id: e.id, options: o };
        } else {
          q = { type: t, id: e.id };
        }
      }
      if (!q) q = { type: 'card', id: e.id };
      return q;
    });
  }

  // ---------- 填充題評分 ----------
  function stripAnswer(s) { return String(s || '').replace(/[\s・･～〜~。、.,]/g, ''); }
  function toHira(s) {
    var w = kanaLib();
    if (!w) return s;
    return w.toHiragana(w.toKatakana(s));
  }
  function canonLong(h) {
    var w = kanaLib();
    if (!w) return h;
    var r = w.toRomaji(h);
    return r.replace(/ou/g, 'o-').replace(/([aeiou])\1/g, '$1-').replace(/ei/g, 'e-');
  }
  function gradeFill(input, entry) {
    var raw = stripAnswer(input);
    if (!raw) return { correct: false, empty: true };
    if (entry.kanji && raw === stripAnswer(entry.kanji)) return { correct: true, typed: raw };
    var a = toHira(raw), b = toHira(stripAnswer(entry.kana));
    if (a === b) return { correct: true, typed: a };
    if (/[ーァ-ヺ]/.test(entry.kana) && canonLong(a) === canonLong(b)) return { correct: true, typed: a };
    return { correct: false, typed: a };
  }

  // 假名按鈕：答案的字元 + 幾個干擾字
  var HIRA_POOL = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽゃゅょっ';
  function buildTiles(entry, rnd, extra) {
    var w = kanaLib();
    var ans = stripAnswer(entry.kana);
    var chars = Array.from ? Array.from(ans) : ans.split('');
    var isKata = /[ァ-ヺ]/.test(ans) && !/[ぁ-ゖ]/.test(ans);
    var pool = isKata && w ? w.toKatakana(HIRA_POOL) + 'ー' : HIRA_POOL;
    var n = extra == null ? Math.min(4, Math.max(2, Math.ceil(chars.length / 2))) : extra;
    var distract = [], guard = 0;
    while (distract.length < n && guard++ < 200) {
      var c = pool.charAt(Math.floor(rnd() * pool.length));
      if (chars.indexOf(c) < 0 && distract.indexOf(c) < 0) distract.push(c);
    }
    var tiles = chars.map(function (c, i) { return { ch: c, k: 'a' + i }; }).concat(distract.map(function (c, i) { return { ch: c, k: 'd' + i }; }));
    return shuffle(tiles, rnd);
  }

  // ---------- 熟練度（0–5 級） ----------
  function applyResult(progress, id, result, now) {
    now = now || Date.now();
    var p = progress[id] || { box: 0, right: 0, wrong: 0, seen: 0 };
    p.seen = (p.seen || 0) + 1;
    p.last = now;
    if (result === 'right') { p.box = Math.min(5, (p.box || 0) + 1); p.right = (p.right || 0) + 1; }
    else if (result === 'fuzzy') { p.box = Math.max(1, Math.min(p.box || 0, 2)); }
    else { p.box = 0; p.wrong = (p.wrong || 0) + 1; p.lastWrong = now; }
    progress[id] = p;
    return p;
  }

  return {
    setKanaLib: setKanaLib,
    accentText: accentText,
    shortMeaning: shortMeaning,
    buildRound: buildRound,
    buildOptions: buildOptions,
    gradeFill: gradeFill,
    buildTiles: buildTiles,
    applyResult: applyResult,
    weightOf: weightOf,
    shuffle: shuffle
  };
});
