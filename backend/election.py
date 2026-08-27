"""
2026 Swedish General Election - Complete DB-Integrated Pipeline
Handles Supabase/PostgreSQL writes, deduplication, recent-data retrieval,
Poll of Polls weighted calculation, and historical result storage.
"""

import os
import math
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from supabase import create_client, Client

load_dotenv()

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# -------------------------------------------------------------------
# 1. Pydantic data models
# -------------------------------------------------------------------
class Fieldwork(BaseModel):
    start_date: str
    end_date: str
    publication_date: str

class PollEntry(BaseModel):
    poll_id: str
    pollster: str
    publisher: Optional[str] = "N/A"
    fieldwork: Fieldwork
    sample_size: int
    methodology: str = "Unknown"
    data: Dict[str, float]

class PartyResult(BaseModel):
    name: str
    weighted_support: float
    margin_of_error: float
    projected_seats: int
    threshold_passed: bool
    pass_probability: float

class BlocSummary(BaseModel):
    parties: List[str]
    combined_support: float
    projected_seats: int
    has_majority: bool

class PollOfPollsOutput(BaseModel):
    updated_at: str
    election_year: int = 2026
    total_polls_included: int
    date_range_days: int
    parties: Dict[str, PartyResult]
    bloc_summary: Dict[str, BlocSummary]

# -------------------------------------------------------------------
# 2. Core filtering and weighting configuration
# -------------------------------------------------------------------
ALLOWED_POLLSTERS = ["SCB", "Novus", "Demoskop", "Ipsos", "Verian", "Indikator"]

INSTITUTION_WEIGHTS = {
    "SCB": 1.5,
    "Demoskop": 1.2,
    "Novus": 1.2,
    "Verian": 1.2,
    "Ipsos": 1.1,
    "Indikator": 1.0
}

# Time-decay half-life in days, per institution. The default (14 days) fits
# pollsters that publish every 2-4 weeks. SCB only publishes twice a year, so
# the same 14-day curve would decay it to ~1% weight within three months —
# effectively discarding a highly credible poll rather than aging it fairly.
# A 90-day half-life (roughly half of SCB's real ~180-day cycle) keeps a
# 3-month-old SCB poll in the same ballpark as the newest weekly poll instead
# of near zero, and self-corrects the next time SCB publishes.
DEFAULT_HALF_LIFE_DAYS = 14.0
INSTITUTION_HALF_LIFE_DAYS = {
    "SCB": 90.0,
}

# Cap on how many of each institute's most recent polls (within the window)
# get included. Without this, an institute that simply publishes more often
# than the others (e.g. Novus at 6 polls vs. SCB's 1 in a 180-day window)
# accumulates a bigger share of the total weight purely from frequency, not
# from being more informative -- Novus ended up at ~28% of total weight vs.
# SCB's ~21% despite SCB's higher per-poll institution weight. Capping at 3
# keeps a few recent polls per institute (still enough to show a trend and
# smooth out one-off noise) without letting publication frequency alone
# decide how much an institute counts.
MAX_POLLS_PER_INSTITUTION = 3

SWEDISH_PARTIES = {
    "S": "Socialdemokraterna",
    "SD": "Sverigedemokraterna",
    "M": "Moderaterna",
    "V": "Vänsterpartiet",
    "C": "Centerpartiet",
    "KD": "Kristdemokraterna",
    "MP": "Miljöpartiet",
    "L": "Liberalerna",
    "OTH": "Övriga"
}

# -------------------------------------------------------------------
# 3. Sainte-Laguë seat allocation algorithm
# -------------------------------------------------------------------
def calculate_sainte_lague_seats(party_supports: Dict[str, float], total_seats: int = 349) -> Dict[str, int]:
    eligible_parties = {
        p: supp for p, supp in party_supports.items()
        if p != "OTH" and supp >= 4.0
    }

    seats_allocated = {p: 0 for p in party_supports.keys()}
    if not eligible_parties:
        return seats_allocated

    quotients = []
    for party, support in eligible_parties.items():
        quotients.append((support / 1.4, party))

    for _ in range(total_seats):
        quotients.sort(key=lambda x: x[0], reverse=True)
        best_quotient, winning_party = quotients[0]

        seats_allocated[winning_party] += 1

        next_divisor = 2 * seats_allocated[winning_party] + 1
        new_quotient = eligible_parties[winning_party] / next_divisor
        quotients[0] = (new_quotient, winning_party)

    return seats_allocated

