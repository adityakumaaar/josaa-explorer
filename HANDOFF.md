# Handoff

## Goal

Build and iterate on **JoSAA Explorer** — a web app that helps students find colleges based on JEE ranks using scraped JoSAA opening/closing rank data (2021–2025). Deployed on **Render** (free tier).

**Render URLs:**
- Backend: `https://josaa-backend-jivl.onrender.com`
- Frontend: `https://jossa-frontend-s3r5.onrender.com`

## Current Progress

### Completed (deployed or ready to deploy)

- **Data scraping**: Playwright-based scrapers for archive (2021–2024) and current (2025) JoSAA data. Parallel scraping with retries. Script: `backend/scrape_deploy.py` — all rounds for 2021–2025.
- **Backend (FastAPI)**: Search API with round-weighted confidence scoring, quota resolution (HS/OS/AI), college state filter, branch keyword filter, CRL rank for OPEN seats, detail endpoint (filtered by quota). Share tracking.
- **Frontend (React/Vite/Tailwind)**: Sidebar layout, college cards with expandable round-by-year detail table (color-coded eligibility), group-by-college toggle, searchable branch type and college state filters. Mobile-responsive. Shareable URL params.
- **Render deployment**: Frontend as static site, backend as web service, Postgres free tier (expires June 22, 2026). `VITE_API_URL` and `CORS_ORIGINS` configured. Backend startup runs migrations and state backfill in background thread to avoid Render timeout.
- **Performance optimization**: Added `closing_rank >= min_rank` filter to search query + composite index `ix_closing_rank_filter`. Connection pooling (`pool_size=5, max_overflow=10, pool_pre_ping=True`).
- **Integration tests**: 31 tests in `backend/tests/test_search_integration.py` covering quota logic, eligibility, round scoring, gender filtering, branch keywords, confidence properties, field integrity.
- **Reddit sentiment feature** (partially scraped — 18 colleges done):
  - Reddit scraper (`backend/app/scraper/reddit.py`) using `old.reddit.com/.json` endpoints — no API keys needed. Filters to last 1 year of posts only (`time_filter="year"` + `created_utc` check). 18 NITs/IIITs mapped to subreddits, 51 total in abbreviations map.
  - Gemini sentiment analyzer (`backend/app/services/sentiment.py`) — categorized analysis (Placements, Campus Life, Faculty, Infrastructure) with structured JSON output.
  - Orchestrator script (`backend/scrape_sentiment.py`) — pipelined (scrape + analyze concurrently via `threading` + `queue`). CLI flags: `--scrape-only`, `--analyze-only`, `--institute`, `--limit`, `--all-colleges`, `--skip-existing`, `--refresh` (deletes old data, re-scrapes fresh).
  - API endpoint `GET /api/sentiment?institute=...&program=...` in `backend/app/api/routes.py`.
  - Frontend UI in `CollegeCard.tsx` expanded view — 2x2 grid of sentiment cards with Reddit snippets.
  - Green dot indicator on cards where sentiment is available.
  - **Feature flag**: `VITE_SHOW_SENTIMENT=false` disables all sentiment UI and API calls (defaults to enabled).
  - DB models: `RedditPost` and `CollegeSentiment` tables in `backend/app/models/database.py`.
- **College placement data + website links** (code complete, needs DB population):
  - `CollegeMetadata` model in `backend/app/models/database.py` — stores website_url, nirf_rank, median/average/highest package (LPA), placement_pct, data_year.
  - Curated data script `backend/scrape_nirf.py` — 51 NITs/IIITs with NIRF 2024 placement stats and verified website URLs.
  - API endpoint `GET /api/college-meta?institute=...` in `backend/app/api/routes.py`.
  - Frontend: placement stats (Median/Average/Highest/Placed %) shown in expanded `CollegeCard` and `CollegeGroupCard` with NIRF rank badge and external website link (opens in new tab with external link icon).

### Key Architecture Decisions

- **Dropped 2019/2020 data** — not useful, was causing DB bloat.
- **State stored in DB** (not derived at runtime) — `_backfill_states()` populates from `INSTITUTE_STATE_MAP` on startup.
- **Quota included in grouping key** — ensures HS/OS/AI appear as distinct results.
- **Round-based confidence scoring** — earlier round eligibility = higher sub-score (`ROUND_SCORE` dict).
- **Sentiment: NITs/IIITs only** — IITs excluded from Reddit sentiment analysis.
- **Reddit posts filtered to last 1 year** — both via Reddit API `t=year` param and `created_utc` check in `_extract_posts()`.
- **`API_BASE` pattern** — frontend reads `VITE_API_URL` env var (empty string for local dev with Vite proxy).
- **Feature flags via `VITE_*` env vars** — `VITE_SHOW_SENTIMENT` controls sentiment visibility; requires rebuild to toggle.
- **Placement data pre-populated** — NIRF data is annual/static, stored in `college_metadata` table. No benefit to lazy loading.

## What Worked

