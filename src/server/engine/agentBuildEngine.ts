import { v4 as uuidv4 } from 'uuid';
import {
  WorkflowBuildSession,
  ConfirmedWorkflowStep,
  BusinessFlow,
  ObservationResult,
  FilterOperator,
  FlowNode,
  SemanticCapability,
} from '../../types/automation';
import { db } from '../db/database';
import { browserSessions } from '../browser/sessionManager';
import { capabilitiesFromObservation, persistTaughtCapabilities } from './capabilityDiscovery';
import { debugLog } from '../browser/debugLog';
import { normalizeEnvName } from './envPersist';
import {
  distinctRowActions,
  genericActionText,
  paginationControlCandidates,
  semanticOptionsFromObservation,
} from './semanticOptions';
import { distinctActionsFromPreview, previewMatchingActionableRows, rowMatchesFilters } from './tableFilter';
import { askClickRecovery, clickActionOnMatchingRows } from './tableRowLoop';
import { orchestrator } from './orchestrator';
import { recoveryEngine } from './recovery';
import { emitExecutionEvent } from './executionEvents';

const WIZARD_BACK = {
  id: 'table-wizard-back',
  label: 'Back to page actions',
  type: 'secondary' as const,
};

type TableWizard = {
  step: 'kind' | 'filterAsk' | 'column' | 'operator' | 'envName';
  column?: string;
  operator?: FilterOperator;
  envName?: string;
};

function summarizeObservation(observation: ObservationResult): string {
  const table = observation.tables[0];
  const lines: string[] = [`I observed "${observation.title}".`];
  if (table) {
    lines.push(
      `Table "${table.semanticName}": columns ${table.columns.join(', ')}. Choose a page action, or Table row action to teach a row click.`
    );
  } else {
    lines.push('Choose a page action to add to the flow.');
  }
  if (!observation.controls.filter((c) => !c.inRowId).length && !table) {
    return `I opened "${observation.title}" (${observation.url}). No interactive controls yet — use Re-observe after the page finishes loading.`;
  }
  return lines.join('\n');
}

function observationForUi(observation: ObservationResult) {
  return {
    ...observation,
    screenshotUrl: observation.screenshotUrl?.startsWith('/obs-shots/')
      ? observation.screenshotUrl
      : undefined,
    controls: observation.controls.filter((c) => !c.inRowId),
    tables: observation.tables.map((t) => ({
      id: t.id,
      semanticName: t.semanticName,
      columns: t.columns,
    })),
  };
}

function observationForChat(observation: ObservationResult): ObservationResult {
  const shot = observation.screenshotUrl || '';
  return {
    ...observation,
    screenshotUrl: shot.startsWith('/obs-shots/') ? shot : undefined,
    controls: observation.controls.filter((c) => !c.inRowId),
    tables: observation.tables.map((t) => ({
      ...t,
      rows: (t.rows || []).slice(0, 80),
    })),
  };
}

type TableMeta = {
  tableId?: string;
  semanticName?: string;
  columns: string[];
  actions: Array<{ label: string; kind: string }>;
};

function rememberObservation(session: WorkflowBuildSession, observation: ObservationResult) {
  const table = observation.tables[0];
  if (table) {
    session.variables.tableMeta = {
      tableId: table.id,
      semanticName: table.semanticName,
      columns: table.columns,
      actions: distinctRowActions(table).map(({ label, kind }) => ({ label, kind, type: kind })),
    } satisfies TableMeta;
  }
  session.variables.lastObservation = observationForChat(observation);
  session.variables.liveCapabilities = capabilitiesFromObservation(session.applicationId, observation);
}

function isLoopbackUrl(raw?: string) {
  if (!raw) return false;
  try {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(new URL(raw).hostname);
  } catch {
    return false;
  }
}

function mappedSelectors(session: WorkflowBuildSession): string[] {
  return session.confirmedSteps
    .map((s) => s.selectorFallback || s.capabilityId || s.id)
    .filter(Boolean);
}

function mappingOptions(
  session: WorkflowBuildSession,
  observation: ObservationResult,
  opts?: { includeTable?: boolean }
) {
  return semanticOptionsFromObservation(observation, mappedSelectors(session), opts);
}

function adoptSelectedCapability(session: WorkflowBuildSession, selector: string): SemanticCapability | undefined {
  const live = (session.variables.liveCapabilities as SemanticCapability[]) || [];
  const cap = live.find((c) => c.targetDefinition.selectorFallback === selector);
  if (!cap) return undefined;
  if (!session.confirmedCapabilities.some((c) => c.id === cap.id)) {
    session.confirmedCapabilities.push(cap);
  }
  return cap;
}

