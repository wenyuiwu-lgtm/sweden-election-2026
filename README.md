# 2026 瑞典大選 Poll of Polls 網站

一個追蹤 2026 年瑞典國會大選民調的網站:彙整多家機構民調、用加權模型算出「Poll of Polls」綜合支持率與預估席次,並用儀表板呈現。網站介面語言為英文(給國際讀者看),開發文件用繁體中文。

規劃來源:[Google Doc — 系統架構規劃](https://docs.google.com/document/d/1HfLm4MQ21yE6VfEISGLcVOFsL7pOt4ThCQDRSApaSJU/edit),完整整理見 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 資料夾結構

```
sweden-election-2026/
├── docs/
│   └── ARCHITECTURE.md      # 系統架構 & 開發階段規劃(對照 Google Doc)
├── db/
│   └── schema.sql           # Supabase / PostgreSQL 資料表定義
├── backend/
│   ├── election.py          # 民調加權 Pipeline(去重寫入、45天取數、加權運算、席次分配)
│   ├── scrape_wikipedia.py  # 從英文維基百科民調條目爬資料,餵進 election.py 的 Pipeline
│   ├── requirements.txt
│   └── .env.example
├── .github/workflows/
│   └── update-polls.yml     # 排程:每週一自動重新爬取 + 寫入,9/11 大選日後自動停止
└── frontend/                # Next.js + Tailwind + Recharts 儀表板(英文介面)
```

## 目前狀態

- [x] 專案資料夾與文件就位
- [x] Supabase 專案已建立(新專案,獨立於 fika-app/svenska-app):`sweden-election-2026`,region `eu-north-1`
- [x] `db/schema.sql` 已在該 Supabase 專案跑過:`raw_polls`、`poll_of_polls_history` 兩張表,RLS 只開放公開讀取
- [x] 資料來源:爬取英文維基百科「[Opinion polling for the 2026 Swedish general election](https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Swedish_general_election)」條目(`backend/scrape_wikipedia.py`),已實測可解析出 32 筆 2026 年民調
- [x] `election.py` 的機構清單依維基百科實際數據來源更新為 SCB、Novus、Demoskop、Ipsos、Verian、Indikator(原本只有前 4 家,Verian、Indikator 是目前這次大選週期報最勤的兩家,詳見下方「與原規劃的差異」)
- [x] 已跑過完整流程(含真正透過 GitHub Actions 執行一次驗證過),資料庫裡有真實數據,前端已經接上、顯示真實數字
- [x] 前端介面文案已全部英文化
- [x] **排程自動化**:GitHub repo [wenyuiwu-lgtm/sweden-election-2026](https://github.com/wenyuiwu-lgtm/sweden-election-2026)(公開),`.github/workflows/update-polls.yml` 每週一 06:00 UTC 自動重新爬取 + 寫入,9/11 大選日之後會自動變成無動作(不用手動關閉,見下方說明)
- [ ] AI 選情洞察生成器

## 與原規劃的差異(需要你知道)

1. **機構清單擴充**:原始 `election.py` 只允許 SCB、Novus、Demoskop、Ipsos 四家。但維基百科頁面顯示這次大選週期實際發布最頻繁的是 Novus、Demoskop、**Verian**(Kantar Sifo 改名後的公司)、**Indikator**,SCB 和 Ipsos 反而發布頻率較低。我把 Verian、Indikator 也加進 `ALLOWED_POLLSTERS` 和 `INSTITUTION_WEIGHTS`(給了中等權重 1.2 / 1.0),否則會漏掉大部分最新民調。這個權重是我暫定的,之後你想調整很歡迎。
2. **爬蟲資料沒有「發布日期」欄位**:維基百科只給「調查執行期間」(fieldwork date range),沒有另外的發布日期,所以 `publication_date` 目前用 fieldwork 的結束日期代替(業界常見做法)。
3. **走勢圖資料源**:走勢折線圖(Support Trend)目前是直接讀 `raw_polls`(每筆民調各政黨的原始數字隨時間變化),不是 `poll_of_polls_history` 的加權結果——因為每週的加權快照數量還太少,畫不出有意義的走勢。等 9/11 前累積幾週的快照後,可以考慮改成兩者並存(原始民調當背景散點、加權線當主要趨勢)。
4. **`poll_of_polls_history` 沒有防重複寫入**:`election.py` 原本的 `save_poll_of_polls_result` 是單純 `insert`,同一天如果手動+排程各跑一次,會產生兩筆同一天的快照(我在測試時就遇到,已手動清掉重複的那筆)。正常情況下排程只會每週一自動跑一次,不會有這個問題;但如果你之後想手動補跑,记得這件事。

## 下一步

1. AI 選情洞察生成器(每次 Pipeline 跑完後,產出約 300 字的英文選情摘要)
2. 之後若想要走勢圖更準,可以考慮把排程頻率從「每週一次」改成更密集

## GitHub Actions 排程說明

- Repo:[wenyuiwu-lgtm/sweden-election-2026](https://github.com/wenyuiwu-lgtm/sweden-election-2026)(公開)
- Workflow:`.github/workflows/update-polls.yml`,每週一 06:00 UTC(台灣時間下午 2 點、瑞典夏令時間早上 8 點)自動跑 `backend/scrape_wikipedia.py`
- **9/11 大選日後自動停止**:workflow 裡有一個日期檢查步驟,超過 2026-09-11 就會直接跳過所有步驟(不消耗你的 Actions 分鐘數,也不會再寫入資料庫),不需要你之後手動刪除或關閉這個 workflow
- Secrets:`SUPABASE_URL`、`SUPABASE_KEY`(service role)已經設定在 repo 的 GitHub Actions Secrets 裡,不會顯示在程式碼或這份文件中
- 想手動立即跑一次(不等週一),可以到 [Actions 頁面](https://github.com/wenyuiwu-lgtm/sweden-election-2026/actions/workflows/update-polls.yml) 點 **Run workflow**

## 開發規範

- 網站介面:英文
- 開發文件(README / ARCHITECTURE):繁體中文
- 資料庫:與 fika-app / svenska-app 是不同的 Supabase 專案,不要共用金鑰或誤植到同一個 `.env`
