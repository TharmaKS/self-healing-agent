import React, { useState, useEffect, useRef } from 'react';
import {
  WorkflowBuildSession,
  BusinessFlow,
  Application,
  AgentMode,
  ObservationResult,
} from '../types/automation';
import { api, createWebSocketClient } from '../api';
import { ExecutionTracePopup, TraceRow, TraceStep } from './ExecutionTracePopup';
import {
  Send,
  RotateCcw,
  Sparkles,
  Bot,
  User,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Play,
  FileSpreadsheet,
  Download,
  Eye,
  ShieldCheck,
  ChevronRight,
  Database,
  ArrowRight,
  RefreshCw,
  Square,
} from 'lucide-react';

function mergeSessionKeepRemap(
  incoming: WorkflowBuildSession,
  prev: WorkflowBuildSession | null
): WorkflowBuildSession {
  if (!prev) return incoming;
  const extras = prev.messages.filter(
    (m) =>
      !incoming.messages.some((n) => n.id === m.id) &&
      (m.card?.type === 'REMAP_REQUEST' ||
        String(m.id).startsWith('remap-') ||
        String(m.id).startsWith('msg-note-'))
  );
  if (!extras.length) return incoming;
  return { ...incoming, messages: [...incoming.messages, ...extras] };
}

function emptyLiveSession(): WorkflowBuildSession {
  const now = new Date().toISOString();
  return {
    id: 'live-run',
    workflowName: '',
    description: '',
    applicationId: '',
    currentState: 'TEST_FLOW',
    confirmedCapabilities: [],
    confirmedSteps: [],
    variables: {},
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

interface AgentChatViewProps {
  currentMode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  onNavigateToTab?: (tab: string) => void;
  onFlowSelectedForRun?: (flow: BusinessFlow) => void;
}

export const AgentChatView: React.FC<AgentChatViewProps> = ({
  currentMode,
  onModeChange,
  onNavigateToTab,
  onFlowSelectedForRun,
}) => {
  const [session, setSession] = useState<WorkflowBuildSession | null>(null);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableFlows, setAvailableFlows] = useState<BusinessFlow[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [contextFlow, setContextFlow] = useState<BusinessFlow | null>(null);
  const [planStatus, setPlanStatus] = useState<Record<string, string>>({});
  const [mysqlConnected, setMysqlConnected] = useState<boolean | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [traceStepName, setTraceStepName] = useState('');
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [traceRows, setTraceRows] = useState<TraceRow[]>([]);
  const [traceRowIndex, setTraceRowIndex] = useState(0);
  const [traceHelp, setTraceHelp] = useState<{
    message: string;
    interventionId: string;
    candidates: Array<{ text: string; selector?: string; confidence?: number }>;
  } | null>(null);
  const [liveExecutionId, setLiveExecutionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load active session and supporting metadata
  useEffect(() => {
    loadSession();
    loadMetadata();
  }, []);

  useEffect(() => {
    return createWebSocketClient((msg) => {
      const stepId = String(msg.payload?.stepId || msg.correlationIds?.stepId || '');
      const label = String(msg.payload?.stepName || '');
      const key = stepId || label;
      if (msg.type === 'BUILD_SESSION_UPDATED' && msg.payload?.session) {
        const incoming = msg.payload.session as WorkflowBuildSession;
        setSession((prev) => mergeSessionKeepRemap(incoming, prev));
      }
      if (msg.type === 'AGENT_MESSAGE_CREATED') {
        const text = String(msg.payload?.text || msg.payload?.message || '');
        const id = String(msg.payload?.id || `note-${Date.now()}`);
        const options = (msg.payload?.options as WorkflowBuildSession['messages'][number]['options']) || [];
        const card = msg.payload?.card as WorkflowBuildSession['messages'][number]['card'] | undefined;
        if (text) {
          setRunActive(true);
          setSession((prev) => {
            const base = prev || emptyLiveSession();
            const interventionId = card?.data?.interventionId;
            if (
              base.messages.some(
                (m) =>
                  m.id === id ||
                  (interventionId && m.card?.type === 'REMAP_REQUEST' && m.card?.data?.interventionId === interventionId)
              )
            ) {
              return base;
            }
            return {
              ...base,
              messages: [
                ...base.messages,
                {
                  id,
                  sender: 'agent',
                  text,
                  options: options.length ? options : undefined,
                  card,
                  timestamp: new Date().toISOString(),
                },
              ],
            };
          });
        }
      }
      if (msg.type === 'HUMAN_INTERVENTION_REQUIRED') {
        setTraceOpen(true);
        setRunActive(true);
        const candidates = ((msg.payload?.candidates as Array<{ text?: string; selector?: string; confidence?: number }>) || []).map((c) => ({
          text: String(c.text || ''),
          selector: c.selector,
          confidence: typeof c.confidence === 'number' ? c.confidence : undefined,
        }));
        const interventionId = String(msg.payload?.interventionId || '');
        const expectedIntent = String(msg.payload?.expectedIntent || '');
        const kind = String(msg.payload?.kind || 'CONTROL');
        setTraceHelp({
          message:
            kind === 'COLUMN'
              ? `Could not find column "${expectedIntent}".`
              : `Could not click "${expectedIntent || 'this control'}".`,
          interventionId,
          candidates: candidates.filter((c) => c.text),
        });
        if (interventionId) {
          const isColumn = kind === 'COLUMN';
          setSession((prev) => {
            const base = prev || emptyLiveSession();
            if (base.messages.some((m) => m.card?.data?.interventionId === interventionId || m.id === `remap-${interventionId}`)) {
              return base;
            }
            return {
              ...base,
              messages: [
                ...base.messages,
                {
                  id: `remap-${interventionId}`,
                  sender: 'agent',
                  text: isColumn ? `Could not find column "${expectedIntent}".` : `Could not click "${expectedIntent}".`,
                  options: [
                    { id: `trace-retry-${interventionId}`, label: 'Retry', type: 'primary' },
                    ...candidates.filter((c) => c.text).slice(0, 6).map((c, i) => ({
                      id: `trace-map-${interventionId}-${i}`,
                      label: `Use ${c.text}`,
                      type: 'secondary' as const,
                      badge: typeof c.confidence === 'number' ? `${Math.round(c.confidence * 100)}%` : undefined,
                      payload: { interventionId, selectedTarget: c.text, selector: c.selector },
                    })),
                    {
                      id: `trace-skip-${interventionId}`,
                      label: isColumn ? 'Skip filter' : 'Skip this row',
                      type: 'secondary' as const,
                    },
                  ],
                  card: {
                    type: 'REMAP_REQUEST',
                    data: {
                      interventionId,
                      expectedIntent,
                      kind,
                      need: isColumn
                        ? 'Choose the column for this filter.'
                        : 'Choose the control that means the same thing.',
                    },
                  },
                  timestamp: new Date().toISOString(),
                },
              ],
            };
          });
        }
      }
      if (msg.type === 'FLOW_STARTED') {
        setRunActive(true);
        setLiveExecutionId(String(msg.payload?.executionId || '') || null);
        setTraceOpen(true);
        setTraceHelp(null);
        setTraceRows([]);
        setTraceRowIndex(0);
        setTraceStepName(String(msg.payload?.flowName || 'Running'));
        setTraceSteps([]);
      }
      if (msg.type === 'TABLE_OBSERVED') {
        setTraceOpen(true);
        const ids = (msg.payload?.matchedRowIds as string[]) || [];
        setTraceRows(
          ids.map((rowId) => ({
            rowId,
            status: 'PENDING' as const,
            line: 'Waiting',
          }))
        );
        setTraceRowIndex(0);
      }
      if (msg.type === 'ROW_STARTED') {
        setTraceOpen(true);
        const rowId = String(msg.payload?.rowId || '');
        const idx = Number(msg.payload?.rowIndex ?? 0);
        setTraceRowIndex(Number.isFinite(idx) ? idx : 0);
        setTraceRows((prev) => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], status: 'RUNNING', line: String(msg.payload?.actionIntent || 'click') };
          else if (rowId) next.push({ rowId, status: 'RUNNING', line: String(msg.payload?.actionIntent || 'click') });
          return next;
        });
      }
      if (msg.type === 'ROW_COMPLETED' || msg.type === 'ROW_FAILED') {
        const rowId = String(msg.payload?.rowId || '');
        const idx = Number(msg.payload?.rowIndex ?? -1);
        const ok = msg.type === 'ROW_COMPLETED' && String(msg.payload?.result || 'SUCCESS') !== 'FAILED';
        const waiting = Boolean(msg.payload?.waiting);
        setTraceRows((prev) =>
          prev.map((r, i) => {
            if ((idx >= 0 && i === idx) || r.rowId === rowId) {
              return {
                ...r,
                status: waiting ? 'RUNNING' : ok ? 'PASSED' : 'FAILED',
                line: String(msg.payload?.line || msg.payload?.error || r.line),
              };
            }
            return r;
          })
        );
      }
      if (msg.type === 'HUMAN_INTERVENTION_COMPLETED') {
        setTraceHelp(null);
      }
      if (msg.type === 'EXECUTION_COMPLETED') {
        setTraceHelp(null);
        setLiveExecutionId(null);
      }
      if (!key) return;
      if (msg.type === 'STEP_STARTED' || msg.type === 'STEP_COMPLETED') {
        const failed = msg.type === 'STEP_COMPLETED' && String(msg.payload?.status || '') === 'FAILED';
        const status = msg.type === 'STEP_STARTED' ? 'RUNNING' : failed ? 'FAILED' : 'PASSED';
        setPlanStatus((prev) => ({
          ...prev,
          [key]: status,
        }));
        setTraceOpen(true);
        setTraceStepName(label || key);
        setTraceSteps((prev) => {
          const existing = prev.find((s) => s.id === key);
          if (existing) {
            return prev.map((s) => (s.id === key ? { ...s, name: label || s.name, status } : s));
          }
          return [...prev, { id: key, name: label || key, status }];
        });
      }
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages, isLoading]);

  const loadSession = async () => {
    try {
      const sess = await api.getAgentSession();
      setSession(sess);
    } catch (e) {
      console.error('Failed to load agent session', e);
    }
  };

  const loadMetadata = async () => {
    try {
      const [flows, apps, health] = await Promise.all([
        api.getFlows(),
        api.getApplications(),
        api.getHealth().catch(() => null),
      ]);
      setAvailableFlows(flows.filter((f) => !f.isRetired && f.latestTestStatus === 'SUCCESS' && (f.status === 'PRODUCTION' || f.status === 'TEST' || f.status === 'APPROVED')));
      setApplications(apps.filter((a) => a.isActive));
      if (health) setMysqlConnected(health.mysql);
    } catch (e) {
      console.error('Failed to load flows/apps', e);
    }
  };

  const [flowName, setFlowName] = useState('');
  const [flowDesc, setFlowDesc] = useState('');
  const [runActive, setRunActive] = useState(false);

  const lastObservation = ((session?.variables?.lastObservation as ObservationResult | undefined) ||
    [...(session?.messages || [])].reverse().find((m) => m.card?.type === 'OBSERVATION')?.card?.data
      ?.observation) as ObservationResult | undefined;
  const lastFlowDefIndex = session
    ? session.messages.findLastIndex((m) => m.card?.type === 'FLOW_DEFINITION')
    : -1;
  const displayedMessages = !session
    ? []
    : currentMode === 'RUN'
      ? session.messages.slice(
          Math.max(
            0,
            session.messages.findLastIndex(
              (m) => m.sender === 'user' && m.text.toLowerCase().startsWith('run ')
            )
          )
        )
      : session.messages;
  const lastOptionId = [...displayedMessages].reverse().find((m) => m.sender === 'agent' && !!m.options?.length)?.id;
  const lastRowActionId = [...displayedMessages].reverse().find((m) => m.card?.type === 'ROW_ACTION_PICKER')?.id;
  const lastAgentMessage = session
    ? [...session.messages].reverse().find((m) => m.sender === 'agent')
    : undefined;
  const lastThreadMsg = session?.messages.at(-1);
  const wizardStep = (session?.variables?.tableWizard as { step?: string } | undefined)?.step;
  const pendingOptions =
    lastThreadMsg?.sender === 'agent'
      ? lastThreadMsg.options?.length
        ? lastThreadMsg.options
        : lastOptionId && lastThreadMsg.id === lastOptionId
          ? displayedMessages.find((m) => m.id === lastOptionId)?.options || []
          : []
      : [];
  const hasInlineForm =
    lastAgentMessage?.card?.type === 'FLOW_DEFINITION' && session?.currentState === 'ASK_FLOW_DEFINITION';
  const hasEnvChips = pendingOptions.some((o) => o.id.startsWith('filter-env-'));
  const needsTypedEnv =
    session?.currentState === 'AWAIT_FILTER' && wizardStep === 'envName' && !hasEnvChips;
  const needsTypedName =
    (session?.currentState === 'ASK_WORKFLOW_NAME' || session?.currentState === 'ASK_WORKFLOW_DESCRIPTION') &&
    !hasInlineForm;
  const showComposer =
    currentMode === 'BUILD' && !!session && (needsTypedEnv || (pendingOptions.length === 0 && needsTypedName));

  useEffect(() => {
    if (currentMode !== 'RUN') setRunActive(false);
  }, [currentMode]);

  const handleSendMessage = async (
    textToSend?: string,
    chosenOptionId?: string,
    payload?: Record<string, unknown>
  ) => {
    const text = textToSend !== undefined ? textToSend : inputText;
    if (!text.trim() && !chosenOptionId && !payload) return;

    if (!session) return;

    if (chosenOptionId === 'act-register-app') {
      onNavigateToTab?.('applications');
    }
    if (chosenOptionId === 'view-capabilities') {
      onNavigateToTab?.('capabilities');
      return;
    }
    if (chosenOptionId === 'view-flows') {
      onNavigateToTab?.('flows');
      return;
    }
    if (chosenOptionId === 'mode-run' || chosenOptionId === 'act-switch-run') {
      onModeChange('RUN');
    }

    setInputText('');
    if (!chosenOptionId?.startsWith('trace-')) setIsLoading(true);

    try {
      if (chosenOptionId?.startsWith('trace-retry-')) {
        await api.resolveIntervention(chosenOptionId.replace('trace-retry-', ''), 'RETRY');
        return;
      }
      if (chosenOptionId?.startsWith('trace-skip-')) {
        await api.resolveIntervention(chosenOptionId.replace('trace-skip-', ''), 'SKIP');
        return;
      }
      if (chosenOptionId?.startsWith('trace-map-')) {
        const rest = chosenOptionId.replace(/^trace-map-/, '');
        const interventionId = String(payload?.interventionId || rest.replace(/-\d+$/, ''));
        const target = String(payload?.selectedTarget || text).replace(/^use\s+/i, '').trim();
        await api.resolveIntervention(interventionId, 'CONFIRM', target);
        return;
      }
      const updated = await api.sendAgentMessage(session.id, text || chosenOptionId || '', chosenOptionId, payload);
      setSession((prev) => mergeSessionKeepRemap(updated, prev));
      if (updated.currentState === 'BUILD_COMPLETE' || chosenOptionId === 'save-flow-confirm') {
        loadMetadata();
      }
    } catch (e) {
      console.error('Failed to send agent message', e);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleResetSession = async () => {
    setIsLoading(true);
    try {
      const fresh = await api.resetAgentSession();
      setSession(fresh);
      loadMetadata();
    } catch (e) {
      console.error('Failed to reset session', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunFlowDirectly = async (flow: BusinessFlow) => {
    setContextFlow(flow);
    setPlanStatus({});
    setTraceOpen(true);
    setRunActive(true);
    setIsLoading(true);
    try {
      let sess = session;
      if (!sess) {
        sess = await api.getAgentSession();
        setSession(sess);
      }
      const updated = await api.sendAgentMessage(sess.id, `Run ${flow.name}`, `run-flow-${flow.id}`);
      setSession((prev) => mergeSessionKeepRemap(updated, prev));
    } catch (e) {
      console.error('Run failed', e);
    } finally {
      setIsLoading(false);
    }
    onFlowSelectedForRun?.(flow);
  };

  // Determine placeholder based on build state
  const getInputPlaceholder = () => {
    if (!session) return 'Type your response...';
    if (session.currentState === 'ASK_WORKFLOW_NAME') {
      return 'Enter workflow name (e.g., Process Medicare Part A claims)...';
    }
    if (session.currentState === 'ASK_WORKFLOW_DESCRIPTION') {
      return 'Enter workflow business description and requirements...';
    }
    if (session.currentState === 'AWAIT_FILTER') {
      return 'Choose a column, operator, or existing .env key name...';
    }
    if (session.currentState === 'WAIT_FOR_USER_SELECTION') {
      return 'Choose a page action in the last agent message...';
    }
    return 'Type a command, question, or custom direction...';
  };

  const resolveTrace = async (interventionId: string, action: 'RETRY' | 'CONFIRM' | 'SKIP', target?: string) => {
    try {
      await api.resolveIntervention(interventionId, action, target);
      setTraceHelp(null);
    } catch (e) {
      console.error('Failed to resolve intervention', e);
    }
  };

  const handleStopRun = async () => {
    if (!liveExecutionId) return;
    try {
      await api.stopExecution(liveExecutionId);
    } catch (e) {
      console.error('Failed to stop execution', e);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 text-slate-100">
      <div className="flex flex-col flex-1 min-w-0">
      <div className="px-5 py-3 border-b border-white/10 bg-[#0b1220]/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-white text-[15px] tracking-tight">
                Agent
              </h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
                mysqlConnected === true
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : mysqlConnected === false
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {mysqlConnected === true
                  ? 'MySQL connected'
                  : mysqlConnected === false
                    ? 'JSON store (MySQL offline)'
                    : 'Checking storage'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Teach on a live page, then run saved flows
            </p>
          </div>
        </div>

        {/* 2 Primary Modes Only: BUILD | RUN */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {liveExecutionId ? (
            <button
              type="button"
              onClick={handleStopRun}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-md border border-rose-400/40 shadow-sm shadow-rose-600/20"
              title="Stop after the current click. Browser stays open."
            >
              <Square className="w-3 h-3 fill-current" />
              Stop run
            </button>
          ) : null}
          <div className="flex items-center bg-slate-950/70 p-0.5 rounded-lg border border-white/10">
            <button
              onClick={() => onModeChange('BUILD')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                currentMode === 'BUILD'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              BUILD MODE
            </button>
            <button
              onClick={() => onModeChange('RUN')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                currentMode === 'RUN'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RUN MODE
            </button>
          </div>

          {currentMode === 'BUILD' && (
            <>
              <button
                onClick={() => handleSendMessage('Re-observe current page', 'obs-refresh')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600/40 rounded-md border border-indigo-500/40 transition"
                title="Bind the open or local app, then read the live page"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Re-observe</span>
              </button>
              <button
                onClick={handleResetSession}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-md border border-slate-700 transition"
                title="Reset Conversation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Agent</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
        <div className="max-w-3xl mx-auto space-y-5">
        {currentMode === 'BUILD' && (
        <div className="surface p-4 text-xs text-slate-300 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-white">
                {currentMode === 'BUILD' ? 'Build — teach the agent' : 'Run — execute a saved flow'}
              </p>
              <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                {currentMode === 'BUILD'
                  ? 'Name the flow, open the application, then map capabilities from the live page.'
                  : 'Pick a flow that passed Test. The agent replays it in one browser session.'}
              </p>
            </div>
          </div>
          {currentMode === 'BUILD' && session?.workflowName && (
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Workflow</span>
              <span className="font-semibold text-indigo-300 text-xs">{session.workflowName}</span>
            </div>
          )}
        </div>
        )}

        {currentMode === 'RUN' && (
          <div className="surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Available flows</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Do you want to execute one of the listed flows?
                </p>
              </div>
              <button
                onClick={loadMetadata}
                className="btn-ghost"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {availableFlows.length === 0 ? (
              <div className="text-center py-8 rounded-xl border border-dashed border-white/10">
                <p className="text-sm font-medium text-slate-300">No runnable flows yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Save a successful Test in BUILD, then use the BUILD / RUN toggle.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableFlows.map((flow) => (
                  <div
                    key={flow.id}
                    className="p-3.5 rounded-xl border border-white/10 bg-slate-950/50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm">{flow.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">v{flow.version}</span>
                      </div>
                      {flow.description ? (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{flow.description}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRunFlowDirectly(flow)}
                      className="btn-primary shrink-0"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Execute
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BUILD and RUN chat stream */}
        {session && (currentMode === 'BUILD' || (currentMode === 'RUN' && (runActive || displayedMessages.some((m) => m.card?.type === 'REMAP_REQUEST')))) && (
          <div className="space-y-4">
            {displayedMessages.map((msg, msgIndex) => (
              <div
                key={msg.id}
                className={`flex gap-3.5 ${
                  msg.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.sender === 'agent' && (
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex-shrink-0 flex items-center justify-center text-indigo-400 shadow-sm mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-4 ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-md'
                      : 'border border-white/10 bg-slate-900/70 text-slate-100 rounded-tl-md'
                  }`}
                >
                  {/* Sender label & timestamp */}
                  <div className="flex items-center justify-between gap-4 mb-1.5 text-[10px]">
                    <span
                      className={`font-bold tracking-wider uppercase ${
                        msg.sender === 'user' ? 'text-indigo-200' : 'text-indigo-400'
                      }`}
                    >
                      {msg.sender === 'user' ? 'You' : 'Agent'}
                    </span>
                    <span className={msg.sender === 'user' ? 'text-indigo-200/70' : 'text-slate-400'}>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Message body with strong contrast */}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap font-normal selection:bg-indigo-300 selection:text-indigo-950">
                    {msg.text}
                  </div>

                  {/* Optional Card Content */}
                  {msg.card && msg.card.type !== 'MODE_CHOICE' && (
                    <div className="mt-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                      {msg.card.type === 'CAPABILITY_TEST' && (
                        <div>
                          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                            <span className="font-semibold text-white flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              {msg.card.data.stored ? 'Capability stored' : 'Capability Test Passed'}
                            </span>
                            <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              {Math.round((msg.card.data.confidence || 0.95) * 100)}%
                            </span>
                          </div>
                          <div className="mt-2 text-slate-300 space-y-1">
                            <p>{msg.card.data.outcome}</p>
                          </div>
                        </div>
                      )}

                      {msg.card.type === 'REMAP_REQUEST' && (
                        <div className="flex items-start gap-2 text-amber-200">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <p className="text-slate-300">
                            {String(msg.card.data?.need || 'Choose the control that means the same thing.')}
                          </p>
                        </div>
                      )}

                      {msg.card.type === 'REPORT_SUMMARY' && (
                        <div className="space-y-2">
                          <p className="font-semibold text-white">Record extract</p>
                          <p className="text-slate-400">
                            {msg.card.data.success || 0} success · {msg.card.data.failed || 0} failed · {msg.card.data.skipped || 0} skipped
                          </p>
                          {msg.card.data.csvUrl ? (
                            <a
                              href={String(msg.card.data.csvUrl)}
                              download={String(msg.card.data.fileName || 'execution.csv')}
                              className="btn-primary inline-flex"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download CSV
                            </a>
                          ) : null}
                        </div>
                      )}

                      {msg.card.type === 'WORKFLOW_SUMMARY' && (
                        <div>
                          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                            <span className="font-semibold text-white">Generated Flow Structure</span>
                            <span className="text-xs text-indigo-400">{msg.card.data.steps?.length || 0} Steps</span>
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {msg.card.data.steps?.map((st: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-2 text-slate-300 text-xs">
                                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                  {idx + 1}
                                </span>
                                <span className="font-medium text-white">{st.name}</span>
                                <ChevronRight className="w-3 h-3 text-slate-600" />
                                <span className="text-slate-400 text-[11px]">{st.verifiedOutcome || 'Verified'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {msg.card.type === 'FLOW_DEFINITION' && (
                        msgIndex === lastFlowDefIndex && session.currentState === 'ASK_FLOW_DEFINITION' ? (
                        <form
                          className="space-y-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSendMessage(flowName, 'flow-def-submit', {
                              workflowName: flowName,
                              description: flowDesc,
                            });
                          }}
                        >
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Flow name</label>
                            <input
                              value={flowName}
                              onChange={(e) => setFlowName(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                              placeholder="e.g. Process ready claims"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Description</label>
                            <textarea
                              value={flowDesc}
                              onChange={(e) => setFlowDesc(e.target.value)}
                              rows={3}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                              placeholder="What this flow should accomplish"
                            />
                          </div>
                          <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold">
                            Continue
                          </button>
                        </form>
                        ) : (
                          <p className="text-slate-400">
                            {String(msg.card.data?.workflowName || session.workflowName || 'Flow name captured')}
                          </p>
                        )
                      )}

                      {msg.card.type === 'APP_SELECTION' && (
                        <div className="space-y-2">
                          <p className="font-semibold text-white">Click an app to observe the live page</p>
                          {(msg.card.data?.apps || []).map((app: { id: string; name: string; baseUrl?: string }) => (
                            <button
                              key={app.id}
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleSendMessage(app.name, `app-select-${app.id}`)}
                              className="w-full text-left px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
                            >
                              Observe {app.name}
                              <span className="block text-[10px] text-indigo-100/80 truncate">{app.baseUrl}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {msg.card.type === 'OBSERVATION' && (
                        <div className="space-y-1">
                          <p className="font-semibold text-white">Page observed</p>
                          {(msg.card.data?.observation?.tables || []).map((table: { id: string; semanticName?: string; columns?: string[] }) => (
                            <p key={table.id} className="text-slate-400">
                              {table.semanticName || 'Table'} · columns: {table.columns?.join(', ') || 'none'}
                            </p>
                          ))}
                        </div>
                      )}

                      {msg.card.type === 'TABLE_KIND' && (
                        <p className="text-slate-400">
                          Columns: {(msg.card.data?.columns || []).join(', ') || 'none'}
                        </p>
                      )}

                      {msg.card.type === 'MATCH_PREVIEW' && (
                        <div className="space-y-1">
                          {(msg.card.data?.lines || []).map((line: string, idx: number) => (
                            <p key={idx} className="text-slate-300 text-[11px]">
                              {line}
                            </p>
                          ))}
                        </div>
                      )}

                      {msg.card.type === 'ROW_ACTION_PICKER' && (
                        <div className="space-y-1">
                          {(msg.card.data?.preview || []).length ? (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Matching actionable rows
                              </p>
                              {(msg.card.data.preview as string[]).map((line: string, idx: number) => (
                                <p key={idx} className="text-[11px] text-slate-300">
                                  {line}
                                </p>
                              ))}
                            </>
                          ) : (
                            <p className="text-slate-400">
                              {msg.id === lastRowActionId ? 'Choose a row control below.' : 'Row action selected.'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Interactive Options Buttons */}
                  {msg.options && msg.options.length > 0 && msg.id === lastOptionId && (
                    <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex flex-wrap gap-2">
                      {msg.options.map((opt) => (
                        <button
                          key={opt.id}
                          title={opt.description || opt.label}
                          onClick={() => handleSendMessage(opt.label, opt.id, opt.payload)}
                          disabled={isLoading && !String(opt.id).startsWith('trace-')}
                          className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 shadow-sm ${
                            opt.type === 'primary'
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                              : opt.type === 'danger'
                              ? 'bg-rose-600 hover:bg-rose-500 text-white'
                              : opt.type === 'amber'
                              ? 'bg-amber-600 hover:bg-amber-500 text-white'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {opt.badge && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-black/30 rounded text-slate-300">
                              {opt.badge}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex-shrink-0 flex items-center justify-center text-white shadow-sm mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3.5 justify-start">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex-shrink-0 flex items-center justify-center text-indigo-400 shadow-sm mt-0.5">
                  <Bot className="w-4 h-4 animate-pulse" />
                </div>
                <div className="bg-slate-900 border border-slate-800 text-slate-300 rounded-2xl rounded-tl-none p-3.5 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-xs text-slate-400 font-mono ml-2">Agent reasoning & resolving...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
        </div>
      </div>

      {/* Input Bar (Primary Agent Interface) */}
      {showComposer && (
        <div className="p-4 border-t border-white/10 bg-[#0b1220]/95">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="max-w-3xl mx-auto flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={getInputPlaceholder()}
                disabled={isLoading}
                className="w-full bg-slate-950/80 border border-white/10 focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/40 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition flex-shrink-0"
            >
              <span>Send</span>
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
      </div>
      <aside className="hidden lg:flex w-72 shrink-0 border-l border-white/10 bg-[#0b1220] flex-col overflow-y-auto">
        <div className="px-4 py-3.5 border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Session
        </div>
        <div className="p-4 text-[12px] text-slate-400 space-y-4">
          <div>
            <div className="text-[10px] uppercase text-slate-500">Application</div>
            <div className="text-white font-medium">
              {applications.find((a) => a.id === (contextFlow?.applicationId || session?.applicationId))?.name ||
                lastObservation?.title ||
                '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500">Current step</div>
            <div className="text-indigo-300">
              {Object.entries(planStatus).find(([, s]) => s === 'RUNNING')?.[0] ||
                session?.confirmedSteps?.[session.confirmedSteps.length - 1]?.name ||
                'Idle'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-1">Mapped steps</div>
            <ol className="space-y-1">
              {(session?.confirmedSteps || []).map((s, i) => {
                  const st = planStatus[s.id] || planStatus[s.name] || (s.testPassed ? 'PASSED' : 'PENDING');
                  return (
                    <li key={s.id} className="flex justify-between gap-2 text-slate-300">
                      <span>
                        {i + 1}. {s.name}
                      </span>
                      <span
                        className={
                          st === 'PASSED'
                            ? 'text-emerald-400'
                            : st === 'RUNNING'
                            ? 'text-amber-400'
                            : st === 'FAILED'
                            ? 'text-rose-400'
                            : 'text-slate-500'
                        }
                      >
                        {st}
                      </span>
                    </li>
                  );
                })}
            </ol>
          </div>
          <p className="text-[10px] text-slate-500">
            Confidence-favoring execution: name match first. HITL remap if unique score is below 0.9.
          </p>
        </div>
        {lastObservation?.screenshotUrl ? (
          <img
            src={lastObservation.screenshotUrl}
            alt={lastObservation.title}
            className="w-full object-top object-cover max-h-40 border-t border-slate-800"
          />
        ) : null}
      </aside>
      <ExecutionTracePopup
        open={traceOpen}
        stepName={traceStepName}
        steps={traceSteps}
        rows={traceRows}
        rowIndex={traceRowIndex}
        onRowIndex={setTraceRowIndex}
        onClose={() => setTraceOpen(false)}
        help={traceHelp}
        onRetry={(id) => resolveTrace(id, 'RETRY')}
        onMap={(id, target) => resolveTrace(id, 'CONFIRM', target)}
        onSkip={(id) => resolveTrace(id, 'SKIP')}
        onStop={liveExecutionId ? handleStopRun : undefined}
      />
    </div>
  );
};
