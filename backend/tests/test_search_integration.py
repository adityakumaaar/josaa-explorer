"""Integration tests for search logic, validated against real database data.

These tests are NOT testing our implementation assumptions — they test
EXPECTED OUTCOMES based on actual JoSAA counseling rules:

1. NITs have HS (Home State) and OS (Other State) quotas.
   - A student from the NIT's state should see HS results.
   - A student from a DIFFERENT state should NOT see HS results.
   - Both HS and OS should appear as SEPARATE results (not merged).

2. IITs have only AI (All India) quota.

3. Eligibility: rank <= closing_rank means eligible.

4. Round-based scoring: earlier round eligibility → higher confidence.

5. Gender: female students see supernumerary seats.

6. Category seat types map correctly (SC→SC, EWS→EWS, etc).

All ground-truth values are taken directly from the database.
If a test fails, it means the search logic diverged from JoSAA rules.
"""

import pytest
from app.services.search import search_colleges


# ---------------------------------------------------------------------------
# Helper to find results matching criteria
# ---------------------------------------------------------------------------

def find_results(results, institute_substr, program_substr=None, quota=None):
    """Find results matching institute (substring), optionally program and quota."""
    matches = []
    for r in results:
        if institute_substr not in r["institute"]:
            continue
        if program_substr and program_substr not in r["program"]:
            continue
        if quota and r["quota"] != quota:
            continue
        matches.append(r)
    return matches


# ===========================================================================
# TEST GROUP 1: Quota Resolution — HS/OS separation for NITs
# ===========================================================================

class TestNITQuotaSeparation:
    """
    Ground truth from DB:
    - NIT Silchar is in Assam (state column = 'Assam')
    - ECE program has HS closing rank ~40328 and OS closing rank ~18068 (2025 R6)
    - A student from Assam (home state match) should see the HS result separately.
    - This is the exact bug that was shipping before: HS and OS were merged.
    """

    def test_home_state_student_sees_hs_quota_for_nit(self, db):
        """Assam student should see HS quota for NIT Silchar (Assam).

        DB evidence: NIT Silchar ECE HS 2025 R6 closing = 40328.
        Rank 33157 < 40328 → eligible via HS.
        """
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Assam",
        )

        hs_results = find_results(
            results,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="HS",
        )

        assert len(hs_results) >= 1, (
            "NIT Silchar ECE should appear with HS quota for Assam student. "
            "DB shows HS closing rank 40328 in 2025 R6, rank 33157 is eligible."
        )
        assert hs_results[0]["latest_closing_rank"] == 40328

    def test_hs_and_os_are_separate_results(self, db):
        """HS and OS quotas must appear as SEPARATE result entries.

        A rank of 15000 is eligible for BOTH HS (closing 40328) and OS (closing 18068).
        Both should appear independently.
        """
        results = search_colleges(
            db=db, rank=15000, category="General",
            gender="Male", home_state="Assam",
        )

        hs = find_results(
            results,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="HS",
        )
        os = find_results(
            results,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="OS",
        )

        assert len(hs) >= 1, (
            "HS quota result missing. HS and OS must be separate entries."
        )
        assert len(os) >= 1, (
            "OS quota result missing. HS and OS must be separate entries."
        )
        assert hs[0]["latest_closing_rank"] != os[0]["latest_closing_rank"], (
            "HS and OS should have different closing ranks "
            f"(HS={hs[0]['latest_closing_rank']}, OS={os[0]['latest_closing_rank']})"
        )

    def test_out_of_state_student_does_not_see_hs(self, db):
        """Maharashtra student should NOT see HS quota for NIT Warangal (Telangana).

        DB evidence: NIT Warangal state = 'Telangana'.
        Maharashtra ≠ Telangana → no HS access.
        """
        results = search_colleges(
            db=db, rank=15000, category="General",
            gender="Male", home_state="Maharashtra",
        )

        hs_results = find_results(
            results,
            "National Institute of Technology, Warangal",
            quota="HS",
        )

        assert len(hs_results) == 0, (
            "Maharashtra student should NOT see HS quota for NIT Warangal (Telangana). "
            "HS is only for students from the institute's home state."
        )

    def test_out_of_state_student_sees_os(self, db):
        """Maharashtra student should see OS quota for NIT Warangal (Telangana).

        DB evidence: NIT Warangal CSE OS 2025 R6 closing = 2409.
        Rank 2000 < 2409 → eligible.
        """
        results = search_colleges(
            db=db, rank=2000, category="General",
            gender="Male", home_state="Maharashtra",
        )

        os_results = find_results(
            results,
            "National Institute of Technology, Warangal",
            "Computer Science and Engineering (4 Years",
            quota="OS",
        )

        assert len(os_results) >= 1, (
            "Maharashtra student should see OS quota for NIT Warangal. "
            "DB shows OS closing rank 2409 in 2025 R6."
        )

    def test_home_state_student_sees_both_hs_and_os_for_own_state_nit(self, db):
        """Telangana student should see BOTH HS and OS for NIT Warangal.

        DB evidence: NIT Warangal state = Telangana.
        Mechanical Eng: HS closing = 17643, OS closing = 14037 (2025 R6).
        Rank 10000 is eligible for both.
        """
        results = search_colleges(
            db=db, rank=10000, category="General",
            gender="Male", home_state="Telangana",
        )

        hs = find_results(
            results,
            "National Institute of Technology, Warangal",
            "Mechanical Engineering (4 Years",
            quota="HS",
        )
        os = find_results(
            results,
            "National Institute of Technology, Warangal",
            "Mechanical Engineering (4 Years",
            quota="OS",
        )

        assert len(hs) >= 1, (
            "Telangana student should see HS for NIT Warangal Mechanical. "
            "DB shows HS closing 17643."
        )
        assert len(os) >= 1, (
            "Telangana student should see OS for NIT Warangal Mechanical. "
            "DB shows OS closing 14037."
        )


