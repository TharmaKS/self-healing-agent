import React, { useState } from 'react';
import { Application } from '../types/automation';
import {
  Globe,
  Play,
  Square,
  Key,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  ShieldCheck,
  Compass,
  CheckCircle,
} from 'lucide-react';
import { NavTab } from './Navigation';

interface ApplicationsViewProps {
  applications: Application[];
  onLaunch: (id: string) => void;
  onClose: (id: string) => void;
  onTestLogin: (id: string) => void;
  onCreateApp: (app: Partial<Application>) => void;
  onNavigateTab: (tab: NavTab) => void;
}

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({
  applications,
  onLaunch,
  onClose,
  onTestLogin,
  onCreateApp,
  onNavigateTab,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000/api/portal');
  const [loginUrl, setLoginUrl] = useState('http://localhost:3000/api/portal/login');
  const [env, setEnv] = useState<'DEV' | 'STAGING' | 'PRODUCTION'>('STAGING');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !baseUrl) return;
    onCreateApp({
      name,
      description,
      baseUrl,
      loginUrl,
      environment: env,
      authType: 'BROWSER_SESSION',
      credentialKeys: ['CLAIMS_USERNAME', 'CLAIMS_PASSWORD'],
      isActive: true,
      browserConfig: { viewport: { width: 1280, height: 800 }, headed: true, timeoutMs: 30000 },
      supportedMechanisms: ['PLAYWRIGHT_CHROMIUM'],
    });
    setName('');
    setDescription('');
    setShowCreateModal(false);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Registered Applications
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Enterprise portals and web platforms integrated for deterministic browser automation
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-1.5 transition-colors self-start"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Register Application</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {applications.map((app) => (
          <div
            key={app.id}
            className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{app.name}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                    <span>{app.environment}</span>
                    <span aria-hidden="true">·</span>
                    <span>{app.authType}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-600 font-medium">Active</span>
                  </div>
                </div>
              </div>

              <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                {app.id}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {app.description || 'Enterprise healthcare claims management and electronic data dispatch portal.'}
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-[11px] text-slate-400 font-medium">Base URL</span>
                <span className="font-mono text-slate-800 text-[11px] truncate max-w-[220px]">
                  {app.baseUrl}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-[11px] text-slate-400 font-medium">Credential Keys</span>
                <div className="flex items-center gap-1">
                  {app.credentialKeys.map((k) => (
                    <span
                      key={k}
                      className="font-mono text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onLaunch(app.id)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Launch Browser</span>
                </button>
                <button
                  onClick={() => onTestLogin(app.id)}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded transition-colors flex items-center gap-1.5"
                >
                  <Key className="w-3 h-3 text-slate-500" />
                  <span>Test Login</span>
                </button>
              </div>

              <button
                onClick={() => onNavigateTab('capabilities')}
                className="px-3 py-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 transition-colors"
              >
                <Compass className="w-3 h-3" />
                <span>Build Capabilities</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Register Application */}
      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Register Enterprise Application</h3>
            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Application Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. ERP Invoicing Portal"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Purpose of this application..."
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Base URL</label>
                <input
                  type="text"
                  required
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-[11px] focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Login URL</label>
                <input
                  type="text"
                  value={loginUrl}
                  onChange={(e) => setLoginUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-[11px] focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Environment</label>
                <select
                  value={env}
                  onChange={(e) => setEnv(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="DEV">DEV</option>
                  <option value="STAGING">STAGING</option>
                  <option value="PRODUCTION">PRODUCTION</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold"
                >
                  Save Application
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
