"""Core search and scoring logic for college recommendations."""

from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models.database import ORCRRecord

CATEGORY_TO_SEAT_TYPE = {
    "General": ["OPEN"],
    "EWS": ["GEN-EWS", "EWS"],
    "OBC-NCL": ["OBC-NCL"],
    "SC": ["SC"],
    "ST": ["ST"],
}

PWD_SEAT_TYPES = {
    "General": ["OPEN (PwD)"],
    "EWS": ["GEN-EWS (PwD)", "EWS (PwD)", "GEN-EWS-PwD"],
    "OBC-NCL": ["OBC-NCL (PwD)", "OBC-NCL-PwD"],
    "SC": ["SC (PwD)", "SC-PwD"],
    "ST": ["ST (PwD)", "ST-PwD"],
}

RECENT_YEARS = {2023, 2024, 2025}
RECENT_WEIGHT = 2.0
OLD_WEIGHT = 1.0

# Maps institutes with HS/OS quotas to their home state.
INSTITUTE_STATE_MAP = {
    # --- NITs ---
    "National Institute of Technology Agartala": "Tripura",
    "National Institute of Technology Calicut": "Kerala",
    "National Institute of Technology Delhi": "Delhi",
    "National Institute of Technology Durgapur": "West Bengal",
    "National Institute of Technology Goa": "Goa",
    "National Institute of Technology Hamirpur": "Himachal Pradesh",
    "National Institute of Technology Jamshedpur": "Jharkhand",
    "National Institute of Technology Karnataka, Surathkal": "Karnataka",
    "National Institute of Technology Kurukshetra": "Haryana",
    "National Institute of Technology Manipur": "Manipur",
    "National Institute of Technology Meghalaya": "Meghalaya",
    "National Institute of Technology Mizoram": "Mizoram",
    "National Institute of Technology Nagaland": "Nagaland",
    "National Institute of Technology Patna": "Bihar",
    "National Institute of Technology Puducherry": "Puducherry",
    "National Institute of Technology Raipur": "Chhattisgarh",
    "National Institute of Technology Rourkela": "Odisha",
    "National Institute of Technology Sikkim": "Sikkim",
    "National Institute of Technology Silchar": "Assam",
    "National Institute of Technology Srinagar": "Jammu and Kashmir",
    "National Institute of Technology Tiruchirappalli": "Tamil Nadu",
    "National Institute of Technology Uttarakhand": "Uttarakhand",
    "National Institute of Technology Warangal": "Telangana",
    "National Institute of Technology, Andhra Pradesh": "Andhra Pradesh",
    "National Institute of Technology Arunachal Pradesh": "Arunachal Pradesh",
    "Dr. B R Ambedkar National Institute of Technology, Jalandhar": "Punjab",
    "Malaviya National Institute of Technology Jaipur": "Rajasthan",
    "Maulana Azad National Institute of Technology Bhopal": "Madhya Pradesh",
    "Motilal Nehru National Institute of Technology Allahabad": "Uttar Pradesh",
    "Sardar Vallabhbhai National Institute of Technology, Surat": "Gujarat",
    "Visvesvaraya National Institute of Technology, Nagpur": "Maharashtra",
    "Indian Institute of Engineering Science and Technology, Shibpur": "West Bengal",
    # --- GFTIs with HS/OS quotas ---
    "Assam University, Silchar": "Assam",
    "Birla Institute of Technology, Deoghar Off-Campus": "Jharkhand",
    "Birla Institute of Technology, Mesra,  Ranchi": "Jharkhand",
    "Birla Institute of Technology, Patna Off-Campus": "Bihar",
    "Ghani Khan Choudhary Institute of Engineering and Technology, Malda, West Bengal": "West Bengal",
    "Institute of Chemical Technology, Mumbai: Indian Oil Odisha Campus, Bhubaneswar": "Odisha",
    "Islamic University of Science and Technology Kashmir": "Jammu and Kashmir",
    "Pondicherry Engineering College, Puducherry": "Puducherry",
    "Puducherry Technological University, Puducherry": "Puducherry",
    "Punjab Engineering College, Chandigarh": "Punjab",
}
# Backward compat alias
NIT_STATE_MAP = INSTITUTE_STATE_MAP


def _normalize_name(name: str) -> str:
    import re
    return re.sub(r"\s+", " ", name.strip())


# Build a secondary lookup that strips commas and normalizes whitespace
_INST_STATE_MAP_NORMALIZED: dict[str, str] = {}
for _k, _v in INSTITUTE_STATE_MAP.items():
    import re as _re
    _norm = _re.sub(r"\s+", " ", _k.replace(",", "").strip())
    _INST_STATE_MAP_NORMALIZED[_norm] = _v


def _lookup_nit_state(institute: str) -> str | None:
    normalized = _normalize_name(institute)
    state = INSTITUTE_STATE_MAP.get(normalized) or INSTITUTE_STATE_MAP.get(institute)
    if state:
        return state
    import re
    stripped = re.sub(r"\s+", " ", normalized.replace(",", "").strip())
    return _INST_STATE_MAP_NORMALIZED.get(stripped)


