import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnEdgesChange,
  type OnNodeDrag,
  type OnNodesChange,
} from "@xyflow/react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Maximize2,
  Minus,
  Play,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Unlink,
  X,
} from "lucide-react";
import type {
  AgentWithStatus,
  Project,
  WorkflowEdge,
  WorkflowRecord,
  WorkflowRun,
  WorkflowStep,
} from "@codeteams/shared";
import { rpc } from "../lib/bridge";
import { selectedProjectIdAtom } from "../store/atoms";
import { Modal } from "../components/Modal";
import { AgentLogo } from "../components/AgentLogo";

interface GraphSnapshot {
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
}

interface AgentNodeData extends Record<string, unknown> {
  stepId: string;
  agentId: string;
  agentName: string;
  stageIndex: number;
  isParallelStage: boolean;
  onDelete: (stepId: string) => void;
}

const STEP_GAP_X = 286;
const STEP_GAP_Y = 148;
const BASE_X = 80;
const BASE_Y = 200;

function resolveInitialEdges(
  steps: WorkflowStep[],
  edges?: WorkflowEdge[]
): WorkflowEdge[] {
  if (edges !== undefined) return edges;
  return steps.slice(0, -1).map((step, idx) => ({
    id: `edge-${step.id}-${steps[idx + 1]!.id}`,
    source: step.id,
    target: steps[idx + 1]!.id,
  }));
}

function computeDagLayers(
  steps: WorkflowStep[],
  edges: WorkflowEdge[]
): WorkflowStep[][] | null {
  if (steps.length === 0) return [];
  const byId = new Map(steps.map((s) => [s.id, s]));
  const inDeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const s of steps) {
    inDeg.set(s.id, 0);
    out.set(s.id, []);
  }
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    out.get(e.source)!.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }
  const orderIdx = new Map(steps.map((s, idx) => [s.id, idx]));
  const layers: WorkflowStep[][] = [];
  let ready = steps.filter((s) => (inDeg.get(s.id) ?? 0) === 0);
  let visited = 0;

  while (ready.length > 0) {
    layers.push(ready);
    visited += ready.length;
    const nextReady: WorkflowStep[] = [];
    for (const node of ready) {
      for (const nxtId of out.get(node.id) ?? []) {
        const d = (inDeg.get(nxtId) ?? 0) - 1;
        inDeg.set(nxtId, d);
        if (d === 0) nextReady.push(byId.get(nxtId)!);
      }
    }
    nextReady.sort(
      (a, b) => (orderIdx.get(a.id) ?? 0) - (orderIdx.get(b.id) ?? 0)
    );
    ready = nextReady;
  }

  return visited === steps.length ? layers : null;
}

function autoLayoutSteps(
  steps: WorkflowStep[],
  edges: WorkflowEdge[]
): WorkflowStep[] {
  const layers = computeDagLayers(steps, edges) ?? steps.map((s) => [s]);
  const posById = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, colIdx) => {
    const totalHeight = (layer.length - 1) * STEP_GAP_Y;
    const startY = BASE_Y - totalHeight / 2;
    layer.forEach((step, rowIdx) => {
      posById.set(step.id, {
        x: Math.round(BASE_X + colIdx * STEP_GAP_X),
        y: Math.round(startY + rowIdx * STEP_GAP_Y),
      });
    });
  });
  return steps.map((s) => ({
    ...s,
    position: posById.get(s.id) ?? s.position ?? { x: BASE_X, y: BASE_Y },
  }));
}

