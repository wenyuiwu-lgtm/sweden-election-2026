"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Countdown } from "@/components/Countdown";
import { Disclosure } from "@/components/Disclosure";
import { MAX_POLLS_PER_INSTITUTION } from "@/lib/constants";
import { PartyCode, PartyTrend, PollOfPollsOutput, PollsterGroup } from "@/lib/types";

function formatFieldwork(start: string, end: string): string {
  const format = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const startStr = format(start);
  const endStr = format(end);
  return startStr === endStr ? startStr : `${startStr} – ${endStr}`;
}

const TOTAL_SEATS = 349;
const MAJORITY = 175;
const ELECTION_DAY = new Date("2026-09-11T00:00:00Z");

// Matches .github/workflows/update-polls.yml: runs every Monday 06:00 UTC,
// and stops entirely once the date passes this cutoff.
const LAST_SCHEDULED_UPDATE_DATE = "2026-09-11";

function formatNextUpdate(now: Date): string | null {
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysUntilMonday = (1 - day + 7) % 7;
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, 6, 0, 0)
  );
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }
  if (candidate.toISOString().slice(0, 10) > LAST_SCHEDULED_UPDATE_DATE) {
    return null;
  }
  return (
    candidate.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC"
  );
}

const PARTY_COLORS: Record<PartyCode, string> = {
  S: "#E8112D",
  SD: "#C9A400",
  M: "#52BDEC",
  V: "#7A1220",
  C: "#009933",
  KD: "#1F2E7A",
  MP: "#6FB52C",
  L: "#006AB3",
  OTH: "#9a9689",
};

// Left-to-right on the seat bar, roughly matching the Riksdag's political spectrum.
const SPECTRUM_ORDER: PartyCode[] = ["V", "MP", "S", "C", "L", "KD", "M", "SD"];
const TABLE_PARTIES: PartyCode[] = ["S", "SD", "M", "V", "C", "KD", "MP", "L"];

// Actual seats from the 2022 general election, i.e. the Riksdag sitting today —
// a fixed baseline to compare the current poll-based projection against.
const CURRENT_ELECTION_YEAR = 2022;
const CURRENT_SEATS: Record<PartyCode, number> = {
  S: 107,
  SD: 73,
  M: 68,
  V: 24,
  C: 24,
  KD: 19,
  MP: 18,
  L: 16,
  OTH: 0,
};

// Actual vote share from the 2022 general election (Valmyndigheten's final count).
const CURRENT_SUPPORT: Record<PartyCode, number> = {
  S: 30.33,
  SD: 20.54,
  M: 19.10,
  V: 6.75,
  C: 6.71,
  KD: 5.34,
  MP: 5.08,
  L: 4.61,
  OTH: 1.54,
};

