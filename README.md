# 2026 Swedish Election — Poll of Polls

A site tracking polls for the 2026 Swedish general election: aggregates polls from multiple institutes, runs a weighted model to produce a combined "Poll of Polls" support estimate and seat projection, and presents it on a dashboard. All documentation and code comments are in English.

Planning source: [Google Doc — system architecture plan](https://docs.google.com/document/d/1HfLm4MQ21yE6VfEISGLcVOFsL7pOt4ThCQDRSApaSJU/edit); full write-up in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Folder structure

```
sweden-election-2026/
├── docs/
│   └── ARCHITECTURE.md      # System architecture & development-stage plan (mirrors the Google Doc)
├── db/
│   └── schema.sql           # Supabase / PostgreSQL table definitions
├── backend/
│   ├── election.py          # Poll-weighting pipeline (dedup writes, recency window, weighting, seat allocation)
│   ├── scrape_wikipedia.py  # Scrapes the English Wikipedia polling article and feeds election.py's pipeline
│   ├── requirements.txt
│   └── .env.example
├── .github/workflows/
│   └── update-polls.yml     # Schedule: re-scrapes + writes every Monday, auto-stops after election day (9/11)
└── frontend/                # Next.js + Tailwind + Recharts dashboard
```

## Current status

- [x] Project folders and docs in place
- [x] Supabase project created (new project, separate from fika-app/svenska-app): `sweden-election-2026`, region `eu-north-1`
- [x] `db/schema.sql` applied to that project: `raw_polls` and `poll_of_polls_history` tables, RLS grants public read only
- [x] Data source: scrapes the English Wikipedia article "[Opinion polling for the 2026 Swedish general election](https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Swedish_general_election)" (`backend/scrape_wikipedia.py`), tested to correctly parse 32 polls from 2026
- [x] `election.py`'s institute list was updated to match what's actually on Wikipedia: SCB, Novus, Demoskop, Ipsos, Verian, Indikator (originally only the first four; Verian and Indikator are the two most active pollsters this cycle — see "Deviations from the original plan" below)
- [x] Full pipeline has been run end to end (including once for real via GitHub Actions); the database holds real data and the frontend is wired up and displaying it
- [x] Frontend copy is fully in English
- [x] **Scheduled automation**: public GitHub repo [wenyuiwu-lgtm/sweden-election-2026](https://github.com/wenyuiwu-lgtm/sweden-election-2026); `.github/workflows/update-polls.yml` re-scrapes and writes every Monday at 06:00 UTC, and becomes a no-op after election day (9/11) without needing to be manually disabled (see below)
- [ ] AI-generated election-insight summaries

## Deviations from the original plan (worth knowing)

1. **Expanded institute list.** The original `election.py` only allowed SCB, Novus, Demoskop, and Ipsos. Wikipedia shows the institutes actually publishing most often this cycle are Novus, Demoskop, **Verian** (the renamed Kantar Sifo), and **Indikator**, with SCB and Ipsos publishing less frequently. I added Verian and Indikator to `ALLOWED_POLLSTERS` and `INSTITUTION_WEIGHTS` (mid-tier weights of 1.2 / 1.0), otherwise most recent polls would be dropped. These weights are provisional — happy to adjust them.
2. **Scraped data has no "publication date" field.** Wikipedia only gives a fieldwork date range, not a separate publication date, so `publication_date` currently uses the fieldwork end date instead (a common industry convention).
3. **Trend chart's data source.** The Support Trend line chart currently reads directly from `raw_polls` (each individual poll's raw per-party numbers over time), not the weighted results in `poll_of_polls_history` — there simply aren't enough weekly snapshots yet to draw a meaningful trend from those. Once a few weeks of snapshots accumulate before 9/11, it's worth considering both together (raw polls as background scatter, the weighted line as the primary trend).
4. **`poll_of_polls_history` has no write-deduplication.** `election.py`'s original `save_poll_of_polls_result` is a plain `insert`; running it manually and via the schedule on the same day produces two snapshots for that day (I hit this while testing and manually removed the duplicate). This won't come up under normal weekly-schedule operation, but keep it in mind if you ever run it manually.
5. **SCB gets its own half-life, and the window widened from 45 to 180 days.** SCB only publishes twice a year (unlike Novus/Demoskop etc., which publish every 2-4 weeks). The original 45-day window plus a flat 14-day half-life either excluded SCB entirely or decayed it to ~1% weight — effectively wasted effort. Changed to: ① widen the data window from 45 to 180 days (so a twice-yearly SCB poll can be reached at all); ② `INSTITUTION_HALF_LIFE_DAYS` gives SCB its own 90-day half-life (other institutes keep 14 days). Older polls from high-frequency institutes that now fall inside the wider window aren't distorting anything, because their own 14-day half-life already suppresses anything past ~91 days to near zero. This was decided together with you — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) or the site's own Methodology section for details.
6. **Each institute capped at 3 polls (`MAX_POLLS_PER_INSTITUTION`).** After widening the window to 180 days, a high-frequency institute (e.g. Novus with 6 polls in half a year) would accumulate a higher total weight than others purely by publishing more often — verified with real data: Novus held 28.4% of total weight, higher than SCB's 20.8% despite SCB having the highest per-poll institution weight. This cap limits each institute to its 3 most recent polls in the window regardless of institution weight. **Honest caveat: in practice this barely moved the numbers** (Novus 28.4% → 28.2%, S support unchanged at 31.41%) — the 14-day half-life was already suppressing anything past 2-3 publishing cycles, so this cap is currently more of a safeguard than something with a measurable effect. It would matter if an institute ever published unusually often in a short window.

## Next steps

1. AI-generated election-insight summaries (a ~300-word English summary produced after each pipeline run)
2. If the trend chart needs to be more precise, consider increasing the schedule frequency from weekly

## GitHub Actions schedule

- Repo: [wenyuiwu-lgtm/sweden-election-2026](https://github.com/wenyuiwu-lgtm/sweden-election-2026) (public)
- Workflow: `.github/workflows/update-polls.yml`, runs `backend/scrape_wikipedia.py` every Monday at 06:00 UTC (2pm Taiwan time, 8am Swedish summer time)
- **Automatically stops after election day (9/11)**: the workflow has a date-check step that skips every remaining step once the date passes 2026-09-11 (doesn't consume Actions minutes and doesn't write to the database) — no need to manually delete or disable this workflow afterward
- Secrets: `SUPABASE_URL` and `SUPABASE_KEY` (service role) are already set as GitHub Actions secrets on the repo; they don't appear in code or this document
- To trigger a run immediately instead of waiting for Monday, go to the [Actions page](https://github.com/wenyuiwu-lgtm/sweden-election-2026/actions/workflows/update-polls.yml) and click **Run workflow**

## Conventions

- Site interface: English
- Documentation and code comments (README / ARCHITECTURE / inline comments): English
- Database: a separate Supabase project from fika-app / svenska-app — don't share keys or mix them into the same `.env`
