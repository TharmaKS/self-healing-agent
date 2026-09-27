import React from 'react';

export type TraceStep = { id: string; name: string; status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' };
export type TraceRow = { rowId: string; status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED'; line: string };

interface ExecutionTracePopupProps {
  open: boolean;
  stepName: string;
  steps: TraceStep[];
  rows: TraceRow[];
  rowIndex: number;
  onRowIndex: (index: number) => void;
  onClose: () => void;
  help?: {
    message: string;
    interventionId: string;
    candidates: Array<{ text: string; selector?: string; confidence?: number }>;
  } | null;
  onRetry?: (interventionId: string) => void;
  onMap?: (interventionId: string, target: string) => void;
  onSkip?: (interventionId: string) => void;
  onStop?: () => void;
}

export const ExecutionTracePopup: React.FC<ExecutionTracePopupProps> = ({
  open,
  stepName,
  steps,
  rows,
  rowIndex,
  onRowIndex,
  onClose,
  help,
  onRetry,
  onMap,
  onSkip,
  onStop,
}) => {
  if (!open) return null;
  const row = rows[rowIndex];
  return (
    <div className="absolute bottom-24 right-6 z-30 w-80 max-w-[calc(100%-2rem)] rounded-2xl border border-white/10 bg-[#0e1628]/95 shadow-2xl p-3.5 text-xs backdrop-blur">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Execution trace</div>
          <div className="text-white font-semibold">{stepName || 'Running'}</div>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white px-1">
          ×
        </button>
      </div>
      <ol className="space-y-0.5 mb-2 max-h-24 overflow-y-auto">
        {steps.map((s) => (
          <li key={s.id} className="flex justify-between gap-2 text-slate-300">
            <span className="truncate">{s.name}</span>
            <span
              className={
                s.status === 'PASSED'
                  ? 'text-emerald-400'
                  : s.status === 'RUNNING'
                    ? 'text-amber-400'
                    : s.status === 'FAILED'
                      ? 'text-rose-400'
                      : 'text-slate-500'
              }
            >
              {s.status}
            </span>
          </li>
        ))}
      </ol>
      {rows.length > 1 && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>Matching rows</span>
            <span>
              {rowIndex + 1} / {rows.length}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={rows.length - 1}
            value={rowIndex}
            onChange={(e) => onRowIndex(Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}
      {row && (
        <p className="text-slate-300 mb-2">
          Row {row.rowId}: {row.line || row.status}
        </p>
      )}
      {help && (
        <div className="border-t border-slate-800 pt-2 space-y-2">
          <p className="text-amber-200">{help.message}</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onRetry?.(help.interventionId)}
              className="px-2 py-1 rounded bg-indigo-600 text-white font-medium"
            >
              Retry
            </button>
            {help.candidates.map((c, i) => (
              <button
                key={`${c.selector || c.text}-${i}`}
                type="button"
                onClick={() => onMap?.(help.interventionId, c.selector || c.text)}
                className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200"
              >
                Use {c.text}
                {typeof c.confidence === 'number' ? ` (${Math.round(c.confidence * 100)}%)` : ''}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onSkip?.(help.interventionId)}
              className="px-2 py-1 rounded bg-slate-800 text-slate-400"
            >
              Skip row
            </button>
          </div>
        </div>
      )}
      {onStop ? (
        <div className="border-t border-slate-800 pt-2 mt-2">
          <button
            type="button"
            onClick={onStop}
            className="w-full px-2 py-1.5 rounded bg-rose-600/90 hover:bg-rose-600 text-white font-semibold"
            title="Stop after the current click. Browser stays open."
          >
            Stop run
          </button>
        </div>
      ) : null}
    </div>
  );
};
