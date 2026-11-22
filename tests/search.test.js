const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIndex, search, highlight } = require('../site/js/search.js');

// 使用網頁內建的完整代號清單
global.window = {};
require('../site/data/symbols.js');
const index = buildIndex(window.BR_SYMBOLS);
const syms = (q, n) => search(index, q, n).map((x) => x.sym);

test('代號清單規模合理且包含常見代號', () => {
  assert.ok(window.BR_SYMBOLS.length > 8000);
  for (const s of ['AAPL', 'NVDA', 'BRK.B', 'GLD', 'CCJ', 'COPX']) assert.ok(index.some((x) => x.sym === s), s);
});

test('代號完全相同排第一', () => {
  assert.equal(syms('nvda')[0], 'NVDA');
  assert.equal(syms('A')[0], 'A');
  assert.equal(syms('gld')[0], 'GLD');
});

test('用公司名搜尋：nvidia → NVDA 第一', () => {
  assert.equal(syms('nvidia')[0], 'NVDA');
});

test('代號開頭：nvd → NVDA', () => {
  assert.ok(syms('nvd').includes('NVDA'));
});

test('打錯字：semicondutor 仍找得到半導體相關代號', () => {
  const r = search(index, 'semicondutor');
  assert.ok(r.length > 0);
  assert.ok(r.every((x) => /semicond/i.test(x.name)), r.map((x) => x.name).join(' | '));
});

test('少打一個字母：taiwan semicnductor 找得到 TSM', () => {
  assert.ok(syms('semicnductor', 50).includes('TSM'));
});

test('最多回傳 8 筆，空查詢回傳空陣列', () => {
  assert.equal(search(index, 'a').length, 8);
  assert.deepEqual(search(index, '   '), []);
});

test('找不到時回傳空陣列', () => {
  assert.deepEqual(search(index, 'zzzqqqxx'), []);
});

test('搜尋速度：單次查詢在 50ms 內', () => {
  const t = performance.now();
  for (const q of ['apple', 'semicondutor', 'gold', 'uranium', 'x']) search(index, q);
  assert.ok((performance.now() - t) / 5 < 50);
});

test('標示符合的文字', () => {
  assert.deepEqual(highlight('NVIDIA Corporation', 'nvidia'), ['', 'NVIDIA', ' Corporation']);
  assert.deepEqual(highlight('Apple Inc.', 'zzz'), ['Apple Inc.', '', '']);
});
