import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { MainTab } from './Navigation';
import { GitBranch, Sparkles, Globe, Play } from 'lucide-react';

interface StudioDashboardProps {
  onNavigate: (tab: MainTab) => void;
}

export const StudioDashboard: React.FC<StudioDashboardProps> = ({ onNavigate }) => {
  const [health, setHealth] = useState<{ mysql?: boolean; applications?: number; capabilities?: number; flows?: number }>({});

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => undefined);
  }, []);

  const cards = [
    { label: 'Applications', value: health.applications ?? '—', tab: 'applications' as MainTab, Icon: Globe, hint: 'Registered UIs' },
    { label: 'Capabilities', value: health.capabilities ?? '—', tab: 'capabilities' as MainTab, Icon: Sparkles, hint: 'Taught actions' },
    { label: 'Business flows', value: health.flows ?? '—', tab: 'flows' as MainTab, Icon: GitBranch, hint: 'Saved graphs' },
    { label: 'Agent', value: 'BUILD / RUN', tab: 'agent' as MainTab, Icon: Play, hint: 'Teach and execute' },
  ];

  return (
    <div className="page-shell">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Command center</h1>
          <p className="page-sub max-w-xl">
            Teach capabilities from a live page, compose a flow, test until success, then run. Chromium stays on this machine.
          </p>
        </div>
        <p className={`text-[11px] font-medium shrink-0 ${health.mysql ? 'text-emerald-300' : 'text-amber-300'}`}>
          {health.mysql ? 'MySQL online' : 'MySQL offline'}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onNavigate(c.tab)}
            className="surface text-left p-5 hover:border-indigo-400/30 hover:bg-slate-900/80 transition group"
          >
            <c.Icon className="w-4 h-4 text-indigo-300 mb-4" />
            <div className="text-2xl font-semibold text-white tracking-tight">{c.value}</div>
            <div className="text-[13px] text-slate-200 mt-1">{c.label}</div>
            <div className="text-[11px] text-slate-500 mt-1 group-hover:text-slate-400">{c.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
};
