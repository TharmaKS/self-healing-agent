import fs from 'fs';
import path from 'path';
import {
  Application,
  ApplicationSession,
  SemanticCapability,
  BusinessFlow,
  ExecutionRecord,
  HumanInterventionRequest,
  ExperienceMemoryEntry,
  BatchSummary,
  RowExecutionResult,
  WorkflowBuildSession,
} from '../../types/automation';

interface DbData {
  applications: Application[];
  sessions: ApplicationSession[];
  capabilities: SemanticCapability[];
  flows: BusinessFlow[];
  executions: ExecutionRecord[];
  experience: ExperienceMemoryEntry[];
  buildSessions: WorkflowBuildSession[];
  reports: Array<{
    id: string;
    executionId: string;
    fileName: string;
    csvContent: string;
    summary: BatchSummary;
    createdAt: string;
  }>;
}

const DATA_FILE = path.resolve(process.cwd(), 'automation_db.json');

// Initial seed data representing real enterprise setup
const SEED_DATA: DbData = {
  applications: [
    {
      id: 'app-claims-portal',
      name: 'Claims Portal',
      description: 'Enterprise healthcare claims management and payer dispatch portal',
      applicationType: 'UI',
      baseUrl: 'http://localhost:3000/api/portal',
      loginUrl: 'http://localhost:3000/api/portal/login',
      authType: 'BROWSER_SESSION',
      environment: 'STAGING',
      credentialKeys: ['CLAIMS_USERNAME', 'CLAIMS_PASSWORD'],
      isActive: true,
      browserConfig: {
        viewport: { width: 1280, height: 800 },
        headed: true,
        timeoutMs: 30000,
      },
      supportedMechanisms: ['PLAYWRIGHT_CHROMIUM', 'INTERACTIVE_BROWSER_SESSION'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  sessions: [],
  capabilities: [
    {
      id: 'cap-login',
      applicationId: 'app-claims-portal',
      businessName: 'Authenticate Claims Portal Session',
      type: 'ENTER',
      pageContext: 'Login View',
      semanticDescription: 'Authenticate into the Claims Portal using configured environment credentials',
      targetDefinition: {
        semanticIntent: 'Login credentials and submit',
        visibleTextPattern: 'Sign In|Log In',
        role: 'button',
        controlType: 'form',
        selectorFallback: '#login-button',
      },
      inputDefinition: [
        { name: 'username', type: 'CREDENTIAL_REF', required: true, description: 'Refers to CLAIMS_USERNAME' },
        { name: 'password', type: 'CREDENTIAL_REF', required: true, description: 'Refers to CLAIMS_PASSWORD' },
      ],
      outputDefinition: [
        { name: 'sessionState', type: 'STRING', description: 'AUTHENTICATED' },
      ],
      verificationDefinition: {
        expectedOutcome: 'User dashboard visible and claims navigation accessible',
        successCondition: {
          statusText: 'Dashboard',
          prohibitedErrors: ['Invalid credentials', 'Login failed'],
        },
      },
      recoveryDefinition: {
        allowHumanRemapping: true,
        maxRetries: 2,
        onFailure: 'STOP',
      },
      riskLevel: 'LOW',
      version: 1,
      isPublished: true,
      isRetired: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'cap-open-claims',
      applicationId: 'app-claims-portal',
      businessName: 'Open Claims Table',
      type: 'CLICK',
      pageContext: 'Portal Navigation',
      semanticDescription: 'Navigate to the active claims ledger view',
      targetDefinition: {
        semanticIntent: 'Open claims table',
        visibleTextPattern: 'Claims',
        role: 'link',
        controlType: 'link',
        selectorFallback: 'nav a[href="#claims"]',
      },
      inputDefinition: [],
      outputDefinition: [
        { name: 'tableVisible', type: 'BOOLEAN' },
      ],
      verificationDefinition: {
        expectedOutcome: 'Claims table with patient records and actions rendered',
        successCondition: {
          statusText: 'Active Claims Ledger',
        },
      },
      recoveryDefinition: {
        allowHumanRemapping: true,
        maxRetries: 1,
        onFailure: 'STOP',
      },
      riskLevel: 'LOW',
      version: 1,
      isPublished: true,
      isRetired: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'cap-filter-claims',
      applicationId: 'app-claims-portal',
      businessName: 'Filter Claims by Payer and Status',
      type: 'TABLE_OPERATION',
      pageContext: 'Claims Ledger',
      semanticDescription: 'Filter active claims table by payer (e.g. Medicare Part A) and status (e.g. Ready)',
      targetDefinition: {
        semanticIntent: 'Filter claims table rows',
        controlType: 'table_filter',
        pageContext: 'Claims',
      },
      inputDefinition: [
        { name: 'payer', type: 'STRING', required: true, defaultValue: 'Medicare Part A' },
        { name: 'status', type: 'STRING', required: true, defaultValue: 'Ready' },
      ],
      outputDefinition: [
        { name: 'matchedRowCount', type: 'NUMBER' },
        { name: 'matchedRowIds', type: 'OBJECT' },
      ],
      verificationDefinition: {
        expectedOutcome: 'Table view filtered to matching claims',
        successCondition: {
          statusText: 'Filtered',
        },
      },
      recoveryDefinition: {
        allowHumanRemapping: false,
        maxRetries: 1,
        onFailure: 'CONTINUE',
      },
      riskLevel: 'LOW',
      version: 1,
      isPublished: true,
      isRetired: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'cap-process-claims',
      applicationId: 'app-claims-portal',
      businessName: 'Process Matched Claims',
      type: 'TABLE_OPERATION',
      pageContext: 'Claims Ledger',
      semanticDescription: 'Iterate each matched row, execute row-level action (Send Claim), handle remappings and verify outcome',
      targetDefinition: {
        semanticIntent: 'Send Claim',
        visibleTextPattern: 'Send Claim|Submit',
        role: 'button',
        controlType: 'row_action',
        isRowAction: true,
      },
      inputDefinition: [
        { name: 'expectedAction', type: 'STRING', required: true, defaultValue: 'Send Claim' },
      ],
      outputDefinition: [
        { name: 'processedCount', type: 'NUMBER' },
        { name: 'successCount', type: 'NUMBER' },
        { name: 'failedCount', type: 'NUMBER' },
      ],
      verificationDefinition: {
        expectedOutcome: 'Claim status transitions to Sent with verified submission reference (e.g. SUB-100x)',
        successCondition: {
          statusText: 'Sent',
          requiresReferenceNumber: true,
          referencePattern: 'SUB-\\d+',
          prohibitedErrors: ['Validation error', 'Failed to dispatch'],
        },
      },
      recoveryDefinition: {
        allowHumanRemapping: true,
        maxRetries: 2,
        fallbackCandidates: ['Submit', 'Process', 'Dispatch'],
        onFailure: 'CONTINUE',
      },
      riskLevel: 'HIGH',
      version: 1,
      isPublished: true,
      isRetired: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'cap-extract-confirmations',
      applicationId: 'app-claims-portal',
      businessName: 'Extract Confirmation Numbers & Generate CSV',
      type: 'EXTRACT',
      pageContext: 'Claims Ledger',
      semanticDescription: 'Extract submission reference numbers from processed claims and compile batch report',
      targetDefinition: {
        semanticIntent: 'Extract reference numbers',
        controlType: 'data_extractor',
      },
      inputDefinition: [],
      outputDefinition: [
        { name: 'reportPath', type: 'STRING' },
        { name: 'rowCount', type: 'NUMBER' },
      ],
      verificationDefinition: {
        expectedOutcome: 'Batch CSV generated with verified row outcomes and submission references',
        successCondition: {
          statusText: 'Generated',
        },
      },
      recoveryDefinition: {
        allowHumanRemapping: false,
        maxRetries: 1,
        onFailure: 'CONTINUE',
      },
      riskLevel: 'LOW',
      version: 1,
      isPublished: true,
      isRetired: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  flows: [
    {
      id: 'flow-medicare-batch',
      applicationId: 'app-claims-portal',
      name: 'Medicare Part A Claims Batch Processing',
      description: 'End-to-end intent-driven flow: Login -> Open Claims -> Filter Medicare Part A (Ready) -> Process Matched Rows with outcome verification and human remapping -> Export CSV Report',
      status: 'PRODUCTION',
      version: 1,
      latestTestStatus: 'SUCCESS',
      failurePolicy: 'CONTINUE',
      isRetired: false,
      variables: [
        { name: 'PAYER_TARGET', type: 'STRING', source: 'FLOW_VARIABLE', value: 'Medicare Part A' },
        { name: 'STATUS_TARGET', type: 'STRING', source: 'FLOW_VARIABLE', value: 'Ready' },
      ],
      nodes: [
        {
          id: 'node-start',
          type: 'START',
          position: { x: 50, y: 150 },
          data: { label: 'Start Flow', description: 'Execution begins' },
        },
        {
          id: 'node-login',
          type: 'CAPABILITY',
          position: { x: 260, y: 150 },
          data: {
            label: 'Login Claims Portal',
            capabilityId: 'cap-login',
            description: 'Authenticate session with CLAIMS_USERNAME & CLAIMS_PASSWORD',
          },
        },
        {
          id: 'node-open-claims',
          type: 'CAPABILITY',
          position: { x: 500, y: 150 },
          data: {
            label: 'Open Claims Ledger',
            capabilityId: 'cap-open-claims',
            description: 'Navigate to active claims ledger',
          },
        },
        {
          id: 'node-filter-claims',
          type: 'TABLE_PROCESS',
          position: { x: 740, y: 150 },
          data: {
            label: 'Filter Medicare Part A',
            capabilityId: 'cap-filter-claims',
            description: 'Filter Payer = Medicare Part A & Status = Ready',
            filterConfig: {
              table: 'Claims',
              conditions: [
                { column: 'Payer', operator: 'EQUALS', value: 'Medicare Part A' },
                { column: 'Status', operator: 'EQUALS', value: 'Ready' },
              ],
            },
          },
        },
        {
          id: 'node-process-claims',
          type: 'TABLE_PROCESS',
          position: { x: 990, y: 150 },
          data: {
            label: 'Process Matched Claims',
            capabilityId: 'cap-process-claims',
            description: 'Execute row-level Send Claim with outcome verification and human remapping',
            rowActionCapabilityId: 'cap-process-claims',
            failurePolicy: 'CONTINUE',
          },
        },
        {
          id: 'node-extract-report',
          type: 'CAPABILITY',
          position: { x: 1240, y: 150 },
          data: {
            label: 'Generate Batch CSV',
            capabilityId: 'cap-extract-confirmations',
            description: 'Compile verified outcomes into audit-ready CSV report',
          },
        },
        {
          id: 'node-end',
          type: 'END',
          position: { x: 1480, y: 150 },
          data: { label: 'End Flow', description: 'Audit report produced' },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-start', target: 'node-login' },
        { id: 'e2', source: 'node-login', target: 'node-open-claims' },
        { id: 'e3', source: 'node-open-claims', target: 'node-filter-claims' },
        { id: 'e4', source: 'node-filter-claims', target: 'node-process-claims' },
        { id: 'e5', source: 'node-process-claims', target: 'node-extract-report' },
        { id: 'e6', source: 'node-extract-report', target: 'node-end' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  executions: [],
  experience: [
    {
      id: 'exp-submit-to-send',
      applicationId: 'app-claims-portal',
      capabilityId: 'cap-process-claims',
      pageContext: 'Claims Ledger Table Row',
      originalTarget: 'Send Claim',
      resolvedTarget: 'Submit',
      resolutionMethod: 'HUMAN_CONFIRMATION',
      confidence: 0.92,
      successCount: 4,
      failureCount: 0,
      isEnabled: true,
      lastVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  buildSessions: [],
  reports: [],
};

class AutomationDatabase {
  private data: DbData;

  constructor() {
    this.data = this.loadData();
  }

  private loadData(): DbData {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed reading DB file, using seed data:', e);
    }
    this.saveData(SEED_DATA);
    return JSON.parse(JSON.stringify(SEED_DATA));
  }

  private saveData(data: DbData) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed writing DB file:', e);
    }
  }

  // Applications
  getApplications(): Application[] {
    return this.data.applications;
  }

  getApplication(id: string): Application | undefined {
    return this.data.applications.find((a) => a.id === id);
  }

  createApplication(app: Application): Application {
    this.data.applications.push(app);
    this.saveData(this.data);
    return app;
  }

  updateApplication(id: string, updates: Partial<Application>): Application | undefined {
    const idx = this.data.applications.findIndex((a) => a.id === id);
    if (idx === -1) return undefined;
    this.data.applications[idx] = { ...this.data.applications[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveData(this.data);
    return this.data.applications[idx];
  }

  deleteApplication(id: string): boolean {
    const len = this.data.applications.length;
    this.data.applications = this.data.applications.filter((a) => a.id !== id);
    if (this.data.applications.length !== len) {
      this.saveData(this.data);
      return true;
    }
    return false;
  }

  // Sessions
  getSessions(): ApplicationSession[] {
    return this.data.sessions;
  }

  getSession(id: string): ApplicationSession | undefined {
    return this.data.sessions.find((s) => s.id === id);
  }

  getActiveSessionForApp(appId: string): ApplicationSession | undefined {
    return this.data.sessions.find((s) => s.applicationId === appId && (s.status === 'ACTIVE' || s.status === 'AUTHENTICATED'));
  }

  saveSession(session: ApplicationSession): ApplicationSession {
    const idx = this.data.sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      this.data.sessions[idx] = session;
    } else {
      this.data.sessions.push(session);
    }
    this.saveData(this.data);
    return session;
  }

  // Capabilities
  getCapabilities(applicationId?: string): SemanticCapability[] {
    if (applicationId) {
      return this.data.capabilities.filter((c) => c.applicationId === applicationId);
    }
    return this.data.capabilities;
  }

  getCapability(id: string): SemanticCapability | undefined {
    return this.data.capabilities.find((c) => c.id === id);
  }

  createCapability(cap: SemanticCapability): SemanticCapability {
    this.data.capabilities.push(cap);
    this.saveData(this.data);
    return cap;
  }

  updateCapability(id: string, updates: Partial<SemanticCapability>): SemanticCapability | undefined {
    const idx = this.data.capabilities.findIndex((c) => c.id === id);
    if (idx === -1) return undefined;
    this.data.capabilities[idx] = { ...this.data.capabilities[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveData(this.data);
    return this.data.capabilities[idx];
  }

  deleteCapability(id: string): boolean {
    const len = this.data.capabilities.length;
    this.data.capabilities = this.data.capabilities.filter((c) => c.id !== id);
    if (this.data.capabilities.length !== len) {
      this.saveData(this.data);
      return true;
    }
    return false;
  }

  // Flows
  getFlows(applicationId?: string): BusinessFlow[] {
    if (applicationId) {
      return this.data.flows.filter((f) => f.applicationId === applicationId);
    }
    return this.data.flows;
  }

  getFlow(id: string): BusinessFlow | undefined {
    return this.data.flows.find((f) => f.id === id);
  }

  createFlow(flow: BusinessFlow): BusinessFlow {
    this.data.flows.push(flow);
    this.saveData(this.data);
    return flow;
  }

  updateFlow(id: string, updates: Partial<BusinessFlow>): BusinessFlow | undefined {
    const idx = this.data.flows.findIndex((f) => f.id === id);
    if (idx === -1) return undefined;
    this.data.flows[idx] = { ...this.data.flows[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveData(this.data);
    return this.data.flows[idx];
  }

  deleteFlow(id: string): boolean {
    const len = this.data.flows.length;
    this.data.flows = this.data.flows.filter((f) => f.id !== id);
    if (this.data.flows.length !== len) {
      this.saveData(this.data);
      return true;
    }
    return false;
  }

  // Executions
  getExecutions(): ExecutionRecord[] {
    return this.data.executions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  getExecution(id: string): ExecutionRecord | undefined {
    return this.data.executions.find((e) => e.id === id);
  }

  saveExecution(exec: ExecutionRecord): ExecutionRecord {
    const idx = this.data.executions.findIndex((e) => e.id === exec.id);
    if (idx >= 0) {
      this.data.executions[idx] = exec;
    } else {
      this.data.executions.unshift(exec);
    }
    this.saveData(this.data);
    return exec;
  }

  // Experience Memory
  getExperience(applicationId?: string): ExperienceMemoryEntry[] {
    if (applicationId) {
      return this.data.experience.filter((e) => e.applicationId === applicationId);
    }
    return this.data.experience;
  }

  getExperienceEntry(id: string): ExperienceMemoryEntry | undefined {
    return this.data.experience.find((e) => e.id === id);
  }

  saveExperience(entry: ExperienceMemoryEntry): ExperienceMemoryEntry {
    const idx = this.data.experience.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      this.data.experience[idx] = entry;
    } else {
      this.data.experience.push(entry);
    }
    this.saveData(this.data);
    return entry;
  }

  deleteExperience(id: string): boolean {
    const len = this.data.experience.length;
    this.data.experience = this.data.experience.filter((e) => e.id !== id);
    if (this.data.experience.length !== len) {
      this.saveData(this.data);
      return true;
    }
    return false;
  }

  // Build Sessions (Agent persistent state)
  getBuildSessions(): WorkflowBuildSession[] {
    return this.data.buildSessions || [];
  }

  getBuildSession(id: string): WorkflowBuildSession | undefined {
    return (this.data.buildSessions || []).find((s) => s.id === id);
  }

  getActiveBuildSession(): WorkflowBuildSession | undefined {
    const list = this.data.buildSessions || [];
    return list.find((s) => s.currentState !== 'BUILD_COMPLETE');
  }

  saveBuildSession(session: WorkflowBuildSession): WorkflowBuildSession {
    if (!this.data.buildSessions) this.data.buildSessions = [];
    const idx = this.data.buildSessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      this.data.buildSessions[idx] = session;
    } else {
      this.data.buildSessions.unshift(session);
    }
    this.saveData(this.data);
    return session;
  }

  deleteBuildSession(id: string): boolean {
    if (!this.data.buildSessions) return false;
    const len = this.data.buildSessions.length;
    this.data.buildSessions = this.data.buildSessions.filter((s) => s.id !== id);
    if (this.data.buildSessions.length !== len) {
      this.saveData(this.data);
      return true;
    }
    return false;
  }

  // Reports
  saveReport(report: {
    id: string;
    executionId: string;
    fileName: string;
    csvContent: string;
    summary: BatchSummary;
    createdAt: string;
  }) {
    this.data.reports.unshift(report);
    this.saveData(this.data);
    return report;
  }

  getReport(executionId: string) {
    return this.data.reports.find((r) => r.executionId === executionId || r.id === executionId);
  }

  getAllReports() {
    return this.data.reports;
  }
}

export const db = new AutomationDatabase();
