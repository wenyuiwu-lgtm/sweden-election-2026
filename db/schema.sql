-- 2026 Swedish Election Poll of Polls — database schema
-- Matches the read/write logic in backend/election.py. Runs on Supabase / PostgreSQL.

-- Raw polls table: records each qualifying institute's published numbers,
-- deduplicated on poll_id, kept for audit and historical trend purposes.
create table if not exists raw_polls (
    poll_id text primary key,
    pollster text not null,
    publisher text default 'N/A',
    start_date date not null,
    end_date date not null,
    publication_date date not null,
    sample_size integer not null,
    methodology text default 'Unknown',
    data jsonb not null,          -- per-party support, e.g. {"S": 28.5, "SD": 20.1, ...}
    created_at timestamptz not null default now()
);

create index if not exists idx_raw_polls_publication_date on raw_polls (publication_date desc);
create index if not exists idx_raw_polls_pollster on raw_polls (pollster);

-- Weighted-result table: one snapshot per pipeline run.
create table if not exists poll_of_polls_history (
    id bigserial primary key,
    calculation_date date not null,
    total_polls_included integer not null,
    date_range_days integer not null default 45,  -- actual window used (varies by institution half-life, see election.py)
    parties jsonb not null,        -- { "S": { name, weighted_support, margin_of_error, projected_seats, threshold_passed, pass_probability }, ... }
    bloc_summary jsonb not null,   -- { "red_green_bloc": {...}, "tido_bloc": {...} }
    updated_at timestamptz not null,
    created_at timestamptz not null default now(),
    update_note text                -- human-readable summary of what changed since the previous snapshot (see election.py's build_update_note)
);

create index if not exists idx_poll_of_polls_history_calculation_date on poll_of_polls_history (calculation_date desc);

-- RLS: the site's read side is public (dashboard); writes are restricted to
-- the backend pipeline running with the service role key.
alter table raw_polls enable row level security;
alter table poll_of_polls_history enable row level security;

create policy "raw_polls public read" on raw_polls for select using (true);
create policy "poll_of_polls_history public read" on poll_of_polls_history for select using (true);

-- Writes are only granted to service_role (used by the backend pipeline); anon has no write access.
