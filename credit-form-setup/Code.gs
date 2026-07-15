/**
 * 課程心得暨學分申請表單 — 連接既有表單（乾淨版）
 * ------------------------------------------------------
 * 這份版本是設計來接上你「已經存在」的 Google 表單，不會另外建立新的表單。
 *
 * 使用方式：
 * 1. 到 https://script.google.com/ 用你的 Google 帳號建立新專案
 * 2. 把這整份程式碼貼上去（取代預設內容）
 * 3. 下面 ADMIN_EMAIL 已經幫你填好 yichin25@gmail.com，如果要改別的信箱再自己改
 * 4. 上方函式選單選 "init"，按執行（Run）
 *    - 第一次執行會跳出「未經驗證」的警告，屬正常現象
 *      點「進階」→「前往(專案名稱)(不安全)」→「允許」即可
 * 5. 執行完成後，點下方「執行紀錄」，確認有印出試算表網址，且沒有錯誤訊息
 *
 * 之後完全自動：學員填完表單 → 自動寄確認信給學員 → 自動通知你有新回覆進來，
 * 你只要固定去試算表審核、勾選「審核狀態」= 通過，
 * 再執行一次 generateSignInSheets 就會自動整理出每門課程的簽到清單分頁。
 */

const ADMIN_EMAIL = "yichin25@gmail.com";
const FORM_ID = "1GkXmaPTtCfqdE1nfVMwuJ-xCjT0yNPULHKMlyKd4a90"; // 你的表單（編輯者網址中的 ID）

const REVIEW_STATUS_APPROVED = "通過";
const STATUS_COL_NAME = "審核狀態（尚未審核/通過/需補件）";
const APPLIED_COL_NAME = "已申請學分";
const NOTE_COL_NAME = "備註";

const CONFIRM_SUBJECT = "已收到您的課程心得，感謝您的填寫";
const CONFIRM_BODY_TEMPLATE =
  "您好 {{name}}，\n\n" +
  "已收到您針對「{{course}}」繳交的課程心得，將由承辦單位統一核算學分並提出申請，" +
  "後續若資料有缺漏或需要補件，會再以此信箱與您聯繫。\n\n" +
  "感謝您的參與！";

// ------------------------------------------------------------------
// 一次性執行：連接現有表單、確認審核欄位、設定送出觸發器
// ------------------------------------------------------------------
function init() {
  const form = FormApp.openById(FORM_ID);
  const destId = form.getDestinationId();
  if (!destId) {
    throw new Error(
      "這個表單目前沒有連結任何回覆試算表。請到表單「回覆」分頁 → 右上角試算表圖示 → 建立試算表，再重新執行一次 init。"
    );
  }
  const ss = SpreadsheetApp.openById(destId);
  const sheet = findResponseSheet_(ss);

  // 確認審核用欄位存在，沒有的話自動補上
  const colMap = getColumnIndexMap_(sheet);
  const lastCol = sheet.getLastColumn();
  let nextCol = lastCol;
  if (!(STATUS_COL_NAME in colMap)) {
    nextCol += 1;
    sheet.getRange(1, nextCol).setValue(STATUS_COL_NAME);
  }
  if (!(APPLIED_COL_NAME in colMap)) {
    nextCol += 1;
    sheet.getRange(1, nextCol).setValue(APPLIED_COL_NAME);
  }
  if (!(NOTE_COL_NAME in colMap)) {
    nextCol += 1;
    sheet.getRange(1, nextCol).setValue(NOTE_COL_NAME);
  }

  // 記住這個試算表 ID，之後 generateSignInSheets、doGet 都會自動用到
  PropertiesService.getScriptProperties().setProperties({
    SPREADSHEET_ID: ss.getId(),
    FORM_ID: FORM_ID,
  });

  // 確保表單送出觸發器存在，不重複建立
  const triggers = ScriptApp.getProjectTriggers();
  const hasTrigger = triggers.some(
    (t) => t.getHandlerFunction() === "onFormSubmitHandler"
  );
  if (!hasTrigger) {
    ScriptApp.newTrigger("onFormSubmitHandler").forForm(form).onFormSubmit().create();
  }

  Logger.log("========================================");
  Logger.log("已連接完成");
  Logger.log("表單填寫網址：" + form.getPublishedUrl());
  Logger.log("回覆試算表網址：" + ss.getUrl());
  Logger.log("========================================");
  Logger.log(
    "接下來請到 Google 表單「課程名稱」欄位右上角三個點 → 取得預先填入的連結，" +
    "填入任一課程名稱送出，從網址中找出 entry.XXXXXXXXX 的數字，" +
    "貼到 course-radar 專案的 config.json 的 course_name_entry_id"
  );
}

