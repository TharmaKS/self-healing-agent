import {
  Application,
  SemanticCapability,
  BusinessFlow,
  ExecutionRecord,
  ObservationResult,
  WorkflowBuildSession,
  DependencyCheckResult,
  WebSocketMessage,
} from './types/automation';

const API_BASE = '/api';

export const api = {
  async getHealth(): Promise<{ mysql: boolean; store: string; applications: number; capabilities: number; flows: number }> {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },

  // Agent Chat API
  async getAgentSession(): Promise<WorkflowBuildSession> {
    const res = await fetch(`${API_BASE}/agent/session`);
    return res.json();
  },

  async sendAgentMessage(
    sessionId: string,
    text: string,
    chosenOptionId?: string,
    payload?: Record<string, unknown>
  ): Promise<WorkflowBuildSession> {
    const res = await fetch(`${API_BASE}/agent/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, text, chosenOptionId, payload }),
    });
    return res.json();
  },

  async resetAgentSession(): Promise<WorkflowBuildSession> {
    const res = await fetch(`${API_BASE}/agent/reset`, { method: 'POST' });
    return res.json();
  },

  // Credentials
  async getCredentialsStatus(): Promise<{ credentials: Array<{ key: string; status: string; configured: boolean }> }> {
    const res = await fetch(`${API_BASE}/credentials/status`);
    return res.json();
  },

  // Applications
  async getApplications(): Promise<Application[]> {
    const res = await fetch(`${API_BASE}/applications`);
    return res.json();
  },

  async getApplication(id: string): Promise<Application> {
    const res = await fetch(`${API_BASE}/applications/${id}`);
    return res.json();
  },

  async createApplication(data: Partial<Application>): Promise<Application> {
    const res = await fetch(`${API_BASE}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateApplication(id: string, data: Partial<Application>): Promise<Application> {
    const res = await fetch(`${API_BASE}/applications/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async checkApplicationDependencies(id: string): Promise<DependencyCheckResult> {
    const res = await fetch(`${API_BASE}/applications/${id}/dependencies`);
    return res.json();
  },

  async deleteApplication(id: string, force = false): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/applications/${id}?force=${force}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async retireApplication(id: string): Promise<{ success: boolean; application: Application }> {
    const res = await fetch(`${API_BASE}/applications/${id}/retire`, {
      method: 'POST',
    });
    return res.json();
  },

  async restoreApplication(id: string): Promise<{ success: boolean; application: Application }> {
    const res = await fetch(`${API_BASE}/applications/${id}/restore`, {
      method: 'POST',
    });
    return res.json();
  },

  async launchApplication(id: string): Promise<{ success: boolean; session: any }> {
    const res = await fetch(`${API_BASE}/applications/${id}/launch`, {
      method: 'POST',
    });
    return res.json();
  },

  async closeApplication(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/applications/${id}/close`, {
      method: 'POST',
    });
    return res.json();
  },

  async testLogin(id: string): Promise<{ success: boolean; sessionUser?: string; message?: string }> {
    const res = await fetch(`${API_BASE}/applications/${id}/test-login`, {
      method: 'POST',
    });
    return res.json();
  },

  async observeApplication(id: string): Promise<ObservationResult> {
    const res = await fetch(`${API_BASE}/applications/${id}/observe`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Observation failed');
    }
    return res.json();
  },

  async observeAndDiscover(id: string): Promise<{ observation: ObservationResult; createdCapabilities: unknown[] }> {
    const res = await fetch(`${API_BASE}/applications/${id}/observe`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Observation failed');
    }
    return res.json();
  },

  // Capabilities
  async getCapabilities(applicationId?: string): Promise<SemanticCapability[]> {
    const url = applicationId
      ? `${API_BASE}/capabilities?applicationId=${applicationId}`
      : `${API_BASE}/capabilities`;
    const res = await fetch(url);
    return res.json();
  },

  async createCapability(data: Partial<SemanticCapability>): Promise<SemanticCapability> {
    const res = await fetch(`${API_BASE}/capabilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateCapability(id: string, data: Partial<SemanticCapability>): Promise<SemanticCapability> {
    const res = await fetch(`${API_BASE}/capabilities/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteCapability(id: string, force = false): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/capabilities/${id}?force=${force ? 'true' : 'false'}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async retireCapability(id: string): Promise<{ success: boolean; capability: SemanticCapability }> {
    const res = await fetch(`${API_BASE}/capabilities/${id}/retire`, {
      method: 'POST',
    });
    return res.json();
  },

  // Business Flows
  async getFlows(applicationId?: string): Promise<BusinessFlow[]> {
    const url = applicationId
      ? `${API_BASE}/flows?applicationId=${applicationId}`
      : `${API_BASE}/flows`;
    const res = await fetch(url);
    return res.json();
  },

  async getFlow(id: string): Promise<BusinessFlow> {
    const res = await fetch(`${API_BASE}/flows/${id}`);
    return res.json();
  },

  async createFlow(data: Partial<BusinessFlow>): Promise<BusinessFlow> {
    const res = await fetch(`${API_BASE}/flows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateFlow(id: string, data: Partial<BusinessFlow>): Promise<BusinessFlow> {
    const res = await fetch(`${API_BASE}/flows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteFlow(id: string, force = false): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/flows/${id}?force=${force ? 'true' : 'false'}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async retireFlow(id: string): Promise<{ success: boolean; flow: BusinessFlow }> {
    const res = await fetch(`${API_BASE}/flows/${id}/retire`, {
      method: 'POST',
    });
    return res.json();
  },

  async publishFlow(id: string): Promise<BusinessFlow> {
    const res = await fetch(`${API_BASE}/flows/${id}/publish`, { method: 'POST' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Publish failed');
    return body;
  },

  async validateFlow(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/flows/${id}/validate`, {
      method: 'POST',
    });
    return res.json();
  },

  async testFlow(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/flows/${id}/test`, {
      method: 'POST',
    });
    return res.json();
  },

  // Executions
  async getExecutions(): Promise<ExecutionRecord[]> {
    const res = await fetch(`${API_BASE}/executions`);
    return res.json();
  },

  async getExecution(id: string): Promise<ExecutionRecord> {
    const res = await fetch(`${API_BASE}/executions/${id}`);
    return res.json();
  },

  async runFlow(flowId: string, options?: { mode?: 'TEST' | 'RUN'; batchLimit?: number }): Promise<ExecutionRecord> {
    const res = await fetch(`${API_BASE}/flows/${flowId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    return res.json();
  },

  async stopExecution(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/executions/${id}/stop`, {
      method: 'POST',
    });
    return res.json();
  },

  async resolveIntervention(
    interventionId: string,
    action: 'CONFIRM' | 'CHANGE' | 'SKIP' | 'STOP' | 'RETRY',
    selectedTarget?: any,
    applicationId?: string,
    capabilityId?: string
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/interventions/${interventionId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, selectedTarget, applicationId, capabilityId }),
    });
    return res.json();
  },

  // Reports
  async getReports(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/reports`);
    return res.json();
  },

  async getReport(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/reports/${id}`);
    return res.json();
  },

  getReportCsvUrl(id: string): string {
    return `${API_BASE}/reports/${id}/csv`;
  },

  async getExperience(applicationId?: string): Promise<any[]> {
    const url = applicationId
      ? `${API_BASE}/experience?applicationId=${applicationId}`
      : `${API_BASE}/experience`;
    const res = await fetch(url);
    return res.json();
  },

  async createExperience(data: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${API_BASE}/experience`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateExperience(id: string, data: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${API_BASE}/experience/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteExperience(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/experience/${id}`, { method: 'DELETE' });
    return res.json();
  },
};

// WebSocket Subscriber hook/helper
export function createWebSocketClient(onMessage: (msg: WebSocketMessage) => void): () => void {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const wsUrl = `${protocol}//${host}`;

  let ws: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let isClosedManually = false;

  const connect = () => {
    try {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as WebSocketMessage;
          onMessage(parsed);
        } catch (e) {
          console.error('WS parse error', e);
        }
      };

      ws.onclose = () => {
        if (!isClosedManually) {
          retryTimer = setTimeout(connect, 2000);
        }
      };

      ws.onerror = (err) => {
        console.warn('WS error, reconnecting...', err);
        ws?.close();
      };
    } catch (e) {
      console.error('WS init error', e);
      retryTimer = setTimeout(connect, 2000);
    }
  };

  connect();

  return () => {
    isClosedManually = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (ws) ws.close();
  };
}
