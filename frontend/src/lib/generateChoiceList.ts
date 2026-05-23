import * as XLSX from "xlsx";
import type { SearchResult, SearchParams } from "./types";

const RANK_BUFFER = 5000;

export function generateChoiceList(
  results: SearchResult[],
  params: SearchParams,
  rankUsed: number,
) {
  const included = results.filter((r) => {
    if (r.latest_closing_rank === null) return true;
    return r.latest_closing_rank <= rankUsed + RANK_BUFFER;
  });

  const sorted = [...included].sort(
    (a, b) =>
      a.confidence_score - b.confidence_score ||
      (a.latest_closing_rank ?? 999999) - (b.latest_closing_rank ?? 999999),
  );

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
    ["Includes closing ranks up to", `${RANK_BUFFER} beyond your rank`],
    ["Total Choices", sorted.length],
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

  const dataRows = sorted.map((r, i) => [
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
