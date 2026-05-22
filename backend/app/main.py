import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api.routes import router
from .models.database import init_db

app = FastAPI(title="JoSAA Explorer API", version="0.1.0")

CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS", "http://localhost:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        file_path = STATIC_DIR / full_path
        if full_path and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(STATIC_DIR / "index.html"))


@app.on_event("startup")
def on_startup():
    init_db()
    _migrate_add_state_column()
    _cleanup_old_years()
    _backfill_states()


def _migrate_add_state_column():
    """Add state column if it doesn't exist (for existing databases)."""
    from .models.database import engine
    with engine.connect() as conn:
        from sqlalchemy import text, inspect
        inspector = inspect(engine)
        columns = [c["name"] for c in inspector.get_columns("orcr_records")]
        if "state" not in columns:
            conn.execute(text("ALTER TABLE orcr_records ADD COLUMN state TEXT"))
            conn.commit()
            print("Added 'state' column to orcr_records")


def _cleanup_old_years():
    """Remove 2019 and 2020 data — no longer used. Only runs if records exist."""
    from .models.database import SessionLocal, ORCRRecord, engine
    db = SessionLocal()
    try:
        count = db.query(ORCRRecord).filter(ORCRRecord.year.in_([2019, 2020])).count()
        if count == 0:
            return
        deleted = db.query(ORCRRecord).filter(ORCRRecord.year.in_([2019, 2020])).delete(synchronize_session=False)
        db.commit()
        print(f"Cleaned up {deleted} records from 2019/2020")
    except Exception as e:
        print(f"Cleanup note: {e}")
        db.rollback()
    finally:
        db.close()

    # VACUUM must run outside a transaction (autocommit mode)
    try:
        from sqlalchemy import text
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("VACUUM orcr_records"))
            print("Vacuumed orcr_records after cleanup")
    except Exception as e:
        print(f"Vacuum skipped: {e}")


def _backfill_states():
    """Populate the state column for records that don't have it yet."""
    from sqlalchemy import distinct
    from .models.database import SessionLocal, ORCRRecord
    from .models.institute_states import derive_state

    db = SessionLocal()
    try:
        institutes_without_state = [
            r[0] for r in db.query(distinct(ORCRRecord.institute))
            .filter(ORCRRecord.state.is_(None))
            .all()
        ]
        if not institutes_without_state:
            return

        updated = 0
        for inst_name in institutes_without_state:
            state = derive_state(inst_name)
            if state:
                count = (
                    db.query(ORCRRecord)
                    .filter(ORCRRecord.institute == inst_name, ORCRRecord.state.is_(None))
                    .update({"state": state}, synchronize_session=False)
                )
                updated += count
        if updated:
            db.commit()
            print(f"Backfilled state for {updated} records ({len(institutes_without_state)} institutes)")
    finally:
        db.close()
