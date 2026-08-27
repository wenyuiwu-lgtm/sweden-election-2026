"use client";

import { useEffect, useState } from "react";
import {
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

const PARTY_COLORS: Record<PartyCode, string> = {
  S: "#E8112D",
  SD: "#DDDD00",
  M: "#52BDEC",
  V: "#DA291C",
  C: "#009933",
  KD: "#000077",
  MP: "#83CF39",
  L: "#006AB3",
  OTH: "#94A3B8",
};

const PARTY_ORDER: PartyCode[] = ["S", "V", "MP", "C", "L", "KD", "M", "SD", "OTH"];

export default function Home() {
  const [latest, setLatest] = useState<PollOfPollsOutput | null>(null);
  const [trends, setTrends] = useState<PartyTrend[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetch("/api/v1/polls/latest")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(setLatest)
      .catch(() => setLoadFailed(true));
    fetch("/api/v1/polls/trends")
      .then((res) => res.json())
      .then(setTrends);
  }, []);

  if (loadFailed) {
    return (
      <main className="flex-1 flex items-center justify-center text-slate-400">
        No poll data available yet.
      </main>
    );
  }

  if (!latest) {
    return (
      <main className="flex-1 flex items-center justify-center text-slate-400">
        Loading…
      </main>
    );
  }

  const { red_green_bloc, tido_bloc } = latest.bloc_summary;

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">2026 Swedish Election — Poll of Polls</h1>
        <p className="text-sm text-slate-500 mt-1">
          {latest.total_polls_included} polls · last {latest.date_range_days} days ·
          updated {new Date(latest.updated_at).toLocaleString("en-GB")}
        </p>
      </header>

      {/* Bloc seat cards */}
      <section className="grid grid-cols-2 gap-4">
        <BlocCard label="Red-Green Bloc" seats={red_green_bloc.projected_seats} support={red_green_bloc.combined_support} color="#E8112D" />
        <BlocCard label="Tidö Parties" seats={tido_bloc.projected_seats} support={tido_bloc.combined_support} color="#52BDEC" />
      </section>

      {/* Seat allocation bar */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold mb-4">Riksdag Seat Projection ({TOTAL_SEATS} seats total, {MAJORITY} for a majority)</h2>
        <SeatBar latest={latest} />
        <Legend />
      </section>

      {/* Party support table */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h2 className="font-semibold p-5 pb-0">Party Support</h2>
        <table className="w-full text-sm mt-3">
          <thead className="text-slate-500 text-xs uppercase border-b border-slate-100">
            <tr>
              <th className="text-left px-5 py-2">Party</th>
              <th className="text-right px-5 py-2">Support</th>
              <th className="text-right px-5 py-2">Margin</th>
              <th className="text-right px-5 py-2">Seats</th>
              <th className="text-right px-5 py-2">P(&gt;4%)</th>
            </tr>
          </thead>
          <tbody>
            {PARTY_ORDER.filter((p) => p !== "OTH").map((code) => {
              const p = latest.parties[code];
              return (
                <tr key={code} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2 flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: PARTY_COLORS[code] }}
                    />
                    {code} <span className="text-slate-400">{p.name}</span>
                  </td>
                  <td className="text-right px-5 py-2 font-medium">{p.weighted_support.toFixed(1)}%</td>
                  <td className="text-right px-5 py-2 text-slate-500">±{p.margin_of_error.toFixed(1)}</td>
                  <td className="text-right px-5 py-2">{p.projected_seats}</td>
                  <td className={`text-right px-5 py-2 ${p.threshold_passed ? "text-emerald-600" : "text-amber-600"}`}>
                    {p.pass_probability.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Support trend chart */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold mb-4">Support Trend</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart>
              <XAxis dataKey="date" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip />
              {trends.map((t) => (
                <Line
                  key={t.party}
                  data={t.points}
                  dataKey="support"
                  name={t.party}
                  stroke={PARTY_COLORS[t.party]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}

function BlocCard({ label, seats, support, color }: { label: string; seats: number; support: number; color: string }) {
  const majority = seats >= MAJORITY;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold">{seats}</span>
        <span className="text-slate-400 text-sm">seats · {support.toFixed(1)}%</span>
      </div>
      <div className={`text-xs mt-1 ${majority ? "text-emerald-600" : "text-slate-400"}`}>
        {majority ? "Majority" : `${MAJORITY - seats} seats short of majority`}
      </div>
    </div>
  );
}

function SeatBar({ latest }: { latest: PollOfPollsOutput }) {
  return (
    <div className="flex w-full h-6 rounded-full overflow-hidden">
      {PARTY_ORDER.filter((p) => p !== "OTH" && latest.parties[p].projected_seats > 0).map((code) => {
        const seats = latest.parties[code].projected_seats;
        return (
          <div
            key={code}
            style={{ width: `${(seats / TOTAL_SEATS) * 100}%`, backgroundColor: PARTY_COLORS[code] }}
            title={`${code}: ${seats} seats`}
          />
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-500">
      {PARTY_ORDER.filter((p) => p !== "OTH").map((code) => (
        <span key={code} className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: PARTY_COLORS[code] }} />
          {code}
        </span>
      ))}
    </div>
  );
}
