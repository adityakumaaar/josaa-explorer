"""Core search and scoring logic for college recommendations."""

from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models.database import ORCRRecord
from ..models.institute_states import INSTITUTE_STATE_MAP

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

# Confidence is computed from 2025 data only. Earlier years are still
# attached to each result as `year_eligibility` for reference/display.
PRIMARY_YEAR = 2025

# Round-based scoring: earlier round eligibility = higher sub-score
# If eligible in Round 1 → 1.0, Round 2 → 0.9, ..., Round 6 → 0.5
# If not eligible even in last round → 0.0
ROUND_SCORE = {1: 1.0, 2: 0.9, 3: 0.8, 4: 0.7, 5: 0.6, 6: 0.5, 7: 0.4}

# Alias used by quota resolution
NIT_STATE_MAP = INSTITUTE_STATE_MAP


def _resolve_quota(institute: str, institute_type: str, home_state: str, inst_state: str | None = None) -> list[str]:
    """Decide which quota rows to use based on institute and user's home state."""
    if institute_type == "IIT":
        return ["AI"]

    nit_state = inst_state or INSTITUTE_STATE_MAP.get(institute)
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
    branch_keywords: list[str] | None = None,
    college_states: list[str] | None = None,
    round_no: int | None = None,
    years: list[int] | None = None,
    crl_rank: int | None = None,
    min_rank: int | None = None,
    max_rank: int | None = None,
) -> list[dict]:
    seat_types = list(CATEGORY_TO_SEAT_TYPE.get(category, ["OPEN"]))
    if pwd:
        seat_types.extend(PWD_SEAT_TYPES.get(category, []))

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

    # Determine available years
    year_query = db.query(ORCRRecord.year, func.max(ORCRRecord.round)).group_by(ORCRRecord.year)
    if years:
        year_query = year_query.filter(ORCRRecord.year.in_(years))
    max_rounds = dict(year_query.all())
    all_years_sorted = sorted(max_rounds.keys())

    # Closing-rank filter: explicit window if provided, else implicit
    # "must be >= my rank" (i.e. user can plausibly qualify).
    base_filters = [
        ORCRRecord.seat_type.in_(seat_types),
        ORCRRecord.gender.in_(gender_filter),
        ORCRRecord.is_preparatory == False,  # noqa: E712
    ]
    if min_rank is not None or max_rank is not None:
        if min_rank is not None:
            base_filters.append(ORCRRecord.closing_rank >= min_rank)
        if max_rank is not None:
            base_filters.append(ORCRRecord.closing_rank <= max_rank)
    else:
        implicit_floor = min(rank, crl_rank) if crl_rank else rank
        base_filters.append(ORCRRecord.closing_rank >= implicit_floor)

    query = db.query(ORCRRecord).filter(*base_filters)
    if institute_types:
        query = query.filter(ORCRRecord.institute_type.in_(institute_types))
    if program_query:
        query = query.filter(ORCRRecord.program.ilike(f"%{program_query}%"))
    if branch_keywords:
        from sqlalchemy import or_
        kw_conditions = [ORCRRecord.program.ilike(f"%{kw}%") for kw in branch_keywords]
        query = query.filter(or_(*kw_conditions))
    if college_states:
        query = query.filter(ORCRRecord.state.in_(college_states))
    if years:
        query = query.filter(ORCRRecord.year.in_(years))

    # If user specified a specific round, only fetch up to that round
    if round_no is not None:
        query = query.filter(ORCRRecord.round <= round_no)

    records = query.all()

    # Group by (institute, program, seat_type, gender, state, quota) → year → list of rounds
    grouped: dict[tuple, dict[int, list[ORCRRecord]]] = defaultdict(lambda: defaultdict(list))
    for rec in records:
        key = (rec.institute, rec.program, rec.institute_type, rec.seat_type, rec.gender, rec.state, rec.quota)
        grouped[key][rec.year].append(rec)

    results = []
    for (institute, program, inst_type, seat_type, gen, inst_state, quota), year_data in grouped.items():
        valid_quotas = _resolve_quota(institute, inst_type, home_state, inst_state)

        # Skip this quota if it's not valid for the user
        if quota not in valid_quotas:
            continue

        filtered_years = year_data

        is_open_seat = seat_type == "OPEN" or seat_type == "OPEN (PwD)"
        effective_rank = crl_rank if (include_open and is_open_seat) else rank

        # Build year_eligibility for ALL years (display/reference only).
        year_eligibility: dict[str, dict] = {}
        for yr in all_years_sorted:
            recs = filtered_years.get(yr, [])
            if not recs:
                year_eligibility[str(yr)] = {
                    "eligible": False,
                    "closing_rank": None,
                    "round": max_rounds.get(yr, 0),
                    "earliest_round": None,
                }
                continue

            recs_sorted = sorted(recs, key=lambda r: r.round)
            last_round_rec = recs_sorted[-1]
            eligible_in_last = (
                last_round_rec.closing_rank is not None
                and effective_rank <= last_round_rec.closing_rank
            )
            earliest_eligible_round = None
            for rec in recs_sorted:
                if rec.closing_rank is not None and effective_rank <= rec.closing_rank:
                    earliest_eligible_round = rec.round
                    break

            year_eligibility[str(yr)] = {
                "eligible": eligible_in_last,
                "closing_rank": last_round_rec.closing_rank,
                "round": last_round_rec.round,
                "earliest_round": earliest_eligible_round,
            }

        # Confidence is computed exclusively from PRIMARY_YEAR (2025).
        # If 2025 data is missing for this (college, program, quota),
        # confidence is 0 and `has_2025` is False, but the row is still
        # emitted so the UI/Excel can show prior-year reference data.
        primary = year_eligibility.get(str(PRIMARY_YEAR), {})
        has_primary = filtered_years.get(PRIMARY_YEAR) is not None and bool(filtered_years.get(PRIMARY_YEAR))
        if has_primary:
            earliest_round = primary.get("earliest_round")
            if earliest_round is not None:
                confidence = ROUND_SCORE.get(earliest_round, 0.4)
            else:
                confidence = 0.0
        else:
            confidence = 0.0

        # Note: SQL-level filters (closing_rank >= rank, or the rank window
        # if provided) already drop records the user can't or doesn't want
        # to see. Anything that survives to here is intentionally returned —
        # including rows where the user is ineligible in 2025 (a reach pick
        # surfaced via the rank window) or where 2025 data is absent (kept
        # so the UI/Excel can show prior-year reference data).

        # Use the last round of the latest year with data for display values
        latest_year = max(filtered_years.keys())
        latest_recs = sorted(filtered_years[latest_year], key=lambda r: r.round)
        latest_rec = latest_recs[-1]

        results.append(
            {
                "institute": institute,
                "institute_type": inst_type,
                "state": inst_state,
                "program": program,
                "quota": quota,
                "seat_type": seat_type,
                "gender": gen,
                "confidence_score": round(confidence, 3),
                "has_2025": has_primary,
                "latest_opening_rank": latest_rec.opening_rank,
                "latest_closing_rank": latest_rec.closing_rank,
                "year_eligibility": year_eligibility,
            }
        )

    results.sort(key=lambda r: (-r["confidence_score"], r["latest_closing_rank"] or 999999))
    return results
