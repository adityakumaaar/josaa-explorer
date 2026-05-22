# Handoff

## Goal

Build and iterate on **JoSAA Explorer** — a web app that helps students find colleges based on JEE ranks using 7 years of scraped JoSAA opening/closing rank data (2019–2025). The app is deployed on Railway (FastAPI + React served as a single Docker service with Postgres).

**Live site:** `jossa-explorer-production.up.railway.app`

## Current Progress

### Completed
- **Data scraping**: Playwright-based scrapers for archive (2019–2024) and current (2025) JoSAA data. Parallel scraping with retries (`backend/scrape_all_parallel.py`). Deployment-optimized script (`backend/scrape_deploy.py`) scrapes all rounds for 2022–2025 and last round only for 2019–2021 to fit Railway's 500MB Postgres limit.
- **Backend (FastAPI)**: Search API with weighted confidence scoring (recent years weighted 2x). Quota resolution logic (HS/OS/AI) based on institute-to-state mapping. Share tracking. Programs and institutes endpoints.
- **Frontend (React/Vite/Tailwind)**: Sidebar layout with filters, results area with single-column college cards. Searchable dropdowns for Home State and Program. Multi-select for years, pills for category/institute type. Mobile-responsive sidebar (fixed overlay with backdrop). Shareable URL params.
- **Deployment**: Multi-stage Dockerfile, `railway.toml`, Postgres on Railway (SEA region). Static React build served via FastAPI.
- **NIT classification fix**: `derive_institute_type()` in `backend/app/models/database.py:58` changed from `startswith` to `in` for NIT detection, fixing 6 NITs (Maulana Azad, MNIT Jaipur, MNNIT Allahabad, SVNIT Surat, VNIT Nagpur, Dr. B R Ambedkar NIT Jalandhar) that were misclassified as GFTI. Local SQLite was patched; Railway Postgres was already correct.
- **Program searchable dropdown**: `GET /api/programs` endpoint accepts optional `?institute_types=IIT,NIT` filter. Frontend uses `createPortal` to render the dropdown list at `document.body` level to escape the sidebar's `overflow-y-auto` clipping. Position is calculated via `getBoundingClientRect()` on the input ref.

### In Progress / Uncommitted Changes
These changes exist on disk but have **not been committed or deployed**:

1. **Category eligibility for OPEN seats** (`backend/app/services/search.py`):
   - Added `crl_rank` parameter to `search_colleges()`. Non-General students can now also see OPEN seats if they provide their CRL rank.
   - `CATEGORY_TO_SEAT_TYPE` still maps each category to only its own seat types (line 8–14). When `crl_rank` is provided and category != General, OPEN is appended to seat_types dynamically (around line 145).
   - Eligibility check uses `effective_rank`: CRL rank for OPEN/OPEN(PwD) seats, category rank for category seats.

2. **CRL rank field** (`frontend/src/components/SearchForm.tsx`):
   - Second optional rank input appears when non-General category is selected.
   - `crl_rank` added to `SearchParams` type (`frontend/src/lib/types.ts`) and URL params (`frontend/src/lib/urlParams.ts`).

3. **Program dropdown** (`frontend/src/components/SearchForm.tsx`):
   - Uses `createPortal(…, document.body)` with `position: fixed` and `z-index: 9999`.
   - `progRect` state holds the input's `DOMRect`, set via `openProgDropdown()` called from `onFocus` and `onChange`.
   - Programs fetched from `/api/programs` in a `useEffect` keyed on `instTypes`.

4. **Backend programs endpoint** (`backend/app/api/routes.py:150–161`):
   - Accepts `institute_types` query param (comma-separated string), filters `DISTINCT program` by institute type.

5. **Schema** (`backend/app/models/schemas.py`):
   - `SearchRequest` has new `crl_rank: int | None` field.

## What Worked

- **Playwright** for scraping ASP.NET WebForms with `__doPostBack`. Must wait for `typeof __doPostBack === 'function'` before evaluating.
- **Parallel scraping** with `ThreadPoolExecutor(max_workers=5)` and per-round retries.
- **`createPortal` to `document.body`** for the program dropdown — only approach that escapes the sidebar's `overflow-y-auto` clipping.
- **Inline flow dropdown** works fine for the Home State selector (positioned earlier in the form where there's space).
- **`derive_institute_type` using `in` instead of `startswith`** for NIT detection (handles prefixed names like "Maulana Azad NIT").

## What Didn't Work

- **`position: absolute` dropdown inside `overflow-y-auto` sidebar**: Gets clipped at the container boundary. Tried adding `h-48` spacer div at bottom — still clips because the sidebar visible area doesn't auto-scroll.
- **`scrollIntoView` on inline dropdown**: Technically works but UX is jarring — the sidebar jumps around.
- **`position: fixed` without portal**: The `<ul>` was still inside the sidebar DOM, and some browsers still clip it. Portal is required.
- **`position: fixed` with stale coordinates**: Initially, `progDropStyle` was only computed in `onFocus`. If focus was already held when the component re-rendered, coordinates were `{}` and the dropdown was invisible. Fixed by computing rect in both `onFocus` and `onChange` via `openProgDropdown()`.

## Next Steps

1. **Commit and deploy**: All changes above are uncommitted. Commit, push, and Railway will auto-deploy from the Dockerfile.

2. **Test CRL rank feature end-to-end**: Select a non-General category (e.g., SC), enter SC rank and CRL rank, verify results include both SC seats and OPEN seats with correct rank comparisons.

3. **Test program dropdown on production**: Verify the portal dropdown works correctly on the Railway deployment (both desktop and mobile).

4. **Consider future improvements**:
   - The `program_query` sent to search uses `ilike('%{query}%')` — when a full program name is selected from the dropdown, this is an exact substring match which works, but could be optimized to exact match.
   - Year/round data could be fetched from the `/api/metadata` endpoint instead of being hardcoded in `SearchForm.tsx` (lines 5–6).
   - AI integration hooks (the architecture supports adding prediction/chat endpoints).

## Key Files

| File | Purpose |
|------|---------|
| `backend/app/services/search.py` | Core search logic, quota resolution, scoring |
| `backend/app/api/routes.py` | API endpoints |
| `backend/app/models/database.py` | SQLAlchemy models, `derive_institute_type()` |
| `backend/app/models/schemas.py` | Pydantic request/response models |
| `backend/app/main.py` | FastAPI app, static file serving for SPA |
| `frontend/src/components/SearchForm.tsx` | Search form with all filters |
| `frontend/src/components/ResultsTable.tsx` | Results display with cards |
| `frontend/src/components/CollegeCard.tsx` | Individual college card |
| `frontend/src/hooks/useSearch.ts` | Search API hook |
| `frontend/src/lib/types.ts` | TypeScript interfaces |
| `frontend/src/lib/urlParams.ts` | URL param encode/decode for sharing |
| `Dockerfile` | Multi-stage build (Node + Python) |
| `railway.toml` | Railway deployment config |