const AgentChainNode: React.FC<NodeProps<Node<AgentNodeData>>> = React.memo(
  ({ data, selected }) => {
    return (
      <div
        className={`ct-chain-node group relative flex items-center gap-3.5 px-5 h-[96px] min-w-[214px] rounded-[14px] bg-white border transition-[border-color,box-shadow] duration-150 cursor-grab active:cursor-grabbing ${
          selected
            ? "border-[#3B82F6] shadow-[0_0_0_3px_rgba(59,130,246,0.14),0_8px_24px_rgba(59,130,246,0.14)]"
            : "border-slate-900/[0.1] shadow-[0_2px_10px_rgba(15,23,42,0.05)] hover:border-[#93C5FD]"
        }`}
      >
        <Handle
          type="target"
          position={Position.Left}
          title="拖线连接到此节点作为下游"
          className="!w-3 !h-3 !bg-white !border-[2px] !border-[#64748B] hover:!border-[#2563EB] hover:!bg-[#DBEAFE] hover:!scale-125 transition-transform duration-150"
        />

        <AgentLogo agentId={data.agentId} name={data.agentName} size={34} />

        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold text-[#141518] truncate leading-snug">
            {data.agentName}
          </div>
          <span
            className={`inline-block mt-1.5 px-2.5 py-0.5 rounded-[6px] text-[12px] font-medium ${
              data.isParallelStage
                ? "bg-[#EFF6FF] text-[#2563EB]"
                : "bg-[#F3F4F6] text-[#475569]"
            }`}
          >
            {data.isParallelStage
              ? `阶段 ${data.stageIndex + 1} · 并行`
              : `步骤 ${data.stageIndex + 1}`}
          </span>
        </div>

        {/* Hover remove control */}
        <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 absolute -top-3 right-2.5 flex items-center gap-0.5 bg-white border border-slate-900/[0.1] rounded-lg shadow-sm px-1 py-0.5 transition-opacity duration-150">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onDelete(data.stepId);
            }}
            className="p-1 text-[#64748B] hover:text-[#DC2626]"
            aria-label="移除节点"
            title="移除节点"
          >
            <Trash2 size={13} />
          </button>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          title="从此端口拖出连线到下游节点（可连多条并行分支）"
          className="!w-3 !h-3 !bg-white !border-[2px] !border-[#64748B] hover:!border-[#2563EB] hover:!bg-[#DBEAFE] hover:!scale-125 transition-transform duration-150"
        />
      </div>
    );
  }
);

const NODE_TYPES = { agentChain: AgentChainNode };

