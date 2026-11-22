const test = require('node:test');
const assert = require('node:assert/strict');
const q = require('../site/js/quotes.js');

function fakeFetch(table, log) {
  let active = 0;
  const f = async (url, opts) => {
    log && log.push({ url, opts });
    active++;
    f.maxActive = Math.max(f.maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    const sym = new URL(url).searchParams.get('symbol');
    const row = table[sym] || { status: 200, body: { c: 0 } };
    if (row.throw) throw new Error('offline');
    return { status: row.status, ok: row.status >= 200 && row.status < 300, json: async () => row.body };
  };
  f.maxActive = 0;
  return f;
}

test('查詢成功：回傳最新價格；請求只帶代號與金鑰', async () => {
  const log = [];
  const r = await q.fetchQuote('NVDA', 'KEY123', fakeFetch({ NVDA: { status: 200, body: { c: 183.6, pc: 180 } } }, log));
  assert.deepEqual(r, { ok: true, price: 183.6 });
  const u = new URL(log[0].url);
  assert.equal(u.origin + u.pathname, 'https://finnhub.io/api/v1/quote');
  assert.deepEqual([...u.searchParams.keys()].sort(), ['symbol', 'token']);
  assert.equal(u.searchParams.get('token'), 'KEY123');
  assert.equal(log[0].opts.credentials, 'omit');
});

test('沒有金鑰時不發出請求', async () => {
  const log = [];
  const r = await q.fetchQuote('NVDA', '', fakeFetch({}, log));
  assert.deepEqual(r, { ok: false, error: 'nokey' });
  assert.equal(log.length, 0);
});

test('錯誤分類：c 為 0 → notfound；401 → badkey；429 → ratelimit；500 → http；斷線 → network', async () => {
  const f = fakeFetch({
    ZZZQ: { status: 200, body: { c: 0 } },
    A: { status: 401, body: {} },
    B: { status: 429, body: {} },
    C: { status: 500, body: {} },
    D: { throw: true },
  });
  assert.equal((await q.fetchQuote('ZZZQ', 'k', f)).error, 'notfound');
  assert.equal((await q.fetchQuote('A', 'k', f)).error, 'badkey');
  assert.equal((await q.fetchQuote('B', 'k', f)).error, 'ratelimit');
  assert.equal((await q.fetchQuote('C', 'k', f)).error, 'http');
  assert.equal((await q.fetchQuote('D', 'k', f)).error, 'network');
  for (const k of ['nokey', 'badkey', 'ratelimit', 'notfound', 'network', 'http']) assert.ok(q.MESSAGES[k]);
});

test('批次查詢：現金略過、重複代號只查一次、最多 5 個同時進行', async () => {
  const table = {};
  const symbols = [];
  for (let i = 0; i < 12; i++) { const s = 'S' + i; table[s] = { status: 200, body: { c: i + 1 } }; symbols.push(s); }
  symbols.push('USD', 'CASH', 'S0', 'S1');
  const log = [];
  const f = fakeFetch(table, log);
  const seen = [];
  const res = await q.fetchMany(symbols, 'k', f, (sym) => seen.push(sym));
  assert.equal(log.length, 12);
  assert.ok(f.maxActive <= 5, 'maxActive ' + f.maxActive);
  assert.equal(Object.keys(res).length, 12);
  assert.equal(res.S3.price, 4);
  assert.equal(seen.length, 12);
  assert.equal(res.USD, undefined);
});

test('現金判斷', () => {
  assert.equal(q.isCash('USD'), true);
  assert.equal(q.isCash('CASH'), true);
  assert.equal(q.isCash('NVDA'), false);
});