# ===========================================================================
# TEST GROUP 2: IIT — Only AI Quota
# ===========================================================================

class TestIITQuota:
    """
    Ground truth from DB:
    - 'Indian Institute  of Technology Bombay' (note double space) is type 'IIT'
    - Only AI quota records exist for IITs.
    - IITs should NEVER show HS or OS regardless of home state.
    """

    def test_iit_only_shows_ai_quota(self, db):
        """IIT results should only have AI quota, never HS or OS.

        DB evidence: IIT Bombay CSE only has AI quota records.
        """
        results = search_colleges(
            db=db, rank=100, category="General",
            gender="Male", home_state="Maharashtra",
        )

        iit_results = find_results(results, "Indian Institute  of Technology Bombay")

        assert len(iit_results) > 0, "IIT Bombay should have results for rank 100"

        non_ai = [r for r in iit_results if r["quota"] != "AI"]
        assert len(non_ai) == 0, (
            f"IIT Bombay should only show AI quota, but found: "
            f"{[r['quota'] for r in non_ai]}"
        )

    def test_iit_home_state_irrelevant(self, db):
        """IIT results should be the same regardless of home state.

        IITs use only AI quota — no home state advantage exists.
        """
        results_mh = search_colleges(
            db=db, rank=500, category="General",
            gender="Male", home_state="Maharashtra",
        )
        results_tn = search_colleges(
            db=db, rank=500, category="General",
            gender="Male", home_state="Tamil Nadu",
        )

        iit_mh = find_results(results_mh, "Indian Institute  of Technology Bombay")
        iit_tn = find_results(results_tn, "Indian Institute  of Technology Bombay")

        assert len(iit_mh) == len(iit_tn), (
            "IIT results should be identical regardless of home state"
        )
        for r_mh, r_tn in zip(
            sorted(iit_mh, key=lambda r: r["program"]),
            sorted(iit_tn, key=lambda r: r["program"]),
        ):
            assert r_mh["program"] == r_tn["program"]
            assert r_mh["confidence_score"] == r_tn["confidence_score"]


# ===========================================================================
# TEST GROUP 3: Eligibility — Only shows results where rank qualifies
# ===========================================================================

