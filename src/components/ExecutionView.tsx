import React from 'react';
import {
  ExecutionRecord,
  HumanInterventionRequest,
  RowExecutionResult,
} from '../types/automation';
import {
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  UserCheck,
  Shield,
  Download,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { api } from '../api';

interface ExecutionViewProps {
  execution: ExecutionRecord | null;
  activeInterventions: HumanInterventionRequest[];
  onResolveIntervention: (
    id: string,
    action: 'CONFIRM' | 'SKIP' | 'STOP',
    selectedTarget?: string
  ) => void;
  onStopExecution: (id: string) => void;
  onNavigateToBatch: () => void;
  isRunning?: boolean;
}

export const ExecutionView: React.FC<ExecutionViewProps> = ({
  execution,
  activeInterventions,
  onResolveIntervention,
  onStopExecution,
  onNavigateToBatch,
  isRunning = false,
}) => {
  if (!execution) {
    return (
      <div className="py-24 text-center bg-white border border-slate-200 rounded-lg space-y-3">
        <Clock className="w-8 h-8 text-slate-400 mx-auto stroke-1" />
        <h2 className="text-base font-bold text-slate-800">No Active Execution Selected</h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Launch an execution from the Dashboard, Flow Builder, or click &quot;Execute Medicare Batch&quot; in the navigation bar.
        </p>
      </div>
    );
  }

  // Active intervention specifically for this execution
  const currentIntervention = activeInterventions.find(
    (i) => i.executionId === execution.id || i.status === 'PENDING'
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Execution Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Execution Control Center
            </h1>
            <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded">
              {execution.id}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 ${
                execution.status === 'COMPLETED'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : execution.status === 'RUNNING'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {execution.status === 'RUNNING' ? (
                <RotateCcw className="w-3 h-3 animate-spin" />
              ) : execution.status === 'COMPLETED' ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <XCircle className="w-3 h-3" />
              )}
              <span>{execution.status}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Flow: <strong>{execution.flowName}</strong> · Application: <strong>{execution.applicationName}</strong> · Session: <code className="font-mono">{execution.applicationSessionId}</code>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {execution.status === 'RUNNING' ? (
            <button
              onClick={() => onStopExecution(execution.id)}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Execution</span>
            </button>
          ) : null}

          {execution.csvReportPath ? (
            <a
              href={execution.csvReportPath}
              download
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV Report</span>
            </a>
          ) : null}

          <button
            onClick={onNavigateToBatch}
            className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded transition-colors flex items-center gap-1"
          >
            <span>Batch Ledger View</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Progress Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
        <div className="p-3 bg-white border border-slate-200 rounded">
          <span className="text-slate-400 block font-medium">Matched Rows</span>
          <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
            {execution.matchedCount}
          </span>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded">
          <span className="text-slate-400 block font-medium">Processed</span>
          <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
            {execution.processedCount}
          </span>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded">
          <span className="text-slate-400 block font-medium">Verified Success</span>
          <span className="text-xl font-bold font-mono text-emerald-600 tabular-nums">
            {execution.successCount}
          </span>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded">
          <span className="text-slate-400 block font-medium">Failed</span>
          <span className="text-xl font-bold font-mono text-rose-600 tabular-nums">
            {execution.failedCount}
          </span>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded">
          <span className="text-slate-400 block font-medium">Remappings</span>
          <span className="text-xl font-bold font-mono text-amber-600 tabular-nums">
            {execution.remappingCount}
          </span>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded">
          <span className="text-slate-400 block font-medium">Duration</span>
          <span className="text-xl font-bold font-mono text-slate-800 tabular-nums">
            {execution.durationMs ? `${(execution.durationMs / 1000).toFixed(2)}s` : '—'}
          </span>
        </div>
      </div>

      {/* HUMAN INTERVENTION MODAL / BANNER (Master Prompt Section 20 & 35) */}
      {currentIntervention ? (
        <div className="p-5 bg-amber-50 border-2 border-amber-400 rounded-lg shadow-md space-y-4 animate-in fade-in">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Human Remapping Intervention Required
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Row-level target ambiguity detected for claim{' '}
                  <strong className="text-slate-900 font-mono font-bold">
                    {currentIntervention.claimId || currentIntervention.rowId}
                  </strong>
                </p>
              </div>
            </div>

            <span className="text-[11px] font-mono px-2 py-0.5 bg-amber-200 text-amber-900 rounded font-semibold">
              EXECUTION PAUSED
            </span>
          </div>

          <div className="p-3 bg-white border border-amber-200 rounded text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Expected Business Action:</span>
              <span className="font-bold text-slate-900 font-mono">
                {currentIntervention.expectedIntent}
              </span>
            </div>
            <p className="text-slate-600 text-[11px]">
              No exact match found on current row. Discovered semantic candidates based on weighted
              lexical and functional similarity:
            </p>

            <div className="space-y-1.5 pt-1">
              {currentIntervention.candidates.map((cand, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-slate-900">{cand.text}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-indigo-700 font-semibold text-[11px] tabular-nums">
                      {(cand.confidence * 100).toFixed(0)}% Match
                    </span>
                    <button
                      onClick={() =>
                        onResolveIntervention(currentIntervention.id, 'CONFIRM', cand.text)
                      }
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded text-[11px] transition-colors"
                    >
                      Confirm &quot;{cand.text}&quot; as {currentIntervention.expectedIntent}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => onResolveIntervention(currentIntervention.id, 'SKIP')}
              className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded transition-colors"
            >
              Skip Row {currentIntervention.rowId} & Continue Batch
            </button>
            <button
              onClick={() => onResolveIntervention(currentIntervention.id, 'STOP')}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded transition-colors"
            >
              Stop Entire Batch
            </button>
          </div>
        </div>
      ) : null}

      {/* Two Column: Steps and Row Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 5 Cols: Execution Steps */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center justify-between">
            <span>Execution Steps Trace</span>
            <span className="text-[11px] text-slate-400 font-mono font-normal">
              {execution.steps.length} steps executed
            </span>
          </h2>

          <div className="space-y-3">
            {execution.steps.map((step) => (
              <div
                key={step.id}
                className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{step.stepName}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      step.status === 'SUCCESS'
                        ? 'bg-emerald-50 text-emerald-700'
                        : step.status === 'RUNNING'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {step.status}
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 font-mono">
                  Duration: {step.durationMs ? `${step.durationMs}ms` : 'active'} · Outcome Verification: {step.verificationState || 'PENDING'}
                </div>

                {step.outputData && Object.keys(step.outputData).length > 0 ? (
                  <div className="text-[11px] font-mono text-slate-600 bg-white p-1.5 rounded border border-slate-200 truncate">
                    {JSON.stringify(step.outputData)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Right 7 Cols: Row-by-Row Real Outcomes */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Verified Row-Level Outcomes ({execution.rowResults.length})
            </h2>
            <span className="text-[11px] text-slate-500 font-mono">
              Deterministic Filtering: Medicare Part A / Ready
            </span>
          </div>

          {execution.rowResults.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No row operations started yet. Steps will stream here live as rows are processed.
            </div>
          ) : (
            <div className="border border-slate-200 rounded overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Row ID</th>
                    <th className="py-2 px-3">Payer</th>
                    <th className="py-2 px-3">Result</th>
                    <th className="py-2 px-3">Verification</th>
                    <th className="py-2 px-3">Remapping</th>
                    <th className="py-2 px-3">Reference #</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {execution.rowResults.map((row) => (
                    <tr key={row.rowId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">
                        {row.rowId}
                      </td>
                      <td className="py-2 px-3 text-slate-700">{row.payer}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`font-semibold ${
                            row.result === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {row.result}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                        {row.verificationResult}
                      </td>
                      <td className="py-2 px-3">
                        {row.remappingConfirmed ? (
                          <span className="text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded text-[10px]">
                            Confirmed
                          </span>
                        ) : row.remappingRequired ? (
                          <span className="text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.5 rounded text-[10px]">
                            Skipped
                          </span>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                        {row.referenceNumber || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
