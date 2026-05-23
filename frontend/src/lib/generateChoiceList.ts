import * as XLSX from "xlsx";
import type { SearchResult, SearchParams } from "./types";

const MAX_CHOICES = 100;

export function generateChoiceList(
  results: SearchResult[],
  params: SearchParams,
  rankUsed: number,
) {
  const sorted = [...results].sort(
    (a, b) =>
      a.confidence_score - b.confidence_score ||
      (a.latest_closing_rank ?? 999999) - (b.latest_closing_rank ?? 999999),
  );

  const capped = sorted.slice(0, MAX_CHOICES);

  const headerRows = [
    ["JoSAA Choice List"],
    [],
    ["Rank", rankUsed],
    ["Category", params.category],
    ["Gender", params.gender],
    ["Home State", params.home_state],
    ...(params.crl_rank ? [["CRL Rank", params.crl_rank]] : []),
    ...(params.institute_types?.length
      ? [["Institute Types", params.institute_types.join(", ")]]
      : []),
    ...(params.program_query
      ? [["Program Filter", params.program_query]]
      : []),
    ...(params.college_states?.length
      ? [["College States", params.college_states.join(", ")]]
      : []),
    [],
    [
      "S.No",
      "Institute",
      "Program",
      "Quota",
      "Seat Type",
      "Closing Rank (Latest)",
      "Confidence",
    ],
  ];

  const dataRows = capped.map((r, i) => [
    i + 1,
    r.institute,
    r.program,
    r.quota,
    r.seat_type,
    r.latest_closing_rank ?? "N/A",
    `${Math.round(r.confidence_score * 100)}%`,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows]);

  ws["!cols"] = [
    { wch: 5 },
    { wch: 55 },
    { wch: 50 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Choice List");

  const filename = `JoSAA_Choice_List_Rank_${rankUsed}_${params.category}.xlsx`;
  XLSX.writeFile(wb, filename);
}
