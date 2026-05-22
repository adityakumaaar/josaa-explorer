#!/usr/bin/env python3
"""CLI to scrape JoSAA ORCR data and store in SQLite.

Usage:
  python run_scraper.py                    # scrape all years (2019-2025), all rounds
  python run_scraper.py --year 2024        # single year, all rounds
  python run_scraper.py --year 2024 --round 6  # single year+round
  python run_scraper.py --current          # 2025 only
"""

import argparse
import sys

from app.models.database import (
    ORCRRecord,
    SessionLocal,
    derive_institute_type,
    init_db,
)
from app.scraper.fetch_archive import (
    fetch_archive_year_round,
    get_available_rounds as get_archive_rounds,
)
from app.scraper.fetch_current import (
    fetch_current_round,
    get_available_rounds as get_current_rounds,
)

ARCHIVE_YEARS = list(range(2019, 2025))
CURRENT_YEAR = 2025


def store_records(year: int, round_no: int, rows: list[dict]) -> int:
    db = SessionLocal()
    try:
        db.query(ORCRRecord).filter(
            ORCRRecord.year == year, ORCRRecord.round == round_no
        ).delete()

        count = 0
        for r in rows:
            if not r.get("institute") or r.get("closing_rank") is None:
                continue
            rec = ORCRRecord(
                year=year,
                round=round_no,
                institute_type=derive_institute_type(r["institute"]),
                institute=r["institute"],
                program=r["program"],
                quota=r.get("quota", "AI"),
                seat_type=r.get("seat_type", "OPEN"),
                gender=r.get("gender", "Gender-Neutral"),
                opening_rank=r.get("opening_rank"),
                closing_rank=r["closing_rank"],
                is_preparatory=r.get("is_preparatory", False),
            )
            db.add(rec)
            count += 1
        db.commit()
        return count
    finally:
        db.close()


def scrape_archive(year: int, round_no: int | None = None):
    if round_no:
        rounds = [round_no]
    else:
        print(f"  Fetching available rounds for {year}...")
        rounds = get_archive_rounds(year)
        print(f"  Rounds available: {rounds}")

    for rnd in rounds:
        print(f"  Scraping {year} round {rnd}...", end=" ", flush=True)
        try:
            rows = fetch_archive_year_round(year, rnd)
            count = store_records(year, rnd, rows)
            print(f"OK — {count} records")
        except Exception as e:
            print(f"FAILED — {e}")


def scrape_current(round_no: int | None = None):
    if round_no:
        rounds = [round_no]
    else:
        print(f"  Fetching available rounds for {CURRENT_YEAR}...")
        rounds = get_current_rounds()
        print(f"  Rounds available: {rounds}")

    for rnd in rounds:
        print(f"  Scraping {CURRENT_YEAR} round {rnd}...", end=" ", flush=True)
        try:
            rows = fetch_current_round(rnd)
            count = store_records(CURRENT_YEAR, rnd, rows)
            print(f"OK — {count} records")
        except Exception as e:
            print(f"FAILED — {e}")


def main():
    parser = argparse.ArgumentParser(description="Scrape JoSAA ORCR data")
    parser.add_argument("--year", type=int, help="Specific year (2019-2024)")
    parser.add_argument("--round", type=int, help="Specific round number")
    parser.add_argument(
        "--current", action="store_true", help="Scrape 2025 (current year)"
    )
    args = parser.parse_args()

    init_db()

    if args.current:
        print(f"=== Scraping {CURRENT_YEAR} (current) ===")
        scrape_current(args.round)
    elif args.year:
        if args.year == CURRENT_YEAR:
            print(f"=== Scraping {CURRENT_YEAR} (current) ===")
            scrape_current(args.round)
        elif args.year in ARCHIVE_YEARS:
            print(f"=== Scraping {args.year} ===")
            scrape_archive(args.year, args.round)
        else:
            print(f"Year {args.year} not in range 2019-2025")
            sys.exit(1)
    else:
        for y in ARCHIVE_YEARS:
            print(f"\n=== Scraping {y} ===")
            scrape_archive(y)
        print(f"\n=== Scraping {CURRENT_YEAR} (current) ===")
        scrape_current()

    print("\nDone!")


if __name__ == "__main__":
    main()
