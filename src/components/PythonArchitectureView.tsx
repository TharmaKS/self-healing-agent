import React from 'react';
import { FileCode } from 'lucide-react';

export const PythonArchitectureView: React.FC = () => (
  <div className="p-6 max-w-3xl mx-auto overflow-y-auto space-y-4">
    <h2 className="text-lg font-bold text-white flex items-center gap-2">
      <FileCode className="w-5 h-5 text-indigo-400" />
      Python Architecture
    </h2>
    <p className="text-sm text-slate-300 leading-relaxed">
      This Studio replica is a <strong>Node + Playwright</strong> teach-and-run agent. Python is documented here as a
      product boundary only — it is <strong>not</strong> the runner.
    </p>
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-300 space-y-2">
      <p className="font-semibold text-white">What is architecture</p>
      <ul className="list-disc pl-4 space-y-1">
        <li>React 19 + Vite + Tailwind — Studio tabs</li>
        <li>Express on the same process as the UI (dev port 3000/3001)</li>
        <li>Playwright headed Chromium — observe, click-by-name, table filter</li>
        <li>MySQL via Prisma — applications, capabilities, flows, experience memory</li>
        <li>TypeScript state machine for Build chat; orchestrator walks flow JSON at Run</li>
      </ul>
      <p className="font-semibold text-white pt-2">What is not architecture</p>
      <ul className="list-disc pl-4 space-y-1">
        <li>LangGraph / LLM planning on the live click path</li>
        <li>Python FastAPI as the executor</li>
        <li>React Flow as the executor (canvas is a drawing of nodes_json only)</li>
      </ul>
    </div>
  </div>
);