- **`old.reddit.com/.json` endpoints** for scraping without API credentials — append `.json` to any Reddit URL.
- **Gemini free tier** with structured JSON output (`response_mime_type: "application/json"`) for reliable sentiment parsing.
- **Pipelined scraping** — Reddit scraping and Gemini analysis run concurrently (`threading` + `queue`) with Gemini rate limit respected (4.5s between calls for 15 RPM free tier).
- **`--refresh` flag** on `scrape_sentiment.py` — clears old data before re-scraping, ensures only last-year posts.
- **Background thread for startup tasks** — prevents Render timeout on `_backfill_states()`.
- **`closing_rank >= min_rank` filter** — reduced search from 7-8s to 1-2s on Render free tier by eliminating 90%+ of rows at DB level.
- **Playwright** for scraping ASP.NET WebForms with `__doPostBack`.
- **`createPortal` to `document.body`** for dropdown that escapes sidebar's `overflow-y-auto`.

## What Didn't Work

- **Railway free tier (0.5 GB volume)**: Postgres crashed from dead row bloat after deleting 300K records without VACUUM. Could not recover on free tier. Migrated to Render.
- **Synchronous startup backfill on Render**: Server took >60s to start, Render killed it. Fix: `threading.Thread(target=_backfill_states, daemon=True).start()`.
- **Fetching ALL records then filtering in Python**: Devastating on free-tier Postgres (7-8s queries). Must filter at DB level.
- **CORS with specific origin**: Subtle mismatches (trailing slash, http vs https) caused 403 on preflight. Using `CORS_ORIGINS=*` for now (acceptable for public tool with no auth).
- **Some college websites use HTTP-only or require `www.` prefix**: `nits.ac.in`, `nita.ac.in`, `nitrr.ac.in` don't respond on bare `https://` — fixed with `http://www.` prefix in `scrape_nirf.py`.

## Next Steps

1. **Populate college metadata DB**: Run on Render (or locally with Render DB URL):
   ```bash
   cd backend && source venv/bin/activate
   DATABASE_URL="<render_internal_url>" python scrape_nirf.py
   ```

2. **Continue sentiment scraping** (18/51 colleges done):
   ```bash
   DATABASE_URL="<render_internal_url>" GEMINI_API_KEY="<key>" python scrape_sentiment.py --refresh --all-colleges
   ```
   Use `--skip-existing` instead of `--refresh` to only process remaining colleges.

3. **Verify website URLs**: Some college websites in `scrape_nirf.py` may be incorrect. When users report broken links, update the `website_url` field for that institute.

4. **Commit and push all changes** — placement data feature, sentiment improvements, and feature flag are all uncommitted.

5. **Render free Postgres expires June 22, 2026** — will need to recreate DB and re-scrape. Consider automating with a script or moving to a paid tier.

6. **Phase 2: Branch-wise placement data** — NIRF only has institute-level stats. Branch-specific data (CS/ECE/Mech) would need parsing individual college placement PDFs or using Gemini to extract from reports.

7. **Cold start UX**: Render free web service spins down after 15 min inactivity (~30s cold start). Consider adding a loading state or "waking up" indicator on the frontend.

## Key Files

| File | Purpose |
|------|---------|
| `backend/app/services/search.py` | Core search logic, quota resolution, scoring |
| `backend/app/api/routes.py` | API endpoints (search, details, sentiment, college-meta, programs) |
| `backend/app/models/database.py` | SQLAlchemy models (ORCRRecord, RedditPost, CollegeSentiment, CollegeMetadata) |
| `backend/app/models/schemas.py` | Pydantic request/response models |
| `backend/app/models/institute_states.py` | Institute → state mapping + `derive_state()` |
| `backend/app/main.py` | FastAPI app, startup (migrations, backfill), static serving |
| `backend/app/scraper/reddit.py` | Reddit scraper (old.reddit.com .json, 1-year filter) |
| `backend/app/services/sentiment.py` | Gemini-based categorized sentiment analysis |
| `backend/scrape_sentiment.py` | CLI orchestrator for Reddit scraping + Gemini analysis (pipeline mode) |
| `backend/scrape_nirf.py` | Populate college_metadata table (NIRF ranks, placements, website URLs) |
| `backend/scrape_deploy.py` | JoSAA data scraper (all rounds 2021–2025) |
| `frontend/src/components/SearchForm.tsx` | Search form with all filters |
| `frontend/src/components/ResultsTable.tsx` | Results display, group-by-college, CollegeGroupCard (with placement + sentiment) |
| `frontend/src/components/CollegeCard.tsx` | College card with expandable details, placement stats, sentiment |
| `frontend/src/hooks/useSearch.ts` | Search API hook |
| `frontend/src/lib/api.ts` | `API_BASE` and `SHOW_SENTIMENT` feature flag |
| `frontend/src/lib/types.ts` | TypeScript interfaces |
| `frontend/src/lib/urlParams.ts` | URL param encode/decode for sharing |

## Environment Variables (Render)

| Service | Variable | Value |
|---------|----------|-------|
| Backend | `DATABASE_URL` | Render Internal Postgres URL |
| Backend | `CORS_ORIGINS` | `*` |
| Backend | `GEMINI_API_KEY` | Google AI Studio key (for sentiment) |
| Frontend | `VITE_API_URL` | `https://josaa-backend-jivl.onrender.com` |
| Frontend | `VITE_SHOW_SENTIMENT` | `true` (default) — set to `false` to disable sentiment UI |
