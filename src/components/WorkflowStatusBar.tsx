import React from 'react';
import {
  AgentMode,
  WorkflowBuildSession,
  ExecutionRecord,
} from '../types/automation';
import {
  Layers,
  GitBranch,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  Brain,
  Globe,
  Settings,
  ArrowRight,
} from 'lucide-react';

interface WorkflowStatusBarProps {
  mode: AgentMode;
  buildSession: WorkflowBuildSession | null;
  runExecution: ExecutionRecord | null;
  onOpenFlowReview: () => void;
  onOpenBatchLedger: () => void;
  onOpenExperience: () => void;
  onOpenApps: () => void;
  onFinishWorkflow: () => void;
}

export const WorkflowStatusBar: React.FC<WorkflowStatusBarProps> = ({
  mode,
  buildSession,
  runExecution,
  onOpenFlowReview,
  onOpenBatchLedger,
  onOpenExperience,
  onOpenApps,
  onFinishWorkflow,
}) => {
  return (
    <div className="bg-slate-900 border-t border-slate-800 text-slate-200 px-6 py-2.5 flex items-center justify-between text-xs">
      {/* Left: Mode Context Status */}
      <div className="flex items-center gap-4">
        {mode === 'BUILD' ? (
          <div className="flex items-center gap-3">
            <span className="font-bold text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span>Teaching Workflow:</span>
              <span className="text-indigo-400 font-mono">
                {buildSession?.workflowName || 'Awaiting Workflow Name...'}
              </span>
            </span>

            {buildSession?.confirmedSteps && buildSession.confirmedSteps.length > 0 ? (
              <div className="flex items-center gap-2 text-slate-400">
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-emerald-400">
                  {buildSession.confirmedSteps.length} Capabilities Verified
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-bold text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Active Execution:</span>
              <span className="text-emerald-400 font-mono">
                {runExecution?.id || 'Ready to run'}
              </span>
            </span>

            {runExecution ? (
              <div className="flex items-center gap-2 text-slate-400">
                <span aria-hidden="true">·</span>
                <span>
                  Processed: <strong className="text-white font-mono">{runExecution.processedCount}</strong> / {runExecution.matchedCount}
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-400 font-mono">
                  {runExecution.successCount} Success
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Right: Quick Inspection Drawers */}
      <div className="flex items-center gap-2">
        {mode === 'BUILD' && buildSession?.confirmedSteps && buildSession.confirmedSteps.length > 0 ? (
          <button
            onClick={onFinishWorkflow}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-[11px] shadow-xs flex items-center gap-1 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Finish Workflow</span>
          </button>
        ) : null}

        <button
          onClick={onOpenFlowReview}
          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium text-[11px] flex items-center gap-1.5 transition-colors"
        >
          <GitBranch className="w-3 h-3 text-indigo-400" />
          <span>Review in React Flow</span>
        </button>

        <button
          onClick={onOpenBatchLedger}
          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium text-[11px] flex items-center gap-1.5 transition-colors"
        >
          <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
          <span>Batch Reports & CSV</span>
        </button>

        <button
          onClick={onOpenExperience}
          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium text-[11px] flex items-center gap-1.5 transition-colors"
        >
          <Brain className="w-3 h-3 text-amber-400" />
          <span>Experience Memory</span>
        </button>

        <button
          onClick={onOpenApps}
          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium text-[11px] flex items-center gap-1.5 transition-colors"
        >
          <Globe className="w-3 h-3 text-sky-400" />
          <span>Applications</span>
        </button>
      </div>
    </div>
  );
};
