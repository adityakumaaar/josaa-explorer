# Handoff

## Goal

Build and iterate on **JoSAA Explorer** — a web app that helps students find colleges based on JEE ranks using scraped JoSAA opening/closing rank data (2021–2025). Originally deployed on Railway, now migrating to **Render** (free tier) due to Railway Postgres volume limits.

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
- **Reddit sentiment feature** (code complete, not yet scraped/populated):
  - Reddit scraper (`backend/app/scraper/reddit.py`) using `old.reddit.com/.json` endpoints — no API keys needed. 13 NITs/IIITs mapped to subreddits.
  - Gemini sentiment analyzer (`backend/app/services/sentiment.py`) — categorized analysis (Placements, Campus Life, Faculty, Infrastructure) with structured JSON output.
  - Orchestrator script (`backend/scrape_sentiment.py`) — CLI with `--scrape-only`, `--analyze-only`, `--institute`, `--limit` flags.
  - API endpoint `GET /api/sentiment?institute=...&program=...` in `backend/app/api/routes.py`.
  - Frontend UI in `CollegeCard.tsx` expanded view — 2x2 grid of sentiment cards with Reddit snippets.
  - DB models: `RedditPost` and `CollegeSentiment` tables in `backend/app/models/database.py`.

### Key Architecture Decisions

- **Dropped 2019/2020 data** — not useful, was causing DB bloat.
- **State stored in DB** (not derived at runtime) — `_backfill_states()` populates from `INSTITUTE_STATE_MAP` on startup.
- **Quota included in grouping key** — ensures HS/OS/AI appear as distinct results.
- **Round-based confidence scoring** — earlier round eligibility = higher sub-score (`ROUND_SCORE` dict).
- **Sentiment: NITs/IIITs only** — IITs excluded from Reddit sentiment analysis.
- **`API_BASE` pattern** — frontend reads `VITE_API_URL` env var (empty string for local dev with Vite proxy).

## What Worked

- **`old.reddit.com/.json` endpoints** for scraping without API credentials — append `.json` to any Reddit URL.
- **Gemini free tier** with structured JSON output (`response_mime_type: "application/json"`) for reliable sentiment parsing.
- **Background thread for startup tasks** — prevents Render timeout on `_backfill_states()`.
- **`closing_rank >= min_rank` filter** — reduced search from 7-8s to 1-2s on Render free tier by eliminating 90%+ of rows at DB level.
- **Playwright** for scraping ASP.NET WebForms with `__doPostBack`.
- **`createPortal` to `document.body`** for dropdown that escapes sidebar's `overflow-y-auto`.

## What Didn't Work

- **Railway free tier (0.5 GB volume)**: Postgres crashed from dead row bloat after deleting 300K records without VACUUM. Could not recover on free tier. Migrated to Render.
- **Synchronous startup backfill on Render**: Server took >60s to start, Render killed it. Fix: `threading.Thread(target=_backfill_states, daemon=True).start()`.
- **Fetching ALL records then filtering in Python**: Devastating on free-tier Postgres (7-8s queries). Must filter at DB level.
- **CORS with specific origin**: Subtle mismatches (trailing slash, http vs https) caused 403 on preflight. Using `CORS_ORIGINS=*` for now (acceptable for public tool with no auth).

## Next Steps

1. **Run sentiment scraper**: Populate the database with Reddit sentiment data.
   ```bash
   cd backend && source venv/bin/activate
   pip install google-genai
   DATABASE_URL="<render_internal_url>" GEMINI_API_KEY="<key>" python scrape_sentiment.py --limit 5
   ```
   Get a free Gemini API key from https://aistudio.google.com/. After testing with `--limit 5`, run full (`python scrape_sentiment.py`).

2. **Add `GEMINI_API_KEY` to Render backend env vars** if you want on-demand analysis later.

3. **Commit and push all changes** — the sentiment feature, Render migration changes, and performance optimization are all uncommitted.

4. **Consider adding more NITs/IIITs** to the subreddit map in `backend/app/scraper/reddit.py` (currently 13 mapped; there are 30+ NITs total).

5. **Render free Postgres expires June 22, 2026** — will need to recreate DB and re-scrape. Consider automating with a script or moving to a paid tier.

6. **Cold start UX**: Render free web service spins down after 15 min inactivity (~30s cold start). Consider adding a loading state or "waking up" indicator on the frontend.

## Key Files

| File | Purpose |
|------|---------|
| `backend/app/services/search.py` | Core search logic, quota resolution, scoring |
| `backend/app/api/routes.py` | API endpoints (search, details, sentiment, programs) |
| `backend/app/models/database.py` | SQLAlchemy models (ORCRRecord, RedditPost, CollegeSentiment) |
| `backend/app/models/schemas.py` | Pydantic request/response models |
| `backend/app/models/institute_states.py` | Institute → state mapping + `derive_state()` |
| `backend/app/main.py` | FastAPI app, startup (migrations, backfill), static serving |
| `backend/app/scraper/reddit.py` | Reddit scraper (old.reddit.com .json endpoints) |
| `backend/app/services/sentiment.py` | Gemini-based categorized sentiment analysis |
| `backend/scrape_sentiment.py` | CLI orchestrator for Reddit scraping + Gemini analysis |
| `backend/scrape_deploy.py` | JoSAA data scraper (all rounds 2021–2025) |
| `frontend/src/components/SearchForm.tsx` | Search form with all filters |
| `frontend/src/components/ResultsTable.tsx` | Results display with group-by-college toggle |
| `frontend/src/components/CollegeCard.tsx` | College card with expandable details + sentiment |
| `frontend/src/hooks/useSearch.ts` | Search API hook |
| `frontend/src/lib/api.ts` | `API_BASE` constant (reads `VITE_API_URL`) |
| `frontend/src/lib/types.ts` | TypeScript interfaces |
| `frontend/src/lib/urlParams.ts` | URL param encode/decode for sharing |

## Environment Variables (Render)

| Service | Variable | Value |
|---------|----------|-------|
| Backend | `DATABASE_URL` | Render Internal Postgres URL |
| Backend | `CORS_ORIGINS` | `*` |
| Backend | `GEMINI_API_KEY` | Google AI Studio key (for sentiment) |
| Frontend | `VITE_API_URL` | `https://josaa-backend-jivl.onrender.com` |