class TestEligibility:
    """
    Ground truth:
    - NIT Warangal CSE OS 2025 R6 closing = 2409.
    - A rank of 3000 should NOT show this result (3000 > 2409).
    - A rank of 2000 SHOULD show this result (2000 < 2409).
    """

    def test_ineligible_rank_not_shown(self, db):
        """Rank above closing rank should not appear in results.

        DB: NIT Warangal CSE OS closing = 2409. Rank 5000 > 2409 in all years.
        With only 2025 data considered, this should be ineligible.
        """
        results = search_colleges(
            db=db, rank=5000, category="General",
            gender="Male", home_state="Maharashtra",
            years=[2025],
        )

        warangal_cse_os = find_results(
            results,
            "National Institute of Technology, Warangal",
            "Computer Science and Engineering (4 Years",
            quota="OS",
        )

        assert len(warangal_cse_os) == 0, (
            "Rank 5000 should NOT see NIT Warangal CSE OS (closing 2409 in 2025). "
            f"But found: closing={warangal_cse_os[0]['latest_closing_rank'] if warangal_cse_os else 'N/A'}"
        )

    def test_eligible_rank_is_shown(self, db):
        """Rank below closing rank should appear in results.

        DB: NIT Warangal CSE OS closing = 2409. Rank 2000 < 2409.
        """
        results = search_colleges(
            db=db, rank=2000, category="General",
            gender="Male", home_state="Maharashtra",
        )

        warangal_cse = find_results(
            results,
            "National Institute of Technology, Warangal",
            "Computer Science and Engineering (4 Years",
            quota="OS",
        )

        assert len(warangal_cse) >= 1, (
            "Rank 2000 should see NIT Warangal CSE OS (closing 2409 in 2025)"
        )

    def test_boundary_rank_is_eligible(self, db):
        """Rank exactly equal to closing rank should be eligible.

        DB: NIT Silchar ECE HS 2025 R6 closing = 40328.
        Rank 40328 <= 40328 → eligible.
        """
        results = search_colleges(
            db=db, rank=40328, category="General",
            gender="Male", home_state="Assam",
            years=[2025],
        )

        hs = find_results(
            results,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="HS",
        )

        assert len(hs) >= 1, (
            "Rank equal to closing rank (40328) should be eligible. "
            "Boundary condition: rank <= closing_rank."
        )


# ===========================================================================
# TEST GROUP 4: Round-Based Scoring
# ===========================================================================

class TestRoundBasedScoring:
    """
    Ground truth for NIT Silchar ECE HS with rank=36000:
    - 2021: eligible in R2 (R1 close=34934 < 36000, R2 close=38288 > 36000)
    - 2022: NOT eligible (last round close=33116 < 36000)
    - 2023: NOT eligible (last round close=33102 < 36000)
    - 2024: eligible in R1 (R1 close=42983 > 36000)
    - 2025: eligible in R2 (R1 close=34934 < 36000, R2 close=38288 > 36000)

    The confidence should be LESS THAN 1.0 (only 3/5 years eligible)
    and should reflect that R2 eligibility scores lower than R1.
    """

    def test_round_scoring_reduces_confidence(self, db):
        """Eligibility in later rounds should reduce confidence vs Round 1.

        Rank 36000: eligible in R2 (not R1) for 2021 and 2025.
        Rank 30000: eligible in R1 for all years where eligible.
        The R2-only result should have lower confidence.
        """
        results_r2 = search_colleges(
            db=db, rank=36000, category="General",
            gender="Male", home_state="Assam",
        )
        results_r1 = search_colleges(
            db=db, rank=30000, category="General",
            gender="Male", home_state="Assam",
        )

        hs_r2 = find_results(
            results_r2,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="HS",
        )
        hs_r1 = find_results(
            results_r1,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="HS",
        )

        assert len(hs_r2) >= 1, "Rank 36000 should see HS result"
        assert len(hs_r1) >= 1, "Rank 30000 should see HS result"

        assert hs_r1[0]["confidence_score"] > hs_r2[0]["confidence_score"], (
            f"R1-eligible confidence ({hs_r1[0]['confidence_score']}) should be higher "
            f"than R2-eligible confidence ({hs_r2[0]['confidence_score']}). "
            "Earlier round eligibility means better chances."
        )

    def test_year_eligibility_tracks_earliest_round(self, db):
        """Year eligibility should report the earliest round of eligibility.

        DB: NIT Silchar ECE HS 2025 with rank 36000:
        - R1 close=34934 → NOT eligible (36000 > 34934)
        - R2 close=38288 → eligible (36000 < 38288)
        So earliest_round should be 2.
        """
        results = search_colleges(
            db=db, rank=36000, category="General",
            gender="Male", home_state="Assam",
        )

        hs = find_results(
            results,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="HS",
        )

        assert len(hs) >= 1
        ye_2025 = hs[0]["year_eligibility"].get("2025")
        assert ye_2025 is not None, "2025 should be in year_eligibility"
        assert ye_2025["eligible"] is True, (
            "Should be eligible in 2025 (last round close 40328 > 36000)"
        )
        assert ye_2025["earliest_round"] == 2, (
            f"Earliest eligible round for 2025 should be 2 "
            f"(R1 close=34934 < 36000, R2 close=38288 >= 36000), "
            f"got {ye_2025['earliest_round']}"
        )

    def test_ineligible_year_has_no_earliest_round(self, db):
        """Years where rank exceeds even last round should have earliest_round=None.

        DB: NIT Silchar ECE HS 2022 last round close=33116.
        Rank 36000 > 33116 → not eligible in any round.
        """
        results = search_colleges(
            db=db, rank=36000, category="General",
            gender="Male", home_state="Assam",
        )

        hs = find_results(
            results,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="HS",
        )

        assert len(hs) >= 1
        ye_2022 = hs[0]["year_eligibility"].get("2022")
        assert ye_2022 is not None, "2022 should be in year_eligibility"
        assert ye_2022["eligible"] is False, (
            "Should NOT be eligible in 2022 (last round close 33116 < 36000)"
        )
        assert ye_2022["earliest_round"] is None, (
            "earliest_round should be None when not eligible in any round"
        )


