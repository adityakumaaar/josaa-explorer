#!/usr/bin/env python3
"""Orchestrator: scrape Reddit posts for colleges and analyze sentiment via Gemini.

Pipelined: Reddit scraping and Gemini analysis run concurrently —
while Gemini analyzes college N, Reddit scrapes college N+1.

Usage:
    # Analyze all colleges with known subreddits (Tier 1):
    python scrape_sentiment.py

    # Analyze a specific college:
    python scrape_sentiment.py --institute "National Institute of Technology, Warangal"

    # Only scrape Reddit (skip Gemini analysis):
    python scrape_sentiment.py --scrape-only

    # Only run analysis on already-scraped posts:
    python scrape_sentiment.py --analyze-only

    # Limit to N colleges:
    python scrape_sentiment.py --limit 5

    # Process all colleges from DB:
    python scrape_sentiment.py --all-colleges

    # Skip colleges already analyzed:
    python scrape_sentiment.py --skip-existing

Environment:
    DATABASE_URL - Postgres connection string (defaults to local SQLite)
    GEMINI_API_KEY - Google AI Studio API key for sentiment analysis
"""

import argparse
import queue
import threading
import time
from datetime import datetime, timezone

from sqlalchemy import distinct

from app.models.database import (
    CollegeSentiment,
    RedditPost,
    SessionLocal,
    init_db,
)
from app.scraper.reddit import (
    INSTITUTE_SUBREDDITS,
    posts_to_store_format,
    scrape_college_posts,
)
from app.services.sentiment import analyze_sentiment

GEMINI_DELAY = 4.5  # seconds between Gemini calls (15 RPM free tier)
SENTINEL = None  # signals end of queue


def clear_institute_data(institute: str):
    """Delete all existing posts and sentiment for a college (for refresh)."""
    db = SessionLocal()
    try:
        db.query(RedditPost).filter_by(institute=institute).delete()
        db.query(CollegeSentiment).filter_by(institute=institute).delete()
        db.commit()
    except Exception as e:
        print(f"    Error clearing data for {institute}: {e}")
        db.rollback()
    finally:
        db.close()


def scrape_and_store(institute: str, program: str | None = None, refresh: bool = False) -> int:
    """Scrape Reddit posts for a college and store in DB. Returns count stored."""
    print(f"  [SCRAPE] {institute}" + (f" [{program}]" if program else ""))

    if refresh:
        clear_institute_data(institute)

    posts = scrape_college_posts(institute, program=program, max_posts=40)

    if not posts:
        print(f"    No posts found")
        return 0

    db = SessionLocal()
    try:
        stored = 0
        records = posts_to_store_format(posts, institute, program)
        for rec in records:
            existing = db.query(RedditPost).filter_by(post_id=rec["post_id"]).first()
            if existing:
                continue
            db.add(RedditPost(**rec))
            stored += 1
        db.commit()
        print(f"    Stored {stored} new posts (of {len(posts)} scraped)")
        return stored
    except Exception as e:
        print(f"    Error storing posts: {e}")
        db.rollback()
        return 0
    finally:
        db.close()


def analyze_and_store(institute: str, program: str | None = None) -> bool:
    """Load posts from DB, analyze with Gemini, store sentiment. Returns success."""
    db = SessionLocal()
    try:
        query = db.query(RedditPost).filter_by(institute=institute)
        if program:
            query = query.filter_by(program=program)
        posts = query.order_by(RedditPost.score.desc()).limit(20).all()

        if not posts:
            print(f"    [GEMINI] No stored posts for {institute}")
            return False

        post_dicts = [
            {
                "title": p.title,
                "body": p.body,
                "score": p.score,
                "top_comments": p.top_comments,
            }
            for p in posts
        ]

        print(f"    [GEMINI] Analyzing {len(post_dicts)} posts for {institute}...")
        results = analyze_sentiment(institute, program, post_dicts)
        if not results:
            return False

        for result in results:
            existing = (
                db.query(CollegeSentiment)
                .filter_by(
                    institute=institute,
                    program=program,
                    category=result["category"],
                )
                .first()
            )
            if existing:
                existing.sentiment = result["sentiment"]
                existing.score = result["score"]
                existing.snippet = result["snippet"]
                existing.post_count = result["post_count"]
                existing.analyzed_at = result["analyzed_at"]
            else:
                db.add(CollegeSentiment(institute=institute, program=program, **result))

        db.commit()
        print(f"    [GEMINI] Done: {institute}")
        return True
    except Exception as e:
        print(f"    [GEMINI] Error for {institute}: {e}")
        db.rollback()
        return False
    finally:
        db.close()


def get_target_institutes(limit: int | None = None) -> list[str]:
    """Get list of institutes to process (those with known subreddits first)."""
    institutes = list(INSTITUTE_SUBREDDITS.keys())
    if limit:
        institutes = institutes[:limit]
    return institutes


