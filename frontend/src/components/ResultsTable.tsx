import { useState, useMemo } from "react";
import CollegeCard from "./CollegeCard";
import { INSTITUTE_TYPES, INST_TYPE_COLORS } from "../lib/constants";
import type { SearchResponse } from "../lib/types";

type SortKey = "match" | "closing" | "name";

const PAGE_SIZE = 30;

interface Props {
  data: SearchResponse;
}

export default function ResultsTable({ data }: Props) {
  const [sort, setSort] = useState<SortKey>("match");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [showCount, setShowCount] = useState(PAGE_SIZE);

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

  const visible = filtered.slice(0, showCount);
  const hasMore = showCount < filtered.length;

  return (
    <div>
      {/* Top bar: counts + sort + type filter */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="text-xs sm:text-sm text-gray-500 mr-auto">
          <span className="font-semibold text-gray-800">{filtered.length}</span>{" "}
          options for rank{" "}
          <span className="font-semibold text-gray-800">
            {data.rank_used.toLocaleString()}
          </span>{" "}
          ({data.category})
        </div>

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

      {/* Results list — single column for full names */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No colleges found matching your criteria.
        </div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-1">
            {visible.map((r, i) => (
              <CollegeCard key={i} result={r} allYears={allYears} />
            ))}
          </div>
          {hasMore && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowCount((c) => c + PAGE_SIZE)}
                className="px-6 py-2 rounded-lg border border-gray-300 text-sm font-medium
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
