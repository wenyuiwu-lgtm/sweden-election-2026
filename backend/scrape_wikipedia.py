"""
Scrapes the Wikipedia "Opinion polling for the 2026 Swedish general election" page
and feeds the results into the DatabaseIntegratedPipeline defined in election.py.

Source: https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Swedish_general_election

The page's main polling table (the one under the "2026" heading) has this column layout:
  Polling firm | Fieldwork date | Sample size | V | S | MP | C | L | M | KD | SD | Oth. | Lead
  | Red-Green % | Tidö % | Lead % | Red-Green seats | Tidö seats | Lead seats

Only the first 11 columns (pollster/date/sample size + the 8 party percentages + Oth.) are
used here — bloc/seat projections are recomputed by election.py's own weighting model rather
than trusted from Wikipedia's editors.
"""

import argparse
import logging
import re
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup, Tag

from election import DatabaseIntegratedPipeline, Fieldwork, PollEntry

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

WIKI_URL = "https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Swedish_general_election"
ELECTION_YEAR = 2026
USER_AGENT = "fika-election-pipeline/1.0 (personal research project; contact via GitHub)"

# Column order of the 8 party-percentage cells in the Wikipedia table.
PARTY_COLUMNS = ["V", "S", "MP", "C", "L", "M", "KD", "SD"]

# Some pollsters appear under more than one name in the table's history.
POLLSTER_ALIASES = {
    "Indikator Opinion": "Indikator",
}

MONTH_ABBR = {
    m.lower(): i
    for i, m in enumerate(
        [
            "jan", "feb", "mar", "apr", "may", "jun",
            "jul", "aug", "sep", "oct", "nov", "dec",
        ],
        start=1,
    )
}


def fetch_page_html(url: str = WIKI_URL) -> str:
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    response.raise_for_status()
    return response.text


def find_year_table(soup: BeautifulSoup, year: int) -> Optional[Tag]:
    """Finds the wikitable that sits under the heading for the given year."""
    heading_span = soup.find(id=str(year))
    if heading_span is None:
        # Fall back to matching heading text directly.
        for tag in soup.find_all(["h2", "h3"]):
            if tag.get_text(strip=True) == str(year):
                heading_span = tag
                break
    if heading_span is None:
        return None

    heading = heading_span if heading_span.name in ("h2", "h3") else heading_span.find_parent(["h2", "h3"])
    if heading is None:
        return None

    return heading.find_next("table", class_="wikitable")


def _clean_text(cell: Tag) -> str:
    cell = BeautifulSoup(str(cell), "html.parser")
    for sup in cell.find_all("sup"):
        sup.decompose()
    return cell.get_text(strip=True)


def _parse_month(token: str) -> Optional[int]:
    token = token.strip().lower()[:3]
    return MONTH_ABBR.get(token)


def parse_fieldwork_range(text: str, year: int) -> Optional[Tuple[date, date]]:
    """Parses Wikipedia fieldwork strings like '6-23 Aug', '29 July-10 Aug', '18 Aug'."""
    normalized = text.replace("–", "-").replace("—", "-").strip()
    if not normalized:
        return None

    parts = normalized.split("-")
    if len(parts) == 1:
        left, right = parts[0], parts[0]
    elif len(parts) == 2:
        left, right = parts
    else:
        return None

    right_match = re.match(r"\s*(\d{1,2})\s+([A-Za-z]+)\s*$", right)
    if not right_match:
        return None
    end_day = int(right_match.group(1))
    end_month = _parse_month(right_match.group(2))
    if end_month is None:
        return None

    left_match_full = re.match(r"\s*(\d{1,2})\s+([A-Za-z]+)\s*$", left)
    left_match_day_only = re.match(r"\s*(\d{1,2})\s*$", left)

    if left_match_full:
        start_day = int(left_match_full.group(1))
        start_month = _parse_month(left_match_full.group(2))
        if start_month is None:
            return None
    elif left_match_day_only:
        start_day = int(left_match_day_only.group(1))
        start_month = end_month
    else:
        return None

    end_year = year
    start_year = year - 1 if start_month > end_month else year

    try:
        return date(start_year, start_month, start_day), date(end_year, end_month, end_day)
    except ValueError:
        return None


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def scrape_wikipedia_polls(year: int = ELECTION_YEAR) -> List[PollEntry]:
    html = fetch_page_html()
    soup = BeautifulSoup(html, "html.parser")

    table = find_year_table(soup, year)
    if table is None:
        logging.error(f"找不到 {year} 年的民調表格,Wikipedia 頁面結構可能已變動。")
        return []

    entries: List[PollEntry] = []
    skipped = 0

    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 12:
            continue

        pollster_raw = _clean_text(cells[0])
        if not pollster_raw or "election" in pollster_raw.lower():
            continue  # 跳過表頭列與「實際選舉結果」對照列

        pollster = POLLSTER_ALIASES.get(pollster_raw, pollster_raw)

        date_range = parse_fieldwork_range(_clean_text(cells[1]), year)
        if date_range is None:
            skipped += 1
            continue
        start_date, end_date = date_range

        sample_text = _clean_text(cells[2]).replace(",", "").replace(" ", "")
        if not sample_text.isdigit():
            skipped += 1
            continue
        sample_size = int(sample_text)

        data: Dict[str, float] = {}
        for i, party in enumerate(PARTY_COLUMNS):
            cell_text = _clean_text(cells[3 + i]).replace("%", "").strip()
            if not cell_text or cell_text in ("-", "–", "—", "N/A"):
                continue
            try:
                data[party] = float(cell_text)
            except ValueError:
                continue

        oth_text = _clean_text(cells[11]).replace("%", "").strip()
        if oth_text and oth_text not in ("-", "–", "—", "N/A"):
            try:
                data["OTH"] = float(oth_text)
            except ValueError:
                pass

        if not data:
            skipped += 1
            continue

        poll_id = f"wiki_{_slugify(pollster)}_{start_date.isoformat()}_{end_date.isoformat()}"

        entries.append(
            PollEntry(
                poll_id=poll_id,
                pollster=pollster,
                publisher="Wikipedia",
                fieldwork=Fieldwork(
                    start_date=start_date.isoformat(),
                    end_date=end_date.isoformat(),
                    publication_date=end_date.isoformat(),
                ),
                sample_size=sample_size,
                methodology="Unknown",
                data=data,
            )
        )

    logging.info(f"從 Wikipedia 解析出 {len(entries)} 筆民調,略過 {skipped} 筆格式無法解析的列。")
    return entries


def main():
    parser = argparse.ArgumentParser(description="Scrape Wikipedia 2026 Swedish election polls into Supabase")
    parser.add_argument(
        "--target-date",
        default=datetime.now().strftime("%Y-%m-%d"),
        help="Pipeline 的『今天』基準日(YYYY-MM-DD),用來算 45 天內數據與時間衰減。預設為執行當天。",
    )
    args = parser.parse_args()

    polls = scrape_wikipedia_polls()
    if not polls:
        logging.warning("沒有抓到任何民調,中止。")
        return

    pipeline = DatabaseIntegratedPipeline(target_date=args.target_date)
    pipeline.run(polls)


if __name__ == "__main__":
    main()
