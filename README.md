# 教學醫院課程雷達 — 完整設定教學（重新設計版）

一句話說明這個系統在做什麼：

> 自動 + 手動收集課程資訊 → 只有「視訊課程」需要你審核是否列入學分 →
> 審核通過的課程，網站上會出現「填寫心得申請學分」按鈕，連到 Google 表單，
> 學員填完你收到通知，之後統一整理去申請、上傳學分。

全程不用寫程式、不用架伺服器，用 GitHub（免費靜態網站 + 免費排程）+
Google 表單/試算表/Apps Script（免費自動化）組成。

---

## 事前準備

- [ ] 一個 GitHub 帳號：https://github.com/signup
- [ ] 一個 Google 帳號
- [ ] 你想收「新回覆通知信」的 Email

---

## 階段一：課程雷達網站上線

1. GitHub 新建一個 **Public** repo
2. 把這次收到的所有檔案上傳上去（含 `.github` 隱藏資料夾；用 GitHub Desktop 同步比較不會漏掉隱藏資料夾）
3. **Settings → Actions → General → Workflow permissions** 選「Read and write permissions」→ Save
4. **Actions 分頁 → Scrape Courses → Run workflow** 手動跑一次，確認 log 有抓到資料
5. **Settings → Pages** → Source 選 `main` branch → Save，等 1-2 分鐘拿到網址
   `https://你的帳號.github.io/repo名稱/`

之後每天台灣時間早上 9 點自動跑一次，不用管。

---

## 階段二：連接你的學分心得表單

你已經有一個 Google 表單了，`Code.gs` 這份是**乾淨版**，設計成直接連接你現有的表單，
不會另外建立新的重複表單。

1. 到 https://script.google.com/ 建立新專案，把 `credit-form-setup/Code.gs` 整份程式碼貼上去
   （裡面 `ADMIN_EMAIL` 和 `FORM_ID` 已經幫你填好，不用再改）
2. 上方函式選單選 **init**，執行
   - 第一次執行會跳出「未經驗證」的警告，這是正常的，因為是你自己的腳本
   - 點「進階」→「前往(專案名稱)(不安全)」→「允許」
3. 執行完成後點「執行紀錄」，確認有印出：
   - 表單填寫網址
   - 回覆試算表網址
   - 沒有出現紅字錯誤

執行後，回覆試算表會自動多出「審核狀態」「已申請學分」「備註」三欄（如果還沒有的話），
以後你就在這個試算表上做審核。

---

## 階段三：把表單、審核結果跟網站串起來

### 3-1　讓學員填的「課程名稱」跟網站標題一致

1. 打開表單編輯網址 →「課程名稱」欄位右上角三個點 → **取得預先塞入的連結**
2. 隨便填一個名稱送出，網址裡會出現 `entry.數字`
3. 把這串數字填進 `config.json` 的 `course_name_entry_id`

### 3-2　部署「已認列人數」查詢網址

1. Apps Script 專案右上角「部署」→「新增部署作業」→ 類型選 **網頁應用程式**
2. 執行身分「我」、存取權限「所有人」→ 部署 → 複製網址
3. 填進 `config.json` 的 `status_api_url`

### 3-3　確認 `config.json` 的 `form_url`

已經幫你填好你的表單填寫網址了，不用再改，除非你之後換了新表單。

```json
{
  "form_url": "https://docs.google.com/forms/d/e/xxxx/viewform",
  "course_name_entry_id": "987654321",
  "status_api_url": "https://script.google.com/macros/s/xxxx/exec"
}
```

---

## 日常操作：審核視訊課程 + 手動新增課程

### 審核視訊課程是否列入學分

1. 打開 repo 裡的 `data/courses.json`（自動抓的）或 `data/manual-courses.json`（手動加的）
2. 找到 `is_online: true` 且 `review_status: "待審核"` 的那筆課程
3. 確認是否列入學分，把 `review_status` 改成：
   - `"通過"` → 網站顯示「✅ 已審核通過」+ 出現心得表單按鈕
   - `"不列入"` → 網站顯示「⛔ 不列入學分」
4. 如果 `is_online` 猜錯了（例如明明是實體課程卻被猜成視訊），直接把它改成 `true`/`false` 即可，`review_status` 也一併調整
5. Commit 存檔

> 自動抓取時是用關鍵字（線上、視訊、zoom、webinar 等）**猜測**是否為視訊課程，
> 猜錯很正常，審核時看到不對直接改掉即可，之後排程重跑也不會覆蓋你改過的欄位。

### 手動新增課程（收到電子檔、email 等非自動來源的課程資訊）

打開 `data/manual-courses.json`，仿照範例加一筆：

```json
{
  "title": "課程完整名稱",
  "source": "主辦單位名稱",
  "url": "課程連結或你上傳的 PDF 網址",
  "origin": "manual",
  "is_online": true,
  "review_status": "待審核",
  "first_seen": "2026-07-15"
}
```

- 如果是實體課程：`is_online: false`，`review_status: ""`（不需要審核）
- 如果是視訊課程：`is_online: true`，`review_status: "待審核"`（之後你自己審核改成通過/不列入）

如果課程資訊是 PDF/圖片檔，先上傳到 repo 的 `manual-files` 資料夾（沒有就自己建立），
用 `https://你的帳號.github.io/repo名稱/manual-files/檔名.pdf` 這個網址填進 `url`。

**不想自己編輯 JSON 的話**：把課程電子檔或訊息直接貼給我，我幫你組好格式，
你只要複製貼上、Commit 就好。

### 產生簽到清單 + 統計已認列人數

1. 學員填表單 → 你收到通知信 → 到回覆試算表看心得內容
2. 覺得可以算學分的，把該列 **審核狀態** 欄位填「通過」
3. Apps Script 執行 **generateSignInSheets** → 自動產生 `簽到_課程名稱` 分頁（姓名、服務單位、Email、日期），可直接匯出/列印去申請學分
4. 網站上該課程「已有 N 人送出心得」的數字，跟這個試算表的「通過」名單同步

---

## 常見問題

**Q: 某個來源抓到 0 筆，或抓到都是雜訊？**
用瀏覽器打開該網頁按右鍵「檢查」，找到實際列出課程的容器（`<table>`、`<ul>`、`<div class="...">`），
把它的 class/id 填進 `sources.json` 對應來源的 `list_selector`。如果不確定，把該頁面的網址或
原始碼片段貼給我，我幫你看。

**Q: 有些網站的下載連結怎麼抓都抓不到？**
有些機構網站的附件下載不是標準的 `<a href="...">` 連結，而是需要真的瀏覽器點擊才會觸發（例如
ASP.NET 表單回傳），這種情況沒辦法用簡單的爬蟲抓取，建議改用手動新增的方式處理這類來源。

**Q: 想要新增更多醫院/學會來源？**
編輯 `sources.json`，仿照現有格式加一筆 `{"name": ..., "url": ..., "list_selector": "body"}`，
Commit 之後下次排程就會一併抓取。

**Q: 表單會收集學員姓名、Email，這樣可以嗎？**
建議在表單描述裡註明「本資料僅用於學分申請，不做其他用途」。網站公開頁面只顯示總人數，
不會顯示任何學員姓名或 Email，姓名這類個資只留在你自己的試算表裡。
