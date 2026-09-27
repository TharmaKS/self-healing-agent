import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Clock,
  RefreshCw,
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const data = await api.getReports();
      setReports(data);
      if (data.length > 0 && !selectedReport) {
        setSelectedReport(data[0]);
      }
    } catch (e) {
      console.error('Failed to load reports', e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
            Execution Reports & Real CSV Export
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Persisted batch reports generated from real Playwright & Chromium browser session runs
          </p>
        </div>

        <button
          onClick={loadReports}
          disabled={isLoading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-dashed border-slate-800">
          <FileSpreadsheet className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Reports Generated Yet</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Run an automation workflow from the Agent (RUN MODE) or the Execution Center to produce a comprehensive verification report.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Reports sidebar */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Generated Reports ({reports.length})
            </h3>
            {reports.map((rep) => (
              <div
                key={rep.id}
                onClick={() => setSelectedReport(rep)}
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  selectedReport?.id === rep.id
                    ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/10'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-xs truncate max-w-[180px]">
                    {rep.fileName}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(rep.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="text-emerald-400 font-bold">{rep.summary?.successful || 0} passed</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-rose-400 font-bold">{rep.summary?.failed || 0} failed</span>
                </div>
              </div>
            ))}
          </div>

          {/* Report Viewer */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            {selectedReport ? (
              <>
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="font-bold text-white text-base">{selectedReport.fileName}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Execution ID: <span className="font-mono text-indigo-400">{selectedReport.executionId}</span>
                    </p>
                  </div>

                  <a
                    href={`/api/reports/${selectedReport.id}/csv`}
                    download
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition"
                  >
                    <Download className="w-4 h-4" />
                    Download CSV
                  </a>
                </div>

                {/* Summary Metrics */}
                {selectedReport.summary && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Total Matched</span>
                      <p className="text-base font-bold text-white mt-1 font-mono">
                        {selectedReport.summary.totalMatched}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-emerald-400 uppercase font-bold">Successful</span>
                      <p className="text-base font-bold text-emerald-400 mt-1 font-mono">
                        {selectedReport.summary.successful}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-rose-400 uppercase font-bold">Failed</span>
                      <p className="text-base font-bold text-rose-400 mt-1 font-mono">
                        {selectedReport.summary.failed}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-indigo-400 uppercase font-bold">Remappings</span>
                      <p className="text-base font-bold text-indigo-400 mt-1 font-mono">
                        {selectedReport.summary.remappingConfirmed || 0}
                      </p>
                    </div>
                  </div>
                )}

                {/* CSV Raw Content Preview */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Raw CSV File Content
                  </h4>
                  <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto max-h-80 selection:bg-indigo-600">
                    {selectedReport.csvContent}
                  </pre>
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-slate-500 text-sm">
                Select a report to preview its contents
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
