/* 區間再平衡：畫面與互動（依 design/mockup-simple.html） */
(function () {
  'use strict';
  var BR = window.BR;
  var calc = BR.calc, ed = BR.editing, srch = BR.search, quotes = BR.quotes, store = BR.store;
  var $ = function (s) { return document.querySelector(s); };

  // ---------- 啟動 ----------
  var storage;
  try {
    storage = store.createStorage(window.localStorage);
  } catch (e) {
    storage = store.createStorage({ setItem: function () { throw e; }, getItem: function () { return null; }, removeItem: function () {} });
  }
  var data = storage.load();
  var onboarding = !data;
  if (!data) data = store.emptyData();

  var openId = null, focusId = null, first = true, dragging = null, scaleMax = null, dragEnded = 0;
  var untouched = {};   // 剛新增、還沒填過的持股，先不標紅框
  var quoteErr = {};    // 持股 id → 查價錯誤代碼（只存在記憶體）
  var symIndex = null, symNames = null, symLoading = null;

  var ICON = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 8v5"/><circle cx="12" cy="16.6" r=".6" fill="currentColor"/><path d="M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="1.8" fill="currentColor"/><circle cx="15" cy="12" r="1.8" fill="currentColor"/><circle cx="11" cy="17" r="1.8" fill="currentColor"/></svg>',
  };

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function usd(n) { return '$' + Math.round(Math.abs(n)).toLocaleString('en-US'); }
  function fmtP(v) { return calc.isNum(v) ? (Number.isInteger(v) ? v : (Math.round(v * 10) / 10).toFixed(1)) + '%' : '—'; }
  function color(i) { return 'var(--c' + ((i % 7) + 1) + ')'; }
  function today() { return store.localDate(new Date()); }
  function hhmm(iso) {
    var d = new Date(iso);
    var t = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    return store.localDate(d) === today() ? t : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + t;
  }
  function verb(n) { return n < 0 ? '賣出' : '買入'; }
  function sectorById(id) { return data.sectors.filter(function (s) { return s.id === id; })[0]; }
  function holdingById(id) { return data.holdings.filter(function (h) { return h.id === id; })[0]; }
  function parseNum(v) { if (v === '' || v == null) return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
  function save() { storage.save(data); }

  // ---------- 深淺色 ----------
  function applyTheme() {
    document.documentElement.dataset.theme = data.prefs.theme === 'light' ? 'light' : 'dark';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = data.prefs.theme === 'light' ? '#f4f4f1' : '#0d0d0d';
  }

  // ---------- 代號清單（延遲載入） ----------
  function ensureSymbols() {
    if (symIndex) return Promise.resolve(symIndex);
    if (symLoading) return symLoading;
    symLoading = new Promise(function (resolve) {
      function done() {
        var list = window.BR_SYMBOLS || [];
        symIndex = srch.buildIndex(list);
        symNames = {};
        list.forEach(function (x) { symNames[x[0]] = x[1]; });
        resolve(symIndex);
        render();
      }
      if (window.BR_SYMBOLS) return done();
      var s = document.createElement('script');
      s.src = 'data/symbols.js';
      s.onload = done;
      s.onerror = function () { window.BR_SYMBOLS = []; done(); };
      document.head.appendChild(s);
    });
    return symLoading;
  }

  // ---------- 計算 ----------
  function compute() {
    var p = calc.computePortfolio(data.sectors, data.holdings);
    p.rows.forEach(function (r, i) { r.i = i; });
    return p;
  }

  // ---------- 提醒列與選單 ----------
  function renderBanner() {
    var el = $('#banner');
    var btn = '<button class="link" type="button" data-action="export">立即備份</button>';
    if (!storage.available) {
      el.className = 'banner crit';
      el.innerHTML = ICON.warn + '<span class="msg"><b>資料無法保存。</b>這個瀏覽器不允許網頁存資料（例如封鎖了網站資料），關閉頁面後會遺失，請記得匯出備份。</span>' + btn;
      el.hidden = false;
      return;
    }
    var last = data.meta.lastBackupAt;
    var days = last ? store.daysBetween(store.localDate(new Date(last)), today()) : null;
    // 超過 30 天沒備份，或開始使用滿 3 天還沒備份過，才提醒
    var since = data.meta.since ? store.daysBetween(store.localDate(new Date(data.meta.since)), today()) : 0;
    var warn = !onboarding && ((last && days > 30) || (!last && data.holdings.length > 0 && since >= 3));
    el.hidden = !warn;
    if (warn) {
      el.className = 'banner warn';
      el.innerHTML = ICON.warn + '<span class="msg">' + (last ? '已經 ' + days + ' 天沒有備份了。' : '還沒有備份過。') +
        '資料只存在這台裝置的瀏覽器，清除瀏覽器資料就會不見；iPhone 的 Safari 太久沒開啟也可能清掉網站資料，建議把網頁加入主畫面並定期匯出。</span>' + btn;
    }
    $('#menu-meta').textContent = '持股數量只存在這台裝置；查報價時只送出股票代號・' +
      (last ? '上次備份 ' + (days === 0 ? '今天' : days + ' 天前') : '尚未備份');
  }

  function renderQuoteBtn() {
    var has = !!storage.getApiKey();
    var btn = $('#refresh-btn');
    btn.classList.toggle('nokey', !has);
    btn.title = has ? '查詢所有持股的最新價格' : '設定 Finnhub 金鑰後可以查詢最新價格';
    $('#quote-at').textContent = has && data.meta.lastQuoteAt ? hhmm(data.meta.lastQuoteAt) : '';
  }

  // ---------- 首次使用 ----------
  function renderOnboarding() {
    $('#onboard').innerHTML = '<div class="onboard">' +
      '<div class="art">' + ICON.chart + '</div>' +
      '<h2>開始管理你的倉位</h2>' +
      '<p>替每個板塊設定目標和允許區間，填入持股後，一眼看出哪個板塊超出區間、最少要買賣多少。</p>' +
      '<div class="steps">' +
      '<div class="step"><b>1. 拖曳設定區間</b>在圖上拖曳藍框兩端與目標線</div>' +
      '<div class="step"><b>2. 填入持股</b>點板塊名稱，搜尋代號、填股數</div>' +
      '<div class="step"><b>3. 只在超出時調整</b>在區間內就一股都不用動</div>' +
      '</div>' +
      '<div class="row-btns">' +
      '<button class="btn primary" type="button" data-action="sample">載入範例資料</button>' +
      '<button class="btn" type="button" data-action="import">從備份檔匯入</button>' +
      '<button class="btn" type="button" data-action="blank">用預設類別開始</button>' +
      '</div>' +
      '<p class="fine">範例資料的數字都是虛構的・' + (storage.available ? '資料只存在這台裝置的瀏覽器，不會上傳' : '這個瀏覽器無法保存資料，請記得匯出備份') + '</p>' +
      '</div>';
  }

  // ---------- 圓環 ----------
  function countTo(el, to) {
    var from = +el.dataset.v || 0, t0 = performance.now(), dur = first ? 1100 : 400;
    el.dataset.v = to;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = usd(to); return; }
    function step(t) {
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = usd(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderDonut(p) {
    var R = 90, C = 2 * Math.PI * R, gap = 2.2, acc = 0;
    var g = $('#slices');
    p.rows.forEach(function (r, idx) {
      var c = g.querySelector('[data-id="' + r.id + '"]');
      if (!c) {
        c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('class', 'slice'); c.setAttribute('r', R);
        c.dataset.id = r.id; c.style.strokeDasharray = '0 ' + C;
      }
      if (g.children[idx] !== c) g.insertBefore(c, g.children[idx] || null);
      var f = p.total > 0 ? r.value / p.total : 0;
      var len = Math.max(f * C - (f > 0 ? gap : 0), 0), off = -acc * C;
      c.style.stroke = color(r.i);
      requestAnimationFrame(function () { c.style.strokeDasharray = len + ' ' + C; c.style.strokeDashoffset = off; });
      acc += f;
      c.classList.toggle('on', r.id === focusId);
    });
    Array.prototype.slice.call(g.children).forEach(function (c) { if (!p.rows.some(function (r) { return r.id === c.dataset.id; })) c.remove(); });
    $('#donut').classList.toggle('has-focus', !!focusId);

    var center = $('#center');
    var fr = p.rows.filter(function (r) { return r.id === focusId; })[0];
    if (fr) {
      center.innerHTML = '<div><small>' + esc(fr.name || '未命名') + '</small><b>' + fr.weight.toFixed(1) + '%</b><span>' + usd(fr.value) + '・目標 ' + fmtP(fr.target) + '</span></div>';
    } else {
      if (!center.querySelector('#tv')) center.innerHTML = '<div><small>總市值</small><b id="tv" data-v="0">$0</b><span></span></div>';
      center.querySelector('span').textContent = p.rows.length + ' 個板塊・' + data.holdings.length + ' 檔持股';
      countTo(center.querySelector('#tv'), p.total);
    }
  }

  // ---------- 結論 ----------
  function renderVerdict(p) {
    var v = $('#verdict');
    if (!p.rows.length) {
      v.className = 'verdict ok';
      v.innerHTML = '<h2><span class="ic">' + ICON.info + '</span>先新增板塊</h2><p>按下方「新增板塊」，再拖曳設定目標與允許區間。</p>';
      return;
    }
    if (p.total <= 0) {
      v.className = 'verdict ok';
      v.innerHTML = '<h2><span class="ic">' + ICON.info + '</span>先在板塊裡新增持股</h2><p>點板塊名稱展開，按「新增持股」並搜尋代號，填入股數後就會開始計算。</p>';
      return;
    }
    var outs = p.rows.filter(function (r) { return r.status === 'over' || r.status === 'under'; });
    var bad = p.rows.filter(function (r) { return r.status === 'invalid'; });
    if (outs.length) {
      v.className = 'verdict bad';
      v.innerHTML = '<h2><span class="ic">' + ICON.warn + '</span>' + outs.length + ' 個板塊超出區間</h2>' +
        '<p>其他 ' + (p.rows.length - outs.length) + ' 個板塊都在允許範圍內，不用動。下面是最少要調整的金額：</p>' +
        '<div class="todo-pills">' + outs.map(function (r) {
          return '<button class="pill" type="button" data-open="' + esc(r.id) + '"><i class="sw" style="background:' + color(r.i) + '"></i>' + esc(r.name || '未命名') + '<b>' + verb(r.toEdge) + ' ' + usd(r.toEdge) + '</b>' + ICON.chevR + '</button>';
        }).join('') + '</div>';
    } else {
      v.className = 'verdict ok';
      v.innerHTML = '<h2><span class="ic">' + ICON.ok + '</span>全部在區間內</h2>' +
        '<p>每個板塊都在你設定的允許範圍內，這次一股都不用動。</p>' +
        '<span class="calm">' + ICON.ok + (bad.length ? bad.length + ' 個板塊的區間設定有誤，請拖曳修正' : '下次檢查時再看看就好') + '</span>';
    }
  }

  function renderSum() {
    var sum = calc.targetSum(data.sectors);
    var el = $('#sum');
    var ok = !data.sectors.length || Math.abs(sum - 100) < 0.001;
    el.className = 'sum' + (ok ? '' : ' bad');
    el.innerHTML = ok ? ICON.ok + '目標合計 100%' : ICON.warn + '目標合計 ' + fmtP(sum) + '<button type="button" data-action="fix-sum">補成 100%</button>';
    el.hidden = !data.sectors.length;
  }

  // ---------- 區間列 ----------
  var EDGE_LABEL = { lo: '下限', target: '目標', hi: '上限' };

  function buildRow(r) {
    var el = document.createElement('div');
    el.className = 'row'; el.dataset.id = r.id; el.setAttribute('role', 'listitem');
    el.innerHTML = '<div class="row-main">' +
      '<button class="name" type="button" aria-expanded="false">' + ICON.chev + '<i class="sw"></i><span class="t"></span><span class="wm"></span></button>' +
      '<div class="track">' +
      '<span class="band"></span><span class="target"></span><span class="gap"></span><span class="gap-label"></span><span class="dot"></span>' +
      ['lo', 'target', 'hi'].map(function (k) {
        return '<span class="h ' + (k === 'target' ? 'tgt' : 'edge') + '" data-edge="' + k + '" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100"><span class="lab"></span></span>';
      }).join('') +
      '</div><span class="w"></span><span class="act"></span></div>' +
      '<div class="detail"><div><div class="detail-in"><div class="stats"></div><div class="hold"></div></div></div></div>';
    return el;
  }

  function renderRows(p) {
    var box = $('#rows');
    if (!p.rows.length) {
      box.innerHTML = '<div class="rows-empty">還沒有板塊。按下方「新增板塊」開始。</div>';
      return;
    }
    var empty = box.querySelector('.rows-empty');
    if (empty) empty.remove();
    if (!dragging || scaleMax === null) scaleMax = calc.axisMax(p.rows);
    var max = scaleMax;
    var x = function (v) { return (Math.max(0, Math.min(v, max)) / max) * 100; };
    box.classList.toggle('dragging-live', !!dragging);

    p.rows.forEach(function (r, idx) {
      var el = box.querySelector('.row[data-id="' + r.id + '"]');
      var fresh = !el;
      if (fresh) {
        el = buildRow(r);
        var startAt = calc.isNum(r.target) ? x(r.target) : 0;
        el.querySelector('.dot').style.left = startAt + '%';
        el.querySelector('.band').style.left = startAt + '%';
        el.querySelector('.band').style.width = '0%';
        el.querySelector('.target').style.left = startAt + '%';
      }
      // 依板塊順序排列；只在位置不對時才移動，移動節點會讓裡面的輸入框失焦
      if (box.children[idx] !== el) box.insertBefore(el, box.children[idx] || null);
      if (fresh || el.dataset.hv !== holdingsVersion(r.id)) renderHoldings(el, r);

      var tr = el.querySelector('.track');
      if (tr.dataset.max !== String(max)) {
        Array.prototype.slice.call(tr.querySelectorAll('.tick')).forEach(function (t) { t.remove(); });
        for (var t = 0; t <= max; t += 5) { var k = document.createElement('i'); k.className = 'tick'; k.style.left = x(t) + '%'; tr.insertBefore(k, tr.firstChild); }
        tr.dataset.max = String(max);
      }
      el.querySelector('.sw').style.background = color(r.i);
      el.querySelector('.t').textContent = r.name || '未命名';
      el.querySelector('.wm').textContent = r.weight.toFixed(1) + '%';
      el.querySelector('.w').textContent = r.weight.toFixed(1) + '%';
      var dot = el.querySelector('.dot');
      dot.style.background = color(r.i);
      var isOut = r.status === 'over' || r.status === 'under';
      dot.classList.toggle('out', isOut);
      var valid = r.status !== 'invalid';
      el.querySelector('.band').style.visibility = valid ? '' : 'hidden';

      var gapEl = el.querySelector('.gap'), gl = el.querySelector('.gap-label');
      var hs = { lo: el.querySelector('[data-edge="lo"]'), target: el.querySelector('[data-edge="target"]'), hi: el.querySelector('[data-edge="hi"]') };
      var apply = function () {
        if (valid) {
          el.querySelector('.band').style.left = x(r.lo) + '%';
          el.querySelector('.band').style.width = (x(r.hi) - x(r.lo)) + '%';
        }
        el.querySelector('.target').style.left = x(calc.isNum(r.target) ? r.target : 0) + '%';
        dot.style.left = x(r.weight) + '%';
        Object.keys(hs).forEach(function (k) {
          var v = calc.isNum(r[k]) ? r[k] : 0;
          hs[k].style.left = x(v) + '%';
          hs[k].querySelector('.lab').textContent = EDGE_LABEL[k] + ' ' + fmtP(v);
          hs[k].setAttribute('aria-valuenow', v);
          hs[k].setAttribute('aria-valuetext', fmtP(v));
          hs[k].setAttribute('aria-label', (r.name || '未命名') + ' ' + EDGE_LABEL[k]);
        });
        if (isOut) {
          var a = Math.min(r.edge, r.weight), b = Math.max(r.edge, r.weight);
          gapEl.style.left = x(a) + '%'; gapEl.style.width = (x(b) - x(a)) + '%';
          gl.style.left = x((a + b) / 2) + '%';
          gl.textContent = (r.status === 'over' ? '+' : '−') + Math.abs(calc.r1(r.weight - r.edge)).toFixed(1) + ' 點';
        }
        gapEl.classList.toggle('on', isOut); gl.classList.toggle('on', isOut);
      };
      if (fresh && first) requestAnimationFrame(function () { requestAnimationFrame(apply); }); else apply();

      var act = el.querySelector('.act');
      if (isOut) act.innerHTML = '<span class="chip bad">' + ICON.warn + verb(r.toEdge) + ' ' + usd(r.toEdge) + '</span><small>' + (r.status === 'over' ? '超出上限 ' : '低於下限 ') + fmtP(r.edge) + '</small>';
      else if (r.status === 'invalid') act.innerHTML = '<span class="chip neutral">' + ICON.warn + '區間設定有誤</span><small>拖曳把手修正</small>';
      else if (r.status === 'empty') act.innerHTML = '<span class="chip neutral">尚無持股</span>';
      else act.innerHTML = '<span class="chip ok">' + ICON.ok + '區間內</span>';

      renderStats(el, r, p.total);
      updateHoldingCells(el, r);
      el.classList.toggle('open', openId === r.id);
      el.classList.toggle('hl', focusId === r.id);
      el.querySelector('.name').setAttribute('aria-expanded', String(openId === r.id));
    });
    Array.prototype.slice.call(box.querySelectorAll('.row')).forEach(function (el) {
      if (!p.rows.some(function (r) { return r.id === el.dataset.id; })) el.remove();
    });
  }

  function renderStats(el, r, total) {
    var isOut = r.status === 'over' || r.status === 'under';
    var valid = r.status !== 'invalid';
    var room = total > 0 && valid ? '離上限還有 ' + Math.max(0, r.hi - r.weight).toFixed(1) + ' 點（約 ' + usd(((r.hi - r.weight) / 100) * total) + '）' : '';
    el.querySelector('.stats').innerHTML =
      '<div class="stat"><small>目前</small><b>' + r.weight.toFixed(1) + '%</b><span>' + usd(r.value) + '・' + r.count + ' 檔</span></div>' +
      '<div class="stat"><small>目標 ' + fmtP(r.target) + '</small><b>' + usd(((r.target || 0) / 100) * total) + '</b><span>' +
      (total <= 0 ? '—' : Math.round(r.toTarget) === 0 ? '已在目標' : verb(r.toTarget) + ' ' + usd(r.toTarget) + ' 可回到目標') + '</span></div>' +
      '<div class="stat ' + (isOut ? 'do' : valid ? 'fine' : '') + '"><small>允許區間 ' + (valid ? fmtP(r.lo) + '–' + fmtP(r.hi) : '設定有誤') + '</small><b>' +
      (valid ? usd((r.lo / 100) * total) + '–' + usd((r.hi / 100) * total).slice(1) : '—') + '</b><span>' +
      (isOut ? verb(r.toEdge) + ' ' + usd(r.toEdge) + ' 回到區間' : room) + '</span></div>';
  }

  // 持股明細：結構改變時才重建；打字時只更新計算欄位
  function holdingsVersion(sectorId) {
    return data.holdings.filter(function (h) { return h.sectorId === sectorId; }).map(function (h) { return h.id; }).join(',');
  }

  function renderHoldings(el, r) {
    var list = data.holdings.filter(function (h) { return h.sectorId === r.id; });
    el.dataset.hv = holdingsVersion(r.id);
    el.querySelector('.hold').innerHTML =
      '<div class="hold-head"><b>持股明細</b><input data-sector-name="' + esc(r.id) + '" value="' + esc(r.name) + '" aria-label="板塊名稱" title="板塊名稱" placeholder="板塊名稱"></div>' +
      '<table><thead><tr><th>代號</th><th class="num">股數</th><th class="num">最新價格</th><th class="num">市值</th><th class="num">佔板塊</th><th><span class="sr-only">操作</span></th></tr></thead><tbody>' +
      (list.map(function (h) {
        var a = 'data-hid="' + esc(h.id) + '"';
        return '<tr ' + a + '>' +
          '<td class="symcell"><input class="sym" ' + a + ' data-k="sym" value="' + esc(h.sym) + '" placeholder="輸入代號或公司名" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="combo" aria-label="代號"><small class="cname" data-cell="cn"></small></td>' +
          '<td><input class="num" type="number" inputmode="decimal" min="0" step="any" ' + a + ' data-k="shares" value="' + (h.shares == null ? '' : h.shares) + '" aria-label="股數"></td>' +
          '<td><input class="num" type="number" inputmode="decimal" min="0" step="any" ' + a + ' data-k="price" value="' + (h.price == null ? '' : h.price) + '" aria-label="價格"><small class="pmeta" data-cell="pm"></small></td>' +
          '<td class="num" data-cell="v"></td>' +
          '<td class="num"><span class="share"><i style="background:' + color(r.i) + '"></i><span data-cell="p"></span></span></td>' +
          '<td><button class="del" type="button" data-del-h="' + esc(h.id) + '" aria-label="刪除 ' + esc(h.sym || '這筆持股') + '" title="刪除">' + ICON.trash + '</button></td></tr>';
      }).join('') || '<tr><td colspan="6" class="tip" style="padding:12px 6px">這個板塊還沒有持股</td></tr>') +
      '</tbody></table>' +
      '<div class="hold-foot"><button class="add" type="button" data-add-h="' + esc(r.id) + '">' + ICON.plus + '新增持股</button>' +
      '<span class="tip">現金：代號填 USD，股數填金額、價格填 1</span>' +
      '<button class="text-btn" type="button" data-del-s="' + esc(r.id) + '">刪除這個板塊</button></div>';
  }

  function updateHoldingCells(el, r) {
    Array.prototype.slice.call(el.querySelectorAll('tr[data-hid]')).forEach(function (tr) {
      var h = holdingById(tr.dataset.hid);
      if (!h) return;
      var v = calc.holdingValue(h), pct = r.value > 0 ? (v / r.value) * 100 : 0;
      tr.querySelector('[data-cell="v"]').textContent = usd(v);
      tr.querySelector('[data-cell="p"]').textContent = pct.toFixed(0) + '%';
      tr.querySelector('.share i').style.width = Math.max(2, pct * 0.5) + 'px';
      var errs = untouched[h.id] ? {} : calc.holdingErrors(h);
      ['shares', 'price'].forEach(function (k) {
        var inp = tr.querySelector('input[data-k="' + k + '"]');
        inp.setAttribute('aria-invalid', errs[k] ? 'true' : 'false');
        inp.title = errs[k] || '';
      });
      var cn = tr.querySelector('[data-cell="cn"]');
      if (quotes.isCash(h.sym)) cn.textContent = '現金（美元）';
      else if (!h.sym) cn.textContent = '';
      else if (symNames) cn.textContent = symNames[h.sym] || '清單中找不到，價格請手動填';
      else cn.textContent = '';
      var pm = tr.querySelector('[data-cell="pm"]');
      if (pm.dataset.loading) return;
      var err = quoteErr[h.id];
      pm.className = 'pmeta' + (h.quoteAt && !err ? ' live' : err ? ' err' : '');
      pm.textContent = quotes.isCash(h.sym) ? '固定 1' : err ? quotes.MESSAGES[err] : h.quoteAt ? '即時・' + hhmm(h.quoteAt) : h.sym ? '手動填寫' : '';
    });
  }

  // ---------- 總更新 ----------
  function render() {
    applyTheme();
    renderBanner();
    renderQuoteBtn();
    $('#onboard').hidden = !onboarding;
    $('#main').hidden = onboarding;
    if (onboarding) { renderOnboarding(); return; }
    var p = compute();
    renderDonut(p);
    renderVerdict(p);
    renderSum();
    renderRows(p);
    first = false;
  }

  function commit() {
    if (!onboarding && !data.meta.since) data.meta.since = new Date().toISOString();
    save();
    render();
  }

  function toggle(id, scroll) {
    openId = openId === id && !scroll ? null : id;
    render();
    if (scroll) {
      var el = document.querySelector('.row[data-id="' + id + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (openId) ensureSymbols();
  }

  // ---------- 拖曳 ----------
  document.addEventListener('pointerdown', function (e) {
    var h = e.target.closest && e.target.closest('.h');
    if (!h) return;
    e.preventDefault();
    var row = h.closest('.row');
    dragging = { el: h, id: row.dataset.id, rect: h.closest('.track').getBoundingClientRect(), max: scaleMax };
    try { h.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    h.classList.add('dragging');
    document.body.classList.add('dragging-x');
    h.focus({ preventScroll: true });
  });
  document.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var s = sectorById(dragging.id);
    if (!s) return;
    if (!calc.isSectorValid(s)) { s.lo = 0; s.target = calc.isNum(s.target) ? Math.max(0, Math.min(100, s.target)) : 0; s.hi = Math.max(s.target, 0); }
    ed.setValue(s, dragging.el.dataset.edge, ((e.clientX - dragging.rect.left) / dragging.rect.width) * dragging.max);
    render();
  });
  function endDrag() {
    if (!dragging) return;
    dragging.el.classList.remove('dragging');
    document.body.classList.remove('dragging-x');
    dragging = null;
    dragEnded = performance.now();
    commit();
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    // 把手：左右鍵 0.5、Shift 5
    var h = t.closest && t.closest('.h');
    if (h && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      var s = sectorById(h.closest('.row').dataset.id);
      var k = h.dataset.edge;
      ed.setValue(s, k, (calc.isNum(s[k]) ? s[k] : 0) + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5 : 0.5));
      commit();
      return;
    }
    // 代號搜尋選單
    if (t.matches && t.matches('input.sym') && !combo.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(t, comboItems[comboActive] || null); }
      else if (e.key === 'Escape') { var hh = holdingById(t.dataset.hid); t.value = hh ? hh.sym : ''; closeCombo(); }
      return;
    }
    if (e.key === 'Escape') { $('#menu').hidden = true; }
  });

  // ---------- 代號搜尋選單 ----------
  var combo = $('#combo'), comboFor = null, comboItems = [], comboActive = 0;
  function markHtml(text, q) {
    var parts = srch.highlight(text, q);
    return esc(parts[0]) + (parts[1] ? '<mark>' + esc(parts[1]) + '</mark>' : '') + esc(parts[2]);
  }
  function openCombo(input) {
    comboFor = input;
    var q = input.value.trim();
    if (!symIndex) {
      combo.innerHTML = '<div class="empty">載入代號清單中…</div>';
      positionCombo(input);
      ensureSymbols().then(function () { if (comboFor === input) openCombo(input); });
      return;
    }
    comboItems = q ? srch.search(symIndex, q, 8) : [];
    comboActive = 0;
    combo.innerHTML = (q
      ? comboItems.length
        ? comboItems.map(function (it, i) {
          return '<div class="opt' + (i === 0 ? ' active' : '') + '" role="option" id="opt-' + i + '" aria-selected="' + (i === 0) + '" data-i="' + i + '"><b>' + markHtml(it.sym, q) + '</b><span>' + markHtml(it.name, q) + '</span><small>' + (it.etf ? 'ETF' : '') + '</small></div>';
        }).join('')
        : '<div class="empty">清單中找不到「' + esc(q) + '」。按 Enter 直接使用這個代號，價格請手動填。</div>'
      : '<div class="empty">輸入代號或公司名，例如 NVDA、apple、gold</div>') +
      '<div class="foot">' + (q ? '↑↓ 選擇・Enter 確定・Esc 取消' : '共 ' + symIndex.length.toLocaleString('en-US') + ' 檔美股與 ETF') + '</div>';
    positionCombo(input);
    input.setAttribute('aria-activedescendant', comboItems.length ? 'opt-0' : '');
  }
  function positionCombo(input) {
    var r = input.getBoundingClientRect();
    combo.style.left = Math.max(12, Math.min(r.left, innerWidth - 324)) + 'px';
    combo.style.top = (r.bottom + 6) + 'px';
    combo.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function closeCombo() {
    combo.hidden = true;
    if (comboFor) comboFor.setAttribute('aria-expanded', 'false');
    comboFor = null;
  }
  function moveActive(d) {
    if (!comboItems.length) return;
    comboActive = (comboActive + d + comboItems.length) % comboItems.length;
    Array.prototype.slice.call(combo.querySelectorAll('.opt')).forEach(function (o, i) {
      o.classList.toggle('active', i === comboActive);
      o.setAttribute('aria-selected', String(i === comboActive));
    });
    var act = combo.querySelector('.opt.active');
    if (act) act.scrollIntoView({ block: 'nearest' });
    if (comboFor) comboFor.setAttribute('aria-activedescendant', 'opt-' + comboActive);
  }
  function choose(input, it) {
    var h = holdingById(input.dataset.hid);
    if (!h) return closeCombo();
    var sym = it ? it.sym : input.value.trim().toUpperCase();
    var changed = sym !== h.sym;
    h.sym = sym;
    input.value = sym;
    closeCombo();
    delete untouched[h.id];
    if (changed) { h.quoteAt = null; delete quoteErr[h.id]; }
    if (quotes.isCash(sym) && h.price == null) {
      h.price = 1;
      var pi = document.querySelector('input[data-hid="' + h.id + '"][data-k="price"]');
      if (pi) pi.value = 1;
    }
    commit();
    if (changed && it && !quotes.isCash(sym)) {
      if (storage.getApiKey()) quoteOne(h);
      else if (!quoteOne.hinted) { quoteOne.hinted = true; toast('在「報價設定」貼上 Finnhub 金鑰，就能自動填入最新價格'); }
    }
    var sh = document.querySelector('input[data-hid="' + h.id + '"][data-k="shares"]');
    if (sh && h.shares == null) sh.focus();
  }

  document.addEventListener('focusin', function (e) {
    if (e.target.matches && e.target.matches('input.sym')) { e.target.select(); openCombo(e.target); }
  });
  document.addEventListener('focusout', function (e) {
    if (!e.target.matches || !e.target.matches('input.sym')) return;
    var input = e.target;
    setTimeout(function () {
      if (comboFor !== input || document.activeElement === input) return;
      var h = holdingById(input.dataset.hid);
      var typed = input.value.trim().toUpperCase();
      if (h && typed && typed !== h.sym) {
        var exact = symIndex && symIndex.filter(function (x) { return x.sym === typed; })[0];
        choose(input, exact ? { sym: exact.sym, name: exact.name } : null);
      } else {
        if (h) input.value = h.sym;
        closeCombo();
      }
    }, 150);
  });
  combo.addEventListener('mousedown', function (e) {
    var o = e.target.closest('.opt');
    if (!o || !comboFor) return;
    e.preventDefault();
    choose(comboFor, comboItems[+o.dataset.i]);
  });
  window.addEventListener('scroll', function () { if (comboFor) positionCombo(comboFor); }, { passive: true });
  window.addEventListener('resize', function () { if (comboFor) positionCombo(comboFor); });

  // ---------- 報價 ----------
  function setPm(h, text, loading) {
    var pm = document.querySelector('tr[data-hid="' + h.id + '"] [data-cell="pm"]');
    if (!pm) return;
    if (loading) { pm.dataset.loading = '1'; pm.className = 'pmeta loading'; pm.textContent = text; }
    else delete pm.dataset.loading;
  }
  function applyQuote(h, r, at) {
    setPm(h, '', false);
    if (r.ok) {
      h.price = r.price;
      h.quoteAt = at;
      delete quoteErr[h.id];
      var inp = document.querySelector('input[data-hid="' + h.id + '"][data-k="price"]');
      if (inp) { inp.value = r.price; inp.classList.remove('flash'); void inp.offsetWidth; inp.classList.add('flash'); }
    } else {
      quoteErr[h.id] = r.error;
    }
  }
  function quoteOne(h) {
    setPm(h, '查詢報價中…', true);
    return quotes.fetchQuote(h.sym, storage.getApiKey()).then(function (r) {
      var at = new Date().toISOString();
      applyQuote(h, r, at);
      if (r.ok) data.meta.lastQuoteAt = at;
      else if (r.error !== 'notfound') toast(quotes.MESSAGES[r.error]);
      commit();
    });
  }
  function refreshAll(silent) {
    var key = storage.getApiKey();
    if (!key) { if (!silent) openKeyDialog(); return Promise.resolve(); }
    var btn = $('#refresh-btn');
    if (btn.classList.contains('spin')) return Promise.resolve();
    var list = data.holdings.filter(function (h) { return h.sym && !quotes.isCash(h.sym); });
    if (!list.length) { if (!silent) toast('還沒有可以查詢的持股'); return Promise.resolve(); }
    btn.classList.add('spin');
    list.forEach(function (h) { setPm(h, '查詢報價中…', true); });
    var at = new Date().toISOString();
    return quotes.fetchMany(list.map(function (h) { return h.sym; }), key).then(function (res) {
      var ok = 0, errs = {};
      list.forEach(function (h) {
        var r = res[h.sym];
        if (!r) return;
        applyQuote(h, r, at);
        if (r.ok) ok++; else errs[r.error] = (errs[r.error] || 0) + 1;
      });
      if (ok) data.meta.lastQuoteAt = at;
      btn.classList.remove('spin');
      commit();
      var symsOk = Object.keys(res).filter(function (s) { return res[s].ok; }).length;
      var fatal = errs.badkey ? 'badkey' : errs.ratelimit ? 'ratelimit' : errs.network ? 'network' : errs.http ? 'http' : null;
      if (fatal && !symsOk) toast(quotes.MESSAGES[fatal]);
      else if (!silent || errs.notfound) toast('已更新 ' + symsOk + ' 檔報價' + (errs.notfound ? '，' + errs.notfound + ' 檔查無報價' : '') + (fatal ? '，部分失敗：' + quotes.MESSAGES[fatal] : ''));
      if (errs.badkey && !silent) openKeyDialog('金鑰無效，請重新貼上');
    });
  }

  // ---------- 報價設定對話框 ----------
  var keyDlg = $('#key-dlg');
  function openKeyDialog(msg) {
    $('#key-input').value = storage.getApiKey();
    $('#key-input').type = 'password';
    $('#key-show').textContent = '顯示';
    var st = $('#key-status');
    st.className = 'key-status' + (msg ? ' bad' : '');
    st.textContent = msg || (storage.getApiKey() ? '已設定金鑰' : '尚未設定金鑰，價格可以手動填寫');
    if (typeof keyDlg.showModal === 'function') keyDlg.showModal(); else keyDlg.setAttribute('open', '');
    $('#key-input').focus();
  }
  function closeKeyDialog() { if (keyDlg.open) keyDlg.close(); }
  $('#key-show').addEventListener('click', function () {
    var i = $('#key-input');
    i.type = i.type === 'password' ? 'text' : 'password';
    this.textContent = i.type === 'password' ? '顯示' : '隱藏';
  });
  $('#key-cancel').addEventListener('click', closeKeyDialog);
  keyDlg.addEventListener('cancel', function (e) { e.preventDefault(); closeKeyDialog(); });
  $('#key-clear').addEventListener('click', function () {
    storage.setApiKey('');
    $('#key-input').value = '';
    var st = $('#key-status');
    st.className = 'key-status';
    st.textContent = '已清除金鑰';
    render();
  });
  $('#key-save').addEventListener('click', function () {
    var key = $('#key-input').value.trim();
    var st = $('#key-status'), btn = this;
    if (!key) { st.className = 'key-status bad'; st.textContent = '請先貼上金鑰'; return; }
    btn.disabled = true;
    st.className = 'key-status'; st.textContent = '測試中…';
    quotes.fetchQuote('AAPL', key).then(function (r) {
      btn.disabled = false;
      if (r.ok || r.error === 'notfound') {
        storage.setApiKey(key);
        st.className = 'key-status ok'; st.textContent = '金鑰有效，已儲存';
        render();
        setTimeout(function () { closeKeyDialog(); refreshAll(true); }, 600);
      } else {
        st.className = 'key-status bad';
        st.textContent = r.error === 'badkey' ? '金鑰無效，請確認是否完整複製' : quotes.MESSAGES[r.error];
      }
    });
  });

  // ---------- 確認對話框 ----------
  var dlg = $('#dlg'), dlgResolve = null;
  function ask(opts) {
    $('#dlg-title').textContent = opts.title;
    $('#dlg-msg').textContent = opts.message || '';
    var ok = $('#dlg-ok');
    ok.textContent = opts.ok || '確定';
    ok.className = 'btn ' + (opts.danger ? 'danger' : 'primary');
    $('#dlg-cancel').hidden = !!opts.alert;
    if (typeof dlg.showModal !== 'function') {
      return Promise.resolve(opts.alert ? (window.alert(opts.title + '\n\n' + (opts.message || '')), true) : window.confirm(opts.title + '\n\n' + (opts.message || '')));
    }
    if (dlgResolve) finishDialog(false);
    return new Promise(function (resolve) {
      dlgResolve = resolve;
      dlg.showModal();
      (opts.alert || !opts.danger ? ok : $('#dlg-cancel')).focus();
    });
  }
  // 以按鈕點擊直接決定結果，不依賴 close 事件的觸發時機
  function finishDialog(result) {
    var r = dlgResolve;
    dlgResolve = null;
    if (dlg.open) dlg.close();
    if (r) r(result);
  }
  $('#dlg-ok').addEventListener('click', function () { finishDialog(true); });
  $('#dlg-cancel').addEventListener('click', function () { finishDialog(false); });
  dlg.addEventListener('cancel', function (e) { e.preventDefault(); finishDialog(false); });

  var toastT;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }

  // ---------- 匯出入 ----------
  function doExport() {
    store.markBackedUp(data);
    var out = store.exportPayload(data);
    var url = URL.createObjectURL(new Blob([out.text], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = out.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    storage.save(data); storage.flush();
    render();
    toast('已下載 ' + out.filename);
  }
  function doImport(file) {
    file.text().then(function (text) {
      var res = store.parseImport(text);
      if (!res.ok) return ask({ alert: true, title: res.error, message: '無法匯入「' + file.name + '」（' + res.detail + '）。目前的資料沒有任何改變。', ok: '知道了' });
      var incoming = res.data;
      var hasData = !onboarding && (data.holdings.length || data.sectors.length);
      var go = hasData
        ? ask({ title: '用備份檔覆蓋目前資料？', message: '「' + file.name + '」包含 ' + incoming.sectors.length + ' 個板塊、' + incoming.holdings.length + ' 檔持股。\n匯入後，這台裝置上目前的資料會被取代。', ok: '覆蓋並匯入', danger: true })
        : Promise.resolve(true);
      return go.then(function (yes) {
        if (!yes) return;
        incoming.prefs.theme = data.prefs.theme; // 深淺色是這台裝置的偏好
        data = incoming;
        untouched = {}; quoteErr = {}; openId = null; onboarding = false;
        $('#rows').innerHTML = ''; $('#slices').innerHTML = '';
        commit();
        toast('已匯入備份');
      });
    }).catch(function () {
      ask({ alert: true, title: '這不是有效的備份檔', message: '無法讀取這個檔案。目前的資料沒有任何改變。', ok: '知道了' });
    });
  }

  // ---------- 一般互動 ----------
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.hid) {
      if (t.dataset.k === 'sym') { openCombo(t); return; } // 選定後才寫入代號
      var h = holdingById(t.dataset.hid);
      if (!h) return;
      delete untouched[h.id];
      h[t.dataset.k] = parseNum(t.value);
      if (t.dataset.k === 'price') { h.quoteAt = null; delete quoteErr[h.id]; }
      commit();
    } else if (t.dataset && t.dataset.sectorName) {
      var s = sectorById(t.dataset.sectorName);
      if (s) { s.name = t.value; commit(); }
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'file-import') {
      if (e.target.files && e.target.files[0]) doImport(e.target.files[0]);
      e.target.value = '';
    }
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    var menu = $('#menu');
    if (!b || !b.closest('.menu-wrap')) menu.hidden = true;
    // 點列的名稱或空白處（不是軌道）展開／收合
    var main = e.target.closest('.row-main');
    if (main && !e.target.closest('.track') && performance.now() - dragEnded > 250) { toggle(main.closest('.row').dataset.id); return; }
    if (!b) return;
    if (b.id === 'menu-btn') { menu.hidden = !menu.hidden; b.setAttribute('aria-expanded', String(!menu.hidden)); return; }
    if (b.id === 'theme-btn') { data.prefs.theme = data.prefs.theme === 'light' ? 'dark' : 'light'; commit(); return; }
    if (b.id === 'refresh-btn') { refreshAll(false); return; }
    if (b.id === 'add-s') { addSector(); return; }
    if (b.dataset.open) { toggle(b.dataset.open, true); return; }
    if (b.dataset.preset) { ed.applyPreset(data.sectors, b.dataset.preset); commit(); toast('已把所有板塊的區間設為目標 ' + b.textContent); return; }
    if (b.dataset.addH) { addHolding(b.dataset.addH); return; }
    if (b.dataset.delH) { deleteHolding(b.dataset.delH); return; }
    if (b.dataset.delS) { deleteSector(b.dataset.delS); return; }
    switch (b.dataset.action) {
      case 'export': menu.hidden = true; doExport(); break;
      case 'import': menu.hidden = true; $('#file-import').click(); break;
      case 'key': menu.hidden = true; openKeyDialog(); break;
      case 'fix-sum': ed.normalizeTargets(data.sectors); commit(); break;
      case 'sample': {
        var theme = data.prefs.theme;
        data = store.sampleData();
        data.prefs.theme = theme;
        onboarding = false;
        commit();
        toast('已載入範例資料，數字都是虛構的');
        ensureSymbols();
        if (storage.getApiKey()) refreshAll(true);
        break;
      }
      case 'blank': {
        // 預設類別：火箭、光、軟體、電動車、醫療、半導體（沒有持股）
        var th = data.prefs.theme;
        data = store.defaultData();
        data.prefs.theme = th;
        onboarding = false;
        commit();
        toast('已建立預設類別，點板塊名稱開始新增持股');
        break;
      }
    }
  });

  function addSector() {
    var s = ed.addSector(data.sectors, store.uid('s'), '新板塊');
    openId = s.id;
    commit();
    var el = document.querySelector('.row[data-id="' + s.id + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () {
      var inp = document.querySelector('[data-sector-name="' + s.id + '"]');
      if (inp) { inp.focus(); inp.select(); }
    }, 320);
  }

  function deleteSector(id) {
    var s = sectorById(id);
    if (!s) return;
    var n = data.holdings.filter(function (h) { return h.sectorId === id; }).length;
    ask({
      title: '刪除「' + (s.name || '未命名') + '」板塊？',
      message: (n ? '這個板塊裡的 ' + n + ' 檔持股也會一起刪除。\n' : '') + '它的目標比例會加到相鄰的板塊，目標合計維持不變。',
      ok: '刪除', danger: true,
    }).then(function (yes) {
      if (!yes) return;
      ed.removeSector(data.sectors, id);
      data.holdings = data.holdings.filter(function (h) { return h.sectorId !== id; });
      if (openId === id) openId = null;
      commit();
      toast('已刪除「' + (s.name || '未命名') + '」');
    });
  }

  function addHolding(sectorId) {
    var h = { id: store.uid('h'), sym: '', sectorId: sectorId, shares: null, price: null, quoteAt: null };
    data.holdings.push(h);
    untouched[h.id] = true;
    commit();
    ensureSymbols();
    var inp = document.querySelector('input[data-hid="' + h.id + '"][data-k="sym"]');
    if (inp) inp.focus();
  }

  function deleteHolding(id) {
    data.holdings = data.holdings.filter(function (h) { return h.id !== id; });
    delete untouched[id]; delete quoteErr[id];
    commit();
  }

  // ---------- 圓環與列的連動 ----------
  function setFocus(id) {
    if (focusId === id) return;
    focusId = id;
    if (onboarding) return;
    renderDonut(compute());
    Array.prototype.slice.call(document.querySelectorAll('.row')).forEach(function (el) { el.classList.toggle('hl', el.dataset.id === focusId); });
  }
  $('#slices').addEventListener('pointerover', function (e) { var c = e.target.closest('.slice'); if (c) setFocus(c.dataset.id); });
  $('#slices').addEventListener('pointerout', function () { setFocus(null); });
  $('#slices').addEventListener('click', function (e) { var c = e.target.closest('.slice'); if (c) toggle(c.dataset.id, true); });
  $('#rows').addEventListener('pointerover', function (e) { var r = e.target.closest('.row'); if (r && !dragging) setFocus(r.dataset.id); });
  $('#rows').addEventListener('pointerleave', function () { if (!dragging) setFocus(null); });

  // 離開頁面前把尚未寫入的變更存起來
  window.addEventListener('pagehide', function () { storage.flush(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') storage.flush(); });

  // ---------- 開始 ----------
  render();
  if (!onboarding) {
    // 空閒時先載入代號清單，讓公司名稱可以顯示
    (window.requestIdleCallback || setTimeout)(function () { ensureSymbols(); }, 800);
    // 開啟時距上次更新超過 15 分鐘就自動更新報價
    var last = data.meta.lastQuoteAt ? Date.parse(data.meta.lastQuoteAt) : 0;
    if (storage.getApiKey() && Date.now() - last > 15 * 60 * 1000) refreshAll(true);
  }
})();
