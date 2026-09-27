import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db } from './src/server/db/database';
import { browserSessions } from './src/server/browser/sessionManager';
import { debugLog } from './src/server/browser/debugLog';
import { orchestrator } from './src/server/engine/orchestrator';
import { setExecutionEventBroadcast } from './src/server/engine/executionEvents';
import { recoveryEngine } from './src/server/engine/recovery';
import { compiler } from './src/server/engine/compiler';
import { resolver } from './src/server/engine/resolver';
import { agentBuildEngine } from './src/server/engine/agentBuildEngine';
import { WebSocketMessage, WebSocketEventType } from './src/types/automation';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use('/obs-shots', express.static(path.join(process.cwd(), 'data', 'obs-shots')));

const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);

  ws.send(
    JSON.stringify({
      type: 'SESSION_CREATED',
      payload: { message: 'Connected to Enterprise Automation Agent WebSocket' },
      timestamp: new Date().toISOString(),
    })
  );

  ws.on('message', (messageRaw) => {
    try {
      const data = JSON.parse(messageRaw.toString());
      if (data.type === 'RESOLVE_INTERVENTION' && data.interventionId) {
        recoveryEngine.resolveIntervention(
          data.interventionId,
          data.action,
          data.selectedTarget,
          data.applicationId,
          data.capabilityId
        );
      }
    } catch (e) {
      console.error('Failed to parse WS message:', e);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

function broadcastWs(
  type: WebSocketEventType,
  payload: Record<string, unknown>,
  correlationIds?: Record<string, string>
) {
  const msg: WebSocketMessage = {
    type,
    payload,
    timestamp: new Date().toISOString(),
    correlationIds,
  };
  const stringified = JSON.stringify(msg);

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(stringified);
    }
  }
}

orchestrator.setBroadcaster(broadcastWs);
setExecutionEventBroadcast(broadcastWs);

// ======================= REST API ROUTES =======================

app.get('/api/health', (_req: Request, res: Response) => {
  res.json(db.persistenceStatus());
});

// --- CREDENTIALS MANAGEMENT (Never reveal secret values) ---
app.get('/api/credentials/status', (req: Request, res: Response) => {
  const apps = db.getApplications();
  const keys = new Set<string>(['DATABASE_URL']);
  for (const app of apps) {
    (app.credentialKeys || []).forEach((k) => keys.add(k));
    if (app.usernameEnvVar) keys.add(app.usernameEnvVar);
    if (app.passwordEnvVar) keys.add(app.passwordEnvVar);
    if (app.apiKeyEnvVar) keys.add(app.apiKeyEnvVar);
  }
  const statusList = Array.from(keys).map((key) => {
    const isConfigured = !!process.env[key];
    return { key, status: isConfigured ? 'Configured' : 'Missing', configured: isConfigured };
  });
  res.json({ credentials: statusList });
});

// --- AGENT CONVERSATIONAL BUILD & RUN ENGINE ---
app.get('/api/agent/session', async (_req: Request, res: Response) => {
  const session = agentBuildEngine.startSession();
  const hydrated = await agentBuildEngine.autoAttachIfBrowserOpen(session);
  res.json(hydrated);
});

app.post('/api/debug-client', (req: Request, res: Response) => {
  const { message, data } = req.body || {};
  debugLog('F', 'AgentChatView.tsx:client', String(message || 'client'), data && typeof data === 'object' ? data : {});
  res.json({ ok: true });
});

app.post('/api/agent/message', async (req: Request, res: Response) => {
    const { sessionId, text, chosenOptionId, payload } = req.body;
  const updatedSession = await agentBuildEngine.handleUserMessage(
    sessionId,
    text || '',
    chosenOptionId,
    payload
  );
  const last = updatedSession.messages[updatedSession.messages.length - 1];
  debugLog('F', 'server.ts:message', 'http handler sending json', {
    state: updatedSession.currentState,
    lastCard: last?.card?.type || null,
    optionCount: last?.options?.length || 0,
    varControls: ((updatedSession.variables?.lastObservation as { controls?: unknown[] } | undefined)?.controls || []).length,
  });
  try {
    broadcastWs('BUILD_SESSION_UPDATED', { session: updatedSession });
  } catch (err) {
    debugLog('F', 'server.ts:message', 'broadcast failed', { error: err instanceof Error ? err.message : String(err) });
  }
  res.json(updatedSession);
});

app.post('/api/agent/reset', (req: Request, res: Response) => {
  const session = agentBuildEngine.resetBuildSession();
  broadcastWs('BUILD_SESSION_UPDATED', { session });
  res.json(session);
});

// --- APPLICATIONS (MySQL-backed persistence) ---
app.get('/api/applications', (req: Request, res: Response) => {
  res.json(db.getApplications());
});

app.post('/api/applications', (req: Request, res: Response) => {
  const newApp = {
    id: `app-${Date.now().toString().slice(-6)}`,
    isActive: true,
    browserConfig: { viewport: { width: 1280, height: 800 }, headed: true, timeoutMs: 30000 },
    supportedMechanisms: ['PLAYWRIGHT_CHROMIUM'],
    credentialKeys: req.body.credentialKeys || [],
    applicationType: req.body.applicationType || 'UI',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...req.body,
  };
  const created = db.createApplication(newApp);
  res.status(201).json(created);
});

app.get('/api/applications/:id', (req: Request, res: Response) => {
  const appItem = db.getApplication(req.params.id);
  if (!appItem) return res.status(404).json({ error: 'Application not found' });
  res.json(appItem);
});

app.put('/api/applications/:id', (req: Request, res: Response) => {
  const updated = db.updateApplication(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Application not found' });
  res.json(updated);
});

app.get('/api/applications/:id/dependencies', (req: Request, res: Response) => {
  const check = db.checkApplicationDependencies(req.params.id);
  res.json(check);
});

app.delete('/api/applications/:id', (req: Request, res: Response) => {
  const force = req.query.force === 'true';
  const result = db.deleteApplication(req.params.id, force);
  if (!result.success) {
    return res.status(409).json(result);
  }
  res.json({ success: true, message: 'Application deleted successfully.' });
});

app.post('/api/applications/:id/retire', (req: Request, res: Response) => {
  const retired = db.retireApplication(req.params.id);
  if (!retired) return res.status(404).json({ error: 'Application not found' });
  res.json({ success: true, application: retired });
});

app.post('/api/applications/:id/restore', (req: Request, res: Response) => {
  const restored = db.restoreApplication(req.params.id);
  if (!restored) return res.status(404).json({ error: 'Application not found' });
  res.json({ success: true, application: restored });
});

app.post('/api/applications/:id/launch', async (req: Request, res: Response) => {
  const appItem = db.getApplication(req.params.id);
  if (!appItem) return res.status(404).json({ error: 'Application not found' });

  try {
    const launched = await browserSessions.launch(appItem);
    const session = {
      id: `sess-${Date.now().toString().slice(-6)}`,
      applicationId: appItem.id,
      browserId: 'chromium-headed-01',
      status: 'ACTIVE' as const,
      currentUrl: launched.url,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };
    db.saveSession(session);

    broadcastWs('APPLICATION_LAUNCHED', {
      applicationId: appItem.id,
      sessionId: session.id,
      url: launched.url,
    });

    res.json({ success: true, session });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/applications/:id/close', async (req: Request, res: Response) => {
  const session = db.getActiveSessionForApp(req.params.id);
  if (session) {
    session.status = 'CLOSED';
    db.saveSession(session);
  }
  await browserSessions.close(req.params.id);
  res.json({ success: true, message: 'Browser session closed' });
});

app.post('/api/applications/:id/test-login', async (req: Request, res: Response) => {
  const appItem = db.getApplication(req.params.id);
  if (!appItem) return res.status(404).json({ error: 'Application not found' });

  try {
    const observation = await browserSessions.observe(appItem);
    const userEnv = appItem.usernameEnvVar || appItem.credentialKeys?.[0];
    const passEnv = appItem.passwordEnvVar || appItem.credentialKeys?.[1];
    const username = userEnv ? process.env[userEnv] : undefined;
    const password = passEnv ? process.env[passEnv] : undefined;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Set usernameEnvVar / passwordEnvVar on the application and matching values in .env before testing login.',
      });
    }

    const userControl = observation.controls.find((c) => c.semanticPurpose === 'username' || c.type === 'email' || c.type === 'text');
    const passControl = observation.controls.find((c) => c.semanticPurpose === 'password' || c.type === 'password');
    const submit = observation.controls.find(
      (c) => c.semanticPurpose === 'action' && /sign in|log in|login|submit/i.test(c.accessibleName || c.visibleText || '')
    );

    if (userControl?.selectorFallback) await browserSessions.fill(appItem, userControl.selectorFallback, username);
    if (passControl?.selectorFallback) await browserSessions.fill(appItem, passControl.selectorFallback, password);
    if (submit?.selectorFallback) await browserSessions.click(appItem, submit.selectorFallback);

    const after = await browserSessions.observe(appItem);

    broadcastWs('SESSION_AUTHENTICATED', {
      applicationId: appItem.id,
      user: username,
      url: after.url,
    });

    res.json({ success: true, sessionUser: username, message: `Login attempted. Now at ${after.url}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message });
  }
});

app.get('/api/applications/:id/observe', async (req: Request, res: Response) => {
  const appItem = db.getApplication(req.params.id);
  if (!appItem) return res.status(404).json({ error: 'Application not found' });

  try {
    const observation = await browserSessions.observe(appItem);
    broadcastWs('PAGE_OBSERVED', {
      url: observation.url,
      title: observation.title,
      controlsCount: observation.controls.length,
      tablesCount: observation.tables.length,
    });
    res.json(observation);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/applications/:id/observe', async (req: Request, res: Response) => {
  const appItem = db.getApplication(req.params.id);
  if (!appItem) return res.status(404).json({ error: 'Application not found' });

  try {
    await browserSessions.ensureOpen(appItem);
    const observation = await browserSessions.observe(appItem);
    broadcastWs('PAGE_OBSERVED', {
      url: observation.url,
      title: observation.title,
      controlsCount: observation.controls.length,
      tablesCount: observation.tables.length,
    });
    res.json({ observation, createdCapabilities: [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// --- CAPABILITIES (MySQL-backed persistence) ---
app.get('/api/capabilities', (req: Request, res: Response) => {
  const appId = req.query.applicationId as string;
  res.json(db.getCapabilities(appId));
});

app.post('/api/capabilities', (req: Request, res: Response) => {
  const newCap = {
    id: `cap-${Date.now().toString().slice(-6)}`,
    version: 1,
    isPublished: true,
    isRetired: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...req.body,
  };
  const created = db.createCapability(newCap);
  broadcastWs('CAPABILITY_DISCOVERED', { capability: created });
  res.status(201).json(created);
});

app.get('/api/capabilities/:id', (req: Request, res: Response) => {
  const cap = db.getCapability(req.params.id);
  if (!cap) return res.status(404).json({ error: 'Capability not found' });
  res.json(cap);
});

app.put('/api/capabilities/:id', (req: Request, res: Response) => {
  const updated = db.updateCapability(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Capability not found' });
  res.json(updated);
});

app.get('/api/capabilities/:id/dependencies', (req: Request, res: Response) => {
  const check = db.checkCapabilityDependencies(req.params.id);
  res.json(check);
});

app.delete('/api/capabilities/:id', (req: Request, res: Response) => {
  const force = req.query.force === 'true';
  const result = db.deleteCapability(req.params.id, force);
  if (!result.success) {
    return res.status(409).json(result);
  }
  res.json({ success: true, message: 'Capability deleted successfully.' });
});

app.post('/api/capabilities/:id/retire', (req: Request, res: Response) => {
  const retired = db.retireCapability(req.params.id);
  if (!retired) return res.status(404).json({ error: 'Capability not found' });
  res.json({ success: true, capability: retired });
});

app.post('/api/capabilities/:id/test', async (req: Request, res: Response) => {
  const cap = db.getCapability(req.params.id);
  if (!cap) return res.status(404).json({ error: 'Capability not found' });
  const appItem = db.getApplication(cap.applicationId);
  if (!appItem) return res.status(404).json({ error: 'Application not found' });

  try {
    const obs = await browserSessions.observe(appItem);
    const resolution = resolver.resolve(cap.targetDefinition, obs.controls, {
      applicationId: cap.applicationId,
      capabilityId: cap.id,
    });

    res.json({
      testedCapability: cap.businessName,
      resolution,
      observationSnapshot: {
        url: obs.url,
        title: obs.title,
        totalControlsObserved: obs.controls.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// --- BUSINESS FLOWS (MySQL-backed persistence) ---
app.get('/api/flows', (req: Request, res: Response) => {
  const appId = req.query.applicationId as string;
  res.json(db.getFlows(appId));
});

app.post('/api/flows', (req: Request, res: Response) => {
  const newFlow = {
    id: `flow-${Date.now().toString().slice(-6)}`,
    version: 1,
    status: 'DRAFT' as const,
    isRetired: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...req.body,
  };
  const created = db.createFlow(newFlow);
  res.status(201).json(created);
});

app.get('/api/flows/:id', (req: Request, res: Response) => {
  const flow = db.getFlow(req.params.id);
  if (!flow) return res.status(404).json({ error: 'Flow not found' });
  res.json(flow);
});

app.put('/api/flows/:id', (req: Request, res: Response) => {
  const updated = db.updateFlow(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Flow not found' });
  res.json(updated);
});

app.delete('/api/flows/:id', (req: Request, res: Response) => {
  const force = req.query.force === 'true';
  const result = db.deleteFlow(req.params.id, force);
  if (!result.success) {
    return res.status(409).json(result);
  }
  res.json({ success: true, message: 'Workflow deleted successfully.' });
});

app.post('/api/flows/:id/retire', (req: Request, res: Response) => {
  const retired = db.retireFlow(req.params.id);
  if (!retired) return res.status(404).json({ error: 'Flow not found' });
  res.json({ success: true, flow: retired });
});

app.post('/api/flows/:id/validate', (req: Request, res: Response) => {
  const flow = db.getFlow(req.params.id);
  if (!flow) return res.status(404).json({ error: 'Flow not found' });

  const result = compiler.compile(flow);
  res.json(result);
});

app.post('/api/flows/:id/test', async (req: Request, res: Response) => {
  try {
    const result = await orchestrator.runFlow(req.params.id, 'TEST', {
      autoConfirmIntervention: req.body?.autoConfirmIntervention !== false,
      simulateValidationErrorOnClaim: req.body?.simulateValidationErrorOnClaim,
    });
    db.updateFlow(req.params.id, {
      latestTestStatus: result.status === 'COMPLETED' ? 'SUCCESS' : 'FAILED',
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/flows/:id/publish', (req: Request, res: Response) => {
  const flow = db.getFlow(req.params.id);
  if (!flow) return res.status(404).json({ error: 'Flow not found' });

  if (flow.latestTestStatus !== 'SUCCESS') {
    return res.status(400).json({
      error: 'Cannot publish business flow: latest test must be SUCCESS before promoting to PRODUCTION.',
    });
  }

  const updated = db.updateFlow(req.params.id, { status: 'PRODUCTION' });
  res.json(updated);
});

app.post('/api/flows/:id/run', async (req: Request, res: Response) => {
  try {
    const flow = db.getFlow(req.params.id);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });

    if (flow.status !== 'PRODUCTION' || flow.latestTestStatus !== 'SUCCESS') {
      return res.status(400).json({
        error: `Policy violation: Run mode requires flow status "PRODUCTION" and latest test "SUCCESS". Current status: ${flow.status}, test: ${flow.latestTestStatus || 'NONE'}`,
      });
    }

    const result = await orchestrator.runFlow(req.params.id, 'RUN', {
      autoConfirmIntervention: req.body?.autoConfirmIntervention,
      simulateValidationErrorOnClaim: req.body?.simulateValidationErrorOnClaim,
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// --- EXECUTIONS ---
app.get('/api/executions', (req: Request, res: Response) => {
  res.json(db.getExecutions());
});

app.get('/api/executions/:id', (req: Request, res: Response) => {
  const exec = db.getExecution(req.params.id);
  if (!exec) return res.status(404).json({ error: 'Execution not found' });
  const pending = recoveryEngine.getActiveInterventions().filter((i) => i.executionId === exec.id);
  if (!pending.length) return res.json(exec);
  const others = (exec.interventions || []).filter((i) => !pending.some((p) => p.id === i.id));
  res.json({
    ...exec,
    status: exec.status === 'RUNNING' ? 'PAUSED' : exec.status,
    interventions: [...others, ...pending],
  });
});

app.post('/api/executions/:id/stop', (req: Request, res: Response) => {
  orchestrator.stopExecution(req.params.id);
  res.json({ success: true, message: 'Execution stop requested' });
});

// --- INTERVENTIONS ---
app.get('/api/interventions', (req: Request, res: Response) => {
  res.json(recoveryEngine.getActiveInterventions());
});

app.post('/api/interventions/:id/resolve', (req: Request, res: Response) => {
  const { action, selectedTarget, applicationId, capabilityId } = req.body;
  const success = recoveryEngine.resolveIntervention(
    req.params.id,
    action || 'CONFIRM',
    selectedTarget,
    applicationId,
    capabilityId
  );
  res.json({ success });
});

// --- EXPERIENCE MEMORY ---
app.get('/api/experience', (req: Request, res: Response) => {
  const appId = req.query.applicationId as string;
  res.json(db.getExperience(appId));
});

app.post('/api/experience', (req: Request, res: Response) => {
  const newEntry = {
    id: `exp-${Date.now().toString().slice(-6)}`,
    successCount: 1,
    failureCount: 0,
    isEnabled: true,
    lastVerifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...req.body,
  };
  const created = db.saveExperience(newEntry);
  res.status(201).json(created);
});

app.put('/api/experience/:id', (req: Request, res: Response) => {
  const existing = db.getExperienceEntry(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Experience entry not found' });
  const updated = db.saveExperience({ ...existing, ...req.body, updatedAt: new Date().toISOString() });
  res.json(updated);
});

app.delete('/api/experience/:id', (req: Request, res: Response) => {
  const deleted = db.deleteExperience(req.params.id);
  res.json({ success: deleted });
});

// --- REPORTS & CSV DOWNLOAD ---
app.get('/api/reports', (req: Request, res: Response) => {
  res.json(db.getAllReports());
});

app.get('/api/reports/:id', (req: Request, res: Response) => {
  const report = db.getReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json(report);
});

app.get('/api/reports/:id/csv', (req: Request, res: Response) => {
  const report = db.getReport(req.params.id);
  if (!report) return res.status(404).send('Report not found');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
  res.send(report.csvContent);
});

// --- VITE MIDDLEWARE / STATIC ASSETS ---
async function startServer() {
  await db.init();
  const PORT = parseInt(process.env.APP_PORT || process.env.PORT || '3000', 10);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Enterprise Automation Platform running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server start failure:', err);
});
