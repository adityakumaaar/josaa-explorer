import * as XLSX from "xlsx-js-style";
import type { SearchResult, SearchParams } from "./types";
import {
  pivotResults,
  sortPivotByOsAi,
  REFERENCE_YEARS,
  type PivotRow,
} from "./pivotResults";

const HEADER_FILL = { fgColor: { rgb: "1F2937" } };
const HEADER_FONT = { bold: true, color: { rgb: "FFFFFF" } };
const HS_ROW_FILL = { fgColor: { rgb: "FFFCE8" } };
const HS_BADGE_FONT = { bold: true, color: { rgb: "92400E" } };

// Pick-type chip styling (matches the UI Table view).
const SAFE_FILL = { fgColor: { rgb: "DCFCE7" } };
const SAFE_FONT = { bold: true, color: { rgb: "166534" } };
const TARGET_FILL = { fgColor: { rgb: "FEF3C7" } };
const TARGET_FONT = { bold: true, color: { rgb: "92400E" } };
const REACH_FILL = { fgColor: { rgb: "DBEAFE" } };
const REACH_FONT = { bold: true, color: { rgb: "1E40AF" } };
const BORDER = {
  top: { style: "thin", color: { rgb: "E5E7EB" } },
  bottom: { style: "thin", color: { rgb: "E5E7EB" } },
  left: { style: "thin", color: { rgb: "E5E7EB" } },
  right: { style: "thin", color: { rgb: "E5E7EB" } },
};

interface CellSpec {
  v: string | number;
  s?: Record<string, unknown>;
  t?: "s" | "n";
}

function styledCell(
  value: string | number | null,
  rowStyle?: Record<string, unknown>,
  cellOverride?: Record<string, unknown>,
): CellSpec {
  const v = value == null || value === "" ? "" : value;
  const s: Record<string, unknown> = {
    ...(rowStyle ?? {}),
    border: BORDER,
    ...(cellOverride ?? {}),
  };
  if (typeof v === "number") {
    return { v, t: "n", s };
  }
  return { v: String(v), t: "s", s };
}

function buildHeaderInfo(params: SearchParams, rankUsed: number, totalRows: number, refSheetSize: number): (string | number)[][] {
  const lines: (string | number)[][] = [
    ["JoSAA Choice List"],
    [],
    ["Rank", rankUsed],
    ["Category", params.category],
    ["Gender", params.gender],
    ["Home State", params.home_state],
  ];
  if (params.crl_rank) lines.push(["CRL Rank", params.crl_rank]);
  if (params.min_rank || params.max_rank) {
    lines.push([
      "Rank Window",
      `${params.min_rank ?? "(none)"} – ${params.max_rank ?? "(none)"}`,
    ]);
  }
  if (params.institute_types?.length)
    lines.push(["Institute Types", params.institute_types.join(", ")]);
  if (params.program_query) lines.push(["Program Filter", params.program_query]);
  if (params.college_states?.length)
    lines.push(["College States", params.college_states.join(", ")]);
  lines.push(["Choice List Rows (with 2025 data)", totalRows]);
  lines.push(["Reference-only Rows (no 2025 data)", refSheetSize]);
  lines.push([]);
  return lines;
}

const COLUMNS = [
  "S.No",
  "Institute",
  "State",
  "Program",
  "Seat Type",
  "Gender",
  "2025 HS",
  "2025 OS",
  "2025 AI",
  "Pick",
  "Home State Eligible",
  "Confidence",
  "2024 Closing",
  "2023 Closing",
  "2022 Closing",
  "2021 Closing",
  "2019 Closing",
] as const;

const REF_COLUMNS = [
  "S.No",
  "Institute",
  "State",
  "Program",
  "Seat Type",
  "Gender",
  "Home State Eligible (HS available pre-2025)",
  "2024 Closing",
  "2023 Closing",
  "2022 Closing",
  "2021 Closing",
  "2019 Closing",
] as const;

const COL_WIDTHS_MAIN = [5, 50, 18, 45, 12, 12, 10, 10, 10, 8, 18, 11, 14, 14, 14, 14, 14];
const COL_WIDTHS_REF = [5, 50, 18, 45, 12, 12, 30, 14, 14, 14, 14, 14];

