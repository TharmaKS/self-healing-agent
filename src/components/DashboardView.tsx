import React from 'react';
import {
  Application,
  SemanticCapability,
  BusinessFlow,
  ExecutionRecord,
} from '../types/automation';
import {
  Play,
  Layers,
  Sparkles,
  GitBranch,
  ShieldCheck,
  RotateCcw,
  UserCheck,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { NavTab } from './Navigation';

interface DashboardViewProps {
  applications: Application[];
  capabilities: SemanticCapability[];
  flows: BusinessFlow[];
  executions: ExecutionRecord[];
  credentials: Array<{ key: string; status: string; configured: boolean }>;
  onExecuteFlow: (flowId: string) => void;
  onNavigateTab: (tab: NavTab) => void;
  onSelectExecution: (exec: ExecutionRecord) => void;
  isRunning: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  applications,
  capabilities,
  flows,
  executions,
  credentials,
  onExecuteFlow,
  onNavigateTab,
  onSelectExecution,
  isRunning,
}) => {
  // Aggregate statistics from real execution records
  const totalExecutions = executions.length;
  const completedExecs = executions.filter((e) => e.status === 'COMPLETED');
  const totalProcessed = executions.reduce((sum, e) => sum + e.processedCount, 0);
  const totalSuccess = executions.reduce((sum, e) => sum + e.successCount, 0);
  const totalFailed = executions.reduce((sum, e) => sum + e.failedCount, 0);
  const totalRecovered = executions.reduce((sum, e) => sum + e.recoveryCount, 0);
  const totalInterventions = executions.reduce((sum, e) => sum + e.interventionCount, 0);

  const successRate = totalProcessed > 0 ? ((totalSuccess / totalProcessed) * 100).toFixed(1) : '100.0';

  const defaultFlow = flows[0];

  return (
    <div className="space-y-8 pb-12">
      {/* Editorial Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Enterprise Automation Command
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Intent-driven, capability-first, outcome-verified browser workflow automation
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="font-medium text-slate-900">Active Node Engine</span>
          <span aria-hidden="true">·</span>
          <span>Port 3000</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Deterministic Core Online
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <span className="text-xs text-slate-500 font-medium">Applications</span>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {applications.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">1 active portal</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <span className="text-xs text-slate-500 font-medium">Capabilities</span>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {capabilities.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Reusable actions</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <span className="text-xs text-slate-500 font-medium">Verified Outcomes</span>
          <div className="mt-1 text-2xl font-bold text-emerald-600 font-mono tabular-nums">
            {totalSuccess}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">{successRate}% rate</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <span className="text-xs text-slate-500 font-medium">Row Remappings</span>
          <div className="mt-1 text-2xl font-bold text-amber-600 font-mono tabular-nums">
            {totalRecovered}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Self-healing resolved</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <span className="text-xs text-slate-500 font-medium">Interventions</span>
          <div className="mt-1 text-2xl font-bold text-indigo-600 font-mono tabular-nums">
            {totalInterventions}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Human confirmed</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <span className="text-xs text-slate-500 font-medium">Total Runs</span>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {totalExecutions}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Deterministic runs</span>
        </div>
      </div>

      {/* Main Grid: Priority Flow & Credential Security */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: End-to-End Featured Automation Flow */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-indigo-600 font-semibold tracking-wide uppercase">
                Featured Verified Flow
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Medicare Part A Claims Batch Processing
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab('flows')}
              className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-medium"
            >
              <span>Edit Flow Graph</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            Autonomous multi-row dispatch: logs into enterprise Claims Portal, inspects the live
            EDI 837 ledger, deterministically filters for <strong className="text-slate-900 font-semibold">Medicare Part A</strong> with status <strong className="text-slate-900 font-semibold">Ready</strong>, resolves row-level actions, solicits human approval on ambiguous targets (such as C003 &quot;Submit&quot; remapping), isolates failures, verifies business outcomes, and produces an audit-ready CSV.
          </p>

          {/* Flow Stepper Preview */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-md">
            <span className="text-xs font-semibold text-slate-700 block mb-3">
              Compiled Execution Contract Pipeline
            </span>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <div className="p-2.5 bg-white border border-slate-200 rounded">
                <span className="text-[10px] text-slate-400 block font-mono">01. AUTH</span>
                <span className="font-semibold text-slate-800">Login Portal</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">CLAIMS_USERNAME</span>
              </div>
              <div className="p-2.5 bg-white border border-slate-200 rounded">
                <span className="text-[10px] text-slate-400 block font-mono">02. NAV</span>
                <span className="font-semibold text-slate-800">Open Ledger</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Claims Table</span>
              </div>
              <div className="p-2.5 bg-white border border-slate-200 rounded">
                <span className="text-[10px] text-slate-400 block font-mono">03. FILTER</span>
                <span className="font-semibold text-slate-800">Match Rows</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Medicare Part A</span>
              </div>
              <div className="p-2.5 bg-white border border-slate-200 rounded border-indigo-300 bg-indigo-50/40">
                <span className="text-[10px] text-indigo-600 block font-mono">04. PROCESS</span>
                <span className="font-semibold text-indigo-950">Row Action</span>
                <span className="text-[10px] text-indigo-600 block mt-0.5">Outcome Verified</span>
              </div>
              <div className="p-2.5 bg-white border border-slate-200 rounded">
                <span className="text-[10px] text-slate-400 block font-mono">05. REPORT</span>
                <span className="font-semibold text-slate-800">Export CSV</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Audit Artifact</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>Risk: <strong>HIGH (Controlled)</strong></span>
              <span aria-hidden="true">·</span>
              <span>Failure Policy: <strong>CONTINUE</strong></span>
              <span aria-hidden="true">·</span>
              <span>Version: <strong>1.0 (Production)</strong></span>
            </div>

            <button
              onClick={() => defaultFlow && onExecuteFlow(defaultFlow.id)}
              disabled={isRunning}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isRunning ? 'Execution In Progress...' : 'Execute Flow Now'}</span>
            </button>
          </div>
        </div>

        {/* Right Col: Credential References & Security Invariants */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Credential Security Policy</span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Strict invariant: raw passwords, keys, and tokens are NEVER stored in MySQL, logs,
            prompts, or reports. The engine strictly references environment variable pointers.
          </p>

          <div className="space-y-2.5 pt-1">
            {credentials.map((cred) => (
              <div
                key={cred.key}
                className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded text-xs"
              >
                <div>
                  <span className="font-mono font-medium text-slate-800">{cred.key}</span>
                  <span className="text-[10px] text-slate-400 block">Environment Reference</span>
                </div>
                <div className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{cred.status}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Local AI Model</span>
            <span className="font-medium text-slate-700">Qwen3 0.6B / Heuristic Resolver</span>
          </div>
        </div>
      </div>

      {/* Recent Executions Ledger */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Recent Orchestration Runs</h2>
          <button
            onClick={() => onNavigateTab('execution')}
            className="text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1"
          >
            <span>View Execution Engine</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {executions.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            No executions recorded yet. Click &quot;Execute Medicare Batch&quot; above to launch the first run.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-medium">
                  <th className="py-2.5 px-3">Execution ID</th>
                  <th className="py-2.5 px-3">Flow</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Matched</th>
                  <th className="py-2.5 px-3 text-right">Success</th>
                  <th className="py-2.5 px-3 text-right">Failed</th>
                  <th className="py-2.5 px-3 text-right">Remapped</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {executions.slice(0, 5).map((exec) => (
                  <tr key={exec.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900">
                      {exec.id}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-medium">
                      {exec.flowName}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                          exec.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : exec.status === 'RUNNING'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {exec.status === 'COMPLETED' ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : exec.status === 'RUNNING' ? (
                          <RotateCcw className="w-3 h-3 animate-spin" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        <span>{exec.status}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                      {exec.matchedCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-600">
                      {exec.successCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-rose-600">
                      {exec.failedCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-600">
                      {exec.remappingCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">
                      {exec.durationMs ? `${(exec.durationMs / 1000).toFixed(2)}s` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      <button
                        onClick={() => {
                          onSelectExecution(exec);
                          onNavigateTab('execution');
                        }}
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Inspect
                      </button>
                      {exec.csvReportPath ? (
                        <a
                          href={exec.csvReportPath}
                          download
                          className="text-slate-600 hover:text-slate-900 font-medium"
                        >
                          CSV
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
