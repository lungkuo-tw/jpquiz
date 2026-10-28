/* 日文單字測驗 — app.js：畫面與互動 */
(function () {
  'use strict';
  var P = window.JPParser, Q = window.JPQuiz, I = window.JPImporter, A = window.JPAudio, S = window.JPStore, B = window.JPBridge;
  Q.setKanaLib(window.wanakana);

  var VERSION = '1.2.0';
  var IS_ANDROID = /Android/i.test(navigator.userAgent) || (window.JPBridge && window.JPBridge.available());
  // 顯示模式：一般彩色／黑白電子紙／彩色電子紙
  var THEMES = [
    ['color', '一般彩色螢幕', '手機、平板，配色同參考畫面'],
    ['eink', '黑白電子紙', '文石黑白機型：純黑白、粗框線，對錯用實線／虛線和 ✓ ✗ 區分'],
    ['ecolor', '彩色電子紙', '文石彩色機型：深色高飽和配色，不用淡色底']
  ];
  function themeName(v) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i][0] === v) return THEMES[i][1]; return THEMES[0][1]; }
  var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function isStandalone() {
    try { return !!(navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); }
    catch (e) { return false; }
  }
  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var data = S.load();
  var st = { screen: 'home', history: [], round: null, imp: null, deckId: null, deckPage: 0, deckQuery: '', prefetch: null, busy: '' };
  A.init(function () { return data.settings; });

  var ICON = {
    back: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M15 4.5 7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d="M3.5 9.2h3.6L12.4 5v14l-5.3-4.2H3.5z" fill="currentColor"/><path d="M15.6 8.3a5.2 5.2 0 0 1 0 7.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    speakerSm: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3.5 9.2h3.6L12.4 5v14l-5.3-4.2H3.5z" fill="currentColor"/><path d="M15.6 8.3a5.2 5.2 0 0 1 0 7.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    contrast: '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm8.4 4.6-.1-2.4 2-1.6-2-3.4-2.4.9a8 8 0 0 0-2.1-1.2L15.4 3h-3.9l-.4 2.5a8 8 0 0 0-2.1 1.2l-2.4-.9-2 3.4 2 1.6a8 8 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-.9c.6.5 1.3.9 2.1 1.2l.4 2.5h3.9l.4-2.5c.8-.3 1.5-.7 2.1-1.2l2.4.9 2-3.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'
  };

  var SAMPLE = {
    name: '範例題庫（可刪除）',
    entries: [
      { kana: 'いきどまり', accent: '0', kanji: '行き止まり', meaning: '死路；死巷；走到盡頭', pos: '名', example: 'この道は行き止まりです。', exampleZh: '這條路是死路。' },
      { kana: 'すっかり', accent: '3', kanji: '', meaning: '完全；全部；徹底', pos: '副', example: 'すっかり忘れていました。', exampleZh: '我完全忘記了。' },
      { kana: 'けいれき', accent: '0', kanji: '経歴', meaning: '經歷；履歷', pos: '名', example: '彼の経歴を調べる。', exampleZh: '調查他的經歷。' },
      { kana: 'がくせい', kanji: '学生', meaning: '學生', pos: '名' },
      { kana: 'せんせい', kanji: '先生', meaning: '老師；醫生', pos: '名' },
      { kana: 'ともだち', kanji: '友達', meaning: '朋友', pos: '名' },
      { kana: 'てんき', kanji: '天気', meaning: '天氣', pos: '名' },
      { kana: 'としょかん', kanji: '図書館', meaning: '圖書館', pos: '名' },
      { kana: 'びょういん', kanji: '病院', meaning: '醫院', pos: '名' },
      { kana: 'しんぶん', kanji: '新聞', meaning: '報紙', pos: '名' },
      { kana: 'とけい', kanji: '時計', meaning: '時鐘；手錶', pos: '名' },
      { kana: 'えいが', kanji: '映画', meaning: '電影', pos: '名' },
      { kana: 'しゃしん', kanji: '写真', meaning: '照片', pos: '名' },
      { kana: 'やくそく', kanji: '約束', meaning: '約定；承諾', pos: '名' },
      { kana: 'べんきょう', kanji: '勉強', meaning: '讀書；學習', pos: '名' },
      { kana: 'せつめい', kanji: '説明', meaning: '說明', pos: '名' },
      { kana: 'けいけん', kanji: '経験', meaning: '經驗', pos: '名' },
      { kana: 'いそがしい', kanji: '忙しい', meaning: '忙碌的', pos: '形' },
      { kana: 'やさしい', kanji: '優しい', meaning: '溫柔的；親切的', pos: '形' },
      { kana: 'しずか', kanji: '静か', meaning: '安靜的', pos: '形動' },
      { kana: 'コーヒー', kanji: '', meaning: '咖啡', pos: '名' },
      { kana: 'パン', kanji: '', meaning: '麵包', pos: '名' }
    ]
  };

  // ---------- 共用 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var toastTimer = null;
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, ms || 3200);
  }
  function saveDecks() { if (!S.saveDecks(data.decks)) toast('儲存失敗：裝置空間不足，請刪除用不到的題庫'); }
  function saveProgress() { S.saveProgress(data.progress); }
  function saveSettings() { S.saveSettings(data.settings); applyLook(); }
  function applyLook() {
    var s = data.settings;
    var theme = /^(color|eink|ecolor)$/.test(s.theme) ? s.theme : 'color';
    document.documentElement.className = 'fs-' + s.fontScale + ' theme-' + theme + (theme === 'color' ? '' : ' epaper');
  }
  function deckById(id) { for (var i = 0; i < data.decks.length; i++) if (data.decks[i].id === id) return data.decks[i]; return null; }
  function allEntries() {
    var seen = {}, out = [];
    data.decks.forEach(function (d) { d.entries.forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; out.push(e); } }); });
    return out;
  }
  function selectedEntries() {
    var sel = data.settings.selected, any = data.decks.some(function (d) { return sel[d.id] !== false; });
    var seen = {}, out = [];
    data.decks.forEach(function (d) {
      if (any && sel[d.id] === false) return;
      d.entries.forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; out.push(e); } });
    });
    return out;
  }
  function level(e) { var p = data.progress[e.id]; return p && p.seen ? (p.box | 0) : -1; }
  function deckStats(entries) {
    var s = { total: entries.length, mastered: 0, learning: 0, fresh: 0 };
    entries.forEach(function (e) { var l = level(e); if (l < 0) s.fresh++; else if (l >= 4) s.mastered++; else s.learning++; });
    return s;
  }
  function accent(e) { return data.settings.showAccent && e.accent ? Q.accentText(e.accent) : ''; }
  function hwText(e) {
    var s = (e.kana || '') + accent(e);
    if (e.kanji && e.kanji !== e.kana) s += e.kana ? '[' + e.kanji + ']' : e.kanji;
    return s;
  }
  function hwHTML(e, cls) {
    var len = hwText(e).length;
    var size = len > 16 ? ' hw-xs' : len > 11 ? ' hw-s' : '';
    var h = '<span class="hw-a"><span class="hw-kana">' + esc(e.kana || '') + '</span>';
    if (accent(e)) h += '<span class="hw-acc">' + esc(accent(e)) + '</span>';
    h += '</span>';
    if (e.kanji && e.kanji !== e.kana) h += (e.kana ? '<wbr>' : '') + '<span class="hw-kanji">' + (e.kana ? '[' + esc(e.kanji) + ']' : esc(e.kanji)) + '</span>';
    return '<div class="hw' + size + (cls ? ' ' + cls : '') + '" lang="ja">' + h + '</div>';
  }
  function topbar(title, opts) {
    opts = opts || {};
    var left = opts.left || (opts.noBack ? '<span class="tb-side"></span>' : '<button class="back" data-act="' + (opts.backAct || 'back') + '" aria-label="返回">' + ICON.back + '</button>');
    var right = opts.right || '<span class="tb-side"></span>';
    return '<header class="topbar">' + left + '<h1>' + esc(title) + '</h1>' + right + '</header>';
  }
  function go(screen) { st.history.push(st.screen); st.screen = screen; render(); window.scrollTo(0, 0); }
  function back() {
    A.stop();
    if (st.screen === 'quiz' && st.round && !st.round.finished && st.round.i > 0) {
      if (!window.confirm('要結束這一回測驗嗎？已作答的紀錄會保留。')) return true;
    }
    if (st.screen === 'prefetch-running') return true;
    var prev = st.history.pop();
    if (!prev) { if (st.screen === 'home') return false; prev = 'home'; }
    if (st.screen === 'summary' || st.screen === 'quiz') prev = 'home';
    if (st.prefetch) st.prefetch.cancel = true;
    st.screen = prev;
    render();
    return true;
  }
  window.appBack = function () { return back(); };

  function seg(name, options, value) {
    return '<div class="seg" role="group">' + options.map(function (o) {
      var on = String(o[0]) === String(value);
      return '<button class="seg-btn' + (on ? ' on' : '') + '" data-act="set" data-k="' + name + '" data-v="' + esc(o[0]) + '" aria-pressed="' + on + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function themeChoices(value) {
    // value 為 null 時（第一次開啟的提問）不預先勾選任何一項
    return '<div class="choices" role="radiogroup">' + THEMES.map(function (t) {
      var on = value != null && t[0] === value;
      return '<button class="choice' + (on ? ' on' : '') + '" data-act="set-theme" data-v="' + t[0] + '" role="radio" aria-checked="' + on + '">' +
        '<span class="c-mark" aria-hidden="true"></span><span class="c-text"><span class="c-name">' + esc(t[1]) + '</span><span class="c-desc">' + esc(t[2]) + '</span></span></button>';
    }).join('') + '</div>';
  }
  function checkbox(attrs, checked, label) {
    return '<label class="chk"><input type="checkbox" ' + attrs + (checked ? ' checked' : '') + '><span class="box" aria-hidden="true"></span>' + (label ? '<span class="chk-label">' + label + '</span>' : '') + '</label>';
  }

  // ---------- 首頁 ----------
  function viewHome() {
    var s = data.settings;
    var gear = '<button class="icon-btn" data-act="open" data-to="settings" aria-label="設定">' + ICON.gear + '</button>';
    var themeBtn = '<button class="icon-btn" data-act="cycle-theme" aria-label="切換顯示模式（目前：' + esc(themeName(s.theme)) + '）">' + ICON.contrast + '</button>';
    var h = topbar('日文單字測驗', { left: themeBtn, right: gear });
    h += '<main class="page">';
    // Android（文石 App 或文石瀏覽器開網頁版）第一次開啟：先選螢幕類型
    if (IS_ANDROID && !s.themeChosen && s.theme === 'color') {
      h += '<section class="panel tip theme-pick"><div class="panel-title">先選螢幕類型（之後隨時可以改）</div>' + themeChoices(null) +
        '<p class="muted small">之後可以按左上角的半圓圖示快速切換，或到「設定 → 顯示模式」。</p></section>';
    }
    if (IS_IOS && !isStandalone() && !s.iosHintDone) {
      h += '<section class="panel tip ios-hint"><div class="panel-title">加到主畫面，像 App 一樣用</div>' +
        '<p>在 Safari 打開分享選單（可能在網址列旁的「⋯」裡），選「加入主畫面」。之後從桌面圖示開啟，沒有網路也能用。</p>' +
        '<button class="btn" data-act="ios-hint-done">知道了</button></section>';
    }
    if (!data.decks.length) {
      h += '<section class="panel empty"><p class="lead">還沒有題庫。</p><p>先匯入你的單字表，或載入範例試試看。</p>' +
        '<div class="stack"><button class="btn primary big" data-act="open" data-to="import">匯入單字</button>' +
        '<button class="btn big" data-act="load-sample">載入範例題庫</button></div></section>';
      return h + '</main>';
    }
    h += '<section class="panel"><div class="panel-title">題庫<span class="muted small-note">勾選要練習的</span></div>';
    data.decks.forEach(function (d) {
      var ds = deckStats(d.entries);
      var pct = ds.total ? Math.round(ds.mastered / ds.total * 100) : 0;
      h += '<div class="deck">' + checkbox('data-act="toggle-deck" data-id="' + esc(d.id) + '"', s.selected[d.id] !== false, '') +
        '<button class="deck-main" data-act="open-deck" data-id="' + esc(d.id) + '">' +
        '<span class="deck-name">' + esc(d.name) + '</span>' +
        '<span class="deck-meta">' + ds.total + ' 個單字・已熟記 ' + ds.mastered + '</span>' +
        '<span class="bar"><i style="width:' + pct + '%"></i></span></button></div>';
    });
    h += '</section>';
    var pool = selectedEntries();
    var n = Math.min(s.count, pool.length);
    h += '<div class="stack">' +
      '<button class="btn primary big" data-act="start" data-mode="mix"' + (pool.length ? '' : ' disabled') + '>開始測驗・' + n + ' 題</button>' +
      '<button class="btn big" data-act="start" data-mode="card"' + (pool.length ? '' : ' disabled') + '>單字卡練習</button>' +
      '<button class="btn big" data-act="open" data-to="import">匯入單字</button></div>';
    var all = deckStats(pool);
    h += '<p class="foot muted">這次練習範圍：' + all.total + ' 個單字，已熟記 ' + all.mastered + '、學習中 ' + all.learning + '、還沒練 ' + all.fresh + '</p>';
    return h + '</main>';
  }

  // ---------- 測驗 ----------
  function enabledTypes() {
    var t = data.settings.types, out = [];
    if (t.mc) out.push('mc'); if (t.fill) out.push('fill'); if (t.card) out.push('card');
    return out.length ? out : ['mc', 'fill', 'card'];
  }
  function startRound(mode, pool) {
    pool = pool || selectedEntries();
    if (!pool.length) { toast('請先匯入或勾選題庫'); return; }
    var types = mode === 'card' ? ['card'] : enabledTypes();
    var count = mode === 'retry' ? pool.length : Math.min(data.settings.count, pool.length);
    var qs = Q.buildRound(pool, data.progress, { count: count, types: types, extraPool: allEntries() });
    var map = {};
    allEntries().forEach(function (e) { map[e.id] = e; });
    pool.forEach(function (e) { map[e.id] = e; });
    st.round = { mode: mode, qs: qs, i: 0, entries: map, results: [], right: 0, answered: false, finished: false };
    resetQuestionState();
    st.history = ['home'];
    st.screen = 'quiz';
    render();
    autoSpeakOnShow();
  }
  function resetQuestionState() {
    var R = st.round;
    R.answered = false; R.choice = null; R.rating = null; R.fill = null; R.speakState = '';
    var q = R.qs[R.i];
    if (q && q.type === 'fill') {
      var e = R.entries[q.id];
      R.fill = { kbd: data.settings.fillInput === 'keyboard', tiles: Q.buildTiles(e, Math.random), built: [], text: '', result: null };
    }
  }
  function curQ() { var R = st.round; return R ? R.qs[R.i] : null; }
  function curE() { var q = curQ(); return q ? st.round.entries[q.id] : null; }

  function speakerHTML() {
    var R = st.round, ss = R ? R.speakState : '';
    var label = ss === 'loading' ? '載入中…' : ss === 'playing' ? '播放中' : ss === 'error' ? '沒有可用的語音' : '';
    return '<div class="speak-wrap"><button class="speak' + (ss ? ' ' + ss : '') + '" data-act="speak" aria-label="播放發音">' + ICON.speaker + '</button>' +
      '<div class="speak-status" id="speak-status">' + esc(label) + (ss === 'error' ? ' <button class="linkish" data-act="open" data-to="settings">看設定</button>' : '') + '</div></div>';
  }

  function viewQuiz() {
    var R = st.round, q = curQ(), e = curE();
    if (!q || !e) return viewHome();
    var title = q.type === 'mc' ? '選擇題' : q.type === 'fill' ? '填充題' : '單字卡';
    var h = topbar(title, { backAct: 'back' });
    var scoreLabel = R.mode === 'card' ? '記得 ' : '答對 ';
    h += '<main class="quiz-wrap"><article class="card"><div class="strip"><span>第 ' + (R.i + 1) + '／' + R.qs.length + ' 題</span><span>' + scoreLabel + R.right + '</span></div><div class="card-body">';

    // 題目區
    h += '<div class="prompt">';
    if (q.type === 'fill' && !R.answered) {
      h += '<div class="q-label">寫出這個字的讀音</div>';
      if (e.meaning) h += '<div class="fill-meaning">' + esc(e.meaning) + '</div>';
      if (e.kanji) h += '<div class="fill-kanji" lang="ja">' + esc(e.kanji) + '</div>';
      if (!e.meaning && !e.kanji) h += '<div class="fill-meaning">（這個字沒有提示資料）</div>';
    } else {
      h += hwHTML(e) + speakerHTML();
      if (q.type === 'card' && R.answered) h += revealHTML(e, true);
    }
    h += '</div>';

    // 作答區
    if (q.type === 'mc') h += mcHTML(q, e);
    else if (q.type === 'fill') h += fillHTML(e);
    else h += cardHTML();

    h += '</div></article></main>';
    return h;
  }

  function revealHTML(e, big) {
    var h = '<div class="reveal' + (big ? ' big' : '') + '">';
    if (e.meaning) h += '<div class="rv-meaning">' + esc(e.meaning) + '</div>';
    if (e.pos) h += '<div class="rv-pos">' + esc(e.pos) + '</div>';
    if (e.example) h += '<div class="rv-ex" lang="ja">' + esc(e.example) + '</div>';
    if (e.exampleZh) h += '<div class="rv-exzh">' + esc(e.exampleZh) + '</div>';
    return h + '</div>';
  }

  function nextBtn() {
    var R = st.round;
    var last = R.i >= R.qs.length - 1;
    return '<button class="btn primary wide next" data-act="next">' + (last ? '看結果 ›' : '下一題 ›') + '</button>';
  }

  function mcHTML(q, e) {
    var R = st.round;
    var h = '<div class="qa"><div class="q-label">選出正確的中文意思</div><div class="opts">';
    q.options.forEach(function (o, i) {
      var cls = 'opt';
      var mark = '';
      if (R.answered) {
        if (o.correct) { cls += ' right'; mark = '✓'; }
        else if (R.choice === i) { cls += ' wrong'; mark = '✗'; }
        else cls += ' dim';
      }
      h += '<button class="' + cls + '" data-act="choose" data-i="' + i + '"' + (R.answered ? ' disabled' : '') + '><span class="n">' + (i + 1) + '</span><span class="t">' + esc(o.text) + '</span><span class="mark">' + mark + '</span></button>';
    });
    h += '</div>';
    if (R.answered) {
      var ok = q.options[R.choice] && q.options[R.choice].correct;
      h += '<div class="fb ' + (ok ? 'ok' : 'ng') + '"><div class="fb-title">' + (ok ? '✓ 答對了' : '✗ 答錯了') + '</div>' +
        (e.meaning ? '<div class="fb-line">完整意思：' + esc(e.meaning) + '</div>' : '') +
        (e.example ? '<div class="fb-line" lang="ja">' + esc(e.example) + '</div>' : '') +
        (e.exampleZh ? '<div class="fb-line muted">' + esc(e.exampleZh) + '</div>' : '') + '</div>' + nextBtn();
    }
    return h + '</div>';
  }

  function fillHTML(e) {
    var R = st.round, F = R.fill;
    var h = '<div class="qa">';
    if (!R.answered) {
      if (F.kbd) {
        h += '<input class="fill-input" id="fill-input" lang="ja" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="輸入假名或羅馬拼音" value="' + esc(F.text) + '">' +
          '<div class="fill-preview" id="fill-preview" lang="ja">' + esc(previewKana(F.text)) + '</div>' +
          '<div class="row"><button class="btn" data-act="fill-mode" data-v="tiles">改用假名按鈕</button></div>';
      } else {
        h += '<div class="answer-box" id="answer-box" lang="ja">' + esc(F.built.map(function (t) { return t.ch; }).join('')) + '<span class="caret"></span></div>';
        h += '<div class="tiles" lang="ja">' + F.tiles.map(function (t) {
          var used = F.built.indexOf(t) >= 0;
          return '<button class="tile" data-act="tile" data-k="' + t.k + '"' + (used ? ' disabled' : '') + '>' + esc(t.ch) + '</button>';
        }).join('') + '</div>';
        h += '<div class="row"><button class="btn" data-act="tile-back">⌫ 退一格</button><button class="btn" data-act="tile-clear">清除</button><button class="btn" data-act="fill-mode" data-v="keyboard">改用鍵盤</button></div>';
      }
      h += '<button class="btn primary wide" data-act="fill-submit">確定</button>';
    } else {
      var r = F.result;
      h += '<div class="fb ' + (r.correct ? 'ok' : 'ng') + '"><div class="fb-title">' + (r.correct ? '✓ 答對了' : '✗ 答錯了') + '</div>' +
        (!r.correct ? '<div class="fb-line">你的答案：<span lang="ja">' + esc(F.given || '（空白）') + '</span></div>' : '') +
        '<div class="fb-line">正確讀音：<span lang="ja" class="strong">' + esc(e.kana) + accent(e) + '</span></div>' +
        (e.meaning ? '<div class="fb-line">意思：' + esc(e.meaning) + '</div>' : '') +
        (e.example ? '<div class="fb-line" lang="ja">' + esc(e.example) + '</div>' : '') +
        (e.exampleZh ? '<div class="fb-line muted">' + esc(e.exampleZh) + '</div>' : '') + '</div>' + nextBtn();
    }
    return h + '</div>';
  }

  function cardHTML() {
    var R = st.round;
    var btns = [['forgot', '我忘了', 'p-red'], ['fuzzy', '好像記得', 'p-orange'], ['know', '我記得', 'p-teal']];
    var h = '<div class="qa card-qa"><div class="dash"></div><div class="pills">';
    btns.forEach(function (b) {
      var on = R.rating === b[0];
      h += '<button class="pill ' + b[2] + (on ? ' on' : '') + '" data-act="rate" data-v="' + b[0] + '"' + (R.answered ? ' disabled' : '') + '>' + b[1] + '</button>';
    });
    h += '</div>';
    if (R.answered) h += nextBtn();
    return h + '</div>';
  }

  function previewKana(t) {
    t = String(t || '').trim();
    if (!t || !window.wanakana) return '';
    if (!/[a-z]/i.test(t)) return '';
    return '→ ' + window.wanakana.toHiragana(t.replace(/\s+/g, ''));
  }

  function record(result) {
    var R = st.round, q = curQ();
    Q.applyResult(data.progress, q.id, result);
    saveProgress();
    R.results.push({ id: q.id, type: q.type, result: result });
    if (result === 'right') R.right++;
  }
  function autoSpeakAfter() { if (data.settings.autoplay !== 'off') doSpeak(); }
  function autoSpeakOnShow() {
    var q = curQ();
    if (q && data.settings.autoplay === 'show' && q.type !== 'fill') doSpeak();
  }

  function doSpeak(entry) {
    var e = entry || curE();
    if (!e) return;
    var inQuiz = st.screen === 'quiz' && !entry;
    A.speak(e, function (state) {
      if (!inQuiz || st.screen !== 'quiz' || curE() !== e) return;
      var R = st.round;
      R.speakState = state === 'done' ? '' : state;
      var btn = app.querySelector('.speak');
      var status = document.getElementById('speak-status');
      if (btn) btn.className = 'speak' + (R.speakState ? ' ' + R.speakState : '');
      if (status) {
        var label = state === 'loading' ? '載入中…' : state === 'playing' ? '播放中' : state === 'error' ? '沒有可用的語音' : '';
        status.innerHTML = esc(label) + (state === 'error' ? ' <button class="linkish" data-act="open" data-to="settings">看設定</button>' : '');
      }
    }).then(function (r) {
      if (!r.ok && !inQuiz) toast('沒有可用的日文語音，請到「設定 → 發音」查看');
    });
  }

  function finishRound() {
    A.stop();
    st.round.finished = true;
    st.screen = 'summary';
    st.history = ['home'];
    render();
  }

  // ---------- 結果 ----------
  function viewSummary() {
    var R = st.round;
    var total = R.results.length;
    var right = R.results.filter(function (r) { return r.result === 'right'; }).length;
    var weak = R.results.filter(function (r) { return r.result !== 'right'; });
    var pct = total ? Math.round(right / total * 100) : 0;
    var h = topbar('測驗結果', { backAct: 'home' });
    h += '<main class="page"><section class="panel score"><div class="score-big">' + right + ' ／ ' + total + '</div><div class="score-sub">' +
      (R.mode === 'card' ? '記得的比例 ' : '答對率 ') + pct + '%</div></section>';
    if (weak.length) {
      h += '<section class="panel"><div class="panel-title">需要加強（' + weak.length + '）</div><ul class="wlist">';
      weak.forEach(function (r) {
        var e = R.entries[r.id];
        if (!e) return;
        var tag = r.result === 'fuzzy' ? '好像記得' : (r.type === 'card' ? '我忘了' : '答錯');
        h += '<li><button class="mini-speak" data-act="speak-id" data-id="' + esc(e.id) + '" aria-label="發音">' + ICON.speakerSm + '</button>' +
          '<div class="wl-main"><div class="wl-hw" lang="ja">' + esc(hwText(e)) + '</div><div class="wl-mean">' + esc(e.meaning || '') + '</div></div><span class="tag">' + tag + '</span></li>';
      });
      h += '</ul></section>';
    } else {
      h += '<section class="panel"><p class="lead">全部都答對了，很棒！</p></section>';
    }
    h += '<div class="stack">' + (weak.length ? '<button class="btn primary big" data-act="retry">錯題再練一次</button>' : '') +
      '<button class="btn big" data-act="start" data-mode="' + (R.mode === 'card' ? 'card' : 'mix') + '">再來一回</button>' +
      '<button class="btn big" data-act="home">回首頁</button></div></main>';
    return h;
  }

  // ---------- 匯入 ----------
  function viewImport() {
    var h = topbar('匯入單字');
    h += '<main class="page">' +
      '<section class="panel"><div class="panel-title">從檔案匯入</div>' +
      '<p class="muted">Excel、Word、PDF、CSV、TXT、網頁、EPUB、PowerPoint、JSON 都可以。</p>' +
      '<label class="btn primary big file-btn">選擇檔案<input type="file" id="file-input" class="visually-hidden"></label></section>' +
      '<section class="panel"><div class="panel-title">從網址匯入</div>' +
      '<p class="muted">網頁、檔案連結、Google 試算表或文件（需設定「知道連結的任何人都能檢視」）。</p>' +
      '<input type="url" id="url-input" class="text-in" placeholder="https://…" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<button class="btn big" data-act="import-url">讀取網址</button></section>' +
      '<section class="panel"><div class="panel-title">直接貼上文字</div>' +
      '<textarea id="paste-input" class="text-in" rows="5" placeholder="一行一個單字，例如：&#10;いきどまり⓪[行き止まり] 死路"></textarea>' +
      '<button class="btn big" data-act="import-paste">辨識文字</button></section>' +
      '<section class="panel"><div class="panel-title">其他</div><div class="stack">' +
      '<button class="btn" data-act="load-sample">載入範例題庫</button>' +
      '<button class="btn" data-act="save-template">下載匯入範本（CSV）</button></div></section>' +
      (st.busy ? '<div class="busy" role="status">' + esc(st.busy) + '</div>' : '') +
      '</main>';
    return h;
  }

  function runImport(promise, sourceLabel) {
    st.busy = '讀取中…';
    render();
    promise.then(function (res) {
      st.busy = '';
      if (res.kind === 'backup') return restoreBackup(res.data);
      var parsed = res.kind === 'objects' ? P.fromObjects(res.list) : P.parseBlocks(res.blocks, { dropped: res.dropped || [] });
      st.imp = { parsed: parsed, name: (res.title || sourceLabel || '新題庫').slice(0, 40), source: res.source || sourceLabel || '' };
      st.screen = 'preview';
      st.history = ['home', 'import'];
      render();
    }).catch(function (err) {
      st.busy = '';
      render();
      var msg = err && err.friendly ? err.message : '讀取失敗：' + (err && err.message ? err.message : err);
      var tip = '';
      if (err && /image|scanned/.test(err.code)) tip = '\n\n可以把圖片或檔案傳給 Claude，請它整理成單字表 CSV 再匯入。';
      window.alert(msg + tip);
    });
  }
  function setBusy(msg) {
    st.busy = msg;
    var el = app.querySelector('.busy');
    if (el) el.textContent = msg;
  }

  function viewPreview() {
    var imp = st.imp, a = imp.parsed.audit, list = imp.parsed.entries;
    var h = topbar('確認匯入');
    h += '<main class="page"><section class="panel audit">' +
      '<div class="audit-line">讀取 <b>' + a.units + '</b> 行 → 辨識 <b>' + list.length + '</b> 個單字 → 略過 <b>' + a.skipped.length + '</b> 行</div>';
    var notes = [];
    if (a.dupMerged) notes.push('重複的 ' + a.dupMerged + ' 筆已合併');
    if (a.noMeaning) notes.push('缺中文意思 ' + a.noMeaning + ' 個（不會出選擇題）');
    if (a.noReading) notes.push('缺讀音 ' + a.noReading + ' 個（不會出填充題）');
    if (notes.length) h += '<div class="audit-sub">' + notes.join('；') + '</div>';
    h += '</section>';
    if (a.skipped.length) {
      var shown = a.skipped.slice(0, 500);
      h += '<details class="panel skipped"><summary>查看略過的 ' + a.skipped.length + ' 行和原因</summary><ol>' +
        shown.map(function (s) {
          return '<li><span class="why">' + esc(s.reason) + '</span>' + (s.where ? '<span class="where">' + esc(s.where) + '</span>' : '') + '<div class="raw">' + esc(s.text) + '</div></li>';
        }).join('') + '</ol>' + (a.skipped.length > 500 ? '<p class="muted">（還有 ' + (a.skipped.length - 500) + ' 行未列出）</p>' : '') + '</details>';
    }
    if (!list.length || a.looksLikeArticle) {
      h += '<section class="panel tip"><div class="panel-title">建議</div><p>' + (list.length ? '這份內容大多是句子或文章，程式只抓得到少數單字。' : '這份內容沒辦法自動分出單字。') +
        '可以把檔案或網址傳給 Claude，請它整理成「假名、重音、漢字、中文」的單字表 CSV，再回來匯入，準確度會高很多。</p></section>';
    }
    if (list.length) {
      h += '<section class="panel"><div class="panel-title">預覽（前 ' + Math.min(50, list.length) + ' 個）</div><ol class="plist">' +
        list.slice(0, 50).map(function (e) {
          var flags = (!e.meaning ? '<span class="flag">缺中文</span>' : '') + (!e.kana ? '<span class="flag">缺讀音</span>' : '');
          return '<li><span lang="ja" class="p-hw">' + esc(hwText(e)) + '</span><span class="p-mean">' + esc(e.meaning) + '</span>' + flags + '</li>';
        }).join('') + '</ol></section>';
      h += '<section class="panel"><div class="panel-title">存成</div>' +
        '<label class="radio"><input type="radio" name="target" value="new" checked><span>新題庫</span></label>' +
        '<input type="text" id="deck-name" class="text-in" value="' + esc(imp.name) + '" maxlength="40">';
      if (data.decks.length) {
        h += '<label class="radio"><input type="radio" name="target" value="merge"><span>合併到現有題庫（保留學習紀錄）</span></label>' +
          '<select id="merge-target" class="text-in">' + data.decks.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.name) + '</option>'; }).join('') + '</select>';
      }
      h += '</section><div class="stack"><button class="btn primary big" data-act="confirm-import">加入 ' + list.length + ' 個單字</button>' +
        '<button class="btn big" data-act="back">重新選擇</button></div>';
    } else {
      h += '<div class="stack"><button class="btn big" data-act="back">重新選擇</button></div>';
    }
    return h + '</main>';
  }

  function confirmImport() {
    var list = st.imp.parsed.entries;
    var target = app.querySelector('input[name="target"]:checked');
    var mode = target ? target.value : 'new';
    if (mode === 'merge') {
      var d = deckById((app.querySelector('#merge-target') || {}).value);
      if (!d) { toast('請選擇要合併的題庫'); return; }
      var idx = {}, added = 0, updated = 0;
      d.entries.forEach(function (e, i) { idx[e.id] = i; });
      list.forEach(function (e) {
        if (idx.hasOwnProperty(e.id)) {
          var old = d.entries[idx[e.id]];
          ['accent', 'kanji', 'meaning', 'pos', 'example', 'exampleZh'].forEach(function (k) { if (e[k] && e[k] !== old[k]) { old[k] = e[k]; } });
          updated++;
        } else { d.entries.push(e); added++; }
      });
      d.updated = Date.now();
      saveDecks();
      toast('已合併：新增 ' + added + ' 個、更新 ' + updated + ' 個');
    } else {
      var name = ((app.querySelector('#deck-name') || {}).value || '').trim() || '新題庫';
      var deck = { id: 'd' + Date.now().toString(36), name: name, source: st.imp.source, created: Date.now(), updated: Date.now(), entries: list };
      data.decks.push(deck);
      data.settings.selected[deck.id] = true;
      saveDecks(); saveSettings();
      toast('已加入「' + name + '」，共 ' + list.length + ' 個單字');
    }
    st.imp = null;
    st.history = [];
    st.screen = 'home';
    render();
  }

  function loadSample() {
    var res = P.fromObjects(SAMPLE.entries);
    var deck = { id: 'dsample', name: SAMPLE.name, source: 'sample', created: Date.now(), updated: Date.now(), entries: res.entries };
    var old = deckById('dsample');
    if (old) { old.entries = res.entries; } else { data.decks.push(deck); data.settings.selected[deck.id] = true; }
    saveDecks(); saveSettings();
    toast('已載入範例題庫（' + res.entries.length + ' 個單字）');
    st.history = []; st.screen = 'home'; render();
  }

  // ---------- 存檔（匯出） ----------
  function csvCell(s) { s = String(s == null ? '' : s); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function deckCSV(entries) {
    var rows = [['假名', '重音', '漢字', '詞性', '中文', '例句', '例句中譯']];
    entries.forEach(function (e) { rows.push([e.kana, e.accent, e.kanji, e.pos, e.meaning, e.example, e.exampleZh]); });
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function saveFile(name, mime, text) {
    if (B.available()) {
      B.call('saveText', [name, mime, text], 600000).then(function (r) {
        if (r && r.ok) toast('已存檔：' + (r.name || name));
        else if (r && r.error !== 'cancelled') toast('存檔失敗：' + (r && r.error || '未知原因'));
      });
      return;
    }
    // iPhone：用分享選單（可選「儲存到檔案」或傳到 LINE），比下載連結可靠
    if (IS_IOS && navigator.share && navigator.canShare && window.File) {
      var file = null, can = false;
      try { file = new File([text], name, { type: mime }); can = navigator.canShare({ files: [file] }); } catch (e) { can = false; }
      if (can) {
        navigator.share({ files: [file], title: name }).then(function () { toast('完成：' + name); }, function (err) {
          if (err && err.name === 'AbortError') return;
          downloadBlob(name, mime, text);
        });
        return;
      }
    }
    downloadBlob(name, mime, text);
  }
  function downloadBlob(name, mime, text) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function stamp() { var d = new Date(); function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }

  function restoreBackup(bk) {
    if (!bk || !Array.isArray(bk.decks)) { window.alert('備份檔格式不正確'); render(); return; }
    if (!window.confirm('要從備份還原 ' + bk.decks.length + ' 個題庫和學習紀錄嗎？同名題庫會被備份內容取代。')) { render(); return; }
    bk.decks.forEach(function (d) {
      var old = deckById(d.id);
      if (old) { old.name = d.name; old.entries = d.entries; old.updated = d.updated; }
      else data.decks.push(d);
    });
    var pk = bk.progress || {};
    Object.keys(pk).forEach(function (k) { data.progress[k] = pk[k]; });
    saveDecks(); saveProgress();
    toast('已還原 ' + bk.decks.length + ' 個題庫');
    st.history = []; st.screen = 'home'; render();
  }

  // ---------- 題庫管理 ----------
  var PAGE = 40;
  function viewDeck() {
    var d = deckById(st.deckId);
    if (!d) { st.screen = 'home'; return viewHome(); }
    var ds = deckStats(d.entries);
    var q = st.deckQuery.trim();
    var list = q ? d.entries.filter(function (e) { return (e.kana + e.kanji + e.meaning).indexOf(q) >= 0 || (window.wanakana && e.kana.indexOf(window.wanakana.toHiragana(q)) >= 0); }) : d.entries;
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (st.deckPage >= pages) st.deckPage = pages - 1;
    var h = topbar(d.name);
    h += '<main class="page"><section class="panel"><div class="deck-stats">' + ds.total + ' 個單字・已熟記 ' + ds.mastered + '・學習中 ' + ds.learning + '・還沒練 ' + ds.fresh + '</div>' +
      (d.source && d.source !== 'sample' ? '<div class="muted small">來源：' + esc(d.source) + '</div>' : '') +
      '<div class="grid2"><button class="btn primary" data-act="practice-deck">只練這個題庫</button><button class="btn" data-act="cards-deck">單字卡</button>' +
      '<button class="btn" data-act="rename-deck">改名稱</button><button class="btn" data-act="export-deck">匯出 CSV</button>';
    if (B.available()) h += '<button class="btn" data-act="prefetch">下載真人發音</button>';
    h += '<button class="btn danger" data-act="delete-deck">刪除題庫</button></div>';
    if (st.prefetch && st.prefetch.deckId === d.id) {
      var pf = st.prefetch;
      h += '<div class="busy">' + (pf.running ? '下載中 ' : '完成 ') + pf.done + '／' + pf.total + '（有音檔 ' + pf.ok + '、無真人音檔 ' + pf.missing + '、失敗 ' + pf.failed + '）' +
        (pf.running ? ' <button class="btn small" data-act="prefetch-stop">停止</button>' : '') + '</div>';
    }
    h += '</section><section class="panel"><input type="search" id="deck-search" class="text-in" placeholder="搜尋假名、漢字或中文" value="' + esc(st.deckQuery) + '">' +
      '<ul class="wlist">';
    list.slice(st.deckPage * PAGE, st.deckPage * PAGE + PAGE).forEach(function (e) {
      var l = level(e);
      var dots = '';
      for (var i = 0; i < 5; i++) dots += i < Math.max(0, l) ? '●' : '○';
      h += '<li><button class="mini-speak" data-act="speak-id" data-id="' + esc(e.id) + '" aria-label="發音">' + ICON.speakerSm + '</button>' +
        '<div class="wl-main"><div class="wl-hw" lang="ja">' + esc(hwText(e)) + '</div><div class="wl-mean">' + esc(e.meaning || '（沒有中文）') + '</div></div>' +
        '<span class="lvl" title="熟練度">' + (l < 0 ? '新' : dots) + '</span></li>';
    });
    h += '</ul>';
    if (pages > 1) {
      h += '<div class="pager"><button class="btn" data-act="page" data-v="-1"' + (st.deckPage ? '' : ' disabled') + '>‹ 上一頁</button><span>' + (st.deckPage + 1) + '／' + pages + '</span>' +
        '<button class="btn" data-act="page" data-v="1"' + (st.deckPage < pages - 1 ? '' : ' disabled') + '>下一頁 ›</button></div>';
    }
    return h + '</section></main>';
  }

  function startPrefetch() {
    var d = deckById(st.deckId);
    if (!d) return;
    var pf = { deckId: d.id, running: true, done: 0, total: d.entries.length, ok: 0, missing: 0, failed: 0, cancel: false };
    st.prefetch = pf;
    render();
    A.prefetch(d.entries, function (stat) {
      pf.done = stat.done; pf.ok = stat.ok; pf.missing = stat.missing; pf.failed = stat.failed;
      if (st.screen === 'deck' && (stat.done % 5 === 0 || stat.done === pf.total)) render();
    }, function () { return pf.cancel; }).then(function () {
      pf.running = false;
      if (st.screen === 'deck') render();
      toast('真人發音下載完成：有音檔 ' + pf.ok + '、沒有真人音檔 ' + pf.missing + '（會改用系統語音）' + (pf.failed ? '、失敗 ' + pf.failed : ''), 6000);
    });
  }

  // ---------- 設定 ----------
  function viewSettings() {
    var s = data.settings;
    var ts = A.ttsStatus();
    var ttsLine;
    if (ts.ja === 'ok') ttsLine = '系統日文語音：可以使用' + (ts.engine && ts.engine !== 'browser' ? '（' + esc(engineName(ts.engine)) + '）' : ts.voice ? '（' + esc(ts.voice) + '）' : '');
    else if (ts.state === 'init') ttsLine = '系統語音：啟動中…';
    else if (ts.ja === 'unknown') ttsLine = '系統日文語音：檢查中（可以按「測試發音」確認）';
    else if (ts.ja === 'missing_data') ttsLine = '系統日文語音：還沒下載語音資料';
    else ttsLine = '系統日文語音：這台裝置目前沒有';
    var h = topbar('設定');
    h += '<main class="page">' +
      '<section class="panel"><div class="panel-title">字體大小</div>' + seg('fontScale', [['std', '標準'], ['large', '大'], ['xl', '特大']], s.fontScale) + '</section>' +
      '<section class="panel"><div class="panel-title">顯示模式</div>' + themeChoices(s.theme) +
      '<p class="muted small">每台裝置、每個瀏覽器會各自記住自己的選擇：iPhone 用一般彩色、文石用電子紙，互不影響。首頁左上角的半圓圖示可以一鍵切換。</p></section>' +
      '<section class="panel"><div class="panel-title">題型（隨機混合）</div><div class="stack tight">' +
      checkbox('data-act="type" data-v="mc"', s.types.mc, '四選一選擇題（看日文選中文）') +
      checkbox('data-act="type" data-v="fill"', s.types.fill, '填充題（看中文寫讀音）') +
      checkbox('data-act="type" data-v="card"', s.types.card, '單字卡自評（我忘了／好像記得／我記得）') + '</div></section>' +
      '<section class="panel"><div class="panel-title">每回題數</div>' + seg('count', [[10, '10'], [20, '20'], [30, '30'], [50, '50']], s.count) + '</section>' +
      '<section class="panel"><div class="panel-title">填充題輸入方式</div>' + seg('fillInput', [['tiles', '假名按鈕'], ['keyboard', '鍵盤輸入']], s.fillInput) +
      '<p class="muted small">鍵盤輸入可以直接打羅馬拼音（例如 ikidomari），會自動轉成假名。</p></section>' +
      '<section class="panel"><div class="panel-title">發音</div>' +
      '<div class="sub-label">來源</div>' + seg('source', [['auto', '自動'], ['online', '真人優先'], ['tts', '系統語音']], s.source) +
      '<p class="muted small">' + (B.available()
        ? '自動：先找線上真人發音（要連網，聽過或下載過的可離線），找不到再用系統語音。'
        : '自動：先用這台裝置的系統日文語音。網頁版的真人發音無法事先確認有沒有收錄，遇到沒收錄的字可能播出英文提示。') +
      '「出題就唸」只用在選擇題和單字卡，填充題一律答完才唸。</p>' +
      '<div class="sub-label">語速</div>' + seg('rate', [[0.7, '慢'], [0.9, '稍慢'], [1, '正常']], s.rate) +
      '<div class="sub-label">自動發音</div>' + seg('autoplay', [['off', '關閉'], ['after', '答題後'], ['show', '出題就唸']], s.autoplay) +
      '<div class="tts-line">' + ttsLine + '</div>' +
      '<div class="grid2"><button class="btn" data-act="test-voice">測試發音</button>' +
      (B.available() ? '<button class="btn" data-act="tts-settings">系統語音設定</button><button class="btn" data-act="tts-install">安裝日文語音資料</button>' : '') + '</div></section>' +
      '<section class="panel"><div class="panel-title">其他</div>' + checkbox('data-act="toggle-accent"', s.showAccent, '顯示重音數字（⓪①②…）') + '</section>' +
      '<section class="panel"><div class="panel-title">資料</div><div class="grid2">' +
      '<button class="btn" data-act="backup">備份全部資料</button><button class="btn" data-act="open" data-to="import">還原備份</button>' +
      '<button class="btn danger" data-act="reset-progress">清除學習紀錄</button></div>' +
      '<p class="muted small">還原備份：到「匯入單字」選擇備份檔即可。</p></section>' +
      '<p class="muted small about">日文單字測驗 ' + VERSION + '。線上真人發音取自 JapanesePod101 字典音檔（非官方介面，可能隨時失效，失效時自動改用系統語音）。</p>' +
      '</main>';
    return h;
  }
  function engineName(pkg) {
    if (/google/.test(pkg)) return 'Google 文字轉語音';
    if (/samsung/.test(pkg)) return 'Samsung 文字轉語音';
    return pkg;
  }

  // ---------- 繪製 ----------
  var VIEWS = { home: viewHome, quiz: viewQuiz, summary: viewSummary, import: viewImport, preview: viewPreview, deck: viewDeck, settings: viewSettings };
  // 單字頭盡量排成一行：量「假名＋重音」與「[漢字]」兩段的實際寬度，太寬就縮小字級（最小 1.25rem）；
  // 還是放不下時，只會在兩段之間（<wbr>）換行，不會把單字或括號拆開
  function fitHeadwords() {
    var rootFs = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 18;
    Array.prototype.forEach.call(app.querySelectorAll('.hw'), function (el) {
      el.style.fontSize = '';
      var avail = el.parentNode.clientWidth - 6;
      var need = 0;
      Array.prototype.forEach.call(el.children, function (c) { need += c.getBoundingClientRect().width; });
      if (avail > 0 && need > avail) {
        var cur = parseFloat(window.getComputedStyle(el).fontSize);
        el.style.fontSize = Math.max(rootFs * 1.25, Math.floor(cur * avail / need)) + 'px';
      }
    });
  }
  var resizeTimer = null;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitHeadwords, 200); });

  function render() {
    applyLook();
    app.innerHTML = (VIEWS[st.screen] || viewHome)();
    fitHeadwords();
    // 系統字型可能稍後才套用，字寬會改變，再量一次
    setTimeout(fitHeadwords, 80);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHeadwords);
    if (st.screen === 'quiz') {
      var fi = document.getElementById('fill-input');
      if (fi && !st.round.answered) { try { fi.focus(); } catch (e) { /* 無法聚焦 */ } }
    }
  }

  // ---------- 事件 ----------
  app.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!t || t.disabled) return;
    var act = t.getAttribute('data-act');
    if (t.tagName === 'INPUT' || t.tagName === 'LABEL') return;
    handle(act, t, ev);
  });
  app.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'file-input' && t.files && t.files[0]) {
      var f = t.files[0];
      runImport(I.importFile(f, setBusy), f.name);
      return;
    }
    var act = t.getAttribute('data-act');
    if (act === 'toggle-deck') { data.settings.selected[t.getAttribute('data-id')] = t.checked; saveSettings(); render(); }
    else if (act === 'type') {
      data.settings.types[t.getAttribute('data-v')] = t.checked;
      if (!data.settings.types.mc && !data.settings.types.fill && !data.settings.types.card) { data.settings.types[t.getAttribute('data-v')] = true; toast('至少要保留一種題型'); }
      saveSettings(); render();
    }
    else if (act === 'toggle-accent') { data.settings.showAccent = t.checked; saveSettings(); }
  });
  app.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'fill-input' && st.round && st.round.fill) {
      st.round.fill.text = t.value;
      var pv = document.getElementById('fill-preview');
      if (pv) pv.textContent = previewKana(t.value);
    } else if (t.id === 'deck-search') {
      st.deckQuery = t.value; st.deckPage = 0;
      clearTimeout(st.searchTimer);
      st.searchTimer = setTimeout(function () {
        var pos = t.selectionStart;
        render();
        var n = document.getElementById('deck-search');
        if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* 舊版 */ } }
      }, 350);
    }
  });
  app.addEventListener('keydown', function (ev) {
    if (ev.target.id === 'fill-input' && ev.key === 'Enter') { ev.preventDefault(); handle('fill-submit'); }
    if (ev.target.id === 'url-input' && ev.key === 'Enter') { ev.preventDefault(); handle('import-url'); }
  });
  document.addEventListener('keydown', function (ev) {
    if (st.screen !== 'quiz' || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
    var q = curQ(); if (!q) return;
    if (st.round.answered && (ev.key === 'Enter' || ev.key === 'ArrowRight')) { ev.preventDefault(); handle('next'); return; }
    if (q.type === 'mc' && !st.round.answered && /^[1-4]$/.test(ev.key)) { handle('choose', { getAttribute: function () { return String(parseInt(ev.key, 10) - 1); } }); }
    if (ev.key === ' ' && q.type !== 'fill') { ev.preventDefault(); doSpeak(); }
  });

  function handle(act, t) {
    var R = st.round, q, e, v;
    switch (act) {
      case 'back': back(); break;
      case 'home': A.stop(); st.history = []; st.screen = 'home'; render(); break;
      case 'open': go(t.getAttribute('data-to')); break;
      case 'start': startRound(t.getAttribute('data-mode')); break;
      case 'retry':
        var weakIds = {}, pool = [];
        R.results.forEach(function (r) { if (r.result !== 'right') weakIds[r.id] = 1; });
        Object.keys(weakIds).forEach(function (id) { if (R.entries[id]) pool.push(R.entries[id]); });
        startRound(R.mode === 'card' ? 'card' : 'retry', pool);
        break;
      case 'speak': doSpeak(); break;
      case 'speak-id':
        var id = t.getAttribute('data-id'), ent = null;
        allEntries().forEach(function (x) { if (x.id === id) ent = x; });
        if (!ent && R) ent = R.entries[id];
        if (ent) doSpeak(ent);
        break;
      case 'choose':
        if (!R || R.answered) return;
        q = curQ(); v = parseInt(t.getAttribute('data-i'), 10);
        R.choice = v; R.answered = true;
        record(q.options[v] && q.options[v].correct ? 'right' : 'wrong');
        render(); autoSpeakAfter();
        break;
      case 'rate':
        if (!R || R.answered) return;
        v = t.getAttribute('data-v');
        R.rating = v; R.answered = true;
        record(v === 'know' ? 'right' : v === 'fuzzy' ? 'fuzzy' : 'wrong');
        render();
        break;
      case 'tile':
        if (!R || R.answered) return;
        var k = t.getAttribute('data-k');
        R.fill.tiles.forEach(function (tile) { if (tile.k === k && R.fill.built.indexOf(tile) < 0) R.fill.built.push(tile); });
        t.disabled = true;
        updateAnswerBox();
        break;
      case 'tile-back':
        if (R.fill.built.length) { var last = R.fill.built.pop(); var b = app.querySelector('.tile[data-k="' + last.k + '"]'); if (b) b.disabled = false; }
        updateAnswerBox();
        break;
      case 'tile-clear':
        R.fill.built = [];
        Array.prototype.forEach.call(app.querySelectorAll('.tile'), function (b) { b.disabled = false; });
        updateAnswerBox();
        break;
      case 'fill-mode':
        R.fill.kbd = t.getAttribute('data-v') === 'keyboard';
        data.settings.fillInput = R.fill.kbd ? 'keyboard' : 'tiles'; saveSettings();
        render();
        break;
      case 'fill-submit':
        if (!R || R.answered) return;
        e = curE();
        var given = R.fill.kbd ? R.fill.text : R.fill.built.map(function (x) { return x.ch; }).join('');
        var g = Q.gradeFill(given, e);
        if (g.empty) { toast('還沒有輸入答案'); return; }
        R.fill.result = g; R.fill.given = R.fill.kbd ? (given + (previewKana(given) ? '（' + previewKana(given).slice(2) + '）' : '')) : given;
        R.answered = true;
        record(g.correct ? 'right' : 'wrong');
        render(); autoSpeakAfter();
        break;
      case 'next':
        if (!R) return;
        A.stop();
        if (R.i >= R.qs.length - 1) { finishRound(); return; }
        R.i++; resetQuestionState(); render(); window.scrollTo(0, 0); autoSpeakOnShow();
        break;
      case 'import-url':
        var url = ((app.querySelector('#url-input') || {}).value || '').trim();
        if (!url) { toast('請先貼上網址'); return; }
        runImport(I.importUrl(url, setBusy), url);
        break;
      case 'import-paste':
        var txt = (app.querySelector('#paste-input') || {}).value || '';
        if (!txt.trim()) { toast('請先貼上文字'); return; }
        runImport(I.importText(txt), '貼上的單字');
        break;
      case 'confirm-import': confirmImport(); break;
      case 'load-sample': loadSample(); break;
      case 'save-template':
        saveFile('單字匯入範本.csv', 'text/csv', deckCSV(P.fromObjects(SAMPLE.entries.slice(0, 3)).entries));
        break;
      case 'open-deck': st.deckId = t.getAttribute('data-id'); st.deckPage = 0; st.deckQuery = ''; go('deck'); break;
      case 'practice-deck': case 'cards-deck':
        var d = deckById(st.deckId);
        if (d) startRound(act === 'cards-deck' ? 'card' : 'mix', d.entries);
        break;
      case 'rename-deck':
        var d2 = deckById(st.deckId);
        var nn = d2 ? window.prompt('新的題庫名稱', d2.name) : null;
        if (nn && nn.trim()) { d2.name = nn.trim().slice(0, 40); saveDecks(); render(); }
        break;
      case 'delete-deck':
        var d3 = deckById(st.deckId);
        if (d3 && window.confirm('確定要刪除「' + d3.name + '」（' + d3.entries.length + ' 個單字）？')) {
          data.decks = data.decks.filter(function (x) { return x.id !== d3.id; });
          delete data.settings.selected[d3.id];
          saveDecks(); saveSettings();
          st.history = []; st.screen = 'home'; render();
          toast('已刪除題庫');
        }
        break;
      case 'export-deck':
        var d4 = deckById(st.deckId);
        if (d4) saveFile(d4.name + '.csv', 'text/csv', deckCSV(d4.entries));
        break;
      case 'prefetch': startPrefetch(); break;
      case 'prefetch-stop': if (st.prefetch) st.prefetch.cancel = true; break;
      case 'page': st.deckPage += parseInt(t.getAttribute('data-v'), 10); render(); window.scrollTo(0, 0); break;
      case 'set':
        var key = t.getAttribute('data-k'), val = t.getAttribute('data-v');
        if (key === 'count') val = parseInt(val, 10);
        if (key === 'rate') val = parseFloat(val);
        data.settings[key] = val; saveSettings(); render();
        break;
      case 'test-voice':
        doSpeak({ id: 'test', kana: 'いきどまり', kanji: '行き止まり' });
        break;
      case 'tts-settings': B.sync('openTtsSettings', []); break;
      case 'tts-install': B.sync('installTtsData', []); break;
      case 'backup':
        saveFile('日文單字備份-' + stamp() + '.json', 'application/json', JSON.stringify({ app: 'jpquiz', version: 1, exportedAt: new Date().toISOString(), decks: data.decks, progress: data.progress }));
        break;
      case 'set-theme':
        data.settings.theme = t.getAttribute('data-v');
        data.settings.themeChosen = true;
        saveSettings(); render();
        break;
      case 'cycle-theme':
        var order = ['color', 'eink', 'ecolor'];
        var cur = order.indexOf(data.settings.theme);
        data.settings.theme = order[(cur + 1) % order.length];
        data.settings.themeChosen = true;
        saveSettings(); render();
        toast('顯示模式：' + themeName(data.settings.theme));
        break;
      case 'ios-hint-done':
        data.settings.iosHintDone = true; saveSettings(); render();
        break;
      case 'reset-progress':
        if (window.confirm('確定要清除所有學習紀錄嗎？題庫會保留。')) { data.progress = {}; saveProgress(); toast('已清除學習紀錄'); render(); }
        break;
    }
  }

  function updateAnswerBox() {
    var box = document.getElementById('answer-box');
    if (box) box.innerHTML = esc(st.round.fill.built.map(function (x) { return x.ch; }).join('')) + '<span class="caret"></span>';
  }

  // 有外殼時，等語音引擎啟動後若停在設定頁就更新狀態
  window.__ttsReady = function () { if (st.screen === 'settings') render(); };

  // 網頁版（iPhone 加到主畫面）：離線快取與資料保存；Android App 版不需要
  if (!B.available()) {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch(function () { /* 沒有 sw.js 時略過 */ });
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (hadController) toast('已更新到新版本，下次開啟時套用', 5000);
        hadController = true;
      });
    }
    if (navigator.storage && navigator.storage.persist) {
      try { navigator.storage.persist().catch(function () { /* 不支援 */ }); } catch (e) { /* 不支援 */ }
    }
  }

  render();
})();
