/* 區間再平衡：資料模型、瀏覽器儲存、匯出入（瀏覽器與 Node 測試共用） */
(function (factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (window.BR = window.BR || {}).store = api;
})(function () {
  'use strict';

  var VERSION = 2;
  var KEY = 'band-rebalancer:v1';
  var API_KEY_KEY = 'band-rebalancer:finnhub-key';
  var APP = 'band-rebalancer';

  function uid(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** 裝置當地日期 YYYY-MM-DD */
  function localDate(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** 兩個日期（YYYY-MM-DD 或 Date）相差幾天，以當地日期計 */
  function daysBetween(a, b) {
    var da = typeof a === 'string' ? a : localDate(a);
    var db = typeof b === 'string' ? b : localDate(b);
    var pa = da.split('-').map(Number), pb = db.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }

  function emptyData() {
    return {
      version: VERSION,
      sectors: [],
      holdings: [],
      prefs: { theme: 'dark' },
      meta: { lastBackupAt: null, lastQuoteAt: null, since: null },
    };
  }

  /** 預設類別：從空白開始與範例資料都用這六個板塊（目標合計 100%，區間為目標 ±5 點） */
  function defaultSectors() {
    return [
      { id: 's_rocket', name: '火箭', lo: 10, target: 15, hi: 20 },
      { id: 's_optics', name: '光', lo: 10, target: 15, hi: 20 },
      { id: 's_software', name: '軟體', lo: 15, target: 20, hi: 25 },
      { id: 's_ev', name: '電動車', lo: 10, target: 15, hi: 20 },
      { id: 's_health', name: '醫療', lo: 10, target: 15, hi: 20 },
      { id: 's_semis', name: '半導體', lo: 15, target: 20, hi: 25 },
    ];
  }

  /** 從空白開始：只有預設類別，沒有持股 */
  function defaultData() {
    var d = emptyData();
    d.sectors = defaultSectors();
    return d;
  }

  /** 範例資料（虛構數字，僅供試用） */
  function sampleData() {
    var d = emptyData();
    d.sectors = defaultSectors();
    var rows = [
      ['RKLB', 's_rocket', 1000, 25], ['LUNR', 's_rocket', 1500, 12],
      ['COHR', 's_optics', 250, 90], ['LITE', 's_optics', 125, 80],
      ['MSFT', 's_software', 50, 480], ['CRM', 's_software', 80, 275],
      ['TSLA', 's_ev', 50, 440], ['RIVN', 's_ev', 500, 14],
      ['LLY', 's_health', 30, 800], ['ISRG', 's_health', 19, 500],
      ['NVDA', 's_semis', 200, 185], ['TSM', 's_semis', 70, 260], ['AMD', 's_semis', 50, 216],
    ];
    d.holdings = rows.map(function (r, i) {
      return { id: 'h_sample' + i, sym: r[0], sectorId: r[1], shares: r[2], price: r[3], quoteAt: null };
    });
    return d;
  }

  // ---------- 驗證與升級 ----------

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isNumOrNull(v) { return v === null || (typeof v === 'number' && Number.isFinite(v)); }
  function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }
  function isIso(v) { return typeof v === 'string' && !isNaN(Date.parse(v)); }

  /**
   * 驗證並正規化資料（接受版本 1 與 2，版本 1 會升級）。
   * 成功回傳 { ok: true, data }（全新的物件），失敗回傳 { ok: false, error }。
   */
  function validateData(input) {
    function fail(why) { return { ok: false, error: why }; }
    if (!isObj(input)) return fail('不是物件');
    if (!isFiniteNum(input.version)) return fail('缺少版本號');
    if (input.version > VERSION) return fail('備份檔版本比這個網頁新，請先更新網頁');
    if (!Array.isArray(input.sectors) || !Array.isArray(input.holdings)) return fail('缺少持股或板塊資料');

    var sectorIds = {};
    for (var i = 0; i < input.sectors.length; i++) {
      var s = input.sectors[i];
      if (!isObj(s) || typeof s.id !== 'string' || !s.id || typeof s.name !== 'string') return fail('板塊資料格式錯誤');
      if (sectorIds[s.id]) return fail('板塊代碼重複');
      if (!isNumOrNull(s.lo) || !isNumOrNull(s.target) || !isNumOrNull(s.hi)) return fail('板塊區間必須是數字');
      sectorIds[s.id] = true;
    }
    for (var j = 0; j < input.holdings.length; j++) {
      var h = input.holdings[j];
      if (!isObj(h) || typeof h.id !== 'string' || typeof h.sym !== 'string') return fail('持股資料格式錯誤');
      if (!(h.sectorId === null || h.sectorId === undefined || typeof h.sectorId === 'string')) return fail('持股板塊格式錯誤');
      if (!isNumOrNull(h.shares) || !isNumOrNull(h.price)) return fail('股數與價格必須是數字');
    }

    var prefs = isObj(input.prefs) ? input.prefs : {};
    var meta = isObj(input.meta) ? input.meta : {};
    var data = {
      version: VERSION,
      sectors: input.sectors.map(function (s) {
        return { id: s.id, name: s.name, lo: s.lo, target: s.target, hi: s.hi };
      }),
      holdings: [],
      prefs: { theme: prefs.theme === 'light' ? 'light' : 'dark' },
      meta: {
        lastBackupAt: isIso(meta.lastBackupAt) ? meta.lastBackupAt : null,
        lastQuoteAt: isIso(meta.lastQuoteAt) ? meta.lastQuoteAt : null,
        since: isIso(meta.since) ? meta.since : null,
      },
    };

    // 沒有板塊或指向不存在板塊的持股，放進「未分類」板塊（版本 1 允許未分類）
    var orphanId = null;
    input.holdings.forEach(function (h) {
      var sid = typeof h.sectorId === 'string' && sectorIds[h.sectorId] ? h.sectorId : null;
      if (sid === null) {
        if (!orphanId) {
          orphanId = 's_unassigned';
          while (sectorIds[orphanId]) orphanId += '_';
          data.sectors.push({ id: orphanId, name: '未分類', lo: 0, target: 0, hi: 100 });
        }
        sid = orphanId;
      }
      data.holdings.push({
        id: h.id, sym: h.sym.trim().toUpperCase(), sectorId: sid, shares: h.shares, price: h.price,
        quoteAt: isIso(h.quoteAt) ? h.quoteAt : null,
      });
    });
    return { ok: true, data: data };
  }

  // ---------- 儲存 ----------

  /**
   * 建立瀏覽器儲存介面。storage 為 localStorage（或測試用的假物件）。
   * 回傳 { available, load(), save(data), flush(), getApiKey(), setApiKey(k) }
   */
  function createStorage(storage, opts) {
    var delay = opts && typeof opts.delay === 'number' ? opts.delay : 300;
    var available = false;
    try {
      var probe = KEY + ':probe';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      available = true;
    } catch (e) {
      available = false;
    }
    var memKey = '';
    var pending = null, timer = null;
    var api = {
      available: available,
      lastError: null,
      /** 回傳已保存的資料；沒有資料回傳 null；資料損毀回傳 null 並把原始內容另存備查 */
      load: function () {
        if (!available) return null;
        var raw;
        try { raw = storage.getItem(KEY); } catch (e) { return null; }
        if (!raw) return null;
        try {
          var res = validateData(JSON.parse(raw));
          if (res.ok) return res.data;
        } catch (e) { /* 損毀 */ }
        try { storage.setItem(KEY + ':corrupt', raw); } catch (e) { /* 忽略 */ }
        return null;
      },
      save: function (data) {
        if (!available) return false;
        pending = data;
        if (timer) clearTimeout(timer);
        if (delay <= 0) return api.flush();
        timer = setTimeout(api.flush, delay);
        return true;
      },
      flush: function () {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!available || pending === null) return true;
        try {
          storage.setItem(KEY, JSON.stringify(pending));
          pending = null;
          api.lastError = null;
          return true;
        } catch (e) {
          api.lastError = e;
          return false;
        }
      },
      /** Finnhub 金鑰另外存放，不會進入資料與備份檔 */
      getApiKey: function () {
        if (!available) return memKey;
        try { return storage.getItem(API_KEY_KEY) || ''; } catch (e) { return memKey; }
      },
      setApiKey: function (k) {
        memKey = k || '';
        if (!available) return;
        try {
          if (k) storage.setItem(API_KEY_KEY, k); else storage.removeItem(API_KEY_KEY);
        } catch (e) { /* 只留在記憶體 */ }
      },
    };
    return api;
  }

  // ---------- 匯出入 ----------

  /** 產生匯出檔：{ filename, text }（只包含資料本身，不含金鑰） */
  function exportPayload(data, now) {
    now = now || new Date();
    var out = JSON.parse(JSON.stringify(data));
    out.app = APP;
    out.exportedAt = now.toISOString();
    return { filename: 'rebalance-backup-' + localDate(now) + '.json', text: JSON.stringify(out, null, 2) };
  }

  function markBackedUp(data, now) {
    data.meta.lastBackupAt = (now || new Date()).toISOString();
    return data;
  }

  /** 解析匯入檔文字。成功 { ok: true, data }；失敗 { ok: false, error: '這不是有效的備份檔', detail } */
  function parseImport(text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: '這不是有效的備份檔', detail: '不是 JSON 格式' }; }
    var res = validateData(obj);
    if (!res.ok) return { ok: false, error: '這不是有效的備份檔', detail: res.error };
    return res;
  }

  return {
    VERSION: VERSION,
    KEY: KEY,
    API_KEY_KEY: API_KEY_KEY,
    uid: uid,
    localDate: localDate,
    daysBetween: daysBetween,
    emptyData: emptyData,
    sampleData: sampleData,
    defaultSectors: defaultSectors,
    defaultData: defaultData,
    validateData: validateData,
    createStorage: createStorage,
    exportPayload: exportPayload,
    markBackedUp: markBackedUp,
    parseImport: parseImport,
  };
});
