import React, { useState, useRef, useEffect } from 'react';
import {
  ChatMessage,
  ChatOption,
  WorkflowBuildSession,
  AgentMode,
  Application,
  BusinessFlow,
  ExecutionRecord,
} from '../types/automation';
import {
  Send,
  Sparkles,
  Bot,
  User,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Download,
  FileSpreadsheet,
  Globe,
  Table as TableIcon,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';

interface AgentChatPanelProps {
  mode: AgentMode;
  buildSession: WorkflowBuildSession | null;
  onSendMessage: (text: string, chosenOptionId?: string) => Promise<void>;
  onResetSession: () => void;
  // RUN mode props
  publishedFlows: BusinessFlow[];
  onSelectRunFlow: (flowId: string) => void;
  selectedRunFlow: BusinessFlow | null;
  onExecuteRunFlow: () => void;
  runExecution: ExecutionRecord | null;
  isRunning: boolean;
  onReviewFlow: () => void;
  onOpenBatchReport: () => void;
  activeInterventionCount?: number;
}

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  mode,
  buildSession,
  onSendMessage,
  onResetSession,
  publishedFlows,
  onSelectRunFlow,
  selectedRunFlow,
  onExecuteRunFlow,
  runExecution,
  isRunning,
  onReviewFlow,
  onOpenBatchReport,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [buildSession?.messages, runExecution?.steps, runExecution?.rowResults]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSubmitting) return;

    const text = inputText.trim();
    setInputText('');
    setIsSubmitting(true);
    try {
      await onSendMessage(text);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOptionClick = async (option: ChatOption) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSendMessage(option.label, option.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Agent Chat Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">Intent Automation Agent</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[11px] text-slate-500">
              {mode === 'BUILD'
                ? 'BUILD MODE · Conversational Workflow Teaching'
                : 'RUN MODE · Conversational Workflow Operator'}
            </p>
          </div>
        </div>

        {mode === 'BUILD' ? (
          <button
            onClick={onResetSession}
            title="Start fresh workflow teaching session"
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 hover:bg-white transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Session</span>
          </button>
        ) : null}
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
        {mode === 'BUILD' ? (
          /* BUILD MODE: Conversational Teaching Stream */
          <>
            {buildSession?.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${
                  msg.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.sender === 'agent' ? (
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                    IA
                  </div>
                ) : null}

                <div
                  className={`max-w-[85%] rounded-lg p-3.5 space-y-2.5 shadow-xs ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

                  {/* App Selection Card */}
                  {msg.card?.type === 'APP_SELECTION' ? (
                    <div className="space-y-2 pt-1">
                      <span className="font-semibold text-slate-700 text-[11px] block">
                        Registered Enterprise Applications:
                      </span>
                      <div className="grid grid-cols-1 gap-2">
                        {msg.card.data.apps.map((app: Application) => (
                          <div
                            key={app.id}
                            className="p-3 bg-white border border-slate-200 rounded flex items-center justify-between hover:border-indigo-400 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <Globe className="w-4 h-4 text-indigo-600" />
                              <div>
                                <span className="font-bold text-slate-900 block">{app.name}</span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {app.baseUrl} · {app.environment}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                handleOptionClick({
                                  id: `app-select-${app.id}`,
                                  label: app.name,
                                  type: 'primary',
                                })
                              }
                              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded text-[11px]"
                            >
                              Choose
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Table View Card */}
                  {msg.card?.type === 'TABLE_VIEW' && msg.card.data.table ? (
                    <div className="p-2.5 bg-white border border-slate-200 rounded space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 text-[11px]">
                        <TableIcon className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Discovered Table: {msg.card.data.table.semanticName}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Columns: {msg.card.data.table.columns.join(' | ')}
                      </div>
                    </div>
                  ) : null}

                  {/* Workflow Summary Card */}
                  {msg.card?.type === 'WORKFLOW_SUMMARY' ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded space-y-2 text-slate-900">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Workflow Ready for Production</span>
                      </div>
                      <div className="space-y-1 text-[11px] text-slate-700">
                        {msg.card.data.steps.map((st: any, i: number) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="font-mono text-emerald-700 font-bold">0{i + 1}.</span>
                            <span className="font-medium">{st.name}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 flex items-center gap-2">
                        <button
                          onClick={onReviewFlow}
                          className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded text-[11px]"
                        >
                          Review in Canvas
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Interactive Option Chips */}
                  {msg.options && msg.options.length > 0 ? (
                    <div className="pt-2 space-y-1.5 border-t border-slate-200/60">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Suggested Actions:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.options.map((opt) => (
                          <button
                            key={opt.id}
                            disabled={isSubmitting}
                            onClick={() => handleOptionClick(opt)}
                            className={`px-3 py-1.5 rounded text-xs font-semibold text-left transition-all flex items-center gap-1.5 ${
                              opt.type === 'primary'
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                                : opt.type === 'amber'
                                ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                                : 'bg-white border border-slate-300 hover:bg-slate-100 text-slate-800'
                            }`}
                          >
                            <span>{opt.label}</span>
                            <ChevronRight className="w-3 h-3 opacity-60" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {msg.sender === 'user' ? (
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                ) : null}
              </div>
            ))}
          </>
        ) : (
          /* RUN MODE: Conversational Execution Stream */
          <div className="space-y-4">
            {/* Step 1: Flow Selection if none selected */}
            {!selectedRunFlow ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-slate-900">
                    Which workflow would you like to run?
                  </span>
                </div>
                <p className="text-slate-600 text-[11px]">
                  Select from published workflows with verified test passes:
                </p>

                <div className="space-y-2 pt-1">
                  {publishedFlows.map((flow) => (
                    <button
                      key={flow.id}
                      onClick={() => onSelectRunFlow(flow.id)}
                      className="w-full p-3 bg-white border border-slate-200 hover:border-indigo-400 rounded text-left transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {flow.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded">
                            Production
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 mt-0.5 block">
                          Application: Claims Portal · Failure Policy: {flow.failurePolicy}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Selected Flow Execution View */
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-indigo-600 uppercase font-bold tracking-wider block">
                        Ready to Execute
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                        {selectedRunFlow.name}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Application: Claims Portal · Failure Isolation: Row-level continuation
                      </p>
                    </div>

                    <button
                      onClick={onExecuteRunFlow}
                      disabled={isRunning}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-md shadow-xs flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{isRunning ? 'Executing...' : 'Run Workflow'}</span>
                    </button>
                  </div>
                </div>

                {/* Live Execution Progress Card */}
                {runExecution ? (
                  <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">
                          Execution Progress: {runExecution.id}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            runExecution.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : runExecution.status === 'RUNNING'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {runExecution.status}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">
                        {runExecution.durationMs ? `${(runExecution.durationMs / 1000).toFixed(2)}s` : 'running'}
                      </span>
                    </div>

                    {/* Step-by-Step Progress */}
                    <div className="space-y-1.5 text-xs">
                      {runExecution.steps.map((st) => (
                        <div key={st.id} className="flex items-center justify-between text-slate-700">
                          <span className="flex items-center gap-1.5 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{st.stepName}</span>
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {st.durationMs ? `${st.durationMs}ms` : 'done'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Processed Rows Progress */}
                    {runExecution.rowResults.length > 0 ? (
                      <div className="pt-2 border-t border-slate-100 space-y-1.5">
                        <span className="font-semibold text-slate-800 text-[11px] block">
                          Processed Matched Records ({runExecution.rowResults.length}):
                        </span>
                        <div className="space-y-1">
                          {runExecution.rowResults.map((r) => (
                            <div
                              key={r.rowId}
                              className="p-2 bg-slate-50 border border-slate-200 rounded flex items-center justify-between text-[11px]"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">{r.rowId}</span>
                                <span className="text-slate-500">({r.payer})</span>
                                {r.remappingConfirmed ? (
                                  <span className="text-[10px] bg-amber-100 text-amber-900 font-semibold px-1 rounded">
                                    Remapped: Submit
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-semibold ${
                                    r.result === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'
                                  }`}
                                >
                                  {r.result}
                                </span>
                                {r.referenceNumber ? (
                                  <span className="font-mono text-indigo-700 font-bold">
                                    {r.referenceNumber}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Completion Summary & Report Download */}
                    {runExecution.status === 'COMPLETED' ? (
                      <div className="pt-3 border-t border-slate-100 p-3 bg-emerald-50 border border-emerald-200 rounded space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Workflow Execution Completed Successfully
                          </span>
                          <span className="text-[11px] font-mono text-emerald-900">
                            {runExecution.successCount}/{runExecution.matchedCount} verified
                          </span>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          {runExecution.csvReportPath ? (
                            <a
                              href={runExecution.csvReportPath}
                              download
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded text-xs flex items-center gap-1.5 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download CSV Report</span>
                            </a>
                          ) : null}

                          <button
                            onClick={onOpenBatchReport}
                            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded text-xs flex items-center gap-1"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                            <span>View Batch Ledger</span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isSubmitting}
            placeholder={
              mode === 'BUILD'
                ? 'Teach the agent: e.g. "Process Medicare Part A claims" or choose an option above...'
                : 'Message the agent or ask about current execution...'
            }
            className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-md focus:outline-hidden focus:border-indigo-500 placeholder-slate-400"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSubmitting}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </div>
      </form>
    </div>
  );
};
