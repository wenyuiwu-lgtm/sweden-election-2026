import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { PollSnapshot } from "@/lib/types";

export async function GET() {
  const { data, error } = await supabase
    .from("poll_of_polls_history")
    .select("*")
    .order("calculation_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) {
    return NextResponse.json([]);
  }

  const snapshots: PollSnapshot[] = data.map((row) => ({
    id: row.id,
    calculation_date: row.calculation_date,
    updated_at: row.updated_at,
    election_year: 2026,
    total_polls_included: row.total_polls_included,
    date_range_days: row.date_range_days,
    parties: row.parties,
    bloc_summary: row.bloc_summary,
    update_note: row.update_note ?? null,
  }));

  return NextResponse.json(snapshots);
}
