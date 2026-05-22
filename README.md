# JoSAA Explorer

Find your best college match based on JoSAA opening & closing ranks (2019-2025).

Enter your rank, category, gender, and home state to see which colleges and programs you're eligible for, with year-wise eligibility tracking and weighted confidence scores.

## Architecture

- **Backend**: Python FastAPI + SQLAlchemy + SQLite
- **Frontend**: React + Vite + Tailwind CSS
- **Scraper**: Playwright-based headless browser automation (JoSAA uses ASP.NET with anti-automation protections)

## Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

### Scrape data (one-time per year)

```bash
cd backend
source venv/bin/activate

# All years:
python run_scraper.py

# Single year:
python run_scraper.py --year 2024

# Single year + round:
python run_scraper.py --year 2024 --round 5

# Current year (2025):
python run_scraper.py --current
```

### Run the API server

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api` requests to the backend at `localhost:8000`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/search` | Main search endpoint |
| GET | `/api/metadata` | Available years, rounds, states, categories |
| GET | `/api/institutes` | List all institutes |
| GET | `/api/programs` | List all programs |
| GET | `/api/health` | Health check |

## Future AI Integration

The `/api/ai/` namespace is reserved for future AI-powered features:
- `/api/ai/recommend` - LLM-powered recommendations
- `/api/ai/predict` - Rank trend prediction
- `/api/ai/compare` - Natural language college comparison
- `/api/ai/chat` - Conversational interface
