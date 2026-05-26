import { useState, useMemo, useEffect } from "react";
import CollegeCard from "./CollegeCard";
import CollegeMindMap from "./mindmap/CollegeMindMap";
import IndiaCollegeMap from "./map/IndiaCollegeMap";
import { INSTITUTE_TYPES, INST_TYPE_COLORS } from "../lib/constants";
import { API_BASE, SHOW_SENTIMENT } from "../lib/api";
import { generateChoiceList } from "../lib/generateChoiceList";
import {
  pivotResults,
  sortPivotBy,
  type PivotRow,
  type PickType,
  type SortColumn,
  type SortDir,
} from "../lib/pivotResults";
import type { SearchResponse, SearchResult, SearchParams } from "../lib/types";

type SortKey = "match" | "closing" | "name";
type ViewMode = "list" | "grouped" | "table" | "mindmap" | "map";
type QuotaTag = "HS" | "OS" | "AI";

const PAGE_SIZE = 30;

interface Props {
  data: SearchResponse;
  searchParams: SearchParams | null;
}

interface CollegeGroup {
  institute: string;
  institute_type: string;
  state: string | null;
  results: SearchResult[];
  bestScore: number;
  bestClosing: number;
}

export default function ResultsTable({ data, searchParams }: Props) {
  const [sort, setSort] = useState<SortKey>("match");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [showCount, setShowCount] = useState(PAGE_SIZE);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [quotaTags, setQuotaTags] = useState<Set<QuotaTag>>(new Set());
  const [hsOnly, setHsOnly] = useState(false);
  const [has2025Only, setHas2025Only] = useState(true);
  // Table view click-to-sort state. Default = 2025 OS/AI ascending so the
  // rank-window shows reach -> safe top-to-bottom (matches the Excel writer).
  const [tableSortCol, setTableSortCol] = useState<SortColumn>("osAi_2025");
  const [tableSortDir, setTableSortDir] = useState<SortDir>("asc");

  const allYears = useMemo(() => {
    const yrs = new Set<string>();
    for (const r of data.results) {
      for (const yr of Object.keys(r.year_eligibility)) yrs.add(yr);
    }
    return Array.from(yrs).sort().reverse();
  }, [data]);

  const filtered = useMemo(() => {
    setShowCount(PAGE_SIZE);
    let list = data.results;
    if (typeFilter) {
      list = list.filter((r) => r.institute_type === typeFilter);
    }
    const sorted = [...list];
    switch (sort) {
      case "match":
        sorted.sort(
          (a, b) =>
            b.confidence_score - a.confidence_score ||
            (a.latest_closing_rank ?? 999999) - (b.latest_closing_rank ?? 999999)
        );
        break;
      case "closing":
        sorted.sort(
          (a, b) =>
            (a.latest_closing_rank ?? 999999) - (b.latest_closing_rank ?? 999999)
        );
        break;
      case "name":
        sorted.sort((a, b) => a.institute.localeCompare(b.institute));
        break;
    }
    return sorted;
  }, [data, sort, typeFilter]);

  const grouped = useMemo<CollegeGroup[]>(() => {
    if (viewMode !== "grouped") return [];
    const map = new Map<string, CollegeGroup>();
    for (const r of filtered) {
      const key = r.institute;
      if (!map.has(key)) {
        map.set(key, {
          institute: r.institute,
          institute_type: r.institute_type,
          state: r.state,
          results: [],
          bestScore: 0,
          bestClosing: 999999,
        });
      }
      const g = map.get(key)!;
      g.results.push(r);
      if (r.confidence_score > g.bestScore) g.bestScore = r.confidence_score;
      const cr = r.latest_closing_rank ?? 999999;
      if (cr < g.bestClosing) g.bestClosing = cr;
    }
    const groups = Array.from(map.values());
    switch (sort) {
      case "match":
        groups.sort((a, b) => b.bestScore - a.bestScore || a.bestClosing - b.bestClosing);
        break;
      case "closing":
        groups.sort((a, b) => a.bestClosing - b.bestClosing);
        break;
      case "name":
        groups.sort((a, b) => a.institute.localeCompare(b.institute));
        break;
    }
    return groups;
  }, [filtered, viewMode, sort]);

  const visible = filtered.slice(0, showCount);
  const hasMore = showCount < filtered.length;

  // Pivoted rows (one per institute+program+seat_type+gender) for the Table view.
  // We pivot from `filtered` so the existing institute-type filter applies.
  const pivoted = useMemo<PivotRow[]>(() => {
    if (viewMode !== "table") return [];
    let rows = pivotResults(
      filtered,
      searchParams?.home_state ?? null,
      data.rank_used,
    );
    if (has2025Only) rows = rows.filter((r) => r.has_2025);
    if (hsOnly) rows = rows.filter((r) => r.homeStateEligible);
    if (quotaTags.size > 0) {
      rows = rows.filter((r) => {
        if (quotaTags.has("HS") && r.hs_2025 != null) return true;
        if (quotaTags.has("OS") && r.os_2025 != null) return true;
        if (quotaTags.has("AI") && r.ai_2025 != null) return true;
        return false;
      });
    }
    return sortPivotBy(rows, tableSortCol, tableSortDir);
  }, [
    filtered,
    viewMode,
    searchParams?.home_state,
    data.rank_used,
    hsOnly,
    has2025Only,
    quotaTags,
    tableSortCol,
    tableSortDir,
  ]);

  const onSortColumn = (col: SortColumn) => {
    if (tableSortCol === col) {
      setTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTableSortCol(col);
      // Default direction per column: closing-rank/confidence/pick-type style
      // columns lead with ascending; text columns also start ascending.
      setTableSortDir("asc");
    }
    setShowCount(PAGE_SIZE);
  };

  const visiblePivoted = pivoted.slice(0, showCount);
  const hasMorePivoted = showCount < pivoted.length;

  const toggleQuotaTag = (q: QuotaTag) =>
    setQuotaTags((prev) => {
      const next = new Set(prev);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });

  return (
    <div>
      {/* Top bar: counts + sort + group toggle */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="text-xs sm:text-sm text-gray-500 mr-auto">
          <span className="font-semibold text-gray-800">{filtered.length}</span>{" "}
          options for rank{" "}
          <span className="font-semibold text-gray-800">
            {data.rank_used.toLocaleString()}
          </span>{" "}
          ({data.category})
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 text-[11px] sm:text-xs border border-gray-300 rounded-full p-0.5 bg-white">
          {(
            [
              ["list", "List"],
              ["grouped", "Grouped"],
              ["table", "Table"],
              ["mindmap", "Mind map"],
              ["map", "Map"],
            ] as [ViewMode, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setViewMode(key)}
              className={`px-2.5 py-1 rounded-full transition font-medium
                ${viewMode === key
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Generate Choice List */}
        {searchParams && (
          <button
            onClick={() => generateChoiceList(filtered, searchParams, data.rank_used)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium transition border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Choice List (.xlsx)
          </button>
        )}

        {/* Sort (hidden in Table view -- column headers there are click-to-sort) */}
        {viewMode !== "table" && (
          <div className="flex items-center gap-1 text-[11px] sm:text-xs">
            {(
              [
                ["match", "Best match"],
                ["closing", "Closing rank"],
                ["name", "Name"],
              ] as [SortKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`px-2.5 py-1 rounded-full transition
                  ${
                    sort === key
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => setTypeFilter(null)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition border
            ${
              !typeFilter
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
            }`}
        >
          All
        </button>
        {INSTITUTE_TYPES.map((t) => {
          const count = data.results.filter(
            (r) => r.institute_type === t
          ).length;
          if (count === 0) return null;
          const color = INST_TYPE_COLORS[t];
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition border
                ${
                  typeFilter === t
                    ? `border-transparent ${color}`
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
            >
              {t} ({count})
            </button>
          );
        })}
      </div>

      {/* Table-view-specific filter chips */}
      {viewMode === "table" && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="text-[11px] uppercase tracking-wider text-gray-400 mr-1">
            Filter
          </span>
          <button
            onClick={() => setHas2025Only((v) => !v)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition border
              ${
                has2025Only
                  ? "border-transparent bg-blue-600 text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
              }`}
            title="Hide rows missing 2025 data"
          >
            2025 only
          </button>
          {searchParams?.home_state && (
            <button
              onClick={() => setHsOnly((v) => !v)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition border
                ${
                  hsOnly
                    ? "border-transparent bg-amber-500 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              title={`Show only rows where you qualify under HS quota (${searchParams.home_state})`}
            >
              Home state only
            </button>
          )}
          <span className="w-px h-4 bg-gray-200 mx-1" />
          <span className="text-[11px] uppercase tracking-wider text-gray-400 mr-1">
            Quota
          </span>
          {(["HS", "OS", "AI"] as QuotaTag[]).map((q) => (
            <button
              key={q}
              onClick={() => toggleQuotaTag(q)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition border
                ${
                  quotaTags.has(q)
                    ? "border-transparent bg-gray-900 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              title={`Show only rows with a 2025 ${q} closing rank`}
            >
              {q}
            </button>
          ))}
          {(quotaTags.size > 0 || hsOnly || !has2025Only) && (
            <button
              onClick={() => {
                setQuotaTags(new Set());
                setHsOnly(false);
                setHas2025Only(true);
              }}
              className="ml-1 px-2.5 py-1 rounded-full text-xs font-medium text-blue-600 hover:underline"
            >
              Reset
            </button>
          )}
          <span className="ml-auto text-[11px] text-gray-400">
            {pivoted.length} program{pivoted.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No colleges found matching your criteria.
        </div>
      ) : viewMode === "mindmap" ? (
        <CollegeMindMap
          results={filtered}
          rankUsed={data.rank_used}
          category={data.category}
        />
      ) : viewMode === "map" ? (
        <IndiaCollegeMap results={filtered} rankUsed={data.rank_used} />
      ) : viewMode === "table" ? (
        <PivotTable
          rows={visiblePivoted}
          rank={data.rank_used}
          hasMore={hasMorePivoted}
          remaining={pivoted.length - showCount}
          onShowMore={() => setShowCount((c) => c + PAGE_SIZE)}
          sortCol={tableSortCol}
          sortDir={tableSortDir}
          onSort={onSortColumn}
        />
      ) : viewMode === "grouped" ? (
        <div className="space-y-2">
          {grouped.slice(0, showCount).map((group) => (
            <CollegeGroupCard key={group.institute} group={group} allYears={allYears} rank={data.rank_used} />
          ))}
          {grouped.length > showCount && (
            <div className="text-center mt-5">
              <button
                onClick={() => setShowCount((c) => c + PAGE_SIZE)}
                className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-medium
                           text-gray-700 hover:bg-gray-50 transition"
              >
                Show more ({grouped.length - showCount} remaining)
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {visible.map((r, i) => (
              <CollegeCard key={i} result={r} allYears={allYears} rank={data.rank_used} />
            ))}
          </div>
          {hasMore && (
            <div className="text-center mt-5">
              <button
                onClick={() => setShowCount((c) => c + PAGE_SIZE)}
                className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-medium
                           text-gray-700 hover:bg-gray-50 transition"
              >
                Show more ({filtered.length - showCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getConfidence(score: number) {
  if (score >= 0.75) return { label: "HIGH", color: "text-emerald-600" };
  if (score >= 0.4) return { label: "MEDIUM", color: "text-amber-600" };
  return { label: "LOW", color: "text-red-500" };
}

interface PivotTableProps {
  rows: PivotRow[];
  rank: number;
  hasMore: boolean;
  remaining: number;
  onShowMore: () => void;
  sortCol: SortColumn;
  sortDir: SortDir;
  onSort: (col: SortColumn) => void;
}

function PivotTable({
  rows,
  rank,
  hasMore,
  remaining,
  onShowMore,
  sortCol,
  sortDir,
  onSort,
}: PivotTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No programs match the current filters.
      </div>
    );
  }
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-[12px] sm:text-[13px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-gray-500">
              <th className="font-semibold px-2 py-2 whitespace-nowrap">#</th>
              <SortableTh
                label="Institute"
                col="institute"
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortableTh
                label="State"
                col="state"
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={onSort}
                className="whitespace-nowrap"
              />
              <SortableTh
                label="Program"
                col="program"
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortableTh
                label="Seat / Gender"
                col="seat_type"
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={onSort}
                className="whitespace-nowrap"
              />
              <SortableTh
                label="2025 OS/AI"
                col="osAi_2025"
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                className="whitespace-nowrap"
              />
              <SortableTh
                label="Pick"
                col="pickType"
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={onSort}
                align="center"
                className="whitespace-nowrap"
              />
              <th className="font-semibold px-2 py-2 text-center whitespace-nowrap">HS Eligible</th>
              <SortableTh
                label="2025 HS"
                col="hs_2025"
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                className="whitespace-nowrap"
              />
              <SortableTh
                label="Confidence"
                col="confidence"
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                className="whitespace-nowrap"
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const typeColor = INST_TYPE_COLORS[r.institute_type] || "bg-gray-100 text-gray-800";
              const conf = getConfidence(r.confidence);
              return (
                <tr
                  key={`${r.institute}|${r.program}|${r.seat_type}|${r.gender}`}
                  className={`border-b border-gray-100 last:border-b-0 ${
                    r.homeStateEligible ? "bg-amber-50" : i % 2 ? "bg-white" : "bg-gray-50/30"
                  }`}
                >
                  <td className="px-2 py-2 text-gray-400 align-top">{i + 1}</td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[9px] font-semibold px-1 rounded ${typeColor}`}>
                        {r.institute_type}
                      </span>
                    </div>
                    <div className="font-medium text-gray-900 leading-tight">{r.institute}</div>
                  </td>
                  <td className="px-2 py-2 text-gray-600 align-top whitespace-nowrap">
                    {r.state ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-gray-700 align-top">{r.program}</td>
                  <td className="px-2 py-2 text-[11px] text-gray-500 align-top whitespace-nowrap">
                    <div>{r.seat_type}</div>
                    <div className="text-gray-400">{shortGender(r.gender)}</div>
                  </td>
                  <RankCell
                    value={r.osAi_2025}
                    eligible={r.eligibleOsAi}
                    rank={rank}
                    quota={r.osAiQuota}
                  />
                  <td className="px-2 py-2 text-center align-top">
                    <PickBadge pick={r.pickType} margin={r.bestMargin} />
                  </td>
                  <td className="px-2 py-2 text-center align-top">
                    {r.homeStateEligible ? (
                      <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                        YES
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <RankCell value={r.hs_2025} eligible={r.eligibleHS} rank={rank} />
                  <td className={`px-2 py-2 text-right align-top whitespace-nowrap font-semibold ${
                    r.pickType === "noData"
                      ? "text-gray-400 font-normal"
                      : r.pickType === "reach"
                        ? "text-blue-600"
                        : conf.color
                  }`}>
                    {confidenceLabel(r)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="text-center mt-5">
          <button
            onClick={onShowMore}
            className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-medium
                       text-gray-700 hover:bg-gray-50 transition"
          >
            Show more ({remaining} remaining)
          </button>
        </div>
      )}
    </>
  );
}

function SortableTh({
  label,
  col,
  sortCol,
  sortDir,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  col: SortColumn;
  sortCol: SortColumn;
  sortDir: SortDir;
  onSort: (col: SortColumn) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const active = sortCol === col;
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const justifyClass =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";
  return (
    <th className={`font-semibold px-2 py-2 ${alignClass} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`group inline-flex items-center gap-0.5 ${justifyClass} hover:text-gray-900 transition ${
          active ? "text-gray-900" : "text-gray-500"
        }`}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        title={
          active
            ? `Sorted ${sortDir === "asc" ? "ascending" : "descending"}. Click to reverse.`
            : `Sort by ${label}`
        }
      >
        <span>{label}</span>
        <SortArrow active={active} dir={sortDir} />
      </button>
    </th>
  );
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <svg
        className="w-3 h-3 text-gray-300 group-hover:text-gray-400"
        viewBox="0 0 12 12"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M6 1.5l3 3.5H3l3-3.5zM6 10.5l-3-3.5h6l-3 3.5z" />
      </svg>
    );
  }
  return dir === "asc" ? (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M6 2l4 5H2l4-5z" />
    </svg>
  ) : (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M6 10L2 5h8l-4 5z" />
    </svg>
  );
}

function PickBadge({ pick, margin }: { pick: PickType; margin: number | null }) {
  if (pick === "noData") {
    return <span className="text-gray-300 text-[11px]">—</span>;
  }
  const styles: Record<Exclude<PickType, "noData">, string> = {
    safe: "bg-emerald-100 text-emerald-800 border-emerald-200",
    target: "bg-amber-100 text-amber-800 border-amber-200",
    reach: "bg-blue-100 text-blue-800 border-blue-200",
  };
  const label: Record<Exclude<PickType, "noData">, string> = {
    safe: "SAFE",
    target: "TARGET",
    reach: "REACH",
  };
  const tooltip =
    margin == null
      ? undefined
      : margin >= 0
        ? `+${margin.toLocaleString()} ranks above your rank (eligible)`
        : `${margin.toLocaleString()} below your rank (reach pick)`;
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${styles[pick]}`}
      title={tooltip}
    >
      {label[pick]}
    </span>
  );
}

function confidenceLabel(r: PivotRow) {
  if (r.pickType === "noData") return <span>no '25</span>;
  if (r.pickType === "reach") return <span>Reach</span>;
  return <span>{Math.round(r.confidence * 100)}%</span>;
}

function RankCell({
  value,
  eligible,
  rank,
  quota,
}: {
  value: number | null;
  eligible: boolean;
  rank: number;
  quota?: "OS" | "AI" | null;
}) {
  if (value == null) {
    return <td className="px-2 py-2 text-right text-gray-300 align-top">—</td>;
  }
  const margin = value - rank;
  const tone = eligible
    ? "text-emerald-700"
    : margin > -2000
      ? "text-amber-600"
      : "text-gray-500";
  return (
    <td className={`px-2 py-2 text-right align-top tabular-nums ${tone}`}>
      <div className="flex items-center justify-end gap-1.5">
        {quota && (
          <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1 py-px">
            {quota}
          </span>
        )}
        <span>{value.toLocaleString()}</span>
      </div>
      <div className="text-[10px] text-gray-400">
        {margin >= 0 ? `+${margin.toLocaleString()}` : margin.toLocaleString()}
      </div>
    </td>
  );
}

function shortGender(g: string): string {
  if (g === "Gender-Neutral") return "Gender-Neutral";
  if (g.startsWith("Female")) return "Female-only";
  return g;
}

interface SentimentCategory {
  category: string;
  sentiment: "positive" | "neutral" | "negative";
  score: number;
  snippet: string;
  post_count: number;
}

interface SentimentData {
  available: boolean;
  categories: SentimentCategory[];
}

interface CollegeMetaData {
  available: boolean;
  website_url?: string;
  nirf_rank?: number;
  median_package?: number;
  highest_package?: number;
  average_package?: number;
  placement_pct?: number;
  data_year?: number;
}

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  placements: { label: "Placements", icon: "💼" },
  campus_life: { label: "Campus Life", icon: "🎉" },
  faculty: { label: "Faculty", icon: "👨‍🏫" },
  infrastructure: { label: "Infrastructure", icon: "🏗️" },
};

function getSentimentStyle(sentiment: string) {
  if (sentiment === "positive") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (sentiment === "negative") return "bg-red-50 text-red-700 border-red-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function CollegeGroupCard({ group, allYears, rank }: { group: CollegeGroup; allYears: string[]; rank: number }) {
  const [expanded, setExpanded] = useState(true);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [meta, setMeta] = useState<CollegeMetaData | null>(null);
  const typeColor = INST_TYPE_COLORS[group.institute_type] || "bg-gray-100 text-gray-800";
  const confidence = getConfidence(group.bestScore);

  useEffect(() => {
    if (!expanded) return;
    const params = new URLSearchParams({ institute: group.institute });
    if (SHOW_SENTIMENT && !sentiment) {
      fetch(`${API_BASE}/api/sentiment?${params}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setSentiment(data); })
        .catch(() => {});
    }
    if (!meta) {
      fetch(`${API_BASE}/api/college-meta?${params}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setMeta(data); })
        .catch(() => {});
    }
  }, [expanded, group.institute, sentiment, meta]);

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeColor}`}>
              {group.institute_type}
            </span>
            {group.state && (
              <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {group.state}
              </span>
            )}
          </div>
          <h3 className="text-[14px] font-bold text-gray-900 leading-snug">{group.institute}</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {group.results.length} program{group.results.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="shrink-0 text-right mr-2">
          <div className="flex items-center justify-end gap-1">
            {SHOW_SENTIMENT && sentiment?.available && sentiment.categories.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Reddit sentiment available" />
            )}
            <span className={`text-xs font-bold ${confidence.color}`}>{confidence.label}</span>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Placement stats + website */}
          {meta?.available && (
            <div className="px-3 py-2 border-b border-gray-100 bg-blue-50/30">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold text-gray-500 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Placements {meta.data_year && `(${meta.data_year})`}
                </p>
                <div className="flex items-center gap-2">
                  {meta.nirf_rank && (
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                      NIRF #{meta.nirf_rank}
                    </span>
                  )}
                  {meta.website_url && (
                    <a
                      href={meta.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[9px] text-blue-600 hover:text-blue-800 underline flex items-center gap-0.5"
                    >
                      Website
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center">
                  <p className="text-[10px] text-gray-500">Median</p>
                  <p className="text-[13px] font-bold text-gray-900">{meta.median_package} LPA</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500">Average</p>
                  <p className="text-[13px] font-bold text-gray-900">{meta.average_package} LPA</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500">Highest</p>
                  <p className="text-[13px] font-bold text-gray-900">{meta.highest_package} LPA</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500">Placed</p>
                  <p className="text-[13px] font-bold text-gray-900">{meta.placement_pct}%</p>
                </div>
              </div>
            </div>
          )}

          {/* Sentiment at college level */}
          {SHOW_SENTIMENT && sentiment?.available && sentiment.categories.length > 0 && (
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50">
              <p className="text-[10px] font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 4.373 0 9.757c0 3.268 1.882 6.173 4.83 7.945-.046 1.18-.48 3.225-2.33 4.298 2.726-.2 4.946-1.408 6.227-2.388.83.12 1.68.182 2.547.182h.453C17.627 19.794 24 15.42 24 9.757 24 4.373 18.627 0 12 0z"/>
                </svg>
                Reddit Sentiment
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {sentiment.categories.map((cat) => {
                  const meta = CATEGORY_META[cat.category] || { label: cat.category, icon: "📊" };
                  const style = getSentimentStyle(cat.sentiment);
                  return (
                    <div key={cat.category} className={`rounded border px-2 py-1.5 ${style}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold">{meta.icon} {meta.label}</span>
                        <span className="text-[9px] font-bold">{cat.score}/5</span>
                      </div>
                      {cat.snippet && (
                        <p className="text-[9px] italic leading-tight opacity-75 mt-0.5 line-clamp-1">
                          "{cat.snippet}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Branch cards */}
          <div className="px-2 pb-2 pt-1 space-y-1.5">
            {group.results.map((r, i) => (
              <CollegeCard key={i} result={r} allYears={allYears} rank={rank} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
