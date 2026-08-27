"use client";

import { useSyncExternalStore } from "react";

const ELECTION_DAY = new Date("2026-09-11T00:00:00Z").getTime();
const TICK_MS = 30_000;

// useSyncExternalStore requires getSnapshot to return the same value between
// store notifications — Date.now() returns a new value on every call, which
// would make React think the store changes on every render and loop forever.
// Caching the reading and only refreshing it when the interval actually
// fires keeps the snapshot stable in between.
let cachedNow = Date.now();

function subscribe(callback: () => void) {
  const id = setInterval(() => {
    cachedNow = Date.now();
    callback();
  }, TICK_MS);
  return () => clearInterval(id);
}

function getSnapshot() {
  return cachedNow;
}

function getServerSnapshot() {
  return null;
}

export function Countdown() {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-5 card-shadow flex items-center justify-between flex-wrap gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-0.5">Election Day</div>
        <div className="font-serif-display text-base font-semibold">11 September 2026</div>
      </div>
      {now === null ? (
        <div className="h-11 w-40 rounded bg-bg-sunken animate-pulse" />
      ) : (
        <CountdownReadout msRemaining={ELECTION_DAY - now} />
      )}
    </div>
  );
}

function CountdownReadout({ msRemaining }: { msRemaining: number }) {
  if (msRemaining <= 0) {
    return <div className="font-serif-display text-xl font-semibold text-gold">Voting is underway</div>;
  }

  const days = Math.floor(msRemaining / 86_400_000);
  const hours = Math.floor((msRemaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((msRemaining % 3_600_000) / 60_000);

  return (
    <div className="flex items-end gap-3">
      <CountdownUnit value={days} label="Days" />
      <span className="font-serif-display text-2xl text-border-strong pb-3 select-none">:</span>
      <CountdownUnit value={hours} label="Hours" />
      <span className="font-serif-display text-2xl text-border-strong pb-3 select-none">:</span>
      <CountdownUnit value={minutes} label="Min" />
    </div>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center w-11">
      <div className="font-serif-display text-3xl font-semibold tabular-nums text-gold leading-none">
        {value.toString().padStart(2, "0")}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-ink-faint mt-1">{label}</div>
    </div>
  );
}