export class AgentBuildEngine {
  startSession(): WorkflowBuildSession {
    const existing = db.getActiveBuildSession();
    if (existing) return existing;

    for (const leftover of db.getBuildSessions()) {
      db.deleteBuildSession(leftover.id);
    }

    const session: WorkflowBuildSession = {
      id: `build-sess-${uuidv4()}`,
      workflowName: '',
      description: '',
      applicationId: '',
      currentState: 'CHOOSE_MODE',
      confirmedCapabilities: [],
      confirmedSteps: [],
      variables: {},
      messages: [
        {
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: 'Intent Automation Agent.\n\nWhat would you like to do?',
          options: [
            { id: 'mode-build', label: 'Build automation', description: 'Teach a new business flow from a live application', type: 'primary' },
            { id: 'mode-run', label: 'Run automation', description: 'Execute a published business flow', type: 'secondary' },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveBuildSession(session);
    return session;
  }

  async autoAttachIfBrowserOpen(session: WorkflowBuildSession): Promise<WorkflowBuildSession> {
    return session;
  }

  async handleUserMessage(
    sessionId: string,
    userText: string,
    chosenOptionId?: string,
    payload?: Record<string, unknown>
  ): Promise<WorkflowBuildSession> {
    const session =
      db.getBuildSession(sessionId) || db.getActiveBuildSession() || this.startSession();
    debugLog('G', 'agentBuildEngine.ts:handleUserMessage', 'incoming', {
      chosenOptionId: chosenOptionId || null,
      state: session.currentState,
      text: (userText || '').slice(0, 80),
      payloadKeys: payload ? Object.keys(payload) : [],
    });
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'user',
      text: userText || chosenOptionId || '(form submitted)',
      timestamp: new Date().toISOString(),
    });

    if (chosenOptionId === 'obs-refresh' || /^re-?observe/i.test((userText || '').trim())) {
      const app =
        this.resolveUiApp(session, chosenOptionId, userText) ||
        (await browserSessions.findAppForOpenTabs(this.listUiApps()));
      if (!app) {
        session.currentState = 'SELECT_APPLICATION';
        this.promptApps(
          session,
          'Click Observe on an app (same as Facebook). Re-observe binds a local 127.0.0.1 app if one is registered.'
        );
        return this.persist(session);
      }
      await this.attachLiveObservation(session, app);
      return this.persist(session);
    }

    if (chosenOptionId?.startsWith('trace-retry-')) {
      recoveryEngine.resolveIntervention(chosenOptionId.replace('trace-retry-', ''), 'RETRY');
      return this.persist(session);
    }
    if (chosenOptionId?.startsWith('trace-skip-')) {
      recoveryEngine.resolveIntervention(chosenOptionId.replace('trace-skip-', ''), 'SKIP');
      return this.persist(session);
    }
    if (chosenOptionId?.startsWith('trace-map-')) {
      const rest = chosenOptionId.replace(/^trace-map-/, '');
      const raw = String(payload?.selectedTarget || payload?.selector || userText || '');
      const target = raw.replace(/^use\s+/i, '').trim();
      const interventionId = String(payload?.interventionId || rest.replace(/-\d+$/, ''));
      recoveryEngine.resolveIntervention(interventionId, 'CONFIRM', target);
      return this.persist(session);
    }

    if (
      chosenOptionId === 'test-mapped' ||
      ((session.currentState === 'TEST_FLOW' || session.currentState === 'BUILD_COMPLETE') &&
        this.isAffirmativeTest(userText, chosenOptionId))
    ) {
      await this.testMappedCapabilities(session);
      return this.persist(session);
    }

    if (chosenOptionId === 'save-flow' || chosenOptionId === 'publish-flow' || chosenOptionId === 'save-flow-confirm' || this.isSaveIntent(userText, session)) {
      const allPassed =
        session.confirmedSteps.length > 0 && session.confirmedSteps.every((s) => s.testPassed);
      if (!allPassed) {
        session.messages.push({
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: 'The business flow is not saved yet. Test until every mapped step passes, then Save.',
          options: [{ id: 'test-mapped', label: 'Test mapped capabilities', type: 'primary' }],
          timestamp: new Date().toISOString(),
        });
        return this.persist(session);
      }
      if (chosenOptionId === 'save-flow' || chosenOptionId === 'publish-flow' || this.isSaveAsk(userText, session)) {
        session.messages.push({
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: `Test succeeded. Confirm to save business flow "${session.workflowName}" to MySQL. It will not be stored until you confirm.`,
          options: [
            { id: 'save-flow-confirm', label: 'Confirm save', type: 'primary' },
            { id: 'test-mapped', label: 'Test again', type: 'secondary' },
            { id: 'resume-mapping', label: 'Back to mapping', type: 'secondary' },
          ],
          timestamp: new Date().toISOString(),
        });
        return this.persist(session);
      }
      this.persistConfirmedFlow(session);
      return this.persist(session);
    }

    if (chosenOptionId === 'resume-mapping') {
      session.currentState = 'WAIT_FOR_USER_SELECTION';
      const observation = this.currentObservation(session);
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: `Session held. ${session.confirmedSteps.length} step(s) already in the flow. Choose another capability or finish mapping.`,
        options: mappingOptions(session, observation),
        card: { type: 'OBSERVATION', data: { observation: observationForUi(observation) } },
        timestamp: new Date().toISOString(),
      });
      return this.persist(session);
    }

    if (chosenOptionId === 'act-register-app') {
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: 'Open Applications, register a UI app (name, URL, optional credential env vars), then continue here.',
        timestamp: new Date().toISOString(),
      });
      return this.persist(session);
    }

    if (chosenOptionId === 'mode-build' || chosenOptionId === 'mode-build-new') {
      const hold =
        chosenOptionId !== 'mode-build-new' &&
        !!session.applicationId &&
        (session.currentState === 'WAIT_FOR_USER_SELECTION' ||
          session.currentState === 'SHOW_CAPABILITIES' ||
          session.currentState === 'OBSERVE_PAGE' ||
          session.currentState === 'TEST_FLOW' ||
          session.confirmedSteps.length > 0);
      if (hold) {
        session.currentState = 'WAIT_FOR_USER_SELECTION';
        const observation = this.currentObservation(session);
        session.messages.push({
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: `Build session held. ${session.confirmedSteps.length} step(s) already in this flow. Choose a capability to add, or finish mapping when you are done.`,
          options: mappingOptions(session, observation),
          card: { type: 'OBSERVATION', data: { observation: observationForUi(observation) } },
          timestamp: new Date().toISOString(),
        });
        return this.persist(session);
      }
      session.workflowName = '';
      session.description = '';
      session.applicationId = '';
      session.confirmedSteps = [];
      session.confirmedCapabilities = [];
      session.variables = {};
      session.currentState = 'ASK_FLOW_DEFINITION';
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: 'What business flow should I teach? Provide a name and a short description.',
        card: { type: 'FLOW_DEFINITION', data: {} },
        timestamp: new Date().toISOString(),
      });
      return this.persist(session);
    }

    if (chosenOptionId === 'mode-run' || userText.toLowerCase() === 'run automation') {
      session.currentState = 'CHOOSE_MODE';
      const flows = db.getRunnableFlows();
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: flows.length
          ? 'Select a tested business flow. I will launch the app once and run the mapped capabilities in order on that same browser session.'
          : 'No runnable flows yet. Build, test, and save a flow first.',
        options: flows.map((f) => ({
          id: `run-flow-${f.id}`,
          label: f.name,
          description: f.description,
          type: 'primary' as const,
        })),
        timestamp: new Date().toISOString(),
      });
      return this.persist(session);
    }

    if (chosenOptionId?.startsWith('run-flow-')) {
      const flowId = chosenOptionId.replace('run-flow-', '');
      const flow = db.getFlow(flowId);
      if (!flow) {
        session.messages.push({
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: 'That business flow was not found. Save it from BUILD after a successful test.',
          timestamp: new Date().toISOString(),
        });
        return this.persist(session);
      }
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: `Launching "${flow.name}" and running ${flow.nodes.filter((n) => n.type === 'CAPABILITY' || n.type === 'TABLE_PROCESS').length} mapped step(s) on one browser session.`,
        timestamp: new Date().toISOString(),
      });
      this.persist(session);
      try {
        const exec = await orchestrator.runFlow(flowId, 'RUN', { session });
        if (exec.status !== 'STOPPED') {
        const ok = exec.status === 'COMPLETED' || exec.status === 'SUCCESS';
        const outcome = ok ? 'completed successfully' : `finished with status ${exec.status}`;
        const hasRows = (exec.rowResults || []).length > 0;
        session.messages.push({
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: hasRows
            ? `"${flow.name}" ${outcome}. Processed ${exec.processedCount} record(s): ${exec.successCount} success (clicked), ${exec.failedCount} failed, ${exec.skippedCount} skipped.${exec.csvReportPath ? ' Table extract CSV is ready.' : ''}`
            : `"${flow.name}" ${outcome}. No table records were processed.`,
          card: exec.csvReportPath
            ? {
                type: 'REPORT_SUMMARY',
                data: {
                  executionId: exec.id,
                  csvUrl: exec.csvReportPath,
                  fileName: `execution_${exec.id}.csv`,
                  processed: exec.processedCount,
                  success: exec.successCount,
                  failed: exec.failedCount,
                  skipped: exec.skippedCount,
                },
              }
            : undefined,
          timestamp: new Date().toISOString(),
        });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        session.messages.push({
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: `Run failed: ${message}`,
          timestamp: new Date().toISOString(),
        });
      }
      return this.persist(session);
    }

    const submittedName = String(payload?.workflowName || '').trim();
    if (session.currentState === 'ASK_FLOW_DEFINITION' || chosenOptionId === 'flow-def-submit') {
      const name = (submittedName || userText || '').trim();
      const description = String(payload?.description || session.description || '').trim();
      if (name.length < 3) {
        session.currentState = 'ASK_FLOW_DEFINITION';
        session.messages.push({
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: 'Flow name must be at least 3 characters. Use the form fields and continue.',
          card: { type: 'FLOW_DEFINITION', data: { workflowName: name, description } },
          timestamp: new Date().toISOString(),
        });
        return this.persist(session);
      }
      session.workflowName = name;
      session.description = description;
      session.currentState = 'SELECT_APPLICATION';
      this.promptApps(session, 'Choose the application to observe.');
      return this.persist(session);
    }

    if (session.currentState === 'CHOOSE_MODE') {
      const selected =
        this.resolveUiApp(session, chosenOptionId, userText) ||
        (await browserSessions.findAppForOpenTabs(this.listUiApps()));
      if (selected) {
        if (!session.workflowName) session.workflowName = `Flow for ${selected.name}`;
        await this.attachLiveObservation(session, selected);
        return this.persist(session);
      }
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: 'Choose Build automation or Run automation to continue.',
        options: [
          { id: 'mode-build', label: 'Build automation', description: 'Teach a new business flow from a live application', type: 'primary' },
          { id: 'mode-run', label: 'Run automation', description: 'Execute a published business flow', type: 'secondary' },
        ],
        timestamp: new Date().toISOString(),
      });
      return this.persist(session);
    }

    if (session.currentState === 'SELECT_APPLICATION') {
      const selected =
        this.resolveUiApp(session, chosenOptionId, userText) ||
        (await browserSessions.findAppForOpenTabs(this.listUiApps()));
      if (!selected) {
        this.promptApps(
          session,
          'Click Observe on the application below. That binds this chat and reads the live page.'
        );
        return this.persist(session);
      }
      await this.attachLiveObservation(session, selected);
      return this.persist(session);
    }

    if (chosenOptionId === 'table-wizard-back') {
      this.cancelTableWizard(session);
      return this.persist(session);
    }

    if (session.currentState === 'AWAIT_TABLE_KIND') {
      this.handleTableKind(session, chosenOptionId, userText);
      return this.persist(session);
    }

    if (session.currentState === 'AWAIT_FILTER') {
      this.handleFilterWizard(session, userText, chosenOptionId, payload);
      return this.persist(session);
    }

    if (session.currentState === 'AWAIT_ROW_ACTION') {
      const observation = await this.currentObservation(session);
      const intent = genericActionText(
        String(payload?.rowAction || chosenOptionId?.replace(/^row-act-(button|link|checkbox)-/, '') || userText)
      );
      this.applyRowAction(session, observation, intent);
      return this.persist(session);
    }

    if (session.currentState === 'AWAIT_PAGINATE') {
      const observation = this.currentObservation(session);
      const no =
        chosenOptionId === 'paginate-no' ||
        /^(no|this page)/i.test(userText.trim());
      if (no) {
        this.commitPendingRowAction(session, observation, false);
        return this.persist(session);
      }
      const yes =
        chosenOptionId === 'paginate-yes' || /^yes/i.test(userText.trim());
      if (yes) {
        this.askNextPageControl(session, observation);
        return this.persist(session);
      }
      this.commitPendingRowAction(session, observation, false);
      return this.persist(session);
    }

    if (session.currentState === 'AWAIT_NEXT_CONTROL') {
      const observation = this.currentObservation(session);
      if (
        chosenOptionId === 'paginate-no' ||
        /^(no|this page)/i.test(userText.trim())
      ) {
        this.commitPendingRowAction(session, observation, false);
        return this.persist(session);
      }
      this.applyChosenNextControl(session, observation, userText, chosenOptionId, payload);
      return this.persist(session);
    }

    if (session.currentState === 'TEST_FLOW' || session.currentState === 'BUILD_COMPLETE') {
      if (chosenOptionId?.startsWith('obs-') || chosenOptionId === 'cap-finish' || chosenOptionId === 'sem-assert-page') {
        session.currentState = 'WAIT_FOR_USER_SELECTION';
      } else if (this.isDeclineTest(userText, chosenOptionId)) {
        session.currentState = 'WAIT_FOR_USER_SELECTION';
        const observation = this.currentObservation(session);
        session.messages.push({
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: 'Back to mapping. Add another capability, or finish mapping when you want to test.',
          options: mappingOptions(session, observation),
          card: { type: 'OBSERVATION', data: { observation: observationForUi(observation) } },
          timestamp: new Date().toISOString(),
        });
        return this.persist(session);
      } else {
        session.messages.push({
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: `Mapping is finished. Reply "test" or "yes" and I will use the open "${db.getApplication(session.applicationId)?.name || 'app'}" window if it exists, or launch it, then run ${session.confirmedSteps.length} mapped capabilities in order.`,
          options: [
            { id: 'test-mapped', label: 'Test mapped capabilities', type: 'primary' },
            { id: 'resume-mapping', label: 'Add more capabilities', type: 'secondary' },
          ],
          timestamp: new Date().toISOString(),
        });
        return this.persist(session);
      }
    }

    if (
      session.currentState === 'WAIT_FOR_USER_SELECTION' ||
      session.currentState === 'SHOW_CAPABILITIES' ||
      session.currentState === 'OBSERVE_PAGE'
    ) {
      await this.handleCapabilityChoice(session, userText, chosenOptionId, payload);
    }

    return this.persist(session);
  }

  private persist(session: WorkflowBuildSession) {
    session.updatedAt = new Date().toISOString();
    db.saveBuildSession(session);
    emitExecutionEvent('BUILD_SESSION_UPDATED', { session });
    const last = session.messages[session.messages.length - 1];
    debugLog('F', 'agentBuildEngine.ts:persist', 'session saved', {
      state: session.currentState,
      lastCard: last?.card?.type || null,
      optionCount: last?.options?.length || 0,
      varControls: ((session.variables.lastObservation as ObservationResult | undefined)?.controls || []).length,
    });
    return session;
  }

  private listUiApps() {
    return db.getApplications().filter((a) => a.isActive && (a.applicationType || 'UI') === 'UI');
  }

  private resolveUiApp(
    session: WorkflowBuildSession,
    chosenOptionId?: string,
    userText?: string
  ) {
    const apps = this.listUiApps();
    if (chosenOptionId?.startsWith('app-select-')) {
      const selectedId = chosenOptionId.replace('app-select-', '');
      const fromOption = apps.find((a) => a.id === selectedId);
      if (fromOption) return fromOption;
    }

    const observing = chosenOptionId === 'obs-refresh' || /^re-?observe/i.test((userText || '').trim());

    if (!observing) {
      const text = (userText || '').trim().toLowerCase();
      if (text) {
        const fromName = apps.find(
          (a) => text === a.name.toLowerCase() || text.includes(a.name.toLowerCase())
        );
        if (fromName) return fromName;
      }
    }

    if (session.applicationId) {
      const bound = apps.find((a) => a.id === session.applicationId);
      if (bound) return bound;
    }

    if (observing) {
      const openIds = browserSessions.openApplicationIds();
      const openApp = apps.find((a) => openIds.includes(a.id));
      if (openApp) return openApp;
      const loopbackApp = apps.find((a) => isLoopbackUrl(a.loginUrl) || isLoopbackUrl(a.baseUrl));
      if (loopbackApp) return loopbackApp;
      if (apps.length === 1) return apps[0];
    }

    if (apps.length === 1) return apps[0];
    return undefined;
  }

  private async attachLiveObservation(
    session: WorkflowBuildSession,
    app: { id: string; name: string; baseUrl?: string; loginUrl?: string }
  ) {
    session.applicationId = app.id;
    try {
      const observation = await this.observeAndRecord(app.id);
      rememberObservation(session, observation);
      session.currentState = 'WAIT_FOR_USER_SELECTION';
      const emptyHint = observation.controls.length
        ? 'Choose a capability to add to the flow. Session stays on this page until you finish mapping.'
        : 'The browser opened, but this page has no interactive controls yet. Wait for the UI, then Re-observe.';
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: `${summarizeObservation(observation)}\n\n${emptyHint}`,
        options: mappingOptions(session, observation),
        card: { type: 'OBSERVATION', data: { observation: observationForUi(observation) } },
        timestamp: new Date().toISOString(),
      });
      debugLog('F', 'agentBuildEngine.ts:attachLiveObservation', 'session after observe persist-ready', {
        state: session.currentState,
        optionCount: session.messages[session.messages.length - 1]?.options?.length || 0,
        varControls: ((session.variables.lastObservation as ObservationResult | undefined)?.controls || []).length,
      });
    } catch (err) {
      session.currentState = 'SELECT_APPLICATION';
      const message = err instanceof Error ? err.message : String(err);
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: `Could not read "${app.name}" yet (${app.baseUrl || app.loginUrl || ''}). ${message}\n\nLaunch again, or Re-observe after the page is visible.`,
        options: [
          { id: `app-select-${app.id}`, label: `Launch ${app.name} again`, type: 'primary' },
          { id: 'act-register-app', label: 'Open Applications', type: 'secondary' },
        ],
        timestamp: new Date().toISOString(),
      });
    }
  }

  private promptApps(session: WorkflowBuildSession, preface?: string) {
    const apps = this.listUiApps();
    if (!apps.length) {
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: `${preface ? preface + '\n\n' : ''}No UI applications registered. Register one first.`,
        options: [{ id: 'act-register-app', label: 'Register application', type: 'primary' }],
        timestamp: new Date().toISOString(),
      });
      return;
    }
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: `${preface ? preface + '\n\n' : ''}Click an application below to observe the live page for "${session.workflowName || 'this flow'}".`,
      options: apps.map((app) => ({
        id: `app-select-${app.id}`,
        label: `Observe ${app.name}`,
        description: `${app.environment} · ${app.baseUrl}`,
        type: 'primary' as const,
      })),
      card: { type: 'APP_SELECTION', data: { apps } },
      timestamp: new Date().toISOString(),
    });
  }

  private async observeAndRecord(applicationId: string): Promise<ObservationResult> {
    const app = db.getApplication(applicationId);
    if (!app) throw new Error('Application not found');
    try {
      const observation = await browserSessions.observe(app);
      debugLog('E', 'agentBuildEngine.ts:observeAndRecord', 'observe returned to agent', {
        appId: applicationId,
        url: observation.url,
        title: observation.title,
        controls: observation.controls.length,
        tables: observation.tables.length,
        names: observation.controls.map((c) => c.accessibleName || c.visibleText || c.type).slice(0, 8),
      });
      return observation;
    } catch (err) {
      debugLog('E', 'agentBuildEngine.ts:observeAndRecord', 'observe threw', { appId: applicationId, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  private currentObservation(session: WorkflowBuildSession): ObservationResult {
    const cached = session.variables.lastObservation as ObservationResult | undefined;
    if (cached?.controls) return cached;
    return {
      url: '',
      title: '',
      headings: [],
      visibleTextSnippets: [],
      controls: [],
      tables: [],
      capturedAt: new Date().toISOString(),
      mode: 'LIVE_BROWSER',
    };
  }

  private tableColumns(session: WorkflowBuildSession, observation: ObservationResult): string[] {
    const meta = session.variables.tableMeta as TableMeta | undefined;
    return observation.tables[0]?.columns?.length ? observation.tables[0].columns : meta?.columns || [];
  }

  private wizardBackOptions() {
    return [WIZARD_BACK];
  }

  private cancelTableWizard(session: WorkflowBuildSession) {
    delete session.variables.tableWizard;
    delete session.variables.filterConfig;
    const observation = this.currentObservation(session);
    session.currentState = 'WAIT_FOR_USER_SELECTION';
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: 'Table wizard cancelled. Nothing was saved. Choose a page action.',
      options: mappingOptions(session, observation),
      card: { type: 'OBSERVATION', data: { observation: observationForUi(observation) } },
      timestamp: new Date().toISOString(),
    });
  }

  private matchingPreview(session: WorkflowBuildSession, observation: ObservationResult) {
    const table = observation.tables[0];
    const wizard = session.variables.tableWizard as TableWizard | undefined;
    const filter = session.variables.filterConfig as ConfirmedWorkflowStep['filterConfig'] | undefined;
    const conditions = filter?.conditions?.length
      ? filter.conditions
      : wizard?.column && wizard.operator && wizard.envName
        ? [{ column: wizard.column, operator: wizard.operator, value: wizard.envName }]
        : [];
    return previewMatchingActionableRows(table, conditions, 5);
  }

  private promptTableKind(session: WorkflowBuildSession, observation: ObservationResult) {
    session.variables.tableWizard = { step: 'kind' } satisfies TableWizard;
    session.currentState = 'AWAIT_TABLE_KIND';
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: 'Table found. This is several questions that become one capability. Do you want a row action (click matching rows) or extract the table?',
      options: [
        { id: 'table-kind-action', label: 'Row action', description: 'Filter optional, then click a row control', type: 'primary' },
        { id: 'table-kind-extract', label: 'Extract table', description: 'Read the table without clicking rows', type: 'secondary' },
        WIZARD_BACK,
      ],
      card: { type: 'TABLE_KIND', data: { columns: this.tableColumns(session, observation) } },
      timestamp: new Date().toISOString(),
    });
  }

  private handleTableKind(session: WorkflowBuildSession, chosenOptionId?: string, userText?: string) {
    const observation = this.currentObservation(session);
    if (chosenOptionId === 'table-kind-extract' || chosenOptionId === 'sem-extract-table' || /^extract/i.test(userText || '')) {
      this.applyTableExtract(session, observation);
      return;
    }
    if (chosenOptionId === 'table-kind-action' || chosenOptionId === 'sem-table' || /row action/i.test(userText || '')) {
      this.promptFilterAsk(session);
      return;
    }
    this.promptTableKind(session, observation);
  }

  private promptFilterAsk(session: WorkflowBuildSession) {
    session.variables.tableWizard = { step: 'filterAsk' } satisfies TableWizard;
    session.currentState = 'AWAIT_FILTER';
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: 'Filter matching rows before the click?',
      options: [
        { id: 'filter-yes', label: 'Yes, filter rows', type: 'primary' },
        { id: 'filter-no', label: 'No, all actionable rows', type: 'secondary' },
        WIZARD_BACK,
      ],
      timestamp: new Date().toISOString(),
    });
  }

  private handleFilterWizard(
    session: WorkflowBuildSession,
    userText: string,
    chosenOptionId?: string,
    payload?: Record<string, unknown>
  ) {
    const observation = this.currentObservation(session);
    const wizard = (session.variables.tableWizard as TableWizard & { step: string }) || { step: 'filterAsk' };
    const step = wizard.step;

    if (step === 'envValue') {
      const envName = wizard.envName || normalizeEnvName(String(payload?.envName || ''));
      if (envName && String(process.env[envName] || '').trim()) {
        this.applyTableFilter(session, observation, wizard.column || '', wizard.operator || 'EQUALS', envName);
        return;
      }
      session.variables.tableWizard = { ...wizard, step: 'envName' };
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: 'The agent does not save filter values. Choose the .env key that already holds the value (for example PAYOR).',
        options: [
          { id: 'filter-env-PAYOR', label: 'PAYOR', type: 'primary' as const, payload: { envName: 'PAYOR' } },
          WIZARD_BACK,
        ],
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (step === 'filterAsk') {
      if (chosenOptionId === 'filter-no' || /^no\b/i.test(userText)) {
        delete session.variables.filterConfig;
        this.promptRowClickPicker(session, observation);
        return;
      }
      this.promptFilterColumn(session, observation);
      return;
    }

    if (step === 'column') {
      const column = String(payload?.column || chosenOptionId?.replace(/^filter-col-/, '') || userText || '').trim();
      const columns = this.tableColumns(session, observation);
      const match = columns.find((c) => c.toLowerCase() === column.toLowerCase());
      if (!match) {
        this.promptFilterColumn(session, observation);
        return;
      }
      session.variables.tableWizard = { ...wizard, step: 'operator', column: match };
      session.currentState = 'AWAIT_FILTER';
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: `Condition for column "${match}"?`,
        options: [
          { id: 'filter-op-EQUALS', label: 'equals', type: 'primary' },
          { id: 'filter-op-NOT_EQUALS', label: 'not equals', type: 'secondary' },
          { id: 'filter-op-CONTAINS', label: 'contains', type: 'secondary' },
          WIZARD_BACK,
        ],
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (step === 'operator') {
      const raw = String(payload?.operator || chosenOptionId?.replace(/^filter-op-/, '') || userText || 'EQUALS').toUpperCase();
      const operator = (
        raw.includes('NOT') ? 'NOT_EQUALS' : raw.includes('CONTAIN') ? 'CONTAINS' : 'EQUALS'
      ) as FilterOperator;
      const column = wizard.column || '';
      const envGuess = /payor|payer/i.test(column) ? 'PAYOR' : column.replace(/\s+/g, '_').toUpperCase() || 'FILTER_VALUE';
      session.variables.tableWizard = { ...wizard, step: 'envName', operator };
      session.currentState = 'AWAIT_FILTER';
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: 'Which .env key already holds the filter value? Choose the key name only. The agent does not write .env.',
        options: Array.from(new Set(['PAYOR', envGuess, 'FILTER_VALUE']))
          .filter(Boolean)
          .map((name) => ({
            id: `filter-env-${name}`,
            label: name,
            type: name === 'PAYOR' || name === envGuess ? ('primary' as const) : ('secondary' as const),
            payload: { envName: name },
          }))
          .concat([WIZARD_BACK]),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (step === 'envName') {
      const envName = normalizeEnvName(
        String(payload?.envName || chosenOptionId?.replace(/^filter-env-/, '') || userText || '')
      );
      if (!envName) {
        session.messages.push({
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: 'Type or choose an existing .env key name (for example PAYOR). The agent will not write a value.',
          options: this.wizardBackOptions(),
          timestamp: new Date().toISOString(),
        });
        return;
      }
      const loaded = process.env[envName];
      if (loaded === undefined || String(loaded).trim() === '') {
        session.variables.tableWizard = { ...wizard, step: 'envName', envName };
        session.currentState = 'AWAIT_FILTER';
        session.messages.push({
          id: `msg-${uuidv4().slice(0, 8)}`,
          sender: 'agent',
          text: `${envName} is not set in .env. Add that key yourself, restart the Agent server, then choose ${envName} again. The agent does not write .env.`,
          options: Array.from(new Set(['PAYOR', envName, 'FILTER_VALUE']))
            .filter(Boolean)
            .map((name) => ({
              id: `filter-env-${name}`,
              label: name,
              type: 'primary' as const,
              payload: { envName: name },
            }))
            .concat([WIZARD_BACK]),
          timestamp: new Date().toISOString(),
        });
        return;
      }
      this.applyTableFilter(session, observation, wizard.column || '', wizard.operator || 'EQUALS', envName);
    }
  }

  private promptFilterColumn(session: WorkflowBuildSession, observation: ObservationResult) {
    const columns = this.tableColumns(session, observation);
    session.variables.tableWizard = {
      ...((session.variables.tableWizard as TableWizard) || {}),
      step: 'column',
    };
    session.currentState = 'AWAIT_FILTER';
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: 'Which column should match?',
      options: columns
        .map((col) => ({
          id: `filter-col-${col}`,
          label: col,
          type: 'primary' as const,
          payload: { column: col },
        }))
        .concat([WIZARD_BACK]),
      timestamp: new Date().toISOString(),
    });
  }

  private promptRowClickPicker(session: WorkflowBuildSession, observation: ObservationResult) {
    const preview = this.matchingPreview(session, observation);
    const fromPreview = distinctActionsFromPreview(preview);
    const actions = fromPreview.length ? fromPreview : distinctRowActions(observation.tables[0]);
    if (!actions.length) {
      session.currentState = 'WAIT_FOR_USER_SELECTION';
      delete session.variables.tableWizard;
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: 'No clickable buttons, links, or checkboxes in matching table rows. Re-observe after the table loads.',
        options: mappingOptions(session, observation),
        timestamp: new Date().toISOString(),
      });
      return;
    }
    session.currentState = 'AWAIT_ROW_ACTION';
    const filter = session.variables.filterConfig as ConfirmedWorkflowStep['filterConfig'] | undefined;
    const cond = filter?.conditions?.[0];
    const filterLine = cond
      ? `Filter stored: ${cond.column} ${cond.operator} process.env["${cond.value}"].\n`
      : 'No column filter.\n';
    const previewLines = preview.map((p) => p.line);
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: `${filterLine}Most matching actionable rows (up to 5). Choose a row control. This still saves as one capability.`,
      options: actions
        .map((a) => ({
          id: `row-act-${a.kind}-${a.label}`,
          label: `${a.kind} · ${a.label}`,
          description: `type ${a.kind}`,
          type: 'primary' as const,
          payload: { rowAction: a.label, kind: a.kind },
        }))
        .concat([WIZARD_BACK]),
      card: {
        type: 'ROW_ACTION_PICKER',
        data: { actions, preview: previewLines },
      },
      timestamp: new Date().toISOString(),
    });
  }

  private applyTableExtract(session: WorkflowBuildSession, observation: ObservationResult) {
    const table = observation.tables[0];
    const meta = session.variables.tableMeta as TableMeta | undefined;
    session.confirmedSteps.push({
      id: `step-${uuidv4().slice(0, 8)}`,
      name: 'Extract table',
      capabilityId: '',
      description: `Extract table ${table?.semanticName || meta?.semanticName || ''}`.trim(),
      verifiedOutcome: 'Table extract mapped',
      confidence: 1,
      testPassed: true,
    });
    delete session.variables.tableWizard;
    session.currentState = 'WAIT_FOR_USER_SELECTION';
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: 'Extract table step saved.',
      options: mappingOptions(session, observation, { includeTable: false }),
      timestamp: new Date().toISOString(),
    });
  }

  private applyTableFilter(
    session: WorkflowBuildSession,
    observation: ObservationResult,
    column: string,
    operator: FilterOperator,
    value: string
  ) {
    const meta = session.variables.tableMeta as TableMeta | undefined;
    session.variables.filterConfig = {
      table: observation.tables[0]?.id || meta?.tableId,
      conditions: [{ column, operator, value }],
    };
    this.promptRowClickPicker(session, observation);
  }

  private applyRowAction(session: WorkflowBuildSession, observation: ObservationResult, intentRaw: string) {
    const intent = genericActionText(intentRaw);
    const live = (session.variables.liveCapabilities as SemanticCapability[]) || [];
    let cap = live.find(
      (c) =>
        c.type === 'TABLE_ROW_ACTION' &&
        (c.businessName === intent || c.targetDefinition.semanticIntent === intent)
    );
    if (!cap) {
      const now = new Date().toISOString();
      const meta = session.variables.tableMeta as TableMeta | undefined;
      cap = {
        id: `cap-row-${uuidv4().slice(0, 8)}`,
        applicationId: session.applicationId,
        businessName: intent.slice(0, 80),
        type: 'TABLE_ROW_ACTION',
        pageContext: meta?.semanticName || observation.title,
        semanticDescription: `Row action "${intent}" with column filter`,
        targetDefinition: {
          semanticIntent: intent,
          visibleTextPattern: intent,
          role: 'button',
          controlType: 'button',
          isRowAction: true,
        },
        inputDefinition: [],
        outputDefinition: [],
        verificationDefinition: {
          expectedOutcome: `Row action ${intent} completed`,
          successCondition: {},
        },
        recoveryDefinition: {
          allowHumanRemapping: true,
          maxRetries: 2,
          onFailure: 'CONTINUE',
        },
        riskLevel: 'HIGH',
        version: 1,
        isPublished: true,
        isRetired: false,
        createdAt: now,
        updatedAt: now,
      };
      session.variables.liveCapabilities = [...live, cap];
    }
    if (!session.confirmedCapabilities.some((c) => c.id === cap!.id)) {
      session.confirmedCapabilities.push(cap);
    }
    const filterConfig = session.variables.filterConfig as ConfirmedWorkflowStep['filterConfig'];
    const cond = filterConfig?.conditions?.[0];
    const summary = cond
      ? `${cond.column} ${cond.operator} process.env["${cond.value}"] → click "${intent}"`
      : `Click "${intent}" on matching rows`;
    session.variables.pendingRowAction = {
      intent,
      capabilityId: cap.id,
      filterConfig,
      summary,
    };
    session.currentState = 'AWAIT_PAGINATE';
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: `Does this table have pagination (a Next page control) for row action "${intent}"?`,
      options: [
        { id: 'paginate-yes', label: 'Yes, pagination exists', type: 'primary' },
        { id: 'paginate-no', label: 'No, this page only', type: 'secondary' },
      ],
      timestamp: new Date().toISOString(),
    });
  }

  private askNextPageControl(session: WorkflowBuildSession, observation: ObservationResult) {
    const cands = paginationControlCandidates(observation);
    const suggested = cands.find((c) =>
      /next/i.test(c.accessibleName || c.visibleText || '')
    ) || cands[0];
    const suggestedName = suggested
      ? (suggested.accessibleName || suggested.visibleText || 'Next').trim()
      : '';
    session.currentState = 'AWAIT_NEXT_CONTROL';
    const options = [
      ...cands.map((c) => {
        const name = (c.accessibleName || c.visibleText || c.type || 'Control').trim();
        const isNext = /next/i.test(name) || name === '>' || name === '›' || name === '»';
        return {
          id: `paginate-ctrl-${c.id}`,
          label: isNext ? `${name} (Next)` : name,
          type: (isNext ? 'primary' : 'secondary') as 'primary' | 'secondary',
          payload: {
            nextName: name,
            nextSelector: c.selectorFallback || '',
          },
        };
      }),
      { id: 'paginate-no', label: 'No next button — this page only', type: 'secondary' as const },
    ];
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: suggestedName
        ? `Choose the Next button for this table. I see "${suggestedName}"${cands.length > 1 ? ` and ${cands.length - 1} other page control(s)` : ''}.`
        : 'I did not see a unique Next control on this table. Type the Next button name, or choose this page only.',
      options,
      timestamp: new Date().toISOString(),
    });
  }

  private applyChosenNextControl(
    session: WorkflowBuildSession,
    observation: ObservationResult,
    userText: string,
    chosenOptionId?: string,
    payload?: Record<string, unknown>
  ) {
    const pending = session.variables.pendingRowAction as
      | {
          intent: string;
          capabilityId: string;
          filterConfig?: ConfirmedWorkflowStep['filterConfig'];
          summary: string;
          nextName?: string;
          nextSelector?: string;
        }
      | undefined;
    if (pending) {
      const fromPayloadName = String(payload?.nextName || '').trim();
      const fromPayloadSel = String(payload?.nextSelector || '').trim();
      const cands = paginationControlCandidates(observation);
      const byId = chosenOptionId?.startsWith('paginate-ctrl-')
        ? cands.find((c) => `paginate-ctrl-${c.id}` === chosenOptionId)
        : undefined;
      const typed = userText.trim();
      const byName = typed
        ? cands.find((c) => {
            const name = (c.accessibleName || c.visibleText || '').trim();
            return name.toLowerCase() === typed.toLowerCase() || name.toLowerCase().includes(typed.toLowerCase());
          })
        : undefined;
      const picked = byId || byName;
      pending.nextName =
        fromPayloadName ||
        (picked ? (picked.accessibleName || picked.visibleText || '').trim() : '') ||
        typed;
      pending.nextSelector = fromPayloadSel || picked?.selectorFallback || '';
      session.variables.pendingRowAction = pending;
    }
    this.commitPendingRowAction(session, observation, Boolean(pending?.nextName));
  }

  private commitPendingRowAction(
    session: WorkflowBuildSession,
    observation: ObservationResult,
    paginateOnNext: boolean
  ) {
    const pending = session.variables.pendingRowAction as
      | {
          intent: string;
          capabilityId: string;
          filterConfig?: ConfirmedWorkflowStep['filterConfig'];
          summary: string;
          nextName?: string;
          nextSelector?: string;
        }
      | undefined;
    delete session.variables.pendingRowAction;
    delete session.variables.tableWizard;
    const intent = pending?.intent || 'Row action';
    const summary = pending?.summary || `Click "${intent}" on matching rows`;
    const step: ConfirmedWorkflowStep = {
      id: `step-${uuidv4().slice(0, 8)}`,
      name: `Table row action: ${intent}`,
      capabilityId: pending?.capabilityId || '',
      description: paginateOnNext ? `${summary} (including next pages)` : summary,
      verifiedOutcome: 'Capability stored',
      confidence: 0.9,
      testPassed: true,
      rowActionIntent: intent,
      filterConfig: pending?.filterConfig,
      paginateOnNext,
      nextPageName: paginateOnNext ? pending?.nextName : undefined,
      nextPageSelector: paginateOnNext ? pending?.nextSelector : undefined,
    };
    session.confirmedSteps.push(step);
    delete session.variables.tableWizard;
    session.currentState = 'WAIT_FOR_USER_SELECTION';
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: paginateOnNext
        ? `Stored one table row action capability.\n${summary}\nFollowing pages: yes (click "${pending?.nextName || 'Next'}").\n\nFinish mapping, or add another page action.`
        : `Stored one table row action capability.\n${summary}\n\nFinish mapping, or add another page action.`,
      options: mappingOptions(session, observation),
      card: {
        type: 'CAPABILITY_TEST',
        data: { outcome: summary, confidence: 1, stored: true },
      },
      timestamp: new Date().toISOString(),
    });
  }

  private async handleCapabilityChoice(
    session: WorkflowBuildSession,
    userText: string,
    chosenOptionId?: string,
    payload?: Record<string, unknown>
  ) {
    const app = db.getApplication(session.applicationId);
    if (!app) return;

    if (chosenOptionId === 'cap-finish' || /finish|done/i.test(userText)) {
      this.completeWorkflow(session);
      return;
    }
    if (chosenOptionId === 'obs-refresh' || /re-observe|refresh/i.test(userText)) {
      const observation = await this.observeAndRecord(app.id);
      rememberObservation(session, observation);
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: `Re-observed.\n\n${summarizeObservation(observation)}`,
        options: mappingOptions(session, observation),
        card: { type: 'OBSERVATION', data: { observation: observationForUi(observation) } },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (chosenOptionId === 'sem-assert-page') {
      const observation = await this.currentObservation(session);
      session.confirmedSteps.push({
        id: `step-${uuidv4().slice(0, 8)}`,
        name: 'Validate page',
        capabilityId: '',
        description: `Assert page "${observation.title}" at ${observation.url}`,
        verifiedOutcome: 'Page present',
        confidence: 1,
        testPassed: true,
      });
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: `Page validation saved for "${observation.title}".`,
        options: mappingOptions(session, observation),
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (chosenOptionId === 'sem-table' || chosenOptionId === 'table-kind-action') {
      const observation = await this.currentObservation(session);
      this.promptTableKind(session, observation);
      return;
    }
    if (chosenOptionId === 'sem-extract-table' || chosenOptionId === 'table-kind-extract') {
      const observation = await this.currentObservation(session);
      this.applyTableExtract(session, observation);
      return;
    }
    if (chosenOptionId?.startsWith('row-act-') || payload?.rowAction) {
      const observation = await this.currentObservation(session);
      const intent = genericActionText(
        String(payload?.rowAction || chosenOptionId?.replace(/^row-act-(button|link|checkbox)-/, '') || userText)
      );
      this.applyRowAction(session, observation, intent);
      return;
    }

    const observation = await this.currentObservation(session);
    const controlId = chosenOptionId?.replace('obs-', '');
    const control =
      observation.controls.find((c) => c.id === controlId) ||
      observation.controls.find((c) =>
        (c.accessibleName || c.visibleText || '').toLowerCase().includes(userText.trim().toLowerCase())
      );
    if (!control?.selectorFallback) {
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: 'Choose one of the listed semantic capabilities.',
        options: mappingOptions(session, observation),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const label = control.accessibleName || control.visibleText || control.type;
    const purpose = control.semanticPurpose || '';
    if (session.confirmedSteps.some((s) => s.selectorFallback === control.selectorFallback)) {
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: `"${label}" is already in this flow (${session.confirmedSteps.length} step(s)). Pick another capability or finish mapping.`,
        options: mappingOptions(session, observation),
        card: { type: 'OBSERVATION', data: { observation: observationForUi(observation) } },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    let cap = adoptSelectedCapability(session, control.selectorFallback);
    if (!cap) {
      cap = capabilitiesFromObservation(session.applicationId, {
        ...observation,
        controls: [control],
        tables: [],
      })[0];
      if (cap) session.confirmedCapabilities.push(cap);
    }
    const stepName =
      purpose === 'username' ? 'Enter username' : purpose === 'password' ? 'Enter password' : `Use ${label}`;
    session.confirmedSteps.push({
      id: `step-${uuidv4().slice(0, 8)}`,
      name: stepName,
      capabilityId: cap?.id || '',
      description: `Mapped control "${label}" (${control.type})`,
      verifiedOutcome: `Will ${stepName.toLowerCase()} on live page during test`,
      confidence: 0.9,
      testPassed: false,
      selectorFallback: control.selectorFallback,
    });
    session.currentState = 'WAIT_FOR_USER_SELECTION';
    const mapped = session.confirmedSteps.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: `Added "${stepName}" to the flow. Session is held — pick the next capability or finish mapping.\n\nMapped steps:\n${mapped}`,
      options: mappingOptions(session, observation),
          card: { type: 'OBSERVATION', data: { observation: observationForUi(observation) } },
      timestamp: new Date().toISOString(),
    });
  }

  private discardUnsavedBusinessFlows(session: WorkflowBuildSession) {
    const name = (session.workflowName || '').trim().toLowerCase();
    const draftId = String(session.variables.draftFlowId || '');
    for (const flow of db.getFlows()) {
      const sameDraft = draftId && flow.id === draftId;
      const sameName = name && flow.name.trim().toLowerCase() === name;
      const unpublished = flow.status !== 'PRODUCTION' && !flow.isRetired;
      if ((sameDraft || sameName) && unpublished) {
        db.deleteFlow(flow.id);
      }
    }
    delete session.variables.draftFlowId;
  }

  private compilePendingFlow(session: WorkflowBuildSession): BusinessFlow {
    const existing = session.variables.pendingFlow as BusinessFlow | undefined;
    const flowId = existing?.id || `flow-${Date.now().toString().slice(-6)}`;
    return {
      id: flowId,
      applicationId: session.applicationId || db.getApplications()[0]?.id || '',
      name: session.workflowName || 'Untitled flow',
      description: session.description || '',
      status: 'DRAFT',
      version: 1,
      latestTestStatus: 'PENDING',
      failurePolicy: 'CONTINUE',
      isRetired: false,
      variables: [],
      nodes: [
        { id: 'n-start', type: 'START', position: { x: 50, y: 150 }, data: { label: 'Start' } },
        ...session.confirmedSteps.map((st, i): FlowNode => ({
          id: `n-${i + 1}`,
          type: st.filterConfig || st.rowActionIntent ? 'TABLE_PROCESS' : 'CAPABILITY',
          position: { x: 240 + i * 220, y: 150 },
          data: {
            label: st.name,
            capabilityId: st.capabilityId,
            description: st.description,
            filterConfig: st.filterConfig,
            rowActionIntent: st.rowActionIntent,
            paginateOnNext: st.paginateOnNext,
            nextPageName: st.nextPageName,
            nextPageSelector: st.nextPageSelector,
          },
        })),
        {
          id: 'n-close',
          type: 'CLOSE_BROWSER',
          position: { x: 240 + session.confirmedSteps.length * 220, y: 150 },
          data: { label: 'Close browser' },
        },
        {
          id: 'n-end',
          type: 'END',
          position: { x: 240 + (session.confirmedSteps.length + 1) * 220, y: 150 },
          data: { label: 'End' },
        },
      ],
      edges: [
        { id: 'e-0', source: 'n-start', target: 'n-1' },
        ...session.confirmedSteps.slice(0, -1).map((_, i) => ({
          id: `e-${i + 1}`,
          source: `n-${i + 1}`,
          target: `n-${i + 2}`,
        })),
        {
          id: 'e-close',
          source: `n-${session.confirmedSteps.length}`,
          target: 'n-close',
        },
        { id: 'e-end', source: 'n-close', target: 'n-end' },
      ],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private persistConfirmedFlow(session: WorkflowBuildSession) {
    this.discardUnsavedBusinessFlows(session);
    const compiled = this.compilePendingFlow(session);
    compiled.status = 'PRODUCTION';
    compiled.latestTestStatus = 'SUCCESS';
    db.createFlow(compiled);
    persistTaughtCapabilities(session.confirmedCapabilities || []);
    session.variables.draftFlowId = compiled.id;
    session.variables.pendingFlow = compiled;
    session.currentState = 'BUILD_COMPLETE';
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: `Saved. "${compiled.name}" and ${session.confirmedCapabilities.length} capability(ies) are in MySQL and available in RUN. Open Capabilities or Business Flows, or Run it from the Agent. Run launches the app once and keeps that browser session across every mapped step.`,
      options: [
        { id: 'mode-run', label: 'Run this flow', type: 'primary' },
        { id: 'view-capabilities', label: 'Open Capabilities', type: 'secondary' },
        { id: 'view-flows', label: 'Open Business Flows', type: 'secondary' },
        { id: 'mode-build-new', label: 'Build another', type: 'secondary' },
      ],
      timestamp: new Date().toISOString(),
    });
  }

  private completeWorkflow(session: WorkflowBuildSession) {
    const observation = this.currentObservation(session);
    if (!session.confirmedSteps.length) {
      session.currentState = 'WAIT_FOR_USER_SELECTION';
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: 'Add at least one capability to the flow before finishing.',
        options: mappingOptions(session, observation),
        card: { type: 'OBSERVATION', data: { observation: observationForUi(observation) } },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    session.currentState = 'TEST_FLOW';
    this.discardUnsavedBusinessFlows(session);
    const compiledFlow = this.compilePendingFlow(session);
    session.variables.pendingFlow = compiledFlow;
    session.currentState = 'TEST_FLOW';
    const order = session.confirmedSteps.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: `Mapping finished for "${compiledFlow.name}". Nothing is saved to MySQL yet.\n\nShould I test now? Reply "test" or "yes". I will use the open app window if it exists, or launch it, then run these capabilities in order:\n${order}\n\nAfter a successful test, reply "save" to store Capabilities and the Business Flow.`,
      options: [
        { id: 'test-mapped', label: 'Test mapped capabilities', type: 'primary' },
        { id: 'resume-mapping', label: 'Add more capabilities', type: 'secondary' },
      ],
      timestamp: new Date().toISOString(),
    });
  }

  private isSaveAsk(userText: string, session: WorkflowBuildSession) {
    if (session.currentState !== 'TEST_FLOW' && session.currentState !== 'BUILD_COMPLETE') return false;
    return /^(save)\b/.test((userText || '').trim().toLowerCase());
  }

  private isSaveIntent(userText: string, session: WorkflowBuildSession) {
    if (session.currentState !== 'TEST_FLOW' && session.currentState !== 'BUILD_COMPLETE') return false;
    const t = (userText || '').trim().toLowerCase();
    return /^(save|confirm save|confirm)\b/.test(t);
  }

  private isAffirmativeTest(userText?: string, chosenOptionId?: string) {
    if (chosenOptionId === 'test-mapped') return true;
    const t = (userText || '').trim().toLowerCase();
    if (!t) return false;
    if (this.isDeclineTest(t, chosenOptionId)) return false;
    return /^(yes|y|ok|okay|sure|test|go|run|please|do it)\b/.test(t) || /\b(test|run it|start test|execute)\b/.test(t);
  }

  private isDeclineTest(userText?: string, chosenOptionId?: string) {
    if (chosenOptionId === 'resume-mapping') return true;
    const t = (userText || '').trim().toLowerCase();
    return /^(no|nope|not now|later|cancel|skip|add more)\b/.test(t);
  }

  private async testMappedCapabilities(session: WorkflowBuildSession) {
    const app = db.getApplication(session.applicationId);
    if (!app) {
      session.currentState = 'SELECT_APPLICATION';
      this.promptApps(session, 'Choose the application to test, then reply "test" again.');
      return;
    }
    if (!session.confirmedSteps.length) {
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: 'There are no mapped capabilities to test yet.',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    let opened = false;
    try {
      const acquired = await browserSessions.acquirePage(app);
      opened = true;
      const order = session.confirmedSteps.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: acquired.reused
          ? `Using the already open "${app.name}" window (${acquired.url}). Performing ${session.confirmedSteps.length} capabilities in mapped order:\n${order}`
          : `Launched "${app.name}" (${acquired.url}). Performing ${session.confirmedSteps.length} capabilities in mapped order:\n${order}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: `Could not open "${app.name}": ${message}. Launch the app and reply "test" again.`,
        options: [{ id: 'test-mapped', label: 'Test again', type: 'primary' }],
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
    const lines: string[] = [];
    const executionId = `TEST-${session.id.slice(-8)}`;
    orchestrator.registerExecution(executionId);
    emitExecutionEvent('FLOW_STARTED', {
      executionId,
      flowName: session.workflowName,
      mode: 'TEST',
    });
    let stopped = false;
    for (const step of session.confirmedSteps) {
      if (orchestrator.isStopRequested(executionId)) {
        stopped = true;
        break;
      }
      const cap = session.confirmedCapabilities.find((c) => c.id === step.capabilityId);
      const selector = step.selectorFallback || cap?.targetDefinition.selectorFallback;
      emitExecutionEvent('STEP_STARTED', {
        executionId,
        stepId: step.id,
        stepName: step.name,
      });
      if (step.filterConfig && !step.rowActionIntent) {
        const obs = await browserSessions.observe(app);
        const matched =
          obs.tables[0]?.rows.filter((r) => rowMatchesFilters(r.cells, step.filterConfig!.conditions)) || [];
        step.testPassed = true;
        lines.push(`• ${step.name}: ${matched.length} matching rows`);
        emitExecutionEvent('STEP_COMPLETED', { executionId, stepId: step.id, stepName: step.name, status: 'SUCCESS' });
        continue;
      }
      if (step.rowActionIntent) {
        const loop = await clickActionOnMatchingRows(app, {
          actionIntent: step.rowActionIntent,
          conditions: step.filterConfig?.conditions || [],
          executionId,
          session,
          shouldStop: () => orchestrator.isStopRequested(executionId),
          paginateOnNext: step.paginateOnNext,
          nextPageName: step.nextPageName,
          nextPageSelector: step.nextPageSelector,
        });
        step.testPassed = loop.attempted > 0 && loop.failed === 0;
        lines.push(
          `• ${step.name}: clicked "${step.rowActionIntent}" on ${loop.passed}/${loop.attempted} matching rows`
        );
        lines.push(...loop.lines);
        emitExecutionEvent('STEP_COMPLETED', {
          executionId,
          stepId: step.id,
          stepName: step.name,
          status: step.testPassed ? 'SUCCESS' : 'FAILED',
        });
        if (orchestrator.isStopRequested(executionId)) {
          stopped = true;
          break;
        }
        continue;
      }
      if (!selector) {
        lines.push(`• ${step.name}: skipped (no live control to replay)`);
        emitExecutionEvent('STEP_COMPLETED', { executionId, stepId: step.id, stepName: step.name, status: 'FAILED' });
        continue;
      }
      try {
        if (cap?.type === 'ENTER') {
          const purpose = `${cap.targetDefinition.semanticIntent || ''} ${step.name || ''}`.toLowerCase();
          let value = '';
          if (/user|email/.test(purpose) && app.usernameEnvVar && process.env[app.usernameEnvVar]) {
            value = process.env[app.usernameEnvVar] as string;
          } else if (/pass/.test(purpose) && app.passwordEnvVar && process.env[app.passwordEnvVar]) {
            value = process.env[app.passwordEnvVar] as string;
          }
          if (value.trim()) await browserSessions.fill(app, selector, value);
        } else {
          const name = cap?.targetDefinition.accessibleNamePattern || cap?.targetDefinition.semanticIntent || step.name;
          const remembered = recoveryEngine.lookupResolvedTarget(app.id, name);
          let clickName = remembered || name;
          let clickSelector = selector;
          let clicked = false;
          let pendingSave: string | undefined;
          for (let tryCount = 0; tryCount < 4 && !clicked; tryCount++) {
            try {
              await browserSessions.clickByName(app, clickName, clickSelector);
              clicked = true;
            } catch (err) {
              const lastError = err instanceof Error ? err.message : String(err);
              const obs = await browserSessions.observe(app);
              const human = await askClickRecovery({
                app,
                intent: name,
                executionId,
                session,
                obs,
                lastError,
              });
              if (human.action === 'STOP' || orchestrator.isStopRequested(executionId)) {
                stopped = true;
                break;
              }
              if (human.action === 'SKIP') {
                throw err;
              }
              if (human.action !== 'RETRY') {
                clickName = human.name;
                clickSelector = human.selector || clickSelector;
                if (human.remapped) pendingSave = human.name;
              }
            }
          }
          if (stopped) break;
          if (!clicked) throw new Error('Click was not confirmed');
          if (pendingSave) {
            recoveryEngine.recordSuccessfulMapping({
              applicationId: app.id,
              pageContext: '',
              originalTarget: name,
              resolvedTarget: pendingSave,
            });
          }
        }
        step.testPassed = true;
        lines.push(`• ${step.name}: passed`);
        emitExecutionEvent('STEP_COMPLETED', { executionId, stepId: step.id, stepName: step.name, status: 'SUCCESS' });
      } catch (err) {
        step.testPassed = false;
        const message = err instanceof Error ? err.message : String(err);
        lines.push(`• ${step.name}: failed (${message})`);
        emitExecutionEvent('STEP_COMPLETED', { executionId, stepId: step.id, stepName: step.name, status: 'FAILED' });
      }
    }
    emitExecutionEvent('EXECUTION_COMPLETED', { executionId, status: stopped ? 'STOPPED' : 'COMPLETED' });
    session.currentState = 'TEST_FLOW';
    if (!stopped) {
    const passed = session.confirmedSteps.filter((s) => s.testPassed).length;
    const allPassed = passed === session.confirmedSteps.length && session.confirmedSteps.length > 0;
    const pending = (session.variables.pendingFlow as BusinessFlow | undefined) || this.compilePendingFlow(session);
    pending.latestTestStatus = allPassed ? 'SUCCESS' : 'FAILED';
    session.variables.pendingFlow = pending;
    session.messages.push({
      id: `msg-${uuidv4().slice(0, 8)}`,
      sender: 'agent',
      text: allPassed
        ? `Test finished: ${passed}/${session.confirmedSteps.length} mapped steps passed.\n${lines.join('\n')}\n\nThe business flow is not in MySQL yet. Choose Save, then confirm.`
        : `Test finished: ${passed}/${session.confirmedSteps.length} mapped steps passed.\n${lines.join('\n')}\n\nFix mapping or test again. Save is offered only after every step passes.`,
      options: allPassed
        ? [
            { id: 'save-flow', label: 'Save flow', type: 'primary' },
            { id: 'test-mapped', label: 'Test again', type: 'secondary' },
            { id: 'resume-mapping', label: 'Add more capabilities', type: 'secondary' },
          ]
        : [
            { id: 'test-mapped', label: 'Test again', type: 'primary' },
            { id: 'resume-mapping', label: 'Fix mapping', type: 'secondary' },
          ],
      timestamp: new Date().toISOString(),
    });
    } else {
      const pending = (session.variables.pendingFlow as BusinessFlow | undefined) || this.compilePendingFlow(session);
      pending.latestTestStatus = 'FAILED';
      session.variables.pendingFlow = pending;
      session.messages.push({
        id: `msg-${uuidv4().slice(0, 8)}`,
        sender: 'agent',
        text: 'Choose Test again when you are ready.',
        options: [
          { id: 'test-mapped', label: 'Test again', type: 'primary' },
          { id: 'resume-mapping', label: 'Fix mapping', type: 'secondary' },
        ],
        timestamp: new Date().toISOString(),
      });
    }
    } finally {
      const keepBrowser = orchestrator.isStopRequested(executionId);
      if (opened && !keepBrowser) await browserSessions.close(app.id).catch(() => undefined);
      orchestrator.clearExecution(executionId);
    }
  }

  resetBuildSession(): WorkflowBuildSession {
    const session = db.getActiveBuildSession();
    if (session) db.deleteBuildSession(session.id);
    return this.startSession();
  }
}

export const agentBuildEngine = new AgentBuildEngine();
