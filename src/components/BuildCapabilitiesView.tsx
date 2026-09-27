import React, { useState, useEffect } from 'react';
import {
  Application,
  SemanticCapability,
  ObservationResult,
  ObservedControl,
  CapabilityType,
  RiskLevel,
} from '../types/automation';
import {
  Sparkles,
  Eye,
  CheckCircle,
  Shield,
  Table as TableIcon,
  RefreshCw,
  Plus,
  Compass,
  ArrowRight,
  Code2,
} from 'lucide-react';
import { api } from '../api';

interface BuildCapabilitiesViewProps {
  applications: Application[];
  selectedAppId?: string;
  onSaveCapability: (cap: Partial<SemanticCapability>) => void;
  onRefreshObservation: (appId: string) => Promise<ObservationResult>;
}

export const BuildCapabilitiesView: React.FC<BuildCapabilitiesViewProps> = ({
  applications,
  selectedAppId = 'app-claims-portal',
  onSaveCapability,
  onRefreshObservation,
}) => {
  const [currentAppId, setCurrentAppId] = useState(selectedAppId);
  const [observation, setObservation] = useState<ObservationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userIntent, setUserIntent] = useState('I want to submit a claim');
  const [selectedControl, setSelectedControl] = useState<ObservedControl | null>(null);

  // Capability draft fields
  const [businessName, setBusinessName] = useState('Submit Claim for Processing');
  const [capType, setCapType] = useState<CapabilityType>('TABLE_OPERATION');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('HIGH');
  const [expectedOutcome, setExpectedOutcome] = useState('Claim status transitions to Sent with verified reference number');
  const [requiresRef, setRequiresRef] = useState(true);
  const [refPattern, setRefPattern] = useState('SUB-\\d+');

  const activeApp = applications.find((a) => a.id === currentAppId) || applications[0];

  const loadObservation = async () => {
    if (!activeApp) return;
    setIsLoading(true);
    try {
      const obs = await onRefreshObservation(activeApp.id);
      setObservation(obs);
      if (obs.controls.length > 0) {
        setSelectedControl(obs.controls[0]);
      }
    } catch (e) {
      console.error('Failed to load observation:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadObservation();
  }, [currentAppId]);

  // Intent interpreter: translates natural language to suggested capability
  const handleInterpretIntent = () => {
    const lower = userIntent.toLowerCase();
    if (lower.includes('submit') || lower.includes('send') || lower.includes('claim')) {
      setBusinessName('Submit Claim for Processing');
      setCapType('TABLE_OPERATION');
      setRiskLevel('HIGH');
      setExpectedOutcome('Claim status transitions to Sent with reference SUB-\\d+');
      setRequiresRef(true);
      // Find matching control in observation
      const match = observation?.controls.find(
        (c) => c.visibleText?.toLowerCase().includes('send') || c.visibleText?.toLowerCase().includes('submit')
      );
      if (match) setSelectedControl(match);
    } else if (lower.includes('filter') || lower.includes('medicare')) {
      setBusinessName('Filter Claims by Payer and Status');
      setCapType('TABLE_OPERATION');
      setRiskLevel('LOW');
      setExpectedOutcome('Table rows restricted to matching payer criteria');
      setRequiresRef(false);
    } else if (lower.includes('login') || lower.includes('sign in') || lower.includes('auth')) {
      setBusinessName('Authenticate Portal Session');
      setCapType('ENTER');
      setRiskLevel('LOW');
      setExpectedOutcome('Dashboard visible and authenticated user verified');
      setRequiresRef(false);
    }
  };

  const handleSaveDraft = () => {
    if (!activeApp || !businessName) return;

    onSaveCapability({
      applicationId: activeApp.id,
      businessName,
      type: capType,
      pageContext: observation?.title || 'Claims Ledger',
      semanticDescription: `Intent: "${userIntent}". Reusable capability compiled from live observation.`,
      targetDefinition: {
        semanticIntent: userIntent,
        visibleTextPattern: selectedControl?.visibleText || 'Send Claim|Submit',
        role: selectedControl?.role || 'button',
        controlType: selectedControl?.type || 'button',
        pageContext: observation?.title || 'Claims Ledger',
        selectorFallback: selectedControl?.selectorFallback,
        isRowAction: capType === 'TABLE_OPERATION',
      },
      inputDefinition: [
        { name: 'claimId', type: 'STRING', required: true, description: 'Target stable claim row ID' },
      ],
      outputDefinition: [
        { name: 'referenceNumber', type: 'STRING', description: 'Assigned EDI reference' },
        { name: 'status', type: 'STRING', description: 'Updated row status' },
      ],
      verificationDefinition: {
        expectedOutcome,
        successCondition: {
          statusText: 'Sent',
          requiresReferenceNumber: requiresRef,
          referencePattern: refPattern,
          prohibitedErrors: ['Validation error', 'Submission failed'],
        },
      },
      recoveryDefinition: {
        allowHumanRemapping: true,
        maxRetries: 2,
        fallbackCandidates: ['Submit', 'Process', 'Dispatch'],
        onFailure: 'CONTINUE',
      },
      riskLevel,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Build Capabilities & Live Observation
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Teach reusable semantic business capabilities from observed application state
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={currentAppId}
            onChange={(e) => setCurrentAppId(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-700 font-medium focus:outline-hidden"
          >
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>

          <button
            onClick={loadObservation}
            disabled={isLoading}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Re-Observe Page</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Browser View & Table Inspector */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
            {/* Browser chrome header */}
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                <span className="text-slate-400 ml-2 font-mono text-[11px]">Chromium Headed Observation</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-500 bg-white px-2.5 py-0.5 rounded border border-slate-200">
                  {observation?.url || activeApp.baseUrl}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 font-semibold">
                  LIVE BROWSER
                </span>
              </div>
            </div>

            {/* Live Observation Viewport */}
            <div className="p-5 bg-slate-50 min-h-[380px] space-y-4">
              {observation ? (
                <>
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">{observation.title}</h2>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {observation.headings.join(' · ')}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Captured: {new Date(observation.capturedAt).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Detected Tables Section */}
                  {observation.tables.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <TableIcon className="w-4 h-4 text-indigo-600" />
                        <span>Table row action · {observation.tables[0].semanticName}</span>
                      </div>

                      <p className="text-xs text-slate-600">
                        Columns: {observation.tables[0].columns.join(', ') || 'none'}
                      </p>
                    </div>
                  ) : null}

                  {/* Detected Controls Grid */}
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-semibold text-slate-800 block">
                      Discovered Semantic Controls ({observation.controls.filter((c) => !c.inRowId).length})
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                      {observation.controls.filter((ctrl) => !ctrl.inRowId).map((ctrl) => {
                        const isSelected = selectedControl?.id === ctrl.id;
                        return (
                          <button
                            key={ctrl.id}
                            onClick={() => setSelectedControl(ctrl)}
                            className={`p-2.5 rounded text-left border transition-all ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-400'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <span className="font-semibold text-slate-900 text-xs block truncate">
                              {ctrl.visibleText || ctrl.accessibleName || ctrl.id}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                              <span className="font-mono uppercase">{ctrl.role || ctrl.type}</span>
                              {ctrl.inRowId ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono text-indigo-600 font-semibold">{ctrl.inRowId}</span>
                                </>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-xs">
                  <Eye className="w-8 h-8 mb-2 stroke-1" />
                  <span>Loading live browser observation from {activeApp.baseUrl}...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Intent Teacher & Capability Definition Compiler */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Teach Capability with Natural Intent</span>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                User Business Intent
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userIntent}
                  onChange={(e) => setUserIntent(e.target.value)}
                  placeholder="e.g. I want to submit a claim"
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded focus:outline-hidden focus:border-indigo-500"
                />
                <button
                  onClick={handleInterpretIntent}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded shadow-xs"
                >
                  Interpret
                </button>
              </div>
            </div>

            {/* Capability Compiler Fields */}
            <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Business Name</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Capability Type</label>
                  <select
                    value={capType}
                    onChange={(e) => setCapType(e.target.value as CapabilityType)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-hidden"
                  >
                    <option value="TABLE_OPERATION">TABLE_OPERATION</option>
                    <option value="CLICK">CLICK</option>
                    <option value="ENTER">ENTER</option>
                    <option value="EXTRACT">EXTRACT</option>
                    <option value="ASSERT">ASSERT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Risk Policy Level</label>
                  <select
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-hidden font-semibold"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH (Remap Confirm)</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
              </div>

              {/* Target Definition Preview */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1.5">
                <span className="font-semibold text-slate-800 block text-[11px]">
                  Target Semantic Identity
                </span>
                <div className="text-[11px] text-slate-600 space-y-1">
                  <div>
                    <span className="text-slate-400">Target Control:</span>{' '}
                    <strong>{selectedControl?.visibleText || 'Send Claim'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Pattern:</span>{' '}
                    <code className="text-slate-700 font-mono text-[10px]">
                      Send Claim|Submit
                    </code>
                  </div>
                  <div>
                    <span className="text-slate-400">Resolution Mode:</span>{' '}
                    <span className="text-indigo-600 font-medium">Weighted Semantic Hierarchy</span>
                  </div>
                </div>
              </div>

              {/* Business Outcome Verification Contract */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px]">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Business Outcome Verification Contract</span>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Expected Outcome</label>
                  <input
                    type="text"
                    value={expectedOutcome}
                    onChange={(e) => setExpectedOutcome(e.target.value)}
                    className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="requireRef"
                    checked={requiresRef}
                    onChange={(e) => setRequiresRef(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <label htmlFor="requireRef" className="text-slate-700 text-[11px] cursor-pointer">
                    Verify Reference Number exists (<code className="font-mono">{refPattern}</code>)
                  </label>
                </div>
              </div>

              <button
                onClick={handleSaveDraft}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded shadow-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save to Capability Library</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
