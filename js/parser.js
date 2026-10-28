/* 日文單字測驗 — parser.js
 * 把「文字行」或「表格列」辨識成單字條目。
 * 原則：每一行／每一列不是變成單字，就是進「略過清單」並寫明原因，絕不默默丟掉。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.JPParser = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 字元類別 ----------
  var KANA = '\\u3041-\\u3096\\u309D\\u309E\\u30A1-\\u30FA\\u30FC-\\u30FE';
  var KANJI = '\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u3005-\\u3007';
  var ACC_CHARS = '\\u24EA\\u2460-\\u2473\\u24FF\\u2776-\\u277F\\u2780-\\u2793';

  var RE_HAS_KANA = /[ぁ-ゖァ-ヺ]/;
  var RE_HAS_HIRA = /[ぁ-ゖ]/;
  var RE_HAS_KANJI = new RegExp('[' + KANJI + ']');
  var RE_KANA_ONLY = new RegExp('^[～〜~]?[' + KANA + ']+(?:・[' + KANA + ']+)*[～〜~]?$');
  var RE_LATIN = /[A-Za-z]/;
  var RE_ACC_CELL = new RegExp('^(?:[' + ACC_CHARS + ']+(?:\\s*[/／・,，、]\\s*[' + ACC_CHARS + ']+)*|[\\[［(（]?\\s*\\d{1,2}(?:\\s*[/／・,，、]\\s*\\d{1,2})*\\s*[\\]］)）]?)$');

  var KR = '[～〜~]?[' + KANA + ']+(?:・[' + KANA + ']+)*[～〜~]?';
  var ACC = '(?:[' + ACC_CHARS + ']+(?:\\s*[/／・,，、]\\s*[' + ACC_CHARS + ']+)*' +
            '|[\\[［(（]\\s*\\d{1,2}(?:\\s*[/／・,，、]\\s*\\d{1,2})*\\s*[\\]］)）]' +
            '|\\d{1,2}(?!\\d)(?=\\s|[\\[［【〔(（「『]|$))';
  var ACC_STRICT = '(?:[' + ACC_CHARS + ']+(?:\\s*[/／・,，、]\\s*[' + ACC_CHARS + ']+)*' +
            '|[\\[［(（]\\s*\\d{1,2}(?:\\s*[/／・,，、]\\s*\\d{1,2})*\\s*[\\]］)）])';
  var OPEN = '[\\[［【〔「『]';
  var CLOSE = '[\\]］】〕」』]';

  // いきどまり⓪[行き止まり] 死路
  var RE_A = new RegExp('^(' + KR + ')\\s*(' + ACC + ')?\\s*' + OPEN + '\\s*([^\\]］】〕」』]{1,30}?)\\s*' + CLOSE + '\\s*(' + ACC_STRICT + ')?(.*)$');
  // 行き止まり（いきどまり）⓪ 死路
  var RE_B = new RegExp('^([^\\s（(【\\[［〔「『]{1,30}?)\\s*[（(【\\[［〔]\\s*(' + KR + ')\\s*[)）】\\]］〕]\\s*(' + ACC + ')?(.*)$');
  // すっかり③ 完全
  var RE_C = new RegExp('^(' + KR + ')\\s*(' + ACC + ')(.*)$');

  var POS_LIST = ['形容動詞', '形容詞', '連體詞', '連体詞', '接續詞', '接続詞', '感嘆詞', '感動詞', '代名詞', '助動詞',
    '名詞', '動詞', '副詞', '助詞', '數詞', '数詞', '接頭語', '接尾語', '慣用語', '自他動', '自動詞', '他動詞',
    '名・自サ', '名・他サ', '接頭', '接尾', '自動', '他動', '自サ', '他サ', 'サ変', 'い形', 'イ形', 'な形', 'ナ形',
    '形動', '連體', '連体', '接續', '接続', '慣用', '片語', '句型', '動[1-3一二三ⅠⅡⅢ]', '形', '動', '名', '副', '感',
    '代', '數', '数', '助', '自', '他'];
  var POS = '(?:' + POS_LIST.join('|') + ')';
  var RE_POS_BRACKET = new RegExp('^[\\[［(（〔【<＜]\\s*(' + POS + '(?:\\s*[・･/／、,，]\\s*' + POS + ')*)\\s*[\\]］)）〕】>＞]\\s*');
  var RE_POS_PLAIN = new RegExp('^(' + POS + '(?:[・･/／]' + POS + ')*)(?:\\s+|[.．:：]\\s*)');
  var RE_POS_CELL = new RegExp('^[\\[［(（〔【<＜]?\\s*' + POS + '(?:\\s*[・･/／、,，]\\s*' + POS + ')*\\s*[\\]］)）〕】>＞]?$');

  // 台灣繁體專用字（日文不會用）與日文新字體專用字，用來分辨「日文漢字詞」和「中文意思」
  var ZH_ONLY = '這們嗎呢吧從對讓會說樣點將麼與經歷學氣圖國體藝讀賣寫畫錢鐵廣擔處變續實驗雙樂戰傳圓應舊當黨發數斷歲歸關號鹽醫聽雜齒價壓參區觀覺權戀狀獨單團圍兩寶惡輕爭隨覽鄉曉齡壞懷聲邊顯顏讚驛';
  var JA_ONLY = '経歴学気図国体芸読売写画銭鉄広担処変続実験双楽戦伝円応旧当党発数断歳帰関号塩医聴雑歯価圧参区観覚権恋状独単団囲両宝悪軽与争駅様対会説点将譲従随覧郷暁齢壊懐声辺顕顔讃込峠畑働枠匂丼';
  var RE_ZH_ONLY = new RegExp('[' + ZH_ONLY + ']');
  var RE_JA_ONLY = new RegExp('[' + JA_ONLY + ']');
  var RE_ZH_PUNCT = /[；，]/;

  var HEADER_KEYS = [
    ['exampleZh', ['例句中譯', '例句翻譯', '例句中文', '例句意思', '例句譯', '例文訳', '例文の訳', 'exampletranslation', 'sentencetranslation']],
    ['example', ['例句', '例文', 'example', 'sentence']],
    ['accent', ['重音', '音調', '聲調', 'アクセント', 'accent', 'pitch']],
    ['pos', ['詞性', '品詞', '類別', 'partofspeech', 'pos']],
    ['kana', ['平假名', '假名', '讀音', '讀法', '読み方', '読み', 'よみがな', 'ふりがな', '振り仮名', 'よみ', 'かな', '發音', '発音', '注音', 'reading', 'kana', 'furigana']],
    ['meaning', ['中文意思', '中文解釋', '中文', '意思', '解釋', '解释', '字義', '意味', '翻譯', '翻译', '中譯', '釋義', '释义', 'meaning', 'chinese', 'definition', 'translation', 'gloss']],
    ['word', ['單字', '單詞', '单词', '漢字', '汉字', '日文', '日語', '日语', '単語', '語彙', '詞彙', '表記', '見出し', 'word', 'japanese', 'expression', 'vocab', 'term', 'kanji']]
  ];

  // ---------- 小工具 ----------
  function nonEmpty(s) { return s != null && String(s).trim() !== ''; }
  function hasKana(s) { return RE_HAS_KANA.test(s); }
  function hasHira(s) { return RE_HAS_HIRA.test(s); }
  function hasKanji(s) { return RE_HAS_KANJI.test(s); }
  function isKanaOnly(s) { s = String(s || '').replace(/\s+/g, ''); return s.length > 0 && RE_KANA_ONLY.test(s); }
  function isAccentCell(s) { s = String(s || '').trim(); return s.length > 0 && s.length <= 12 && RE_ACC_CELL.test(s); }
  function isPosCell(s) { s = String(s || '').trim(); return s.length > 0 && s.length <= 12 && RE_POS_CELL.test(s); }
  function isSentence(s) {
    s = String(s || '');
    if (!hasKana(s)) return false;
    return /[。！？!?]/.test(s) || (hasHira(s) && s.length >= 16 && /[をがはにでへとも]/.test(s));
  }

  function zhScore(s) {
    s = String(s || '');
    var sc = 0;
    if (hasKana(s)) sc -= 4;
    if (RE_ZH_ONLY.test(s)) sc += 2;
    if (RE_ZH_PUNCT.test(s)) sc += 2;
    if (RE_JA_ONLY.test(s)) sc -= 2;
    if (s.length >= 4) sc += 1;
    if (RE_LATIN.test(s) && !hasKanji(s) && !hasKana(s)) sc += 2;
    return sc;
  }
  function jaScore(s) {
    s = String(s || '');
    var sc = 0;
    if (hasKana(s)) sc += 3;
    if (RE_JA_ONLY.test(s)) sc += 2;
    if (RE_ZH_ONLY.test(s)) sc -= 2;
    if (RE_ZH_PUNCT.test(s)) sc -= 2;
    if (s.length <= 6) sc += 1;
    return sc;
  }

  var ACC_MAP = (function () {
    var m = {};
    m['⓪'] = 0; m['⓿'] = 0;
    var i;
    for (i = 0; i < 20; i++) m[String.fromCharCode(0x2460 + i)] = i + 1;
    for (i = 0; i < 10; i++) {
      m[String.fromCharCode(0x2776 + i)] = i + 1;
      m[String.fromCharCode(0x2780 + i)] = i + 1;
      m[String.fromCharCode(0x278A + i)] = i + 1;
    }
    return m;
  })();

  function parseAccent(s) {
    if (!s) return '';
    var out = [];
    var re = new RegExp('[' + ACC_CHARS + ']|\\d{1,2}', 'g');
    var m;
    while ((m = re.exec(String(s)))) {
      var v = ACC_MAP.hasOwnProperty(m[0]) ? ACC_MAP[m[0]] : parseInt(m[0], 10);
      if (!isNaN(v) && v <= 20 && out.indexOf(v) < 0) out.push(v);
    }
    return out.join(',');
  }

  function decodeEntities(s) {
    return s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  }

  var RE_RADICALS = new RegExp('[\\u2E80-\\u2FDF\\uF900-\\uFAFF]', 'g');
  // 半形片假名轉全形、全形英數字轉半形、清掉零寬字元、Anki 標籤
  function normalizeText(s) {
    s = String(s == null ? '' : s);
    s = s.replace(/[​-‍﻿­]/g, '');
    s = s.replace(/[｡-ﾟ]+/g, function (m) { return m.normalize ? m.normalize('NFKC') : m; });
    // PDF 常把「行」「止」「食」等字輸出成康熙部首碼位（⾏⽌⾷）或相容漢字，轉回一般漢字
    s = s.replace(RE_RADICALS, function (m) { return m.normalize ? m.normalize('NFKC') : m; });
    s = s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    if (/[<&]/.test(s)) {
      s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]{1,200}>/g, '');
      s = decodeEntities(s);
    }
    s = s.replace(/\[sound:[^\]]*\]/g, '');
    s = s.replace(/　/g, '  ').replace(/\r/g, '');
    s = s.replace(/[  ]+$/g, '').replace(/^[  ]+/g, '');
    return convertInlineFurigana(s);
  }

  // 「行[い]き 止[ど]まり」或「行（い）き止（ど）まり」→「行き止まり（いきどまり）」
  var RE_ANKI_FURI = new RegExp('[' + KANJI + ']+\\[[\\u3041-\\u3096\\u30A1-\\u30FA\\u30FC]+\\]');
  var RE_PAREN_FURI = new RegExp('[' + KANJI + ']+[（(][\\u3041-\\u3096\\u30FC]+[)）]');
  function convertInlineFurigana(s) {
    var tokenRe, isAnki = RE_ANKI_FURI.test(s), isParen = RE_PAREN_FURI.test(s);
    if (!isAnki && !isParen) return s;
    if (isAnki) {
      tokenRe = new RegExp('(?:[' + KANA + ']*[' + KANJI + ']+\\[[\\u3041-\\u3096\\u30A1-\\u30FA\\u30FC]+\\][' + KANA + ']*\\s?)+', 'g');
    } else {
      tokenRe = new RegExp('(?:[' + KANA + ']*[' + KANJI + ']+[（(][\\u3041-\\u3096\\u30FC]+[)）][' + KANA + ']*)+', 'g');
    }
    var RE_DONE = new RegExp('^([' + KANA + ']+)[' + KANJI + '][' + KANJI + KANA + ']*[\\[（(]([\\u3041-\\u3096\\u30A1-\\u30FA\\u30FC]+)[\\]）)]$');
    return s.replace(tokenRe, function (tok) {
      var trail = /\s$/.test(tok) ? ' ' : '';
      var t = tok.replace(/\s+/g, '');
      // 已經是「お茶（おちゃ）」這種完整讀音就不再轉換（避免重複處理變成「おおちゃ」）
      var done = t.match(RE_DONE);
      if (done && done[2].indexOf(done[1]) === 0) return tok;
      var base = t.replace(/[\[（(][^\]）)]*[\]）)]/g, '');
      var reading = t.replace(new RegExp('[' + KANJI + ']+[\\[（(]([^\\]）)]*)[\\]）)]', 'g'), '$1');
      if (!base || !reading || base === reading) return tok;
      return base + '（' + reading + '）' + trail;
    });
  }

  function stripLeadingNumber(s) {
    s = s.replace(/^\s*(?:No\.?\s*)?(?:\d{1,4}|[（(]\d{1,4}[)）])\s*[.．、,，:：)）\]］-]\s*(?=\S)/, '');
    s = s.replace(/^\s*\d{1,4}\s+(?=[ぁ-ヿ㐀-鿿～〜])/, '');
    s = s.replace(/^\s*[・•●○■□◆◇▶►▪▫*＊]\s*/, '');
    return s;
  }

  function headerKey(cell) {
    var c = String(cell || '').toLowerCase().replace(/[\s_\-:：()（）]/g, '');
    if (!c || c.length > 14) return null;
    for (var i = 0; i < HEADER_KEYS.length; i++) {
      var keys = HEADER_KEYS[i][1];
      for (var j = 0; j < keys.length; j++) {
        if (c === keys[j] || (c.indexOf(keys[j]) >= 0 && c.length <= keys[j].length + 4)) return HEADER_KEYS[i][0];
      }
    }
    return null;
  }

  function isHeaderLike(cells) {
    var hits = 0, kanaCells = 0;
    for (var i = 0; i < cells.length; i++) {
      if (headerKey(cells[i])) hits++;
      else if (isKanaOnly(cells[i])) kanaCells++;
    }
    return hits >= 2 && kanaCells === 0;
  }

  // ---------- 單字頭（假名／重音／寫法）辨識 ----------
  function matchHead(s) {
    s = String(s || '').trim();
    if (!s) return null;
    var m = s.match(RE_A);
    if (m && (hasKanji(m[3]) || hasKana(m[3])) && !/^\d+$/.test(m[3])) {
      return { kana: m[1], accent: (m[2] || '') + (m[4] || ''), kanji: m[3].trim(), rest: m[5] || '' };
    }
    m = s.match(RE_B);
    if (m && hasKanji(m[1]) && !RE_ZH_PUNCT.test(m[1])) {
      return { kana: m[2], accent: m[3] || '', kanji: m[1].trim(), rest: m[4] || '' };
    }
    m = s.match(RE_C);
    if (m) {
      var rest = m[3] || '';
      if (!/^[ぁ-ヿ]/.test(rest)) return { kana: m[1], accent: m[2], kanji: '', rest: rest };
    }
    return null;
  }

  function cleanMeaning(s) {
    return String(s || '').replace(/^[\s:：=＝→⇒\-–—,，、;；|｜]+/, '').replace(/[\s,，、;；|｜]+$/, '').replace(/\s{2,}/g, ' ').trim();
  }

  // 由「單字頭之後剩下的文字」拆出：重音、詞性、中文意思、例句、例句中譯
  function splitRest(rest, base) {
    var out = { accent: base.accent || '', pos: base.pos || '', meaning: '', example: base.example || '', exampleZh: base.exampleZh || '' };
    rest = String(rest || '').replace(/^[\s:：=＝→⇒\-–—,，、;；|｜]+/, '');
    var am = rest.match(new RegExp('^(' + ACC_STRICT + ')\\s*'));
    if (am && !out.accent) { out.accent = am[1]; rest = rest.slice(am[0].length); }
    var pm = rest.match(RE_POS_BRACKET) || rest.match(RE_POS_PLAIN);
    if (pm && !out.pos) { out.pos = pm[1].replace(/\s+/g, ''); rest = rest.slice(pm[0].length); }
    var am2 = rest.match(new RegExp('^(' + ACC_STRICT + ')\\s*'));
    if (am2 && !out.accent) { out.accent = am2[1]; rest = rest.slice(am2[0].length); }

    var em = rest.match(/(^|\s|[。；;／\/])(?:例句|例文|例)\s*[:：]\s*/);
    if (em) {
      if (!out.example) out.example = rest.slice(em.index + em[0].length).trim();
      rest = rest.slice(0, em.index);
    } else if (hasHira(rest)) {
      var parts = rest.split(/\s+|／/);
      for (var i = 1; i < parts.length; i++) {
        if (hasHira(parts[i]) && (parts[i].length >= 5 || /[。！？]/.test(parts[i]))) {
          if (!out.example) out.example = parts.slice(i).join(' ').trim();
          rest = parts.slice(0, i).join(' ');
          break;
        }
      }
    }
    if (out.example && !out.exampleZh) {
      var zm = out.example.match(/^(.*[。！？!?])\s*([^ぁ-ゖァ-ヺ]{2,})$/);
      if (zm && hasKanji(zm[2])) { out.example = zm[1].trim(); out.exampleZh = zm[2].trim(); }
    }
    out.meaning = cleanMeaning(rest);
    return out;
  }

  function buildEntry(p) {
    var kana = String(p.kana || '').replace(/\s+/g, '').replace(/^[～〜~]+|[～〜~]+$/g, function (m) { return m ? '～' : ''; });
    var kanji = String(p.kanji || '').replace(/\s+/g, '');
    if (kanji === kana) kanji = '';
    if (kana && !isKanaOnly(kana)) return { reason: '讀音欄不是假名' };
    if (kana.length > 24 || kanji.length > 24) return { reason: '單字太長，像是句子' };
    if (!kana && !kanji) return { reason: '沒有日文單字' };
    if (kanji && !hasKanji(kanji) && !isKanaOnly(kanji)) return { reason: '寫法欄不是日文' };
    var r = splitRest(p.rest || '', p);
    var meaning = cleanMeaning(p.meaning != null && p.meaning !== '' ? p.meaning : r.meaning);
    return {
      entry: {
        kana: kana,
        accent: parseAccent(p.accent || r.accent),
        kanji: kanji,
        meaning: meaning,
        pos: (p.pos || r.pos || '').trim(),
        example: (p.example || r.example || '').trim(),
        exampleZh: (p.exampleZh || r.exampleZh || '').trim()
      }
    };
  }

  function skipReason(line) {
    var s = String(line || '');
    if (!hasKana(s) && !hasKanji(s)) return '沒有日文';
    if (isHeaderLike(s.split(/\s+|\t|[|｜]/))) return '標題列';
    if (/[。！？]/.test(s) && hasHira(s)) return '像是句子或文章段落';
    if (s.length > 40) return '太長，像是文章段落';
    if (!hasKana(s)) return '只有漢字、沒有假名，無法判斷是日文單字還是中文';
    return '格式無法辨識';
  }

  // ---------- 一行文字 ----------
  function parseLine(raw) {
    var line = normalizeText(raw).replace(/\t+$/, '');
    if (!nonEmpty(line)) return { blank: true };
    if (/^[-=_*~—–─━\s.。・…]+$/.test(line)) return { blank: true };
    line = stripLeadingNumber(line);
    if (!nonEmpty(line)) return { blank: true };

    if (/\t|[|｜]| {2,}/.test(line)) {
      var cells = line.split(/\s*(?:\t|[|｜]| {2,})\s*/).filter(nonEmpty);
      if (cells.length >= 2) return parseCells(cells, null, line);
      line = cells[0] || line;
    }
    return parseHeadLine(line);
  }

  function parseHeadLine(line) {
    if (line.length > 80 && /[。！？]/.test(line)) return { skip: '像是句子或文章段落' };
    var h = matchHead(line);
    if (h) return wrap(buildEntry(h));

    var sm = line.match(/^(.{1,30}?)\s*(?:[:：=＝→⇒]|\s[-–—]\s)\s*(.+)$/);
    if (sm) {
      var left = sm[1].trim();
      var h2 = matchHead(left) || simpleWord(left);
      if (h2) { h2.rest = (h2.rest || '') + ' ' + sm[2]; return wrap(buildEntry(h2)); }
    }

    var toks = line.split(/\s+/).filter(nonEmpty);
    if (toks.length >= 2) {
      var t0 = toks[0], t1 = toks[1];
      var k0 = isKanaOnly(t0), k1 = isKanaOnly(t1);
      var j0 = hasKanji(t0) && t0.length <= 15 && !RE_ZH_PUNCT.test(t0);
      if (j0 && k1) return wrap(buildEntry({ kanji: t0, kana: t1, rest: toks.slice(2).join(' ') }));
      if (k0) {
        if (toks.length >= 3 && hasKanji(t1) && (hasKana(t1) || jaScore(t1) > zhScore(t1)) && !hasKana(toks[2])) {
          return wrap(buildEntry({ kana: t0, kanji: t1, rest: toks.slice(2).join(' ') }));
        }
        return wrap(buildEntry({ kana: t0, rest: toks.slice(1).join(' ') }));
      }
      if (j0 && hasKana(t0) && !isSentence(t0)) return wrap(buildEntry({ kanji: t0, rest: toks.slice(1).join(' ') }));
      if (j0 && !hasKana(line) && toks.length === 2 && jaScore(t0) - zhScore(t0) >= 2 && zhScore(t1) >= jaScore(t1)) {
        return wrap(buildEntry({ kanji: t0, rest: t1 }));
      }
    } else if (toks.length === 1 && isKanaOnly(toks[0]) && toks[0].length <= 15) {
      return wrap(buildEntry({ kana: toks[0] }));
    }
    return { skip: skipReason(line) };
  }

  function simpleWord(s) {
    s = String(s || '').trim();
    if (!s || /\s/.test(s) || s.length > 24) return null;
    if (isKanaOnly(s)) return { kana: s };
    if (hasKanji(s)) return { kanji: s };
    return null;
  }

  function wrap(res) { return res.entry ? { entry: res.entry } : { skip: res.reason }; }

  // ---------- 一列表格 ----------
  function parseCells(cells, map, rawText) {
    cells = cells.map(function (c) { return normalizeText(c).replace(/\s+/g, ' ').trim(); });
    var text = rawText || cells.filter(nonEmpty).join(' ｜ ');
    if (!cells.some(nonEmpty)) return { blank: true };
    if (isHeaderLike(cells)) return { skip: '標題列', header: true };

    if (map) {
      var g = function (k) { return map[k] != null ? (cells[map[k]] || '') : ''; };
      var p = { kana: g('kana'), kanji: g('word'), accent: g('accent'), meaning: g('meaning'), pos: g('pos'), example: g('example'), exampleZh: g('exampleZh') };
      var headCell = map.head != null ? g('head') : '';
      if (!headCell && p.kanji && !hasKanji(p.kanji) && !isKanaOnly(p.kanji) && matchHead(p.kanji)) headCell = p.kanji;
      if (!headCell && p.kanji && /[（(【\[［]/.test(p.kanji) && matchHead(p.kanji)) headCell = p.kanji;
      if (!headCell && p.kana && !isKanaOnly(p.kana) && matchHead(p.kana)) headCell = p.kana;
      if (headCell) {
        var h = matchHead(headCell);
        // 單字頭欄位裡也可能是沒有括號、沒有重音的普通單字（例如「すっかり」「経歴」）
        if (!h && map.head != null) {
          var plain = headCell.replace(/\s+/g, '');
          if (isKanaOnly(plain) && plain.length <= 24) p.kana = p.kana || plain;
          else if (hasKanji(plain) && plain.length <= 15 && !RE_ZH_PUNCT.test(plain)) p.kanji = p.kanji || plain;
        }
        if (h) {
          var oldWord = p.kanji;
          if (headCell === p.kana || map.head != null || headCell === p.kanji) {
            p.kana = isKanaOnly(p.kana) ? p.kana : h.kana;
            p.kanji = h.kanji || (headCell === p.kanji ? '' : p.kanji);
          }
          // 寫法欄原本的內容被單字頭取代時，若它不是同一個詞，就當作中文意思（例如 PDF 表格少一格造成欄位位移）
          if (oldWord && oldWord !== headCell && oldWord !== p.kanji && !p.meaning) p.meaning = oldWord;
          p.accent = p.accent || h.accent;
          if (!p.meaning && h.rest) p.rest = h.rest;
          else if (p.meaning && h.rest) {
            // 單字頭那格後面還有字（例如 CSV 把「死路,死巷」拆成兩格）→ 和意思欄合併
            var extra = splitRest(h.rest, {});
            if (extra.meaning && p.meaning.indexOf(extra.meaning) < 0) p.meaning = extra.meaning + '，' + p.meaning;
            if (!p.pos && extra.pos) p.pos = extra.pos;
            if (!p.accent && extra.accent) p.accent = extra.accent;
          }
        }
      }
      // 寫法欄看起來是中文、意思欄又是空的 → 多半是表格少一格，把它當中文意思
      if (p.kanji && !p.meaning && !hasKana(p.kanji) && (RE_ZH_PUNCT.test(p.kanji) || zhScore(p.kanji) - jaScore(p.kanji) >= 3)) {
        p.meaning = p.kanji; p.kanji = '';
      }
      if (p.kana && !isKanaOnly(p.kana)) {
        if (isAccentCell(p.kana)) { p.accent = p.accent || p.kana; p.kana = ''; }
        else return { skip: '讀音欄不是假名', text: text };
      }
      if (!p.kana && !p.kanji) return { skip: skipReason(text), text: text };
      if (p.kanji && !hasKanji(p.kanji) && !isKanaOnly(p.kanji)) {
        if (!p.meaning) { p.meaning = p.kanji; p.kanji = ''; }
      }
      return wrap(buildEntry(p));
    }

    // 沒有欄位對照：逐格判斷
    var used = {}, i;
    var res = { kana: '', kanji: '', accent: '', pos: '', meaning: '', example: '', exampleZh: '', rest: '' };
    for (i = 0; i < cells.length; i++) {
      if (!cells[i]) continue;
      var h1 = matchHead(cells[i]);
      if (h1 && (h1.kanji || h1.accent)) {
        res.kana = h1.kana; res.kanji = h1.kanji; res.accent = h1.accent; res.rest = h1.rest; used[i] = 1; break;
      }
    }
    if (!res.kana) {
      for (i = 0; i < cells.length; i++) if (!used[i] && isKanaOnly(cells[i]) && cells[i].length <= 24) { res.kana = cells[i]; used[i] = 1; break; }
    }
    for (i = 0; i < cells.length; i++) if (!used[i] && !res.accent && isAccentCell(cells[i])) { res.accent = cells[i]; used[i] = 1; }
    for (i = 0; i < cells.length; i++) if (!used[i] && !res.pos && isPosCell(cells[i])) { res.pos = cells[i].replace(/[\[\]［］()（）〔〕【】<>＜＞\s]/g, ''); used[i] = 1; }
    for (i = 0; i < cells.length; i++) if (!used[i] && isSentence(cells[i])) {
      if (!res.example) res.example = cells[i]; else if (!res.exampleZh) res.exampleZh = cells[i];
      used[i] = 1;
    }
    var rest = [];
    for (i = 0; i < cells.length; i++) if (!used[i] && cells[i]) rest.push(i);
    if (!res.kanji) {
      var cands = rest.filter(function (ix) { var v = cells[ix]; return hasKanji(v) && v.length <= 15 && !/\s/.test(v); });
      var pickIx = -1;
      for (var q = 0; q < cands.length; q++) {
        var c = cells[cands[q]];
        var bh = matchHead(c);
        if (bh && bh.kanji && !res.kana) { res.kana = bh.kana; res.kanji = bh.kanji; res.accent = res.accent || bh.accent; rest.splice(rest.indexOf(cands[q]), 1); pickIx = -2; break; }
        // 漢字＋送假名 → 一定是日文寫法；含日文新字體 → 很可能是日文寫法
        if (hasKana(c) || jaScore(c) - zhScore(c) >= 2) { pickIx = cands[q]; break; }
        // 已有假名、又有兩個以上漢字欄 → 第一個是寫法、後面是中文
        if (res.kana && cands.length >= 2 && q === 0) { pickIx = cands[q]; break; }
      }
      if (pickIx >= 0) { res.kanji = cells[pickIx]; rest.splice(rest.indexOf(pickIx), 1); }
    }
    if (rest.length) {
      res.meaning = cells[rest[0]];
      if (rest.length > 1 && !res.exampleZh && res.example) res.exampleZh = cells[rest[1]];
    }
    if (!res.kana && !res.kanji) return { skip: skipReason(text), text: text };
    if (res.meaning && hasKana(res.meaning) && !res.rest) { res.rest = res.meaning; res.meaning = ''; }
    return wrap(buildEntry(res));
  }

  // ---------- 整張表的欄位推斷 ----------
  function detectHeader(rows) {
    for (var i = 0; i < Math.min(rows.length, 6); i++) {
      var row = rows[i];
      if (!isHeaderLike(row)) continue;
      var map = {};
      for (var j = 0; j < row.length; j++) {
        var k = headerKey(row[j]);
        if (k && map[k] == null) map[k] = j;
      }
      if (map.kana == null && map.word == null) continue;
      return { index: i, map: map };
    }
    return null;
  }

  function inferColumns(rows) {
    var ncol = 0, j;
    rows.forEach(function (r) { if (r.length > ncol) ncol = r.length; });
    var st = [];
    for (j = 0; j < ncol; j++) {
      var vals = rows.map(function (r) { return (r[j] || '').trim(); }).filter(nonEmpty).slice(0, 300);
      var n = vals.length || 1;
      var s = { j: j, n: vals.length, kanaOnly: 0, head: 0, accent: 0, pos: 0, kanjiOnly: 0, mixed: 0, sentence: 0, latin: 0, num: 0, zh: 0, ja: 0, len: 0 };
      vals.forEach(function (v) {
        if (isKanaOnly(v)) s.kanaOnly++;
        var h = matchHead(v); if (h && (h.kanji || h.accent)) s.head++;
        if (isAccentCell(v)) s.accent++;
        if (isPosCell(v)) s.pos++;
        if (hasKanji(v) && !hasKana(v)) s.kanjiOnly++;
        if (hasKanji(v) && hasKana(v) && !isSentence(v)) s.mixed++;
        if (isSentence(v)) s.sentence++;
        if (RE_LATIN.test(v) && !hasKanji(v) && !hasKana(v)) s.latin++;
        if (/^\d+$/.test(v)) s.num++;
        s.zh += zhScore(v); s.ja += jaScore(v); s.len += v.length;
      });
      ['kanaOnly', 'head', 'accent', 'pos', 'kanjiOnly', 'mixed', 'sentence', 'latin', 'num', 'zh', 'ja', 'len'].forEach(function (k) { s[k] = s[k] / n; });
      st.push(s);
    }
    var live = st.filter(function (s) { return s.n > 0 && s.num < 0.8; });
    var taken = {};
    function best(key, min, filter) {
      var b = null;
      live.forEach(function (s) {
        if (taken[s.j] || s[key] < min || (filter && !filter(s))) return;
        if (!b || s[key] > b[key]) b = s;
      });
      if (b) taken[b.j] = 1;
      return b ? b.j : null;
    }
    var map = {};
    map.accent = best('accent', 0.6, function (s) { return s.kanaOnly < 0.5; });
    map.pos = best('pos', 0.6);
    map.head = best('head', 0.5);
    map.kana = best('kanaOnly', 0.5);
    map.example = best('sentence', 0.5);
    var remaining = live.filter(function (s) { return !taken[s.j]; }).sort(function (a, b) { return a.j - b.j; });

    if (map.head == null) {
      var kanjiCols = remaining.filter(function (s) { return s.kanjiOnly + s.mixed >= 0.5; });
      var wordCol = null;
      if (kanjiCols.length >= 2) {
        wordCol = kanjiCols.slice().sort(function (a, b) {
          var sa = a.mixed * 3 + a.ja - a.zh, sb = b.mixed * 3 + b.ja - b.zh;
          return sb - sa || a.j - b.j;
        })[0];
      } else if (kanjiCols.length === 1) {
        var c = kanjiCols[0];
        if (c.mixed >= 0.3 || c.ja > c.zh + 0.5 || (map.kana == null && remaining.length >= 2 && c.j === remaining[0].j)) wordCol = c;
      }
      if (wordCol) { map.word = wordCol.j; taken[wordCol.j] = 1; }
    }
    remaining = remaining.filter(function (s) { return !taken[s.j]; });
    if (remaining.length) {
      var mean = remaining.slice().sort(function (a, b) {
        var sa = a.zh - a.ja + a.latin * 2, sb = b.zh - b.ja + b.latin * 2;
        return sb - sa || a.j - b.j;
      })[0];
      map.meaning = mean.j; taken[mean.j] = 1;
    }
    if (map.example != null) {
      var after = st[map.example + 1];
      if (after && !taken[after.j] && after.n > 0 && after.zh > after.ja) map.exampleZh = after.j;
    }
    Object.keys(map).forEach(function (k) { if (map[k] == null) delete map[k]; });
    return map;
  }

  // ---------- 對外：解析整份文件 ----------
  // blocks: [{type:'lines', lines:[...], label}, {type:'table', rows:[[...]], label}]
  // opts.dropped: [{text, reason}] 由匯入器先行排除的內容（例如 PDF 小字），一併列入稽核
  function parseBlocks(blocks, opts) {
    opts = opts || {};
    var audit = { units: 0, recognized: 0, skipped: [], dupMerged: 0, noMeaning: 0, noReading: 0, sentences: 0, headers: 0 };
    var entries = [], index = {};

    function addSkip(text, reason, where) {
      if (reason === '標題列') audit.headers++;
      if (/句子|文章/.test(reason)) audit.sentences++;
      audit.skipped.push({ text: String(text).slice(0, 160), reason: reason, where: where || '' });
    }
    function addEntry(e) {
      var key = e.kana + '|' + e.kanji;
      if (index.hasOwnProperty(key)) {
        var old = entries[index[key]];
        if (e.meaning && old.meaning.indexOf(e.meaning) < 0) old.meaning = old.meaning ? old.meaning + '；' + e.meaning : e.meaning;
        if (!old.accent && e.accent) old.accent = e.accent;
        if (!old.pos && e.pos) old.pos = e.pos;
        if (!old.example && e.example) { old.example = e.example; old.exampleZh = e.exampleZh; }
        audit.dupMerged++;
        return;
      }
      e.id = entryId(e);
      index[key] = entries.length;
      entries.push(e);
    }
    function handle(res, text, where) {
      if (res.blank) return;
      audit.units++;
      if (res.entry) { audit.recognized++; addEntry(res.entry); }
      else addSkip(res.text || text, res.skip || '格式無法辨識', where);
    }

    (opts.dropped || []).forEach(function (d) { audit.units++; addSkip(d.text, d.reason, d.where); });

    blocks.forEach(function (b) {
      if (b.type === 'table') {
        var rows = (b.rows || []).map(function (r) { return (r || []).map(function (c) { return normalizeText(c == null ? '' : String(c)).replace(/\s+/g, ' ').trim(); }); })
          .filter(function (r) { return r.some(nonEmpty); });
        if (!rows.length) return;
        var hd = detectHeader(rows), map, start = 0;
        if (hd) {
          map = hd.map; start = hd.index + 1;
          for (var i = 0; i < hd.index; i++) { audit.units++; addSkip(rows[i].filter(nonEmpty).join(' ｜ '), '表格標題或說明', b.label); }
          audit.units++; addSkip(rows[hd.index].filter(nonEmpty).join(' ｜ '), '標題列', b.label);
        } else {
          map = inferColumns(rows);
        }
        var useMap = (map.kana != null || map.word != null || map.head != null) ? map : null;
        for (var r = start; r < rows.length; r++) {
          var row = rows[r];
          var text = row.filter(nonEmpty).join(' ｜ ');
          if (row.filter(nonEmpty).length === 1) { handle(parseLine(row.filter(nonEmpty)[0]), text, b.label); continue; }
          handle(parseCells(row, useMap, text), text, b.label);
        }
      } else {
        var lines = b.lines || [];
        var tabLines = lines.filter(function (l) { return /\S\t+\S/.test(l); }).length;
        var nonBlank = lines.filter(nonEmpty).length;
        if (nonBlank >= 4 && tabLines / nonBlank >= 0.6) {
          var rows2 = lines.filter(nonEmpty).map(function (l) { return l.split(/\t+/); });
          var tmp = parseBlocks([{ type: 'table', rows: rows2, label: b.label }], {});
          audit.units += tmp.audit.units; audit.recognized += tmp.audit.recognized;
          audit.headers += tmp.audit.headers; audit.sentences += tmp.audit.sentences;
          tmp.audit.skipped.forEach(function (s) { audit.skipped.push(s); });
          audit.dupMerged += tmp.audit.dupMerged;
          tmp.entries.forEach(function (e) { delete e.id; addEntry(e); });
          return;
        }
        lines.forEach(function (l) { handle(parseLine(l), normalizeText(l).trim(), b.label); });
      }
    });

    entries.forEach(function (e) {
      if (!e.meaning) audit.noMeaning++;
      if (!e.kana) audit.noReading++;
    });
    audit.entries = entries.length;
    audit.looksLikeArticle = audit.units >= 5 && entries.length / audit.units < 0.3 && audit.sentences >= audit.units * 0.3;
    return { entries: entries, audit: audit };
  }

  // 結構化資料（JSON 物件陣列）
  var FIELD_ALIASES = {
    kana: ['kana', 'reading', 'yomi', 'furigana', '假名', '讀音', '平假名', 'よみ', '読み', 'かな'],
    kanji: ['kanji', 'word', 'expression', 'term', 'japanese', '漢字', '單字', '日文', '単語', '表記'],
    accent: ['accent', 'pitch', '重音', 'アクセント'],
    meaning: ['meaning', 'chinese', 'zh', 'definition', 'translation', '中文', '意思', '解釋', '意味'],
    pos: ['pos', 'partOfSpeech', '詞性', '品詞'],
    example: ['example', 'sentence', '例句', '例文'],
    exampleZh: ['exampleZh', 'exampleTranslation', 'sentenceTranslation', '例句中譯', '例句翻譯']
  };
  function fromObjects(list) {
    var rows = [];
    var header = ['kana', 'kanji', 'accent', 'meaning', 'pos', 'example', 'exampleZh'];
    list.forEach(function (o) {
      if (!o || typeof o !== 'object') { rows.push(null); return; }
      var row = header.map(function (f) {
        var keys = FIELD_ALIASES[f];
        for (var i = 0; i < keys.length; i++) if (o[keys[i]] != null && o[keys[i]] !== '') return String(o[keys[i]]);
        return '';
      });
      rows.push(row);
    });
    var audit = { units: 0, recognized: 0, skipped: [], dupMerged: 0, noMeaning: 0, noReading: 0, sentences: 0, headers: 0 };
    var entries = [], index = {};
    rows.forEach(function (row, i) {
      audit.units++;
      if (!row) { audit.skipped.push({ text: JSON.stringify(list[i]).slice(0, 160), reason: '不是單字物件', where: '' }); return; }
      var kana = normalizeText(row[0]).trim(), kanji = normalizeText(row[1]).trim();
      var hk = !isKanaOnly(kana) && matchHead(kana || kanji);
      if (hk) { kana = hk.kana; kanji = hk.kanji || (kanji !== (row[0] || '') ? kanji : ''); }
      var res = buildEntry({ kana: kana, kanji: kanji, accent: row[2], meaning: normalizeText(row[3]).trim(), pos: row[4], example: row[5], exampleZh: row[6] });
      if (!res.entry) { audit.skipped.push({ text: JSON.stringify(list[i]).slice(0, 160), reason: res.reason, where: '' }); return; }
      audit.recognized++;
      var key = res.entry.kana + '|' + res.entry.kanji;
      if (index.hasOwnProperty(key)) { audit.dupMerged++; return; }
      res.entry.id = entryId(res.entry);
      index[key] = entries.length;
      entries.push(res.entry);
    });
    entries.forEach(function (e) { if (!e.meaning) audit.noMeaning++; if (!e.kana) audit.noReading++; });
    audit.entries = entries.length;
    audit.looksLikeArticle = false;
    return { entries: entries, audit: audit };
  }

  function entryId(e) {
    var s = (e.kana || '') + '|' + (e.kanji || '');
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul ? Math.imul(h, 0x01000193) : (h * 0x01000193) | 0; }
    return 'w' + (h >>> 0).toString(36);
  }

  return {
    parseBlocks: parseBlocks,
    parseLine: parseLine,
    fromObjects: fromObjects,
    matchHead: matchHead,
    parseAccent: parseAccent,
    normalizeText: normalizeText,
    isKanaOnly: isKanaOnly,
    hasKana: hasKana,
    hasKanji: hasKanji,
    entryId: entryId,
    _inferColumns: inferColumns
  };
});
