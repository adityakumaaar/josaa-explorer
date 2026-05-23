import { useState, useEffect } from "react";
import { INST_TYPE_COLORS } from "../lib/constants";
import { API_BASE, SHOW_SENTIMENT } from "../lib/api";
import type { SearchResult } from "../lib/types";

interface Props {
  result: SearchResult;
  allYears: string[];
  rank: number;
  compact?: boolean;
}

interface RoundData {
  [year: string]: { opening_rank: number | null; closing_rank: number | null };
}

interface DetailData {
  years: number[];
  rounds: { [round: string]: RoundData };
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

function getConfidence(score: number) {
  if (score >= 0.75) return { label: "HIGH", color: "text-emerald-600" };
  if (score >= 0.4) return { label: "MEDIUM", color: "text-amber-600" };
  return { label: "LOW", color: "text-red-500" };
}

function getCellColor(closingRank: number | null, userRank: number): string {
  if (closingRank === null) return "bg-gray-50 text-gray-400";
  if (userRank <= closingRank) return "bg-emerald-50 text-emerald-900";
  if (userRank <= closingRank * 1.1) return "bg-amber-50 text-amber-900";
  return "bg-red-50 text-red-900";
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

export default function CollegeCard({ result, allYears, rank, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSentiment, setHasSentiment] = useState<boolean | null>(null);
  const [meta, setMeta] = useState<CollegeMetaData | null>(null);

  const confidence = getConfidence(result.confidence_score);
  const typeColor =
    INST_TYPE_COLORS[result.institute_type] || "bg-gray-100 text-gray-800";
  const eligibleCount = allYears.filter(
    (yr) => result.year_eligibility[yr]?.eligible
  ).length;

  useEffect(() => {
    const params = new URLSearchParams({ institute: result.institute });
    if (SHOW_SENTIMENT && hasSentiment === null) {
      fetch(`${API_BASE}/api/sentiment?${params}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data) {
            setHasSentiment(data.available && data.categories?.length > 0);
            setSentiment(data);
          } else {
            setHasSentiment(false);
          }
        })
        .catch(() => setHasSentiment(false));
    }
    if (!meta) {
      fetch(`${API_BASE}/api/college-meta?${params}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setMeta(data); })
        .catch(() => {});
    }
  }, [result.institute, hasSentiment, meta]);

  const handleClick = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        institute: result.institute,
        program: result.program,
        seat_type: result.seat_type,
        gender: result.gender,
        quota: result.quota,
      });
      const resp = await fetch(`${API_BASE}/api/details?${params}`);
      if (resp.ok) {
        const data = await resp.json();
        setDetail(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }

  };

  // Sort years descending (latest first) for the detail table
  const sortedDetailYears = detail?.years ? [...detail.years].sort((a, b) => b - a) : [];

  return (
    <div
      className={`rounded-lg transition bg-white cursor-pointer ${
        compact
          ? expanded ? "border border-blue-200 bg-blue-50/30" : "border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50"
          : expanded ? "border border-blue-200 shadow-sm" : "border border-gray-200 hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      {/* Main card content */}
      <div className={compact ? "px-2.5 py-2" : "p-3"} onClick={handleClick}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {!compact && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeColor}`}>
                    {result.institute_type}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {result.quota} · {result.seat_type}
                    {result.gender.startsWith("Female") ? " · Female" : ""}
                  </span>
                </div>

                {/* College name — largest */}
                <h3 className="text-[15px] font-bold text-gray-900 leading-snug">
                  {result.institute}
                </h3>
              </>
            )}

            {/* Branch with icon — medium */}
            <p className={`${compact ? "text-[12px]" : "text-[13px]"} text-gray-600 ${compact ? "" : "mt-0.5"} flex items-center gap-1.5`}>
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {result.program}
            </p>

            {/* Quota + Seat type (always visible) + State in compact mode */}
            <div className="flex items-center gap-2 mt-0.5">
              {compact && (
                <span className="text-[10px] text-gray-400">
                  {result.quota} · {result.seat_type}
                  {result.gender.startsWith("Female") ? " · Female" : ""}
                </span>
              )}
              {!compact && result.state && (
                <p className="text-[11px] text-gray-400 flex items-center gap-1">
                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {result.state}
                </p>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-1">
              {SHOW_SENTIMENT && hasSentiment && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Reddit sentiment available" />
              )}
              <span className={`text-xs font-bold ${confidence.color}`}>{confidence.label}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">{eligibleCount}/{allYears.length} yrs</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-gray-100 text-xs">
          <span className="text-gray-400">
            Opening <span className="font-medium text-gray-500">{result.latest_opening_rank?.toLocaleString() ?? "—"}</span>
          </span>
          <span className="text-gray-400">
            Closing <span className="font-semibold text-gray-900">{result.latest_closing_rank?.toLocaleString() ?? "—"}</span>
          </span>
          <span className="ml-auto text-[10px] text-gray-400">
            {expanded ? "▲ Hide details" : "▼ Click for details"}
          </span>
        </div>
      </div>

      {/* Expanded detail table */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {/* Placement stats */}
          {!compact && meta?.available && (
            <div className="mt-2 mb-2 p-2 rounded-md bg-blue-50/50 border border-blue-100">
              <div className="flex items-center justify-between mb-1.5">
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
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-[9px] text-gray-500">Median</p>
                  <p className="text-[12px] font-bold text-gray-900">{meta.median_package} LPA</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500">Average</p>
                  <p className="text-[12px] font-bold text-gray-900">{meta.average_package} LPA</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500">Highest</p>
                  <p className="text-[12px] font-bold text-gray-900">{meta.highest_package} LPA</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500">Placed</p>
                  <p className="text-[12px] font-bold text-gray-900">{meta.placement_pct}%</p>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-4 text-center text-xs text-gray-400">Loading round data...</div>
          ) : detail ? (
            <div className="mt-2 overflow-x-auto">
              <p className="text-[10px] text-gray-400 mb-1.5 text-right">Closing ranks by round</p>
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-1.5 px-2 text-gray-700 font-semibold border-b border-gray-200">Round</th>
                    {sortedDetailYears.map((yr) => (
                      <th key={yr} className="text-center py-1.5 px-2 text-gray-700 font-semibold border-b border-gray-200">
                        '{String(yr).slice(2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(detail.rounds).map(([roundNo, yearData]) => (
                    <tr key={roundNo}>
                      <td className="py-1.5 px-2 font-semibold text-gray-700 border-b border-gray-100">{roundNo}</td>
                      {sortedDetailYears.map((yr) => {
                        const cell = yearData[String(yr)];
                        const closingRank = cell?.closing_rank ?? null;
                        const cellColor = getCellColor(closingRank, rank);
                        return (
                          <td
                            key={yr}
                            className={`py-1.5 px-2 text-center font-semibold border-b border-gray-100 ${cellColor}`}
                          >
                            {closingRank?.toLocaleString() ?? "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-2 rounded-sm bg-emerald-50 border border-emerald-200" /> Eligible
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-2 rounded-sm bg-amber-50 border border-amber-200" /> Borderline
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-2 rounded-sm bg-red-50 border border-red-200" /> Not eligible
                </span>
                <span className="ml-auto">Your rank: {rank.toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-gray-400">Failed to load details</div>
          )}

          {/* Reddit Sentiment Section */}
          {SHOW_SENTIMENT && sentiment?.available && sentiment.categories.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-500 mb-2 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 4.373 0 9.757c0 3.268 1.882 6.173 4.83 7.945-.046 1.18-.48 3.225-2.33 4.298 2.726-.2 4.946-1.408 6.227-2.388.83.12 1.68.182 2.547.182h.453C17.627 19.794 24 15.42 24 9.757 24 4.373 18.627 0 12 0z"/>
                </svg>
                Reddit Sentiment
              </p>
              <div className="grid grid-cols-2 gap-2">
                {sentiment.categories.map((cat) => {
                  const meta = CATEGORY_META[cat.category] || { label: cat.category, icon: "📊" };
                  const style = getSentimentStyle(cat.sentiment);
                  return (
                    <div key={cat.category} className={`rounded-md border p-2 ${style}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold">
                          {meta.icon} {meta.label}
                        </span>
                        <span className="text-[10px] font-bold">{cat.score}/5</span>
                      </div>
                      {cat.snippet && (
                        <p className="text-[10px] italic leading-tight opacity-80 line-clamp-2">
                          "{cat.snippet}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px] text-gray-400 mt-1.5 text-right">
                Based on {sentiment.categories[0]?.post_count || 0} Reddit posts
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
