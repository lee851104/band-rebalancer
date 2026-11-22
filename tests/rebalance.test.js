const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../site/js/calc.js');
const store = require('../site/js/store.js');

const S = (id, lo, target, hi) => ({ id, name: id, lo, target, hi });
const H = (id, sym, sectorId, shares, price) => ({ id, sym, sectorId, shares, price });

test('超出上限：賣回上限，依各檔比例分配並無條件進位（NVDA 11、TSM 4、AMD 3）', () => {
  const d = store.sampleData();
  const r = calc.rebalance(d.sectors, d.holdings);
  const p = r.plans.s_semis;
  assert.equal(p.side, 'sell');
  assert.equal(p.edge, 25);
  assert.deepEqual(p.trades.map((t) => [t.sym, t.shares]), [['NVDA', 11], ['TSM', 4], ['AMD', 3]]);
  assert.equal(p.value, 11 * 185 + 4 * 260 + 3 * 216);
  assert.equal(Object.keys(r.plans).length, 1, '只有半導體需要調整');
});

test('調整後：總市值不變、賣出所得變成現金、半導體回到上限以內、全部在區間內', () => {
  const d = store.sampleData();
  const r = calc.rebalance(d.sectors, d.holdings);
  assert.equal(r.after.total, r.before.total);
  assert.equal(r.cash, r.plans.s_semis.value);
  const semis = r.after.rows.find((x) => x.id === 's_semis');
  assert.ok(semis.weight <= 25, semis.weight);
  assert.equal(semis.status, 'ok');
  assert.ok(r.after.rows.every((x) => x.status === 'ok'));
  // 原始持股不被修改
  assert.equal(d.holdings.find((h) => h.sym === 'NVDA').shares, 200);
});

test('低於下限：買回下限', () => {
  const sectors = [S('a', 30, 40, 50), S('b', 0, 60, 100)];
  const holdings = [H('h1', 'AAA', 'a', 10, 2), H('h2', 'BBB', 'b', 80, 1)]; // a = 20 / 100 = 20%
  const r = calc.rebalance(sectors, holdings);
  const p = r.plans.a;
  assert.equal(p.side, 'buy');
  assert.equal(p.edge, 30);
  assert.deepEqual(p.trades.map((t) => [t.sym, t.shares]), [['AAA', 5]]); // 需要 $10 → 5 股
  assert.equal(r.cash, -10);
});

test('在區間內沒有建議', () => {
  const d = store.sampleData();
  const r = calc.rebalance(d.sectors, d.holdings);
  assert.equal(r.plans.s_rocket, undefined);
  assert.equal(calc.planTrades(r.before.rows.find((x) => x.id === 's_rocket'), d.holdings, r.before.total), null);
});

test('賣出股數不超過持有股數', () => {
  const sectors = [S('a', 0, 10, 20), S('b', 0, 90, 100)];
  const holdings = [H('h1', 'AAA', 'a', 3, 100), H('h2', 'BBB', 'b', 100, 1)]; // a = 300/400 = 75%
  const p = calc.rebalance(sectors, holdings).plans.a;
  assert.equal(p.trades[0].shares, 3);
});

test('板塊沒有持股卻低於下限：有建議金額但沒有個股交易', () => {
  const sectors = [S('a', 5, 10, 15), S('b', 0, 90, 100)];
  const holdings = [H('h2', 'BBB', 'b', 100, 1)];
  const p = calc.rebalance(sectors, holdings).plans.a;
  assert.equal(p.side, 'buy');
  assert.equal(Math.round(p.amount), 5);
  assert.deepEqual(p.trades, []);
});

test('沒有超出時，調整後與目前相同、現金為 0', () => {
  const d = store.defaultData();
  const r = calc.rebalance(d.sectors, d.holdings);
  assert.deepEqual(r.plans, {});
  assert.equal(r.cash, 0);
});
