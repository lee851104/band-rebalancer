/* 區間再平衡：美股代號模糊搜尋（純函式） */
(function (factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (window.BR = window.BR || {}).search = api;
})(function () {
  'use strict';

  var SPLIT = /[\s.,&()'\/-]+/;

  /** 把 [代號, 名稱, ETF] 清單轉成搜尋用的索引（預先算好小寫與單字） */
  function buildIndex(list) {
    return list.map(function (x) {
      var nl = x[1].toLowerCase();
      return { sym: x[0], name: x[1], etf: !!x[2], nl: nl, words: nl.split(SPLIT).filter(Boolean), hay: (x[0] + ' ' + nl).toLowerCase() };
    });
  }

  /**
   * 分數：代號完全相同 > 代號開頭相同 > 公司名單字開頭相同 > 代號或公司名包含 > 字母依序出現（容許打錯）
   * 回傳 0 代表不符合
   */
  function score(it, Q, ql) {
    if (it.sym === Q) return 1000;
    if (it.sym.indexOf(Q) === 0) return 800 - it.sym.length;
    for (var w = 0; w < it.words.length; w++) if (it.words[w].indexOf(ql) === 0) return 600 - w;
    if (it.sym.indexOf(Q) >= 0) return 500;
    if (it.nl.indexOf(ql) >= 0) return 400;
    if (ql.length < 3) return 0;
    // 字母依序出現：允許漏打或多打，間隔越小分數越高
    var i = 0, gaps = 0, last = -1, hay = it.hay;
    for (var j = 0; j < hay.length && i < ql.length; j++) {
      if (hay.charCodeAt(j) === ql.charCodeAt(i)) { if (last >= 0) gaps += j - last - 1; last = j; i++; }
    }
    if (i === ql.length) return Math.max(1, 200 - gaps * 4);
    // 少打或打錯一個字母：比對去掉任一字母後的查詢
    if (ql.length >= 5) {
      for (var k = 0; k < ql.length; k++) {
        var q2 = ql.slice(0, k) + ql.slice(k + 1);
        if (it.nl.indexOf(q2) >= 0) return 150;
      }
      for (var m = 0; m < it.words.length; m++) {
        if (closeWord(it.words[m], ql)) return 140;
      }
    }
    return 0;
  }

  /** 單字與查詢的開頭只差一個字母（少打、多打或打錯） */
  function closeWord(word, q) {
    var a = word.slice(0, q.length + 1), i = 0, j = 0, edits = 0;
    while (i < a.length && j < q.length) {
      if (a[i] === q[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a[i + 1] === q[j]) i++; // 少打
      else if (a[i] === q[j + 1]) j++; // 多打
      else { i++; j++; } // 打錯
    }
    return edits + (q.length - j) <= 1 && q.length >= 5;
  }

  /** 搜尋：回傳最多 limit 筆 { sym, name, etf }；查詢為空時回傳 [] */
  function search(index, query, limit) {
    limit = limit || 8;
    var q = String(query || '').trim();
    if (!q) return [];
    var Q = q.toUpperCase(), ql = q.toLowerCase();
    var hits = [];
    for (var n = 0; n < index.length; n++) {
      var s = score(index[n], Q, ql);
      if (s) hits.push({ it: index[n], s: s });
    }
    hits.sort(function (a, b) { return b.s - a.s || a.it.sym.length - b.it.sym.length || (a.it.sym < b.it.sym ? -1 : 1); });
    return hits.slice(0, limit).map(function (h) { return { sym: h.it.sym, name: h.it.name, etf: h.it.etf }; });
  }

  /** 把文字中第一個符合查詢的片段切出來，回傳 [前, 中, 後]（給畫面加上標示） */
  function highlight(text, query) {
    var q = String(query || '').trim();
    var i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return [text, '', ''];
    return [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)];
  }

  return { buildIndex: buildIndex, search: search, highlight: highlight };
});
