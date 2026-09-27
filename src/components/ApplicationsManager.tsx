import React, { useState, useEffect } from 'react';
import { Application, DependencyCheckResult, ObservationResult } from '../types/automation';
import { api } from '../api';
import {
  Globe,
  Plus,
  Play,
  Square,
  Trash2,
  Shield,
  AlertTriangle,
  RefreshCw,
  X,
  Eye,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';

export const ApplicationsManager: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Application | null>(null);
  const [dependencyInfo, setDependencyInfo] = useState<DependencyCheckResult | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formLoginUrl, setFormLoginUrl] = useState('');
  const [formAuthType, setFormAuthType] = useState<'BROWSER_SESSION' | 'BASIC' | 'OAUTH2' | 'NONE'>('BROWSER_SESSION');
  const [formEnv, setFormEnv] = useState<'DEV' | 'STAGING' | 'PRODUCTION'>('STAGING');
  const [formType, setFormType] = useState<'UI' | 'API'>('UI');
  const [formUserEnv, setFormUserEnv] = useState('');
  const [formPassEnv, setFormPassEnv] = useState('');
  const [formApiKeyEnv, setFormApiKeyEnv] = useState('');
  const [observingId, setObservingId] = useState<string | null>(null);
  const [lastObservation, setLastObservation] = useState<{ appName: string; observation: ObservationResult; created: number } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    setIsLoading(true);
    try {
      const data = await api.getApplications();
      setApplications(data);
    } catch (e) {
      console.error('Failed to load applications', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formBaseUrl.trim()) return;

    try {
      await api.createApplication({
        name: formName.trim(),
        description: formDesc.trim(),
        applicationType: formType,
        baseUrl: formBaseUrl.trim(),
        loginUrl: formLoginUrl.trim() || formBaseUrl.trim(),
        authType: formType === 'API' ? 'NONE' : formAuthType,
        apiAuthType: formType === 'API' ? 'API_KEY' : undefined,
        environment: formEnv,
        usernameEnvVar: formUserEnv.trim() || undefined,
        passwordEnvVar: formPassEnv.trim() || undefined,
        apiKeyEnvVar: formApiKeyEnv.trim() || undefined,
        credentialKeys: [formUserEnv.trim(), formPassEnv.trim(), formApiKeyEnv.trim()].filter(Boolean),
      });
      setShowAddModal(false);
      resetForm();
      loadApplications();
      setActionMessage({ text: `Application "${formName}" registered in MySQL.`, type: 'success' });
    } catch (e) {
      setActionMessage({ text: 'Failed to create application.', type: 'error' });
    }
  };

  const handleObserve = async (app: Application) => {
    setObservingId(app.id);
    try {
      const res = await api.observeAndDiscover(app.id);
      const created = Array.isArray(res.createdCapabilities) ? res.createdCapabilities.length : 0;
      setLastObservation({ appName: app.name, observation: res.observation, created });
      setActionMessage({
        text: `Observed "${app.name}" (${res.observation.controls.length} controls, ${res.observation.tables.length} tables). ${created} new capabilities saved.`,
        type: 'success',
      });
    } catch (e) {
      setActionMessage({
        text: e instanceof Error ? e.message : 'Failed to observe application.',
        type: 'error',
      });
    } finally {
      setObservingId(null);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setFormBaseUrl('');
    setFormLoginUrl('');
    setFormAuthType('BROWSER_SESSION');
    setFormEnv('STAGING');
    setFormType('UI');
    setFormUserEnv('');
    setFormPassEnv('');
    setFormApiKeyEnv('');
  };

  const initiateDelete = async (app: Application) => {
    setDeleteCandidate(app);
    try {
      const depCheck = await api.checkApplicationDependencies(app.id);
      setDependencyInfo(depCheck);
    } catch (e) {
      console.error('Failed to check dependencies', e);
    }
  };

  const confirmDelete = async (force: boolean) => {
    if (!deleteCandidate) return;
    try {
      const res = await api.deleteApplication(deleteCandidate.id, force);
      if (res.success) {
        setActionMessage({ text: res.message, type: 'success' });
        setDeleteCandidate(null);
        setDependencyInfo(null);
        loadApplications();
      } else {
        setActionMessage({ text: res.message || 'Cannot delete application with dependencies.', type: 'error' });
      }
    } catch (e) {
      setActionMessage({ text: 'Error deleting application.', type: 'error' });
    }
  };

  const handleRetire = async (id: string) => {
    try {
      await api.retireApplication(id);
      setActionMessage({ text: 'Application retired.', type: 'success' });
      loadApplications();
    } catch (e) {
      setActionMessage({ text: 'Failed to retire application.', type: 'error' });
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await api.restoreApplication(id);
      setActionMessage({ text: 'Application restored and unretired.', type: 'success' });
      loadApplications();
    } catch (e) {
      setActionMessage({ text: 'Failed to restore application.', type: 'error' });
    }
  };

  const handleLaunch = async (id: string) => {
    try {
      await api.launchApplication(id);
      setActionMessage({ text: 'Chromium browser session launched.', type: 'success' });
      loadApplications();
    } catch (e) {
      setActionMessage({ text: 'Failed to launch session.', type: 'error' });
    }
  };

  const handleClose = async (id: string) => {
    try {
      await api.closeApplication(id);
      setActionMessage({ text: 'Browser session closed.', type: 'success' });
      loadApplications();
    } catch (e) {
      setActionMessage({ text: 'Failed to close session.', type: 'error' });
    }
  };

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="page-title flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            Applications
          </h2>
          <p className="page-sub">Register apps, launch a browser, and observe the live page.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadApplications}
            disabled={isLoading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition"
          >
            <Plus className="w-4 h-4" />
            Register Application
          </button>
        </div>
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between ${
            actionMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Application Cards List */}
      {applications.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-dashed border-slate-800">
          <Globe className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Applications Registered</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Register a live application URL, then launch and observe it to discover automatable capabilities.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/20 transition"
            >
              Register Application
            </button>
          </div>
        </div>
      ) : (
        <div className="surface divide-y divide-white/10 overflow-hidden">
          {applications.map((app) => {
            const open = detailId === app.id;
            return (
              <div key={app.id} className={app.isActive ? '' : 'opacity-80'}>
                <div className="px-3 py-2.5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDetailId(open ? null : app.id)}
                    className="min-w-0 flex-1 flex items-center gap-3 text-left"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition ${open ? '' : '-rotate-90'}`}
                    />
                    <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-white truncate">{app.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold bg-slate-800 text-slate-400">
                          {app.applicationType || 'UI'}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                            app.environment === 'PRODUCTION'
                              ? 'text-rose-300 bg-rose-500/10'
                              : 'text-indigo-300 bg-indigo-500/10'
                          }`}
                        >
                          {app.environment}
                        </span>
                        {!app.isActive ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold text-amber-300 bg-amber-500/10">
                            Retired
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{app.baseUrl}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {app.applicationType !== 'API' && app.isActive ? (
                      <>
                        <button
                          onClick={() => handleObserve(app)}
                          disabled={observingId === app.id}
                          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          {observingId === app.id ? '…' : 'Observe'}
                        </button>
                        <button
                          onClick={() => handleLaunch(app.id)}
                          className="p-1.5 text-emerald-400 hover:bg-slate-800 rounded"
                          title="Launch"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleClose(app.id)}
                          className="p-1.5 text-rose-400 hover:bg-slate-800 rounded"
                          title="Close"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : null}
                    {app.isActive ? (
                      <button
                        onClick={() => handleRetire(app.id)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 rounded hover:bg-slate-800"
                        title="Retire"
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRestore(app.id)}
                        className="p-1.5 text-emerald-400 hover:bg-slate-800 rounded"
                        title="Restore / unretire"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => initiateDelete(app)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {open ? (
                  <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[11px] border-t border-white/5 pt-2 bg-slate-950/40">
                    <div className="sm:col-span-2">
                      <span className="text-slate-500 block">Description</span>
                      <span className="text-slate-200">{app.description || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Base URL</span>
                      <span className="text-indigo-300 break-all">{app.baseUrl || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Login URL</span>
                      <span className="text-slate-300 break-all">{app.loginUrl || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Auth</span>
                      <span className="text-slate-200">{app.authType}{app.apiAuthType ? ` · ${app.apiAuthType}` : ''}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Status</span>
                      <span className={app.isActive ? 'text-emerald-300' : 'text-amber-300'}>
                        {app.isActive ? 'Active' : 'Retired'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Username env</span>
                      <span className="font-mono text-slate-300">{app.usernameEnvVar || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Password env</span>
                      <span className="font-mono text-slate-300">{app.passwordEnvVar || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">API key env</span>
                      <span className="font-mono text-slate-300">{app.apiKeyEnvVar || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Mechanisms</span>
                      <span className="text-slate-300">{(app.supportedMechanisms || []).join(', ') || 'PLAYWRIGHT_CHROMIUM'}</span>
                    </div>
                    <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1">
                      {app.isActive ? (
                        <button type="button" onClick={() => handleRetire(app.id)} className="btn-ghost text-amber-300">
                          <Shield className="w-3.5 h-3.5" />
                          Retire
                        </button>
                      ) : (
                        <button type="button" onClick={() => handleRestore(app.id)} className="btn-primary">
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restore / unretire
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {lastObservation && (
        <div className="surface overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <p className="text-xs text-slate-300">
              {lastObservation.appName}
              <span className="text-slate-500"> · {lastObservation.observation.controls.length} controls · {lastObservation.created} new capabilities</span>
            </p>
            <button onClick={() => setLastObservation(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          {lastObservation.observation.screenshotUrl ? (
            <img
              src={lastObservation.observation.screenshotUrl}
              alt="Observed page"
              className="w-full max-h-40 object-top object-cover border-b border-white/10"
            />
          ) : null}
        </div>
      )}

      {/* Register Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base">Register Enterprise Application</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateApp} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Application type *</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as 'UI' | 'API')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="UI">UI (browser automation)</option>
                  <option value="API">API (catalog only this release)</option>
                </select>
                {formType === 'API' && (
                  <p className="text-[11px] text-amber-400 mt-1">Stored in MySQL. API execution is not enabled in this release.</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Application Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Internal billing console"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Description</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  placeholder="Business context and purpose..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Base URL *</label>
                  <input
                    type="url"
                    required
                    value={formBaseUrl}
                    onChange={(e) => setFormBaseUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Login URL</label>
                  <input
                    type="url"
                    value={formLoginUrl}
                    onChange={(e) => setFormLoginUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Auth Type</label>
                  <select
                    value={formAuthType}
                    onChange={(e) => setFormAuthType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  >
                    <option value="BROWSER_SESSION">Browser Session</option>
                    <option value="BASIC">Basic Auth</option>
                    <option value="OAUTH2">OAuth 2.0</option>
                    <option value="NONE">No Auth</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Environment</label>
                  <select
                    value={formEnv}
                    onChange={(e) => setFormEnv(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  >
                    <option value="DEV">DEV</option>
                    <option value="STAGING">STAGING</option>
                    <option value="PRODUCTION">PRODUCTION</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Username env var</label>
                  <input
                    type="text"
                    value={formUserEnv}
                    onChange={(e) => setFormUserEnv(e.target.value)}
                    placeholder="APP_USERNAME"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Password env var</label>
                  <input
                    type="text"
                    value={formPassEnv}
                    onChange={(e) => setFormPassEnv(e.target.value)}
                    placeholder="APP_PASSWORD"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
                >
                  Register Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Dependency Warning Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-white text-base">Confirm Application Deletion</h3>
            </div>

            <p className="text-xs text-slate-300">
              Are you sure you want to delete <strong className="text-white">"{deleteCandidate.name}"</strong> from MySQL?
            </p>

            {dependencyInfo && dependencyInfo.hasDependencies && (
              <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-1">
                <p className="font-semibold text-rose-200">Warning: Existing Dependencies Detected</p>
                <p>• {dependencyInfo.capabilitiesCount} Capabilities depend on this application.</p>
                <p>• {dependencyInfo.flowsCount} Business Flows reference this application.</p>
                <p className="text-[11px] text-rose-300/80 pt-1">
                  Force deleting will cascade delete all linked capabilities and flows.
                </p>
              </div>
            )}

            <div className="mt-6 pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteCandidate(null);
                  setDependencyInfo(null);
                }}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
              >
                Cancel
              </button>

              {dependencyInfo?.hasDependencies ? (
                <button
                  onClick={() => confirmDelete(true)}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
                >
                  Force Delete Everything
                </button>
              ) : (
                <button
                  onClick={() => confirmDelete(false)}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
                >
                  Delete Application
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
