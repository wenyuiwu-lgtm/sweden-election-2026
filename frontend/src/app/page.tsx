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
import { PartyCode, PartyTrend, PollOfPollsOutput } from "@/lib/types";

const TOTAL_SEATS = 349;
const MAJORITY = 175;
const ELECTION_DAY = new Date("2026-09-11T00:00:00Z");

const PARTY_COLORS: Record<PartyCode, string> = {
  S: "#E8112D",
  SD: "#C9A400",
  M: "#52BDEC",
  V: "#DA291C",
  C: "#009933",
  KD: "#1F2E7A",
  MP: "#6FB52C",
  L: "#006AB3",
  OTH: "#9a9689",
};

// Left-to-right on the seat bar, roughly matching the Riksdag's political spectrum.
const SPECTRUM_ORDER: PartyCode[] = ["V", "S", "MP", "C", "L", "KD", "M", "SD"];
const TABLE_PARTIES: PartyCode[] = ["S", "SD", "M", "V", "C", "KD", "MP", "L"];

export default function Home() {
  const [latest, setLatest] = useState<PollOfPollsOutput | null>(null);
  const [trends, setTrends] = useState<PartyTrend[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [daysToElection, setDaysToElection] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/v1/polls/latest")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(setLatest)
      .catch(() => setLoadFailed(true));
    fetch("/api/v1/polls/trends")
      .then((res) => res.json())
      .then(setTrends);

    // Reads the wall clock once at mount — a display-only value, not derived
    // from props/state, so there's nothing to keep in sync afterwards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDaysToElection(Math.max(0, Math.ceil((ELECTION_DAY.getTime() - Date.now()) / 86_400_000)));
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
  const sortedTable = [...TABLE_PARTIES].sort(
    (a, b) => latest.parties[b].weighted_support - latest.parties[a].weighted_support
  );
  const topSupport = Math.max(...TABLE_PARTIES.map((p) => latest.parties[p].weighted_support));

  return (
    <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-10 space-y-10">
      {/* Hero */}
      <section className="space-y-2">
        <h1 className="font-serif-display text-3xl sm:text-4xl font-semibold tracking-tight">
          Sweden 2026 — Poll of Polls
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
          <span>{latest.total_polls_included} polls, last {latest.date_range_days} days</span>
          <span className="text-border-strong">·</span>
          <span>Updated {new Date(latest.updated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
          <span className="text-border-strong">·</span>
          <span className="text-gold font-medium">{daysToElection ?? 0} days to election day</span>
        </div>
      </section>

      {/* Bloc comparison */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <BlocCard label="Red-Green Bloc" parties="S · V · MP · C" seats={red_green_bloc.projected_seats} support={red_green_bloc.combined_support} color={PARTY_COLORS.S} />
        <BlocCard label="Tidö Parties" parties="M · SD · KD · L" seats={tido_bloc.projected_seats} support={tido_bloc.combined_support} color={PARTY_COLORS.M} />
      </section>

      {/* Seat allocation */}
      <section className="rounded-lg border border-border bg-bg-elevated p-5 card-shadow">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif-display text-lg font-semibold">Riksdag Seat Projection</h2>
          <span className="text-[12px] text-ink-faint">{TOTAL_SEATS} seats · {MAJORITY} for a majority</span>
        </div>
        <SeatBar latest={latest} />
        <Legend2 />
      </section>

      {/* Party leaderboard */}
      <section className="rounded-lg border border-border bg-bg-elevated overflow-hidden card-shadow">
        <h2 className="font-serif-display text-lg font-semibold p-5 pb-3">Party Support</h2>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-ink-faint text-[11px] uppercase tracking-wide border-y border-border">
              <th className="text-left px-5 py-2 font-medium">Party</th>
              <th className="text-right px-5 py-2 font-medium">Support</th>
              <th className="text-right px-5 py-2 font-medium hidden sm:table-cell">Margin</th>
              <th className="text-right px-5 py-2 font-medium">Seats</th>
              <th className="text-right px-5 py-2 font-medium">P(&gt;4%)</th>
            </tr>
          </thead>
          <tbody>
            {sortedTable.map((code) => {
              const p = latest.parties[code];
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
                        style={{ width: `${(p.weighted_support / topSupport) * 100}%`, backgroundColor: PARTY_COLORS[code] }}
                      />
                    </div>
                  </td>
                  <td className="text-right px-5 py-3 font-semibold tabular-nums">{p.weighted_support.toFixed(1)}%</td>
                  <td className="text-right px-5 py-3 text-ink-faint tabular-nums hidden sm:table-cell">±{p.margin_of_error.toFixed(1)}</td>
                  <td className="text-right px-5 py-3 tabular-nums">{p.projected_seats}</td>
                  <td className="text-right px-5 py-3">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
                      style={
                        p.threshold_passed
                          ? { backgroundColor: "color-mix(in srgb, var(--positive) 15%, transparent)", color: "var(--positive)" }
                          : { backgroundColor: "color-mix(in srgb, var(--negative) 15%, transparent)", color: "var(--negative)" }
                      }
                    >
                      {p.pass_probability.toFixed(0)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Trend chart */}
      <section className="rounded-lg border border-border bg-bg-elevated p-5 card-shadow">
        <h2 className="font-serif-display text-lg font-semibold mb-1">Support Trend</h2>
        <p className="text-[12px] text-ink-faint mb-4">Individual poll results by party, {ELECTION_DAY.getFullYear()}</p>
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
              {trends.map((t) => (
                <Line
                  key={t.party}
                  data={t.points}
                  dataKey="support"
                  name={t.party}
                  stroke={PARTY_COLORS[t.party]}
                  dot={false}
                  strokeWidth={2}
                  activeDot={{ r: 3.5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}

function BlocCard({ label, parties, seats, support, color }: { label: string; parties: string; seats: number; support: number; color: string }) {
  const majority = seats >= MAJORITY;
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-5 card-shadow">
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
    <div className="relative pt-1 pb-5">
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
      <div
        className="absolute top-0 bottom-3 w-px bg-ink"
        style={{ left: `${majorityPct}%` }}
      >
        <span className="absolute -top-1 left-1.5 whitespace-nowrap text-[10px] text-ink-faint">175 for majority</span>
      </div>
    </div>
  );
}

function Legend2() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-muted">
      {SPECTRUM_ORDER.map((code) => (
        <span key={code} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PARTY_COLORS[code] }} />
          {code}
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-[12px] card-shadow">
      <div className="text-ink-faint mb-1">{label ? new Date(label).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}
          </span>
          <span className="font-medium tabular-nums text-ink">{entry.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}
