const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../site/js/calc.js');
const store = require('../site/js/store.js');

const S = (id, lo, target, hi) => ({ id, name: id, lo, target, hi });
const H = (sym, sectorId, shares, price) => ({ id: 'h_' + sym, sym, sectorId, shares, price });
const sample = store.sampleData();

test('計算板塊權重：半導體 $66,000 / $250,000 = 26.4%', () => {
  const p = calc.computePortfolio(sample.sectors, sample.holdings);
  assert.equal(p.total, 250000);
  const semis = p.rows.find((r) => r.id === 's_semis');
  assert.equal(semis.value, 66000);
  assert.equal(semis.weight, 26.4);
  assert.equal(semis.count, 3);
});

test('計算板塊權重：沒有任何持股時權重為 0、狀態為 empty、沒有調整金額', () => {
  const p = calc.computePortfolio(sample.sectors, []);
  assert.equal(p.total, 0);
  for (const r of p.rows) {
    assert.equal(r.weight, 0);
    assert.equal(r.status, 'empty');
    assert.equal(r.toEdge, 0);
    assert.equal(r.toTarget, 0);
  }
});

test('負數或非數字的持股不計入市值', () => {
  assert.deepEqual(calc.holdingErrors(H('X', 'a', -5, 10)), { shares: '不可為負數' });
  assert.deepEqual(calc.holdingErrors(H('X', 'a', null, 10)), { shares: '請填數字' });
  const p = calc.computePortfolio([S('a', 0, 50, 100)], [H('X', 'a', -5, 10), H('Y', 'a', 2, 10)]);
  assert.equal(p.total, 20);
});

test('區間狀態：超出上限、低於下限、區間內', () => {
  assert.equal(calc.classify(26.4, 14, 25), 'over');
  assert.equal(calc.classify(5.9, 6, 14), 'under');
  assert.equal(calc.classify(16.2, 10, 20), 'ok');
});

test('區間狀態：剛好等於邊界算區間內（含四捨五入）', () => {
  assert.equal(calc.classify(25.0, 14, 25), 'ok');
  assert.equal(calc.classify(25.04, 14, 25), 'ok');
  assert.equal(calc.classify(25.05, 14, 25), 'over');
  assert.equal(calc.classify(6.0, 6, 14), 'ok');
});

test('範例組合只有半導體超出', () => {
  const p = calc.computePortfolio(sample.sectors, sample.holdings);
  const bad = p.rows.filter((r) => r.status !== 'ok').map((r) => r.id);
  assert.deepEqual(bad, ['s_semis']);
});

test('回到區間與回到目標的金額：26.4%、上限 25%、目標 20% → 賣出 $3,500 與 $16,000', () => {
  const p = calc.computePortfolio(sample.sectors, sample.holdings);
  const semis = p.rows.find((r) => r.id === 's_semis');
  assert.equal(semis.edge, 25);
  assert.equal(Math.round(semis.toEdge), -3500);
  assert.equal(Math.round(semis.toTarget), -16000);
  const rocket = p.rows.find((r) => r.id === 's_rocket');
  assert.equal(rocket.status, 'ok');
  assert.equal(rocket.edge, null);
  assert.equal(rocket.toEdge, 0);
});

test('低於下限為買入', () => {
  const p = calc.computePortfolio([S('a', 30, 40, 50), S('b', 0, 60, 100)], [H('A', 'a', 1, 20), H('B', 'b', 1, 80)]);
  const a = p.rows[0];
  assert.equal(a.status, 'under');
  assert.equal(Math.round(a.toEdge), 10);
  assert.equal(Math.round(a.toTarget), 20);
});

test('區間設定有誤時狀態為 invalid', () => {
  assert.equal(calc.isSectorValid(S('x', 20, 18, 15)), false);
  assert.equal(calc.isSectorValid(S('x', 5, 10, 10)), true);
  assert.equal(calc.isSectorValid(S('x', null, 10, 10)), false);
  const p = calc.computePortfolio([S('x', 20, 18, 15)], [H('A', 'x', 1, 1)]);
  assert.equal(p.rows[0].status, 'invalid');
});

test('目標合計', () => {
  assert.equal(calc.targetSum(sample.sectors), 100);
  assert.equal(calc.targetSum([S('a', 0, 0.1, 100), S('b', 0, 0.2, 100)]), 0.3);
});

test('比例尺：上限、目標、權重最大值加 4 後取到 5 的倍數，至少 30、最多 100', () => {
  assert.equal(calc.axisMax([{ hi: 25, target: 20, weight: 26.4 }]), 35);
  assert.equal(calc.axisMax([{ hi: 10, target: 5, weight: 3 }]), 30);
  assert.equal(calc.axisMax([{ hi: 100, target: 100, weight: 100 }]), 100);
});
