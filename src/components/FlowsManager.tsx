import React, { useState, useEffect } from 'react';
import { BusinessFlow, SemanticCapability, Application, FailurePolicy } from '../types/automation';
import { api } from '../api';
import { GitBranch, Trash2, Shield, RefreshCw, X, Plus } from 'lucide-react';
import { FlowBuilderView } from './FlowBuilderView';

interface FlowsManagerProps {
  onExecuteFlow?: (flow: BusinessFlow) => void;
}

function blankDraft(name: string, description: string, applicationId: string): Partial<BusinessFlow> {
  return {
    name: name.trim(),
    description: description.trim(),
    applicationId,
    status: 'DRAFT',
    version: 1,
    isRetired: false,
    latestTestStatus: 'PENDING',
    nodes: [
      { id: 'n-start', type: 'START', position: { x: 80, y: 140 }, data: { label: 'Start' } },
      { id: 'n-end', type: 'END', position: { x: 420, y: 140 }, data: { label: 'End' } },
    ],
    edges: [{ id: 'e-start-end', source: 'n-start', target: 'n-end' }],
    variables: [],
    failurePolicy: 'STOP' as FailurePolicy,
  };
}

export const FlowsManager: React.FC<FlowsManagerProps> = ({ onExecuteFlow }) => {
  const [flows, setFlows] = useState<BusinessFlow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<BusinessFlow | null>(null);
  const [capabilities, setCapabilities] = useState<SemanticCapability[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAppId, setNewAppId] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [flowData, caps, apps] = await Promise.all([
        api.getFlows(),
        api.getCapabilities(),
        api.getApplications(),
      ]);
      setFlows(flowData);
      setCapabilities(caps);
      setApplications(apps);
      setNewAppId((prev) => prev || apps[0]?.id || '');
      setSelectedFlow((prev) => {
        if (prev) return flowData.find((f) => f.id === prev.id) || flowData[0] || null;
        return flowData[0] || null;
      });
    } catch (e) {
      console.error('Failed to load flows', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await api.createFlow(blankDraft(newName, newDesc, newAppId));
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setNotice({ text: `Created "${created.name}". Drag capabilities onto the canvas.`, type: 'success' });
      const flowData = await api.getFlows();
      setFlows(flowData);
      setSelectedFlow(flowData.find((f) => f.id === created.id) || created);
    } catch {
      setNotice({ text: 'Could not create flow.', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete workflow "${name}" from MySQL?`)) return;
    try {
      const res = await api.deleteFlow(id, true);
      if (res.success) {
        setNotice({ text: res.message, type: 'success' });
        loadAll();
      } else {
        setNotice({ text: res.message, type: 'error' });
      }
    } catch {
      setNotice({ text: 'Error deleting flow', type: 'error' });
    }
  };

  const handleRetire = async (id: string) => {
    try {
      await api.retireFlow(id);
      setNotice({ text: 'Business flow retired and archived in MySQL.', type: 'success' });
      loadAll();
    } catch {
      setNotice({ text: 'Failed to retire flow', type: 'error' });
    }
  };

  return (
    <div className="p-5 h-full min-h-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <GitBranch className="w-5 h-5 text-indigo-400 shrink-0" />
          <select
            value={selectedFlow?.id || ''}
            onChange={(e) => setSelectedFlow(flows.find((f) => f.id === e.target.value) || null)}
            className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none min-w-[16rem] max-w-full"
          >
            {flows.length === 0 ? <option value="">No flows</option> : null}
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name} · {flow.status} · v{flow.version}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-primary"
          >
            <Plus className="w-3.5 h-3.5" />
            New flow
          </button>
          {selectedFlow && !selectedFlow.isRetired ? (
            <button
              type="button"
              onClick={() => handleRetire(selectedFlow.id)}
              className="p-2 text-slate-400 hover:text-amber-400"
              title="Retire"
            >
              <Shield className="w-4 h-4" />
            </button>
          ) : null}
          {selectedFlow ? (
            <button
              type="button"
              onClick={() => handleDelete(selectedFlow.id, selectedFlow.name)}
              className="p-2 text-slate-400 hover:text-rose-400"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={loadAll}
            disabled={isLoading}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-white/10"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between shrink-0 ${
            notice.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300'
              : 'bg-rose-500/10 text-rose-300'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {flows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center rounded-2xl border border-dashed border-white/10">
          <div>
            <h3 className="text-sm font-semibold text-white">No flows yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Create a draft and drag saved capabilities from the application list onto the canvas.
            </p>
            <button type="button" onClick={() => setShowCreate(true)} className="btn-primary mt-4">
              <Plus className="w-3.5 h-3.5" />
              New flow
            </button>
          </div>
        </div>
      ) : selectedFlow ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <FlowBuilderView
            flow={selectedFlow}
            capabilities={capabilities}
            applications={applications}
            onSaveFlow={async (updated) => {
              const saved = await api.updateFlow(updated.id, updated);
              setSelectedFlow(saved);
              setFlows((list) => list.map((f) => (f.id === saved.id ? saved : f)));
            }}
            onTestFlow={async (id) => api.testFlow(id)}
            onPublishFlow={async (id) => {
              await api.publishFlow(id);
              await loadAll();
            }}
            onRunFlow={(id) => {
              const flow = flows.find((f) => f.id === id);
              if (flow && onExecuteFlow) onExecuteFlow(flow);
            }}
          />
        </div>
      ) : null}

      {showCreate ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-5 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">New business flow</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Start with Start and End on the canvas. Add capabilities from each application in the palette.
            </p>
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Name</label>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Process ready claims"
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Application</label>
              <select
                value={newAppId}
                onChange={(e) => setNewAppId(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
              >
                {applications.length === 0 ? <option value="">No applications</option> : null}
                {applications.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Description</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional"
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={creating || !newName.trim()} className="btn-primary disabled:opacity-40">
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};