# ===========================================================================
# TEST GROUP 5: Gender Filtering
# ===========================================================================

class TestGenderFiltering:
    """
    Ground truth:
    - NIT Silchar ECE has Female-only (including Supernumerary) seats.
    - HS 2025 R6: Female-only close=68973.
    - Male students should NOT see female-only seats.
    - Female students should see BOTH gender-neutral AND female-only seats.
    """

    def test_female_sees_supernumerary_seats(self, db):
        """Female students should see female-only supernumerary seats.

        DB: NIT Silchar ECE HS Female-only 2025 R6 closing = 68973.
        Rank 50000 < 68973 → eligible.
        """
        results = search_colleges(
            db=db, rank=50000, category="General",
            gender="Female", home_state="Assam",
        )

        female_seats = [
            r for r in results
            if "Silchar" in r["institute"]
            and "Electronics and Communication" in r["program"]
            and "Female" in r["gender"]
            and r["quota"] == "HS"
        ]

        assert len(female_seats) >= 1, (
            "Female student should see female-only supernumerary seats. "
            "DB shows Female-only HS closing 68973 for NIT Silchar ECE."
        )

    def test_male_does_not_see_female_seats(self, db):
        """Male students should NOT see female-only seats."""
        results = search_colleges(
            db=db, rank=50000, category="General",
            gender="Male", home_state="Assam",
        )

        female_seats = [
            r for r in results
            if "Female" in r["gender"]
        ]

        assert len(female_seats) == 0, (
            "Male student should NOT see any female-only seats"
        )


# ===========================================================================
# TEST GROUP 6: Category Seat Types
# ===========================================================================

class TestCategorySeatTypes:
    """
    Ground truth:
    - SC category seats exist for NIT Silchar ECE (SC seat_type).
    - SC HS 2025 R6: closing = 6717, OS closing = 3754.
    - General category should NOT see SC seats.
    """

    def test_sc_category_sees_sc_seats(self, db):
        """SC student should see SC seat type results.

        DB: NIT Silchar ECE SC HS 2025 R6 closing = 6717.
        """
        results = search_colleges(
            db=db, rank=5000, category="SC",
            gender="Male", home_state="Assam",
        )

        sc_hs = find_results(
            results,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="HS",
        )

        assert len(sc_hs) >= 1, (
            "SC student from Assam should see SC HS quota for NIT Silchar ECE. "
            "DB shows SC HS closing 6717."
        )

    def test_general_does_not_see_sc_seats(self, db):
        """General category should NOT see SC seat type results.

        Even if rank qualifies for SC closing ranks, category must match.
        """
        results = search_colleges(
            db=db, rank=5000, category="General",
            gender="Male", home_state="Assam",
        )

        sc_seats = [
            r for r in results
            if r["seat_type"] == "SC"
        ]

        assert len(sc_seats) == 0, (
            "General category should never see SC seat type results"
        )