export default function Home() {
  const [latest, setLatest] = useState<PollOfPollsOutput | null>(null);
  const [trends, setTrends] = useState<PartyTrend[]>([]);
  const [rawPolls, setRawPolls] = useState<PollsterGroup[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [nextUpdate, setNextUpdate] = useState<string | null>(null);
  const [pollsterFilter, setPollsterFilter] = useState<string>("all");
  const [tableView, setTableView] = useState<"current" | "2022" | "compare">("current");
  const [showConversionInfo, setShowConversionInfo] = useState(false);

  useEffect(() => {
    fetch("/api/v1/polls/latest")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(setLatest)
      .catch(() => setLoadFailed(true));
    fetch("/api/v1/polls/trends")
      .then((res) => res.json())
      .then(setTrends);
    fetch("/api/v1/polls/raw")
      .then((res) => res.json())
      .then(setRawPolls);

    // Reads the wall clock once at mount — a display-only value, not derived
    // from props/state, so there's nothing to keep in sync afterwards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNextUpdate(formatNextUpdate(new Date()));
  }, []);

  if (loadFailed) {
    return (
      <main className="flex-1 flex items-center justify-center text-ink-faint">
        No poll data available yet.
      </main>
    );
  }

  if (!latest) {
    return (
      <main className="flex-1 flex items-center justify-center text-ink-faint">
        Loading…
      </main>
    );
  }

  const { red_green_bloc, tido_bloc } = latest.bloc_summary;
  const currentRedGreenSeats = red_green_bloc.parties.reduce((sum, p) => sum + CURRENT_SEATS[p], 0);
  const currentTidoSeats = tido_bloc.parties.reduce((sum, p) => sum + CURRENT_SEATS[p], 0);
  const displaySupport = (code: PartyCode) =>
    tableView === "2022" ? CURRENT_SUPPORT[code] : latest.parties[code].weighted_support;
  const displaySeats = (code: PartyCode) =>
    tableView === "2022" ? CURRENT_SEATS[code] : latest.parties[code].projected_seats;
  const sortedTable = [...TABLE_PARTIES].sort((a, b) => displaySupport(b) - displaySupport(a));
  const topSupport = Math.max(...TABLE_PARTIES.map((p) => displaySupport(p)));
  const conversionRate = (seats: number, support: number) =>
    support > 0 ? seats / TOTAL_SEATS / (support / 100) : 0;

  return (
    <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-10 space-y-10">
      {/* Hero */}
      <section className="space-y-4">
        <div className="space-y-2">
          <h1 className="font-serif-display text-3xl sm:text-4xl font-semibold tracking-tight">
            Sweden 2026 — Poll of Polls
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
            <span>{latest.total_polls_included} polls, last 45 days</span>
            <span className="text-border-strong">·</span>
            <span>Updated {new Date(latest.updated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
            {nextUpdate && (
              <>
                <span className="text-border-strong">·</span>
                <span>Next update: {nextUpdate}</span>
              </>
            )}
          </div>
        </div>
        <Countdown />
      </section>

      {/* Why a Poll of Polls */}
      <section className="rounded-2xl border border-border bg-bg-elevated p-5 card-shadow space-y-3">
        <h2 className="font-serif-display text-lg font-semibold">Why a Poll of Polls?</h2>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Any single poll carries a margin of error and can reflect one pollster&rsquo;s particular
          methodology, or simply the mood of the specific week it was fielded. A Poll of Polls combines
          results from several independent institutes into one weighted estimate, which smooths out
          one-off swings and house effects that would otherwise look like real movement in public opinion.
        </p>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          This is not a forecast of the election outcome — it is a snapshot of where public opinion stood
          over the last 45 days<sup>*</sup>, recalculated every time new polls are published.
        </p>
        <p className="text-[11px] leading-relaxed text-ink-faint">
          * Except SCB, which only publishes about twice a year and is given a longer window so it
          isn&rsquo;t excluded entirely — see Methodology below for the full explanation.
        </p>
      </section>

      {/* Methodology */}
      <Disclosure title="Methodology: sources, sample, and weighting">
        <div>
          <h3 className="font-semibold text-ink mb-1">Data sources</h3>
          <p>
            Polls are collected from six Swedish institutes: SCB, Novus, Demoskop, Ipsos, Verian, and
            Indikator. Only polls with a disclosed sample size over 1,000 respondents are included; polls
            without a verifiable sample size or methodology are excluded.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-ink mb-1">Per-institute cap</h3>
          <p>
            Within the window, only each institute&rsquo;s 3 most recent polls are eligible — older ones
            are dropped regardless of institution weight. Without this, an institute that simply publishes
            more often than the others would accumulate a bigger share of the total purely from showing up
            more times, not from being more informative. In practice this cap changes little day to day,
            because the time-decay above already fades anything past a couple of publishing cycles to
            near-nothing — it mainly exists as a safeguard against an institute publishing unusually often
            in a short window.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-ink mb-1">Time-decay weight</h3>
          <p>
            Each poll&rsquo;s influence decays exponentially: <code className="text-ink">exp(-ln(2) ×
            days_old / half_life)</code>. Most institutes use a 14-day half-life, so a poll fielded two
            weeks ago counts for half as much as one fielded today. SCB is the exception: it only
            publishes about twice a year, so it uses a 90-day half-life instead — otherwise a 14-day
            curve would fade a highly credible SCB poll to near-zero weight within a few months, rather
            than aging it fairly.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-ink mb-1">Institution weight</h3>
          <p>Institutes are weighted by real-world track record and methodology, not arbitrarily:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>
              <strong className="text-ink">SCB — 1.5.</strong> Sweden&rsquo;s national statistics office
              runs nationally stratified random sampling with government-level resources, making it the
              industry&rsquo;s accuracy benchmark. It also gets its own 90-day half-life (above) rather
              than a bigger static weight, since the thing that sets it apart from the others isn&rsquo;t
              just quality — it&rsquo;s that it only publishes twice a year.
            </li>
            <li>
              <strong className="text-ink">Demoskop — 1.2.</strong> Smallest deviation from the actual
              2022 result of the four institutes below — its final poll before that election missed the
              8 parties&rsquo; vote shares by 0.40 percentage points on average.
            </li>
            <li>
              <strong className="text-ink">Novus — 1.2.</strong> SVT&rsquo;s polling partner; runs very
              large samples with strict randomized-sampling controls. Averaged 0.73 points off in its
              final 2022 poll.
            </li>
            <li>
              <strong className="text-ink">Ipsos — 1.1.</strong> Internationally recognized research
              firm. Averaged 0.81 points off in its final 2022 poll.
            </li>
            <li>
              <strong className="text-ink">Verian — 1.1.</strong> Published as Kantar Sifo in 2022,
              since renamed; part of a large international research network with a long-established
              methodology in the Swedish market. Averaged 1.14 points off under its former name in
              2022 — the highest of the four we have a figure for, so it sits a tier below Demoskop
              and Novus rather than alongside them, in line with Ipsos.
            </li>
            <li>
              <strong className="text-ink">Indikator — 1.0.</strong> The baseline weight, and the
              newest of the tracked institutes — it wasn&rsquo;t polling this race in 2022, so there&rsquo;s
              no comparable track record yet to weight it up from the baseline.
            </li>
          </ul>
          <p className="mt-2 text-[12px] text-ink-faint">
            The four deviation figures above are our own calculation: each institute&rsquo;s final poll
            published immediately before the 11 September 2022 election, compared party-by-party against
            the official result, averaged across all 8 Riksdag parties. They&rsquo;re a rough guide from a
            single election, not an official industry ranking.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-ink mb-1">Sample-size weight</h3>
          <p>
            Weight scales with the square root of sample size, so one very large poll can&rsquo;t
            single-handedly dominate the average, while more reliable samples still count for more.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-ink mb-1">How the three weights combine</h3>
          <p>
            A poll&rsquo;s total weight is the <em>product</em> of all three factors above — it&rsquo;s
            easy to mistake the institution weight alone for a poll&rsquo;s overall influence, so here are
            two fixed worked examples with the actual formulas filled in (these are illustrations, not
            today&rsquo;s live numbers).
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>
              <strong className="text-ink">A recent poll from a biweekly institute:</strong> say Indikator
              publishes a poll 4 days before the calculation date with 4,296 respondents. Institution
              weight is only 1.0, but time-decay ≈ exp(-ln(2) × 4/14) ≈ 0.83 on its 14-day half-life, and
              sample weight ≈ √(4,296/1,000) ≈ 2.07, giving a total weight of 1.0 × 0.83 × 2.07 ≈{" "}
              <strong className="text-ink">1.7</strong> — higher than the institution weight alone would
              suggest.
            </li>
            <li>
              <strong className="text-ink">SCB, several months on:</strong> say SCB&rsquo;s poll is 91
              days old with 4,542 respondents. Institution weight is 1.5, and its own 90-day half-life
              gives time-decay ≈ exp(-ln(2) × 91/90) ≈ 0.50 — about half faded, versus the ~1% it would
              have left on the standard 14-day curve — with sample weight ≈ √(4,542/1,000) ≈ 2.13, for a
              total weight of 1.5 × 0.50 × 2.13 ≈ <strong className="text-ink">1.6</strong>. That lands in
              the same range as the much fresher Indikator poll above, despite being three months old —
              which is the whole point of giving SCB its own half-life instead of excluding it or letting
              it decay to nothing.
            </li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-ink mb-1">Seat allocation</h3>
          <p>
            The {TOTAL_SEATS} Riksdag seats are distributed with the Sainte-Laguë method — the same
            formula used in the real election — applied to every party clearing the 4% national threshold.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-ink mb-1">Margin of error</h3>
          <p>
            Shown per party as a 95% confidence interval, computed from the weighted support and an
            effective sample size of 1,500.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-ink mb-1">Update schedule</h3>
          <p>
            Refreshed automatically every Monday until election day via a scheduled job that re-scrapes
            the latest published polls. Full pipeline source is on{" "}
            <a
              href="https://github.com/wenyuiwu-lgtm/sweden-election-2026"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-border-strong underline-offset-2 hover:text-ink"
            >
              GitHub
            </a>
            .
          </p>
        </div>
      </Disclosure>

      {/* Outcome Prediction */}
      <section className="rounded-2xl border border-border bg-bg-elevated p-5 card-shadow">
        <h2 className="font-serif-display text-lg font-semibold mb-4">Outcome Prediction</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-0 sm:divide-x sm:divide-border">
          <BlocCard
            label="Red-Green Bloc"
            parties="S · V · MP · C"
            seats={red_green_bloc.projected_seats}
            support={red_green_bloc.combined_support}
            color={PARTY_COLORS.S}
          />
          <BlocCard
            label="Tidö Parties"
            parties="M · SD · KD · L"
            seats={tido_bloc.projected_seats}
            support={tido_bloc.combined_support}
            color={PARTY_COLORS.M}
            className="sm:pl-6"
          />
        </div>
        <div className="mt-5 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px]">
          <span className="text-ink-faint">Current Riksdag ({CURRENT_ELECTION_YEAR} election)</span>
          <span className="text-ink-muted">
            Tidö parties <strong className="text-ink font-semibold">{currentTidoSeats}</strong> · Red-Green{" "}
            <strong className="text-ink font-semibold">{currentRedGreenSeats}</strong>
          </span>
        </div>
      </section>

      {/* Seat allocation */}
      <section className="rounded-2xl border border-border bg-bg-elevated p-5 card-shadow">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif-display text-lg font-semibold">Riksdag Seat Projection</h2>
          <span className="text-[12px] text-ink-faint">{TOTAL_SEATS} seats · {MAJORITY} for a majority</span>
        </div>
        <SeatDonut latest={latest} />
        <div className="mt-6">
          <SeatBar latest={latest} />
          <Legend2 />
        </div>
      </section>

      {/* Party leaderboard */}
      <section className="rounded-2xl border border-border bg-bg-elevated overflow-hidden card-shadow">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
          <h2 className="font-serif-display text-lg font-semibold">Party Support</h2>
          <div className="segmented-track">
            {(["current", "2022", "compare"] as const).map((view) => (
              <button
                key={view}
                onClick={() => setTableView(view)}
                data-active={tableView === view}
                className="segmented-option"
              >
                {view === "current" ? "Current" : view === "2022" ? `${CURRENT_ELECTION_YEAR}` : "Compare"}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-ink-faint text-[11px] uppercase tracking-wide border-y border-border">
              <th className="text-left px-5 py-2 font-medium">Party</th>
              <th className="text-right px-5 py-2 font-medium">Support</th>
              <th className="text-right px-5 py-2 font-medium hidden sm:table-cell">
                <span className="inline-flex items-center gap-1 justify-end">
                  Conversion
                  <button
                    onClick={() => setShowConversionInfo(true)}
                    aria-label="What is vote-to-seat conversion rate?"
                    className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-ink-faint text-[9px] normal-case leading-none text-ink-faint hover:border-ink hover:text-ink"
                  >
                    i
                  </button>
                </span>
              </th>
              <th className="text-right px-5 py-2 font-medium">Seats</th>
              <th className="text-right px-5 py-2 font-medium">{tableView === "2022" ? "Passed 4%" : "P(>4%)"}</th>
            </tr>
          </thead>
          <tbody>
            {sortedTable.map((code) => {
              const p = latest.parties[code];
              const support = displaySupport(code);
              const seats = displaySeats(code);
              const support2022 = CURRENT_SUPPORT[code];
              const seats2022 = CURRENT_SEATS[code];
              const passed2022 = support2022 >= 4.0 && code !== "OTH";
              const passed = tableView === "2022" ? passed2022 : p.threshold_passed;
              const conversion = conversionRate(seats, support);
              const conversion2022 = conversionRate(seats2022, support2022);
              const compare = tableView === "compare";
              return (
                <tr key={code} className="border-b border-border last:border-0 hover:bg-bg-sunken/60 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PARTY_COLORS[code] }} />
                      <span className="font-semibold w-7">{code}</span>
                      <span className="text-ink-faint hidden md:inline">{p.name}</span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-bg-sunken overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(support / topSupport) * 100}%`, backgroundColor: PARTY_COLORS[code] }}
                      />
                    </div>
                  </td>
                  <td className="text-right px-5 py-3 font-semibold tabular-nums">
                    {support.toFixed(1)}%
                    {compare && (
                      <div className="mt-1">
                        <span className="inline-flex items-center rounded-full bg-bg-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
                          &rsquo;22 · {support2022.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="text-right px-5 py-3 text-ink-faint tabular-nums hidden sm:table-cell">
                    {conversion.toFixed(2)}×
                    {compare && <div className="mt-1 text-[10px] font-normal text-ink-faint">{conversion2022.toFixed(2)}×</div>}
                  </td>
                  <td className="text-right px-5 py-3 tabular-nums">
                    {seats}
                    {compare && <div className="mt-1 text-[10px] font-normal text-ink-faint">{seats2022}</div>}
                  </td>
                  <td className="text-right px-5 py-3">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
                      style={
                        passed
                          ? { backgroundColor: "color-mix(in srgb, var(--positive) 15%, transparent)", color: "var(--positive)" }
                          : { backgroundColor: "color-mix(in srgb, var(--negative) 15%, transparent)", color: "var(--negative)" }
                      }
                    >
                      {tableView === "2022" ? (passed ? "Yes" : "No") : `${p.pass_probability.toFixed(0)}%`}
                    </span>
                    {compare && (
                      <div className="mt-1 text-[10px] font-normal text-ink-faint">{passed2022 ? "Yes" : "No"}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {tableView === "2022" && (
          <p className="px-5 py-3 text-[11px] text-ink-faint border-t border-border">
            Final counted result of the {CURRENT_ELECTION_YEAR} Swedish general election, for comparison — not a poll or projection.
          </p>
        )}
        {tableView === "compare" && (
          <p className="px-5 py-3 text-[11px] text-ink-faint border-t border-border">
            Bold figures are the current weighted projection; the smaller line below each is the actual {CURRENT_ELECTION_YEAR} result.
          </p>
        )}
      </section>

      {showConversionInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowConversionInfo(false)}
        >
          <div
            className="max-w-sm rounded-2xl border border-border bg-bg-elevated p-5 card-shadow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3 className="font-serif-display text-base font-semibold">Vote-to-seat conversion rate</h3>
              <button
                onClick={() => setShowConversionInfo(false)}
                aria-label="Close"
                className="shrink-0 text-ink-faint hover:text-ink"
              >
                ✕
              </button>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-muted mb-3">
              How efficiently a party&rsquo;s vote share turns into seats, relative to a perfectly
              proportional result. Above 1× means the party wins a bigger seat share than its vote
              share — common for larger parties, since Sweden&rsquo;s 4% threshold and seat-rounding
              favor them. Below 1× means the opposite. A party that misses the 4% threshold converts
              at 0×, no matter how close it came.
            </p>
            <div className="rounded-md bg-bg-sunken px-3 py-2 font-mono text-[12px] text-ink">
              rate = (seats ÷ {TOTAL_SEATS}) ÷ (vote share ÷ 100)
            </div>
          </div>
        </div>
      )}

      {/* Trend chart */}
      <section className="rounded-2xl border border-border bg-bg-elevated p-5 card-shadow">
        <h2 className="font-serif-display text-lg font-semibold mb-1">Support Trend</h2>
        <p className="text-[12px] text-ink-faint mb-3">
          {pollsterFilter === "all" ? (
            <>
              Each dot is one individual poll, as published by its institute — not connected into a line,
              since polls from different institutes aren&rsquo;t directly comparable (house effects can make
              jumps between institutes look like a trend when they aren&rsquo;t). Hover a dot to see which
              institute published it, or filter to one institute below to see its own trend line.
            </>
          ) : (
            <>
              Showing only {pollsterFilter}&rsquo;s own polls, connected as a trend line — comparable
              since they share one institute&rsquo;s methodology. These are raw numbers, not the weighted
              average shown in Party Support above.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {["all", ...rawPolls.map((g) => g.pollster)].map((option) => (
            <button
              key={option}
              onClick={() => setPollsterFilter(option)}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                pollsterFilter === option
                  ? "bg-accent text-white"
                  : "bg-bg-sunken text-ink-muted hover:text-ink"
              }`}
            >
              {option === "all" ? "All institutes" : option}
            </button>
          ))}
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                type="category"
                allowDuplicatedCategory={false}
                tick={{ fontSize: 11, fill: "var(--ink-faint)" }}
                tickFormatter={(d: string) => new Date(d).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--ink-faint)" }}
                unit="%"
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                formatter={(value: string) => <span style={{ color: "var(--ink-muted)" }}>{value}</span>}
              />
              {trends.map((t) => {
                const points =
                  pollsterFilter === "all" ? t.points : t.points.filter((p) => p.pollster === pollsterFilter);
                if (points.length === 0) return null;
                return (
                  <Line
                    key={t.party}
                    data={points}
                    dataKey="support"
                    name={t.party}
                    stroke={pollsterFilter === "all" ? "none" : PARTY_COLORS[t.party]}
                    strokeWidth={2}
                    dot={{ r: 3.5, fill: PARTY_COLORS[t.party], strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Raw poll data */}
      <Disclosure title="Individual poll data by institute">
        <p>
          The most recent {MAX_POLLS_PER_INSTITUTION} polls per institute that feed into the weighted
          model above — the same cap described in Methodology. SCB publishes only twice a year, so it
          currently shows just its one qualifying poll from late May.
        </p>
        <div className="space-y-5 mt-3">
          {rawPolls.map((group) => (
            <div key={group.pollster}>
              <h3 className="font-semibold text-ink mb-1.5">{group.pollster}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead>
                    <tr className="text-ink-faint uppercase tracking-wide border-b border-border">
                      <th className="text-left py-1 pr-3 font-medium">Fieldwork</th>
                      <th className="text-right py-1 px-2 font-medium">Sample</th>
                      {TABLE_PARTIES.map((p) => (
                        <th key={p} className="text-right py-1 px-2 font-medium">
                          {p}
                        </th>
                      ))}
                      <th className="text-right py-1 pl-2 font-medium">Oth.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.polls.map((poll) => (
                      <tr key={poll.publication_date} className="border-b border-border last:border-0">
                        <td className="py-1 pr-3 text-ink">{formatFieldwork(poll.start_date, poll.end_date)}</td>
                        <td className="text-right py-1 px-2 tabular-nums text-ink-muted">
                          {poll.sample_size.toLocaleString("en-GB")}
                        </td>
                        {TABLE_PARTIES.map((p) => (
                          <td key={p} className="text-right py-1 px-2 tabular-nums">
                            {poll.data[p] !== undefined ? poll.data[p]!.toFixed(1) : "—"}
                          </td>
                        ))}
                        <td className="text-right py-1 pl-2 tabular-nums text-ink-faint">
                          {poll.data.OTH !== undefined ? poll.data.OTH!.toFixed(1) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Disclosure>
    </main>
  );
}

function BlocCard({
  label,
  parties,
  seats,
  support,
  color,
  className = "",
}: {
  label: string;
  parties: string;
  seats: number;
  support: number;
  color: string;
  className?: string;
}) {
  const majority = seats >= MAJORITY;
  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] text-ink-muted">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </div>
        <span className="text-[11px] text-ink-faint">{parties}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-serif-display text-4xl font-semibold tabular-nums">{seats}</span>
        <span className="text-ink-faint text-[13px]">seats · {support.toFixed(1)}%</span>
      </div>
      <div className={`mt-1.5 text-[12px] font-medium ${majority ? "text-[var(--positive)]" : "text-ink-faint"}`}>
        {majority ? "Majority" : `${MAJORITY - seats} seats short of majority`}
      </div>
    </div>
  );
}

function SeatBar({ latest }: { latest: PollOfPollsOutput }) {
  const majorityPct = (MAJORITY / TOTAL_SEATS) * 100;
  return (
    <div className="relative pt-5">
      <span
        className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] text-ink-faint"
        style={{ left: `${majorityPct}%` }}
      >
        {MAJORITY} for majority
      </span>
      <div
        className="absolute top-5 bottom-0 w-px bg-ink/50"
        style={{ left: `${majorityPct}%` }}
      />
      <div className="flex w-full h-7 rounded-md overflow-hidden">
        {SPECTRUM_ORDER.filter((p) => latest.parties[p].projected_seats > 0).map((code) => {
          const seats = latest.parties[code].projected_seats;
          return (
            <div
              key={code}
              className="flex items-center justify-center text-[10px] font-semibold text-white/90 first:rounded-l-md last:rounded-r-md"
              style={{ width: `${(seats / TOTAL_SEATS) * 100}%`, backgroundColor: PARTY_COLORS[code] }}
              title={`${code}: ${seats} seats`}
            >
              {seats / TOTAL_SEATS > 0.045 ? code : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend2() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-muted">
      {SPECTRUM_ORDER.map((code) => (
        <span key={code} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PARTY_COLORS[code] }} />
          {code}
        </span>
      ))}
    </div>
  );
}

function SeatDonut({ latest }: { latest: PollOfPollsOutput }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      // One-time animation-start flag for the mount-in draw effect below —
      // not derived from props/state, so there's nothing to keep in sync.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDrawn(true);
    }, 20);
    return () => clearTimeout(timer);
  }, []);

  const R = 95;
  const STROKE = 26;
  const CX = 130;
  const CY = 130;
  const GAP_PX = 3;
  const FULL_CIRC = 2 * Math.PI * R;
  const HALF_CIRC = FULL_CIRC / 2;

  const [active, setActive] = useState<PartyCode | null>(null);

  const parties = SPECTRUM_ORDER.filter((code) => latest.parties[code].projected_seats > 0);
  let cumulative = 0;
  const segments = parties.map((code) => {
    const seats = latest.parties[code].projected_seats;
    const rawLen = (seats / TOTAL_SEATS) * HALF_CIRC;
    const arcLen = Math.max(rawLen - GAP_PX, 0);
    const offset = cumulative;
    cumulative += rawLen;
    return { code, seats, arcLen, offset };
  });

  const activeParty = active ? latest.parties[active] : null;

  return (
    <div className="relative mt-6 flex justify-center">
      <svg
        viewBox={`0 0 ${CX * 2} ${CY + 6}`}
        className="w-full max-w-md"
        role="img"
        aria-label="Half-donut chart of projected Riksdag seats by party"
        onMouseLeave={() => setActive(null)}
      >
        {segments.map((seg) => (
          <circle
            key={seg.code}
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={PARTY_COLORS[seg.code]}
            strokeWidth={STROKE}
            transform={`rotate(180 ${CX} ${CY})`}
            className="cursor-pointer"
            onMouseEnter={() => setActive(seg.code)}
            onClick={() => setActive((prev) => (prev === seg.code ? null : seg.code))}
            style={{
              strokeDasharray: `${seg.arcLen} ${FULL_CIRC - seg.arcLen}`,
              strokeDashoffset: drawn ? -seg.offset : -seg.offset - seg.arcLen,
              opacity: active && active !== seg.code ? 0.35 : 1,
              transition: "stroke-dashoffset 900ms cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease",
            }}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center">
        {activeParty ? (
          <>
            <span className="font-serif-display text-lg font-semibold text-ink leading-tight">{activeParty.name}</span>
            <span className="text-[12px] text-ink-muted mt-0.5">
              {activeParty.weighted_support.toFixed(1)}% · {activeParty.projected_seats} seats
            </span>
          </>
        ) : (
          <>
            <span className="font-serif-display text-2xl font-semibold text-ink">{TOTAL_SEATS}</span>
            <span className="text-[11px] text-ink-faint">total seats</span>
          </>
        )}
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { color: string; name: string; value: number; payload?: { pollster?: string } }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-[12px] card-shadow">
      <div className="text-ink-faint mb-1">{label ? new Date(label).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}
            {entry.payload?.pollster ? (
              <span className="text-ink-faint">· {entry.payload.pollster}</span>
            ) : null}
          </span>
          <span className="font-medium tabular-nums text-ink">{entry.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}
