/* 日文單字測驗 — importer.js
 * 任一檔案／網址 → 文字行與表格（blocks），再交給 parser.js 辨識
 * 支援：TXT、CSV、TSV、JSON、HTML、XLSX、XLS、ODS、DOCX、ODT、PPTX、EPUB、PDF、網址（含 Google 試算表／文件／雲端硬碟）
 */
(function (root) {
  'use strict';

  var LIB = {
    jszip: 'lib/jszip.min.js',
    xlsx: 'lib/xlsx.full.min.js',
    pdf: 'lib/pdf.min.js',
    pdfWorker: 'lib/pdf.worker.min.js',
    cmaps: 'lib/cmaps.json'
  };
  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { delete loaded[src]; reject(new Error('無法載入元件：' + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  function friendlyError(msg, code) { var e = new Error(msg); e.friendly = true; e.code = code || ''; return e; }

  function extOf(name) { var m = /\.([a-z0-9]{1,5})(?:$|[?#])/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function baseName(name) { return String(name || '').replace(/^.*[\\\/]/, '').replace(/\.[a-z0-9]{1,5}$/i, '').trim(); }
  function startsWith(u8, arr) { for (var i = 0; i < arr.length; i++) if (u8[i] !== arr[i]) return false; return true; }

  // ---------- 文字編碼偵測 ----------
  function decodeText(u8) {
    var TD = root.TextDecoder;
    if (startsWith(u8, [0xEF, 0xBB, 0xBF])) return new TD('utf-8').decode(u8.subarray(3));
    if (startsWith(u8, [0xFF, 0xFE])) return new TD('utf-16le').decode(u8.subarray(2));
    if (startsWith(u8, [0xFE, 0xFF])) return new TD('utf-16be').decode(u8.subarray(2));
    var n = Math.min(u8.length, 4000), zo = 0, ze = 0, i;
    for (i = 0; i < n; i++) if (u8[i] === 0) { if (i % 2) zo++; else ze++; }
    if (zo > n * 0.2) return new TD('utf-16le').decode(u8);
    if (ze > n * 0.2) return new TD('utf-16be').decode(u8);
    try { return new TD('utf-8', { fatal: true }).decode(u8); } catch (e) { /* 不是 UTF-8 */ }
    var best = null;
    ['big5', 'shift_jis', 'euc-jp', 'gb18030'].forEach(function (enc) {
      try {
        var t = new TD(enc).decode(u8);
        var bad = (t.match(/�/g) || []).length;
        var kana = (t.match(/[ぁ-ゖァ-ヺ]/g) || []).length;
        var half = (t.match(/[｡-ﾟ]/g) || []).length;
        var score = -bad * 10 - half * 3 + kana * 2;
        if (!best || score > best.score) best = { enc: enc, text: t, score: score };
      } catch (e) { /* 這個環境不支援此編碼 */ }
    });
    return best ? best.text : new TD('utf-8').decode(u8);
  }

  // ---------- CSV ----------
  function parseCSV(text, delim) {
    var rows = [], row = [], cell = '', q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text.charAt(i);
      if (q) {
        if (c === '"') { if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === '') { q = true; }
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function guessDelimiter(text) {
    var lines = text.split('\n').slice(0, 30).filter(function (l) { return l.trim(); });
    var best = ',', bestScore = -1;
    ['\t', ',', ';', '|'].forEach(function (d) {
      var counts = lines.map(function (l) { return l.split(d).length - 1; });
      var withD = counts.filter(function (x) { return x > 0; }).length;
      if (withD > bestScore) { bestScore = withD; best = d; }
    });
    return best;
  }

  // 沒有副檔名時（部分檔案管理程式不提供檔名），用「每行逗號數一致」判斷是不是 CSV
  function looksLikeCSV(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 50);
    if (lines.length < 3 || lines.some(function (l) { return l.indexOf('\t') >= 0; })) return false;
    var counts = {};
    lines.forEach(function (l) { var c = (l.match(/,/g) || []).length; counts[c] = (counts[c] || 0) + 1; });
    var best = 0, bestC = 0;
    Object.keys(counts).forEach(function (c) { if (counts[c] > best) { best = counts[c]; bestC = +c; } });
    return bestC >= 1 && best / lines.length >= 0.8;
  }

  // ---------- XML／HTML 文字（含注音假名 ruby） ----------
  var BLOCK_TAGS = /^(p|div|li|ul|ol|h[1-6]|dt|dd|dl|tr|section|article|header|footer|blockquote|pre|table|caption|br|hr|figure|figcaption|main|aside|nav|summary|details)$/i;

  function rubyText(el) {
    var base = '', rt = '';
    for (var n = el.firstChild; n; n = n.nextSibling) {
      var name = (n.localName || '').toLowerCase();
      if (name === 'rt') rt += n.textContent;
      else if (name === 'rp') continue;
      else base += n.textContent;
    }
    base = base.trim(); rt = rt.trim();
    return rt && base ? base + '（' + rt + '）' : base;
  }

  function htmlToBlocks(doc, label) {
    var blocks = [], lines = [], buf = '';
    function flushLine() { if (buf.trim()) lines.push(buf); buf = ''; }
    function flushLines() { flushLine(); if (lines.length) { blocks.push({ type: 'lines', lines: lines, label: label }); lines = []; } }
    function cellText(td) {
      var out = '';
      (function walk(n) {
        for (var c = n.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) out += c.nodeValue;
          else if (c.nodeType === 1) {
            var t = c.localName.toLowerCase();
            if (t === 'ruby') out += rubyText(c);
            else if (t === 'br') out += ' ';
            else if (t !== 'script' && t !== 'style') walk(c);
          }
        }
      })(td);
      return out.replace(/\s+/g, ' ').trim();
    }
    function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { buf += c.nodeValue.replace(/\s+/g, ' '); continue; }
        if (c.nodeType !== 1) continue;
        var t = (c.localName || '').toLowerCase();
        if (/^(script|style|noscript|template|svg|head|button|select|input|textarea|iframe)$/.test(t)) continue;
        if (t === 'ruby') { buf += rubyText(c); continue; }
        if (t === 'table') {
          flushLines();
          var rows = [];
          var trs = c.querySelectorAll ? c.querySelectorAll('tr') : [];
          for (var i = 0; i < trs.length; i++) {
            var tr = trs[i];
            var owner = tr.parentNode;
            while (owner && (owner.localName || '').toLowerCase() !== 'table') owner = owner.parentNode;
            if (owner !== c) continue;
            var cells = [];
            for (var td = tr.firstChild; td; td = td.nextSibling) {
              var tn = (td.localName || '').toLowerCase();
              if (tn === 'td' || tn === 'th') cells.push(cellText(td));
            }
            if (cells.length) rows.push(cells);
          }
          if (rows.length) blocks.push({ type: 'table', rows: rows, label: label });
          continue;
        }
        if (t === 'br') { flushLine(); continue; }
        var isBlock = BLOCK_TAGS.test(t);
        if (isBlock) flushLine();
        walk(c);
        if (isBlock) flushLine();
      }
    }
    walk(doc.body || doc.documentElement);
    flushLines();
    return blocks;
  }

  function parseHTMLString(text, label) {
    var doc = new DOMParser().parseFromString(text, 'text/html');
    var title = doc.querySelector('title') ? doc.querySelector('title').textContent.trim() : '';
    return { blocks: htmlToBlocks(doc, label), title: title };
  }

  // ---------- Office Open XML／ODF ----------
  function xmlDoc(text) { return new DOMParser().parseFromString(text, 'application/xml'); }
  function lname(n) { return n.localName || (n.nodeName || '').replace(/^.*:/, ''); }
  function childrenByName(el, name) { var out = []; for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && lname(c) === name) out.push(c); return out; }
  function descByName(el, name) { var out = []; (function w(n) { for (var c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) { if (lname(c) === name) out.push(c); w(c); } })(el); return out; }

  function docxParagraphText(p) {
    var out = '';
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        var t = lname(c);
        if (t === 't') out += c.textContent;
        else if (t === 'tab') out += '\t';
        else if (t === 'br' || t === 'cr') out += ' ';
        else if (t === 'ruby') {
          var rt = descByName(c, 'rt')[0], rb = descByName(c, 'rubyBase')[0];
          var rts = rt ? descByName(rt, 't').map(function (x) { return x.textContent; }).join('') : '';
          var rbs = rb ? descByName(rb, 't').map(function (x) { return x.textContent; }).join('') : '';
          out += rts && rbs ? rbs + '（' + rts + '）' : rbs;
        }
        else if (t === 'delText' || t === 'instrText' || t === 'rPr' || t === 'pPr') continue;
        else walk(c);
      }
    })(p);
    return out;
  }

  function docxToBlocks(xml, label) {
    var doc = xmlDoc(xml);
    var body = descByName(doc.documentElement, 'body')[0];
    if (!body) return [];
    var blocks = [], lines = [];
    function flush() { if (lines.length) { blocks.push({ type: 'lines', lines: lines, label: label }); lines = []; } }
    (function walk(container) {
      for (var c = container.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        var t = lname(c);
        if (t === 'p') { var s = docxParagraphText(c); if (s.trim()) lines.push(s); }
        else if (t === 'tbl') {
          flush();
          var rows = childrenByName(c, 'tr').map(function (tr) {
            return childrenByName(tr, 'tc').map(function (tc) {
              return descByName(tc, 'p').map(docxParagraphText).join(' ').replace(/\s+/g, ' ').trim();
            });
          });
          if (rows.length) blocks.push({ type: 'table', rows: rows, label: label });
        }
        else if (t === 'sdt' || t === 'sdtContent' || t === 'customXml') walk(c);
      }
    })(body);
    flush();
    return blocks;
  }

  function odtToBlocks(xml, label) {
    var doc = xmlDoc(xml);
    var blocks = [], lines = [];
    function flush() { if (lines.length) { blocks.push({ type: 'lines', lines: lines, label: label }); lines = []; } }
    function ptext(p) {
      var out = '';
      (function walk(n) {
        for (var c = n.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) out += c.nodeValue;
          else if (c.nodeType === 1) {
            var t = lname(c);
            if (t === 'tab') out += '\t';
            else if (t === 's') out += ' ';
            else if (t === 'line-break') out += ' ';
            else if (t === 'ruby') {
              var b = descByName(c, 'ruby-base')[0], r = descByName(c, 'ruby-text')[0];
              out += (b ? b.textContent : '') + (r && r.textContent ? '（' + r.textContent + '）' : '');
            }
            else walk(c);
          }
        }
      })(p);
      return out;
    }
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        var t = lname(c);
        if (t === 'p' || t === 'h') { var s = ptext(c); if (s.trim()) lines.push(s); }
        else if (t === 'table') {
          flush();
          var rows = descByName(c, 'table-row').map(function (tr) {
            return childrenByName(tr, 'table-cell').map(function (td) { return descByName(td, 'p').map(ptext).join(' ').trim(); });
          });
          if (rows.length) blocks.push({ type: 'table', rows: rows, label: label });
        }
        else walk(c);
      }
    })(doc.documentElement);
    flush();
    return blocks;
  }

  function pptxSlideBlocks(xml, label) {
    var doc = xmlDoc(xml);
    var blocks = [], lines = [];
    descByName(doc.documentElement, 'tbl').forEach(function (tbl) {
      var rows = descByName(tbl, 'tr').map(function (tr) {
        return childrenByName(tr, 'tc').map(function (tc) { return descByName(tc, 't').map(function (x) { return x.textContent; }).join(''); });
      });
      if (rows.length) blocks.push({ type: 'table', rows: rows, label: label });
      tbl.parentNode.removeChild(tbl);
    });
    descByName(doc.documentElement, 'p').forEach(function (p) {
      var s = descByName(p, 't').map(function (x) { return x.textContent; }).join('');
      if (s.trim()) lines.push(s);
    });
    if (lines.length) blocks.unshift({ type: 'lines', lines: lines, label: label });
    return blocks;
  }

  function numSort(a, b) { return (parseInt((a.match(/(\d+)/) || [0, 0])[1], 10)) - (parseInt((b.match(/(\d+)/) || [0, 0])[1], 10)); }

  function zipFormat(zip, ext) {
    if (zip.file('word/document.xml')) return 'docx';
    if (zip.file('xl/workbook.xml') || zip.file('xl/workbook.bin')) return 'xlsx';
    if (zip.file('ppt/presentation.xml')) return 'pptx';
    if (zip.file('META-INF/container.xml')) return 'epub';
    if (zip.file('content.xml')) return (ext === 'ods' ? 'ods' : (ext === 'odp' ? 'odp' : 'odt'));
    if (zip.file('collection.anki2') || zip.file('collection.anki21') || zip.file('collection.anki21b')) return 'anki';
    return 'zip';
  }

  function sheetBlocks(u8) {
    var X = root.XLSX;
    var wb = X.read(u8, { type: 'array', cellHTML: false, cellFormula: false, cellDates: false });
    return wb.SheetNames.map(function (sn) {
      var ws = wb.Sheets[sn];
      var rows = X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
      return { type: 'table', rows: rows.map(function (r) { return r.map(function (c) { return c == null ? '' : String(c); }); }), label: '工作表「' + sn + '」' };
    }).filter(function (b) { return b.rows.length; });
  }

  // ---------- PDF ----------
  // PDF 中日文字碼表（169 個 .bcmap）打包成單一 cmaps.json，用到時才下載，方便放上 GitHub 與離線快取
  var cmapPack = null;
  function loadCmapPack() {
    if (!cmapPack) {
      cmapPack = fetch(LIB.cmaps).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      cmapPack.catch(function () { cmapPack = null; });
    }
    return cmapPack;
  }
  function PackedCMapReaderFactory() { this.isCompressed = true; }
  PackedCMapReaderFactory.prototype.fetch = function (ref) {
    var name = ref && ref.name;
    return loadCmapPack().then(function (pack) {
      if (!name || !pack[name]) throw new Error('找不到 PDF 字碼表：' + name);
      var bin = (root.pdfjsLib && root.pdfjsLib.CMapCompressionType) ? root.pdfjsLib.CMapCompressionType.BINARY : 1;
      return { cMapData: b64ToU8(pack[name]), compressionType: bin };
    });
  };

  function pdfBlocks(u8, onProgress) {
    return loadScript(LIB.pdf).then(function () { return loadScript(LIB.pdfWorker); }).then(function () {
      var pdfjs = root.pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = LIB.pdfWorker;
      return pdfjs.getDocument({ data: u8, CMapReaderFactory: PackedCMapReaderFactory, cMapPacked: true, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    }).then(function (pdf) {
      var blocks = [], dropped = [], p = 1;
      function next() {
        if (p > pdf.numPages) return Promise.resolve({ blocks: blocks, dropped: dropped, pages: pdf.numPages });
        if (onProgress) onProgress('讀取 PDF 第 ' + p + '／' + pdf.numPages + ' 頁…');
        var pageNo = p;
        return pdf.getPage(pageNo).then(function (page) { return page.getTextContent(); }).then(function (tc) {
          var res = pdfLines(tc.items);
          if (res.lines.length) blocks.push({ type: 'lines', lines: res.lines, label: '第 ' + pageNo + ' 頁' });
          res.small.forEach(function (s) { dropped.push({ text: s, reason: '小字（可能是注音假名或頁碼註腳）', where: '第 ' + pageNo + ' 頁' }); });
          p++;
          return new Promise(function (r) { setTimeout(r, 0); }).then(next);
        });
      }
      return next();
    });
  }

  // PDF 文字項目 → 一行一行；遇到「正上方緊貼著漢字的假名行」視為注音假名，併成「漢字（かな）」
  // PDF 常把「行」「止」「食」等字對應到康熙部首碼位（⾏⽌⾷），轉回一般漢字
  function fixRadicals(str) {
    return String(str || '').replace(/[\u2E80-\u2FDF\uF900-\uFAFF]/g, function (ch) { return ch.normalize ? ch.normalize('NFKC') : ch; });
  }
  var RE_KANA_ITEM = /^[\u3041-\u3096\u30A1-\u30FA\u30FC]+$/;
  var RE_KANJI_CH = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3005-\u3007]/;
  function pdfLines(items) {
    var its = [];
    items.forEach(function (it) {
      if (!it.str || !it.str.trim()) return;
      var tr = it.transform || [1, 0, 0, 1, 0, 0];
      var h = Math.abs(it.height || Math.sqrt(tr[2] * tr[2] + tr[3] * tr[3])) || 10;
      its.push({ s: fixRadicals(it.str), x: tr[4], y: tr[5], w: it.width || 0, h: h });
    });
    if (!its.length) return { lines: [], small: [] };
    var hs = its.map(function (i) { return i.h; }).sort(function (a, b) { return a - b; });
    var med = hs[Math.floor(hs.length / 2)];

    its.sort(function (a, b) { return (b.y - a.y) || (a.x - b.x); });
    var lines = [];
    its.forEach(function (it) {
      var L = lines.length ? lines[lines.length - 1] : null;
      if (L && Math.abs(L.y - it.y) <= Math.min(L.h, it.h) * 0.5) { L.items.push(it); L.h = Math.max(L.h, it.h); }
      else lines.push({ y: it.y, h: it.h, items: [it] });
    });
    lines.forEach(function (L) {
      L.items.sort(function (a, b) { return a.x - b.x; });
      L.chars = [];
      L.items.forEach(function (it) {
        var chs = Array.from ? Array.from(it.s) : it.s.split('');
        var cw = it.w / Math.max(1, chs.length) || it.h;
        chs.forEach(function (ch, k) { L.chars.push({ ch: ch, x: it.x + k * cw, w: cw, h: it.h, g: -1 }); });
      });
    });

    // 注音假名偵測
    var rubies = {}, consumed = {};
    for (var i = 0; i < lines.length - 1; i++) {
      var R = lines[i], Bl = lines[i + 1];
      if (!R.items.every(function (it) { return RE_KANA_ITEM.test(it.s.replace(/\s+/g, '')); })) continue;
      var dy = R.y - Bl.y;
      if (dy <= 0 || dy > Bl.h * 1.45 || R.h > Bl.h * 1.05) continue;
      var groups = [], ok = true;
      R.items.forEach(function (r) {
        var under = Bl.chars.filter(function (c) {
          var cx = c.x + c.w / 2;
          return cx >= r.x - c.w * 0.4 && cx <= r.x + r.w + c.w * 0.4 && RE_KANJI_CH.test(c.ch);
        });
        if (!under.length) { ok = false; return; }
        var reading = r.s.replace(/\s+/g, '');
        var last = groups.length ? groups[groups.length - 1] : null;
        // 同一個漢字被兩段注音蓋到（例如「れ」「き」都在「歴」上方）→ 合併成同一組
        if (last && under.some(function (c) { return last.chars.indexOf(c) >= 0; })) {
          under.forEach(function (c) { if (last.chars.indexOf(c) < 0) last.chars.push(c); });
          last.reading += reading;
        } else groups.push({ chars: under, reading: reading });
      });
      if (!ok) continue;
      consumed[i] = true;
      rubies[i + 1] = (rubies[i + 1] || []).concat(groups);
    }

    var out = [], small = [];
    lines.forEach(function (L, idx) {
      if (consumed[idx]) return;
      (rubies[idx] || []).forEach(function (g, gi) { g.chars.forEach(function (c) { c.g = gi; }); });
      var s = '', prev = null, groups = rubies[idx] || [];
      L.chars.forEach(function (c, k) {
        if (prev && !(prev.g >= 0 && prev.g === c.g)) {
          var gap = c.x - (prev.x + prev.w);
          if (gap > Math.max(prev.w * 1.5, prev.h * 1.2)) s += '\t';
          else if (gap > prev.w * 0.3) s += ' ';
        }
        s += c.ch;
        var nx = L.chars[k + 1];
        if (c.g >= 0 && (!nx || nx.g !== c.g)) s += '（' + groups[c.g].reading + '）';
        prev = c;
      });
      if (L.h < med * 0.6) small.push(s); else out.push(s);
    });
    return { lines: out, small: small };
  }

  // ---------- EPUB ----------
  function epubBlocks(zip) {
    return zip.file('META-INF/container.xml').async('string').then(function (cx) {
      var rf = descByName(xmlDoc(cx).documentElement, 'rootfile')[0];
      var opfPath = rf ? rf.getAttribute('full-path') : '';
      if (!opfPath || !zip.file(opfPath)) throw friendlyError('EPUB 格式不完整，找不到目錄檔');
      var dir = opfPath.indexOf('/') >= 0 ? opfPath.replace(/[^\/]+$/, '') : '';
      return zip.file(opfPath).async('string').then(function (opf) {
        var od = xmlDoc(opf), man = {};
        descByName(od.documentElement, 'item').forEach(function (it) { man[it.getAttribute('id')] = it.getAttribute('href'); });
        var spine = descByName(od.documentElement, 'itemref').map(function (r) { return man[r.getAttribute('idref')]; }).filter(Boolean);
        var blocks = [];
        var chain = Promise.resolve();
        spine.forEach(function (href, i) {
          chain = chain.then(function () {
            var path = (dir + decodeURIComponent(href)).replace(/[^\/]+\/\.\.\//g, '');
            var f = zip.file(path);
            if (!f) return;
            return f.async('string').then(function (html) {
              parseHTMLString(html, '第 ' + (i + 1) + ' 章').blocks.forEach(function (b) { blocks.push(b); });
            });
          });
        });
        return chain.then(function () { return blocks; });
      });
    });
  }

  // ---------- 主流程：位元組 → blocks ----------
  // 回傳 { kind:'blocks', blocks, dropped, title } 或 { kind:'objects', list, title } 或 { kind:'backup', data }
  function extract(buf, name, contentType, onProgress) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var ext = extOf(name);
    var title = baseName(name);
    contentType = String(contentType || '').toLowerCase();

    if (!u8.length) return Promise.reject(friendlyError('檔案是空的'));
    if (startsWith(u8, [0x25, 0x50, 0x44, 0x46])) {
      return pdfBlocks(u8, onProgress).then(function (r) {
        if (!r.blocks.length) throw friendlyError('這份 PDF 沒有文字層（可能是掃描圖片），程式內無法辨識文字', 'scanned');
        return { kind: 'blocks', blocks: r.blocks, dropped: r.dropped, title: title };
      });
    }
    if (startsWith(u8, [0xFF, 0xD8, 0xFF]) || startsWith(u8, [0x89, 0x50, 0x4E, 0x47]) || startsWith(u8, [0x47, 0x49, 0x46, 0x38]) ||
        (startsWith(u8, [0x52, 0x49, 0x46, 0x46]) && u8[8] === 0x57) || (u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70)) {
      return Promise.reject(friendlyError('這是圖片或影音檔，需要文字辨識（OCR）才能讀出單字', 'image'));
    }
    if (startsWith(u8, [0x50, 0x4B, 0x03, 0x04])) {
      return loadScript(LIB.jszip).then(function () { return root.JSZip.loadAsync(u8); }).then(function (zip) {
        var fmt = zipFormat(zip, ext);
        if (fmt === 'docx') return zip.file('word/document.xml').async('string').then(function (x) { return { kind: 'blocks', blocks: docxToBlocks(x, 'Word'), dropped: [], title: title }; });
        if (fmt === 'xlsx' || fmt === 'ods') return loadScript(LIB.xlsx).then(function () { return { kind: 'blocks', blocks: sheetBlocks(u8), dropped: [], title: title }; });
        if (fmt === 'odt' || fmt === 'odp') return zip.file('content.xml').async('string').then(function (x) { return { kind: 'blocks', blocks: odtToBlocks(x, '文件'), dropped: [], title: title }; });
        if (fmt === 'pptx') {
          var names = Object.keys(zip.files).filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); }).sort(numSort);
          var blocks = [];
          return names.reduce(function (pr, n, i) {
            return pr.then(function () { return zip.file(n).async('string').then(function (x) { pptxSlideBlocks(x, '第 ' + (i + 1) + ' 張投影片').forEach(function (b) { blocks.push(b); }); }); });
          }, Promise.resolve()).then(function () { return { kind: 'blocks', blocks: blocks, dropped: [], title: title }; });
        }
        if (fmt === 'epub') return epubBlocks(zip).then(function (b) { return { kind: 'blocks', blocks: b, dropped: [], title: title }; });
        if (fmt === 'anki') throw friendlyError('Anki 牌組（.apkg）請在 Anki 用「匯出 → 純文字筆記（.txt）」再匯入', 'anki');
        throw friendlyError('這是壓縮檔，請先解壓縮再匯入裡面的檔案', 'zip');
      });
    }
    if (startsWith(u8, [0xD0, 0xCF, 0x11, 0xE0])) {
      if (ext === 'doc' || ext === 'ppt' || ext === 'pps' || ext === 'msg') {
        return Promise.reject(friendlyError('舊版 Office 檔（.' + ext + '）請先「另存新檔」成 .docx／.pptx 或 PDF 再匯入', 'legacy'));
      }
      return loadScript(LIB.xlsx).then(function () { return { kind: 'blocks', blocks: sheetBlocks(u8), dropped: [], title: title }; });
    }

    // 文字類
    var text = decodeText(u8);
    var head = text.slice(0, 2000).trim();
    if (/^[\[{]/.test(head) && (ext === 'json' || /json/.test(contentType) || /^[\[{]\s*["{\[]/.test(head))) {
      var data;
      try { data = JSON.parse(text); } catch (e) { data = null; }
      if (data) {
        if (data && data.app === 'jpquiz') return Promise.resolve({ kind: 'backup', data: data, title: title });
        var list = Array.isArray(data) ? data : (data.entries || data.words || data.cards || data.items || data.vocab || data.list);
        if (Array.isArray(list)) return Promise.resolve({ kind: 'objects', list: list, title: data.name || data.title || data.deck || title });
      }
    }
    if (/html|xml/.test(contentType) || /^(<!doctype html|<html|<\?xml[^>]*>\s*<html)/i.test(head) || (/<(table|tr|td|p|div|br)[\s>]/i.test(head) && /<\/[a-z]+>/i.test(head)) || ext === 'html' || ext === 'htm' || ext === 'xhtml') {
      var hres = parseHTMLString(text, '網頁');
      return Promise.resolve({ kind: 'blocks', blocks: hres.blocks, dropped: [], title: hres.title || title });
    }
    if (ext === 'csv' || ext === 'tsv' || /csv|tab-separated/.test(contentType) || (!ext && looksLikeCSV(text))) {
      var d = ext === 'tsv' ? '\t' : guessDelimiter(text);
      var rows = parseCSV(text.replace(/\r\n?/g, '\n'), d);
      return Promise.resolve({ kind: 'blocks', blocks: [{ type: 'table', rows: rows, label: ext.toUpperCase() || 'CSV' }], dropped: [], title: title });
    }
    if (ext === 'srt' || ext === 'vtt' || ext === 'ass') {
      text = text.replace(/^\d+\s*$/gm, '').replace(/^[\d:,.]+\s*-->.*$/gm, '').replace(/^WEBVTT.*$/m, '');
    }
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var tabbed = lines.filter(function (l) { return /\S\t+\S/.test(l); }).length;
    var nonBlank = lines.filter(function (l) { return l.trim(); }).length;
    if (nonBlank >= 3 && tabbed / nonBlank >= 0.6) {
      return Promise.resolve({ kind: 'blocks', blocks: [{ type: 'table', rows: parseCSV(text.replace(/\r\n?/g, '\n'), '\t'), label: '文字檔' }], dropped: [], title: title });
    }
    return Promise.resolve({ kind: 'blocks', blocks: [{ type: 'lines', lines: lines, label: '文字' }], dropped: [], title: title });
  }

  // ---------- 網址 ----------
  function rewriteUrl(u) {
    u = String(u || '').trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    var m, gid;
    if ((m = u.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/))) {
      gid = (u.match(/[#&?]gid=(\d+)/) || [0, '0'])[1];
      return { url: 'https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=csv&gid=' + gid, name: 'Google 試算表.csv', hint: 'google' };
    }
    if ((m = u.match(/docs\.google\.com\/document\/d\/([\w-]+)/))) {
      return { url: 'https://docs.google.com/document/d/' + m[1] + '/export?format=txt', name: 'Google 文件.txt', hint: 'google' };
    }
    if ((m = u.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/))) {
      return { url: 'https://docs.google.com/presentation/d/' + m[1] + '/export?format=txt', name: 'Google 簡報.txt', hint: 'google' };
    }
    if ((m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]+)/))) {
      return { url: 'https://drive.google.com/uc?export=download&id=' + m[1], name: '', hint: 'google' };
    }
    return { url: u, name: '', hint: '' };
  }

  function b64ToU8(b64) {
    var bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function fetchBytes(url) {
    if (root.JPBridge && root.JPBridge.available()) {
      return root.JPBridge.call('fetchUrl', [url, 'doc'], 45000).then(function (r) {
        if (!r || !r.ok) {
          var why = r && r.status ? 'HTTP ' + r.status : (r && r.error ? r.error : '連線失敗');
          throw friendlyError('讀取網址失敗（' + why + '）', 'net');
        }
        return { u8: b64ToU8(r.base64), contentType: r.contentType || '', finalUrl: r.finalUrl || url, fileName: r.fileName || '' };
      });
    }
    return fetch(url, { redirect: 'follow' }).then(function (res) {
      if (!res.ok) throw friendlyError('讀取網址失敗（HTTP ' + res.status + '）', 'net');
      var ct = res.headers.get('content-type') || '';
      return res.arrayBuffer().then(function (ab) { return { u8: new Uint8Array(ab), contentType: ct, finalUrl: res.url || url, fileName: '' }; });
    }, function () {
      throw friendlyError('網頁版受到網站的安全限制，無法直接讀取這個網址。請先把檔案下載到手機（iPhone 會存到「檔案」App），再用「選擇檔案」匯入；Android 可以改用 App 版', 'cors');
    });
  }

  function importUrl(rawUrl, onProgress) {
    var rw = rewriteUrl(rawUrl);
    if (onProgress) onProgress('下載中…');
    return fetchBytes(rw.url).then(function (r) {
      var nameFromUrl = decodeURIComponent((r.finalUrl.split(/[?#]/)[0].split('/').pop() || ''));
      var name = r.fileName || rw.name || nameFromUrl || 'web.html';
      if (!extOf(name) && /html/.test(r.contentType)) name += '.html';
      if (rw.hint === 'google' && /text\/html/.test(r.contentType) && /accounts\.google\.com|ServiceLogin/.test(r.finalUrl)) {
        throw friendlyError('Google 檔案需要先設定「知道連結的任何人都能檢視」才能匯入', 'private');
      }
      return extract(r.u8, name, r.contentType, onProgress).then(function (res) {
        if (!res.title || res.title === baseName(name)) res.title = res.title || baseName(name) || r.finalUrl;
        res.source = rawUrl;
        return res;
      });
    });
  }

  function importFile(file, onProgress) {
    if (onProgress) onProgress('讀取檔案…');
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(friendlyError('無法讀取這個檔案')); };
      fr.readAsArrayBuffer(file);
    }).then(function (u8) {
      return extract(u8, file.name, file.type, onProgress).then(function (res) { res.source = file.name; return res; });
    });
  }

  function importText(text) {
    return Promise.resolve({ kind: 'blocks', blocks: [{ type: 'lines', lines: String(text || '').replace(/\r\n?/g, '\n').split('\n'), label: '貼上文字' }], dropped: [], title: '' });
  }

  root.JPImporter = {
    importFile: importFile,
    importUrl: importUrl,
    importText: importText,
    extract: extract,
    decodeText: decodeText,
    parseCSV: parseCSV,
    rewriteUrl: rewriteUrl,
    loadScript: loadScript
  };
})(typeof self !== 'undefined' ? self : this);
