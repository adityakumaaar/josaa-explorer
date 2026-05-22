import { useState, useMemo } from "react";
import CollegeCard from "./CollegeCard";
import { INSTITUTE_TYPES, INST_TYPE_COLORS } from "../lib/constants";
import type { SearchResponse, SearchResult } from "../lib/types";

type SortKey = "match" | "closing" | "name";

const PAGE_SIZE = 30;

interface Props {
  data: SearchResponse;
}

interface CollegeGroup {
  institute: string;
  institute_type: string;
  state: string | null;
  results: SearchResult[];
  bestScore: number;
  bestClosing: number;
}

export default function ResultsTable({ data }: Props) {
  const [sort, setSort] = useState<SortKey>("match");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [showCount, setShowCount] = useState(PAGE_SIZE);
  const [groupByCollege, setGroupByCollege] = useState(false);

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
    if (!groupByCollege) return [];
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
  }, [filtered, groupByCollege, sort]);

  const visible = filtered.slice(0, showCount);
  const hasMore = showCount < filtered.length;

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

        {/* Group toggle */}
        <button
          onClick={() => setGroupByCollege((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium transition border
            ${groupByCollege
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
            }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Group by college
        </button>

        {/* Sort */}
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

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No colleges found matching your criteria.
        </div>
      ) : groupByCollege ? (
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

function CollegeGroupCard({ group, allYears, rank }: { group: CollegeGroup; allYears: string[]; rank: number }) {
  const [expanded, setExpanded] = useState(true);
  const typeColor = INST_TYPE_COLORS[group.institute_type] || "bg-gray-100 text-gray-800";
  const confidence = getConfidence(group.bestScore);

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
          <span className={`text-xs font-bold ${confidence.color}`}>{confidence.label}</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-2 pb-2 pt-1 space-y-1.5">
          {group.results.map((r, i) => (
            <CollegeCard key={i} result={r} allYears={allYears} rank={rank} compact />
          ))}
        </div>
      )}
    </div>
  );
}
