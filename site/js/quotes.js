/* 區間再平衡：Finnhub 報價查詢（可注入 fetch，便於測試） */
(function (factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (window.BR = window.BR || {}).quotes = api;
})(function () {
  'use strict';

  var BASE = 'https://finnhub.io/api/v1/quote';
  var MAX_PARALLEL = 5;

  function isCash(sym) {
    return sym === 'USD' || sym === 'CASH';
  }

  /** 查詢單一代號。成功 { ok: true, price }；失敗 { ok: false, error: 'nokey'|'badkey'|'ratelimit'|'notfound'|'network'|'http' } */
  function fetchQuote(sym, key, fetchImpl) {
    if (!key) return Promise.resolve({ ok: false, error: 'nokey' });
    var f = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    var url = BASE + '?symbol=' + encodeURIComponent(sym) + '&token=' + encodeURIComponent(key);
    return f(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer' }).then(function (res) {
      if (res.status === 401 || res.status === 403) return { ok: false, error: 'badkey' };
      if (res.status === 429) return { ok: false, error: 'ratelimit' };
      if (!res.ok) return { ok: false, error: 'http' };
      return res.json().then(function (j) {
        var c = j && typeof j.c === 'number' ? j.c : 0;
        return c > 0 ? { ok: true, price: c } : { ok: false, error: 'notfound' };
      });
    }, function () {
      return { ok: false, error: 'network' };
    });
  }

  /**
   * 查詢多個代號（現金略過、重複代號只查一次），最多 MAX_PARALLEL 個同時進行。
   * 回傳 Promise<{ 代號: 結果 }>
   */
  function fetchMany(symbols, key, fetchImpl, onEach) {
    var uniq = [];
    symbols.forEach(function (s) { if (s && !isCash(s) && uniq.indexOf(s) < 0) uniq.push(s); });
    var results = {}, next = 0;
    function worker() {
      if (next >= uniq.length) return Promise.resolve();
      var sym = uniq[next++];
      return fetchQuote(sym, key, fetchImpl).then(function (r) {
        results[sym] = r;
        if (onEach) onEach(sym, r);
        return worker();
      });
    }
    var workers = [];
    for (var i = 0; i < Math.min(MAX_PARALLEL, uniq.length); i++) workers.push(worker());
    return Promise.all(workers).then(function () { return results; });
  }

  var MESSAGES = {
    nokey: '尚未設定 Finnhub 金鑰',
    badkey: '金鑰無效，請到報價設定重新貼上',
    ratelimit: '查詢太頻繁，請稍後再試',
    notfound: '查無報價',
    network: '網路連線失敗，請稍後再試',
    http: 'Finnhub 暫時無法回應，請稍後再試',
  };

  return { BASE: BASE, MAX_PARALLEL: MAX_PARALLEL, isCash: isCash, fetchQuote: fetchQuote, fetchMany: fetchMany, MESSAGES: MESSAGES };
});
