# Spec Delta

## Purpose

用 GitHub Actions 把網頁自動部署到 GitHub Pages，讓使用者在手機和電腦用同一個網址開啟，且公開的網站只包含程式碼、不含任何持倉資料。

## ADDED Requirements

### Requirement: 推送後自動部署
程式碼推送到 `main` 分支時，GitHub Actions SHALL 自動把網頁部署到該 repo 的 GitHub Pages；也 SHALL 支援在 Actions 頁面手動觸發部署。

#### Scenario: 推送到 main
- **WHEN** 使用者把修改推送到 `main`
- **THEN** Actions 執行部署流程，完成後 Pages 網址顯示最新版本

### Requirement: 測試通過才部署
部署流程 MUST 先執行計算邏輯的自動測試；任何測試失敗時 MUST NOT 部署，網站維持上一個版本。

#### Scenario: 測試失敗
- **WHEN** 推送的程式碼讓權重計算測試失敗
- **THEN** Actions 標示失敗，Pages 網站不變

### Requirement: 只發布網頁檔案
部署到 Pages 的內容 SHALL 只包含網頁運作所需的檔案，MUST NOT 包含規劃文件、測試檔、設計稿或任何持倉資料。

#### Scenario: 檢查已發布的內容
- **WHEN** 有人瀏覽 Pages 網站或下載它的檔案
- **THEN** 只能取得網頁程式與樣式，看不到 `openspec/`、`docs/`、`design/`、測試檔或任何持倉數字

### Requirement: 在子路徑下正常運作
網頁 SHALL 在 GitHub Pages 的 repo 子路徑（例如 `https://<帳號>.github.io/<repo>/`）下正常載入所有資源，也 SHALL 能直接用瀏覽器打開本機的 `index.html` 使用。

#### Scenario: 透過 Pages 子路徑開啟
- **WHEN** 使用者開啟 `https://<帳號>.github.io/<repo>/`
- **THEN** 樣式與程式都正常載入，沒有 404 錯誤

#### Scenario: 直接打開本機檔案
- **WHEN** 使用者在電腦上直接雙擊 `index.html`
- **THEN** 網頁可以正常使用，包含填寫、圖表、代號搜尋與匯出入

### Requirement: 代號清單可重新產生
專案 SHALL 提供一個指令，從 Nasdaq Trader 公開代號目錄重新產生網頁內建的美股代號清單；產生的代號數量異常（少於 5000）時 MUST 不覆寫原檔。

#### Scenario: 重新產生代號清單
- **WHEN** 開發者執行 `node scripts/build-symbols.js`
- **THEN** `site/data/symbols.js` 更新為最新的代號清單，並印出檔數與檔案大小
