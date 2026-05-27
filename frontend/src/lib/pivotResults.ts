import type { SearchResult } from "./types";

export const PRIMARY_YEAR = "2025";
export const REFERENCE_YEARS = ["2024", "2023", "2022", "2021", "2019"] as const;

// Quota precedence used for "best closing rank" in reference (prior-year)
// columns. OS/AI drive the sort, so the same precedence is used for prior-year
// reference values to keep the column semantically consistent across years.
export const QUOTA_PREF: ReadonlyArray<string> = ["OS", "AI", "HS", "GO", "JK", "LA"];

export type PickType = "safe" | "target" | "reach" | "noData";

// A row counts as SAFE when the user's rank clears the closing rank by at
// least this margin (in any eligible quota). Below this margin but still
// eligible -> TARGET. Not eligible but has 2025 data -> REACH.
export const SAFE_MARGIN = 3000;

export interface PivotRow {
  institute: string;
  institute_type: string;
  state: string | null;
  program: string;
  seat_type: string;
  gender: string;
  hs_2025: number | null;
  os_2025: number | null;
  ai_2025: number | null;
  // Merged OS/AI rank for display + sorting. NITs allocate via OS, IIITs and
  // GFTIs via AI -- they are mutually exclusive at the (institute, program,
  // seat_type, gender) level, so a single column is the natural unit. If
  // both are somehow present we prefer OS (NIT-style canonical bucket).
  osAi_2025: number | null;
  osAiQuota: "OS" | "AI" | null;
  eligibleOsAi: boolean;
  has_2025: boolean;
  refByYear: Record<string, number | null>;
  confidence: number;
  homeStateEligible: boolean;
  // Eligibility flags computed against the user's effective rank for the
  // currently-eligible quota. Used by the Table view to render small chips
  // and by callers that want to filter "rows where I qualify".
  eligibleHS: boolean;
  eligibleOS: boolean;
  eligibleAI: boolean;
  // Pick classification used by both the Table view and the Excel writer so
  // that "reach" rows surfaced via the rank window are labelled, not flagged
  // as 0% confidence.
  pickType: PickType;
  // Best margin (closing - rank) across eligible quotas. Positive when the
  // user clears the closing rank, negative for reach picks, null for rows
  // with no 2025 data.
  bestMargin: number | null;
}

function pickRefClosing(
  perQuota: Record<string, SearchResult>,
  year: string,
): number | null {
  for (const q of QUOTA_PREF) {
    const r = perQuota[q];
    if (!r) continue;
    const ye = r.year_eligibility[year];
    if (ye && ye.closing_rank != null) return ye.closing_rank;
  }
  return null;
}

