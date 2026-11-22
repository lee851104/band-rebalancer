# Design

## Context

- 動機見 proposal.md 的 Why。最終視覺與互動以 `design/mockup-simple.html` 為準（單頁、預設深色、圓環 + 可拖曳的區間圖、展開看持股、代號搜尋與報價）。
- 第一版已完成並驗證過一套分頁式介面與計算 / 儲存模組；這次改成單頁設計，計算與儲存模組保留並調整，畫面整個重寫。
- 限制：免費 GitHub Pages 需要公開 repo，網址公開，所以 repo 不可夾帶持股資料；使用者不想安裝任何東西；網頁也要能直接用 `file://` 打開。
- 已實測：Finnhub `/api/v1/quote` 回應帶 `Access-Control-Allow-Origin: *`，瀏覽器可直接呼叫；Nasdaq Trader 代號目錄約 11,700 檔可用證券。

## Goals / Non-Goals

**Goals:**
- 計算、拖曳規則、搜尋、報價都是可在 Node 測試的純函式；畫面只負責呼叫它們。
- 不需要 build 與第三方套件。
- 拖曳與打字時畫面流暢：只更新變動的元素，不整頁重畫。

**Non-Goals:**
- 不做 Service Worker / 離線安裝、不做 UI 端對端自動化測試、不支援舊瀏覽器。
- 不做價格歷史、走勢圖、定時背景抓價。

## Decisions

### 1. 檔案結構
```
site/
  index.html
  styles.css
  data/symbols.js   內建美股代號清單（scripts/build-symbols.js 產生，約 516 KB）
  js/calc.js        權重、狀態、回到區間 / 目標金額、比例尺
  js/editing.js     拖曳規則：設定目標 / 下限 / 上限、區間平移、合計補正、快速套用、新增 / 刪除板塊
  js/search.js      代號模糊搜尋與標示
  js/quotes.js      Finnhub 報價查詢（可注入 fetch，便於測試）、併發上限
  js/store.js       資料格式（版本 2）、舊版升級、localStorage、匯出入、金鑰另存
  js/app.js         畫面：圓環、結論、區間列、展開內容、選單、對話框、事件
scripts/build-symbols.js
tests/*.test.js
```
所有 JS 都用一般 `<script defer>` 載入並掛在 `window.BR`，純邏輯檔結尾同時 `module.exports` 給 Node 測試（`file://` 會擋 ES modules）。`symbols.js` 以 `<script>` 延遲載入（第一次聚焦代號欄時才插入），避免拖慢首次顯示；用 script 而不是 fetch JSON，是因為 `file://` 下 fetch 會被擋。

### 2. 資料模型（版本 2）
```json
{
  "version": 2,
  "sectors":  [{ "id": "s_semis", "name": "半導體", "lo": 14, "target": 20, "hi": 25 }],
  "holdings": [{ "id": "h_1", "sym": "NVDA", "sectorId": "s_semis", "shares": 200, "price": 185,
                 "quoteAt": "2026-11-22T12:52:00.000Z" }],
  "prefs": { "theme": "dark" },
  "meta":  { "lastBackupAt": null, "lastQuoteAt": null }
}
```
- `quoteAt` 為 null 代表價格是手動填的。
- 版本 1 的備份會升級：丟掉快照與比較設定、去掉板塊備註；`sectorId` 為 null 或指向不存在板塊的持股，放進新建的「未分類」板塊（目標 0、區間 0–100）。
- Finnhub 金鑰存在另一個 localStorage key `band-rebalancer:finnhub-key`，所以匯出檔自然不含金鑰。

### 3. 畫面更新策略
- 區間列、圓環片段依板塊 id 建立一次並保留；之後只改 style 與文字，CSS transition 才有平滑動畫。
- 持股明細在展開或結構改變（新增 / 刪除持股）時才重建；打字時只更新市值、佔比、價格標示這些計算欄位。
- 拖曳時凍結比例尺、關閉區間框的 transition，放開後才重算比例尺。
- 用 Pointer Events + `setPointerCapture`，滑鼠與手指共用；把手 `touch-action: none`，軌道其他地方仍可上下捲動頁面。

### 4. 代號搜尋
評分規則見 market-quotes 規格；為了速度，代號與小寫公司名在載入清單時預先計算。清單約 11,700 筆，每次輸入線性掃描一次（約 1–3 ms），不需要索引。

### 5. 報價
- `GET https://finnhub.io/api/v1/quote?symbol=XXX&token=KEY`，取回應的 `c`（最新價），`c` 為 0 視為查無報價。
- 最多 5 個同時進行，避免觸發免費方案每秒 30 次的限制；401 視為金鑰無效、429 視為太頻繁。
- 現金（代號 USD 或 CASH）不查詢，價格固定 1。

### 6. 確認對話框
沿用第一版的 `<dialog>` 做法，以按鈕點擊直接決定結果，不依賴 `close` 事件的觸發時機（第一版實測過這個事件在某些環境會延遲）。

### 7. 測試
- `node:test`：calc、editing、search、quotes（用假的 fetch）、store（升級、匯出不含金鑰、匯入錯誤不改資料）。
- 畫面以手動驗收（桌面、375px 手機、深淺色、拖曳、搜尋、實際報價）。

### 8. 部署
沿用 `.github/workflows/deploy.yml`：push 到 main → `npm test` → 只上傳 `site/` 到 Pages。代號清單不在部署時重新下載，避免外部服務暫時失效導致部署失敗；需要更新時由開發者執行腳本並提交。

## Risks / Trade-offs

- [使用者清除瀏覽器資料導致持股遺失] → 備份提醒（超過 30 天變黃色）、建議 iPhone 加入主畫面。
- [Finnhub 免費方案條款或 CORS 行為改變] → 報價是選用功能，失敗時保留原價並提示，仍可手動填價格。
- [代號清單過時（新上市或下市）] → 清單中找不到的代號仍可使用，只是需手動填價格；腳本可隨時重新產生。
- [查報價會讓 Finnhub 知道使用者持有哪些代號] → 在報價設定與選單中說明；不送出股數與金額。
- [拖曳在手機上誤觸] → 把手只在把手本身攔截觸控，軌道其他區域仍可捲動；放開才重算比例尺。
- [刪除板塊會一起刪除持股] → 一定先確認，並在訊息中寫出會刪除的持股數。

## Migration Plan

1. 本機完成並驗收（含實際以使用者金鑰查詢報價，由使用者自行貼上金鑰）。
2. 經使用者同意後建立公開 GitHub repo、推送、Pages 來源設為 GitHub Actions。
3. 回滾：revert 有問題的 commit 並推送，workflow 重新部署；瀏覽器中的資料不受部署影響。

## Open Questions

- repo 名稱與 Pages 網址，建立 repo 時再決定。
