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
  var afterView = false; // 是否在看「照建議交易後」的樣子
  var editId = null;      // 正在編輯股票清單的板塊（其他板塊只顯示代號與股數）
  var untouched = {};   // 剛新增、還沒填過的持股，先不標紅框
  var quoteErr = {};    // 持股 id → 查價錯誤代碼（只存在記憶體）
  var symIndex = null, symNames = null, symLoading = null;

  var ICON = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 8v5"/><circle cx="12" cy="16.6" r=".6" fill="currentColor"/><path d="M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
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
  // 回傳 { before, after, plans, cash }：目前狀態、照建議交易後的狀態、每個超出板塊的交易建議
  function compute() {
    var R = calc.rebalance(data.sectors, data.holdings);
    R.before.rows.forEach(function (r, i) { r.i = i; });
    R.after.rows.forEach(function (r, i) { r.i = i; });
    return R;
  }
  function isOut(r) { return r.status === 'over' || r.status === 'under'; }
  function planSummary(p) {
    if (!p.trades.length) return (p.side === 'sell' ? '賣出' : '買入') + '約 ' + usd(p.amount) + '（還沒有持股）';
    return (p.side === 'sell' ? '賣 ' : '買 ') + p.trades.map(function (t) { return esc(t.sym) + ' ' + t.shares.toLocaleString('en-US'); }).join('、') + ' 股';
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
    Array.prototype.slice.call(document.querySelectorAll('[data-tol]')).forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.tol === tol())); });
    $('#menu-meta').textContent = '股數只存在這台裝置；查價格時只送出股票代號・' +
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

  // ---------- 總市值 ----------
  function countTo(el, to) {
    var from = +el.dataset.v || 0, t0 = performance.now(), dur = first ? 1100 : 400;
    el.dataset.v = to;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = usd(to); return; }
    function step(t) {
      var p = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - p, 3);
      el.textContent = usd(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderTotal(R) {
    var src = afterView ? R.after : R.before;
    $('#total-label').textContent = afterView ? '調整後總值' : '總值';
    countTo($('#total-v'), src.total);
    $('#total-sub').textContent = '';
    var outs = R.before.rows.filter(isOut).length;
    var b = $('#after-btn');
    b.textContent = afterView ? '回到現在' : outs ? '看調整後的樣子' : '不用調整';
    b.classList.toggle('on', afterView);
    b.disabled = !afterView && !outs;
    b.setAttribute('aria-pressed', String(afterView));
  }

  // ---------- 配置流向圖：上排目標、下排目前（或調整後），彩帶連接同一個板塊 ----------
  var flowShown = null, flowRaf = null;
  var FBAR = 46, FYT = 22, FYB = 222;

  function renderFlow(R) {
    var src = afterView ? R.after : R.before;
    var goal = {}, goalCash = afterView && R.cash > 0 && src.total > 0 ? (R.cash / src.total) * 100 : 0;
    src.rows.forEach(function (r) { goal[r.id] = r.weight; });
    if (!flowShown) {
      flowShown = { w: {}, cash: 0 };
      src.rows.forEach(function (r) { flowShown.w[r.id] = calc.isNum(r.target) ? r.target : 0; });
    }
    var from = { w: Object.assign({}, flowShown.w), cash: flowShown.cash };
    var instant = !!dragging || matchMedia('(prefers-reduced-motion: reduce)').matches;
    var t0 = performance.now(), dur = instant ? 0 : 800;
    cancelAnimationFrame(flowRaf);
    function frame(now) {
      var p = dur ? Math.max(0, Math.min(1, (now - t0) / dur)) : 1, e = 1 - Math.pow(1 - p, 3);
      var w = {};
      src.rows.forEach(function (r) { var a = from.w[r.id]; if (a == null) a = goal[r.id]; w[r.id] = a + (goal[r.id] - a) * e; });
      flowShown = { w: w, cash: from.cash + (goalCash - from.cash) * e };
      drawFlow(R, src, flowShown);
      if (p < 1) flowRaf = requestAnimationFrame(frame);
    }
    if (instant) frame(t0); else flowRaf = requestAnimationFrame(frame);
  }

  function drawFlow(R, src, shown) {
    var svg = $('#flow');
    var rows = src.rows;
    if (!rows.length) { svg.innerHTML = ''; return; }
    // 窄螢幕用較窄的畫布，讓色塊與文字不會被縮得太小
    var vw = svg.clientWidth && svg.clientWidth < 600 ? 400 : 880;
    if (svg.getAttribute('viewBox') !== '0 0 ' + vw + ' 300') svg.setAttribute('viewBox', '0 0 ' + vw + ' 300');
    var FX0 = vw < 600 ? 40 : 60, FX1 = vw - 4;
    var span = FX1 - FX0, gap = 4;
    var tSum = rows.reduce(function (a, r) { return a + (calc.isNum(r.target) ? r.target : 0); }, 0);
    var bSum = rows.reduce(function (a, r) { return a + shown.w[r.id]; }, 0) + shown.cash;
    var g = '<text x="0" y="' + (FYT + FBAR / 2 + 5) + '" class="row-lbl">目標</text>' +
      '<text x="0" y="' + (FYB + FBAR / 2 + 5) + '" class="row-lbl">' + (afterView ? '調整後' : '現在') + '</text>';
    if (tSum <= 0) { svg.innerHTML = g; return; }
    var at = 0, ab = 0, labels = '';
    rows.forEach(function (r) {
      var tv = calc.isNum(r.target) ? r.target : 0, w = shown.w[r.id];
      var t0 = FX0 + (at / tSum) * span, t1 = FX0 + ((at + tv) / tSum) * span;
      var b0 = bSum > 0 ? FX0 + (ab / bSum) * span : t0, b1 = bSum > 0 ? FX0 + ((ab + w) / bSum) * span : t0;
      at += tv; ab += w;
      var valid = r.status !== 'invalid';
      var rw = calc.r1(w);
      var out = valid && bSum > 0 && (rw > r.hi || rw < r.lo);
      var fixed = afterView && R.plans[r.id] && !out;
      var yt = FYT + FBAR, yb = FYB, my = (yt + yb) / 2;
      var hasB = b1 - b0 > gap, hasT = t1 - t0 > gap;
      var ribbon = hasT && hasB
        ? 'M ' + (t0 + gap / 2) + ' ' + yt + ' C ' + (t0 + gap / 2) + ' ' + my + ', ' + (b0 + gap / 2) + ' ' + my + ', ' + (b0 + gap / 2) + ' ' + yb +
          ' L ' + (b1 - gap / 2) + ' ' + yb + ' C ' + (b1 - gap / 2) + ' ' + my + ', ' + (t1 - gap / 2) + ' ' + my + ', ' + (t1 - gap / 2) + ' ' + yt + ' Z'
        : '';
      var cxT = (t0 + t1) / 2, cxB = (b0 + b1) / 2;
      var ink = r.i % 7 === 3 ? '#1a1a19' : '#fff';
      var on = r.id === focusId || r.id === openId;
      g += '<g class="fx' + (on ? ' on' : '') + '" data-s="' + esc(r.id) + '">' +
        (ribbon ? '<path class="' + (out ? 'pulse' : '') + '" d="' + ribbon + '" fill="' + (out ? 'var(--critical)' : fixed ? 'var(--good)' : color(r.i)) + '" fill-opacity="' + (out ? 0.42 : fixed ? 0.3 : 0.22) + '"/>' : '') +
        (out && ribbon ? '<path class="flowing" d="M ' + cxT + ' ' + (yt + 4) + ' C ' + cxT + ' ' + my + ', ' + cxB + ' ' + my + ', ' + cxB + ' ' + (yb - 4) + '" stroke="#fff" stroke-opacity=".75" stroke-width="2.5" fill="none" stroke-linecap="round"/>' : '') +
        (hasT ? '<rect x="' + (t0 + gap / 2) + '" y="' + FYT + '" width="' + (t1 - t0 - gap) + '" height="' + FBAR + '" rx="9" fill="' + color(r.i) + '"/>' : '') +
        (hasB ? '<rect x="' + (b0 + gap / 2) + '" y="' + FYB + '" width="' + (b1 - b0 - gap) + '" height="' + FBAR + '" rx="9" fill="' + color(r.i) + '"' + (out ? ' stroke="var(--critical)" stroke-width="3"' : fixed ? ' stroke="var(--good)" stroke-width="3"' : '') + '/>' : '') +
        (t1 - t0 > 46 ? '<text x="' + cxT + '" y="' + (FYT + 20) + '" text-anchor="middle" class="seg-name" style="fill:' + ink + '">' + esc(r.name || '未命名') + '</text><text x="' + cxT + '" y="' + (FYT + 36) + '" text-anchor="middle" class="seg-pct" style="fill:' + ink + '">' + fmtP(tv) + '</text>' : '') +
        (b1 - b0 > 46 ? '<text x="' + cxB + '" y="' + (FYB + 20) + '" text-anchor="middle" class="seg-name" style="fill:' + ink + '">' + esc(r.name || '未命名') + '</text><text x="' + cxB + '" y="' + (FYB + 36) + '" text-anchor="middle" class="seg-pct" style="fill:' + ink + '">' + pctTxt(w, r) + '</text>' : '') +
        '</g>';
      var lx = (cxT + cxB) / 2, dev = w - tv, sg = (dev > 0 ? '+' : dev < 0 ? '−' : '±') + Math.abs(dev).toFixed(1);
      var plan = R.plans[r.id];
      if (out && plan && !afterView) {
        var txt = (dev > 0 ? '多了 ' : '少了 ') + Math.round(Math.abs(dev)) + '%';
        var wd = txt.length * 13 + 24;
        var lxc = Math.max(wd / 2 + 2, Math.min(vw - wd / 2 - 2, lx)); // 標籤不要超出畫布
        labels += '<g pointer-events="none" transform="translate(' + lxc + ',' + my + ')"><rect x="' + (-wd / 2) + '" y="-15" width="' + wd + '" height="30" rx="15" fill="var(--critical)"/><text text-anchor="middle" y="5" style="fill:#fff;font-weight:700;font-size:13px">' + txt + '</text></g>';
      } else if (fixed) {
        labels += '<g pointer-events="none" transform="translate(' + lx + ',' + my + ')"><rect x="-34" y="-15" width="68" height="30" rx="15" fill="var(--good)"/><text text-anchor="middle" y="5" style="fill:#06240f;font-weight:700;font-size:13px">✓ 剛好</text></g>';
      }
    });
    if (shown.cash > 0.05 && bSum > 0) {
      var c0 = FX0 + (ab / bSum) * span, c1 = FX0 + ((ab + shown.cash) / bSum) * span;
      g += '<rect x="' + (c0 + 2) + '" y="' + FYB + '" width="' + Math.max(0, c1 - c0 - 4) + '" height="' + FBAR + '" rx="9" fill="var(--muted)" fill-opacity=".55" stroke="var(--muted)" stroke-dasharray="4 3"/>' +
        '<text x="' + Math.min(c1, FX1) + '" y="' + (FYB + FBAR + 18) + '" text-anchor="end" class="row-lbl">現金 +' + usd(R.cash) + '</text>';
    }
    if (bSum <= 0) labels += '<text x="' + ((FX0 + FX1) / 2) + '" y="' + (FYB + FBAR / 2 + 5) + '" text-anchor="middle" class="row-lbl">還沒有持股</text>';
    svg.innerHTML = g + labels;
    svg.classList.toggle('dimmed', !!focusId);
  }

  // ---------- 結論：一句話 ----------
  function tradeSentence(p) {
    if (!p.trades.length) return (p.side === 'sell' ? '賣出' : '買入') + '約 ' + usd(p.amount);
    return (p.side === 'sell' ? '賣 ' : '買 ') + p.trades.map(function (t) { return esc(t.sym) + ' ' + t.shares.toLocaleString('en-US') + ' 股'; }).join('、');
  }
  function renderVerdict(R) {
    var v = $('#verdict'), p = R.before;
    if (!p.rows.length) {
      v.className = 'verdict ok';
      v.innerHTML = '<h2><span class="ic">' + ICON.info + '</span>先新增板塊</h2><p>按下方「新增板塊」開始。</p>';
      return;
    }
    if (p.total <= 0) {
      v.className = 'verdict ok';
      v.innerHTML = '<h2><span class="ic">' + ICON.info + '</span>先填你的股票</h2><p>點下面的板塊名稱，按「新增股票」，搜尋代號並填股數。</p>';
      return;
    }
    var outs = p.rows.filter(isOut);
    if (afterView) {
      var still = R.after.rows.filter(isOut);
      v.className = 'verdict ' + (still.length ? 'bad' : 'ok');
      v.innerHTML = '<h2><span class="ic">' + (still.length ? ICON.warn : ICON.ok) + '</span>' + (still.length ? '還有 ' + still.length + ' 個板塊要自己處理' : '照建議調整後，每個板塊都剛好') + '</h2>' +
        '<p>' + (R.cash > 0 ? '賣出的 ' + usd(R.cash) + ' 先放著當現金。' : R.cash < 0 ? '需要另外準備 ' + usd(R.cash) + ' 來買。' : '') + '</p>';
      return;
    }
    if (outs.length) {
      v.className = 'verdict bad';
      v.innerHTML = '<h2><span class="ic">' + ICON.warn + '</span>' + outs.map(function (r) { return esc(r.name || '未命名') + (r.status === 'over' ? '太多了' : '太少了'); }).join('、') + '</h2>' +
        '<p class="todo-line">' + outs.map(function (r) { return '<button class="link" type="button" data-open="' + esc(r.id) + '">' + esc(r.name || '未命名') + '</button>：' + tradeSentence(R.plans[r.id]); }).join('<br>') + '</p>' +
        '<p>其他板塊都剛好，不用動。</p>';
    } else {
      v.className = 'verdict ok';
      v.innerHTML = '<h2><span class="ic">' + ICON.ok + '</span>都剛好，這次不用動</h2><p>每個板塊都在目標 ±' + tol() + '% 以內。</p>';
    }
  }

  // ---------- 白話的數字 ----------
  function tol() { return data.prefs.tol || 5; }
  // 比例顯示整數；剛好卡在邊界時多顯示一位小數，避免出現「25% 卻說太多了」
  function pctTxt(w, r) {
    var n = Math.round(w);
    if (r && calc.isNum(r.hi) && ((n === r.hi && calc.r1(w) > r.hi) || (n === r.lo && calc.r1(w) < r.lo))) return calc.r1(w).toFixed(1) + '%';
    return n + '%';
  }
  // 目標改了，可接受範圍跟著目標 ± 差距
  function setTarget(s, v) {
    s.target = Math.max(0, Math.min(100, v));
    s.lo = Math.max(0, s.target - tol());
    s.hi = Math.min(100, s.target + tol());
  }
  function setTol(n) {
    data.prefs.tol = n;
    data.sectors.forEach(function (s) { if (calc.isNum(s.target)) setTarget(s, s.target); });
  }

  function renderSum() {
    var el = $('#sum-line');
    var sum = calc.targetSum(data.sectors);
    var ok = !data.sectors.length || Math.abs(sum - 100) < 0.001;
    el.hidden = ok;
    if (!ok) el.innerHTML = ICON.warn + '<span>所有目標加起來是 ' + fmtP(sum) + '，應該是 100%。</span><button class="link" type="button" data-action="fix-sum">幫我調成 100%</button>';
  }

  // ---------- 板塊清單：每個板塊一行 ----------
  function buildRow(r) {
    var el = document.createElement('div');
    el.className = 'row'; el.dataset.id = r.id; el.setAttribute('role', 'listitem');
    el.innerHTML = '<button class="row-main" type="button" aria-expanded="false">' +
      '<i class="sw"></i><span class="t"></span><span class="nums"></span><span class="act"></span>' + ICON.chev + '</button>' +
      '<div class="detail"><div><div class="detail-in"><div class="planbox"></div><div class="hold"></div></div></div></div>';
    return el;
  }

  function renderRows(R) {
    var p = R.before, box = $('#rows');
    if (!p.rows.length) {
      box.innerHTML = '<div class="rows-empty">還沒有板塊。按下方「新增板塊」開始。</div>';
      return;
    }
    var empty = box.querySelector('.rows-empty');
    if (empty) empty.remove();
    p.rows.forEach(function (r, idx) {
      var el = box.querySelector('.row[data-id="' + r.id + '"]');
      var fresh = !el;
      if (fresh) el = buildRow(r);
      // 只在位置不對時才移動，移動節點會讓裡面的輸入框失焦
      if (box.children[idx] !== el) box.insertBefore(el, box.children[idx] || null);
      if (fresh || el.dataset.hv !== holdingsVersion(r.id)) renderHoldings(el, r);
      var plan = R.plans[r.id], a = R.after.rows[idx];
      var d = afterView ? a : r;
      var out = isOut(d);
      el.querySelector('.sw').style.background = color(r.i);
      el.querySelector('.t').textContent = r.name || '未命名';
      el.querySelector('.nums').innerHTML = p.total > 0
        ? '現在 <b>' + pctTxt(d.weight, d) + '</b><span>・目標 ' + fmtP(r.target) + '</span>'
        : '<span>目標 ' + fmtP(r.target) + '</span>';
      var act = el.querySelector('.act');
      if (afterView && plan && !out) { act.className = 'act ok'; act.textContent = '✓ 調整後剛好'; }
      else if (out) { act.className = 'act bad'; act.textContent = d.status === 'over' ? '太多了' : '太少了'; }
      else if (r.status === 'empty') { act.className = 'act muted'; act.textContent = '還沒有持股'; }
      else if (r.status === 'invalid') { act.className = 'act muted'; act.textContent = '請設定目標'; }
      else { act.className = 'act ok'; act.textContent = '✓ 剛好'; }
      renderPlan(el, r, plan, a);
      updateHoldingCells(el, r);
      el.classList.toggle('open', openId === r.id);
      el.classList.toggle('hl', focusId === r.id);
      el.classList.toggle('is-out', out);
      el.querySelector('.row-main').setAttribute('aria-expanded', String(openId === r.id));
    });
    Array.prototype.slice.call(box.querySelectorAll('.row')).forEach(function (el) {
      if (!p.rows.some(function (r) { return r.id === el.dataset.id; })) el.remove();
    });
  }

  // 要做什麼：每檔要買賣幾股
  function renderPlan(el, r, plan, after) {
    var box = el.querySelector('.planbox');
    if (!plan) {
      box.innerHTML = '<p class="calm-line">' + (r.status === 'empty' ? '先在下面新增股票，填好股數就會開始計算。'
        : '現在 ' + pctTxt(r.weight, r) + '，目標 ' + fmtP(r.target) + '，差距在 ' + tol() + '% 以內，不用動。') + '</p>';
      return;
    }
    var sell = plan.side === 'sell';
    if (!plan.trades.length) {
      box.innerHTML = '<div class="plan ' + (sell ? '' : 'buy') + '"><h4>' + (sell ? '建議賣出' : '建議買入') + '約 ' + usd(plan.amount) + '</h4><p>這個板塊還沒有股票，先在下面新增想' + (sell ? '賣' : '買') + '的股票。</p></div>';
      return;
    }
    box.innerHTML = '<div class="plan ' + (afterView ? 'done' : sell ? '' : 'buy') + '">' +
      '<h4>' + (afterView ? '已照建議調整' : sell ? '建議賣出' : '建議買入') + '</h4><ul>' +
      plan.trades.map(function (t) {
        return '<li><b>' + esc(t.sym) + '</b><span class="' + t.side + '">' + (sell ? '賣 ' : '買 ') + t.shares.toLocaleString('en-US') + ' 股</span><small>約 ' + usd(t.value) + '</small></li>';
      }).join('') + '</ul>' +
      '<p>' + (sell ? '賣完' : '買完') + '後從 ' + pctTxt(r.weight, r) + ' 變成約 ' + pctTxt(after.weight) + '，回到目標附近。</p></div>';
  }

  // 持股清單：結構改變時才重建；打字時只更新提示文字
  function holdingsVersion(sectorId) {
    var list = data.holdings.filter(function (h) { return h.sectorId === sectorId; });
    // 編輯中只看有哪些持股（打字時不重建）；瀏覽時代號、股數變了就要更新標籤
    if (editId === sectorId) return 'edit:' + list.map(function (h) { return h.id; }).join(',');
    return 'view:' + list.map(function (h) { return h.id + '=' + h.sym + '@' + h.shares; }).join(',');
  }
  function sharesTxt(n) { return calc.isNum(n) ? (Number.isInteger(n) ? n.toLocaleString('en-US') : String(n)) : '—'; }

  function renderHoldings(el, r) {
    var list = data.holdings.filter(function (h) { return h.sectorId === r.id; });
    el.dataset.hv = holdingsVersion(r.id);
    if (editId !== r.id) {
      // 瀏覽：一排小標籤，只寫代號與股數
      var chips = list.filter(function (h) { return h.sym; }).map(function (h) {
        return quotes.isCash(h.sym)
          ? '<span class="hchip"><b>現金</b><small>' + (calc.isNum(h.shares) ? usd(h.shares) : '—') + '</small></span>'
          : '<span class="hchip" title="' + esc(symNames && symNames[h.sym] || h.sym) + '"><b>' + esc(h.sym) + '</b><small>' + sharesTxt(h.shares) + ' 股</small></span>';
      }).join('');
      el.querySelector('.hold').innerHTML = '<div class="hview">' + (chips || '<span class="tip">還沒有股票</span>') +
        '<button class="edit-btn" type="button" data-edit-s="' + esc(r.id) + '">' + (list.length ? ICON.pen + '編輯' : ICON.plus + '新增股票') + '</button></div>';
      return;
    }
    el.querySelector('.hold').innerHTML =
      '<div class="set-row">' +
      '<label>名稱<input data-sector-name="' + esc(r.id) + '" value="' + esc(r.name) + '" placeholder="板塊名稱"></label>' +
      '<label>目標<input class="num tgt-in" type="number" inputmode="decimal" min="0" max="100" step="1" data-sector-target="' + esc(r.id) + '" value="' + (calc.isNum(r.target) ? r.target : '') + '">%</label>' +
      '</div>' +
      '<table><thead><tr><th>股票</th><th class="num">股數</th><th class="num">價格</th><th><span class="sr-only">刪除</span></th></tr></thead><tbody>' +
      (list.map(function (h) {
        var a = 'data-hid="' + esc(h.id) + '"';
        return '<tr ' + a + '>' +
          '<td class="symcell"><input class="sym" ' + a + ' data-k="sym" value="' + esc(h.sym) + '" placeholder="輸入代號或公司名" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="combo" aria-label="股票代號"><small class="cname" data-cell="cn"></small></td>' +
          '<td><input class="num" type="number" inputmode="decimal" min="0" step="any" ' + a + ' data-k="shares" value="' + (h.shares == null ? '' : h.shares) + '" aria-label="股數"></td>' +
          '<td><input class="num" type="number" inputmode="decimal" min="0" step="any" ' + a + ' data-k="price" value="' + (h.price == null ? '' : h.price) + '" aria-label="價格"><small class="pmeta" data-cell="pm"></small></td>' +
          '<td><button class="del" type="button" data-del-h="' + esc(h.id) + '" aria-label="刪除 ' + esc(h.sym || '這筆') + '" title="刪除">' + ICON.trash + '</button></td></tr>';
      }).join('') || '<tr><td colspan="4" class="tip" style="padding:12px 6px">還沒有股票</td></tr>') +
      '</tbody></table>' +
      '<div class="hold-foot"><button class="add" type="button" data-add-h="' + esc(r.id) + '">' + ICON.plus + '新增股票</button>' +
      '<span class="tip">現金：代號打 USD，股數填金額</span>' +
      '<button class="text-btn" type="button" data-del-s="' + esc(r.id) + '">刪除這個板塊</button>' +
      '<button class="done-btn" type="button" data-done-s="' + esc(r.id) + '">完成</button></div>';
  }

  function updateHoldingCells(el, r) {
    Array.prototype.slice.call(el.querySelectorAll('tr[data-hid]')).forEach(function (tr) {
      var h = holdingById(tr.dataset.hid);
      if (!h) return;
      var errs = untouched[h.id] ? {} : calc.holdingErrors(h);
      ['shares', 'price'].forEach(function (k) {
        var inp = tr.querySelector('input[data-k="' + k + '"]');
        inp.setAttribute('aria-invalid', errs[k] ? 'true' : 'false');
        inp.title = errs[k] || '';
      });
      var cn = tr.querySelector('[data-cell="cn"]');
      if (quotes.isCash(h.sym)) cn.textContent = '現金（美元）';
      else if (!h.sym) cn.textContent = '';
      else if (symNames) cn.textContent = symNames[h.sym] || '清單中找不到，價格請自己填';
      else cn.textContent = '';
      var pm = tr.querySelector('[data-cell="pm"]');
      if (pm.dataset.loading) return;
      var err = quoteErr[h.id];
      pm.className = 'pmeta' + (h.quoteAt && !err ? ' live' : err ? ' err' : '');
      pm.textContent = quotes.isCash(h.sym) ? '' : err ? quotes.MESSAGES[err] : h.quoteAt ? '最新・' + hhmm(h.quoteAt) : '';
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
    renderTotal(p);
    renderFlow(p);
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
    if (editId && editId !== openId) editId = null;
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
  var resizeT;
  window.addEventListener('resize', function () {
    if (comboFor) positionCombo(comboFor);
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (!onboarding) renderFlow(compute()); }, 150);
  });

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
        $('#rows').innerHTML = ''; flowShown = null; afterView = false;
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
    } else if (t.dataset && t.dataset.sectorTarget) {
      var st = sectorById(t.dataset.sectorTarget);
      var v = parseNum(t.value);
      if (st && v !== null) { setTarget(st, v); commit(); }
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
    if (b.dataset.editS) {
      editId = b.dataset.editS;
      if (!data.holdings.some(function (h) { return h.sectorId === editId; })) { addHolding(editId); return; }
      render();
      return;
    }
    if (b.dataset.doneS) { editId = null; render(); return; }
    if (b.dataset.delH) { deleteHolding(b.dataset.delH); return; }
    if (b.dataset.delS) { deleteSector(b.dataset.delS); return; }
    switch (b.dataset.action) {
      case 'export': menu.hidden = true; doExport(); break;
      case 'import': menu.hidden = true; $('#file-import').click(); break;
      case 'key': menu.hidden = true; openKeyDialog(); break;
      case 'fix-sum':
        ed.normalizeTargets(data.sectors);
        data.sectors.forEach(function (x) { setTarget(x, x.target); });
        commit();
        break;
      case 'tol':
        setTol(+b.dataset.tol);
        menu.hidden = true;
        commit();
        toast('差距超過 ' + b.dataset.tol + '% 才建議調整');
        break;
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
    setTarget(s, s.target);
    editId = s.id; // 新板塊直接進入編輯，方便取名
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
    editId = sectorId;
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
    var svg = $('#flow');
    svg.classList.toggle('dimmed', !!focusId);
    Array.prototype.slice.call(svg.querySelectorAll('.fx')).forEach(function (g) { g.classList.toggle('on', g.dataset.s === focusId || g.dataset.s === openId); });
    Array.prototype.slice.call(document.querySelectorAll('.row')).forEach(function (el) { el.classList.toggle('hl', el.dataset.id === focusId); });
  }
  $('#flow').addEventListener('pointerover', function (e) { var g = e.target.closest('.fx'); setFocus(g ? g.dataset.s : null); });
  $('#flow').addEventListener('pointerleave', function () { setFocus(null); });
  $('#flow').addEventListener('click', function (e) { var g = e.target.closest('.fx'); if (g) toggle(g.dataset.s, true); });
  $('#after-btn').addEventListener('click', function () {
    afterView = !afterView;
    render();
    if (afterView) toast('這是照建議交易後的樣子，實際交易請自行在券商操作');
  });
  $('#rows').addEventListener('pointerover', function (e) { var r = e.target.closest('.row'); if (r && !dragging) setFocus(r.dataset.id); });
  $('#rows').addEventListener('pointerleave', function () { if (!dragging) setFocus(null); });

  // 離開頁面前把尚未寫入的變更存起來
  window.addEventListener('pagehide', function () { storage.flush(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') storage.flush(); });

  // ---------- 開始 ----------
  render();
  if (!onboarding) {
    // 空閒時先載入代號清單，讓公司名稱可以顯示
    // requestIdleCallback 的第二個參數必須是物件，所以先用 setTimeout 延遲，再交給閒置時間執行
    setTimeout(function () {
      if (window.requestIdleCallback) window.requestIdleCallback(ensureSymbols); else ensureSymbols();
    }, 800);
    // 開啟時距上次更新超過 15 分鐘就自動更新報價
    var last = data.meta.lastQuoteAt ? Date.parse(data.meta.lastQuoteAt) : 0;
    if (storage.getApiKey() && Date.now() - last > 15 * 60 * 1000) refreshAll(true);
  }
})();
