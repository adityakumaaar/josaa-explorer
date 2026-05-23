import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct

from ..models.database import CollegeSentiment, ORCRRecord, ShareLog, get_db
from ..models.schemas import (
    MetadataResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
    YearEligibility,
)
from ..services.search import search_colleges

router = APIRouter(prefix="/api")

INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
    "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
    "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
    "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
]


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/search", response_model=SearchResponse)
def search(req: SearchRequest, db: Session = Depends(get_db)):
    raw = search_colleges(
        db=db,
        rank=req.rank,
        category=req.category,
        gender=req.gender,
        home_state=req.home_state,
        pwd=req.pwd,
        institute_types=req.institute_types,
        program_query=req.program_query,
        branch_keywords=req.branch_keywords,
        college_states=req.college_states,
        round_no=req.round_no,
        years=req.years,
        crl_rank=req.crl_rank,
    )
    results = [
        SearchResult(
            institute=r["institute"],
            institute_type=r["institute_type"],
            state=r.get("state"),
            program=r["program"],
            quota=r["quota"],
            seat_type=r["seat_type"],
            gender=r["gender"],
            confidence_score=r["confidence_score"],
            latest_opening_rank=r.get("latest_opening_rank"),
            latest_closing_rank=r["latest_closing_rank"],
            year_eligibility={
                yr: YearEligibility(**data)
                for yr, data in r["year_eligibility"].items()
            },
        )
        for r in raw
    ]
    return SearchResponse(
        results=results,
        total=len(results),
        rank_used=req.rank,
        category=req.category,
    )


@router.get("/metadata", response_model=MetadataResponse)
def metadata(db: Session = Depends(get_db)):
    years = sorted(
        [r[0] for r in db.query(distinct(ORCRRecord.year)).all()], reverse=True
    )
    max_rounds = {}
    for yr in years:
        mx = db.query(func.max(ORCRRecord.round)).filter(ORCRRecord.year == yr).scalar()
        max_rounds[str(yr)] = mx or 0

    inst_types = sorted(
        [r[0] for r in db.query(distinct(ORCRRecord.institute_type)).all()]
    )
    return MetadataResponse(
        years=years,
        max_rounds=max_rounds,
        institute_types=inst_types,
        categories=["General", "EWS", "OBC-NCL", "SC", "ST"],
        states=INDIAN_STATES,
    )


class ShareRequest(BaseModel):
    url: str
    rank: int
    category: str
    gender: str
    home_state: str


@router.post("/share")
def log_share(req: ShareRequest, db: Session = Depends(get_db)):
    params_hash = hashlib.sha256(req.url.encode()).hexdigest()[:16]
    existing = db.query(ShareLog).filter(ShareLog.params_hash == params_hash).first()
    if existing:
        existing.share_count += 1
        existing.shared_at = datetime.now(timezone.utc)
        db.commit()
        return {"shared": True, "total_shares": existing.share_count}

    log = ShareLog(
        params_hash=params_hash,
        rank=req.rank,
        category=req.category,
        gender=req.gender,
        home_state=req.home_state,
        shared_at=datetime.now(timezone.utc),
        share_count=1,
    )
    db.add(log)
    db.commit()
    return {"shared": True, "total_shares": 1}


@router.get("/share/stats")
def share_stats(db: Session = Depends(get_db)):
    total = db.query(func.sum(ShareLog.share_count)).scalar() or 0
    unique = db.query(func.count(ShareLog.id)).scalar() or 0
    return {"total_shares": total, "unique_searches_shared": unique}


@router.get("/details")
def details(
    institute: str,
    program: str,
    seat_type: str,
    gender: str,
    quota: str | None = None,
    db: Session = Depends(get_db),
):
    """Return closing ranks for all rounds/years for a specific institute+program+seat_type+gender+quota."""
    query = (
        db.query(ORCRRecord)
        .filter(
            ORCRRecord.institute == institute,
            ORCRRecord.program == program,
            ORCRRecord.seat_type == seat_type,
            ORCRRecord.gender == gender,
            ORCRRecord.is_preparatory == False,  # noqa: E712
        )
    )
    if quota:
        query = query.filter(ORCRRecord.quota == quota)
    records = query.order_by(ORCRRecord.year, ORCRRecord.round).all()
    # Build a dict: { round_no: { year: { opening_rank, closing_rank } } }
    rounds_data: dict[int, dict[int, dict]] = {}
    years_set: set[int] = set()
    for rec in records:
        years_set.add(rec.year)
        if rec.round not in rounds_data:
            rounds_data[rec.round] = {}
        rounds_data[rec.round][rec.year] = {
            "opening_rank": rec.opening_rank,
            "closing_rank": rec.closing_rank,
        }
    return {
        "institute": institute,
        "program": program,
        "seat_type": seat_type,
        "gender": gender,
        "years": sorted(years_set),
        "rounds": {
            r: {str(y): data for y, data in year_map.items()}
            for r, year_map in sorted(rounds_data.items())
        },
    }


@router.get("/institutes")
def institutes(db: Session = Depends(get_db)):
    rows = (
        db.query(ORCRRecord.institute, ORCRRecord.institute_type)
        .distinct()
        .order_by(ORCRRecord.institute)
        .all()
    )
    return [{"name": r[0], "type": r[1]} for r in rows]


@router.get("/programs")
def programs(
    institute_types: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(distinct(ORCRRecord.program))
    if institute_types:
        types = [t.strip() for t in institute_types.split(",") if t.strip()]
        if types:
            q = q.filter(ORCRRecord.institute_type.in_(types))
    rows = q.order_by(ORCRRecord.program).all()
    return [r[0] for r in rows]


@router.get("/sentiment")
def sentiment(
    institute: str,
    program: str | None = None,
    db: Session = Depends(get_db),
):
    """Return categorized sentiment data for a college (and optionally a program)."""
    query = db.query(CollegeSentiment).filter(CollegeSentiment.institute == institute)
    if program:
        query = query.filter(CollegeSentiment.program == program)
    else:
        query = query.filter(CollegeSentiment.program.is_(None))

    rows = query.all()

    if not rows and program:
        # Fallback: try college-level sentiment (program=None)
        rows = (
            db.query(CollegeSentiment)
            .filter(CollegeSentiment.institute == institute, CollegeSentiment.program.is_(None))
            .all()
        )

    if not rows:
        return {"available": False, "categories": []}

    categories = []
    for row in rows:
        categories.append({
            "category": row.category,
            "sentiment": row.sentiment,
            "score": row.score,
            "snippet": row.snippet,
            "post_count": row.post_count,
            "analyzed_at": row.analyzed_at.isoformat() if row.analyzed_at else None,
        })

    return {
        "available": True,
        "institute": institute,
        "program": program,
        "categories": categories,
    }