const WorkflowEditorInner: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { zoomIn, zoomOut, fitView, getZoom, screenToFlowPosition } =
    useReactFlow();
  const firstLibraryBtnRef = useRef<HTMLButtonElement>(null);

  const [selectedProjectId, setSelectedProjectId] = useAtom(selectedProjectIdAtom);
  const [workflowId, setWorkflowId] = useState<string | undefined>(
    isNew ? undefined : id
  );
  const [name, setName] = useState("新 Agent 团队");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<GraphSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<GraphSnapshot[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canvasNotice, setCanvasNotice] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [zoomPct, setZoomPct] = useState(100);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [objective, setObjective] = useState("");
  const [runError, setRunError] = useState<string | null>(null);
  const [startingRun, setStartingRun] = useState(false);

  const dragStartSnapshotRef = useRef<GraphSnapshot | null>(null);
  const isDraggingRef = useRef(false);
  const hasFitInitialRef = useRef(false);
  const [rfNodes, setRfNodes] = useState<Node<AgentNodeData>[]>([]);

  const showNotice = useCallback((msg: string) => {
    setCanvasNotice(msg);
    setTimeout(() => {
      setCanvasNotice((cur) => (cur === msg ? null : cur));
    }, 2600);
  }, []);

  const { data: agents = [] } = useQuery<AgentWithStatus[]>({
    queryKey: ["agents"],
    queryFn: () => rpc("agents.list"),
    refetchOnMount: "always",
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => rpc("projects.list", { includeArchived: false }),
    refetchOnMount: "always",
  });

  const { data: loadedWf } = useQuery<WorkflowRecord>({
    queryKey: ["workflow", id],
    queryFn: () => rpc("workflows.get", { workflowId: id! }),
    enabled: !isNew,
  });

  useEffect(() => {
    if (loadedWf) {
      setWorkflowId(loadedWf.id);
      setName(loadedWf.name);
      const resolvedEdges = resolveInitialEdges(
        loadedWf.definition.steps,
        loadedWf.definition.edges
      );
      const positionedSteps = loadedWf.definition.steps.map((s, idx) => ({
        ...s,
        position: s.position ?? { x: BASE_X + idx * STEP_GAP_X, y: BASE_Y },
      }));
      setSteps(positionedSteps);
      setEdges(resolvedEdges);
      setSelectedStepId(positionedSteps[0]?.id ?? null);
      setSelectedEdgeId(null);
      setDirty(false);
      hasFitInitialRef.current = false;
    }
  }, [loadedWf]);

  useEffect(() => {
    if (steps.length === 0 || hasFitInitialRef.current) return;
    hasFitInitialRef.current = true;
    const timer = setTimeout(() => {
      void fitView({ padding: 0.28, maxZoom: 1, duration: 180 });
      setTimeout(() => setZoomPct(Math.round(getZoom() * 100)), 210);
    }, 30);
    return () => clearTimeout(timer);
  }, [steps.length, fitView, getZoom]);

  const commitGraph = useCallback(
    (nextSteps: WorkflowStep[], nextEdges: WorkflowEdge[]) => {
      setUndoStack((u) => [...u.slice(-29), { steps, edges }]);
      setRedoStack([]);
      setSteps(nextSteps);
      setEdges(nextEdges);
      setDirty(true);
    },
    [steps, edges]
  );

  const handleAddAgent = useCallback(
    (
      agentId: string,
      dropPosition?: { x: number; y: number },
      autoConnectFromId?: string | null
    ) => {
      const anchor =
        (autoConnectFromId
          ? steps.find((s) => s.id === autoConnectFromId)
          : undefined) ??
        (selectedStepId
          ? steps.find((s) => s.id === selectedStepId)
          : undefined) ??
        steps[steps.length - 1];

      const position = dropPosition
        ? { x: Math.round(dropPosition.x), y: Math.round(dropPosition.y) }
        : anchor?.position
          ? {
              x: Math.round(anchor.position.x + STEP_GAP_X),
              y: Math.round(anchor.position.y),
            }
          : { x: BASE_X, y: BASE_Y };

      const nextStep: WorkflowStep = {
        id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        agentId,
        position,
      };

      const nextSteps = [...steps, nextStep];
      const nextEdges = [...edges];
      // When clicked from library (no explicit drop coordinates), link sequentially from anchor for quick chaining
      if (!dropPosition && anchor) {
        nextEdges.push({
          id: `edge-${anchor.id}-${nextStep.id}`,
          source: anchor.id,
          target: nextStep.id,
        });
      }

      commitGraph(nextSteps, nextEdges);
      setSelectedStepId(nextStep.id);
      setSelectedEdgeId(null);

      // Gently re-fit when building the initial nodes via click
      if (!dropPosition && nextSteps.length <= 4) {
        setTimeout(() => {
          void fitView({ padding: 0.28, maxZoom: 1, duration: 160 });
          setTimeout(() => setZoomPct(Math.round(getZoom() * 100)), 180);
        }, 25);
      }
    },
    [steps, edges, selectedStepId, commitGraph, fitView, getZoom]
  );

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      const nextSteps = steps.filter((s) => s.id !== stepId);
      const nextEdges = edges.filter(
        (e) => e.source !== stepId && e.target !== stepId
      );
      commitGraph(nextSteps, nextEdges);
      if (selectedStepId === stepId) setSelectedStepId(null);
    },
    [steps, edges, selectedStepId, commitGraph]
  );

  const handleDeleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    commitGraph(
      steps,
      edges.filter((e) => e.id !== selectedEdgeId)
    );
    setSelectedEdgeId(null);
  }, [selectedEdgeId, steps, edges, commitGraph]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;
      if (source === target) {
        showNotice("不能将节点连接到自身");
        return;
      }
      if (edges.some((e) => e.source === source && e.target === target)) {
        return;
      }
      const candidateEdge: WorkflowEdge = {
        id: `edge-${source}-${target}`,
        source,
        target,
      };
      const nextEdges = [...edges, candidateEdge];
      if (!computeDagLayers(steps, nextEdges)) {
        showNotice("不允许形成循环连线（必须是无环 DAG）");
        return;
      }
      commitGraph(steps, nextEdges);
    },
    [steps, edges, commitGraph, showNotice]
  );

  const handleDeleteStepRef = useRef(handleDeleteStep);
  handleDeleteStepRef.current = handleDeleteStep;
  const stableOnDelete = useCallback((stepId: string) => {
    handleDeleteStepRef.current(stepId);
  }, []);

  const handleNodesChange: OnNodesChange<Node<AgentNodeData>> = useCallback(
    (changes) => {
      const removedIds = new Set<string>();
      for (const ch of changes) {
        if (ch.type === "remove") {
          removedIds.add(ch.id);
        }
      }

      if (removedIds.size > 0) {
        const nextSteps = steps.filter((s) => !removedIds.has(s.id));
        const nextEdges = edges.filter(
          (e) => !removedIds.has(e.source) && !removedIds.has(e.target)
        );
        commitGraph(nextSteps, nextEdges);
        if (selectedStepId && removedIds.has(selectedStepId)) {
          setSelectedStepId(null);
        }
        return;
      }

      setRfNodes((prev) => changes.applyTo(prev));
    },
    [steps, edges, selectedStepId, commitGraph]
  );

  const handleNodeDragStart: OnNodeDrag<Node<AgentNodeData>> = useCallback(
    (_event, draggedNode) => {
      isDraggingRef.current = true;
      dragStartSnapshotRef.current = { steps, edges };
      setSelectedStepId(draggedNode.id);
      setSelectedEdgeId(null);
    },
    [steps, edges]
  );

  const handleNodeDragStop: OnNodeDrag<Node<AgentNodeData>> = useCallback(
    (_event, draggedNode, draggedNodes) => {
      isDraggingRef.current = false;
      const snap = dragStartSnapshotRef.current;
      dragStartSnapshotRef.current = null;
      const movedNodes =
        draggedNodes && draggedNodes.length > 0 ? draggedNodes : [draggedNode];
      const posUpdates = new Map<string, { x: number; y: number }>();
      for (const n of movedNodes) {
        posUpdates.set(n.id, {
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
        });
      }

      const nextSteps = steps.map((s) => {
        const nextPos = posUpdates.get(s.id);
        return nextPos ? { ...s, position: nextPos } : s;
      });

      const moved = nextSteps.some((cur) => {
        const oldStep = (snap?.steps ?? steps).find((s) => s.id === cur.id);
        return (
          oldStep &&
          (cur.position?.x !== oldStep.position?.x ||
            cur.position?.y !== oldStep.position?.y)
        );
      });

      if (moved) {
        if (snap) {
          setUndoStack((u) => [...u.slice(-29), snap]);
          setRedoStack([]);
        }
        setSteps(nextSteps);
        setDirty(true);
      }
    },
    [steps]
  );

  const handleEdgesChange: OnEdgesChange<Edge> = useCallback(
    (changes) => {
      const removedIds = new Set<string>();
      for (const ch of changes) {
        if (ch.type === "remove") {
          removedIds.add(ch.id);
        } else if (ch.type === "select") {
          setSelectedEdgeId((prev) =>
            ch.selected ? ch.id : prev === ch.id ? null : prev
          );
        }
      }
      if (removedIds.size > 0) {
        commitGraph(
          steps,
          edges.filter((e) => !removedIds.has(e.id))
        );
        setSelectedEdgeId(null);
      }
    },
    [steps, edges, commitGraph]
  );

  const handleAutoLayout = useCallback(() => {
    if (steps.length === 0) return;
    const laidOut = autoLayoutSteps(steps, edges);
    commitGraph(laidOut, edges);
    setTimeout(() => {
      void fitView({ padding: 0.28, maxZoom: 1, duration: 200 });
      setTimeout(() => setZoomPct(Math.round(getZoom() * 100)), 220);
    }, 25);
  }, [steps, edges, commitGraph, fitView, getZoom]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1]!;
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, { steps, edges }]);
    setSteps(prev.steps);
    setEdges(prev.edges);
    setDirty(true);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, { steps, edges }]);
    setSteps(next.steps);
    setEdges(next.edges);
    setDirty(true);
  };

  const handleSave = async (): Promise<WorkflowRecord> => {
    setSaving(true);
    try {
      const saved = await rpc<"workflows.save", WorkflowRecord>(
        "workflows.save",
        {
          ...(workflowId ? { id: workflowId } : {}),
          projectId: selectedProjectId,
          name: name.trim() || "未命名团队",
          steps: steps.map((s, idx) => ({
            ...s,
            position: s.position ?? { x: BASE_X + idx * STEP_GAP_X, y: BASE_Y },
          })),
          edges,
        }
      );
      setWorkflowId(saved.id);
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      if (isNew) {
        navigate(`/workflows/${saved.id}`, { replace: true });
      }
      return saved;
    } finally {
      setSaving(false);
    }
  };

  const handleOpenRunModal = async () => {
    setRunError(null);
    if (steps.length === 0) {
      setRunError("请至少添加一个 Coding Agent 成员后再运行。");
      setRunModalOpen(true);
      return;
    }
    if (dirty || !workflowId) {
      await handleSave();
    }
    setRunModalOpen(true);
  };

  const handleConfirmRun = async () => {
    setRunError(null);
    const targetProject = selectedProjectId ?? projects[0]?.id;
    if (!targetProject) {
      setRunError("请先在主界面打开一个本地项目目录。");
      return;
    }
    if (!objective.trim()) {
      setRunError("请输入本次任务需求。");
      return;
    }

    setStartingRun(true);
    try {
      const saved = dirty || !workflowId ? await handleSave() : null;
      const wfId = saved?.id ?? workflowId!;
      const trimmedObj = objective.trim();
      const run = await rpc<"runs.start", WorkflowRun>("runs.start", {
        projectId: targetProject,
        workflowId: wfId,
        objective: trimmedObj,
        idempotencyKey: `wf-run-${wfId}-${Date.now()}`,
      });
      const nowIso = new Date().toISOString();
      queryClient.setQueryData(["conversation", run.conversationId], {
        conversation: {
          id: run.conversationId,
          projectId: targetProject,
          title: trimmedObj.replace(/\s+/g, " ").slice(0, 60),
          mode: "workflow",
          agentId: null,
          workflowId: wfId,
          latestRunId: run.id,
          latestRunState: run.state,
          createdAt: nowIso,
          updatedAt: nowIso,
          archivedAt: null,
        },
        messages: [
          {
            id: `optimistic-user-${run.conversationId}`,
            conversationId: run.conversationId,
            sessionId: null,
            role: "user",
            seq: 1,
            kind: "text",
            content: trimmedObj,
            createdAt: nowIso,
          },
        ],
        sessions: [],
        runs: [run],
        pendingPermissions: [],
      });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setRunModalOpen(false);
      navigate(`/chat/${run.conversationId}`);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setStartingRun(false);
    }
  };

  const agentById = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents]
  );

  const dagLayers = useMemo(
    () => computeDagLayers(steps, edges) ?? steps.map((s) => [s]),
    [steps, edges]
  );

  const stageInfoByStepId = useMemo(() => {
    const map = new Map<string, { stageIndex: number; isParallel: boolean }>();
    dagLayers.forEach((layer, stageIndex) => {
      const isParallel = layer.length > 1;
      for (const s of layer) {
        map.set(s.id, { stageIndex, isParallel });
      }
    });
    return map;
  }, [dagLayers]);

  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return steps.map((step, idx) => {
        const existing = prevById.get(step.id);
        const info = stageInfoByStepId.get(step.id) ?? {
          stageIndex: idx,
          isParallel: false,
        };
        const nextPos =
          existing?.dragging || isDraggingRef.current
            ? (existing?.position ??
              step.position ?? { x: BASE_X + idx * STEP_GAP_X, y: BASE_Y })
            : (step.position ?? { x: BASE_X + idx * STEP_GAP_X, y: BASE_Y });
        const agentName = agentById.get(step.agentId)?.name ?? step.agentId;
        const selected = step.id === selectedStepId;

        if (
          existing &&
          existing.position.x === nextPos.x &&
          existing.position.y === nextPos.y &&
          existing.selected === selected &&
          existing.data.agentId === step.agentId &&
          existing.data.agentName === agentName &&
          existing.data.stageIndex === info.stageIndex &&
          existing.data.isParallelStage === info.isParallel
        ) {
          return existing;
        }

        return {
          ...existing,
          id: step.id,
          type: "agentChain",
          selected,
          position: nextPos,
          data: {
            stepId: step.id,
            agentId: step.agentId,
            agentName,
            stageIndex: info.stageIndex,
            isParallelStage: info.isParallel,
            onDelete: stableOnDelete,
          },
        };
      });
    });
  }, [steps, selectedStepId, agentById, stageInfoByStepId, stableOnDelete]);

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => {
        const isSelected = edge.id === selectedEdgeId;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          selected: isSelected,
          type: "default",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isSelected ? "#2563EB" : "#64748B",
            width: 17,
            height: 17,
          },
          style: {
            stroke: isSelected ? "#2563EB" : "#94A3B8",
            strokeWidth: isSelected ? 2.2 : 1.6,
          },
        };
      }),
    [edges, selectedEdgeId]
  );

  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    const agentId = e.dataTransfer.getData("application/codeteams-agent");
    if (!agentId) return;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    // Center the dropped 214x96 node around the drop cursor
    handleAddAgent(agentId, { x: flowPos.x - 107, y: flowPos.y - 48 }, null);
  };

  return (
    <div className="ct-canvas h-full w-full flex flex-col bg-[#FAFBFD] overflow-hidden">
      {/* Editor Sub-Toolbar */}
      <header className="h-[58px] shrink-0 px-6 border-b border-slate-900/[0.06] bg-white flex items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => navigate("/workflows")}
            className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#141518] hover:text-[#2563EB] transition shrink-0 whitespace-nowrap"
          >
            <ChevronLeft size={16} strokeWidth={2} />
            <span>{t("workflow.back")}</span>
          </button>

          <span className="h-4 w-px bg-slate-900/[0.1] shrink-0" />

          <input
            type="text"
            aria-label="团队名称"
            name="workflow-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            className="h-[36px] w-full max-w-[230px] min-w-[120px] px-3 rounded-[9px] border border-slate-900/[0.12] bg-[#FAFBFD] text-[14.5px] font-medium text-[#141518] focus:bg-white focus:border-[#3B82F6] focus:outline-none transition"
          />

          <span className="hidden lg:inline-block text-[12px] text-[#94A3B8] truncate">
            拖动节点调整位置 · 从右侧圆点拖线连接多个下游即可并行执行（如 1→2、1→3、2→4、3→4）
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[13.5px] hidden sm:inline-flex items-center gap-1.5 mr-1 whitespace-nowrap">
            {saving ? (
              <span className="text-[#64748B]">{t("workflow.saving")}</span>
            ) : dirty ? (
              <span className="text-[#D97706] font-medium">{t("workflow.unsaved")}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[#059669] font-medium">
                <Check size={15} strokeWidth={2.2} />
                <span>{t("workflow.saved")}</span>
              </span>
            )}
          </span>

          <button
            type="button"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            className="ct-btn-secondary w-9 h-9 inline-flex items-center justify-center text-[#374151] disabled:opacity-35"
            aria-label={t("workflow.undo")}
            title={t("workflow.undo")}
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            className="ct-btn-secondary w-9 h-9 inline-flex items-center justify-center text-[#374151] disabled:opacity-35"
            aria-label={t("workflow.redo")}
            title={t("workflow.redo")}
          >
            <Redo2 size={15} />
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="ct-btn-secondary h-9 px-4 text-[13.5px] font-medium whitespace-nowrap"
          >
            {t("workflow.save")}
          </button>

          <button
            type="button"
            onClick={() => void handleOpenRunModal()}
            className="ct-btn-primary inline-flex items-center gap-1.5 h-9 px-4 text-[13.5px] font-semibold whitespace-nowrap"
          >
            <Play size={13} fill="currentColor" />
            <span>{t("workflow.run")}</span>
          </button>
        </div>
      </header>

      {/* Main Canvas Workspace */}
      <div
        className="flex-1 relative flex min-h-0"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnCanvas}
      >
        {/* Left Node Library Panel */}
        {pickerOpen ? (
          <aside className="ct-canvas-library w-[236px] shrink-0 border-r border-slate-900/[0.06] bg-white flex flex-col z-10">
            <div className="px-4 pt-4 pb-3 shrink-0">
              <div className="text-[14.5px] font-bold text-[#141518]">
                {t("workflow.nodeLibrary")}
              </div>
              <div className="text-[12px] text-[#64748B] mt-0.5 leading-snug">
                点击串行追加，或直接拖到画布任意位置自由连线
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3.5 pb-4 space-y-2">
              {agents.map((agent, idx) => (
                <button
                  key={agent.id}
                  ref={idx === 0 ? firstLibraryBtnRef : undefined}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/codeteams-agent",
                      agent.id
                    );
                  }}
                  onClick={() => handleAddAgent(agent.id)}
                  className="w-full flex items-center gap-2.5 h-[44px] px-3 rounded-[10px] border border-slate-900/[0.08] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.025)] hover:border-[#93C5FD] hover:bg-[#F5F9FF] transition text-left cursor-grab active:cursor-grabbing"
                >
                  <AgentLogo
                    agentId={agent.id}
                    name={agent.name}
                    size={22}
                  />
                  <span className="text-[13.5px] font-medium text-[#141518] truncate">
                    {agent.name}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-11 rounded-lg border border-slate-900/[0.1] bg-white shadow-sm flex items-center justify-center text-[#64748B] hover:text-[#2563EB] transition"
            aria-label="展开节点库"
            title="展开节点库"
          >
            <ChevronRight size={16} />
          </button>
        )}

        {/* Dotted React Flow DAG Canvas */}
        <div className="flex-1 h-full relative min-w-0">
          {canvasNotice && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3.5 py-2 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-[12.5px] font-medium text-[#DC2626] shadow-sm">
              {canvasNotice}
            </div>
          )}

          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeClick={(_e, node) => {
              setSelectedStepId(node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_e, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedStepId(null);
            }}
            onPaneClick={() => {
              setSelectedStepId(null);
              setSelectedEdgeId(null);
            }}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onMoveEnd={() => setZoomPct(Math.round(getZoom() * 100))}
            fitView
            fitViewOptions={{ padding: 0.28, maxZoom: 1 }}
            nodesDraggable
            nodesConnectable
            elementsSelectable
            deleteKeyCode={["Backspace", "Delete"]}
            panOnDrag
            minZoom={0.35}
            maxZoom={1.8}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.2}
              color="#CBD5E1"
            />
            <MiniMap
              nodeColor="#ffffff"
              nodeStrokeColor={(n) => (n.selected ? "#3B82F6" : "#94A3B8")}
              nodeStrokeWidth={2}
              nodeBorderRadius={8}
              maskColor="rgba(248, 250, 252, 0.72)"
              style={{ width: 170, height: 92 }}
              pannable
              zoomable
            />
          </ReactFlow>

          {steps.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="ct-card px-5 py-3 text-[13.5px] text-[#64748B]">
                {t("workflow.emptyCanvasHint")}
              </div>
            </div>
          )}

          {/* Floating Bottom Toolbar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-3 py-1.5 rounded-[13px] bg-white border border-slate-900/[0.08] shadow-[0_4px_18px_rgba(15,23,42,0.08)] whitespace-nowrap">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => {
                zoomOut();
                setTimeout(() => setZoomPct(Math.round(getZoom() * 100)), 80);
              }}
              className="p-2 rounded-lg text-[#374151] hover:bg-[#F3F4F6] transition"
            >
              <Minus size={14} />
            </button>
            <span className="text-[13.5px] font-medium text-[#141518] w-11 text-center tabular-nums">
              {zoomPct}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => {
                zoomIn();
                setTimeout(() => setZoomPct(Math.round(getZoom() * 100)), 80);
              }}
              className="p-2 rounded-lg text-[#374151] hover:bg-[#F3F4F6] transition"
            >
              <Plus size={14} />
            </button>
            <div className="w-px h-4 bg-slate-900/[0.1] mx-1" />
            <button
              type="button"
              onClick={() => {
                fitView({ padding: 0.28, maxZoom: 1 });
                setTimeout(() => setZoomPct(Math.round(getZoom() * 100)), 120);
              }}
              className="p-2 rounded-lg text-[#374151] hover:bg-[#F3F4F6] transition"
              aria-label="适应画布"
              title="适应画布"
            >
              <Maximize2 size={14} />
            </button>
            <button
              type="button"
              disabled={steps.length === 0}
              onClick={handleAutoLayout}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-[#374151] hover:bg-[#F3F4F6] disabled:opacity-35 transition"
              aria-label="自动排布"
              title="按并行阶段自动排布节点"
            >
              <LayoutGrid size={13.5} />
              <span>自动排布</span>
            </button>
            {selectedEdgeId && (
              <>
                <div className="w-px h-4 bg-slate-900/[0.1] mx-1" />
                <button
                  type="button"
                  onClick={handleDeleteSelectedEdge}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2] transition"
                >
                  <Unlink size={13.5} />
                  <span>删除连线</span>
                </button>
              </>
            )}
            <div className="w-px h-4 bg-slate-900/[0.1] mx-1" />
            <button
              type="button"
              onClick={() => {
                setPickerOpen(true);
                setTimeout(() => firstLibraryBtnRef.current?.focus(), 0);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13.5px] font-medium text-[#141518] hover:bg-[#F3F4F6] transition"
            >
              <Plus size={14} />
              <span>{t("workflow.addNode")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Run Modal */}
      {runModalOpen && (
        <Modal
          open={runModalOpen}
          onOpenChange={setRunModalOpen}
          title={t("workflow.runModalTitle")}
        >
          <div className="w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[17px] font-bold text-[#141518]">
                {t("workflow.runModalTitle")} · {name}
              </h3>
              <button
                type="button"
                onClick={() => setRunModalOpen(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#64748B]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap bg-[#F8F9FC] border border-slate-900/[0.07] rounded-[11px] px-4 py-3">
              {dagLayers.map((layer, layerIdx) => (
                <React.Fragment key={layerIdx}>
                  {layer.length > 1 ? (
                    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[8px] bg-[#EFF6FF] border border-[#BFDBFE]">
                      {layer.map((s, sIdx) => (
                        <React.Fragment key={s.id}>
                          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#1E3A8A]">
                            <AgentLogo agentId={s.agentId} size={17} />
                            <span>
                              {agentById.get(s.agentId)?.name ?? s.agentId}
                            </span>
                          </span>
                          {sIdx < layer.length - 1 && (
                            <span className="text-[#93C5FD] text-[12px] font-bold">
                              /
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#141518]">
                      <AgentLogo agentId={layer[0]!.agentId} size={18} />
                      <span>
                        {agentById.get(layer[0]!.agentId)?.name ??
                          layer[0]!.agentId}
                      </span>
                    </span>
                  )}
                  {layerIdx < dagLayers.length - 1 && (
                    <ArrowRight size={13} className="text-[#64748B]" />
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-[13.5px] font-medium text-[#374151]">
                目标项目目录
              </label>
              <select
                aria-label="Project"
                value={selectedProjectId ?? projects[0]?.id ?? ""}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full h-[40px] px-3.5 rounded-[10px] border border-slate-900/[0.12] text-[14px] bg-white focus:outline-none focus:border-[#3B82F6]"
              >
                {projects.length === 0 ? (
                  <option value="">请先在主界面打开本地项目目录</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.canonicalPath}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13.5px] font-medium text-[#374151]">
                {t("workflow.runModalObjective")}
              </label>
              <textarea
                aria-label={t("workflow.runModalObjective")}
                rows={4}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder={t("workflow.runModalPlaceholder")}
                className="w-full px-3.5 py-2.5 rounded-[10px] border border-slate-900/[0.12] text-[14px] focus:outline-none focus:border-[#3B82F6] resize-none"
              />
            </div>

            {runError && (
              <div className="px-3.5 py-2.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[13.5px] text-[#DC2626]">
                {runError}
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setRunModalOpen(false)}
                className="ct-btn-secondary h-[38px] px-4 text-[13.5px] font-medium"
              >
                取消
              </button>
              <button
                type="button"
                disabled={startingRun || steps.length === 0}
                onClick={() => void handleConfirmRun()}
                className="ct-btn-primary inline-flex items-center gap-1.5 h-[38px] px-5 text-[13.5px] font-semibold disabled:opacity-40"
              >
                <Play size={13} fill="currentColor" />
                <span>{t("workflow.startRun")}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export const WorkflowEditorPage: React.FC = () => (
  <ReactFlowProvider>
    <WorkflowEditorInner />
  </ReactFlowProvider>
);
