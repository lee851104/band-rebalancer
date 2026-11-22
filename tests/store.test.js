const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../site/js/store.js');
const calc = require('../site/js/calc.js');

function fakeStorage({ broken = false } = {}) {
  const m = new Map();
  return {
    map: m,
    setItem(k, v) { if (broken) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    removeItem(k) { m.delete(k); },
  };
}

test('範例資料通過驗證、總市值 $250,000、預設深色', () => {
  const res = store.validateData(store.sampleData());
  assert.equal(res.ok, true);
  assert.equal(res.data.version, 2);
  assert.equal(res.data.prefs.theme, 'dark');
  assert.equal(calc.computePortfolio(res.data.sectors, res.data.holdings).total, 250000);
});

test('預設類別：火箭、光、軟體、電動車、醫療、半導體，目標合計 100%、沒有持股', () => {
  const d = store.defaultData();
  assert.deepEqual(d.sectors.map((s) => s.name), ['火箭', '光', '軟體', '電動車', '醫療', '半導體']);
  assert.equal(d.sectors.reduce((a, s) => a + s.target, 0), 100);
  for (const s of d.sectors) assert.ok(s.lo === s.target - 5 && s.hi === s.target + 5, s.name);
  assert.equal(d.holdings.length, 0);
  assert.equal(store.validateData(d).ok, true);
  // 範例資料用同樣的類別，每個類別都有持股
  const sample = store.sampleData();
  assert.deepEqual(sample.sectors, d.sectors);
  for (const s of sample.sectors) assert.ok(sample.holdings.some((h) => h.sectorId === s.id), s.name);
});

test('可接受的差距：預設 5%，保留合理的設定，不合理的值改回 5%', () => {
  assert.equal(store.emptyData().prefs.tol, 5);
  const ok = store.validateData({ version: 2, sectors: [], holdings: [], prefs: { tol: 3 } });
  assert.equal(ok.data.prefs.tol, 3);
  for (const bad of [0, 50, 'x', null]) {
    assert.equal(store.validateData({ version: 2, sectors: [], holdings: [], prefs: { tol: bad } }).data.prefs.tol, 5, String(bad));
  }
});

test('空資料預設深色、能通過驗證', () => {
  const d = store.emptyData();
  assert.equal(d.prefs.theme, 'dark');
  assert.equal(store.validateData(d).ok, true);
});

test('版本 1 升級：丟掉快照與備註，未分類持股放進「未分類」板塊', () => {
  const v1 = {
    version: 1,
    sectors: [{ id: 'a', name: 'A', note: 'x', lo: 0, target: 100, hi: 100 }],
    holdings: [
      { id: 'h1', sym: 'nvda', sectorId: 'a', shares: 1, price: 1 },
      { id: 'h2', sym: 'msft', sectorId: null, shares: 1, price: 1 },
      { id: 'h3', sym: 'aapl', sectorId: 'gone', shares: 1, price: 1 },
    ],
    snapshots: [{ date: '2026-10-30', total: 1, weights: {}, holdings: [] }],
    prefs: { theme: 'system', compareDate: '2026-10-30' },
  };
  const res = store.validateData(v1);
  assert.equal(res.ok, true);
  const d = res.data;
  assert.equal(d.version, 2);
  assert.equal(d.snapshots, undefined);
  assert.equal(d.sectors[0].note, undefined);
  assert.equal(d.prefs.theme, 'dark');
  const un = d.sectors.find((s) => s.name === '未分類');
  assert.ok(un);
  assert.deepEqual([un.lo, un.target, un.hi], [0, 0, 100]);
  assert.deepEqual(d.holdings.map((h) => h.sectorId), ['a', un.id, un.id]);
  assert.equal(d.holdings[0].sym, 'NVDA');
  assert.equal(d.holdings[0].quoteAt, null);
});

test('沒有未分類持股時不會多出「未分類」板塊', () => {
  const d = store.validateData(store.sampleData()).data;
  assert.equal(d.sectors.some((s) => s.name === '未分類'), false);
});

test('儲存：寫入後重新讀取得到相同資料；延遲寫入要 flush', () => {
  const fs = fakeStorage();
  const s = store.createStorage(fs, { delay: 10000 });
  assert.equal(s.available, true);
  s.save(store.sampleData());
  assert.equal(fs.map.has(store.KEY), false);
  s.flush();
  assert.deepEqual(s.load(), store.validateData(store.sampleData()).data);
});

test('儲存：瀏覽器不允許寫入時回報無法保存；金鑰只留在記憶體', () => {
  const s = store.createStorage(fakeStorage({ broken: true }), { delay: 0 });
  assert.equal(s.available, false);
  assert.equal(s.save(store.sampleData()), false);
  s.setApiKey('abc');
  assert.equal(s.getApiKey(), 'abc');
});

test('損毀的資料另存備查，load 回傳 null', () => {
  const fs = fakeStorage();
  const s = store.createStorage(fs, { delay: 0 });
  fs.map.set(store.KEY, '{not json');
  assert.equal(s.load(), null);
  assert.equal(fs.map.get(store.KEY + ':corrupt'), '{not json');
});

test('金鑰另存在獨立的 key，匯出檔不含金鑰', () => {
  const fs = fakeStorage();
  const s = store.createStorage(fs, { delay: 0 });
  s.setApiKey('SECRET-KEY-123');
  const data = store.sampleData();
  s.save(data);
  assert.equal(fs.map.get(store.API_KEY_KEY), 'SECRET-KEY-123');
  assert.ok(!fs.map.get(store.KEY).includes('SECRET-KEY-123'));
  const out = store.exportPayload(data);
  assert.ok(!out.text.includes('SECRET-KEY-123'));
  s.setApiKey('');
  assert.equal(fs.map.has(store.API_KEY_KEY), false);
});

test('匯出：檔名包含當地日期，內容含版本與匯出時間', () => {
  const now = new Date(2026, 10, 22, 9, 30);
  const out = store.exportPayload(store.sampleData(), now);
  assert.equal(out.filename, 'rebalance-backup-2026-11-22.json');
  const obj = JSON.parse(out.text);
  assert.equal(obj.version, 2);
  assert.equal(obj.exportedAt, now.toISOString());
  assert.equal(obj.holdings.length, 13);
});

test('匯入：匯出的檔案可以完整匯入', () => {
  const data = store.sampleData();
  const res = store.parseImport(store.exportPayload(data).text);
  assert.equal(res.ok, true);
  assert.deepEqual(res.data.holdings, data.holdings);
  assert.deepEqual(res.data.sectors, data.sectors);
});

test('匯入格式錯誤的檔案：回傳錯誤且不碰既有資料', () => {
  const current = store.sampleData();
  const before = JSON.stringify(current);
  for (const text of ['hello', '[]', '{}', JSON.stringify({ version: 2, sectors: 'x', holdings: [] }),
    JSON.stringify({ version: 2, sectors: [], holdings: [{ id: 'h', sym: 'A', sectorId: null, shares: 'abc', price: 1 }] }),
    JSON.stringify({ version: 99, sectors: [], holdings: [] })]) {
    const res = store.parseImport(text);
    assert.equal(res.ok, false, text);
    assert.equal(res.error, '這不是有效的備份檔');
  }
  assert.equal(JSON.stringify(current), before);
});

test('日期工具', () => {
  assert.equal(store.localDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(store.daysBetween('2026-11-15', '2026-11-22'), 7);
});
