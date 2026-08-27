# 系統架構藍圖 — 2026 瑞典大選 Poll of Polls 網站

> 來源:Google Doc「2026 Swedish General Election — 系統架構規劃」
> https://docs.google.com/document/d/1HfLm4MQ21yE6VfEISGLcVOFsL7pOt4ThCQDRSApaSJU/edit
> 本檔為該文件的落地整理,作為開發時的對照依據。之後文件若更新,請同步更新本檔。

## 系統分層

```
[ 資料擷取層 Data Layer ]
  └── 爬蟲 / 定時腳本 (Python / GitHub Actions)
        ↓
[ 數據運算與儲存層 Processing & DB ]
  ├── PostgreSQL / Supabase (資料庫存取)
  └── Pipeline 運算模組 (指數衰減加權 + Sainte-Laguë 席次分配)
        ↓
[ AI 與 API 服務層 Engine Layer ]
  ├── FastAPI / Node.js 後端服務
  └── LLM AI 分析模組 (自動生成政黨動態與門檻警訊報告)
        ↓
[ 前端視覺化層 Presentation Layer ]
  └── Next.js / React + Tailwind CSS + Recharts (動態圖表與民調儀表板)
```

## 民調加權方法論(Poll of Polls Methodology)

不依賴單一民調,採多維度動態加權模型。

**資料篩選門檻**:僅採納歷史平均偏差(MAE)< 1.1% 且單次樣本數 > 1,000 人的機構——SCB、Demoskop、Novus、Ipsos,**加上依實際爬蟲數據補上的 Verian、Indikator**(這兩家是目前維基百科條目裡發布最頻繁的機構,原規劃沒列到,詳見 README「與原規劃的差異」)。剔除快閃網路投票。

**三大加權指標**:

| 指標 | 說明 |
|---|---|
| 時間衰減加權 | 14 天半衰期指數衰減,越新的民調權重越高 |
| 機構公信力加權 | 依歷史準確度給差異化權重(SCB 最高、其次 Demoskop/Novus、Ipsos) |
| 樣本數開根號加權 | 次線性加權,避免單一超大樣本過度主導結果 |

席次分配採 **Sainte-Laguë 法**,4% 門檻,349 席 Riksdag。

## 資料庫(Supabase / PostgreSQL)

兩張核心表,詳見 [`db/schema.sql`](../db/schema.sql):

- **raw_polls**:原始民調紀錄(稽核/追溯用),以 `poll_id` 去重
- **poll_of_polls_history**:每次 Pipeline 運算後的加權結果快照(政黨支持率、席次、過門檻機率、陣營彙整)

## 後端 Pipeline(Python)

沿用 `backend/election.py`(原始檔名 election,來自 Downloads),流程:

1. `backend/scrape_wikipedia.py` 爬取英文維基百科的「[Opinion polling for the 2026 Swedish general election](https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Swedish_general_election)」條目 → 寫入 `raw_polls`(`upsert` + `poll_id` 去重)
2. 讀取最近 45 天內的合格 `raw_polls` 數據
3. 三重加權運算 + Sainte-Laguë 席次分配
4. 結果寫入 `poll_of_polls_history`

爬蟲抓取的是該條目「2026」年份底下的民調表格(19 欄:機構、調查期間、樣本數、8 大政黨支持率、其他、多個 Lead 欄位、兩陣營支持率與席次),目前解析出 32 筆 2026 年民調。維基百科沒有獨立的「發布日期」欄位,`publication_date` 以調查期間的結束日代替。

## API 端點(FastAPI 或 Next.js API Routes)

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/v1/polls/latest` | 最新一日加權結果 + 陣營席次 |
| GET | `/api/v1/polls/trends?party=S` | 特定政黨近期支持率走勢 |
| GET | `/api/v1/polls/threshold-risk` | 4% 門檻邊緣政黨(如 KD、L)風險評估 |
| GET | `/api/v1/polls/insights` | AI 自動產出的選情動態摘要 |

## AI 選情洞察生成器

每次 Pipeline 計算完成並寫入 `poll_of_polls_history` 後,觸發 LLM 模組,傳入最新 JSON 產出 ~300 字政治分析,重點涵蓋:

- 是否有政黨跌破 4% 門檻?
- 兩大陣營(紅綠 vs Tidö)席次差幾席過半(175 席)?
- 近期哪個政黨升降幅度最明顯?

## 前端儀表板(Next.js + Tailwind + Recharts)

- **頂部卡片**:紅綠聯盟 vs Tidö 陣營預估席次(如 192 vs 157,過半門檻 175)
- **席次分配圖**:349 席 Riksdag 半圓形/長條圖
- **政黨支持率列表**:8 大政黨支持率、抽樣誤差、突破 4% 機率
- **走勢折線圖**:近半年各政黨支持率走勢

## 陣營劃分(依原始腳本)

- 紅綠陣營(red_green_bloc):S、V、MP、C
- Tidö 陣營(tido_bloc):M、SD、KD、L
- 其餘:OTH(不計入席次分配)

## 開發階段建議

1. **M1**(已完成):專案資料夾 + 文件 + DB schema + Python pipeline 就位 + 前端專案初始化
2. **M2**(已完成):建立真正的 Supabase 專案、跑 schema、爬蟲接上維基百科、手動跑過一次完整流程並寫入真實數據
3. **M3**(已完成):後端 API 端點(用 Next.js API Routes,讀 `poll_of_polls_history` 與 `raw_polls`)
4. **M4**(已完成):前端儀表板串接真實 API,呈現席次卡片 + 政黨列表 + 走勢圖,介面英文化
5. **M5**(下一步):排程自動化(GitHub Actions 定期跑 `scrape_wikipedia.py`),需要 service role key
6. **M6**:AI 選情洞察生成器