def get_all_db_institutes(limit: int | None = None) -> list[str]:
    """Get unique institutes from the ORCR database."""
    from app.models.database import ORCRRecord
    db = SessionLocal()
    try:
        query = db.query(distinct(ORCRRecord.institute)).order_by(ORCRRecord.institute)
        if limit:
            query = query.limit(limit)
        return [r[0] for r in query.all()]
    finally:
        db.close()


def get_already_analyzed() -> set[str]:
    """Get set of institutes that already have sentiment data."""
    db = SessionLocal()
    try:
        rows = db.query(distinct(CollegeSentiment.institute)).all()
        return {r[0] for r in rows}
    finally:
        db.close()


def _scraper_worker(institutes: list[str], work_queue: queue.Queue, refresh: bool = False):
    """Worker thread: scrapes Reddit for each college, puts institute on queue when done."""
    for institute in institutes:
        scrape_and_store(institute, refresh=refresh)
        work_queue.put(institute)
    work_queue.put(SENTINEL)


def _analyzer_worker(work_queue: queue.Queue, results: dict):
    """Worker thread: picks up scraped colleges from queue and analyzes with Gemini."""
    last_call = 0.0
    while True:
        institute = work_queue.get()
        if institute is SENTINEL:
            break

        # Respect Gemini rate limit
        elapsed = time.time() - last_call
        if elapsed < GEMINI_DELAY:
            time.sleep(GEMINI_DELAY - elapsed)

        success = analyze_and_store(institute)
        last_call = time.time()
        if success:
            results["analyzed"] += 1


def run_pipeline(institutes: list[str], refresh: bool = False):
    """Run scraping and analysis concurrently in a producer-consumer pipeline."""
    work_queue: queue.Queue = queue.Queue(maxsize=3)
    results = {"analyzed": 0}

    analyzer_thread = threading.Thread(
        target=_analyzer_worker, args=(work_queue, results), daemon=True
    )
    analyzer_thread.start()

    scraper_thread = threading.Thread(
        target=_scraper_worker, args=(institutes, work_queue, refresh), daemon=True
    )
    scraper_thread.start()

    scraper_thread.join()
    analyzer_thread.join()

    return results["analyzed"]


def main():
    parser = argparse.ArgumentParser(description="Scrape Reddit & analyze college sentiment")
    parser.add_argument("--institute", type=str, help="Process a specific institute")
    parser.add_argument("--scrape-only", action="store_true", help="Only scrape, skip analysis")
    parser.add_argument("--analyze-only", action="store_true", help="Only analyze existing posts")
    parser.add_argument("--limit", type=int, help="Limit number of colleges to process")
    parser.add_argument("--all-colleges", action="store_true", help="Process all colleges from DB")
    parser.add_argument("--skip-existing", action="store_true", help="Skip colleges already analyzed")
    parser.add_argument("--refresh", action="store_true", help="Delete old data and re-scrape/analyze fresh (last 1 year only)")
    args = parser.parse_args()

    init_db()

    if args.institute:
        institutes = [args.institute]
    elif args.all_colleges:
        institutes = get_all_db_institutes(args.limit)
    else:
        institutes = get_target_institutes(args.limit)

    if args.skip_existing:
        already_done = get_already_analyzed()
        before = len(institutes)
        institutes = [i for i in institutes if i not in already_done]
        skipped = before - len(institutes)
        if skipped:
            print(f"Skipping {skipped} already-analyzed colleges")

    print(f"\nProcessing {len(institutes)} institutes\n{'=' * 50}")

    if not institutes:
        print("Nothing to do!")
        return

    if args.refresh:
        print("REFRESH mode: will delete old data and re-scrape (last 1 year posts only)\n")

    if args.scrape_only:
        # Sequential scrape only (Reddit rate limited anyway)
        for i, institute in enumerate(institutes, 1):
            print(f"\n[{i}/{len(institutes)}] {institute}")
            scrape_and_store(institute, refresh=args.refresh)
        print(f"\n{'=' * 50}\nScraping complete!")

    elif args.analyze_only:
        # Sequential analysis only (Gemini rate limited)
        analyzed = 0
        for i, institute in enumerate(institutes, 1):
            print(f"\n[{i}/{len(institutes)}] {institute}")
            time.sleep(GEMINI_DELAY)
            if analyze_and_store(institute):
                analyzed += 1
        print(f"\n{'=' * 50}\nAnalyzed {analyzed} colleges")

    else:
        # Pipeline: scrape and analyze concurrently
        print("Running in PIPELINE mode (scrape + analyze concurrently)\n")
        analyzed = run_pipeline(institutes, refresh=args.refresh)
        print(f"\n{'=' * 50}\nPipeline complete! Analyzed {analyzed} colleges")

    print(f"Finished at {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
