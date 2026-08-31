// Mirrors backend/election.py's PollOfPollsOutput structure

export type PartyCode = "S" | "SD" | "M" | "V" | "C" | "KD" | "MP" | "L" | "OTH";

export interface PartyResult {
  name: string;
  weighted_support: number;
  margin_of_error: number;
  projected_seats: number;
  threshold_passed: boolean;
  pass_probability: number;
}

export interface BlocSummary {
  parties: PartyCode[];
  combined_support: number;
  projected_seats: number;
  has_majority: boolean;
}

export interface PollOfPollsOutput {
  updated_at: string;
  election_year: number;
  total_polls_included: number;
  date_range_days: number;
  parties: Record<PartyCode, PartyResult>;
  bloc_summary: {
    red_green_bloc: BlocSummary;
    tido_bloc: BlocSummary;
  };
}

export interface PollSnapshot extends PollOfPollsOutput {
  id: number;
  calculation_date: string;
}

export interface TrendPoint {
  date: string;
  support: number;
  pollster: string;
}

export interface PartyTrend {
  party: PartyCode;
  points: TrendPoint[];
}

export interface RawPoll {
  pollster: string;
  start_date: string;
  end_date: string;
  publication_date: string;
  sample_size: number;
  data: Partial<Record<PartyCode, number>>;
}

export interface PollsterGroup {
  pollster: string;
  polls: RawPoll[];
}
