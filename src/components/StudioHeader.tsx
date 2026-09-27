import React from 'react';
import { Play } from 'lucide-react';

interface StudioHeaderProps {
  title?: string;
  mysqlOk?: boolean | null;
  onLaunchRun?: () => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  title = 'Agentic Automation Studio',
  mysqlOk,
  onLaunchRun,
}) => {
  return (
    <header className="h-14 shrink-0 border-b border-white/10 bg-[#0b1220]/90 backdrop-blur px-5 flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-semibold text-white tracking-tight">{title}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Teach · Test · Run · Verify</div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border ${
            mysqlOk
              ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
              : 'text-amber-300 bg-amber-500/10 border-amber-500/20'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${mysqlOk ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {mysqlOk ? 'MySQL online' : 'MySQL offline'}
        </span>
        {onLaunchRun ? (
          <button type="button" onClick={onLaunchRun} className="btn-primary">
            <Play className="w-3.5 h-3.5 fill-current" />
            Launch Run
          </button>
        ) : null}
      </div>
    </header>
  );
};