// ------------------------------------------------------------------
// 表單送出時觸發：寄確認信給學員 + 通知管理者
// ------------------------------------------------------------------
function onFormSubmitHandler(e) {
  const responses = e.response.getItemResponses();
  let name = "";
  let email = "";
  let course = "";

  for (const r of responses) {
    const title = r.getItem().getTitle();
    if (title === "姓名") name = r.getResponse();
    if (title === "Email") email = r.getResponse();
    if (title === "課程名稱") course = r.getResponse();
  }

  if (email) {
    const body = CONFIRM_BODY_TEMPLATE.replace("{{name}}", name).replace(
      "{{course}}",
      course
    );
    MailApp.sendEmail(email, CONFIRM_SUBJECT, body);
  }

  MailApp.sendEmail(
    ADMIN_EMAIL,
    "【課程心得】新回覆：" + name + " - " + course,
    "有新的課程心得送出，姓名：" + name + "，課程：" + course +
      "，請至回覆試算表查看並進行學分審核。"
  );
}

// ------------------------------------------------------------------
// 手動執行：把「審核狀態＝通過」的學員，依課程分組整理成簽到清單分頁
// 建議每次要送學分申請前，先在試算表把審核狀態填好，再執行這個函式
// ------------------------------------------------------------------
function generateSignInSheets() {
  const ss = getResponseSpreadsheet_();
  const sheet = findResponseSheet_(ss);
  const colMap = getColumnIndexMap_(sheet);
  const rows = sheet.getDataRange().getValues();

  const byCourse = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const status = row[colMap[STATUS_COL_NAME]];
    if (status !== REVIEW_STATUS_APPROVED) continue;
    const course = row[colMap["課程名稱"]];
    if (!course) continue;
    if (!byCourse[course]) byCourse[course] = [];
    byCourse[course].push({
      name: row[colMap["姓名"]],
      unit: row[colMap["服務單位／職稱"]],
      email: row[colMap["Email"]],
      date: row[colMap["上課／完成日期"]],
    });
  }

  for (const course in byCourse) {
    const tabName = ("簽到_" + course).substring(0, 90);
    let tab = ss.getSheetByName(tabName);
    if (!tab) tab = ss.insertSheet(tabName);
    tab.clear();
    tab
      .getRange(1, 1, 1, 5)
      .setValues([["序號", "姓名", "服務單位／職稱", "Email", "上課／完成日期"]]);
    const list = byCourse[course];
    const dataRows = list.map((s, idx) => [idx + 1, s.name, s.unit, s.email, s.date]);
    if (dataRows.length > 0) {
      tab.getRange(2, 1, dataRows.length, 5).setValues(dataRows);
    }
  }

  Logger.log("已更新 " + Object.keys(byCourse).length + " 門課程的簽到清單分頁，可到試算表查看");
}

// ------------------------------------------------------------------
// 部署成「網頁應用程式」後，course-radar 網站可以打這個網址，
// 拿到「每門課程已認列人數」（不含姓名，保護學員個資），
// 用來在課程清單上顯示「已有 N 人完成，學分認列中」
//
// 部署方式：右上角「部署」→「新增部署作業」→類型選「網頁應用程式」→
// 執行身分：我；誰可以存取：所有人 → 部署後複製網址，貼到
// config.json 的 status_api_url
// ------------------------------------------------------------------
function doGet(e) {
  const ss = getResponseSpreadsheet_();
  const sheet = findResponseSheet_(ss);
  const colMap = getColumnIndexMap_(sheet);
  const rows = sheet.getDataRange().getValues();

  const counts = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const status = row[colMap[STATUS_COL_NAME]];
    if (status !== REVIEW_STATUS_APPROVED) continue;
    const course = row[colMap["課程名稱"]];
    if (!course) continue;
    counts[course] = (counts[course] || 0) + 1;
  }

  const result = Object.keys(counts).map((course) => ({
    course: course,
    approved_count: counts[course],
  }));

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ------------------------------------------------------------------
// 內部工具函式
// ------------------------------------------------------------------
function getResponseSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) {
    throw new Error("找不到 SPREADSHEET_ID，請先執行過一次 init()");
  }
  return SpreadsheetApp.openById(id);
}

function findResponseSheet_(ss) {
  const sheets = ss.getSheets();
  for (const s of sheets) {
    if (s.getLastColumn() > 1 && s.getLastRow() > 0) return s;
  }
  return sheets[0];
}

function getColumnIndexMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    map[h.toString().trim()] = i;
  });
  return map;
}
