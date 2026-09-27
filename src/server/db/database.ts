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
  WorkflowBuildSession,
  DependencyCheckResult,
} from '../../types/automation';
import { prisma } from './prisma';

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

// Persistent database file location (local persistent store matching Prisma model schema)
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'automation_store.json');

// Strict rule: NO SAMPLE, NO MOCK, NO DEMO RUNTIME DATA. Starts empty!
const EMPTY_DATABASE: DbData = {
  applications: [],
  sessions: [],
  capabilities: [],
  flows: [],
  executions: [],
  experience: [],
  buildSessions: [],
  reports: [],
};

function isLegacyDemoSession(session: WorkflowBuildSession): boolean {
  const blob = JSON.stringify({
    messages: session.messages,
    workflowName: session.workflowName,
    applicationId: session.applicationId,
  }).toLowerCase();
  return (
    blob.includes('claims') ||
    blob.includes('demoportal') ||
    blob.includes('portal sandbox') ||
    blob.includes('predefined')
  );
}

class EnterpriseDatabase {
  private data: DbData;
  private mysqlReady = false;
  private mysqlSyncing = false;
  private pendingMysqlSync = false;

  constructor() {
    this.ensureDataDir();
    this.data = this.loadData();
  }

  async init(): Promise<void> {
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL is not set. Using local JSON store only.');
      return;
    }
    try {
      await prisma.$connect();
      this.mysqlReady = true;
      await this.loadFromMysql();
      const status = this.persistenceStatus();
      console.log(
        `MySQL connected (${status.store}). Apps=${status.applications} capabilities=${status.capabilities} flows=${status.flows}.`
      );
    } catch (err) {
      this.mysqlReady = false;
      console.error('MySQL connection failed. Continuing with local JSON store.', err);
    }
  }

  private ensureDataDir() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (e) {
      console.error('Failed to create data directory:', e);
    }
  }

  private loadData(): DbData {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          applications: parsed.applications || [],
          sessions: parsed.sessions || [],
          capabilities: parsed.capabilities || [],
          flows: parsed.flows || [],
          executions: parsed.executions || [],
          experience: parsed.experience || [],
          buildSessions: (parsed.buildSessions || []).filter(
            (s: WorkflowBuildSession) => s && !isLegacyDemoSession(s)
          ),
          reports: parsed.reports || [],
        };
      }
    } catch (e) {
      console.error('Database load warning:', e);
    }

    // Save pristine empty state
    this.saveData(EMPTY_DATABASE);
    return JSON.parse(JSON.stringify(EMPTY_DATABASE));
  }

  private saveData(data: DbData) {
    this.dedupeApplications(data);
    try {
      this.ensureDataDir();
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Database write error:', e);
    }
    if (this.mysqlSyncing) {
      this.pendingMysqlSync = true;
      return;
    }
    void this.syncMysql(data);
  }

  private async deleteMysqlWhereMissing(model: {
    deleteMany: (args: { where?: { id: { notIn: string[] } } } | Record<string, never>) => Promise<unknown>;
  }, keepIds: string[]) {
    if (keepIds.length === 0) {
      await model.deleteMany({});
      return;
    }
    await model.deleteMany({ where: { id: { notIn: keepIds } } });
  }

  private dedupeApplications(data: DbData) {
    const byName = new Map<string, Application>();
    for (const app of data.applications) {
      const key = (app.name || '').trim().toLowerCase();
      if (!key) continue;
      const previous = byName.get(key);
      if (!previous) {
        byName.set(key, app);
        continue;
      }
      const keep = new Date(app.updatedAt || 0) >= new Date(previous.updatedAt || 0) ? app : previous;
      const drop = keep === app ? previous : app;
      this.remapApplicationId(data, drop.id, keep.id);
      byName.set(key, keep);
    }
    data.applications = Array.from(byName.values());
  }

  private remapApplicationId(data: DbData, fromId: string, toId: string) {
    if (!fromId || !toId || fromId === toId) return;
    for (const app of data.applications) {
      if (app.id === fromId) app.id = toId;
    }
    for (const cap of data.capabilities) {
      if (cap.applicationId === fromId) cap.applicationId = toId;
    }
    for (const flow of data.flows) {
      if (flow.applicationId === fromId) flow.applicationId = toId;
    }
    for (const session of data.sessions) {
      if (session.applicationId === fromId) session.applicationId = toId;
    }
    for (const exp of data.experience) {
      if (exp.applicationId === fromId) exp.applicationId = toId;
    }
    for (const exec of data.executions) {
      if (exec.applicationId === fromId) exec.applicationId = toId;
    }
    for (const session of data.buildSessions) {
      if (session.applicationId === fromId) session.applicationId = toId;
    }
  }

  private parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private async loadFromMysql() {
    const [apps, caps, flows, sessions, experience, executions, reports] = await Promise.all([
      prisma.application.findMany(),
      prisma.semanticCapability.findMany(),
      prisma.businessFlow.findMany(),
      prisma.applicationSession.findMany(),
      prisma.experienceMemory.findMany(),
      prisma.execution.findMany(),
      prisma.batchReport.findMany(),
    ]);

    if (apps.length === 0 && this.data.applications.length > 0) {
      await this.syncMysql(this.data);
      return;
    }

    this.data = {
      applications: apps.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description || '',
        applicationType: (a.applicationType as Application['applicationType']) || 'UI',
        baseUrl: a.baseUrl,
        loginUrl: a.loginUrl || undefined,
        authType: a.authType as Application['authType'],
        apiAuthType: (a.apiAuthType as Application['apiAuthType']) || undefined,
        environment: a.environment as Application['environment'],
        usernameEnvVar: a.usernameEnvVar || undefined,
        passwordEnvVar: a.passwordEnvVar || undefined,
        apiKeyEnvVar: a.apiKeyEnvVar || undefined,
        clientIdEnvVar: a.clientIdEnvVar || undefined,
        clientSecretEnvVar: a.clientSecretEnvVar || undefined,
        credentialKeys: this.parseJson(a.credentialKeys, []),
        isActive: a.isActive,
        browserConfig: this.parseJson(a.browserConfig, { viewport: { width: 1280, height: 800 }, headed: true, timeoutMs: 30000 }),
        supportedMechanisms: this.parseJson(a.supportedMechanisms, ['PLAYWRIGHT_CHROMIUM']),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        applicationId: s.applicationId,
        browserId: s.browserId || undefined,
        contextId: s.contextId || undefined,
        pageId: s.pageId || undefined,
        status: s.status as ApplicationSession['status'],
        currentUrl: s.currentUrl || undefined,
        authenticatedAs: s.authenticatedAs || undefined,
        startedAt: s.startedAt.toISOString(),
        lastActivityAt: s.lastActivityAt.toISOString(),
        metadata: this.parseJson(s.metadata, {}),
      })),
      capabilities: caps.map((c) => ({
        id: c.id,
        applicationId: c.applicationId,
        businessName: c.businessName,
        type: c.type as SemanticCapability['type'],
        pageContext: c.pageContext || undefined,
        semanticDescription: c.semanticDescription,
        targetDefinition: this.parseJson(c.targetDefinition, { semanticIntent: c.businessName }),
        inputDefinition: this.parseJson(c.inputDefinition, []),
        outputDefinition: this.parseJson(c.outputDefinition, []),
        verificationDefinition: this.parseJson(c.verificationDefinition, { expectedOutcome: '', successCondition: {} }),
        recoveryDefinition: this.parseJson(c.recoveryDefinition, { allowHumanRemapping: true, maxRetries: 2, onFailure: 'HUMAN_REVIEW' }),
        riskLevel: c.riskLevel as SemanticCapability['riskLevel'],
        version: c.version,
        isPublished: c.isPublished,
        isRetired: c.isRetired,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      flows: flows.map((f) => {
        const graph = this.parseJson<{ nodes: BusinessFlow['nodes']; edges: BusinessFlow['edges'] }>(f.graphDefinition, { nodes: [], edges: [] });
        return {
          id: f.id,
          applicationId: f.applicationId,
          name: f.name,
          description: f.description || '',
          status: f.status as BusinessFlow['status'],
          version: f.version,
          latestTestStatus: (f.latestTestStatus as BusinessFlow['latestTestStatus']) || undefined,
          nodes: graph.nodes || [],
          edges: graph.edges || [],
          variables: this.parseJson(f.variables, []),
          failurePolicy: f.failurePolicy as BusinessFlow['failurePolicy'],
          isRetired: f.isRetired,
          createdAt: f.createdAt.toISOString(),
          updatedAt: f.updatedAt.toISOString(),
        };
      }),
      executions: executions.map((e) => {
        const snap = this.parseJson<ExecutionRecord | null>(e.snapshot, null);
        if (snap?.id) return snap;
        return {
          id: e.id,
          flowId: e.flowId,
          flowName: '',
          applicationId: e.applicationId,
          applicationName: '',
          applicationSessionId: e.applicationSessionId || undefined,
          status: e.status as ExecutionRecord['status'],
          mode: e.mode as ExecutionRecord['mode'],
          startedAt: e.startedAt.toISOString(),
          completedAt: e.completedAt?.toISOString(),
          durationMs: e.durationMs || undefined,
          matchedCount: e.matchedCount,
          processedCount: e.processedCount,
          successCount: e.successCount,
          failedCount: e.failedCount,
          skippedCount: e.skippedCount,
          recoveryCount: e.recoveryCount,
          remappingCount: e.remappingCount,
          interventionCount: e.interventionCount,
          error: e.error || undefined,
          csvReportPath: e.csvReportPath || undefined,
          steps: [],
          rowResults: [],
          interventions: [],
        };
      }),
      experience: experience.map((e) => ({
        id: e.id,
        applicationId: e.applicationId,
        capabilityId: e.capabilityId || undefined,
        pageContext: e.pageContext,
        originalTarget: e.originalTarget,
        resolvedTarget: e.resolvedTarget,
        resolutionMethod: e.resolutionMethod as ExperienceMemoryEntry['resolutionMethod'],
        confidence: e.confidence,
        successCount: e.successCount,
        failureCount: e.failureCount,
        isEnabled: e.isEnabled,
        lastVerifiedAt: e.lastVerifiedAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      buildSessions: this.data.buildSessions || [],
      reports: reports.map((r) => ({
        id: r.id,
        executionId: r.executionId,
        fileName: r.fileName,
        csvContent: r.csvContent,
        summary: {
          executionId: r.executionId,
          totalMatched: r.totalRows,
          processed: r.totalRows,
          successful: r.successRows,
          failed: r.failedRows,
          skipped: r.skippedRows,
          recoverySuccessful: 0,
          remappingRequired: 0,
          remappingConfirmed: 0,
          humanInterventions: 0,
          durationMs: 0,
        },
        createdAt: r.createdAt.toISOString(),
      })),
    };
    this.ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  private async syncMysql(data: DbData) {
    if (!this.mysqlReady) return;
    if (this.mysqlSyncing) {
      this.pendingMysqlSync = true;
      return;
    }
    this.mysqlSyncing = true;
    const capIds = new Set(data.capabilities.map((c) => c.id));
    const flowIds = new Set(data.flows.map((f) => f.id));

    try {
      this.dedupeApplications(data);
      for (const app of data.applications) {
        const appFields = {
          description: app.description,
          applicationType: app.applicationType || 'UI',
          baseUrl: app.baseUrl,
          loginUrl: app.loginUrl,
          authType: app.authType,
          apiAuthType: app.apiAuthType,
          environment: app.environment,
          usernameEnvVar: app.usernameEnvVar,
          passwordEnvVar: app.passwordEnvVar,
          apiKeyEnvVar: app.apiKeyEnvVar,
          clientIdEnvVar: app.clientIdEnvVar,
          clientSecretEnvVar: app.clientSecretEnvVar,
          credentialKeys: JSON.stringify(app.credentialKeys || []),
          isActive: app.isActive,
          browserConfig: JSON.stringify(app.browserConfig || {}),
          supportedMechanisms: JSON.stringify(app.supportedMechanisms || ['PLAYWRIGHT_CHROMIUM']),
        };
        const existingByName = await prisma.application.findUnique({ where: { name: app.name } });
        const existingById = await prisma.application.findUnique({ where: { id: app.id } });
        if (existingByName) {
          await prisma.application.update({
            where: { id: existingByName.id },
            data: appFields,
          });
          this.remapApplicationId(data, app.id, existingByName.id);
        } else if (existingById) {
          await prisma.application.update({
            where: { id: existingById.id },
            data: { name: app.name, ...appFields },
          });
        } else {
          await prisma.application.create({
            data: { id: app.id, name: app.name, ...appFields },
          });
        }
      }
      const appIds = new Set(data.applications.map((a) => a.id));
      this.ensureDataDir();
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
      for (const cap of data.capabilities) {
        if (!appIds.has(cap.applicationId)) continue;
        await prisma.semanticCapability.upsert({
          where: { id: cap.id },
          create: {
            id: cap.id,
            applicationId: cap.applicationId,
            businessName: cap.businessName,
            type: cap.type,
            pageContext: cap.pageContext,
            semanticDescription: cap.semanticDescription,
            targetDefinition: JSON.stringify(cap.targetDefinition),
            inputDefinition: JSON.stringify(cap.inputDefinition),
            outputDefinition: JSON.stringify(cap.outputDefinition),
            verificationDefinition: JSON.stringify(cap.verificationDefinition),
            recoveryDefinition: JSON.stringify(cap.recoveryDefinition),
            riskLevel: cap.riskLevel,
            version: cap.version,
            isPublished: cap.isPublished,
            isRetired: cap.isRetired,
          },
          update: {
            businessName: cap.businessName,
            type: cap.type,
            pageContext: cap.pageContext,
            semanticDescription: cap.semanticDescription,
            targetDefinition: JSON.stringify(cap.targetDefinition),
            inputDefinition: JSON.stringify(cap.inputDefinition),
            outputDefinition: JSON.stringify(cap.outputDefinition),
            verificationDefinition: JSON.stringify(cap.verificationDefinition),
            recoveryDefinition: JSON.stringify(cap.recoveryDefinition),
            riskLevel: cap.riskLevel,
            isPublished: cap.isPublished,
            isRetired: cap.isRetired,
          },
        });
      }
      for (const flow of data.flows) {
        if (!appIds.has(flow.applicationId)) continue;
        await prisma.businessFlow.upsert({
          where: { id: flow.id },
          create: {
            id: flow.id,
            applicationId: flow.applicationId,
            name: flow.name,
            description: flow.description,
            status: flow.status,
            version: flow.version,
            latestTestStatus: flow.latestTestStatus,
            graphDefinition: JSON.stringify({ nodes: flow.nodes, edges: flow.edges }),
            variables: JSON.stringify(flow.variables || []),
            failurePolicy: flow.failurePolicy,
            isRetired: flow.isRetired,
          },
          update: {
            name: flow.name,
            description: flow.description,
            status: flow.status,
            version: flow.version,
            latestTestStatus: flow.latestTestStatus,
            graphDefinition: JSON.stringify({ nodes: flow.nodes, edges: flow.edges }),
            variables: JSON.stringify(flow.variables || []),
            failurePolicy: flow.failurePolicy,
            isRetired: flow.isRetired,
          },
        });
      }
      for (const exp of data.experience) {
        if (!appIds.has(exp.applicationId)) continue;
        const capabilityId = exp.capabilityId && capIds.has(exp.capabilityId) ? exp.capabilityId : null;
        await prisma.experienceMemory.upsert({
          where: { id: exp.id },
          create: {
            id: exp.id,
            applicationId: exp.applicationId,
            capabilityId,
            pageContext: exp.pageContext,
            originalTarget: exp.originalTarget,
            resolvedTarget: exp.resolvedTarget,
            resolutionMethod: exp.resolutionMethod,
            confidence: exp.confidence,
            successCount: exp.successCount,
            failureCount: exp.failureCount,
            isEnabled: exp.isEnabled,
            lastVerifiedAt: new Date(exp.lastVerifiedAt),
          },
          update: {
            resolvedTarget: exp.resolvedTarget,
            capabilityId,
            successCount: exp.successCount,
            failureCount: exp.failureCount,
            isEnabled: exp.isEnabled,
            lastVerifiedAt: new Date(exp.lastVerifiedAt),
            confidence: exp.confidence,
          },
        });
      }
      for (const exec of data.executions) {
        if (!appIds.has(exec.applicationId) || !flowIds.has(exec.flowId)) continue;
        await prisma.execution.upsert({
          where: { id: exec.id },
          create: {
            id: exec.id,
            flowId: exec.flowId,
            applicationId: exec.applicationId,
            applicationSessionId: null,
            status: exec.status,
            mode: exec.mode,
            durationMs: exec.durationMs,
            matchedCount: exec.matchedCount,
            processedCount: exec.processedCount,
            successCount: exec.successCount,
            failedCount: exec.failedCount,
            skippedCount: exec.skippedCount,
            recoveryCount: exec.recoveryCount,
            remappingCount: exec.remappingCount,
            interventionCount: exec.interventionCount,
            error: exec.error,
            csvReportPath: exec.csvReportPath,
            snapshot: JSON.stringify(exec),
          },
          update: {
            status: exec.status,
            durationMs: exec.durationMs,
            matchedCount: exec.matchedCount,
            processedCount: exec.processedCount,
            successCount: exec.successCount,
            failedCount: exec.failedCount,
            skippedCount: exec.skippedCount,
            recoveryCount: exec.recoveryCount,
            remappingCount: exec.remappingCount,
            interventionCount: exec.interventionCount,
            error: exec.error,
            csvReportPath: exec.csvReportPath,
            snapshot: JSON.stringify(exec),
            completedAt: exec.completedAt ? new Date(exec.completedAt) : null,
          },
        });
      }

      await this.deleteMysqlWhereMissing(prisma.batchReport, data.reports.map((r) => r.id));
      await this.deleteMysqlWhereMissing(prisma.execution, data.executions.map((e) => e.id));
      await this.deleteMysqlWhereMissing(prisma.experienceMemory, data.experience.map((e) => e.id));
      await this.deleteMysqlWhereMissing(prisma.businessFlow, data.flows.map((f) => f.id));
      await this.deleteMysqlWhereMissing(prisma.semanticCapability, data.capabilities.map((c) => c.id));
      await this.deleteMysqlWhereMissing(prisma.applicationSession, data.sessions.map((s) => s.id));
      await this.deleteMysqlWhereMissing(prisma.workflowBuildSession, data.buildSessions.map((s) => s.id));
      await this.deleteMysqlWhereMissing(prisma.application, data.applications.map((a) => a.id));
    } catch (err) {
      console.error('MySQL sync failed:', err);
    } finally {
      this.mysqlSyncing = false;
      if (this.pendingMysqlSync) {
        this.pendingMysqlSync = false;
        void this.syncMysql(this.data);
      }
    }
  }

  // ================= APPLICATIONS =================
  getApplications(): Application[] {
    return this.data.applications.map((a) => ({
      ...a,
      applicationType: a.applicationType || 'UI',
    }));
  }

  getApplication(id: string): Application | undefined {
    return this.data.applications.find((a) => a.id === id);
  }

  createApplication(app: Application): Application {
    const existingIdx = this.data.applications.findIndex((a) => a.id === app.id || a.name.toLowerCase() === app.name.toLowerCase());
    if (existingIdx >= 0) {
      this.data.applications[existingIdx] = { ...this.data.applications[existingIdx], ...app, updatedAt: new Date().toISOString() };
    } else {
      this.data.applications.push(app);
    }
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

  checkApplicationDependencies(id: string): DependencyCheckResult {
    const capabilities = this.data.capabilities.filter((c) => c.applicationId === id);
    const flows = this.data.flows.filter((f) => f.applicationId === id && !f.isRetired);

    const hasDependencies = capabilities.length > 0 || flows.length > 0;
    return {
      hasDependencies,
      capabilitiesCount: capabilities.length,
      flowsCount: flows.length,
      referencingFlows: flows.map((f) => f.name),
      message: hasDependencies
        ? `This application is referenced by ${capabilities.length} capabilities and ${flows.length} business flows (${flows.map((f) => f.name).join(', ')}). Deleting it will break these dependencies.`
        : 'No dependencies found. Safe to delete.',
    };
  }

  deleteApplication(id: string, force = false): { success: boolean; dependencyCheck?: DependencyCheckResult; message?: string } {
    const depCheck = this.checkApplicationDependencies(id);
    if (depCheck.hasDependencies && !force) {
      return {
        success: false,
        dependencyCheck: depCheck,
        message: depCheck.message,
      };
    }

    const before = this.data.applications.length;
    this.data.applications = this.data.applications.filter((a) => a.id !== id);

    if (force) {
      const droppedFlowIds = new Set(this.data.flows.filter((f) => f.applicationId === id).map((f) => f.id));
      this.data.capabilities = this.data.capabilities.filter((c) => c.applicationId !== id);
      this.data.flows = this.data.flows.filter((f) => f.applicationId !== id);
      this.data.executions = this.data.executions.filter((e) => e.applicationId !== id && !droppedFlowIds.has(e.flowId));
      this.data.experience = this.data.experience.filter((e) => e.applicationId !== id);
      this.data.sessions = this.data.sessions.filter((s) => s.applicationId !== id);
      this.data.buildSessions = this.data.buildSessions.filter((s) => s.applicationId !== id);
      this.data.reports = this.data.reports.filter((r) => this.data.executions.some((e) => e.id === r.executionId));
    }

    this.saveData(this.data);
    if (this.mysqlReady) {
      void prisma.application.deleteMany({ where: { id } }).catch((err) => {
        console.error('MySQL application delete failed:', err);
      });
    }
    return { success: this.data.applications.length < before };
  }

  retireApplication(id: string): Application | undefined {
    return this.updateApplication(id, { isActive: false });
  }

  restoreApplication(id: string): Application | undefined {
    return this.updateApplication(id, { isActive: true });
  }

  // ================= SESSIONS =================
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

  // ================= CAPABILITIES =================
  getCapabilities(applicationId?: string): SemanticCapability[] {
    let list = this.data.capabilities;
    if (applicationId) {
      list = list.filter((c) => c.applicationId === applicationId);
    }
    return list;
  }

  getCapability(id: string): SemanticCapability | undefined {
    return this.data.capabilities.find((c) => c.id === id);
  }

  createCapability(cap: SemanticCapability): SemanticCapability {
    this.createCapabilities([cap]);
    return this.getCapability(cap.id) || cap;
  }

  createCapabilities(caps: SemanticCapability[]): void {
    const now = new Date().toISOString();
    for (const cap of caps) {
      const existingIdx = this.data.capabilities.findIndex((c) => c.id === cap.id);
      if (existingIdx >= 0) {
        this.data.capabilities[existingIdx] = { ...this.data.capabilities[existingIdx], ...cap, updatedAt: now };
      } else {
        this.data.capabilities.push(cap);
      }
    }
    this.saveData(this.data);
  }

  updateCapability(id: string, updates: Partial<SemanticCapability>): SemanticCapability | undefined {
    const idx = this.data.capabilities.findIndex((c) => c.id === id);
    if (idx === -1) return undefined;
    this.data.capabilities[idx] = { ...this.data.capabilities[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveData(this.data);
    return this.data.capabilities[idx];
  }

  checkCapabilityDependencies(id: string): DependencyCheckResult {
    const referencingFlows = this.data.flows.filter((f) => {
      return !f.isRetired && f.nodes.some((n) => n.data?.capabilityId === id);
    });

    const hasDependencies = referencingFlows.length > 0;
    return {
      hasDependencies,
      capabilitiesCount: 1,
      flowsCount: referencingFlows.length,
      referencingFlows: referencingFlows.map((f) => f.name),
      message: hasDependencies
        ? `This capability is used by ${referencingFlows.length} business flow(s): ${referencingFlows.map((f) => f.name).join(', ')}. Deleting it will cause these flows to fail validation.`
        : 'No active flows depend on this capability. Safe to delete.',
    };
  }

  deleteCapability(id: string, force = false): { success: boolean; dependencyCheck?: DependencyCheckResult; message?: string } {
    const depCheck = this.checkCapabilityDependencies(id);
    if (depCheck.hasDependencies && !force) {
      return {
        success: false,
        dependencyCheck: depCheck,
        message: depCheck.message,
      };
    }

    const before = this.data.capabilities.length;
    this.data.capabilities = this.data.capabilities.filter((c) => c.id !== id);
    this.data.experience = this.data.experience.map((e) =>
      e.capabilityId === id ? { ...e, capabilityId: undefined } : e
    );
    this.saveData(this.data);
    if (this.mysqlReady) {
      void prisma.semanticCapability.deleteMany({ where: { id } }).catch((err) => {
        console.error('MySQL capability delete failed:', err);
      });
    }
    return { success: this.data.capabilities.length < before };
  }

  retireCapability(id: string): SemanticCapability | undefined {
    return this.updateCapability(id, { isRetired: true, isPublished: false });
  }

  // ================= BUSINESS FLOWS =================
  getFlows(applicationId?: string): BusinessFlow[] {
    let list = this.data.flows;
    if (applicationId) {
      list = list.filter((f) => f.applicationId === applicationId);
    }
    return list;
  }

  getRunnableFlows(): BusinessFlow[] {
    return this.getFlows().filter(
      (f) =>
        !f.isRetired &&
        f.latestTestStatus === 'SUCCESS' &&
        (f.status === 'PRODUCTION' || f.status === 'TEST' || f.status === 'APPROVED')
    );
  }

  getFlow(id: string): BusinessFlow | undefined {
    return this.data.flows.find((f) => f.id === id);
  }

  createFlow(flow: BusinessFlow): BusinessFlow {
    const existingIdx = this.data.flows.findIndex((f) => f.id === flow.id);
    if (existingIdx >= 0) {
      this.data.flows[existingIdx] = { ...this.data.flows[existingIdx], ...flow, updatedAt: new Date().toISOString() };
    } else {
      this.data.flows.push(flow);
    }
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

  deleteFlow(id: string, force = false): { success: boolean; isPublished?: boolean; message?: string } {
    const flow = this.getFlow(id);
    if (!flow) return { success: false, message: 'Flow not found' };

    if (flow.status === 'PRODUCTION' && !force) {
      return {
        success: false,
        isPublished: true,
        message: 'This workflow is currently published to Production. Recommended action is to Retire Workflow rather than permanently deleting.',
      };
    }

    const before = this.data.flows.length;
    this.data.flows = this.data.flows.filter((f) => f.id !== id);
    const remainingExecIds = new Set(
      this.data.executions.filter((e) => e.flowId !== id).map((e) => e.id)
    );
    this.data.executions = this.data.executions.filter((e) => e.flowId !== id);
    this.data.reports = this.data.reports.filter((r) => remainingExecIds.has(r.executionId) || remainingExecIds.has(r.id));
    this.saveData(this.data);
    if (this.mysqlReady) {
      void prisma.businessFlow.deleteMany({ where: { id } }).catch((err) => {
        console.error('MySQL flow delete failed:', err);
      });
    }
    return { success: this.data.flows.length < before };
  }

  retireFlow(id: string): BusinessFlow | undefined {
    return this.updateFlow(id, { isRetired: true, status: 'RETIRED' });
  }

  // ================= BUILD SESSIONS (PERSISTENT STATE) =================
  getBuildSessions(): WorkflowBuildSession[] {
    return this.data.buildSessions;
  }

  getBuildSession(id: string): WorkflowBuildSession | undefined {
    return this.data.buildSessions.find((s) => s.id === id);
  }

  getActiveBuildSession(): WorkflowBuildSession | undefined {
    return this.data.buildSessions.find((s) => s && !isLegacyDemoSession(s));
  }

  clearBuildSessions() {
    this.data.buildSessions = [];
    this.saveData(this.data);
  }

  saveBuildSession(session: WorkflowBuildSession): WorkflowBuildSession {
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
    const before = this.data.buildSessions.length;
    this.data.buildSessions = this.data.buildSessions.filter((s) => s.id !== id);
    this.saveData(this.data);
    return this.data.buildSessions.length < before;
  }

  // ================= EXECUTIONS =================
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

  // ================= EXPERIENCE MEMORY =================
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
    const before = this.data.experience.length;
    this.data.experience = this.data.experience.filter((e) => e.id !== id);
    this.saveData(this.data);
    return this.data.experience.length < before;
  }

  // ================= REPORTS =================
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

  persistenceStatus() {
    return {
      mysql: this.mysqlReady,
      store: this.mysqlReady ? 'mysql+json' : 'json',
      applications: this.data.applications.length,
      capabilities: this.data.capabilities.length,
      flows: this.data.flows.length,
    };
  }

  getAllReports() {
    return this.data.reports;
  }
}

export const db = new EnterpriseDatabase();
