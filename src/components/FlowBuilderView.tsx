import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  BusinessFlow,
  SemanticCapability,
  Application,
  FlowNode as DomainFlowNode,
  FlowEdge as DomainFlowEdge,
} from '../types/automation';
import { Play, ShieldCheck, CheckCircle2, Save, Plus, Trash2, Layers, MonitorX, ChevronDown } from 'lucide-react';
import { api } from '../api';
import { studioNodeTypes } from './CustomWorkflowNode';

interface FlowBuilderViewProps {
  flow: BusinessFlow;
  capabilities: SemanticCapability[];
  applications: Application[];
  onSaveFlow: (flow: BusinessFlow) => Promise<void>;
  onTestFlow?: (flowId: string) => Promise<unknown>;
  onPublishFlow?: (flowId: string) => Promise<unknown>;
  onRunFlow?: (flowId: string) => void;
  isRunning?: boolean;
  compact?: boolean;
}

const edgeStyle = { stroke: '#818cf8', strokeWidth: 2 };

function isGenericCapability(cap: SemanticCapability) {
  return !cap.applicationId;
}

function capNodeType(cap: SemanticCapability): DomainFlowNode['type'] {
  const tableTypes = ['TABLE_OPERATION', 'TABLE_FILTER', 'TABLE_ROW_ACTION', 'TABLE_PROCESS_ROWS', 'EXTRACT'];
  return tableTypes.includes(cap.type) ? 'TABLE_PROCESS' : 'CAPABILITY';
}

function toRfNodes(flow: BusinessFlow): Node[] {
  return (flow.nodes || []).map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  }));
}

function toRfEdges(flow: BusinessFlow): Edge[] {
  return (flow.edges || []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    style: edgeStyle,
  }));
}

