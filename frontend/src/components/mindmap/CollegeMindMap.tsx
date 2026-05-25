import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  buildMindMapGraph,
  filterVisibleGraph,
  getDefaultCollapsedIds,
  type GroupBy,
  type MindMapNodeData,
} from "../../lib/buildMindMapGraph";
import type { SearchResult } from "../../lib/types";
import { mindMapNodeTypes } from "./nodes";

interface Props {
  results: SearchResult[];
  rankUsed: number;
  category: string;
}

const NODE_SIZES: Record<string, { width: number; height: number }> = {
  root: { width: 180, height: 72 },
  group: { width: 150, height: 56 },
  college: { width: 220, height: 72 },
  program: { width: 200, height: 52 },
};

function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80 });

  for (const node of nodes) {
    const size = NODE_SIZES[node.type ?? "program"] ?? NODE_SIZES.program;
    g.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const size = NODE_SIZES[node.type ?? "program"] ?? NODE_SIZES.program;
    return {
      ...node,
      position: {
        x: pos.x - size.width / 2,
        y: pos.y - size.height / 2,
      },
    };
  });
}

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "state", label: "State" },
  { key: "confidence", label: "Confidence" },
];

export default function CollegeMindMap({ results, rankUsed, category }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>("state");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [selectedProgram, setSelectedProgram] = useState<SearchResult | null>(null);

  const fullGraph = useMemo(
    () => buildMindMapGraph(results, groupBy, rankUsed, category),
    [results, groupBy, rankUsed, category],
  );

  useEffect(() => {
    setCollapsedIds(getDefaultCollapsedIds(fullGraph.nodes));
    setSelectedProgram(null);
  }, [fullGraph]);

  const visibleGraph = useMemo(
    () => filterVisibleGraph(fullGraph.nodes, fullGraph.edges, collapsedIds),
    [fullGraph, collapsedIds],
  );

  const flowNodes = useMemo(() => {
    const nodes: Node[] = visibleGraph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      data: {
        ...n.data,
        collapsed: collapsedIds.has(n.id),
      } satisfies MindMapNodeData & { collapsed?: boolean },
      position: { x: 0, y: 0 },
    }));
    return layoutGraph(nodes, visibleGraph.edges as Edge[]);
  }, [visibleGraph, collapsedIds]);

  const flowEdges = useMemo(
    (): Edge[] =>
      visibleGraph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: false,
        style: { stroke: "#cbd5e1", strokeWidth: 1.5 },
      })),
    [visibleGraph.edges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const data = node.data as unknown as MindMapNodeData & { collapsed?: boolean };
      if (data.level === "program" && data.result) {
        setSelectedProgram(data.result);
        return;
      }
      if (data.collapsible) {
        toggleCollapse(node.id);
        setSelectedProgram(null);
      }
    },
    [toggleCollapse],
  );

  return (
    <div className="border border-gray-200 rounded-xl bg-gray-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 bg-white flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-gray-500">Group by:</span>
        {GROUP_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setGroupBy(key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition
              ${groupBy === key
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
          <span className="text-emerald-600 font-semibold">HIGH</span>
          <span className="text-amber-600 font-semibold">MEDIUM</span>
          <span className="text-red-500 font-semibold">LOW</span>
        </div>
      </div>

      <div className="relative min-h-[520px] h-[60vh]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={mindMapNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
          <MiniMap
            nodeStrokeWidth={2}
            zoomable
            pannable
            className="!bg-white !border-gray-200"
          />
          <Background gap={16} size={1} color="#e5e7eb" />
        </ReactFlow>

        {selectedProgram && (
          <div className="absolute bottom-3 right-3 z-10 w-72 max-w-[calc(100%-1.5rem)] rounded-lg border border-gray-200 bg-white shadow-lg p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Program detail
                </p>
                <p className="text-xs font-bold text-gray-900 mt-0.5 leading-snug">
                  {selectedProgram.institute}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProgram(null)}
                className="text-gray-400 hover:text-gray-600 shrink-0"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-[11px] text-gray-700 leading-snug mb-2">{selectedProgram.program}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <span className="text-gray-500">Quota</span>
              <span className="text-gray-900 font-medium">{selectedProgram.quota}</span>
              <span className="text-gray-500">Seat type</span>
              <span className="text-gray-900 font-medium">{selectedProgram.seat_type}</span>
              <span className="text-gray-500">Closing rank</span>
              <span className="text-gray-900 font-medium">
                {selectedProgram.latest_closing_rank?.toLocaleString() ?? "N/A"}
              </span>
              <span className="text-gray-500">Confidence</span>
              <span className="text-gray-900 font-medium">
                {Math.round(selectedProgram.confidence_score * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>

      <p className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-200 bg-white">
        Click a college or group to expand/collapse branches. Click a program leaf for details.
        Pan and zoom to explore.
      </p>
    </div>
  );
}
