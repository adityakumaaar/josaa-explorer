import { INST_TYPE_COLORS } from "../lib/constants";
import type { SearchResult } from "../lib/types";

interface Props {
  result: SearchResult;
  allYears: string[];
}

export default function CollegeCard({ result, allYears }: Props) {
  const pct = Math.round(result.confidence_score * 100);
  const typeColor =
    INST_TYPE_COLORS[result.institute_type] || "bg-gray-100 text-gray-800";

  return (
    <div className="border border-gray-200 rounded-xl p-3 sm:p-4 hover:shadow-md transition bg-white">
      <div className="flex items-start justify-between gap-3">
        {/* Left: info */}
        <div className="min-w-0 flex-1">
          {/* Tags */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${typeColor}`}
            >
              {result.institute_type}
            </span>
            <span className="text-[11px] text-gray-400">
              {result.quota} &middot; {result.seat_type}
              {result.gender.startsWith("Female") ? " \u00b7 Female" : ""}
            </span>
          </div>

          {/* Institute name — full, wrapping */}
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">
            {result.institute}
          </h3>

          {/* Program — full, wrapping */}
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">
            {result.program}
          </p>

          {/* Closing rank */}
          <div className="text-xs text-gray-500 mt-2">
            Closing rank:{" "}
            <span className="font-semibold text-gray-800">
              {result.latest_closing_rank?.toLocaleString() ?? "N/A"}
            </span>
          </div>
        </div>

        {/* Right: confidence */}
        <div className="text-right shrink-0">
          <div className="text-xl font-bold text-gray-900">{pct}%</div>
          <div className="text-[10px] text-gray-400">match</div>
        </div>
      </div>

      {/* Year eligibility dots */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
        {allYears.map((yr) => {
          const ye = result.year_eligibility[yr];
          if (!ye) {
            return (
              <span
                key={yr}
                className="inline-flex flex-col items-center"
                title={`${yr}: No data`}
              >
                <span className="w-5 h-5 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[9px] text-gray-400">
                  ?
                </span>
                <span className="text-[9px] text-gray-400 mt-0.5">
                  {yr.slice(2)}
                </span>
              </span>
            );
          }
          const eligible = ye.eligible;
          return (
            <span
              key={yr}
              className="inline-flex flex-col items-center"
              title={`${yr} R${ye.round}: ${eligible ? "Eligible" : "Not eligible"} (closing: ${ye.closing_rank?.toLocaleString() ?? "N/A"})`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium
                  ${
                    eligible
                      ? "bg-emerald-500 text-white"
                      : "bg-white border-2 border-gray-300 text-gray-400"
                  }`}
              >
                {eligible ? "\u2713" : "\u2717"}
              </span>
              <span className="text-[9px] text-gray-500 mt-0.5">
                {yr.slice(2)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
