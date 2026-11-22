/* 區間再平衡：計算邏輯（純函式，瀏覽器與 Node 測試共用） */
(function (factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (window.BR = window.BR || {}).calc = api;
})(function () {
  'use strict';

  /** 四捨五入到小數第一位，畫面顯示與狀態判斷都用這個值 */
  function r1(n) {
    return Math.round(n * 10) / 10;
  }

  function isNum(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  /** 持股欄位錯誤：回傳 { shares?: 訊息, price?: 訊息 } */
  function holdingErrors(h) {
    var errs = {};
    ['shares', 'price'].forEach(function (k) {
      var v = h[k];
      if (!isNum(v)) errs[k] = '請填數字';
      else if (v < 0) errs[k] = '不可為負數';
    });
    return errs;
  }

  /** 持股市值；欄位有錯時不計入（回傳 0） */
  function holdingValue(h) {
    if (Object.keys(holdingErrors(h)).length) return 0;
    return h.shares * h.price;
  }

  /** 區間設定是否合理：0 ≤ 下限 ≤ 目標 ≤ 上限 ≤ 100 */
  function isSectorValid(s) {
    return [s.lo, s.target, s.hi].every(isNum) && s.lo >= 0 && s.hi <= 100 && s.lo <= s.target && s.target <= s.hi;
  }

  /** 依權重與區間判斷狀態：'over' | 'under' | 'ok'（剛好等於邊界算區間內） */
  function classify(weight, lo, hi) {
    var w = r1(weight);
    if (w > hi) return 'over';
    if (w < lo) return 'under';
    return 'ok';
  }

  /** 從目前權重調到 goal 權重需要的金額（總市值不變）。正數 = 買入，負數 = 賣出 */
  function amountTo(total, weight, goal) {
    return ((goal - r1(weight)) / 100) * total;
  }

  /**
   * 計算整個投資組合。
   * 回傳 { total, rows }；rows 每一列：板塊欄位 + value、weight（已四捨五入）、status、edge、toEdge、toTarget、count
   * status：'ok' | 'over' | 'under' | 'invalid'（區間設定有誤）| 'empty'（總市值為 0）
   */
  function computePortfolio(sectors, holdings, extraCash) {
    var bySector = {}, count = {};
    sectors.forEach(function (s) { bySector[s.id] = 0; count[s.id] = 0; });
    // extraCash：調整後賣出所得的現金（不屬於任何板塊，但計入總市值）
    var total = isNum(extraCash) ? extraCash : 0;
    holdings.forEach(function (h) {
      var v = holdingValue(h);
      total += v;
      if (Object.prototype.hasOwnProperty.call(bySector, h.sectorId)) {
        bySector[h.sectorId] += v;
        count[h.sectorId] += 1;
      }
    });

    var rows = sectors.map(function (s) {
      var value = bySector[s.id];
      var weight = total > 0 ? r1((value / total) * 100) : 0;
      var status;
      if (!isSectorValid(s)) status = 'invalid';
      else if (total <= 0) status = 'empty';
      else status = classify(weight, s.lo, s.hi);
      var edge = status === 'over' ? s.hi : status === 'under' ? s.lo : null;
      return Object.assign({}, s, {
        value: value,
        weight: weight,
        count: count[s.id],
        status: status,
        edge: edge,
        toEdge: edge === null ? 0 : amountTo(total, weight, edge),
        toTarget: isNum(s.target) && total > 0 ? amountTo(total, weight, s.target) : 0,
      });
    });
    return { total: total, rows: rows, cash: isNum(extraCash) ? extraCash : 0 };
  }

  /**
   * 超出區間時的交易建議：把「回到區間邊緣」的金額依板塊內各檔目前市值比例分配，
   * 換算成整數股並無條件進位（確保交易後確實回到範圍內），賣出不超過持有股數。
   * 在區間內回傳 null；板塊沒有持股時 trades 為空陣列。
   */
  function planTrades(row, holdings, total) {
    if (!row || (row.status !== 'over' && row.status !== 'under')) return null;
    var amount = ((row.edge - row.weight) / 100) * total;
    var side = amount < 0 ? 'sell' : 'buy';
    var list = holdings.filter(function (h) { return h.sectorId === row.id && holdingValue(h) > 0 && h.price > 0; });
    var sum = list.reduce(function (a, h) { return a + holdingValue(h); }, 0);
    var trades = list.map(function (h) {
      var part = sum > 0 ? holdingValue(h) / sum : 1 / list.length;
      var n = Math.ceil(Math.abs(amount * part) / h.price - 1e-9);
      if (side === 'sell') n = Math.min(n, h.shares);
      return { holdingId: h.id, sym: h.sym, side: side, shares: n, price: h.price, value: n * h.price, held: h.shares };
    }).filter(function (t) { return t.shares > 0; });
    var value = trades.reduce(function (a, t) { return a + t.value; }, 0);
    return { sectorId: row.id, side: side, edge: row.edge, amount: amount, trades: trades, value: value };
  }

  /**
   * 平衡前後：before 為目前狀態；plans 為每個超出板塊的建議；
   * after 為照建議交易後的狀態（賣出所得留作現金、買入從現金支出，總市值不變）。
   */
  function rebalance(sectors, holdings) {
    var before = computePortfolio(sectors, holdings);
    var plans = {};
    var after = holdings.map(function (h) { return Object.assign({}, h); });
    var cash = 0;
    before.rows.forEach(function (r) {
      var p = planTrades(r, holdings, before.total);
      if (!p) return;
      plans[r.id] = p;
      p.trades.forEach(function (t) {
        var h = after.filter(function (x) { return x.id === t.holdingId; })[0];
        h.shares += t.side === 'sell' ? -t.shares : t.shares;
        cash += t.side === 'sell' ? t.value : -t.value;
      });
    });
    return { before: before, plans: plans, after: computePortfolio(sectors, after, cash), cash: cash };
  }

  /** 各板塊目標合計，四捨五入到小數第一位 */
  function targetSum(sectors) {
    return r1(sectors.reduce(function (a, s) { return a + (isNum(s.target) ? s.target : 0); }, 0));
  }

  /** 區間圖比例尺最大值：上限、目標、權重中的最大值加 4，向上取到 5 的倍數，至少 30 */
  function axisMax(rows) {
    var m = 0;
    rows.forEach(function (r) {
      [r.hi, r.target, r.weight].forEach(function (v) { if (isNum(v)) m = Math.max(m, v); });
    });
    return Math.min(100, Math.max(30, Math.ceil((m + 4) / 5) * 5));
  }

  return {
    r1: r1,
    isNum: isNum,
    holdingErrors: holdingErrors,
    holdingValue: holdingValue,
    isSectorValid: isSectorValid,
    classify: classify,
    amountTo: amountTo,
    computePortfolio: computePortfolio,
    planTrades: planTrades,
    rebalance: rebalance,
    targetSum: targetSum,
    axisMax: axisMax,
  };
});