# ===========================================================================
# TEST GROUP 7: Branch Keyword Filtering
# ===========================================================================

class TestBranchKeywordFiltering:
    """
    Ground truth:
    - IIT Bombay has 'Computer Science and Engineering (4 Years, ...)' program.
    - Keyword 'computer' should match this program.
    - Keyword 'mechanical' should NOT match this program.
    """

    def test_branch_keyword_includes_matching_programs(self, db):
        """branch_keywords=['computer'] should include CSE programs.

        DB: IIT Bombay has 'Computer Science and Engineering' program.
        Closing rank = 66 in 2025 R6. Rank 50 < 66 → eligible.
        """
        results = search_colleges(
            db=db, rank=50, category="General",
            gender="Male", home_state="Maharashtra",
            branch_keywords=["computer"],
        )

        cse = find_results(
            results,
            "Indian Institute  of Technology Bombay",
            "Computer Science",
        )

        assert len(cse) >= 1, (
            "branch_keywords=['computer'] should match 'Computer Science and Engineering'"
        )

    def test_branch_keyword_excludes_non_matching(self, db):
        """branch_keywords=['mechanical'] should NOT include CSE.

        Only programs containing 'mechanical' should appear.
        Rank 50 is eligible for IIT Bombay CSE (closing 66) but we filter
        by 'mechanical' keyword so CSE should not appear.
        """
        results = search_colleges(
            db=db, rank=50, category="General",
            gender="Male", home_state="Maharashtra",
            branch_keywords=["mechanical"],
        )

        cse = find_results(
            results,
            "Indian Institute  of Technology Bombay",
            "Computer Science",
        )

        assert len(cse) == 0, (
            "branch_keywords=['mechanical'] should not include 'Computer Science'"
        )


# ===========================================================================
# TEST GROUP 8: Confidence Score Properties
# ===========================================================================

class TestConfidenceScoreProperties:
    """
    Ground truth:
    - NIT Silchar Mechanical HS: rank 50000 eligible ALL years (2021-2025).
      All years have closing > 50000, earliest round = 1 in all.
    - This should yield HIGH confidence (close to 1.0).
    """

    def test_all_years_eligible_r1_gives_max_confidence(self, db):
        """Eligible in R1 for all years should give confidence = 1.0.

        DB: NIT Silchar Mechanical HS - rank 50000 eligible in R1 for all 5 years.
        """
        results = search_colleges(
            db=db, rank=50000, category="General",
            gender="Male", home_state="Assam",
        )

        mech_hs = find_results(
            results,
            "National Institute of Technology, Silchar",
            "Mechanical Engineering (4 Years",
            quota="HS",
        )

        assert len(mech_hs) >= 1, "Should see Mechanical HS result"
        assert mech_hs[0]["confidence_score"] == 1.0, (
            f"Eligible in R1 for all years should give confidence 1.0, "
            f"got {mech_hs[0]['confidence_score']}"
        )

    def test_zero_confidence_excluded(self, db):
        """Results with 0 confidence (never eligible) should not appear.

        DB: NIT Warangal CSE OS closing ~2409. Rank 100000 is way above.
        """
        results = search_colleges(
            db=db, rank=100000, category="General",
            gender="Male", home_state="Maharashtra",
            years=[2025],
        )

        warangal_cse_os = find_results(
            results,
            "National Institute of Technology, Warangal",
            "Computer Science and Engineering (4 Years",
            quota="OS",
        )

        assert len(warangal_cse_os) == 0, (
            "Rank 100000 should never see NIT Warangal CSE OS (closing ~2409)"
        )

    def test_confidence_between_0_and_1(self, db):
        """All returned results should have confidence in [0, 1].

        Confidence is computed from 2025 data only. Rows missing 2025 data
        legitimately have confidence_score == 0 (they are kept around so the
        Excel/UI can show prior-year reference data) — they should still be
        bounded in [0, 1] and consistent with `has_2025`.
        """
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Assam",
        )

        for r in results:
            assert 0 <= r["confidence_score"] <= 1.0, (
                f"Confidence must be in [0, 1.0], got {r['confidence_score']} "
                f"for {r['institute']} - {r['program']} ({r['quota']})"
            )
            if r.get("has_2025") is False:
                assert r["confidence_score"] == 0, (
                    "Rows without 2025 data must have confidence_score == 0"
                )


