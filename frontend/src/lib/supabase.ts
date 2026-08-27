import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
}

// Read-only: RLS on raw_polls / poll_of_polls_history only grants SELECT to anon.
// All writes happen from backend/election.py using the service role key.
export const supabase = createClient(url, anonKey);
