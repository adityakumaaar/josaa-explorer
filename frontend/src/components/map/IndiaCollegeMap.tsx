import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";
import {
  aggregateMapChoices,
  getConfidenceTier,
  type InstituteSummary,
  type StateSummary,
} from "../../lib/aggregateMapChoices";
import { getGeoFeatureStateName } from "../../lib/stateGeo";
import { INST_TYPE_COLORS } from "../../lib/constants";
import type { SearchResult } from "../../lib/types";

interface Props {
  results: SearchResult[];
  rankUsed: number;
}

const MAP_TYPE_FILL: Record<string, string> = {
  IIT: "#3b82f6",
  NIT: "#10b981",
  IIIT: "#8b5cf6",
  GFTI: "#f59e0b",
};

function stateFill(count: number, max: number, selected: boolean): string {
  if (count === 0) return selected ? "#f3f4f6" : "#e5e7eb";
  const t = Math.min(1, count / max);
  const lightness = 92 - t * 38;
  return selected ? `hsl(217 91% ${lightness - 8}%)` : `hsl(217 70% ${lightness}%)`;
}

function confidenceDot(tier: string): string {
  if (tier === "HIGH") return "#059669";
  if (tier === "MEDIUM") return "#d97706";
  return "#ef4444";
}

export default function IndiaCollegeMap({ results, rankUsed }: Props) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedInstitute, setSelectedInstitute] = useState<InstituteSummary | null>(null);

  const mapData = useMemo(() => aggregateMapChoices(results), [results]);

  const geoCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of mapData.byState) {
      m.set(s.state, (m.get(s.state) ?? 0) + s.programCount);
    }
    return m;
  }, [mapData]);

  const statesForGeo = useMemo(() => {
    const m = new Map<string, StateSummary[]>();
    for (const s of mapData.byState) {
      if (!m.has(s.state)) m.set(s.state, []);
      m.get(s.state)!.push(s);
    }
    return m;
  }, [mapData]);

  useEffect(() => {
    fetch("/maps/india-states.geojson")
      .then((r) => r.json())
      .then((data: FeatureCollection) => setGeo(data))
      .catch(() => {});
  }, []);

  const projection = useMemo(() => {
    if (!geo) return null;
    return geoMercator().fitSize([760, 820], geo);
  }, [geo]);

  const pathGen = useMemo(() => {
    if (!projection) return null;
    return geoPath(projection);
  }, [projection]);

  const selectedSummary = useMemo(() => {
    if (!selectedState) return null;
    const direct = mapData.byState.find((s) => s.state === selectedState);
    if (direct) return direct;
    const grouped = statesForGeo.get(selectedState);
    if (!grouped?.length) return null;
    return {
      state: grouped.map((s) => s.state).join(" / "),
      programCount: grouped.reduce((n, s) => n + s.programCount, 0),
      collegeCount: grouped.reduce((n, s) => n + s.collegeCount, 0),
      bestConfidence: Math.max(...grouped.map((s) => s.bestConfidence)),
      colleges: grouped.flatMap((s) => s.colleges),
    } satisfies StateSummary;
  }, [mapData, selectedState, statesForGeo]);

  if (!geo || !pathGen || !projection) {
    return (
      <div className="border border-gray-200 rounded-xl bg-gray-50 min-h-[520px] h-[60vh] flex items-center justify-center text-sm text-gray-400">
        Loading map…
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-gray-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 bg-white flex flex-wrap items-center gap-3">
        <span className="text-[11px] text-gray-500">
          <span className="font-semibold text-gray-800">{mapData.institutes.length}</span> colleges
          across{" "}
          <span className="font-semibold text-gray-800">{mapData.byState.filter((s) => s.state !== "Unknown").length}</span> states
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[10px]">
          {Object.entries(MAP_TYPE_FILL).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              {type}
            </span>
          ))}
        </div>
      </div>
      <p className="px-3 py-1.5 text-[10px] text-gray-400 border-b border-gray-100 bg-white">
        Map boundaries per Survey of India (via LGD/DataMeet).{" "}
        <a
          href="https://surveyofindia.gov.in/pages/political-map-of-india/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Official maps
        </a>
      </p>

      <div className="flex flex-col lg:flex-row min-h-[520px] h-[60vh]">
        <div className="flex-1 overflow-auto p-2 bg-sky-50/40">
          <svg viewBox="0 0 760 820" className="w-full h-full min-h-[480px]">
            {geo.features.map((feature, i) => {
              const appName = getGeoFeatureStateName(
                feature.properties as Record<string, unknown> | undefined,
              );
              const count = geoCounts.get(appName) ?? 0;
              const isSelected = selectedState === appName;
              const d = pathGen(feature);

              return (
                <path
                  key={`${appName}-${i}`}
                  d={d ?? undefined}
                  fill={stateFill(count, mapData.maxProgramsPerState, isSelected)}
                  stroke={isSelected ? "#1d4ed8" : "#94a3b8"}
                  strokeWidth={isSelected ? 1.5 : 0.6}
                  className="cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedState(appName);
                    setSelectedInstitute(null);
                  }}
                >
                  <title>{`${appName}: ${count} program${count !== 1 ? "s" : ""}`}</title>
                </path>
              );
            })}

            {mapData.institutes.map((inst) => {
              const projected = projection(inst.coordinates);
              if (!projected) return null;
              const [x, y] = projected;
              const fill = MAP_TYPE_FILL[inst.institute_type] ?? "#6b7280";
              const tier = getConfidenceTier(inst.bestConfidence);
              const isActive = selectedInstitute?.institute === inst.institute;

              return (
                <g
                  key={`${inst.state}-${inst.institute}`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedState(inst.state);
                    setSelectedInstitute(inst);
                  }}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? 9 : 7}
                    fill={fill}
                    stroke={isActive ? "#111827" : "#fff"}
                    strokeWidth={isActive ? 2 : 1.5}
                    opacity={0.92}
                  />
                  <circle
                    cx={x + 5}
                    cy={y - 5}
                    r={3}
                    fill={confidenceDot(tier)}
                    stroke="#fff"
                    strokeWidth={0.8}
                  />
                  {inst.programCount > 1 && (
                    <text
                      x={x}
                      y={y + 3}
                      textAnchor="middle"
                      className="text-[8px] font-bold fill-white pointer-events-none"
                    >
                      {inst.programCount}
                    </text>
                  )}
                  <title>{`${inst.institute} (${inst.programCount} programs)`}</title>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-gray-200 bg-white overflow-y-auto">
          {selectedInstitute ? (
            <DetailPanel
              institute={selectedInstitute}
              onBack={() => setSelectedInstitute(null)}
            />
          ) : selectedSummary ? (
            <StatePanel
              summary={selectedSummary}
              onSelect={(inst) => setSelectedInstitute(inst)}
              onClear={() => setSelectedState(null)}
            />
          ) : (
            <div className="p-4 text-sm text-gray-500">
              <p className="font-medium text-gray-700 mb-1">Explore by location</p>
              <p className="text-[12px] leading-relaxed">
                Click a state or college marker to see matching programs for rank{" "}
                <span className="font-semibold text-gray-800">{rankUsed.toLocaleString()}</span>.
                Darker states have more options.
              </p>
              <ul className="mt-4 space-y-2">
                {mapData.byState.slice(0, 8).map((s) => (
                  <li key={s.state}>
                    <button
                      type="button"
                      onClick={() => setSelectedState(s.state)}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 flex justify-between text-[12px]"
                    >
                      <span className="font-medium text-gray-800">{s.state}</span>
                      <span className="text-gray-400">{s.programCount} programs</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatePanel({
  summary,
  onSelect,
  onClear,
}: {
  summary: StateSummary;
  onSelect: (inst: InstituteSummary) => void;
  onClear: () => void;
}) {
  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">State</p>
          <h3 className="text-sm font-bold text-gray-900">{summary.state}</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {summary.collegeCount} colleges · {summary.programCount} programs
          </p>
        </div>
        <button type="button" onClick={onClear} className="text-gray-400 hover:text-gray-600 text-xs">
          Clear
        </button>
      </div>
      <div className="space-y-1.5">
        {summary.colleges.map((c) => (
          <button
            key={c.institute}
            type="button"
            onClick={() => onSelect(c)}
            className="w-full text-left px-2.5 py-2 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${INST_TYPE_COLORS[c.institute_type] ?? "bg-gray-100"}`}>
                {c.institute_type}
              </span>
              <span
                className="text-[9px] font-bold"
                style={{ color: confidenceDot(getConfidenceTier(c.bestConfidence)) }}
              >
                {getConfidenceTier(c.bestConfidence)}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-gray-900 leading-snug">{c.institute}</p>
            <p className="text-[10px] text-gray-400">{c.programCount} program{c.programCount !== 1 ? "s" : ""}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailPanel({
  institute,
  onBack,
}: {
  institute: InstituteSummary;
  onBack: () => void;
}) {
  return (
    <div className="p-3">
      <button type="button" onClick={onBack} className="text-[11px] text-blue-600 hover:underline mb-2">
        ← Back to {institute.state}
      </button>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">College</p>
      <h3 className="text-sm font-bold text-gray-900 leading-snug mb-1">{institute.institute}</h3>
      <p className="text-[11px] text-gray-400 mb-3">{institute.programCount} matching programs</p>
      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
        {institute.programs.map((p, i) => (
          <div key={i} className="px-2.5 py-2 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-[11px] font-medium text-gray-900 leading-snug">{p.program}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-gray-500">
              <span>{p.quota}</span>
              <span>CR {p.latest_closing_rank?.toLocaleString() ?? "N/A"}</span>
              <span>{Math.round(p.confidence_score * 100)}% match</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