# ===========================================================================
# TEST GROUP 9: Result Fields Integrity
# ===========================================================================

class TestResultFieldsIntegrity:
    """Ensure all required fields are present and have expected types."""

    def test_result_has_all_required_fields(self, db):
        """Every result must have the complete set of fields."""
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Assam",
        )

        required_fields = {
            "institute", "institute_type", "state", "program",
            "quota", "seat_type", "gender", "confidence_score",
            "latest_opening_rank", "latest_closing_rank", "year_eligibility",
        }

        assert len(results) > 0, "Should have results for rank 33157"

        for r in results[:10]:
            missing = required_fields - set(r.keys())
            assert not missing, (
                f"Result missing fields: {missing}. "
                f"Institute: {r.get('institute', '?')}"
            )

    def test_year_eligibility_has_all_years(self, db):
        """year_eligibility should contain entries for all available years."""
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Assam",
        )

        assert len(results) > 0
        for r in results[:10]:
            ye = r["year_eligibility"]
            assert len(ye) >= 4, (
                f"year_eligibility should have entries for available years, "
                f"got {len(ye)} for {r['institute']} - {r['program']}"
            )
            for yr_str, data in ye.items():
                assert "eligible" in data, f"Missing 'eligible' for year {yr_str}"
                assert "closing_rank" in data, f"Missing 'closing_rank' for year {yr_str}"
                assert "earliest_round" in data, f"Missing 'earliest_round' for year {yr_str}"

    def test_results_sorted_by_confidence_desc(self, db):
        """Results should be sorted by confidence (descending)."""
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Assam",
        )

        assert len(results) > 10
        for i in range(len(results) - 1):
            assert results[i]["confidence_score"] >= results[i + 1]["confidence_score"], (
                f"Results not sorted by confidence: "
                f"index {i} has {results[i]['confidence_score']} but "
                f"index {i+1} has {results[i+1]['confidence_score']}"
            )

    def test_state_field_populated_for_nits(self, db):
        """NIT results should have the state field populated.

        DB: All NITs have state column filled via backfill.
        """
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Assam",
        )

        nit_results = [r for r in results if r["institute_type"] == "NIT"]
        assert len(nit_results) > 0

        nits_without_state = [
            r["institute"] for r in nit_results if not r["state"]
        ]
        assert len(nits_without_state) == 0, (
            f"NITs without state info: {nits_without_state[:5]}"
        )


# ===========================================================================
# TEST GROUP 10: Institute Type Filtering
# ===========================================================================

# ===========================================================================
# TEST GROUP 10: Detail Endpoint — Quota Filtering
# ===========================================================================