def _resolve_quota(institute: str, institute_type: str, home_state: str) -> list[str]:
    """Decide which quota rows to use based on institute and user's home state."""
    if institute_type == "IIT":
        return ["AI"]

    nit_state = _lookup_nit_state(institute)
    if nit_state:
        if nit_state.lower() == home_state.lower():
            return ["HS", "OS", "AI"]
        return ["OS", "AI"]

    if institute_type == "NIT":
        return ["OS", "AI"]

    # For IIITs / GFTIs, include all quota types
    return ["AI", "HS", "OS", "GO", "JK", "LA"]


def search_colleges(
    db: Session,
    rank: int,
    category: str,
    gender: str,
    home_state: str,
    pwd: bool = False,
    institute_types: list[str] | None = None,
    program_query: str | None = None,
    round_no: int | None = None,
    years: list[int] | None = None,
    crl_rank: int | None = None,
) -> list[dict]:
    seat_types = list(CATEGORY_TO_SEAT_TYPE.get(category, ["OPEN"]))
    if pwd:
        seat_types.extend(PWD_SEAT_TYPES.get(category, []))

    # Non-General students can also compete for OPEN seats using their CRL rank
    include_open = category != "General" and crl_rank is not None
    if include_open:
        if "OPEN" not in seat_types:
            seat_types.append("OPEN")
        if pwd and "OPEN (PwD)" not in seat_types:
            seat_types.append("OPEN (PwD)")

    gender_filter = ["Gender-Neutral"]
    if gender.lower() == "female":
        gender_filter.append("Female-only(including Supernumerary)")
        gender_filter.append("Female-only (including Supernumerary)")

    # Determine max round per year if no specific round requested
    year_query = db.query(ORCRRecord.year, func.max(ORCRRecord.round)).group_by(ORCRRecord.year)
    if years:
        year_query = year_query.filter(ORCRRecord.year.in_(years))

    if round_no is None:
        max_rounds = dict(year_query.all())
    else:
        all_years = [r[0] for r in year_query.all()]
        max_rounds = {y: round_no for y in all_years}

    all_years_sorted = sorted(max_rounds.keys())

    query = db.query(ORCRRecord).filter(
        ORCRRecord.seat_type.in_(seat_types),
        ORCRRecord.gender.in_(gender_filter),
        ORCRRecord.is_preparatory == False,  # noqa: E712
    )
    if institute_types:
        query = query.filter(ORCRRecord.institute_type.in_(institute_types))
    if program_query:
        query = query.filter(ORCRRecord.program.ilike(f"%{program_query}%"))

    # Only fetch rows for the chosen round of each year
    round_conditions = []
    for y, r in max_rounds.items():
        round_conditions.append(
            (ORCRRecord.year == y) & (ORCRRecord.round == r)
        )
    if round_conditions:
        from sqlalchemy import or_
        query = query.filter(or_(*round_conditions))

    records = query.all()

    # Group by (institute, program, seat_type, gender) across years
    grouped: dict[tuple, dict[int, ORCRRecord]] = defaultdict(dict)
    for rec in records:
        key = (rec.institute, rec.program, rec.institute_type, rec.seat_type, rec.gender)
        grouped[key][rec.year] = rec

    results = []
    for (institute, program, inst_type, seat_type, gen), year_data in grouped.items():
        valid_quotas = _resolve_quota(institute, inst_type, home_state)

        # Filter records by valid quotas
        filtered_years: dict[int, ORCRRecord] = {}
        for yr, rec in year_data.items():
            if rec.quota in valid_quotas:
                filtered_years[yr] = rec

        if not filtered_years:
            continue

        total_weight = 0.0
        score = 0.0
        year_eligibility = {}

        # Use CRL rank for OPEN seats, category rank for category seats
        is_open_seat = seat_type == "OPEN" or seat_type == "OPEN (PwD)"
        effective_rank = crl_rank if (include_open and is_open_seat) else rank

        for yr in all_years_sorted:
            w = RECENT_WEIGHT if yr in RECENT_YEARS else OLD_WEIGHT
            total_weight += w
            rec = filtered_years.get(yr)
            if rec and rec.closing_rank is not None:
                eligible = effective_rank <= rec.closing_rank
                year_eligibility[str(yr)] = {
                    "eligible": eligible,
                    "closing_rank": rec.closing_rank,
                    "round": rec.round,
                }
                if eligible:
                    score += w
            else:
                year_eligibility[str(yr)] = {
                    "eligible": False,
                    "closing_rank": None,
                    "round": max_rounds.get(yr, 0),
                }

        confidence = score / total_weight if total_weight > 0 else 0

        if confidence == 0:
            continue

        latest_year = max(filtered_years.keys())
        latest_rec = filtered_years[latest_year]

        results.append(
            {
                "institute": institute,
                "institute_type": inst_type,
                "program": program,
                "quota": latest_rec.quota,
                "seat_type": seat_type,
                "gender": gen,
                "confidence_score": round(confidence, 3),
                "latest_closing_rank": latest_rec.closing_rank,
                "year_eligibility": year_eligibility,
            }
        )

    results.sort(key=lambda r: (-r["confidence_score"], r["latest_closing_rank"] or 999999))
    return results
