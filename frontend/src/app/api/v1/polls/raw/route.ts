import { NextResponse } from "next/server";
import { MAX_POLLS_PER_INSTITUTION } from "@/lib/constants";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("raw_polls")
    .select("pollster, start_date, end_date, publication_date, sample_size, data")
    .order("publication_date", { ascending: false });

  if (error || !data) {
    return NextResponse.json([]);
  }

  const byPollster = new Map<string, typeof data>();
  for (const row of data) {
    const existing = byPollster.get(row.pollster) ?? [];
    if (existing.length < MAX_POLLS_PER_INSTITUTION) {
      existing.push(row);
      byPollster.set(row.pollster, existing);
    }
  }

  const grouped = Array.from(byPollster.entries())
    .map(([pollster, polls]) => ({ pollster, polls }))
    .sort((a, b) => a.pollster.localeCompare(b.pollster));

  return NextResponse.json(grouped);
}
