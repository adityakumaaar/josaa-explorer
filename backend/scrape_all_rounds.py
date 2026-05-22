#!/usr/bin/env python3
"""Scrape ALL rounds for all years, skipping rounds already in the DB."""

from app.models.database import SessionLocal, ORCRRecord, init_db
from app.scraper.fetch_archive import fetch_archive_year_round, get_available_rounds
from app.scraper.fetch_current import (
    fetch_current_round,
    get_available_rounds as get_current_rounds,
)
from run_scraper import store_records
from sqlalchemy import func

ARCHIVE_YEARS = list(range(2019, 2025))
CURRENT_YEAR = 2025

init_db()

db = SessionLocal()
existing = set(
    db.query(ORCRRecord.year, ORCRRecord.round)
    .filter(ORCRRecord.closing_rank.isnot(None))
    .group_by(ORCRRecord.year, ORCRRecord.round)
    .having(func.count() > 100)
    .all()
)
db.close()
print(f"Already have data for: {sorted(existing)}")

for year in ARCHIVE_YEARS:
    print(f"\n=== {year} ===")
    try:
        rounds = get_available_rounds(year)
    except Exception as e:
        print(f"  Failed to get rounds: {e}")
        continue
    print(f"  Available: {rounds}")
    for rnd in rounds:
        if (year, rnd) in existing:
            print(f"  R{rnd}: already have data, skipping")
            continue
        print(f"  R{rnd}: scraping...", end=" ", flush=True)
        try:
            rows = fetch_archive_year_round(year, rnd)
            count = store_records(year, rnd, rows)
            print(f"OK — {count} records")
        except Exception as e:
            print(f"FAILED — {e}")

print(f"\n=== {CURRENT_YEAR} (current) ===")
try:
    rounds = get_current_rounds()
except Exception as e:
    print(f"  Failed to get rounds: {e}")
    rounds = []
print(f"  Available: {rounds}")
for rnd in rounds:
    if (CURRENT_YEAR, rnd) in existing:
        print(f"  R{rnd}: already have data, skipping")
        continue
    print(f"  R{rnd}: scraping...", end=" ", flush=True)
    try:
        rows = fetch_current_round(rnd)
        count = store_records(CURRENT_YEAR, rnd, rows)
        print(f"OK — {count} records")
    except Exception as e:
        print(f"FAILED — {e}")

print("\nDone!")
