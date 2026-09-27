import React, { useState } from 'react';
import { ExperienceMemoryEntry, Application } from '../types/automation';
import {
  Brain,
  Shield,
  Trash2,
  ToggleLeft,
  ToggleRight,
  CheckCircle,
  Plus,
  RotateCcw,
} from 'lucide-react';

interface ExperienceMemoryViewProps {
  experience: ExperienceMemoryEntry[];
  applications: Application[];
  onToggleEnabled: (id: string, current: boolean) => void;
  onDeleteExperience: (id: string) => void;
  onAddExperience: (entry: Partial<ExperienceMemoryEntry>) => void;
}

export const ExperienceMemoryView: React.FC<ExperienceMemoryViewProps> = ({
  experience,
  applications,
  onToggleEnabled,
  onDeleteExperience,
  onAddExperience,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [originalTarget, setOriginalTarget] = useState('Send Claim');
  const [resolvedTarget, setResolvedTarget] = useState('Submit');
  const [pageContext, setPageContext] = useState('Claims Ledger Table Row');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!originalTarget || !resolvedTarget) return;

    onAddExperience({
      applicationId: applications[0]?.id || 'app-claims-portal',
      originalTarget,
      resolvedTarget,
      pageContext,
      resolutionMethod: 'HUMAN_CONFIRMATION',
      confidence: 0.95,
      isEnabled: true,
    });

    setShowAddModal(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Validated Experience Memory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Learned semantic remappings validated through human confirmation and outcome verification
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-1.5 transition-colors self-start"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Remapping Rule</span>
        </button>
      </div>

      {/* Policy Invariant Note */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
        <div className="font-bold text-slate-900 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-indigo-600" />
          <span>Experience != Authorization</span>
        </div>
        <p className="text-slate-600 leading-relaxed">
          Stored experience increases candidate confidence during semantic target resolution, but cannot
          override risk-policy boundaries. CRITICAL risk operations and policy-mandated reviews still
          require human authorization.
        </p>
      </div>

      {/* Experience Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        {experience.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-xs">
            No validated experience stored yet. When you confirm row remappings during execution, they are automatically stored here.
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Original Semantic Target</th>
                <th className="py-2.5 px-3">Resolved UI Target</th>
                <th className="py-2.5 px-3">Resolution Method</th>
                <th className="py-2.5 px-3 text-right">Confidence</th>
                <th className="py-2.5 px-3 text-right">Successes</th>
                <th className="py-2.5 px-3">Page Context</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {experience.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-slate-900">
                    {entry.originalTarget}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                    &quot;{entry.resolvedTarget}&quot;
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-slate-600 font-medium">
                    {entry.resolutionMethod}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-800">
                    {(entry.confidence * 100).toFixed(0)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-600 font-bold">
                    {entry.successCount}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                    {entry.pageContext}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => onToggleEnabled(entry.id, entry.isEnabled)}
                      className="text-slate-700 hover:opacity-80 transition-opacity"
                    >
                      {entry.isEnabled ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold">
                          Enabled
                        </span>
                      ) : (
                        <span className="text-slate-400 bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold">
                          Disabled
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => onDeleteExperience(entry.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Add Validated Experience Rule</h3>
            <form onSubmit={handleAdd} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Original Semantic Target</label>
                <input
                  type="text"
                  required
                  value={originalTarget}
                  onChange={(e) => setOriginalTarget(e.target.value)}
                  placeholder="e.g. Send Claim"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Resolved UI Target</label>
                <input
                  type="text"
                  required
                  value={resolvedTarget}
                  onChange={(e) => setResolvedTarget(e.target.value)}
                  placeholder="e.g. Submit"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Page Context</label>
                <input
                  type="text"
                  value={pageContext}
                  onChange={(e) => setPageContext(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold"
                >
                  Save Remapping
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
