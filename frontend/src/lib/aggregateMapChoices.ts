import type { SearchResult } from "./types";
import { getCentroid, offsetCentroid } from "./stateGeo";

export interface StateSummary {
  state: string;
  programCount: number;
  collegeCount: number;
  bestConfidence: number;
  colleges: InstituteSummary[];
}

export interface InstituteSummary {
  institute: string;
  institute_type: string;
  state: string;
  programCount: number;
  bestConfidence: number;
  programs: SearchResult[];
  coordinates: [number, number];
}

export interface MapChoiceData {
  byState: StateSummary[];
  institutes: InstituteSummary[];
  maxProgramsPerState: number;
}

function getConfidenceTier(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.75) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}

export { getConfidenceTier };

export function aggregateMapChoices(results: SearchResult[]): MapChoiceData {
  const stateMap = new Map<string, SearchResult[]>();
  const instituteMap = new Map<string, SearchResult[]>();

  for (const r of results) {
    const state = r.state ?? "Unknown";
    if (!stateMap.has(state)) stateMap.set(state, []);
    stateMap.get(state)!.push(r);

    const key = `${state}::${r.institute}`;
    if (!instituteMap.has(key)) instituteMap.set(key, []);
    instituteMap.get(key)!.push(r);
  }

  const byState: StateSummary[] = [];
  const institutes: InstituteSummary[] = [];

  for (const [state, stateResults] of stateMap) {
    const collegeGroups = new Map<string, SearchResult[]>();
    for (const r of stateResults) {
      if (!collegeGroups.has(r.institute)) collegeGroups.set(r.institute, []);
      collegeGroups.get(r.institute)!.push(r);
    }

    const colleges: InstituteSummary[] = [];
    const centroid = getCentroid(state === "Unknown" ? null : state);
    const collegeEntries = [...collegeGroups.entries()].sort(
      (a, b) =>
        Math.max(...b[1].map((r) => r.confidence_score)) -
          Math.max(...a[1].map((r) => r.confidence_score)) ||
        a[0].localeCompare(b[0]),
    );

    collegeEntries.forEach(([institute, programs], idx) => {
      const sorted = [...programs].sort(
        (a, b) => b.confidence_score - a.confidence_score,
      );
      const bestConfidence = sorted[0].confidence_score;
      const coords =
        centroid != null
          ? offsetCentroid(centroid, idx, collegeEntries.length)
          : ([78.96, 20.59] as [number, number]);

      const summary: InstituteSummary = {
        institute,
        institute_type: sorted[0].institute_type,
        state,
        programCount: programs.length,
        bestConfidence,
        programs: sorted,
        coordinates: coords,
      };
      colleges.push(summary);
      institutes.push(summary);
    });

    byState.push({
      state,
      programCount: stateResults.length,
      collegeCount: collegeGroups.size,
      bestConfidence: Math.max(...stateResults.map((r) => r.confidence_score)),
      colleges,
    });
  }

  byState.sort((a, b) => b.programCount - a.programCount);

  return {
    byState,
    institutes,
    maxProgramsPerState: Math.max(1, ...byState.map((s) => s.programCount)),
  };
}
