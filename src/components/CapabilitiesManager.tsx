import React, { useState, useEffect } from 'react';
import { SemanticCapability, Application } from '../types/automation';
import { api } from '../api';
import {
  Sparkles,
  Shield,
  Trash2,
  Filter,
  CheckCircle2,
  RefreshCw,
  Search,
  Code,
  Tag,
  AlertCircle,
  Play,
  X,
  Eye,
  Globe,
} from 'lucide-react';

export const CapabilitiesManager: React.FC = () => {
  const [capabilities, setCapabilities] = useState<SemanticCapability[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCap, setSelectedCap] = useState<SemanticCapability | null>(null);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [observeNote, setObserveNote] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [caps, apps] = await Promise.all([
        api.getCapabilities(),
        api.getApplications(),
      ]);
      setCapabilities(caps);
      setApplications(apps);
    } catch (e) {
      console.error('Failed to load capabilities', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete capability "${name}" from MySQL?`)) return;
    try {
      const res = await api.deleteCapability(id, true);
      if (res.success) {
        setNotice({ text: res.message, type: 'success' });
        loadData();
        if (selectedCap?.id === id) setSelectedCap(null);
      } else {
        setNotice({ text: res.message, type: 'error' });
      }
    } catch (e) {
      setNotice({ text: 'Error deleting capability.', type: 'error' });
    }
  };

  const handleRetire = async (id: string) => {
    try {
      await api.retireCapability(id);
      setNotice({ text: 'Capability retired successfully.', type: 'success' });
      loadData();
    } catch (e) {
      setNotice({ text: 'Failed to retire capability.', type: 'error' });
    }
  };

  const filteredCaps = capabilities.filter((cap) => {
    const matchesApp = selectedAppId === 'ALL' || cap.applicationId === selectedAppId;
    const matchesQuery =
      cap.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cap.semanticDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cap.type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesApp && matchesQuery;
  });

  const targetApp =
    selectedAppId !== 'ALL'
      ? applications.find((a) => a.id === selectedAppId)
      : applications.find((a) => a.isActive) || applications[0];

  const handleLaunchObserve = async (mode: 'launch' | 'observe' | 'discover') => {
    if (!targetApp) {
      setNotice({ text: 'Register an application first.', type: 'error' });
      return;
    }
    try {
      setIsLoading(true);
      if (mode === 'launch') await api.launchApplication(targetApp.id);
      if (mode === 'discover') {
        const res = await api.observeAndDiscover(targetApp.id);
        setObserveNote(
          `Observed "${res.observation.title}" · ${(res.observation.controls || []).length} page controls · ${
            res.observation.tables?.[0] ? 'table columns ' + (res.observation.tables[0].columns || []).join(', ') : 'no table'
          }`
        );
        await loadData();
      } else {
        const obs = await api.observeApplication(targetApp.id);
        setObserveNote(
          `Page validate: "${obs.title}" · columns ${obs.tables?.[0]?.columns?.join(', ') || 'none'}`
        );
      }
      setNotice({ text: 'Live page read.', type: 'success' });
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'Observe failed', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestCap = async (cap: SemanticCapability) => {
    const app = applications.find((a) => a.id === cap.applicationId);
    if (!app) return;
    try {
      await api.launchApplication(app.id);
      await api.observeApplication(app.id);
      setNotice({ text: `Test observe for "${cap.businessName}" — page is live.`, type: 'success' });
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'Test failed', type: 'error' });
    }
  };

  const getAppName = (appId: string) => {
    const app = applications.find((a) => a.id === appId);
    return app ? app.name : 'Unknown Application';
  };

  return (
    <div className="page-shell min-h-0 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="page-title flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Capabilities
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Reusable, application-independent semantic actions persisted in MySQL with target resolution & verification contracts
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={isLoading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-white">Target application workspace</p>
            <p className="text-[11px] text-slate-400">
              {targetApp ? `${targetApp.name} · ${targetApp.baseUrl}` : 'No UI app registered'}
              {targetApp ? ' · ONLINE after Launch' : ''}
            </p>
          </div>
          <Globe className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!targetApp || isLoading}
            onClick={() => handleLaunchObserve('launch')}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
          >
            Launch & observe landing page
          </button>
          <button
            type="button"
            disabled={!targetApp || isLoading}
            onClick={() => handleLaunchObserve('discover')}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white border border-slate-700 disabled:opacity-50"
          >
            Observe actions
          </button>
          <button
            type="button"
            disabled={!targetApp || isLoading}
            onClick={() => handleLaunchObserve('observe')}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white border border-slate-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5" />
            Observe page validate
          </button>
        </div>
        {observeNote ? <p className="text-[11px] text-emerald-300">{observeNote}</p> : null}
        <p className="text-[10px] text-slate-500">
          Table row actions stay generic (type + text). Pick the app filter below to bind this workspace.
        </p>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between ${
            notice.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-400">Application:</span>
          <select
            value={selectedAppId}
            onChange={(e) => setSelectedAppId(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
          >
            <option value="ALL">All Applications ({capabilities.length})</option>
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search capabilities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* List / Detail view */}
      {capabilities.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-dashed border-slate-800">
          <Sparkles className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Capabilities in MySQL</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Register a live application, then use Observe to discover automatable controls. BUILD mode also records capabilities while teaching a workflow.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
          {filteredCaps.map((cap) => (
            <div
              key={cap.id}
              className={`p-4 rounded-xl border bg-slate-900/90 transition shadow-lg flex flex-col justify-between ${
                cap.isRetired ? 'border-slate-800/40 opacity-60' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-semibold text-indigo-400 font-mono">
                      {getAppName(cap.applicationId)}
                    </span>
                    <h3 className="font-bold text-white text-sm mt-0.5">{cap.businessName}</h3>
                  </div>

                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        cap.riskLevel === 'CRITICAL'
                          ? 'bg-rose-500/10 text-rose-400'
                          : cap.riskLevel === 'HIGH'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {cap.riskLevel}
                    </span>
                    {cap.isRetired && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-slate-800 text-slate-400">
                        RETIRED
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                  {cap.semanticDescription}
                </p>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded text-slate-300 border border-slate-800">
                    Type: {cap.type}
                  </span>
                  <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded text-slate-300 border border-slate-800 font-mono">
                    v{cap.version}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedCap(cap)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    View Schema
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTestCap(cap)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" />
                    Test
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {!cap.isRetired && (
                    <button
                      onClick={() => handleRetire(cap.id)}
                      className="p-1 text-slate-400 hover:text-amber-400 transition"
                      title="Retire"
                    >
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(cap.id, cap.businessName)}
                    className="p-1 text-slate-400 hover:text-rose-400 transition"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedCap && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-white text-base">{selectedCap.businessName}</h3>
                <p className="text-xs text-slate-400">{getAppName(selectedCap.applicationId)}</p>
              </div>
              <button onClick={() => setSelectedCap(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="text-slate-400 block font-semibold mb-1">Semantic Description</label>
                <div className="p-3 bg-slate-950 rounded-lg text-slate-200 border border-slate-800">
                  {selectedCap.semanticDescription}
                </div>
              </div>

              <div>
                <label className="text-slate-400 block font-semibold mb-1">Target Definition (Intent Resolution)</label>
                <pre className="p-3 bg-slate-950 rounded-lg text-indigo-300 font-mono text-[11px] border border-slate-800 overflow-x-auto">
                  {JSON.stringify(selectedCap.targetDefinition, null, 2)}
                </pre>
              </div>

              <div>
                <label className="text-slate-400 block font-semibold mb-1">Verification Contract</label>
                <pre className="p-3 bg-slate-950 rounded-lg text-emerald-300 font-mono text-[11px] border border-slate-800 overflow-x-auto">
                  {JSON.stringify(selectedCap.verificationDefinition, null, 2)}
                </pre>
              </div>

              <div>
                <label className="text-slate-400 block font-semibold mb-1">Recovery Policy</label>
                <pre className="p-3 bg-slate-950 rounded-lg text-amber-300 font-mono text-[11px] border border-slate-800 overflow-x-auto">
                  {JSON.stringify(selectedCap.recoveryDefinition, null, 2)}
                </pre>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedCap(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
