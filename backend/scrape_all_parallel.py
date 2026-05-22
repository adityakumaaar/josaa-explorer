#!/usr/bin/env python3
"""Scrape ALL rounds for all years in parallel (one browser per year)."""

import concurrent.futures
import sys
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
MAX_WORKERS = 5

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
print(f"Already have data for: {sorted(existing)}", flush=True)


MAX_RETRIES = 3


def scrape_one(year: int, rnd: int, is_current: bool = False) -> str:
    tag = f"{year} R{rnd}"
    if (year, rnd) in existing:
        return f"{tag}: skipped (already have data)"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            if is_current:
                rows = fetch_current_round(rnd)
            else:
                rows = fetch_archive_year_round(year, rnd)
            count = store_records(year, rnd, rows)
            return f"{tag}: OK — {count} records" + (
                f" (attempt {attempt})" if attempt > 1 else ""
            )
        except Exception as e:
            if attempt == MAX_RETRIES:
                return f"{tag}: FAILED after {MAX_RETRIES} attempts — {e}"
            import time
            time.sleep(2 * attempt)


# Build list of all (year, round, is_current) tasks
tasks: list[tuple[int, int, bool]] = []

# Get available rounds for each year — do this sequentially (fast, one browser each)
for year in ARCHIVE_YEARS:
    try:
        rounds = get_available_rounds(year)
        print(f"{year}: rounds {rounds}", flush=True)
        for rnd in rounds:
            tasks.append((year, rnd, False))
    except Exception as e:
        print(f"{year}: failed to get rounds — {e}", flush=True)

try:
    rounds = get_current_rounds()
    print(f"{CURRENT_YEAR}: rounds {rounds}", flush=True)
    for rnd in rounds:
        tasks.append((CURRENT_YEAR, rnd, True))
except Exception as e:
    print(f"{CURRENT_YEAR}: failed to get rounds — {e}", flush=True)

# Filter out already-scraped
tasks = [(y, r, c) for y, r, c in tasks if (y, r) not in existing]
print(f"\n{len(tasks)} rounds to scrape with {MAX_WORKERS} workers\n", flush=True)

with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
    futures = {
        pool.submit(scrape_one, y, r, c): (y, r) for y, r, c in tasks
    }
    for future in concurrent.futures.as_completed(futures):
        print(future.result(), flush=True)

print("\nDone!", flush=True)
