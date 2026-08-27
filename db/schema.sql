-- 2026 瑞典大選 Poll of Polls — 資料庫 schema
-- 對應 backend/election.py 的讀寫邏輯,執行於 Supabase / PostgreSQL

-- 原始民調表:紀錄合規機構發布的原始數字,poll_id 去重,供稽核與追溯歷史
create table if not exists raw_polls (
    poll_id text primary key,
    pollster text not null,
    publisher text default 'N/A',
    start_date date not null,
    end_date date not null,
    publication_date date not null,
    sample_size integer not null,
    methodology text default 'Unknown',
    data jsonb not null,          -- 各政黨支持率,例如 {"S": 28.5, "SD": 20.1, ...}
    created_at timestamptz not null default now()
);

create index if not exists idx_raw_polls_publication_date on raw_polls (publication_date desc);
create index if not exists idx_raw_polls_pollster on raw_polls (pollster);

-- 加權運算結果表:每次 Pipeline 執行後的快照
create table if not exists poll_of_polls_history (
    id bigserial primary key,
    calculation_date date not null,
    total_polls_included integer not null,
    date_range_days integer not null default 45,  -- 實際使用的窗口天數(依機構半衰期而定,見 election.py)
    parties jsonb not null,        -- { "S": { name, weighted_support, margin_of_error, projected_seats, threshold_passed, pass_probability }, ... }
    bloc_summary jsonb not null,   -- { "red_green_bloc": {...}, "tido_bloc": {...} }
    updated_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_poll_of_polls_history_calculation_date on poll_of_polls_history (calculation_date desc);

-- RLS:此網站的讀取面向公眾(儀表板),寫入僅限後端 pipeline(service role)
alter table raw_polls enable row level security;
alter table poll_of_polls_history enable row level security;

create policy "raw_polls 公開讀取" on raw_polls for select using (true);
create policy "poll_of_polls_history 公開讀取" on poll_of_polls_history for select using (true);

-- 寫入僅開放給 service_role(後端 pipeline 使用),不對外開放 anon 寫入
