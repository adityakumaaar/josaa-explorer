import type { SearchResult } from "./types";

export type GroupBy = "state" | "confidence";
export type MindMapNodeLevel = "root" | "group" | "college" | "program";

export interface MindMapNodeData extends Record<string, unknown> {
  level: MindMapNodeLevel;
  label: string;
  sublabel?: string;
  count?: number;
  instituteType?: string;
  state?: string | null;
  confidenceLabel?: string;
  confidenceScore?: number;
  closingRank?: number | null;
  result?: SearchResult;
  collapsible?: boolean;
  childCount?: number;
  groupBy?: GroupBy;
  bucketKey?: string;
}

export interface MindMapGraphNode {
  id: string;
  type: MindMapNodeLevel;
  data: MindMapNodeData;
  parentId?: string;
}

export interface MindMapGraphEdge {
  id: string;
  source: string;
  target: string;
}

const CONFIDENCE_ORDER = ["HIGH", "MEDIUM", "LOW"] as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getConfidenceTier(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.75) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}

function sortResults(list: SearchResult[]): SearchResult[] {
  return [...list].sort(
    (a, b) =>
      b.confidence_score - a.confidence_score ||
      (a.latest_closing_rank ?? 999999) - (b.latest_closing_rank ?? 999999),
  );
}

function shortenProgram(program: string): string {
  const trimmed = program.replace(/\(\d+\s*Years.*$/i, "").trim();
  if (trimmed.length <= 42) return trimmed;
  return `${trimmed.slice(0, 39)}...`;
}

function bucketKey(result: SearchResult, groupBy: GroupBy): string {
  switch (groupBy) {
    case "state":
      return result.state ?? "Unknown";
    case "confidence":
      return getConfidenceTier(result.confidence_score);
  }
}

function orderedBucketKeys(keys: Set<string>, groupBy: GroupBy): string[] {
  if (groupBy === "confidence") {
    return CONFIDENCE_ORDER.filter((k) => keys.has(k));
  }
  return [...keys].sort((a, b) => {
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    return a.localeCompare(b);
  });
}

export function buildMindMapGraph(
  results: SearchResult[],
  groupBy: GroupBy,
  rankUsed: number,
  category: string,
): { nodes: MindMapGraphNode[]; edges: MindMapGraphEdge[] } {
  const nodes: MindMapGraphNode[] = [];
  const edges: MindMapGraphEdge[] = [];

  const rootId = "root";
  nodes.push({
    id: rootId,
    type: "root",
    data: {
      level: "root",
      label: `Rank ${rankUsed.toLocaleString()}`,
      sublabel: category,
      count: results.length,
    },
  });

  const sorted = sortResults(results);
  const bucketMap = new Map<string, SearchResult[]>();

  for (const result of sorted) {
    const key = bucketKey(result, groupBy);
    if (!bucketMap.has(key)) bucketMap.set(key, []);
    bucketMap.get(key)!.push(result);
  }

  for (const bucket of orderedBucketKeys(new Set(bucketMap.keys()), groupBy)) {
    const bucketResults = bucketMap.get(bucket)!;
    const groupId = `${rootId}/${slugify(bucket)}`;

    nodes.push({
      id: groupId,
      type: "group",
      parentId: rootId,
      data: {
        level: "group",
        label: bucket,
        count: bucketResults.length,
        groupBy,
        bucketKey: bucket,
        collapsible: true,
        childCount: new Set(bucketResults.map((r) => r.institute)).size,
      },
    });
    edges.push({ id: `${rootId}-${groupId}`, source: rootId, target: groupId });

    const collegeMap = new Map<string, SearchResult[]>();
    for (const result of bucketResults) {
      if (!collegeMap.has(result.institute)) collegeMap.set(result.institute, []);
      collegeMap.get(result.institute)!.push(result);
    }

    const colleges = [...collegeMap.entries()].sort((a, b) => {
      const bestA = Math.max(...a[1].map((r) => r.confidence_score));
      const bestB = Math.max(...b[1].map((r) => r.confidence_score));
      return (
        bestB - bestA ||
        (Math.min(...a[1].map((r) => r.latest_closing_rank ?? 999999)) -
          Math.min(...b[1].map((r) => r.latest_closing_rank ?? 999999)))
      );
    });

    for (const [institute, programs] of colleges) {
      const collegeId = `${groupId}/${slugify(institute)}`;
      const bestScore = Math.max(...programs.map((r) => r.confidence_score));

      nodes.push({
        id: collegeId,
        type: "college",
        parentId: groupId,
        data: {
          level: "college",
          label: institute,
          instituteType: programs[0].institute_type,
          state: programs[0].state,
          count: programs.length,
          confidenceLabel: getConfidenceTier(bestScore),
          confidenceScore: bestScore,
          collapsible: programs.length >= 2,
          childCount: programs.length,
        },
      });
      edges.push({ id: `${groupId}-${collegeId}`, source: groupId, target: collegeId });

      for (const result of sortResults(programs)) {
        const programId = `${collegeId}/${slugify(result.program)}-${slugify(result.quota)}-${slugify(result.seat_type)}`;
        const tier = getConfidenceTier(result.confidence_score);

        nodes.push({
          id: programId,
          type: "program",
          parentId: collegeId,
          data: {
            level: "program",
            label: shortenProgram(result.program),
            sublabel: result.quota,
            instituteType: result.institute_type,
            confidenceLabel: tier,
            confidenceScore: result.confidence_score,
            closingRank: result.latest_closing_rank,
            result,
          },
        });
        edges.push({ id: `${collegeId}-${programId}`, source: collegeId, target: programId });
      }
    }
  }

  return { nodes, edges };
}

export function getDefaultCollapsedIds(nodes: MindMapGraphNode[]): Set<string> {
  const collapsed = new Set<string>();
  for (const node of nodes) {
    if (node.data.level === "college" && (node.data.childCount ?? 0) >= 2) {
      collapsed.add(node.id);
    }
  }
  return collapsed;
}

export function getDescendantIds(
  nodeId: string,
  nodes: MindMapGraphNode[],
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    if (!childrenByParent.has(node.parentId)) childrenByParent.set(node.parentId, []);
    childrenByParent.get(node.parentId)!.push(node.id);
  }

  const descendants = new Set<string>();
  const stack = [...(childrenByParent.get(nodeId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    descendants.add(id);
    stack.push(...(childrenByParent.get(id) ?? []));
  }
  return descendants;
}

export function filterVisibleGraph(
  nodes: MindMapGraphNode[],
  edges: MindMapGraphEdge[],
  collapsedIds: Set<string>,
): { nodes: MindMapGraphNode[]; edges: MindMapGraphEdge[] } {
  const hidden = new Set<string>();
  for (const id of collapsedIds) {
    for (const desc of getDescendantIds(id, nodes)) hidden.add(desc);
  }

  const visibleNodes = nodes.filter((n) => !hidden.has(n.id));
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = edges.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
  );

  return { nodes: visibleNodes, edges: visibleEdges };
}
