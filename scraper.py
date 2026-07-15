"""
課程雷達 - 通用抓取腳本
------------------------------------
設計原則：
1. 不針對每個網站寫死複雜的版面解析規則，而是抓取指定區塊內「所有連結的文字與網址」
   當作候選課程項目。
2. 每次執行都會跟上一次抓到的資料比對：
   - 新出現的連結 → 新增一筆，標記 first_seen（首次出現時間），並用關鍵字猜測是否為
     視訊課程（is_online），如果猜是視訊課程，review_status 預設為「待審核」
   - 之前抓過的 → 只更新 title 和 last_seen，其他欄位（尤其 is_online、review_status，
     這些通常是你手動審核調整過的）完全保留、不會被蓋掉
3. 資料寫回 data/courses.json，交給 index.html 讀取顯示。

如果某個來源抓不到東西，或抓到一堆雜訊（選單、頁尾連結），
請調整 sources.json 裡該來源的 "list_selector"，改指到該頁面實際列出課程的
容器（例如 "div.content" 或 "table"）。
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent
SOURCES_FILE = ROOT / "sources.json"
DATA_FILE = ROOT / "data" / "courses.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CourseRadarBot/1.0; +https://github.com/)"
}

MIN_TITLE_LEN = 6  # 太短的連結文字通常是選單/按鈕，過濾掉
JUNK_KEYWORDS = [
    "登入", "login", "隱私", "版權", "回首頁", "回上一頁", "回頁首",
    "next", "prev", "下一頁", "上一頁", "facebook", "分享", "sitemap",
    "聯絡我們", "english",
]

# 用來猜測「是否為視訊課程」的關鍵字，猜錯了之後審核時可以手動改回來
ONLINE_KEYWORDS = [
    "線上", "线上", "視訊", "视讯", "zoom", "webinar", "遠距", "远距",
    "數位課程", "数字课程", "meet.google", "teams", "書院", "on-line", "online",
]


def load_json(path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return default
    return default


def is_junk(text: str) -> bool:
    t = text.strip()
    if len(t) < MIN_TITLE_LEN:
        return True
    low = t.lower()
    return any(k in low for k in JUNK_KEYWORDS)


def guess_is_online(source_name: str, title: str) -> bool:
    text = (source_name + " " + title).lower()
    return any(k.lower() in text for k in ONLINE_KEYWORDS)


def scrape_source(source: dict) -> list[dict]:
    """對單一資料來源抓取所有連結文字，回傳候選課程項目清單。"""
    items = []
    try:
        resp = requests.get(source["url"], headers=HEADERS, timeout=20)
        resp.raise_for_status()
        if resp.encoding is None or resp.encoding.lower() == "iso-8859-1":
            resp.encoding = resp.apparent_encoding
    except requests.RequestException as e:
        print(f"[WARN] 抓取失敗 {source['name']}: {e}", file=sys.stderr)
        return items

    soup = BeautifulSoup(resp.text, "html.parser")
    container = soup.select_one(source.get("list_selector", "body")) or soup

    for a in container.find_all("a", href=True):
        title = a.get_text(strip=True)
        href = a["href"].strip()
        if not title or not href:
            continue
        if href.startswith("#") or href.lower().startswith("javascript"):
            continue
        if is_junk(title):
            continue
        full_url = urljoin(source["url"], href)
        items.append({"title": title, "url": full_url})

    seen = set()
    deduped = []
    for it in items:
        key = (it["title"], it["url"])
        if key not in seen:
            seen.add(key)
            deduped.append(it)
    return deduped


def main():
    sources = load_json(SOURCES_FILE, [])
    if not sources:
        print("[ERROR] sources.json 是空的或讀取失敗", file=sys.stderr)
        sys.exit(1)

    existing = load_json(DATA_FILE, [])
    existing_index = {(it["source"], it["url"]): it for it in existing}

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    for source in sources:
        found = scrape_source(source)
        print(f"{source['name']}: 找到 {len(found)} 個候選項目")
        for it in found:
            key = (source["name"], it["url"])
            if key in existing_index:
                record = existing_index[key]
                record["title"] = it["title"]  # 標題可能有補上時間地點等更新
                record["last_seen"] = now
                # is_online / review_status 保留原值，不覆蓋（可能是你審核調整過的）
            else:
                is_online = guess_is_online(source["name"], it["title"])
                existing_index[key] = {
                    "title": it["title"],
                    "source": source["name"],
                    "url": it["url"],
                    "origin": "auto",
                    "is_online": is_online,
                    "review_status": "待審核" if is_online else "",
                    "first_seen": now,
                    "last_seen": now,
                }

    updated = list(existing_index.values())
    updated.sort(key=lambda r: r["first_seen"], reverse=True)

    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        json.dumps(updated, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"完成，資料庫共 {len(updated)} 筆，寫入 {DATA_FILE}")


if __name__ == "__main__":
    main()
