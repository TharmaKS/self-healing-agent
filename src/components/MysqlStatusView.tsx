import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Database } from 'lucide-react';

export const MysqlStatusView: React.FC = () => {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.getHealth().then((h) => setHealth(h as unknown as Record<string, unknown>)).catch(() => setHealth({ mysql: false }));
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        <Database className="w-5 h-5 text-indigo-400" />
        Local MySQL DB
      </h2>
      <p className="text-xs text-slate-400">
        Chromium sessions, chat Build phase, and report files are not MySQL rows. Caps, apps, flows, and remaps are.
      </p>
      <pre className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-[11px] text-emerald-300 overflow-auto">
        {JSON.stringify(health, null, 2)}
      </pre>
    </div>
  );
};
