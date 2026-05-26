"""Verify 2025 data in our DB against the user's downloaded CSV rank lists.

Two modes:

1. Default (record-level): for each round CSV, compares (institute, program,
   quota, seat_type, gender) rows against our `orcr_records` table and reports
   mismatches in opening / closing rank or missing rows on either side.

2. --mode=pivot: builds the same per-(institute, program, seat_type, gender)
   pivot the UI Table view and the Excel choice list use (HS / OS / AI columns
   side-by-side, populated from the LAST round of 2025), and compares it
   against the same pivot built from the Round-6 CSV. Verifies that the
   end-to-end transformation the UI/Excel rely on is faithful to ground truth.

Usage:
    python scripts/verify_2025_csv.py                       # record-level, AI quota
    python scripts/verify_2025_csv.py --quotas ALL          # record-level, all quotas
    python scripts/verify_2025_csv.py --mode pivot          # pivot-level check

Run from the repo root with the backend venv activated, or from anywhere with
DATABASE_URL pointing at josaa.db.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import defaultdict
from pathlib import Path

# Make `app.*` importable when run from the repo root
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.models.database import SessionLocal, ORCRRecord  # noqa: E402
from sqlalchemy import func  # noqa: E402

DOWNLOADS = Path.home() / "Downloads"
CSV_TEMPLATE = "JoSSA 2025 - Rank List - Round {round}.csv"
LAST_ROUND = 6


def normalize(s: str) -> str:
    return " ".join((s or "").split())


def parse_int(v: str) -> int | None:
    if v is None:
        return None
    s = v.strip()
    if not s or s == "-":
        return None
    digits = "".join(c for c in s if c.isdigit())
    return int(digits) if digits else None


def load_csv(path: Path, quotas: set[str]) -> dict[tuple, tuple[int | None, int | None]]:
    rows: dict[tuple, tuple[int | None, int | None]] = {}
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            quota = (r["Quota"] or "").strip()
            if quotas and quota not in quotas:
                continue
            seat_type = (r["Seat Type"] or "").strip()
            gender = (r["Gender"] or "").strip()
            if seat_type != "OPEN":
                continue
            if gender != "Gender-Neutral":
                continue
            inst = normalize(r["Institute"])
            prog = normalize(r["Academic Program Name"])
            key = (inst, prog, quota, seat_type, gender)
            rows[key] = (parse_int(r.get("Opening Rank")), parse_int(r.get("Closing Rank")))
    return rows


def load_db(round_no: int, quotas: set[str]) -> dict[tuple, tuple[int | None, int | None]]:
    out: dict[tuple, tuple[int | None, int | None]] = {}
    with SessionLocal() as db:
        q = db.query(ORCRRecord).filter(
            ORCRRecord.year == 2025,
            ORCRRecord.round == round_no,
            ORCRRecord.seat_type == "OPEN",
            ORCRRecord.gender == "Gender-Neutral",
            ORCRRecord.is_preparatory == False,  # noqa: E712
        )
        if quotas:
            q = q.filter(ORCRRecord.quota.in_(list(quotas)))
        for rec in q.all():
            key = (
                normalize(rec.institute),
                normalize(rec.program),
                rec.quota,
                rec.seat_type,
                rec.gender,
            )
            out[key] = (rec.opening_rank, rec.closing_rank)
    return out


def verify_round(round_no: int, quotas: set[str], verbose: bool) -> dict:
    csv_path = DOWNLOADS / CSV_TEMPLATE.format(round=round_no)
    if not csv_path.exists():
        return {"round": round_no, "status": "csv_missing", "path": str(csv_path)}

    csv_rows = load_csv(csv_path, quotas)
    db_rows = load_db(round_no, quotas)

    csv_keys = set(csv_rows)
    db_keys = set(db_rows)

    missing_in_db = csv_keys - db_keys
    extra_in_db = db_keys - csv_keys

    rank_mismatches: list[tuple] = []
    for k in csv_keys & db_keys:
        c = csv_rows[k]
        d = db_rows[k]
        if c != d:
            rank_mismatches.append((k, c, d))

    summary = {
        "round": round_no,
        "csv_rows": len(csv_rows),
        "db_rows": len(db_rows),
        "missing_in_db": len(missing_in_db),
        "extra_in_db": len(extra_in_db),
        "rank_mismatches": len(rank_mismatches),
    }

    if verbose:
        if missing_in_db:
            print(f"  -- rows in CSV not in DB ({len(missing_in_db)}):")
            for k in sorted(missing_in_db)[:10]:
                print(f"     {k}")
            if len(missing_in_db) > 10:
                print(f"     ... +{len(missing_in_db) - 10} more")
        if extra_in_db:
            print(f"  -- rows in DB not in CSV ({len(extra_in_db)}):")
            for k in sorted(extra_in_db)[:10]:
                print(f"     {k}")
            if len(extra_in_db) > 10:
                print(f"     ... +{len(extra_in_db) - 10} more")
        if rank_mismatches:
            print(f"  -- rank mismatches ({len(rank_mismatches)}):")
            for k, c, d in rank_mismatches[:10]:
                inst, prog, quota, *_ = k
                short_prog = prog[:55] + ("..." if len(prog) > 55 else "")
                print(
                    f"     {inst[:50]:50s} | {short_prog:60s} | {quota:3s} | "
                    f"csv O/C={c[0]}/{c[1]:>6}  db O/C={d[0]}/{d[1]:>6}"
                )
            if len(rank_mismatches) > 10:
                print(f"     ... +{len(rank_mismatches) - 10} more")
    return summary


# ---------------------------------------------------------------------------
# Pivot-level verification: replicates the same shape used by the UI Table
# view and the Excel choice list, then compares it against the ground-truth
# pivot built from the Round-6 CSV.
# ---------------------------------------------------------------------------

PivotKey = tuple[str, str, str, str]  # (institute, program, seat_type, gender)
PivotVal = tuple[int | None, int | None, int | None]  # (HS, OS, AI) closing ranks


def build_csv_pivot(round_no: int) -> dict[PivotKey, PivotVal]:
    path = DOWNLOADS / CSV_TEMPLATE.format(round=round_no)
    if not path.exists():
        raise FileNotFoundError(path)

    by_key: dict[PivotKey, dict[str, int | None]] = defaultdict(dict)
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            seat_type = (r["Seat Type"] or "").strip()
            gender = (r["Gender"] or "").strip()
            quota = (r["Quota"] or "").strip()
            if seat_type != "OPEN" or gender != "Gender-Neutral":
                continue
            if quota not in ("HS", "OS", "AI"):
                continue
            inst = normalize(r["Institute"])
            prog = normalize(r["Academic Program Name"])
            by_key[(inst, prog, seat_type, gender)][quota] = parse_int(r.get("Closing Rank"))

    return {k: (v.get("HS"), v.get("OS"), v.get("AI")) for k, v in by_key.items()}


def build_db_pivot() -> dict[PivotKey, PivotVal]:
    """Replicate the JS `pivotResults` logic: hs/os/ai_2025 = closing rank in
    the last round of 2025 for each quota at the same (institute, program,
    seat_type, gender)."""
    by_key: dict[PivotKey, dict[str, int | None]] = defaultdict(dict)
    with SessionLocal() as db:
        # max round per (inst, prog, quota, seat_type, gender) for year 2025
        max_round_rows = (
            db.query(
                ORCRRecord.institute,
                ORCRRecord.program,
                ORCRRecord.quota,
                ORCRRecord.seat_type,
                ORCRRecord.gender,
                func.max(ORCRRecord.round).label("mx"),
            )
            .filter(
                ORCRRecord.year == 2025,
                ORCRRecord.seat_type == "OPEN",
                ORCRRecord.gender == "Gender-Neutral",
                ORCRRecord.quota.in_(["HS", "OS", "AI"]),
                ORCRRecord.is_preparatory == False,  # noqa: E712
            )
            .group_by(
                ORCRRecord.institute,
                ORCRRecord.program,
                ORCRRecord.quota,
                ORCRRecord.seat_type,
                ORCRRecord.gender,
            )
            .all()
        )

        wanted_keys = {
            (r.institute, r.program, r.quota, r.seat_type, r.gender, r.mx)
            for r in max_round_rows
        }

        # Now fetch the actual closing rank for each
        recs = (
            db.query(ORCRRecord)
            .filter(
                ORCRRecord.year == 2025,
                ORCRRecord.seat_type == "OPEN",
                ORCRRecord.gender == "Gender-Neutral",
                ORCRRecord.quota.in_(["HS", "OS", "AI"]),
                ORCRRecord.is_preparatory == False,  # noqa: E712
            )
            .all()
        )
        for rec in recs:
            key = (
                rec.institute,
                rec.program,
                rec.quota,
                rec.seat_type,
                rec.gender,
                rec.round,
            )
            if key not in wanted_keys:
                continue
            by_key[(normalize(rec.institute), normalize(rec.program), rec.seat_type, rec.gender)][
                rec.quota
            ] = rec.closing_rank

    return {k: (v.get("HS"), v.get("OS"), v.get("AI")) for k, v in by_key.items()}


def verify_pivot(verbose: bool) -> None:
    print("Pivot-level verification (same shape as UI Table view + Excel)")
    print(f"Ground truth: Round-{LAST_ROUND} CSV (last published round of 2025)")
    print("Scope: seat_type=OPEN, gender=Gender-Neutral, quotas=HS/OS/AI")
    print("-" * 80)

    csv_pivot = build_csv_pivot(LAST_ROUND)
    db_pivot = build_db_pivot()

    csv_keys = set(csv_pivot)
    db_keys = set(db_pivot)

    missing_in_db = csv_keys - db_keys
    extra_in_db = db_keys - csv_keys

    cell_mismatches: list[tuple[PivotKey, str, int | None, int | None]] = []
    for k in csv_keys & db_keys:
        c_hs, c_os, c_ai = csv_pivot[k]
        d_hs, d_os, d_ai = db_pivot[k]
        for label, c, d in (("HS", c_hs, d_hs), ("OS", c_os, d_os), ("AI", c_ai, d_ai)):
            if c != d:
                cell_mismatches.append((k, label, c, d))

    print(f"csv_rows={len(csv_pivot):>5}  db_rows={len(db_pivot):>5}  "
          f"missing_in_db={len(missing_in_db):>4}  extra_in_db={len(extra_in_db):>4}  "
          f"cell_mismatches={len(cell_mismatches):>4}")

    if verbose:
        if missing_in_db:
            print("\n-- pivot rows in CSV not in DB:")
            for k in sorted(missing_in_db)[:10]:
                print(f"   {k}")
            if len(missing_in_db) > 10:
                print(f"   ... +{len(missing_in_db) - 10} more")
        if extra_in_db:
            print("\n-- pivot rows in DB not in CSV:")
            for k in sorted(extra_in_db)[:10]:
                print(f"   {k}")
            if len(extra_in_db) > 10:
                print(f"   ... +{len(extra_in_db) - 10} more")
        if cell_mismatches:
            print("\n-- per-quota cell mismatches:")
            for (inst, prog, st, _gen), col, c, d in cell_mismatches[:15]:
                short_prog = prog[:50] + ("..." if len(prog) > 50 else "")
                print(
                    f"   {inst[:45]:45s} | {short_prog:53s} | {col} | "
                    f"csv={c}  db={d}"
                )
            if len(cell_mismatches) > 15:
                print(f"   ... +{len(cell_mismatches) - 15} more")

    print("-" * 80)
    if not (missing_in_db or extra_in_db or cell_mismatches):
        print("PIVOT MATCHES CSV EXACTLY.")
    else:
        print("Pivot diverges from CSV — see details above.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--mode",
        choices=("records", "pivot"),
        default="records",
        help="records: per-row record check (default). pivot: end-to-end pivot check.",
    )
    ap.add_argument(
        "--quotas",
        default="AI",
        help="Records mode only. Comma-separated quotas (default AI). Use ALL for every quota.",
    )
    ap.add_argument("--rounds", default="1,2,3,4,5,6", help="Records mode only.")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    if args.mode == "pivot":
        verify_pivot(verbose=not args.quiet)
        return

    if args.quotas.upper() == "ALL":
        quotas: set[str] = set()
    else:
        quotas = {q.strip() for q in args.quotas.split(",") if q.strip()}

    rounds = [int(r) for r in args.rounds.split(",")]
    print(f"Comparing OPEN / Gender-Neutral / quotas={quotas or 'ALL'} for 2025 rounds {rounds}")
    print(f"CSV dir: {DOWNLOADS}")
    print("-" * 80)

    grand_csv = grand_db = grand_missing = grand_extra = grand_diff = 0
    for r in rounds:
        print(f"\nRound {r}:")
        s = verify_round(r, quotas, verbose=not args.quiet)
        if s.get("status") == "csv_missing":
            print(f"  CSV not found: {s['path']}")
            continue
        print(
            f"  csv_rows={s['csv_rows']:>5}  db_rows={s['db_rows']:>5}  "
            f"missing_in_db={s['missing_in_db']:>4}  extra_in_db={s['extra_in_db']:>4}  "
            f"rank_mismatches={s['rank_mismatches']:>4}"
        )
        grand_csv += s["csv_rows"]
        grand_db += s["db_rows"]
        grand_missing += s["missing_in_db"]
        grand_extra += s["extra_in_db"]
        grand_diff += s["rank_mismatches"]

    print("-" * 80)
    print(
        f"TOTAL: csv={grand_csv} db={grand_db} "
        f"missing_in_db={grand_missing} extra_in_db={grand_extra} "
        f"rank_mismatches={grand_diff}"
    )


if __name__ == "__main__":
    main()
