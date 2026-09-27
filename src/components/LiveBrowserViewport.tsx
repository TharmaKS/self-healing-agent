import React from 'react';
import { ObservationResult } from '../types/automation';
import { Globe, RefreshCw, Eye } from 'lucide-react';

interface LiveBrowserViewportProps {
  observation: ObservationResult | null;
  onRefreshObservation: () => Promise<void>;
  activeControlHighlight?: string;
  isHeaded?: boolean;
}

export const LiveBrowserViewport: React.FC<LiveBrowserViewportProps> = ({
  observation,
  onRefreshObservation,
  activeControlHighlight,
}) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-300 min-w-0">
          <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="truncate">{observation?.url || 'No live page observed yet'}</span>
        </div>
        <button
          onClick={() => onRefreshObservation()}
          className="p-1.5 rounded bg-slate-800 text-slate-300 hover:text-white border border-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      {observation?.screenshotUrl ? (
        <img src={observation.screenshotUrl} alt={observation.title} className="w-full max-h-80 object-top object-cover" />
      ) : (
        <div className="p-8 text-center text-xs text-slate-500">
          <Eye className="w-8 h-8 mx-auto mb-2 text-slate-600" />
          Launch and observe a registered application to see the live page here.
        </div>
      )}
      {observation && (
        <div className="p-3 border-t border-slate-800 text-[11px] text-slate-400">
          {observation.title} · {observation.controls.length} controls · {observation.tables.length} tables
          {activeControlHighlight ? ` · highlight ${activeControlHighlight}` : ''}
        </div>
      )}
    </div>
  );
};
