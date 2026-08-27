# System Architecture — 2026 Swedish Election Poll of Polls

> Source: Google Doc "2026 Swedish General Election — System Architecture Plan"
> https://docs.google.com/document/d/1HfLm4MQ21yE6VfEISGLcVOFsL7pOt4ThCQDRSApaSJU/edit
> This file is the implementation write-up of that document, kept as the reference during development. Update this file if the source doc changes.

## System layers

```
[ Data Layer ]
  └── Scraper / scheduled script (Python / GitHub Actions)
        ↓
[ Processing & DB ]
  ├── PostgreSQL / Supabase (data storage)
  └── Pipeline module (exponential-decay weighting + Sainte-Laguë seat allocation)
        ↓
[ Presentation Layer ]
  └── Next.js / React + Tailwind CSS + Recharts (dashboard and charts, served via Next.js API routes)
```

## Poll of Polls methodology

Doesn't rely on any single poll — uses a multi-factor dynamic weighting model.

**Data filter**: only institutes with a historical mean absolute error under ~1.1% and a disclosed sample size over 1,000 respondents — SCB, Demoskop, Novus, Ipsos, **plus Verian and Indikator**, added once the scraper showed they're the two most active pollsters on Wikipedia this cycle (not in the original plan — see README "Deviations from the original plan"). Quick, non-representative online polls are excluded.

**Three weighting factors**:

| Factor | Description |
|---|---|
| Time-decay weight | Exponential decay; half-life depends on publishing frequency: 14 days for most institutes, **90 days for SCB** since it only publishes twice a year (otherwise a 3-month-old SCB poll would decay to ~1% weight — effectively wasted). The data window was widened from 45 to 180 days for the same reason, so a twice-yearly SCB poll can be reached at all |
| Institution-reliability weight | Differentiated by historical accuracy (SCB highest, then Demoskop/Novus/Verian, then Ipsos, then Indikator) |
| Sample-size weight | Square-root (sub-linear) scaling, so one very large sample can't dominate the result |

**Per-institute cap**: within the window, each institute is capped at its 3 most recent polls (`MAX_POLLS_PER_INSTITUTION`), so a high-frequency institute can't gain outsized total weight purely by publishing more often. Measured effect is small (the 14-day half-life already fades anything past 2-3 publishing cycles to near-nothing) — it mainly guards against an institute publishing unusually often in a short window.

Seats are allocated with the **Sainte-Laguë method**, 4% threshold, 349-seat Riksdag.

## Database (Supabase / PostgreSQL)

Two core tables — see [`db/schema.sql`](../db/schema.sql):

- **raw_polls**: raw poll records (audit/trend history), deduplicated on `poll_id`
- **poll_of_polls_history**: one weighted-result snapshot per pipeline run (party support, seats, threshold probability, bloc summary)

## Backend pipeline (Python)

Built on `backend/election.py`. Flow:

1. `backend/scrape_wikipedia.py` scrapes the English Wikipedia article "[Opinion polling for the 2026 Swedish general election](https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Swedish_general_election)" → writes to `raw_polls` (`upsert` + dedup on `poll_id`)
2. Reads qualifying `raw_polls` rows from within the recency window (180 days; see methodology above)
3. Runs the three-factor weighting calculation + Sainte-Laguë seat allocation
4. Writes the result to `poll_of_polls_history`

The scraper reads the polling table under that article's "2026" section heading (19 columns: institute, fieldwork period, sample size, the 8 parties' support, other, several "lead" columns, and the two blocs' support/seats), currently parsing 32 polls from 2026. Wikipedia has no separate "publication date" column, so `publication_date` uses the fieldwork period's end date instead.

## API endpoints (Next.js API Routes)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/polls/latest` | Latest weighted result + bloc seat projections |
| GET | `/api/v1/polls/trends` | Per-party support over time, sourced from individual `raw_polls` rows |

## Frontend dashboard (Next.js + Tailwind + Recharts)

- **Bloc comparison cards**: Red-Green vs. Tidö projected seats and combined support, with a majority indicator
- **Seat allocation bar**: 349-seat Riksdag bar with a majority-threshold marker
- **Party support table**: all 8 parties' support, margin of error, seats, and probability of clearing 4%, sorted by support
- **Support trend chart**: individual poll results by party over time
- **Election countdown**: live days/hours/minutes until election day
- **Why a Poll of Polls / Methodology**: an explainer plus a collapsible section covering the full weighting model, written for a general audience

## Bloc definitions (from the original script)

- Red-Green bloc (`red_green_bloc`): S, V, MP, C
- Tidö bloc (`tido_bloc`): M, SD, KD, L
- Everyone else: OTH (not included in seat allocation)

## Development stages

1. **M1** (done): project folders, docs, DB schema, and Python pipeline in place; frontend project initialized
2. **M2** (done): real Supabase project created, schema applied, scraper wired to Wikipedia, full pipeline run manually with real data written
3. **M3** (done): backend API endpoints (Next.js API Routes reading `poll_of_polls_history` and `raw_polls`)
4. **M4** (done): frontend dashboard wired to the real API, showing seat cards + party table + trend chart, English UI
5. **M5** (done): scheduled automation (GitHub Actions running `scrape_wikipedia.py` on a schedule, using a service role key)
6. **M6** (next): AI-generated election-insight summaries
