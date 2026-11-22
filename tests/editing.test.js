const test = require('node:test');
const assert = require('node:assert/strict');
const ed = require('../site/js/editing.js');

const S = (id, lo, target, hi) => ({ id, name: id, lo, target, hi });
const sum = (ss) => Math.round(ss.reduce((a, s) => a + s.target, 0) * 10) / 10;

test('拖曳上限：以 0.5 為一格', () => {
  const s = S('semis', 14, 20, 25);
  ed.setValue(s, 'hi', 28.37);
  assert.equal(s.hi, 28.5);
});

test('下限不能超過目標、上限不能低於目標、都夾在 0–100', () => {
  const s = S('x', 10, 15, 20);
  ed.setValue(s, 'lo', 18);
  assert.equal(s.lo, 15);
  ed.setValue(s, 'hi', 12);
  assert.equal(s.hi, 15);
  ed.setValue(s, 'lo', -4);
  assert.equal(s.lo, 0);
  ed.setValue(s, 'hi', 130);
  assert.equal(s.hi, 100);
});

test('目標移出區間時整段平移：14–25% 目標從 20 拖到 27 → 16–27%', () => {
  const s = S('semis', 14, 20, 25);
  ed.setValue(s, 'target', 27);
  assert.deepEqual([s.lo, s.target, s.hi], [16, 27, 27]);
});

test('目標往左移出區間：10–20% 目標拖到 4 → 4–14%', () => {
  const s = S('x', 10, 15, 20);
  ed.setValue(s, 'target', 4);
  assert.deepEqual([s.lo, s.target, s.hi], [4, 4, 14]);
});

test('平移到 100 時寬度保持不變；寬度超出邊界時才截斷', () => {
  const s = S('x', 90, 95, 99);
  ed.setValue(s, 'target', 100);
  assert.deepEqual([s.lo, s.target, s.hi], [91, 100, 100]);
  const t = S('y', 0, 2, 10);
  ed.setValue(t, 'target', 0); // 仍在區間內，區間不動
  assert.deepEqual([t.lo, t.target, t.hi], [0, 0, 10]);
});

test('鍵盤：下限 6% 按兩次右鍵（每次 0.5）→ 7%', () => {
  const s = S('uranium', 6, 10, 14);
  ed.setValue(s, 'lo', s.lo + 0.5);
  ed.setValue(s, 'lo', s.lo + 0.5);
  assert.equal(s.lo, 7);
});

test('目標合計補正：103% → 100%', () => {
  const ss = [S('a', 10, 15, 20), S('b', 6, 10, 14), S('c', 14, 23, 28.5), S('d', 8, 15, 20), S('e', 10, 15, 20), S('f', 6, 10, 14), S('g', 5, 15, 25)];
  assert.equal(sum(ss), 103);
  ed.normalizeTargets(ss);
  assert.equal(sum(ss), 100);
  for (const s of ss) {
    assert.ok(s.lo <= s.target && s.target <= s.hi, s.id);
    assert.equal(s.target * 2, Math.round(s.target * 2), '0.5 一格');
  }
});

test('目標合計補正：全部為 0 時不動', () => {
  const ss = [S('a', 0, 0, 5), S('b', 0, 0, 5)];
  ed.normalizeTargets(ss);
  assert.equal(sum(ss), 0);
});

test('快速套用 ±25%：目標 20% → 15–25%；±3 點、±5 點', () => {
  const ss = [S('semis', 14, 20, 25), S('cash', 0, 2, 10)];
  ed.applyPreset(ss, 'rel25');
  assert.deepEqual([ss[0].lo, ss[0].hi], [15, 25]);
  assert.deepEqual([ss[1].lo, ss[1].hi], [1.5, 2.5]);
  ed.applyPreset(ss, 'pt3');
  assert.deepEqual([ss[0].lo, ss[0].hi, ss[1].lo, ss[1].hi], [17, 23, 0, 5]);
  ed.applyPreset(ss, 'pt5');
  assert.deepEqual([ss[0].lo, ss[0].hi], [15, 25]);
});

test('新增板塊：從目標最大的板塊撥 5%，合計不變', () => {
  const ss = [S('a', 10, 15, 20), S('b', 14, 25, 30), S('c', 50, 60, 70)];
  const before = sum(ss);
  const n = ed.addSector(ss, 'new', '新板塊');
  assert.equal(n.target, 5);
  assert.equal(ss.find((s) => s.id === 'c').target, 55);
  assert.equal(sum(ss), before);
  assert.ok(n.lo <= n.target && n.target <= n.hi);
});

test('新增第一個板塊時目標為 100%', () => {
  const ss = [];
  const n = ed.addSector(ss, 'a', '新板塊');
  assert.equal(n.target, 100);
});

test('刪除板塊：目標加到前一個板塊；刪第一個時加到下一個', () => {
  const ss = [S('semis', 14, 20, 25), S('copper', 6, 10, 14), S('cash', 5, 70, 80)];
  const gone = ed.removeSector(ss, 'copper');
  assert.equal(gone.id, 'copper');
  assert.equal(ss.find((s) => s.id === 'semis').target, 30);
  assert.equal(sum(ss), 100);
  ed.removeSector(ss, 'semis');
  assert.equal(ss[0].id, 'cash');
  assert.equal(ss[0].target, 100);
  assert.equal(ed.removeSector(ss, 'nope'), null);
});
