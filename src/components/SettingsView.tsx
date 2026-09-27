import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Database, Key, Shield } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [health, setHealth] = useState<{ mysql?: boolean; applications?: number; capabilities?: number; flows?: number } | null>(
    null
  );
  const [credentials, setCredentials] = useState<Array<{ key: string; configured: boolean }>>([]);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => setHealth({ mysql: false }));
    api
      .getCredentialsStatus()
      .then((d) => setCredentials(d.credentials || []))
      .catch(() => undefined);
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 overflow-y-auto">
      <div>
        <h2 className="text-lg font-bold text-white">Settings</h2>
        <p className="text-xs text-slate-400 mt-1">
          Product store is MySQL. Secrets are env <strong>names</strong> only — values stay in <code className="text-indigo-300">.env</code>.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
        <p className="text-xs font-semibold text-white flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-400" /> Persistence mapping
        </p>
        <ul className="text-xs text-slate-300 space-y-1 font-mono">
          <li>registered_applications → Prisma Application</li>
          <li>semantic_capabilities → Prisma SemanticCapability</li>
          <li>business_workflows → Prisma BusinessFlow (nodes/edges JSON)</li>
          <li>experience_memory → Prisma ExperienceMemory</li>
        </ul>
        <p className="text-[11px] text-slate-500">
          Health: MySQL {health?.mysql ? 'connected' : 'down'} · apps {health?.applications ?? '—'} · caps{' '}
          {health?.capabilities ?? '—'} · flows {health?.flows ?? '—'}
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
        <p className="text-xs font-semibold text-white flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-400" /> Env key names
        </p>
        {credentials.map((c) => (
          <div key={c.key} className="flex justify-between text-xs text-slate-300 font-mono">
            <span>{c.key}</span>
            <span className={c.configured ? 'text-emerald-400' : 'text-amber-400'}>
              {c.configured ? 'set' : 'missing'}
            </span>
          </div>
        ))}
        <p className="text-[11px] text-slate-500 flex items-center gap-1">
          <Shield className="w-3 h-3" /> Values are never shown in this UI.
        </p>
      </div>
    </div>
  );
};
