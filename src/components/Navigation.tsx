import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  LayoutDashboard,
  Sparkles,
  GitBranch,
  Bot,
  Brain,
  Globe,
  ListTodo,
  Settings,
  Database,
  FileCode,
} from 'lucide-react';

export type MainTab =
  | 'dashboard'
  | 'capabilities'
  | 'flows'
  | 'agent'
  | 'experiences'
  | 'applications'
  | 'execution'
  | 'settings'
  | 'mysql'
  | 'python'
  | 'reports';

export type NavTab = MainTab;

interface NavigationProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
}

const orchestration: Array<{ id: MainTab; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'agent', label: 'Agent', icon: <Bot className="w-4 h-4" /> },
  { id: 'capabilities', label: 'Capabilities', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'flows', label: 'Business flows', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'experiences', label: 'Experiences', icon: <Brain className="w-4 h-4" /> },
  { id: 'applications', label: 'Applications', icon: <Globe className="w-4 h-4" /> },
  { id: 'execution', label: 'Executions', icon: <ListTodo className="w-4 h-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
];

const storage: Array<{ id: MainTab; label: string; icon: React.ReactNode }> = [
  { id: 'mysql', label: 'MySQL', icon: <Database className="w-4 h-4" /> },
  { id: 'python', label: 'Architecture', icon: <FileCode className="w-4 h-4" /> },
];

function NavButton({
  item,
  active,
  onClick,
}: {
  item: { id: MainTab; label: string; icon: React.ReactNode };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition ${
        active
          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-950/50'
          : 'text-slate-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      <span className={active ? 'text-white' : 'text-slate-500'}>{item.icon}</span>
      <span className="flex-1 text-left">{item.label}</span>
    </button>
  );
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const [mysqlOk, setMysqlOk] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .getHealth()
      .then((h) => setMysqlOk(!!h.mysql))
      .catch(() => setMysqlOk(false));
  }, [activeTab]);

  return (
    <aside className="w-[15.5rem] shrink-0 border-r border-white/10 bg-[#0b1220] flex flex-col">
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 flex items-center justify-center text-white text-[11px] font-bold shadow-lg shadow-indigo-500/20">
            AA
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white leading-tight">Agentic Automation</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Enterprise agent studio</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-5 overflow-y-auto">
        <div>
          <p className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace</p>
          <div className="space-y-0.5">
            {orchestration.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={activeTab === item.id || (item.id === 'execution' && activeTab === 'reports')}
                onClick={() => onTabChange(item.id)}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Platform</p>
          <div className="space-y-0.5">
            {storage.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={activeTab === item.id}
                onClick={() => onTabChange(item.id)}
              />
            ))}
          </div>
        </div>
      </nav>
      <div className="p-3 border-t border-white/10">
        <div
          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-medium ${
            mysqlOk ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${mysqlOk ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {mysqlOk ? 'MySQL connected' : 'MySQL disconnected'}
        </div>
      </div>
    </aside>
  );
};
