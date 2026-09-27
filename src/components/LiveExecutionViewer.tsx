import React, { useState, useEffect } from 'react';
import {
  ExecutionRecord,
  HumanInterventionRequest,
  RowExecutionResult,
  BusinessFlow,
} from '../types/automation';
import { api } from '../api';
import {
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  Clock,
  Shield,
  HelpCircle,
  UserCheck,
  ChevronRight,
  Database,
} from 'lucide-react';

interface LiveExecutionViewerProps {
  activeFlow?: BusinessFlow | null;
  onExecutionComplete?: (execId: string) => void;
}

export const LiveExecutionViewer: React.FC<LiveExecutionViewerProps> = ({
  activeFlow,
  onExecutionComplete,
}) => {
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [currentExecution, setCurrentExecution] = useState<ExecutionRecord | null>(null);
  const [flows, setFlows] = useState<BusinessFlow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string>(activeFlow?.id || '');
  const [isRunning, setIsRunning] = useState(false);
  const [activeIntervention, setActiveIntervention] = useState<HumanInterventionRequest | null>(null);

  useEffect(() => {
    loadFlowsAndExecutions();
  }, []);

  useEffect(() => {
    if (activeFlow) {
      setSelectedFlowId(activeFlow.id);
    }
  }, [activeFlow]);

  // Poll active execution if running
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (currentExecution && (currentExecution.status === 'RUNNING' || currentExecution.status === 'PAUSED')) {
      interval = setInterval(async () => {
        try {
          const updated = await api.getExecution(currentExecution.id);
          setCurrentExecution(updated);

          // Check for active human intervention
          const pendingIntervention = updated.interventions?.find((i) => i.status === 'PENDING');
          setActiveIntervention(pendingIntervention || null);

          if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
            setIsRunning(false);
            if (onExecutionComplete) onExecutionComplete(updated.id);
          }
        } catch (e) {
          console.error('Failed to poll execution', e);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [currentExecution, onExecutionComplete]);

  const loadFlowsAndExecutions = async () => {
    try {
      const [allFlows, allExecs] = await Promise.all([
        api.getFlows(),
        api.getExecutions(),
      ]);
      setFlows(allFlows.filter((f) => !f.isRetired && f.latestTestStatus === 'SUCCESS' && (f.status === 'PRODUCTION' || f.status === 'TEST' || f.status === 'APPROVED')));
      setExecutions(allExecs);

      if (allExecs.length > 0 && !currentExecution) {
        setCurrentExecution(allExecs[0]);
      }
      if (allFlows.length > 0 && !selectedFlowId) {
        setSelectedFlowId(allFlows[0].id);
      }
    } catch (e) {
      console.error('Failed to load runs', e);
    }
  };

  const handleStartRun = async () => {
    if (!selectedFlowId) return;
    setIsRunning(true);
    setActiveIntervention(null);
    try {
      const exec = await api.runFlow(selectedFlowId, { mode: 'RUN' });
      setCurrentExecution(exec);
      loadFlowsAndExecutions();
    } catch (e) {
      console.error('Failed to start execution', e);
      setIsRunning(false);
    }
  };

  const handleStopRun = async () => {
    if (!currentExecution) return;
    try {
      await api.stopExecution(currentExecution.id);
      setIsRunning(false);
    } catch (e) {
      console.error('Failed to stop execution', e);
    }
  };

  const handleResolveIntervention = async (
    action: 'CONFIRM' | 'CHANGE' | 'SKIP' | 'STOP',
    selectedTarget?: any
  ) => {
    if (!activeIntervention) return;
    try {
      await api.resolveIntervention(
        activeIntervention.id,
        action,
        typeof selectedTarget === 'string' ? selectedTarget : selectedTarget?.text || selectedTarget?.visibleText
      );
      setActiveIntervention(null);
    } catch (e) {
      console.error('Failed to resolve intervention', e);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Play className="w-5 h-5 text-emerald-400" />
            Execution Center & Batch Automation Monitor
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time state machine execution with tabular batch processing, outcome verification, and human intervention
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedFlowId}
            onChange={(e) => setSelectedFlowId(e.target.value)}
            disabled={isRunning}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
          >
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.nodes.length} steps)
              </option>
            ))}
          </select>

          {!isRunning ? (
            <button
              onClick={handleStartRun}
              disabled={!selectedFlowId}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Execute Flow
            </button>
          ) : (
            <button
              onClick={handleStopRun}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-rose-600/30 transition"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Run
            </button>
          )}
        </div>
      </div>

      {currentExecution?.csvReportPath &&
        (currentExecution.status === 'COMPLETED' || currentExecution.status === 'FAILED') && (
        <div className="p-4 rounded-xl border border-indigo-500/40 bg-indigo-950/40 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Table batch CSV is ready</p>
            <p className="text-xs text-slate-400">Row evidence for this run.</p>
          </div>
          <a
            href={`/api/reports/${currentExecution.id}/csv`}
            download
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </a>
        </div>
      )}

      {/* Blocking remap scenario popup */}
      {activeIntervention && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg p-5 rounded-2xl bg-slate-900 border-2 border-amber-500/70 shadow-2xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 text-amber-300">
              <UserCheck className="w-6 h-6 text-amber-400" />
              <div>
                <h3 className="font-bold text-white text-base">Map this control</h3>
                <p className="text-xs text-amber-200/90 mt-0.5">Score below 90% or control missing. Intent: {activeIntervention.expectedIntent}</p>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Required
            </span>
          </div>

          {(activeIntervention.rowId || activeIntervention.claimId) && (
            <div className="mt-3 text-xs text-slate-300 bg-slate-950/70 p-3 rounded-lg border border-amber-500/20">
              <p>Target Row: <strong className="text-white">{activeIntervention.rowId || activeIntervention.claimId}</strong></p>
              <p className="text-slate-400 mt-0.5">Pick the live name. This map is stored and reused.</p>
            </div>
          )}

          {activeIntervention.candidates && activeIntervention.candidates.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-300">Select intended action:</p>
              <div className="flex flex-wrap gap-2">
                {activeIntervention.candidates.map((cand: { text?: string; actionId?: string; confidence?: number }, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => handleResolveIntervention('CONFIRM', cand)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium shadow transition flex items-center gap-1.5"
                  >
                    <span>Remap to "{cand.text || cand.actionId}"</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-black/30 rounded font-mono">
                      {Math.round((cand.confidence || 0.9) * 100)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-amber-500/20 flex items-center justify-between">
            <span className="text-[11px] text-amber-300/80">
              Saved in Experience Memory for later rows and runs.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleResolveIntervention('SKIP')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
              >
                Skip Row
              </button>
              <button
                onClick={() => handleResolveIntervention('STOP')}
                className="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg text-xs font-medium"
              >
                Abort Batch
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Execution Monitor Details */}
      {currentExecution ? (
        <div className="space-y-6">
          {/* Key Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
              <span
                className={`text-sm font-bold mt-1 inline-block ${
                  currentExecution.status === 'COMPLETED'
                    ? 'text-emerald-400'
                    : currentExecution.status === 'RUNNING'
                    ? 'text-indigo-400 animate-pulse'
                    : currentExecution.status === 'FAILED'
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}
              >
                {currentExecution.status}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Matched Rows</span>
              <span className="text-base font-bold text-white mt-1 block font-mono">
                {currentExecution.matchedCount}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Processed</span>
              <span className="text-base font-bold text-white mt-1 block font-mono">
                {currentExecution.processedCount}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block">Successes</span>
              <span className="text-base font-bold text-emerald-400 mt-1 block font-mono">
                {currentExecution.successCount}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-rose-400 block">Failures</span>
              <span className="text-base font-bold text-rose-400 mt-1 block font-mono">
                {currentExecution.failedCount}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-indigo-400 block">Remappings</span>
              <span className="text-base font-bold text-indigo-400 mt-1 block font-mono">
                {currentExecution.remappingCount}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-amber-400 block">Interventions</span>
              <span className="text-base font-bold text-amber-400 mt-1 block font-mono">
                {currentExecution.interventionCount}
              </span>
            </div>
          </div>

          {/* Row-Level Execution Results Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-sm">Row-Level Batch Outcomes</h3>
                <p className="text-xs text-slate-400">
                  Every row has deterministic semantic target resolution, outcome verification, and audit trace
                </p>
              </div>

              {currentExecution.csvReportPath && (
                <a
                  href={`/api/reports/${currentExecution.id}/csv`}
                  download
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV Report
                </a>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Row ID</th>
                    <th className="px-4 py-3">Claim Data</th>
                    <th className="px-4 py-3">Action Intent</th>
                    <th className="px-4 py-3">Outcome State</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Verification Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {currentExecution.rowResults?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        {currentExecution.status === 'RUNNING'
                          ? 'Observing DOM and processing rows...'
                          : 'No rows processed yet'}
                      </td>
                    </tr>
                  ) : (
                    currentExecution.rowResults?.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition font-mono">
                        <td className="px-4 py-3 font-semibold text-white">{row.rowId || row.claimId}</td>
                        <td className="px-4 py-3 text-slate-300 font-sans">
                          {row.claimId} • {row.payer || 'Medicare Part A'}
                        </td>
                        <td className="px-4 py-3 text-indigo-400 font-sans">{row.initialStatus} → {row.finalStatus}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                              row.result === 'SUCCESS'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : row.result === 'FAILED'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {row.result}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {row.remappingConfirmed ? 'Remapped (100%)' : 'Verified'}
                        </td>
                        <td className="px-4 py-3 font-sans text-slate-300">
                          {row.result === 'SUCCESS'
                            ? `Verified state: ${row.finalStatus} (${row.referenceNumber || 'REF-OK'})`
                            : row.errorMessage || 'Execution failed verification'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-dashed border-slate-800">
          <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Active Executions</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Choose a business flow above and click "Execute Flow" to initiate live browser automation and batch verification.
          </p>
        </div>
      )}
    </div>
  );
};