class TestDetailEndpoint:
    """
    Ground truth:
    - NIT Silchar ECE has BOTH HS and OS records for the same round+year.
    - HS 2025 R6 closing = 40328, OS 2025 R6 closing = 18068.
    - Without quota filter, OS would overwrite HS (alphabetical DB order).
    - The detail endpoint MUST filter by quota to match the card data.
    """

    def test_detail_with_hs_quota_returns_hs_data(self, db):
        """Detail endpoint with quota=HS should return HS closing ranks.

        DB: NIT Silchar ECE HS R6 2025 closing = 40328 (not OS's 18068).
        """
        from app.api.routes import router
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        resp = client.get("/api/details", params={
            "institute": "National Institute of Technology, Silchar",
            "program": "Electronics and Communication Engineering (4 Years, Bachelor of Technology)",
            "seat_type": "OPEN",
            "gender": "Gender-Neutral",
            "quota": "HS",
        })
        assert resp.status_code == 200
        data = resp.json()

        r6_2025 = data["rounds"].get("6", {}).get("2025", {})
        assert r6_2025.get("closing_rank") == 40328, (
            f"Detail endpoint with quota=HS should return HS closing rank (40328), "
            f"got {r6_2025.get('closing_rank')}. "
            "This likely means quota filter is not working and OS is overwriting HS."
        )

    def test_detail_with_os_quota_returns_os_data(self, db):
        """Detail endpoint with quota=OS should return OS closing ranks.

        DB: NIT Silchar ECE OS R6 2025 closing = 18068 (not HS's 40328).
        """
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        resp = client.get("/api/details", params={
            "institute": "National Institute of Technology, Silchar",
            "program": "Electronics and Communication Engineering (4 Years, Bachelor of Technology)",
            "seat_type": "OPEN",
            "gender": "Gender-Neutral",
            "quota": "OS",
        })
        assert resp.status_code == 200
        data = resp.json()

        r6_2025 = data["rounds"].get("6", {}).get("2025", {})
        assert r6_2025.get("closing_rank") == 18068, (
            f"Detail endpoint with quota=OS should return OS closing rank (18068), "
            f"got {r6_2025.get('closing_rank')}"
        )

    def test_detail_hs_and_os_return_different_data(self, db):
        """HS and OS detail queries must return different closing ranks.

        This is the exact bug that was causing card/table mismatch:
        card showed HS data but table showed OS data.
        """
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        base_params = {
            "institute": "National Institute of Technology, Silchar",
            "program": "Electronics and Communication Engineering (4 Years, Bachelor of Technology)",
            "seat_type": "OPEN",
            "gender": "Gender-Neutral",
        }

        resp_hs = client.get("/api/details", params={**base_params, "quota": "HS"})
        resp_os = client.get("/api/details", params={**base_params, "quota": "OS"})

        data_hs = resp_hs.json()
        data_os = resp_os.json()

        hs_r1_2025 = data_hs["rounds"].get("1", {}).get("2025", {}).get("closing_rank")
        os_r1_2025 = data_os["rounds"].get("1", {}).get("2025", {}).get("closing_rank")

        assert hs_r1_2025 != os_r1_2025, (
            f"HS R1 2025 closing ({hs_r1_2025}) should differ from "
            f"OS R1 2025 closing ({os_r1_2025}). "
            "If equal, quota filter is broken and data is being mixed."
        )
        assert hs_r1_2025 == 34934, f"HS R1 2025 should be 34934, got {hs_r1_2025}"
        assert os_r1_2025 == 15294, f"OS R1 2025 should be 15294, got {os_r1_2025}"