export function pivotResults(
  results: SearchResult[],
  homeState: string | null | undefined,
  rankUsed: number,
): PivotRow[] {
  const groups = new Map<string, SearchResult[]>();
  for (const r of results) {
    const key = `${r.institute}|||${r.program}|||${r.seat_type}|||${r.gender}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const rows: PivotRow[] = [];
  for (const [, members] of groups) {
    const head = members[0];
    const perQuota: Record<string, SearchResult> = {};
    for (const m of members) perQuota[m.quota] = m;

    const close2025 = (q: string): number | null => {
      const r = perQuota[q];
      if (!r) return null;
      const ye = r.year_eligibility[PRIMARY_YEAR];
      if (ye && ye.closing_rank != null) return ye.closing_rank;
      return null;
    };

    const hs_2025 = close2025("HS");
    const os_2025 = close2025("OS");
    const ai_2025 = close2025("AI");
    const has_2025 = hs_2025 != null || os_2025 != null || ai_2025 != null;

    const refByYear: Record<string, number | null> = {};
    for (const yr of REFERENCE_YEARS) {
      refByYear[yr] = pickRefClosing(perQuota, yr);
    }

    let confidence = 0;
    for (const m of members) {
      if (m.has_2025 && m.confidence_score > confidence) {
        confidence = m.confidence_score;
      }
    }

    const homeStateEligible =
      head.state != null &&
      typeof homeState === "string" &&
      homeState.length > 0 &&
      head.state.toLowerCase() === homeState.toLowerCase() &&
      hs_2025 != null;

    const isEligible = (close: number | null) =>
      close != null && rankUsed <= close;

    const eligibleHS = isEligible(hs_2025);
    const eligibleOS = isEligible(os_2025);
    const eligibleAI = isEligible(ai_2025);

    // Merge OS/AI into a single column. They're mutually exclusive in
    // practice (NIT/IIT-style vs IIIT/GFTI), so picking the present one
    // produces a single canonical "non-home-state" rank for sorting.
    let osAi_2025: number | null = null;
    let osAiQuota: "OS" | "AI" | null = null;
    if (os_2025 != null) {
      osAi_2025 = os_2025;
      osAiQuota = "OS";
    } else if (ai_2025 != null) {
      osAi_2025 = ai_2025;
      osAiQuota = "AI";
    }
    const eligibleOsAi = osAiQuota === "OS" ? eligibleOS : osAiQuota === "AI" ? eligibleAI : false;

    // bestMargin = max(closing - rankUsed) across quotas with 2025 data.
    // Positive => user clears the closing rank (eligible).
    // Negative => reach (closing < rank).
    let bestMargin: number | null = null;
    for (const close of [hs_2025, os_2025, ai_2025]) {
      if (close == null) continue;
      const margin = close - rankUsed;
      if (bestMargin == null || margin > bestMargin) bestMargin = margin;
    }

    let pickType: PickType;
    if (!has_2025) {
      pickType = "noData";
    } else if (bestMargin == null) {
      pickType = "noData";
    } else if (bestMargin >= SAFE_MARGIN) {
      pickType = "safe";
    } else if (bestMargin >= 0) {
      pickType = "target";
    } else {
      pickType = "reach";
    }

    rows.push({
      institute: head.institute,
      institute_type: head.institute_type,
      state: head.state,
      program: head.program,
      seat_type: head.seat_type,
      gender: head.gender,
      hs_2025,
      os_2025,
      ai_2025,
      osAi_2025,
      osAiQuota,
      eligibleOsAi,
      has_2025,
      refByYear,
      confidence,
      homeStateEligible,
      eligibleHS,
      eligibleOS,
      eligibleAI,
      pickType,
      bestMargin,
    });
  }
  return rows;
}

const orderKey = (n: number | null) => (n == null ? Number.POSITIVE_INFINITY : n);

// For sorting by the OS/AI column, HS-bypass rows (osAi_2025 == null but
// hs_2025 present) should sort by their HS rank rather than being pushed to
// the bottom. This keeps home-state-eligible rows mixed into the list at
// their natural rank position instead of always appearing last.
const osAiOrderKey = (row: PivotRow) =>
  row.osAi_2025 != null
    ? row.osAi_2025
    : row.hs_2025 != null
      ? row.hs_2025
      : Number.POSITIVE_INFINITY;

/**
 * Default sort: 2025 OS/AI asc → confidence desc.
 * OS and AI are mutually exclusive at the program level (NIT vs IIIT/GFTI),
 * so they sort as a single canonical "non-home-state" rank column.
 * Mirrors the Excel writer so users see the same ordering everywhere.
 */
export function sortPivotByOsAi(rows: PivotRow[]): PivotRow[] {
  return [...rows].sort((a, b) => {
    const osAiDiff = osAiOrderKey(a) - osAiOrderKey(b);
    if (osAiDiff !== 0) return osAiDiff;
    return b.confidence - a.confidence;
  });
}

/** Sort by best 2025 closing rank ascending (HS/OS/AI minimum). */
export function sortPivotByBest(rows: PivotRow[]): PivotRow[] {
  return [...rows].sort((a, b) => {
    const aBest = Math.min(orderKey(a.hs_2025), orderKey(a.os_2025), orderKey(a.ai_2025));
    const bBest = Math.min(orderKey(b.hs_2025), orderKey(b.os_2025), orderKey(b.ai_2025));
    return aBest - bBest;
  });
}

/** Sort by confidence desc, then OS/AI asc. */
export function sortPivotByMatch(rows: PivotRow[]): PivotRow[] {
  return [...rows].sort(
    (a, b) =>
      b.confidence - a.confidence ||
      osAiOrderKey(a) - osAiOrderKey(b),
  );
}

/** Sort alphabetically by institute then program. */
export function sortPivotByName(rows: PivotRow[]): PivotRow[] {
  return [...rows].sort(
    (a, b) =>
      a.institute.localeCompare(b.institute) ||
      a.program.localeCompare(b.program),
  );
}

/** Columns the Table view supports click-to-sort on. */
export type SortColumn =
  | "institute"
  | "state"
  | "program"
  | "seat_type"
  | "osAi_2025"
  | "hs_2025"
  | "pickType"
  | "confidence";

export type SortDir = "asc" | "desc";

const PICK_ORDER: Record<PickType, number> = {
  safe: 0,
  target: 1,
  reach: 2,
  noData: 3,
};

function compareForColumn(a: PivotRow, b: PivotRow, col: SortColumn): number {
  switch (col) {
    case "institute":
      return a.institute.localeCompare(b.institute);
    case "state":
      return (a.state ?? "").localeCompare(b.state ?? "");
    case "program":
      return a.program.localeCompare(b.program);
    case "seat_type":
      return (
        a.seat_type.localeCompare(b.seat_type) ||
        a.gender.localeCompare(b.gender)
      );
    case "hs_2025":
      return orderKey(a.hs_2025) - orderKey(b.hs_2025);
    case "osAi_2025":
      return osAiOrderKey(a) - osAiOrderKey(b);
    case "pickType":
      return PICK_ORDER[a.pickType] - PICK_ORDER[b.pickType];
    case "confidence":
      return a.confidence - b.confidence;
  }
}

/**
 * Click-to-sort for the Table view. Stable on ties via (OS asc, institute,
 * program) so toggling direction on one column doesn't shuffle unrelated rows.
 */
export function sortPivotBy(
  rows: PivotRow[],
  column: SortColumn,
  dir: SortDir,
): PivotRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary = compareForColumn(a, b, column) * sign;
    if (primary !== 0) return primary;
    const tieOsAi = osAiOrderKey(a) - osAiOrderKey(b);
    if (tieOsAi !== 0) return tieOsAi;
    return (
      a.institute.localeCompare(b.institute) ||
      a.program.localeCompare(b.program)
    );
  });
}