# -------------------------------------------------------------------
# 4. Database-integrated pipeline class
# -------------------------------------------------------------------
class DatabaseIntegratedPipeline:
    def __init__(self, target_date: str = "2026-08-27"):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")

        if not url or not key:
            raise ValueError("SUPABASE_URL or SUPABASE_KEY environment variable is not set.")

        self.supabase: Client = create_client(url, key)
        self.target_date = datetime.strptime(target_date, "%Y-%m-%d").date()

    def save_raw_polls(self, raw_polls: List[PollEntry]) -> int:
        """
        Writes newly scraped polls into the raw_polls table
        (deduplicated on poll_id; existing rows are left untouched).
        """
        inserted_count = 0
        for poll in raw_polls:
            # Enforce the institute allowlist and minimum sample size
            if poll.pollster not in ALLOWED_POLLSTERS or poll.sample_size <= 1000:
                logging.info(f"Skipping poll that fails quality bar: {poll.poll_id} ({poll.pollster}, N={poll.sample_size})")
                continue

            record = {
                "poll_id": poll.poll_id,
                "pollster": poll.pollster,
                "publisher": poll.publisher,
                "start_date": poll.fieldwork.start_date,
                "end_date": poll.fieldwork.end_date,
                "publication_date": poll.fieldwork.publication_date,
                "sample_size": poll.sample_size,
                "methodology": poll.methodology,
                "data": poll.data,
                "created_at": datetime.now(timezone.utc).isoformat()
            }

            try:
                # Upsert with on_conflict="poll_id" for deduplication
                response = self.supabase.table("raw_polls").upsert(
                    record, on_conflict="poll_id", ignore_duplicates=True
                ).execute()

                if response.data:
                    inserted_count += 1
                    logging.info(f"Successfully wrote/updated raw poll: {poll.poll_id}")
            except Exception as e:
                logging.error(f"Failed to write to raw_polls ({poll.poll_id}): {e}")

        return inserted_count

    def fetch_recent_raw_polls(self, days: int = 180) -> List[PollEntry]:
        """
        Fetches qualifying raw_polls rows with a publication_date within the
        last N days. The window is 180 days so that SCB, which only publishes
        twice a year, can be reached at all; high-frequency institutes
        (Novus, Demoskop, etc.) that happen to fall inside this wider window
        still get suppressed to near-zero by their own 14-day half-life, so
        widening the window doesn't distort their contribution.

        Additionally, each institute is capped at its MAX_POLLS_PER_INSTITUTION
        most recent polls, so a high-frequency institute can't gain outsized
        influence purely by publishing more often (see that constant's comment).
        """
        try:
            response = self.supabase.table("raw_polls") \
                .select("*") \
                .order("publication_date", desc=True) \
                .execute()

            valid_polls = []
            polls_per_pollster: Dict[str, int] = {}
            for row in response.data:
                pub_date = datetime.strptime(row["publication_date"], "%Y-%m-%d").date()
                days_diff = (self.target_date - pub_date).days

                # Filter to qualifying data within the window
                if 0 <= days_diff <= days:
                    pollster = row["pollster"]
                    # Already at this institute's cap (rows are ordered by
                    # publication_date desc, so earlier hits are always newer)
                    if polls_per_pollster.get(pollster, 0) >= MAX_POLLS_PER_INSTITUTION:
                        continue

                    entry = PollEntry(
                        poll_id=row["poll_id"],
                        pollster=pollster,
                        publisher=row.get("publisher", "N/A"),
                        fieldwork=Fieldwork(
                            start_date=row["start_date"],
                            end_date=row["end_date"],
                            publication_date=row["publication_date"]
                        ),
                        sample_size=row["sample_size"],
                        methodology=row.get("methodology", "Unknown"),
                        data=row["data"]
                    )
                    valid_polls.append(entry)
                    polls_per_pollster[pollster] = polls_per_pollster.get(pollster, 0) + 1

            logging.info(f"Fetched {len(valid_polls)} polls within {days} days, capped at {MAX_POLLS_PER_INSTITUTION} per institute.")
            return valid_polls
        except Exception as e:
            logging.error(f"Failed to read from raw_polls: {e}")
            return []

    def calculate_poll_of_polls(self, raw_polls: List[PollEntry], date_range_days: int = 180) -> PollOfPollsOutput:
        """
        Runs the three-factor weighting and seat-allocation calculation.
        """
        weighted_sums = {p: 0.0 for p in SWEDISH_PARTIES.keys()}
        total_weights = {p: 0.0 for p in SWEDISH_PARTIES.keys()}

        for poll in raw_polls:
            pub_date = datetime.strptime(poll.fieldwork.publication_date, "%Y-%m-%d").date()
            days_diff = (self.target_date - pub_date).days

            # 1. Time-decay (half-life depends on institution; see INSTITUTION_HALF_LIFE_DAYS)
            half_life = INSTITUTION_HALF_LIFE_DAYS.get(poll.pollster, DEFAULT_HALF_LIFE_DAYS)
            w_time = math.exp(-math.log(2) * (days_diff / half_life))

            # 2. Institution-reliability weight
            w_inst = INSTITUTION_WEIGHTS.get(poll.pollster, 1.0)

            # 3. Sample-size (square-root) weight
            w_sample = math.sqrt(poll.sample_size / 1000.0)

            w_total = w_time * w_inst * w_sample

            for party, support in poll.data.items():
                if party in weighted_sums:
                    weighted_sums[party] += support * w_total
                    total_weights[party] += w_total

        # Aggregate support figures
        final_supports = {}
        for party in SWEDISH_PARTIES.keys():
            final_supports[party] = round(weighted_sums[party] / total_weights[party], 2) if total_weights[party] > 0 else 0.0

        # Calculate parliamentary seats
        seats = calculate_sainte_lague_seats(final_supports, total_seats=349)

        # Build per-party results
        party_results = {}
        for party_code, name in SWEDISH_PARTIES.items():
            supp = final_supports[party_code]
            passed = supp >= 4.0 if party_code != "OTH" else False

            pass_prob = 0.0 if party_code == "OTH" else (100.0 if supp >= 4.5 else round(1 / (1 + math.exp(-3.5 * (supp - 4.0))) * 100, 1))
            moe = round(1.96 * math.sqrt((supp * (100 - supp)) / 1500), 2) if supp > 0 else 0.0

            party_results[party_code] = PartyResult(
                name=name,
                weighted_support=supp,
                margin_of_error=moe,
                projected_seats=seats.get(party_code, 0),
                threshold_passed=passed,
                pass_probability=pass_prob
            )

        # Aggregate blocs
        red_green_parties = ["S", "V", "MP", "C"]
        tido_parties = ["M", "SD", "KD", "L"]

        rg_supp = round(sum(final_supports[p] for p in red_green_parties), 2)
        rg_seats = sum(seats.get(p, 0) for p in red_green_parties)
        tido_supp = round(sum(final_supports[p] for p in tido_parties), 2)
        tido_seats = sum(seats.get(p, 0) for p in tido_parties)

        blocs = {
            "red_green_bloc": BlocSummary(
                parties=red_green_parties,
                combined_support=rg_supp,
                projected_seats=rg_seats,
                has_majority=(rg_seats >= 175)
            ),
            "tido_bloc": BlocSummary(
                parties=tido_parties,
                combined_support=tido_supp,
                projected_seats=tido_seats,
                has_majority=(tido_seats >= 175)
            )
        }

        return PollOfPollsOutput(
            updated_at=datetime.now(timezone.utc).isoformat(),
            total_polls_included=len(raw_polls),
            date_range_days=date_range_days,
            parties=party_results,
            bloc_summary=blocs
        )

    def save_poll_of_polls_result(self, result: PollOfPollsOutput) -> bool:
        """
        Writes the weighted result into the poll_of_polls_history table.
        """
        record = {
            "calculation_date": self.target_date.strftime("%Y-%m-%d"),
            "total_polls_included": result.total_polls_included,
            "date_range_days": result.date_range_days,
            "parties": {k: v.model_dump() for k, v in result.parties.items()},
            "bloc_summary": {k: v.model_dump() for k, v in result.bloc_summary.items()},
            "updated_at": result.updated_at
        }

        try:
            response = self.supabase.table("poll_of_polls_history").insert(record).execute()
            if response.data:
                logging.info(f"Successfully saved to poll_of_polls_history (date: {self.target_date})")
                return True
        except Exception as e:
            logging.error(f"Failed to save to poll_of_polls_history: {e}")
        return False

    def run(self, incoming_polls: List[PollEntry], date_range_days: int = 180):
        """
        Runs the full pipeline end to end.
        """
        logging.info("=== Starting 2026 Swedish election poll pipeline ===")

        # 1. Write newly scraped data to the database
        self.save_raw_polls(incoming_polls)

        # 2. Read all qualifying data from the last N days
        recent_polls = self.fetch_recent_raw_polls(days=date_range_days)

        if not recent_polls:
            logging.warning("No recent poll data available; aborting calculation.")
            return

        # 3. Run the weighting calculation and seat allocation
        result = self.calculate_poll_of_polls(recent_polls, date_range_days=date_range_days)

        # 4. Save the result to the history table
        self.save_poll_of_polls_result(result)

        logging.info("=== Pipeline run complete ===")
        return result
