/* 區間再平衡：在圖上拖曳編輯的規則（純函式，直接修改傳入的板塊物件） */
(function (factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (window.BR = window.BR || {}).editing = api;
})(function () {
  'use strict';

  /** 0.5 個百分點為一格 */
  function snap(v) {
    return Math.round(v * 2) / 2;
  }
  function r1(n) {
    return Math.round(n * 10) / 10;
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  /** 目標跑出區間時，整段區間平移跟上（寬度不變），再把結果夾回 0–100 */
  function keepBand(s) {
    var d;
    if (s.target < s.lo) { d = s.target - s.lo; s.lo += d; s.hi += d; }
    if (s.target > s.hi) { d = s.target - s.hi; s.lo += d; s.hi += d; }
    s.lo = snap(clamp(s.lo, 0, s.target));
    s.hi = snap(clamp(s.hi, s.target, 100));
    return s;
  }

  /** 設定某個板塊的 lo / hi / target */
  function setValue(s, which, v) {
    v = snap(v);
    if (which === 'lo') s.lo = clamp(v, 0, s.target);
    else if (which === 'hi') s.hi = clamp(v, s.target, 100);
    else if (which === 'target') { s.target = clamp(v, 0, 100); keepBand(s); }
    return s;
  }

  /** 依比例縮放所有目標，四捨五入到 0.5 後把差額加到目標最大的板塊，使合計剛好 100 */
  function normalizeTargets(sectors) {
    var sum = sectors.reduce(function (a, s) { return a + s.target; }, 0);
    if (!sectors.length || sum <= 0) return sectors;
    sectors.forEach(function (s) { s.target = snap((s.target / sum) * 100); });
    var diff = r1(100 - sectors.reduce(function (a, s) { return a + s.target; }, 0));
    var big = sectors.reduce(function (m, s) { return s.target > m.target ? s : m; });
    big.target = r1(big.target + diff);
    sectors.forEach(keepBand);
    return sectors;
  }

  /** 快速套用區間：'pt3'（±3 點）、'pt5'（±5 點）、'rel25'（目標的 ±25%） */
  function applyPreset(sectors, kind) {
    sectors.forEach(function (s) {
      var d = kind === 'pt3' ? 3 : kind === 'pt5' ? 5 : s.target * 0.25;
      s.lo = snap(clamp(s.target - d, 0, 100));
      s.hi = snap(clamp(s.target + d, 0, 100));
    });
    return sectors;
  }

  /** 新增板塊：從目標最大的板塊撥出 5 個百分點（不足則全部），合計不變。回傳新板塊 */
  function addSector(sectors, id, name) {
    var give = 0;
    if (sectors.length) {
      var big = sectors.reduce(function (m, s) { return s.target > m.target ? s : m; });
      give = Math.min(5, big.target);
      big.target = r1(big.target - give);
      keepBand(big);
    } else {
      give = 100;
    }
    var s = { id: id, name: name, lo: snap(Math.max(0, give - 3)), target: give, hi: snap(Math.min(100, give + 3)) };
    sectors.push(s);
    return s;
  }

  /** 刪除板塊：目標加到前一個板塊（沒有前一個時加到下一個）。回傳被刪除的板塊 */
  function removeSector(sectors, id) {
    var i = sectors.findIndex(function (s) { return s.id === id; });
    if (i < 0) return null;
    var gone = sectors.splice(i, 1)[0];
    if (sectors.length) {
      var nb = sectors[Math.max(0, i - 1)];
      nb.target = r1(nb.target + gone.target);
      keepBand(nb);
    }
    return gone;
  }

  return {
    snap: snap,
    keepBand: keepBand,
    setValue: setValue,
    normalizeTargets: normalizeTargets,
    applyPreset: applyPreset,
    addSector: addSector,
    removeSector: removeSector,
  };
});
