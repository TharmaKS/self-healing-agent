import React, { useState } from 'react';
import { SemanticCapability, Application } from '../types/automation';
import {
  Sparkles,
  Shield,
  Play,
  CheckCircle,
  FileText,
  Trash2,
  Table as TableIcon,
  Tag,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';
import { api } from '../api';

interface CapabilityLibraryViewProps {
  capabilities: SemanticCapability[];
  applications: Application[];
  onTestCapability: (id: string) => Promise<any>;
  onDeleteCapability: (id: string) => void;
  onNavigateToBuilder: () => void;
}

export const CapabilityLibraryView: React.FC<CapabilityLibraryViewProps> = ({
  capabilities,
  applications,
  onTestCapability,
  onDeleteCapability,
  onNavigateToBuilder,
}) => {
  const [selectedAppId, setSelectedAppId] = useState<string>('all');
  const [testResult, setTestResult] = useState<{ id: string; data: any } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const filteredCaps =
    selectedAppId === 'all'
      ? capabilities
      : capabilities.filter((c) => c.applicationId === selectedAppId);

  const handleTest = async (capId: string) => {
    setIsTesting(true);
    try {
      const res = await onTestCapability(capId);
      setTestResult({ id: capId, data: res });
    } catch (e) {
      console.error('Testing capability failed:', e);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Semantic Capability Library
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Verified, reusable business operations independent of brittle HTML selectors
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
            <button
              onClick={() => setSelectedAppId('all')}
              className={`px-3 py-1 font-medium rounded-md transition-colors ${
                selectedAppId === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Apps ({capabilities.length})
            </button>
            {applications.map((app) => (
              <button
                key={app.id}
                onClick={() => setSelectedAppId(app.id)}
                className={`px-3 py-1 font-medium rounded-md transition-colors ${
                  selectedAppId === app.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {app.name}
              </button>
            ))}
          </div>

          <button
            onClick={onNavigateToBuilder}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <span>Compose in Flow Builder</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Capabilities List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredCaps.map((cap) => {
          const app = applications.find((a) => a.id === cap.applicationId);
          const isTestingThis = isTesting && testResult?.id === cap.id;
          const currentTest = testResult?.id === cap.id ? testResult.data : null;

          return (
            <div
              key={cap.id}
              className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 hover:border-slate-300 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{cap.businessName}</h3>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                      v{cap.version}.0
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{app?.name || cap.applicationId}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-indigo-700 font-semibold">{cap.type}</span>
                    <span aria-hidden="true">·</span>
                    <span>{cap.pageContext || 'Global'}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-semibold ${
                        cap.riskLevel === 'CRITICAL'
                          ? 'text-rose-700'
                          : cap.riskLevel === 'HIGH'
                          ? 'text-amber-700'
                          : 'text-slate-600'
                      }`}
                    >
                      Risk: {cap.riskLevel}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start">
                  <button
                    onClick={() => handleTest(cap.id)}
                    disabled={isTesting}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Test Resolver</span>
                  </button>

                  <button
                    onClick={() => onDeleteCapability(cap.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {cap.semanticDescription}
              </p>

              {/* Three-Box Specs: Target, Verification, Policy */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700 block">
                    Semantic Target Contract
                  </span>
                  <div className="text-[11px] text-slate-600 space-y-0.5">
                    <div>Intent: <strong>{cap.targetDefinition.semanticIntent}</strong></div>
                    <div>Pattern: <code className="font-mono text-[10px]">{cap.targetDefinition.visibleTextPattern || '—'}</code></div>
                    <div>Role: <span className="font-mono">{cap.targetDefinition.role || 'any'}</span></div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700 block">
                    Business Outcome Verification
                  </span>
                  <p className="text-[11px] text-slate-600 line-clamp-2">
                    {cap.verificationDefinition.expectedOutcome}
                  </p>
                  <div className="text-[10px] text-emerald-700 font-medium">
                    Status: {cap.verificationDefinition.successCondition.statusText || 'Verified'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700 block">
                    Recovery & Failure Policy
                  </span>
                  <div className="text-[11px] text-slate-600 space-y-0.5">
                    <div>Human Remap: <strong>{cap.recoveryDefinition.allowHumanRemapping ? 'Allowed' : 'Disallowed'}</strong></div>
                    <div>Max Retries: <strong>{cap.recoveryDefinition.maxRetries}</strong></div>
                    <div>On Failure: <span className="font-mono font-semibold">{cap.recoveryDefinition.onFailure}</span></div>
                  </div>
                </div>
              </div>

              {/* Live Test Resolver Result Preview */}
              {currentTest ? (
                <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      Semantic Target Resolution Output ({currentTest.resolution.status})
                    </span>
                    <span className="font-mono font-bold text-indigo-700 tabular-nums">
                      {(currentTest.resolution.confidence * 100).toFixed(0)}% Confidence
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-700">
                    <p className="font-medium text-slate-900">
                      Resolved target: &quot;{(currentTest.resolution.target as any)?.visibleText || (currentTest.resolution.target as any)?.id}&quot;
                    </p>
                    <ul className="list-disc list-inside text-slate-600 pl-1 space-y-0.5">
                      {currentTest.resolution.reasons.map((r: string, idx: number) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