export const FlowBuilderView: React.FC<FlowBuilderViewProps> = ({
  flow,
  capabilities,
  applications,
  onSaveFlow,
  onTestFlow,
  onPublishFlow,
  onRunFlow,
  isRunning = false,
  compact = false,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(toRfNodes(flow));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRfEdges(flow));
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [flowApi, setFlowApi] = useState<ReactFlowInstance | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ generic: true });

  useEffect(() => {
    setNodes(toRfNodes(flow));
    setEdges(toRfEdges(flow));
  }, [flow.id, flow.updatedAt, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: edgeStyle }, eds)),
    [setEdges]
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) =>
      setEdges((els) => reconnectEdge(oldEdge, newConnection, els)),
    [setEdges]
  );

  const palette = useMemo(() => {
    const live = capabilities.filter((c) => !c.isRetired);
    const generic = live.filter(isGenericCapability);
    const byApp = new Map<string, { name: string; caps: SemanticCapability[] }>();
    for (const cap of live.filter((c) => !isGenericCapability(c))) {
      const app = applications.find((a) => a.id === cap.applicationId);
      const key = cap.applicationId || 'unknown';
      if (!byApp.has(key)) byApp.set(key, { name: app?.name || 'Application', caps: [] });
      byApp.get(key)!.caps.push(cap);
    }
    return { generic, apps: Array.from(byApp.entries()) };
  }, [capabilities, applications]);

  const persistGraph = (): BusinessFlow => ({
    ...flow,
    nodes: nodes.map(
      (n): DomainFlowNode => ({
        id: n.id,
        type: n.type as DomainFlowNode['type'],
        position: n.position,
        data: n.data as DomainFlowNode['data'],
      })
    ),
    edges: edges.map(
      (e): DomainFlowEdge => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
      })
    ),
  });

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      await onSaveFlow(persistGraph());
      const res = await api.validateFlow(flow.id);
      setFeedbackMessage(
        res.isValid ? 'Flow graph passed validation. Ready for test run.' : `Validation errors: ${(res.errors || []).join(', ')}`
      );
    } catch (e: unknown) {
      setFeedbackMessage(e instanceof Error ? e.message : 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const graph = persistGraph();
      if (graph.status === 'PRODUCTION') {
        graph.status = 'DRAFT';
      }
      await onSaveFlow(graph);
      setFeedbackMessage(
        flow.status === 'PRODUCTION'
          ? 'Graph saved and demoted to draft. Test Run, then Verify & Publish.'
          : 'Flow graph saved.'
      );
    } catch (e: unknown) {
      setFeedbackMessage('Failed to save flow: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsSaving(false);
    }
  };

  const addNode = (
    type: DomainFlowNode['type'],
    label: string,
    extra?: Partial<DomainFlowNode['data']>,
    position?: { x: number; y: number }
  ) => {
    const newNode: Node = {
      id: `node-${Date.now().toString(36)}`,
      type,
      position: position || { x: 80 + nodes.length * 36, y: 80 + (nodes.length % 4) * 72 },
      data: { label, ...extra },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleAddCapabilityNode = (cap: SemanticCapability, position?: { x: number; y: number }) => {
    addNode(capNodeType(cap), cap.businessName, { capabilityId: cap.id, description: cap.semanticDescription }, position);
  };

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const onDragStartCap = (event: React.DragEvent, cap: SemanticCapability) => {
    event.dataTransfer.setData('application/agent-cap', JSON.stringify(cap));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDropCap = (event: React.DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/agent-cap');
    if (!raw || !flowApi) return;
    try {
      const cap = JSON.parse(raw) as SemanticCapability;
      const position = flowApi.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      handleAddCapabilityNode(cap, position);
    } catch {
      /* ignore */
    }
  };

  const renderCap = (cap: SemanticCapability) => (
    <button
      key={cap.id}
      type="button"
      draggable
      onDragStart={(e) => onDragStartCap(e, cap)}
      onClick={() => handleAddCapabilityNode(cap)}
      className="w-full text-left p-2 bg-slate-950 hover:bg-indigo-950/40 border border-white/10 hover:border-indigo-400/40 rounded-lg cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium text-white text-[11px] truncate">{cap.businessName}</span>
        <Plus className="w-3 h-3 text-indigo-400 shrink-0" />
      </div>
      <span className="text-[10px] font-mono text-slate-500">{cap.type}</span>
    </button>
  );

  return (
    <div className={`flex flex-col min-h-0 h-full gap-3`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">{flow.name || 'Untitled flow'}</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
              {flow.status}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Drag a capability onto the canvas, or click to add.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Save graph
          </button>
          {!compact && (
            <>
              <button
                onClick={handleValidate}
                disabled={isValidating}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                Validate
              </button>
              {onTestFlow && (
                <button
                  onClick={() => onTestFlow(flow.id)}
                  disabled={isRunning}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Test Run
                </button>
              )}
              {onPublishFlow && (
                <button
                  onClick={async () => {
                    try {
                      await onPublishFlow(flow.id);
                      setFeedbackMessage('Published. Agent Run can execute this graph.');
                    } catch (e) {
                      setFeedbackMessage(e instanceof Error ? e.message : 'Publish requires last Test SUCCESS');
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verify & Publish
                </button>
              )}
              {onRunFlow && (
                <button
                  onClick={() => onRunFlow(flow.id)}
                  disabled={isRunning}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Run
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {feedbackMessage ? (
        <div className="p-2 rounded-lg text-[11px] flex items-center justify-between border border-slate-700 bg-slate-900 text-slate-200 shrink-0">
          <span>{feedbackMessage}</span>
          <button onClick={() => setFeedbackMessage(null)} className="text-slate-400 hover:text-white ml-2">
            ×
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 flex-1">
        <div className="lg:col-span-3 bg-slate-900/60 border border-white/10 rounded-xl p-3 space-y-2 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Capabilities
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => addNode('START', 'Start')}
              className="text-[10px] px-2 py-1 rounded-md bg-emerald-700/40 text-emerald-200"
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => addNode('END', 'End')}
              className="text-[10px] px-2 py-1 rounded-md bg-slate-700 text-slate-200"
            >
              End
            </button>
            <button
              type="button"
              onClick={() => addNode('CLOSE_BROWSER', 'Close browser')}
              className="text-[10px] px-2 py-1 rounded-md bg-rose-800/40 text-rose-200 flex items-center gap-1"
            >
              <MonitorX className="w-3 h-3" />
              Close browser
            </button>
          </div>
          <div className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-0">
            {palette.generic.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => toggleGroup('generic')}
                className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400 py-1"
              >
                Generic — unassigned ({palette.generic.length})
                <ChevronDown className={`w-3.5 h-3.5 transition ${openGroups.generic === false ? '-rotate-90' : ''}`} />
              </button>
              {openGroups.generic !== false && (
                <div className="space-y-1.5">{palette.generic.map(renderCap)}</div>
              )}
            </div>
            ) : null}
            {palette.apps.map(([appId, group]) => {
              const open = openGroups[appId] !== false;
              return (
                <div key={appId}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(appId)}
                    className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400 py-1"
                  >
                    <span className="truncate text-left">{group.name} ({group.caps.length})</span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition ${open ? '' : '-rotate-90'}`} />
                  </button>
                  {open && <div className="space-y-1.5">{group.caps.map(renderCap)}</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className={`lg:col-span-9 bg-slate-950 border border-white/10 rounded-xl overflow-hidden relative min-h-0 ${compact ? 'min-h-[360px]' : 'h-full'}`}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            nodeTypes={studioNodeTypes}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onInit={setFlowApi}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={onDropCap}
            fitView
            className="bg-slate-950"
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Controls className="!bg-slate-900 !border-slate-700 !fill-slate-200 !shadow-none" />
            <MiniMap
              nodeStrokeColor="#818cf8"
              nodeColor="#1e293b"
              maskColor="rgba(11, 15, 23, 0.75)"
              className="!bg-slate-900 !border-slate-700"
            />
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#334155" />
          </ReactFlow>

          {selectedNode ? (
            <div className="absolute right-3 top-3 w-64 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-xl p-3 text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-white">Node</span>
                <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white">
                  ✕
                </button>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Type</span>
                <span className="font-mono text-indigo-300">{selectedNode.type}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Label</span>
                <span className="font-semibold text-white">{String((selectedNode.data as { label?: string })?.label || '')}</span>
              </div>
              {(selectedNode.data as { description?: string })?.description ? (
                <p className="text-slate-400 text-[11px]">{String((selectedNode.data as { description?: string }).description)}</p>
              ) : null}
              <button
                onClick={() => {
                  setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                  setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
                  setSelectedNode(null);
                }}
                className="w-full py-1.5 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 rounded-lg font-semibold flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove node
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
