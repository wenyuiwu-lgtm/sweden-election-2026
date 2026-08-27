"""
2026 Swedish General Election - Complete DB-Integrated Pipeline
整合 Supabase/PostgreSQL 寫入、去重、近期資料調取、Poll of Polls 加權計算與歷史結果存檔
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

# 設定 Logging 紀錄
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# -------------------------------------------------------------------
# 1. Pydantic 資料模型定義
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
# 2. 核心篩選與加權配置參數
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
# 3. Sainte-Laguë 席次分配演算法
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
# 4. 資料庫整合 Pipeline 類別
# -------------------------------------------------------------------
class DatabaseIntegratedPipeline:
    def __init__(self, target_date: str = "2026-08-27"):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        
        if not url or not key:
            raise ValueError("未設定 SUPABASE_URL 或 SUPABASE_KEY 環境變數。")
            
        self.supabase: Client = create_client(url, key)
        self.target_date = datetime.strptime(target_date, "%Y-%m-%d").date()

    def save_raw_polls(self, raw_polls: List[PollEntry]) -> int:
        """
        將爬蟲抓到的新民調寫入 raw_polls 表 (依據 poll_id 去重，若已存在則忽略)
        """
        inserted_count = 0
        for poll in raw_polls:
            # 檢查機構與樣本數硬性門檻
            if poll.pollster not in ALLOWED_POLLSTERS or poll.sample_size <= 1000:
                logging.info(f"跳過不符合標準的民調: {poll.poll_id} ({poll.pollster}, N={poll.sample_size})")
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
                # 使用 upsert 搭配 on_conflict="poll_id" 進行去重寫入
                response = self.supabase.table("raw_polls").upsert(
                    record, on_conflict="poll_id", ignore_duplicates=True
                ).execute()
                
                if response.data:
                    inserted_count += 1
                    logging.info(f"成功寫入或更新原始民調: {poll.poll_id}")
            except Exception as e:
                logging.error(f"寫入 raw_polls 失敗 ({poll.poll_id}): {e}")

        return inserted_count

    def fetch_recent_raw_polls(self, days: int = 180) -> List[PollEntry]:
        """
        抓取 publication_date 在最近 N 天內的合格 raw_polls 數據。
        窗口拉到 180 天是為了讓一年只發布 2 次的 SCB 進得來;高頻機構
        （Novus/Demoskop 等）就算被抓進這個較寬的窗口，也會被它們自己
        的 14 天半衰期壓到接近零，不會因此失真。

        另外，每家機構最多只取最近 MAX_POLLS_PER_INSTITUTION 筆，避免發布
        頻率高的機構單純因為「投票次數多」而拿到超額影響力（詳見該常數的
        註解）。
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

                # 篩選窗口天數以內的合格數據
                if 0 <= days_diff <= days:
                    pollster = row["pollster"]
                    # 已達該機構的上限（rows 依 publication_date desc 排序，
                    # 所以先遇到的一定是較新的民調）
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

            logging.info(f"成功從資料庫讀取 {len(valid_polls)} 筆符合 {days} 天內、且未超過每機構 {MAX_POLLS_PER_INSTITUTION} 筆上限的民調數據。")
            return valid_polls
        except Exception as e:
            logging.error(f"從 raw_polls 讀取數據失敗: {e}")
            return []

    def calculate_poll_of_polls(self, raw_polls: List[PollEntry], date_range_days: int = 180) -> PollOfPollsOutput:
        """
        進行三重加權與席次算演
        """
        weighted_sums = {p: 0.0 for p in SWEDISH_PARTIES.keys()}
        total_weights = {p: 0.0 for p in SWEDISH_PARTIES.keys()}

        for poll in raw_polls:
            pub_date = datetime.strptime(poll.fieldwork.publication_date, "%Y-%m-%d").date()
            days_diff = (self.target_date - pub_date).days

            # 1. 時間指數衰減（半衰期依機構而定，見 INSTITUTION_HALF_LIFE_DAYS）
            half_life = INSTITUTION_HALF_LIFE_DAYS.get(poll.pollster, DEFAULT_HALF_LIFE_DAYS)
            w_time = math.exp(-math.log(2) * (days_diff / half_life))

            # 2. 機構公信力加權
            w_inst = INSTITUTION_WEIGHTS.get(poll.pollster, 1.0)
            
            # 3. 樣本數開根號加權
            w_sample = math.sqrt(poll.sample_size / 1000.0)

            w_total = w_time * w_inst * w_sample

            for party, support in poll.data.items():
                if party in weighted_sums:
                    weighted_sums[party] += support * w_total
                    total_weights[party] += w_total

        # 彙整支持率
        final_supports = {}
        for party in SWEDISH_PARTIES.keys():
            final_supports[party] = round(weighted_sums[party] / total_weights[party], 2) if total_weights[party] > 0 else 0.0

        # 計算國會席次
        seats = calculate_sainte_lague_seats(final_supports, total_seats=349)

        # 構建政黨結果
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

        # 陣營彙整
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
        將加權結果存入 poll_of_polls_history 表
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
                logging.info(f"成功存入 poll_of_polls_history (日期: {self.target_date})")
                return True
        except Exception as e:
            logging.error(f"存入 poll_of_polls_history 失敗: {e}")
        return False

    def run(self, incoming_polls: List[PollEntry], date_range_days: int = 180):
        """
        完整 Pipeline 執行流程
        """
        logging.info("=== 開始執行 2026 瑞典民調 Pipeline ===")

        # 1. 將新爬取數據寫入資料庫
        self.save_raw_polls(incoming_polls)

        # 2. 讀取資料庫中最近 N 天的所有合格數據
        recent_polls = self.fetch_recent_raw_polls(days=date_range_days)

        if not recent_polls:
            logging.warning("沒有可用的近期民調數據，中斷運算。")
            return

        # 3. 進行加權運算與席次分配
        result = self.calculate_poll_of_polls(recent_polls, date_range_days=date_range_days)

        # 4. 將運算結果存入歷史紀錄表
        self.save_poll_of_polls_result(result)
        
        logging.info("=== Pipeline 執行完畢 ===")
        return result