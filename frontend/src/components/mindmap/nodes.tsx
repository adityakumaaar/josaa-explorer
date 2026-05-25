import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { MindMapNodeData } from "../../lib/buildMindMapGraph";

type MindMapFlowNode = Node<MindMapNodeData, string>;
type MindMapNodeProps = NodeProps<MindMapFlowNode>;

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: "text-emerald-600",
  MEDIUM: "text-amber-600",
  LOW: "text-red-500",
};

const CONFIDENCE_BG: Record<string, string> = {
  HIGH: "bg-emerald-50 border-emerald-200",
  MEDIUM: "bg-amber-50 border-amber-200",
  LOW: "bg-red-50 border-red-200",
};

const GROUP_COLORS: Record<string, string> = {
  HIGH: "bg-emerald-100 text-emerald-800 border-emerald-300",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-300",
  LOW: "bg-red-100 text-red-800 border-red-300",
};

function CollapseChevron({ collapsed }: { collapsed?: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${collapsed ? "" : "rotate-90"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function RootNode({ data }: MindMapNodeProps) {
  const d = data;
  return (
    <div className="px-4 py-3 rounded-xl border-2 border-gray-900 bg-gray-900 text-white shadow-sm min-w-[160px]">
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
      <p className="text-sm font-bold">{d.label}</p>
      {d.sublabel && <p className="text-[11px] text-gray-300 mt-0.5">{d.sublabel}</p>}
      {d.count !== undefined && (
        <p className="text-[10px] text-gray-400 mt-1">{d.count} options</p>
      )}
    </div>
  );
}

export function GroupNode({ data }: MindMapNodeProps) {
  const d = data as MindMapNodeData & { collapsed?: boolean };
  const confidenceColor =
    d.groupBy === "confidence" ? GROUP_COLORS[d.label] ?? "bg-gray-100 text-gray-800" : "";

  return (
    <div
      className={`px-3 py-2 rounded-lg border shadow-sm min-w-[120px] cursor-pointer
        ${d.groupBy === "confidence" ? confidenceColor : "bg-sky-50 border-sky-200 text-sky-900"}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
      <div className="flex items-center gap-1.5">
        {d.collapsible && <CollapseChevron collapsed={d.collapsed} />}
        <div className="min-w-0">
          <p className="text-xs font-bold truncate">{d.label}</p>
          <p className="text-[10px] opacity-70">
            {d.childCount ?? 0} colleges · {d.count ?? 0} programs
          </p>
        </div>
      </div>
    </div>
  );
}

export function CollegeNode({ data }: MindMapNodeProps) {
  const d = data as MindMapNodeData & { collapsed?: boolean };

  return (
    <div className="px-3 py-2 rounded-lg border border-gray-200 bg-white shadow-sm min-w-[180px] max-w-[240px] cursor-pointer hover:border-gray-300">
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
      <div className="flex items-start gap-1.5">
        {d.collapsible && <CollapseChevron collapsed={d.collapsed} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 mb-0.5">
            {d.confidenceLabel && (
              <span className={`text-[9px] font-bold ${CONFIDENCE_COLORS[d.confidenceLabel]}`}>
                {d.confidenceLabel}
              </span>
            )}
          </div>
          <p className="text-[11px] font-semibold text-gray-900 leading-snug line-clamp-2">
            {d.label}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {d.state ? `${d.state} · ` : ""}
            {d.count ?? 0} program{(d.count ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ProgramNode({ data }: MindMapNodeProps) {
  const d = data;
  const tier = d.confidenceLabel ?? "LOW";
  const bg = CONFIDENCE_BG[tier] ?? "bg-gray-50 border-gray-200";

  return (
    <div className={`px-2.5 py-1.5 rounded-md border text-left min-w-[160px] max-w-[220px] cursor-pointer hover:brightness-95 ${bg}`}>
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <p className="text-[10px] font-medium text-gray-900 leading-snug line-clamp-2">{d.label}</p>
      <div className="flex items-center gap-2 mt-0.5">
        <span className={`text-[9px] font-bold ${CONFIDENCE_COLORS[tier]}`}>{tier}</span>
        {d.closingRank != null && (
          <span className="text-[9px] text-gray-500">CR {d.closingRank.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

export const mindMapNodeTypes = {
  root: RootNode,
  group: GroupNode,
  college: CollegeNode,
  program: ProgramNode,
};
