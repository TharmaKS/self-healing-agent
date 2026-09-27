import React, { useEffect, useState } from 'react';
import { Navigation, MainTab } from './components/Navigation';
import { StudioHeader } from './components/StudioHeader';
import { AgentChatView } from './components/AgentChatView';
import { ApplicationsManager } from './components/ApplicationsManager';
import { CapabilitiesManager } from './components/CapabilitiesManager';
import { FlowsManager } from './components/FlowsManager';
import { LiveExecutionViewer } from './components/LiveExecutionViewer';
import { ReportsView } from './components/ReportsView';
import { StudioDashboard } from './components/StudioDashboard';
import { SettingsView } from './components/SettingsView';
import { PythonArchitectureView } from './components/PythonArchitectureView';
import { MysqlStatusView } from './components/MysqlStatusView';
import { ExperiencesPage } from './components/ExperiencesPage';
import { AgentMode, BusinessFlow } from './types/automation';
import { api } from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('agent');
  const [agentMode, setAgentMode] = useState<AgentMode>('BUILD');
  const [flowToExecute, setFlowToExecute] = useState<BusinessFlow | null>(null);
  const [mysqlOk, setMysqlOk] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .getHealth()
      .then((h) => setMysqlOk(!!h.mysql))
      .catch(() => setMysqlOk(false));
  }, [activeTab]);

  const handleFlowSelectedForRun = (flow: BusinessFlow) => {
    setFlowToExecute(flow);
    setAgentMode('RUN');
    setActiveTab('agent');
  };

  return (
    <div className="h-screen text-slate-100 flex font-sans overflow-hidden">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <StudioHeader
          mysqlOk={mysqlOk}
          onLaunchRun={() => {
            setAgentMode('RUN');
            setActiveTab('agent');
          }}
        />

        <div className={activeTab === 'agent' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
          <AgentChatView
            currentMode={agentMode}
            onModeChange={setAgentMode}
            onNavigateToTab={(tab) => setActiveTab(tab as MainTab)}
            onFlowSelectedForRun={handleFlowSelectedForRun}
          />
        </div>

        {activeTab === 'dashboard' && (
          <div className="flex-1 overflow-y-auto">
            <StudioDashboard onNavigate={setActiveTab} />
          </div>
        )}

        {activeTab === 'applications' && (
          <div className="flex-1 overflow-y-auto">
            <ApplicationsManager />
          </div>
        )}

        {activeTab === 'capabilities' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <CapabilitiesManager />
          </div>
        )}

        {activeTab === 'flows' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <FlowsManager onExecuteFlow={handleFlowSelectedForRun} />
          </div>
        )}

        {activeTab === 'experiences' && (
          <div className="flex-1 overflow-hidden">
            <ExperiencesPage />
          </div>
        )}

        {activeTab === 'execution' && (
          <div className="flex-1 overflow-hidden">
            <LiveExecutionViewer activeFlow={flowToExecute} />
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="flex-1 overflow-y-auto">
            <ReportsView />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto">
            <SettingsView />
          </div>
        )}

        {activeTab === 'mysql' && (
          <div className="flex-1 overflow-y-auto">
            <MysqlStatusView />
          </div>
        )}

        {activeTab === 'python' && (
          <div className="flex-1 overflow-y-auto">
            <PythonArchitectureView />
          </div>
        )}
      </main>
    </div>
  );
}