class TestRankWindowAndPrimaryYear:
    """
    New behaviour shipped alongside the choice-list rework:

    1. Confidence is computed from 2025 data only; older years stay attached
       as `year_eligibility` for reference.
    2. `has_2025` flag is added so callers can distinguish "no 2025 data" from
       "ineligible in 2025".
    3. `min_rank` / `max_rank` form an explicit closing-rank window and replace
       the implicit `closing_rank >= rank` filter when set. This is what lets
       a user with rank 33157 also see colleges with closing rank 18068 (a
       reach pick) by passing a window that brackets both.
    """

    def test_has_2025_flag_present_for_rows_with_2025_data(self, db):
        """Rows with 2025 data must report has_2025=True and confidence > 0."""
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Assam",
            years=[2025],
        )

        assert len(results) > 0
        for r in results:
            assert r.get("has_2025") is True, (
                "When year filter is [2025], every returned row must have 2025 data"
            )
            assert r["confidence_score"] > 0, (
                "2025-eligible rows must have confidence > 0"
            )

    def test_confidence_uses_only_2025_round_score(self, db):
        """Confidence equals ROUND_SCORE[earliest_round_in_2025], independent of older years.

        DB: NIT Silchar ECE HS 2025 R1=34934, R2=38288, R6=40328.
        - Rank 30000 → earliest 2025 round = 1 → confidence = 1.0
        - Rank 36000 → earliest 2025 round = 2 → confidence = 0.9
        """
        results_a = search_colleges(
            db=db, rank=30000, category="General",
            gender="Male", home_state="Assam",
        )
        results_b = search_colleges(
            db=db, rank=36000, category="General",
            gender="Male", home_state="Assam",
        )

        a = find_results(
            results_a,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="HS",
        )
        b = find_results(
            results_b,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="HS",
        )

        assert len(a) == 1 and len(b) == 1
        assert a[0]["confidence_score"] == 1.0, (
            f"Rank 30000 → 2025 R1 → expected confidence 1.0, got {a[0]['confidence_score']}"
        )
        assert b[0]["confidence_score"] == 0.9, (
            f"Rank 36000 → 2025 R2 → expected confidence 0.9, got {b[0]['confidence_score']}"
        )

    def test_year_eligibility_still_populated_for_all_years(self, db):
        """Older years remain in year_eligibility even though they don't drive confidence."""
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Assam",
        )

        sample = find_results(
            results,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="HS",
        )
        assert len(sample) >= 1
        ye = sample[0]["year_eligibility"]
        for yr in ("2025", "2024", "2023", "2022", "2021"):
            assert yr in ye, f"Year {yr} should be present in year_eligibility for reference"

    def test_rank_window_includes_reach_college(self, db):
        """A closing rank below the user's rank should appear when inside the window.

        DB: NIT Silchar ECE OS 2025 R6 closing = 18068.
        Without a window, rank 33157 would NOT see this row (closing 18068 < 33157).
        With min_rank=15000, max_rank=20000 it must appear, because the window
        explicitly asks for that closing-rank band as a reach pick.
        """
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Assam",
            min_rank=15000, max_rank=20000,
            years=[2025],
        )

        os_match = find_results(
            results,
            "National Institute of Technology, Silchar",
            "Electronics and Communication Engineering (4 Years",
            quota="OS",
        )
        assert len(os_match) >= 1, (
            "Rank window 15000-20000 should surface NIT Silchar ECE OS "
            "(2025 R6 closing 18068) as a reach pick for rank 33157."
        )
        assert 15000 <= os_match[0]["latest_closing_rank"] <= 20000

    def test_rank_window_excludes_outside_band(self, db):
        """Closing ranks outside the window must be filtered out.

        DB: NIT Warangal CSE OS 2025 R6 closing = 2409. With a window of
        15000-20000 this row's closing rank is below the band and must be
        excluded — even though rank 33157 would normally see it inside an
        unbounded "reach" view.
        """
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Maharashtra",
            min_rank=15000, max_rank=20000,
            years=[2025],
        )

        warangal_cse_os = find_results(
            results,
            "National Institute of Technology, Warangal",
            "Computer Science and Engineering (4 Years",
            quota="OS",
        )
        assert len(warangal_cse_os) == 0, (
            "Rank window 15000-20000 must exclude closing rank 2409 (NIT Warangal CSE OS)."
        )

    def test_rank_window_min_only(self, db):
        """min_rank-only narrows the floor without changing the upper bound.

        Home-state OS/AI rows are intentionally fetched regardless of the
        window so the pivot table can show both OS and HS ranks for the same
        program side-by-side (the user is a strong reach on OS but eligible
        via HS, so the OS rank is useful context). All other rows must still
        satisfy closing_rank >= min_rank.
        """
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Assam",
            min_rank=40000,
            years=[2025],
        )
        assert len(results) > 0
        for r in results:
            cr = r["latest_closing_rank"]
            # Home-state (Assam) OS/AI rows are intentionally included outside
            # the window for pivot display — they are not subject to min_rank.
            is_home_state_os_ai = (
                r.get("quota") in ("OS", "AI")
                and r.get("state", "").lower() == "assam"
            )
            if not is_home_state_os_ai:
                assert cr is None or cr >= 40000, (
                    f"min_rank=40000 should drop non-home-state closing ranks "
                    f"below it, got {cr} for {r.get('institute')} ({r.get('quota')})"
                )


class TestInstituteTypeFiltering:
    """Test that institute_types parameter correctly filters results."""

    def test_filter_only_nits(self, db):
        """institute_types=['NIT'] should only return NIT results."""
        results = search_colleges(
            db=db, rank=33157, category="General",
            gender="Male", home_state="Assam",
            institute_types=["NIT"],
        )

        non_nit = [r for r in results if r["institute_type"] != "NIT"]
        assert len(non_nit) == 0, (
            f"Filtering by NIT should exclude other types, found: "
            f"{set(r['institute_type'] for r in non_nit)}"
        )

    def test_filter_only_iits(self, db):
        """institute_types=['IIT'] should only return IIT results."""
        results = search_colleges(
            db=db, rank=500, category="General",
            gender="Male", home_state="Maharashtra",
            institute_types=["IIT"],
        )

        assert len(results) > 0
        non_iit = [r for r in results if r["institute_type"] != "IIT"]
        assert len(non_iit) == 0, (
            f"Filtering by IIT should exclude other types"
        )
