import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { PollOfPollsOutput } from "@/lib/types";

export async function GET() {
  const { data, error } = await supabase
    .from("poll_of_polls_history")
    .select("*")
    .order("calculation_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "No poll data available yet" }, { status: 404 });
  }

  const output: PollOfPollsOutput = {
    updated_at: data.updated_at,
    election_year: 2026,
    total_polls_included: data.total_polls_included,
    date_range_days: 45,
    parties: data.parties,
    bloc_summary: data.bloc_summary,
  };

  return NextResponse.json(output);
}
