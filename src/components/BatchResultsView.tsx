import React, { useState } from 'react';
import { ExecutionRecord, RowExecutionResult } from '../types/automation';
import {
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Clock,
  Filter,
} from 'lucide-react';

interface BatchResultsViewProps {
  executions: ExecutionRecord[];
  selectedExecution?: ExecutionRecord | null;
  onSelectExecution: (exec: ExecutionRecord) => void;
}

export const BatchResultsView: React.FC<BatchResultsViewProps> = ({
  executions,
  selectedExecution,
  onSelectExecution,
}) => {
  const activeExec = selectedExecution || executions[0];
  const [filterResult, setFilterResult] = useState<'ALL' | 'SUCCESS' | 'FAILED'>('ALL');

  if (!activeExec) {
    return (
      <div className="py-20 text-center bg-white border border-slate-200 rounded-lg text-xs text-slate-500">
        No batch executions found. Run an automation flow first to generate batch results.
      </div>
    );
  }

  const rows = activeExec.rowResults || [];
  const filteredRows = rows.filter((r) => {
    if (filterResult === 'ALL') return true;
    return r.result === filterResult;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Batch Ledger & CSV Audit Export
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Verified row-level outcomes and downloadable electronic data interchange reports
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={activeExec.id}
            onChange={(e) => {
              const found = executions.find((ex) => ex.id === e.target.value);
              if (found) onSelectExecution(found);
            }}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono font-medium focus:outline-hidden"
          >
            {executions.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.id} - {ex.flowName} ({ex.status})
              </option>
            ))}
          </select>

          {activeExec.csvReportPath ? (
            <a
              href={activeExec.csvReportPath}
              download
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV Report</span>
            </a>
          ) : null}
        </div>
      </div>

      {/* Batch Summary Grid (Master Prompt Section 37) */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Batch Processing Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-400 block text-[11px]">Total Matched</span>
            <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {activeExec.matchedCount}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-400 block text-[11px]">Processed</span>
            <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {activeExec.processedCount}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-400 block text-[11px]">Successful</span>
            <span className="text-xl font-bold font-mono text-emerald-600 tabular-nums">
              {activeExec.successCount}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-400 block text-[11px]">Failed</span>
            <span className="text-xl font-bold font-mono text-rose-600 tabular-nums">
              {activeExec.failedCount}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-400 block text-[11px]">Remappings Confirmed</span>
            <span className="text-xl font-bold font-mono text-amber-600 tabular-nums">
              {activeExec.remappingCount}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-100">
          <span>Human Interventions: <strong>{activeExec.interventionCount}</strong></span>
          <span aria-hidden="true">·</span>
          <span>Recovery Successful: <strong>{activeExec.recoveryCount}</strong></span>
          <span aria-hidden="true">·</span>
          <span>Duration: <strong>{activeExec.durationMs ? `${(activeExec.durationMs / 1000).toFixed(2)}s` : '—'}</strong></span>
        </div>
      </div>

      {/* Row-Level Results Table */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">
            Row-Level Execution Evidence ({filteredRows.length})
          </h2>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded text-xs">
            <button
              onClick={() => setFilterResult('ALL')}
              className={`px-2.5 py-1 rounded font-medium ${
                filterResult === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              All Rows ({rows.length})
            </button>
            <button
              onClick={() => setFilterResult('SUCCESS')}
              className={`px-2.5 py-1 rounded font-medium ${
                filterResult === 'SUCCESS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Success ({rows.filter((r) => r.result === 'SUCCESS').length})
            </button>
            <button
              onClick={() => setFilterResult('FAILED')}
              className={`px-2.5 py-1 rounded font-medium ${
                filterResult === 'FAILED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Failed ({rows.filter((r) => r.result === 'FAILED').length})
            </button>
          </div>
        </div>

        <div className="border border-slate-200 rounded overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Row ID</th>
                <th className="py-2.5 px-3">Claim ID</th>
                <th className="py-2.5 px-3">Payer</th>
                <th className="py-2.5 px-3">Initial</th>
                <th className="py-2.5 px-3">Final</th>
                <th className="py-2.5 px-3">Result</th>
                <th className="py-2.5 px-3">Verification</th>
                <th className="py-2.5 px-3">Remapping</th>
                <th className="py-2.5 px-3">Reference #</th>
                <th className="py-2.5 px-3">Error / Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((r) => (
                <tr key={r.rowId} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-2 px-3 font-mono font-bold text-slate-900">{r.rowId}</td>
                  <td className="py-2 px-3 font-mono text-slate-700">{r.claimId}</td>
                  <td className="py-2 px-3 text-slate-700 font-medium">{r.payer}</td>
                  <td className="py-2 px-3 text-slate-500">{r.initialStatus}</td>
                  <td className="py-2 px-3 font-medium text-slate-800">{r.finalStatus}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`font-semibold ${
                        r.result === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {r.result}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                    {r.verificationResult}
                  </td>
                  <td className="py-2 px-3">
                    {r.remappingConfirmed ? (
                      <span className="bg-amber-50 text-amber-700 font-semibold px-1.5 py-0.5 rounded text-[10px]">
                        Confirmed
                      </span>
                    ) : r.remappingRequired ? (
                      <span className="bg-rose-50 text-rose-700 font-semibold px-1.5 py-0.5 rounded text-[10px]">
                        Unresolved
                      </span>
                    ) : (
                      <span className="text-slate-400">None</span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                    {r.referenceNumber || '—'}
                  </td>
                  <td className="py-2 px-3 text-slate-500 text-[11px] max-w-[200px] truncate">
                    {r.errorMessage || 'Outcome verified'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
