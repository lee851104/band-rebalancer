#!/usr/bin/env node
/*
 * 產生美股代號清單 site/data/symbols.js，供網頁離線做模糊搜尋。
 * 資料來源：Nasdaq Trader 公開的代號目錄（含 NASDAQ、NYSE、NYSE American、NYSE Arca 等）。
 *
 * 用法：
 *   node scripts/build-symbols.js                 直接下載最新目錄
 *   node scripts/build-symbols.js <nasdaqlisted.txt> <otherlisted.txt>   使用已下載的檔案
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SOURCES = {
  nasdaq: 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt',
  other: 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt',
};
const OUT = path.join(__dirname, '..', 'site', 'data', 'symbols.js');

// 排除權證、權利、單位、特別股、債券這類一般人不會放進倉位的證券
const EXCLUDE = /\b(warrants?|rights?|units?|preferred|depositary shares? representing .*preferred|notes due|debentures?|subordinated)\b/i;

function cleanName(name) {
  let n = name.trim();
  n = n.replace(/\s*-\s*American Depositary Shares?.*$/i, ' (ADR)');
  n = n.replace(/\s+American Depositary Shares?.*$/i, ' (ADR)');
  n = n.replace(/\s*-?\s*(Class [A-Z])\s+(Common Stock|Ordinary Shares?|Shares?)\b.*$/i, ' $1');
  n = n.replace(/\s*-?\s*(Common Stock|Common Shares?|Ordinary Shares?|Common Units?|Shares of Beneficial Interest)\b.*$/i, '');
  n = n.replace(/\s+/g, ' ').replace(/[\s,-]+$/, '');
  return n;
}

function parse(text, kind) {
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('File Creation Time'));
  const head = lines.shift().split('|');
  const col = (name) => head.indexOf(name);
  const iSym = kind === 'nasdaq' ? col('Symbol') : col('ACT Symbol');
  const iName = col('Security Name');
  const iTest = col('Test Issue');
  const iEtf = col('ETF');
  const out = [];
  for (const line of lines) {
    const f = line.split('|');
    const sym = (f[iSym] || '').trim();
    const rawName = (f[iName] || '').trim();
    if (!sym || !rawName || f[iTest] === 'Y') continue;
    if (/[$^#]/.test(sym)) continue; // 特別股等特殊代號
    if (EXCLUDE.test(rawName)) continue;
    out.push([sym, cleanName(rawName) || rawName, f[iEtf] === 'Y' ? 1 : 0]);
  }
  return out;
}

async function load(src, file) {
  if (file) return fs.readFileSync(file, 'utf8');
  const res = await fetch(src);
  if (!res.ok) throw new Error(`下載失敗 ${src}: HTTP ${res.status}`);
  return res.text();
}

(async () => {
  const [fa, fb] = process.argv.slice(2);
  const all = [...parse(await load(SOURCES.nasdaq, fa), 'nasdaq'), ...parse(await load(SOURCES.other, fb), 'other')];
  const seen = new Set();
  const list = all.filter(([s]) => (seen.has(s) ? false : seen.add(s))).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (list.length < 5000) throw new Error(`代號數量異常（${list.length}），不寫入檔案`);
  const body =
    '/* 美股代號清單（自動產生，請勿手動修改）：node scripts/build-symbols.js\n' +
    ` * 來源：Nasdaq Trader 代號目錄，產生日期 ${new Date().toISOString().slice(0, 10)}，共 ${list.length} 檔。\n` +
    ' * 格式：[代號, 名稱, 是否為 ETF] */\n' +
    'window.BR_SYMBOLS = ' + JSON.stringify(list) + ';\n';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);
  console.log(`已寫入 ${path.relative(process.cwd(), OUT)}：${list.length} 檔，${(body.length / 1024).toFixed(0)} KB`);
})().catch((e) => { console.error(e.message); process.exit(1); });