function buildMainSheet(rows: PivotRow[], headerInfo: (string | number)[][]) {
  const aoa: CellSpec[][] = [];

  // Top metadata block
  for (const line of headerInfo) {
    aoa.push(line.map((cell) => styledCell(cell, {}, { border: undefined })));
  }

  // Column header row
  aoa.push(
    COLUMNS.map((c) =>
      styledCell(c, {}, { fill: HEADER_FILL, font: HEADER_FONT, alignment: { horizontal: "center" } }),
    ),
  );

  rows.forEach((r, i) => {
    const rowFill = r.homeStateEligible ? { fill: HS_ROW_FILL } : undefined;

    let pickLabel = "";
    let pickStyle: Record<string, unknown> | undefined;
    if (r.pickType === "safe") {
      pickLabel = "SAFE";
      pickStyle = { fill: SAFE_FILL, font: SAFE_FONT, alignment: { horizontal: "center" } };
    } else if (r.pickType === "target") {
      pickLabel = "TARGET";
      pickStyle = { fill: TARGET_FILL, font: TARGET_FONT, alignment: { horizontal: "center" } };
    } else if (r.pickType === "reach") {
      pickLabel = "REACH";
      pickStyle = { fill: REACH_FILL, font: REACH_FONT, alignment: { horizontal: "center" } };
    }

    // Confidence cell: only meaningful for SAFE/TARGET. Reach picks show
    // "Reach" instead of "0%" so the user isn't misled into thinking the row
    // is broken (it's a deliberate window-included reach pick).
    let confCellValue: string;
    if (r.pickType === "noData") confCellValue = "";
    else if (r.pickType === "reach") confCellValue = "Reach";
    else confCellValue = `${Math.round(r.confidence * 100)}%`;

    const cells: CellSpec[] = [
      styledCell(i + 1, rowFill),
      styledCell(r.institute, rowFill),
      styledCell(r.state ?? "", rowFill),
      styledCell(r.program, rowFill),
      styledCell(r.seat_type, rowFill),
      styledCell(r.gender, rowFill),
      styledCell(r.hs_2025, rowFill),
      styledCell(r.os_2025, rowFill),
      styledCell(r.ai_2025, rowFill),
      styledCell(pickLabel, rowFill, pickStyle),
      styledCell(
        r.homeStateEligible ? "YES" : "",
        rowFill,
        r.homeStateEligible ? { font: HS_BADGE_FONT, alignment: { horizontal: "center" } } : undefined,
      ),
      styledCell(confCellValue, rowFill),
      ...REFERENCE_YEARS.map((yr) => styledCell(r.refByYear[yr] ?? null, rowFill)),
    ];
    aoa.push(cells);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa as unknown as (string | number)[][]);
  ws["!cols"] = COL_WIDTHS_MAIN.map((wch) => ({ wch }));
  return ws;
}

function buildRefSheet(rows: PivotRow[], homeState: string) {
  const aoa: CellSpec[][] = [];

  aoa.push([styledCell("Rows missing 2025 data — kept here for reference only")]);
  aoa.push([]);
  aoa.push(
    REF_COLUMNS.map((c) =>
      styledCell(c, {}, { fill: HEADER_FILL, font: HEADER_FONT, alignment: { horizontal: "center" } }),
    ),
  );

  // For ref sheet, sort by best available prior-year closing rank ascending
  const ordered = [...rows].sort((a, b) => {
    const av = a.refByYear[REFERENCE_YEARS[0]] ?? Number.POSITIVE_INFINITY;
    const bv = b.refByYear[REFERENCE_YEARS[0]] ?? Number.POSITIVE_INFINITY;
    return av - bv;
  });

  ordered.forEach((r, i) => {
    const homeStateEligibleHistorical =
      r.state != null &&
      r.state.toLowerCase() === homeState.toLowerCase();
    const rowFill = homeStateEligibleHistorical ? { fill: HS_ROW_FILL } : undefined;
    const cells: CellSpec[] = [
      styledCell(i + 1, rowFill),
      styledCell(r.institute, rowFill),
      styledCell(r.state ?? "", rowFill),
      styledCell(r.program, rowFill),
      styledCell(r.seat_type, rowFill),
      styledCell(r.gender, rowFill),
      styledCell(
        homeStateEligibleHistorical ? "YES" : "",
        rowFill,
        homeStateEligibleHistorical ? { font: HS_BADGE_FONT, alignment: { horizontal: "center" } } : undefined,
      ),
      ...REFERENCE_YEARS.map((yr) => styledCell(r.refByYear[yr] ?? null, rowFill)),
    ];
    aoa.push(cells);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa as unknown as (string | number)[][]);
  ws["!cols"] = COL_WIDTHS_REF.map((wch) => ({ wch }));
  return ws;
}

export function generateChoiceList(
  results: SearchResult[],
  params: SearchParams,
  rankUsed: number,
) {
  const pivoted = pivotResults(results, params.home_state, rankUsed);
  const main = sortPivotByOsAi(pivoted.filter((r) => r.has_2025));
  const ref = pivoted.filter((r) => !r.has_2025);

  const headerInfo = buildHeaderInfo(params, rankUsed, main.length, ref.length);
  const mainWs = buildMainSheet(main, headerInfo);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, mainWs, "Choice List");

  if (ref.length > 0) {
    const refWs = buildRefSheet(ref, params.home_state);
    XLSX.utils.book_append_sheet(wb, refWs, "No 2025 Data (Reference)");
  }

  const filename = `JoSAA_Choice_List_Rank_${rankUsed}_${params.category}.xlsx`;
  XLSX.writeFile(wb, filename);
}
