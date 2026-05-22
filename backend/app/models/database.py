import os
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "josaa.db")
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DB_PATH}")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class ORCRRecord(Base):
    __tablename__ = "orcr_records"

    id = Column(Integer, primary_key=True)
    year = Column(Integer, nullable=False)
    round = Column(Integer, nullable=False)
    institute_type = Column(String, nullable=False)
    institute = Column(String, nullable=False)
    state = Column(String, nullable=True)
    program = Column(String, nullable=False)
    quota = Column(String, nullable=False)
    seat_type = Column(String, nullable=False)
    gender = Column(String, nullable=False)
    opening_rank = Column(Integer, nullable=True)
    closing_rank = Column(Integer, nullable=True)
    is_preparatory = Column(Boolean, default=False)

    __table_args__ = (
        Index("ix_search", "year", "seat_type", "gender", "closing_rank"),
        Index("ix_institute_program", "institute", "program"),
        Index("ix_closing_rank_filter", "closing_rank", "seat_type", "gender", "is_preparatory"),
    )


class ShareLog(Base):
    __tablename__ = "share_logs"

    id = Column(Integer, primary_key=True)
    params_hash = Column(String, nullable=False, index=True)
    rank = Column(Integer, nullable=False)
    category = Column(String, nullable=False)
    gender = Column(String, nullable=False)
    home_state = Column(String, nullable=False)
    shared_at = Column(DateTime, nullable=False)
    share_count = Column(Integer, default=1)


def derive_institute_type(name: str) -> str:
    import re
    n = re.sub(r"\s+", " ", name.strip().lower())
    if n.startswith("indian institute of technology"):
        return "IIT"
    if "national institute of technology" in n or "iiest" in n:
        return "NIT"
    if "indian institute of information technology" in n or n.startswith("iiit"):
        return "IIIT"
    return "GFTI"


def init_db():
    Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
