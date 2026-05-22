#!/usr/bin/env python3
"""Scrape only the LAST round of each year (2019-2024) + all available 2025 rounds.

This is much faster than scraping all rounds. The last round has the final
closing ranks which is what the recommendation engine needs.
"""

import sys
from app.models.database import init_db
from run_scraper import store_records
from app.scraper.fetch_archive import fetch_archive_year_round, get_available_rounds
from app.scraper.fetch_current import (
    fetch_current_round,
    get_available_rounds as get_current_rounds,
)

ARCHIVE_YEARS = list(range(2019, 2025))
CURRENT_YEAR = 2025

init_db()

# Scrape last round of each archive year
for year in ARCHIVE_YEARS:
    print(f"\n=== {year} ===")
    try:
        rounds = get_available_rounds(year)
        last_round = max(rounds) if rounds else None
        if not last_round:
            print(f"  No rounds found for {year}")
            continue
        print(f"  Available rounds: {rounds}, scraping last round ({last_round})...")
        rows = fetch_archive_year_round(year, last_round)
        count = store_records(year, last_round, rows)
        print(f"  OK — {count} records")
    except Exception as e:
        print(f"  FAILED — {e}")

# Scrape 2025: last available round
print(f"\n=== {CURRENT_YEAR} (current) ===")
try:
    rounds = get_current_rounds()
    last_round = max(rounds) if rounds else None
    if not last_round:
        print(f"  No rounds found for {CURRENT_YEAR}")
    else:
        print(f"  Available rounds: {rounds}, scraping last round ({last_round})...")
        rows = fetch_current_round(last_round)
        count = store_records(CURRENT_YEAR, last_round, rows)
        print(f"  OK — {count} records")
except Exception as e:
    print(f"  FAILED — {e}")

print("\nDone!")
