import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { PartyCode, PartyTrend } from "@/lib/types";

const TRACKED_PARTIES: PartyCode[] = ["S", "SD", "M", "V", "C", "KD", "MP", "L"];

export async function GET() {
  const { data, error } = await supabase
    .from("raw_polls")
    .select("pollster, publication_date, data")
    .order("publication_date", { ascending: true });

  if (error || !data) {
    return NextResponse.json([]);
  }

  const rows = data as { pollster: string; publication_date: string; data: Record<string, number> }[];

  const trends: PartyTrend[] = TRACKED_PARTIES.map((party) => ({
    party,
    points: rows
      .filter((row) => typeof row.data?.[party] === "number")
      .map((row) => ({ date: row.publication_date, support: row.data[party], pollster: row.pollster })),
  })).filter((trend) => trend.points.length > 0);

  return NextResponse.json(trends);
}
