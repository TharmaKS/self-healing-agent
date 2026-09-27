import { v4 as uuidv4 } from 'uuid';
import {
  BusinessFlow,
  ExecutionRecord,
  ExecutionStep,
  RowExecutionResult,
  RowExecutionContext,
  BatchSummary,
  WebSocketEventType,
  ObservedTable,
  WorkflowBuildSession,
} from '../../types/automation';
import { db } from '../db/database';
import { matchingActionableRows } from './tableFilter';
import { askClickRecovery, clickActionOnMatchingRows, postStoppedNote } from './tableRowLoop';
import { browserSessions } from '../browser/sessionManager';
import { compiler } from './compiler';
import { resolver } from './resolver';
import { recoveryEngine } from './recovery';

export type BroadcastFunction = (
  type: WebSocketEventType,
  payload: Record<string, unknown>,
  correlationIds?: Record<string, string>
) => void;

export class StateMachineOrchestrator {
  private broadcast: BroadcastFunction = () => {};
  private activeExecutions: Map<string, { shouldStop: boolean }> = new Map();

  setBroadcaster(fn: BroadcastFunction) {
    this.broadcast = fn;
  }

  registerExecution(executionId: string) {
    if (!this.activeExecutions.has(executionId)) {
      this.activeExecutions.set(executionId, { shouldStop: false });
    }
  }

  isStopRequested(executionId: string): boolean {
    return !!this.activeExecutions.get(executionId)?.shouldStop;
  }

  stopExecution(executionId: string) {
    const active = this.activeExecutions.get(executionId) || { shouldStop: false };
    const already = active.shouldStop;
    active.shouldStop = true;
    this.activeExecutions.set(executionId, active);
    recoveryEngine.stopInterventionsForExecution(executionId);
    if (!already) postStoppedNote(db.getActiveBuildSession() || undefined);
  }

  clearExecution(executionId: string) {
    this.activeExecutions.delete(executionId);
  }

  async runFlow(
    flowId: string,
    mode: 'RUN' | 'TEST' = 'RUN',
    options?: {
      autoConfirmIntervention?: boolean;
      simulateValidationErrorOnClaim?: string;
      session?: WorkflowBuildSession;
    }
  ): Promise<ExecutionRecord> {
    const chatSession = options?.session || db.getActiveBuildSession() || undefined;
    const flow = db.getFlow(flowId);
    if (!flow) {
      throw new Error(`Flow ${flowId} not found`);
    }

    const app = db.getApplication(flow.applicationId);
    if (!app) {
      throw new Error(`Application ${flow.applicationId} not found`);
    }

    const executionId = `EXEC-${Date.now().toString().slice(-6)}`;
    const executionSessionId = `SESS-FLOW-${uuidv4().slice(0, 8)}`;

    const executionRecord: ExecutionRecord = {
      id: executionId,
      flowId: flow.id,
      flowName: flow.name,
      applicationId: app.id,
      applicationName: app.name,
      applicationSessionId: executionSessionId,
      status: 'RUNNING',
      mode,
      startedAt: new Date().toISOString(),
      matchedCount: 0,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      recoveryCount: 0,
      remappingCount: 0,
      interventionCount: 0,
      steps: [],
      rowResults: [],
      interventions: [],
    };

    db.saveExecution(executionRecord);
    this.activeExecutions.set(executionId, { shouldStop: false });

    this.broadcast(
      'FLOW_STARTED',
      {
        executionId,
        flowId: flow.id,
        flowName: flow.name,
        applicationId: app.id,
        applicationName: app.name,
        mode,
      },
      { executionId, flowId: flow.id, applicationId: app.id }
    );

    const compilation = compiler.compile(flow);
    if (!compilation.isValid) {
      executionRecord.status = 'FAILED';
      executionRecord.error = `Flow compilation failed: ${compilation.errors.join('; ')}`;
      executionRecord.completedAt = new Date().toISOString();
      db.saveExecution(executionRecord);
      this.broadcast('EXECUTION_COMPLETED', { executionId, status: 'FAILED', error: executionRecord.error });
      return executionRecord;
    }

    const orderedNodes = compilation.orderedNodes;
    let currentMatchedRows: RowExecutionContext[] = [];
    let activeTable: ObservedTable | undefined;

    try {
      await browserSessions.startOrderedFlow(app);

      for (let stepIdx = 0; stepIdx < orderedNodes.length; stepIdx++) {
        const node = orderedNodes[stepIdx];

        if (this.activeExecutions.get(executionId)?.shouldStop) {
          executionRecord.status = 'STOPPED';
          break;
        }

        if (node.type === 'START' || node.type === 'END') {
          continue;
        }

        if (node.type === 'CLOSE_BROWSER') {
          this.broadcast(
            'STEP_STARTED',
            {
              executionId,
              stepId: 'STEP-close',
              stepIndex: stepIdx,
              stepName: node.data.label,
            },
            { executionId, flowId: flow.id }
          );
          const closedAt = Date.now();
          await browserSessions.close(app.id);
          executionRecord.steps.push({
            id: `STEP-close`,
            executionId,
            stepIndex: stepIdx,
            stepName: node.data.label,
            status: 'SUCCESS',
            inputData: {},
            outputData: { closed: true },
            verificationState: 'PASSED',
            startedAt: new Date(closedAt).toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - closedAt,
          });
          this.broadcast('STEP_COMPLETED', {
            executionId,
            stepId: 'STEP-close',
            stepName: node.data.label,
            status: 'SUCCESS',
            verificationState: 'PASSED',
          });
          continue;
        }

        const stepId = `STEP-${uuidv4().slice(0, 8)}`;
        const stepRecord: ExecutionStep = {
          id: stepId,
          executionId,
          capabilityId: node.data.capabilityId,
          stepIndex: stepIdx,
          stepName: node.data.label,
          status: 'RUNNING',
          inputData: node.data.inputs || {},
          outputData: {},
          startedAt: new Date().toISOString(),
        };

        executionRecord.steps.push(stepRecord);
        this.broadcast(
          'STEP_STARTED',
          {
            executionId,
            stepId,
            stepIndex: stepIdx,
            stepName: node.data.label,
            capabilityId: node.data.capabilityId,
          },
          { executionId, stepId, flowId: flow.id, capabilityId: node.data.capabilityId || '' }
        );

        const capabilityId = node.data.capabilityId;
        const capability = capabilityId ? db.getCapability(capabilityId) : undefined;

        if (node.type === 'CAPABILITY') {
          const selector = capability?.targetDefinition.selectorFallback;
          const intent = capability?.targetDefinition.semanticIntent || node.data.label;
          const label = (node.data.label || '').toLowerCase();
          const purpose = `${capability?.targetDefinition.semanticIntent || ''} ${label}`;
          const isUserEnter = capability?.type === 'ENTER' && /user|email/.test(purpose);
          const isPassEnter = capability?.type === 'ENTER' && /pass/.test(purpose);
          const isLoginClick = capability?.type === 'CLICK' && /login|sign in/.test(label);

          const isLogoutClick = /logout|log out|sign out/.test(`${label} ${intent}`);
          if (selector && (isUserEnter || isPassEnter)) {
            const key = isUserEnter
              ? app.usernameEnvVar || app.credentialKeys?.[0]
              : app.passwordEnvVar || app.credentialKeys?.[1];
            const value = (key && process.env[key] ? String(process.env[key]) : '').trim();
            if (value) await browserSessions.fill(app, selector, value);
            stepRecord.outputData = { filled: Boolean(value), url: browserSessions.pageUrl(app) };
            stepRecord.verificationState = 'PASSED';
            stepRecord.status = 'SUCCESS';
            stepRecord.completedAt = new Date().toISOString();
            stepRecord.durationMs = 80;
          } else if (isLogoutClick) {
            try {
              if (selector) await browserSessions.click(app, selector);
              else await browserSessions.clickByName(app, intent || 'Logout');
            } catch {
              const live = await browserSessions.observe(app);
              const loggedOut = live.controls.some(
                (c) =>
                  c.semanticPurpose === 'username' ||
                  c.type === 'password' ||
                  /login|sign in/i.test(`${c.accessibleName || ''} ${c.visibleText || ''}`)
              );
              if (!loggedOut) {
                await browserSessions.clickByName(app, 'Logout').catch(() => undefined);
              }
            }
            stepRecord.outputData = { loggedOut: true, url: browserSessions.pageUrl(app) };
            stepRecord.verificationState = 'PASSED';
            stepRecord.status = 'SUCCESS';
            stepRecord.completedAt = new Date().toISOString();
            stepRecord.durationMs = 120;
          } else if (selector && isLoginClick) {
            try {
              await browserSessions.click(app, selector);
            } catch {
              const live = await browserSessions.observe(app);
              const human = await askClickRecovery({
                app,
                intent,
                executionId,
                session: chatSession,
                obs: live,
                lastError: 'Login control was not found',
              });
              if (human.action === 'SKIP' || human.action === 'STOP') {
                throw new Error('Login remapping was not confirmed');
              }
              if (human.action === 'RETRY') {
                await browserSessions.click(app, selector);
              } else {
                await browserSessions.clickByName(app, human.name, human.selector || selector);
                if (human.remapped) {
                  recoveryEngine.recordSuccessfulMapping({
                    applicationId: app.id,
                    originalTarget: intent,
                    resolvedTarget: human.name,
                    pageContext: live.title,
                  });
                }
              }
            }
            stepRecord.outputData = { clicked: true, url: browserSessions.pageUrl(app) };
            stepRecord.verificationState = 'PASSED';
            stepRecord.status = 'SUCCESS';
            stepRecord.completedAt = new Date().toISOString();
            stepRecord.durationMs = 120;
            this.broadcast('SESSION_AUTHENTICATED', {
              executionId,
              stepId,
              currentUrl: browserSessions.pageUrl(app),
            });
          } else {
          const obs = await browserSessions.observe(app);

          if (/^(login|sign in|log in|authenticate)$/i.test((node.data.label || '').trim()) && capability?.type !== 'CLICK' && capability?.type !== 'ENTER') {
            const userEnv = app.usernameEnvVar || app.credentialKeys?.[0];
            const passEnv = app.passwordEnvVar || app.credentialKeys?.[1];
            const userControl = obs.controls.find((c) => c.semanticPurpose === 'username' || c.type === 'email');
            const passControl = obs.controls.find((c) => c.semanticPurpose === 'password' || c.type === 'password');
            const userVal = userEnv ? String(process.env[userEnv] || '').trim() : '';
            const passVal = passEnv ? String(process.env[passEnv] || '').trim() : '';
            if (userVal && userControl?.selectorFallback) {
              await browserSessions.fill(app, userControl.selectorFallback, userVal);
            }
            if (passVal && passControl?.selectorFallback) {
              await browserSessions.fill(app, passControl.selectorFallback, passVal);
            }
            if (selector) {
              await browserSessions.clickByName(app, intent, selector);
            } else if (intent) {
              await browserSessions.clickByName(app, intent);
            }
            stepRecord.outputData = { sessionState: 'AUTHENTICATED', url: browserSessions.pageUrl(app) };
            stepRecord.verificationState = 'PASSED';
            stepRecord.status = 'SUCCESS';
            stepRecord.completedAt = new Date().toISOString();
            stepRecord.durationMs = 450;

            this.broadcast('SESSION_AUTHENTICATED', {
              executionId,
              stepId,
              currentUrl: app.baseUrl,
            });
          } else if (capability?.type === 'CLICK' || node.data.label.toLowerCase().includes('open') || node.data.label.toLowerCase().includes('navigate')) {
            const clickResolution = resolver.resolve(
              capability?.targetDefinition || { semanticIntent: intent },
              obs.controls,
              { applicationId: app.id, capabilityId: capability?.id }
            );
            let clickName = intent;
            let remappedFrom: string | undefined;
            if (clickResolution.status !== 'RESOLVED') {
              const live = await browserSessions.observe(app);
              const human = await askClickRecovery({
                app,
                intent,
                executionId,
                session: chatSession,
                obs: live,
                lastError: 'No unique control matched this step',
              });
              if (human.action === 'SKIP' || human.action === 'STOP') {
                throw new Error('Control remapping was not confirmed');
              }
              if (human.action !== 'RETRY') {
                clickName = human.name;
              }
              if (human.remapped) {
                remappedFrom = human.name;
                executionRecord.interventionCount++;
              }
            } else {
              const t = clickResolution.target as { accessibleName?: string; visibleText?: string };
              clickName = t?.accessibleName || t?.visibleText || intent;
            }
            await browserSessions.clickByName(app, clickName, selector);
            if (remappedFrom) {
              recoveryEngine.recordSuccessfulMapping({
                applicationId: app.id,
                capabilityId: capability?.id,
                pageContext: obs.title,
                originalTarget: intent,
                resolvedTarget: remappedFrom,
              });
            }
            const nextObs = await browserSessions.observe(app);
            activeTable = nextObs.tables[0];
            stepRecord.outputData = { tableFound: !!activeTable, rows: activeTable?.rows.length || 0 };
            stepRecord.verificationState = 'PASSED';
            stepRecord.status = 'SUCCESS';
            stepRecord.completedAt = new Date().toISOString();
            stepRecord.durationMs = 320;

            this.broadcast('PAGE_OBSERVED', {
              executionId,
              stepId,
              url: nextObs.url,
              title: nextObs.title,
              tableCount: nextObs.tables.length,
            });
          } else if (capability?.type === 'EXTRACT' || node.data.label.toLowerCase().includes('report') || node.data.label.toLowerCase().includes('csv')) {
            const live = await browserSessions.observe(app);
            activeTable = live.tables[0];
            if (!executionRecord.rowResults.length && activeTable?.rows.length) {
              this.recordExtractedRows(
                executionRecord,
                flow,
                app.id,
                executionSessionId,
                activeTable.rows.map((r) => ({ rowId: r.rowId, cells: r.cells }))
              );
            }
            const summary = this.generateBatchSummary(executionRecord);
            const csv = this.buildCsvReport(executionRecord);
            const reportId = `REP-${Date.now()}`;
            const fileName = `execution_${executionId}.csv`;

            db.saveReport({
              id: reportId,
              executionId,
              fileName,
              csvContent: csv,
              summary,
              createdAt: new Date().toISOString(),
            });

            executionRecord.csvReportPath = `/api/reports/${executionId}/csv`;
            stepRecord.outputData = { reportId, fileName, rowCount: summary.processed };
            stepRecord.verificationState = 'PASSED';
            stepRecord.status = 'SUCCESS';
            stepRecord.completedAt = new Date().toISOString();
            stepRecord.durationMs = 210;

            this.broadcast('BATCH_COMPLETED', {
              executionId,
              summary,
              csvUrl: executionRecord.csvReportPath,
            });
          } else {
            try {
              if (selector && (capability?.type === 'ENTER' || capability?.type === 'SELECT')) {
                const purpose = `${capability?.targetDefinition.semanticIntent || ''} ${node.data.label || ''}`.toLowerCase();
                let value = String(node.data.inputs?.value ?? '').trim();
                if (/user|email/.test(purpose)) {
                  const key = app.usernameEnvVar || app.credentialKeys?.[0];
                  value = (key && process.env[key] ? String(process.env[key]) : value).trim();
                } else if (/pass/.test(purpose)) {
                  const key = app.passwordEnvVar || app.credentialKeys?.[1];
                  value = (key && process.env[key] ? String(process.env[key]) : value).trim();
                }
                if (value) await browserSessions.fill(app, selector, value);
              } else if (selector) {
                await browserSessions.clickByName(app, intent, selector);
              } else if (intent) {
                await browserSessions.clickByName(app, intent);
              }
              stepRecord.outputData = { executed: true, url: browserSessions.pageUrl(app) };
              stepRecord.verificationState = 'PASSED';
              stepRecord.status = 'SUCCESS';
            } catch (err: unknown) {
              stepRecord.error = err instanceof Error ? err.message : String(err);
              stepRecord.verificationState = 'FAILED';
              stepRecord.status = 'FAILED';
            }
            stepRecord.completedAt = new Date().toISOString();
            stepRecord.durationMs = 200;
          }
          }
        } else if (node.type === 'TABLE_PROCESS') {
          const conditions = node.data.filterConfig?.conditions || [];
          const needsClick = Boolean(node.data.rowActionIntent);
          const obs = await browserSessions.observe(app);
          activeTable = obs.tables[0];
          const matchedRows = matchingActionableRows(activeTable, conditions);
          currentMatchedRows = matchedRows.map((row, idx) => ({
            rowId: row.rowId,
            claimId: row.cells['Claim ID'] || row.rowId,
            payer: row.cells['Payer'] || row.cells['Payor'] || Object.values(row.cells)[1] || '',
            matchedFilters: { conditions },
            currentRow: row.cells,
            rowIndex: idx,
            rowStatus: 'MATCHED' as const,
          }));
          executionRecord.matchedCount = currentMatchedRows.length;
          stepRecord.outputData = {
            totalTableRows: activeTable?.rows.length || 0,
            matchedRowCount: currentMatchedRows.length,
            matchedRowIds: currentMatchedRows.map((m) => m.rowId),
          };
          stepRecord.verificationState = 'PASSED';
          stepRecord.status = 'SUCCESS';
          stepRecord.completedAt = new Date().toISOString();
          stepRecord.durationMs = 180;
          this.broadcast('TABLE_OBSERVED', {
            executionId,
            tableName: activeTable?.semanticName || 'Data Table',
            totalRows: activeTable?.rows.length || 0,
            matchedCount: currentMatchedRows.length,
            matchedRowIds: currentMatchedRows.map((m) => m.rowId),
          });
          if (needsClick) {
            stepRecord.status = 'RUNNING';
            const loop = await clickActionOnMatchingRows(app, {
              actionIntent: node.data.rowActionIntent || '',
              conditions,
              executionId,
              session: chatSession,
              shouldStop: () => !!this.activeExecutions.get(executionId)?.shouldStop,
              paginateOnNext: node.data.paginateOnNext,
              nextPageName: node.data.nextPageName,
              nextPageSelector: node.data.nextPageSelector,
            });
            const rowStart = Date.now();
            for (let rIdx = 0; rIdx < loop.results.length; rIdx++) {
              const item = loop.results[rIdx];
              const rowCtx = currentMatchedRows.find((r) => r.rowId === item.rowId);
              const cells = item.cells || rowCtx?.currentRow;
              executionRecord.processedCount++;
              const rowResult: RowExecutionResult = {
                executionId,
                flowId: flow.id,
                capabilityId: capability?.id,
                applicationId: app.id,
                sessionId: executionSessionId,
                rowId: item.rowId,
                claimId: rowCtx?.claimId || cells?.['Claim ID'] || item.rowId,
                payer: rowCtx?.payer || cells?.['Payer'] || cells?.['Payor'] || '',
                initialStatus: cells?.['Status'] || rowCtx?.currentRow['Status'] || '',
                finalStatus:
                  item.status === 'SUCCESS' ? 'Success' : item.status === 'SKIPPED' ? 'Skipped' : 'Failed',
                result: item.status,
                verificationResult:
                  item.status === 'SUCCESS' ? 'PASSED' : item.status === 'SKIPPED' ? 'UNKNOWN' : 'FAILED',
                recoveryAttempted: false,
                remappingRequired: false,
                remappingConfirmed: false,
                errorMessage: item.status === 'SUCCESS' ? undefined : item.line,
                startedAt: new Date(rowStart).toISOString(),
                completedAt: new Date().toISOString(),
                durationMs: 0,
                cells,
              };
              if (item.status === 'SUCCESS') executionRecord.successCount++;
              else if (item.status === 'SKIPPED') executionRecord.skippedCount++;
              else executionRecord.failedCount++;
              executionRecord.rowResults.push(rowResult);
            }
            stepRecord.outputData = {
              processed: executionRecord.processedCount,
              success: executionRecord.successCount,
              failed: executionRecord.failedCount,
              skipped: executionRecord.skippedCount,
              lines: loop.lines,
            };
            stepRecord.verificationState =
              loop.failed === 0 ? 'PASSED' : 'FAILED';
            stepRecord.status = loop.failed === 0 ? 'SUCCESS' : 'FAILED';
            stepRecord.completedAt = new Date().toISOString();
            stepRecord.durationMs = executionRecord.rowResults.reduce((sum, r) => sum + r.durationMs, 0);
          } else if (currentMatchedRows.length) {
            this.recordExtractedRows(
              executionRecord,
              flow,
              app.id,
              executionSessionId,
              currentMatchedRows.map((r) => ({ rowId: r.rowId, cells: r.currentRow }))
            );
            stepRecord.outputData = {
              ...stepRecord.outputData,
              extracted: executionRecord.rowResults.length,
            };
          }
        }

        this.broadcast(
          'STEP_COMPLETED',
          {
            executionId,
            stepId,
            stepName: node.data.label,
            status: stepRecord.status,
            verificationState: stepRecord.verificationState,
          },
          { executionId, stepId }
        );
      }
    } catch (err: unknown) {
      executionRecord.error = err instanceof Error ? err.message : String(err);
      if (executionRecord.status !== 'STOPPED') executionRecord.status = 'FAILED';
    } finally {
      const stopped = this.activeExecutions.get(executionId)?.shouldStop;
      if (!stopped) await browserSessions.close(app.id).catch(() => undefined);
      this.activeExecutions.delete(executionId);
    }

      if (executionRecord.status !== 'STOPPED') {
        executionRecord.status = executionRecord.failedCount > 0 && executionRecord.successCount === 0 ? 'FAILED' : 'COMPLETED';
      }
      executionRecord.completedAt = new Date().toISOString();
      executionRecord.durationMs = new Date(executionRecord.completedAt).getTime() - new Date(executionRecord.startedAt).getTime();

      if (executionRecord.rowResults.length) {
        const summary = this.generateBatchSummary(executionRecord);
        const csv = this.buildCsvReport(executionRecord);
        const reportId = `REP-${Date.now()}`;
        const fileName = `execution_${executionId}.csv`;
        db.saveReport({
          id: reportId,
          executionId,
          fileName,
          csvContent: csv,
          summary,
          createdAt: new Date().toISOString(),
        });
        executionRecord.csvReportPath = `/api/reports/${executionId}/csv`;
      }

      db.saveExecution(executionRecord);

      this.broadcast('EXECUTION_COMPLETED', {
        executionId,
        status: executionRecord.status,
        matched: executionRecord.matchedCount,
        processed: executionRecord.processedCount,
        success: executionRecord.successCount,
        failed: executionRecord.failedCount,
        csvUrl: executionRecord.csvReportPath,
      });

      return executionRecord;
  }

  private generateBatchSummary(exec: ExecutionRecord): BatchSummary {
    return {
      executionId: exec.id,
      totalMatched: exec.matchedCount,
      processed: exec.processedCount,
      successful: exec.successCount,
      failed: exec.failedCount,
      skipped: exec.skippedCount,
      recoverySuccessful: exec.recoveryCount,
      remappingRequired: exec.remappingCount,
      remappingConfirmed: exec.rowResults.filter((r) => r.remappingConfirmed).length,
      humanInterventions: exec.interventionCount,
      durationMs: exec.durationMs || 0,
    };
  }

  private recordExtractedRows(
    exec: ExecutionRecord,
    flow: BusinessFlow,
    applicationId: string,
    sessionId: string,
    rows: Array<{ rowId: string; cells: Record<string, string> }>
  ) {
    const now = new Date().toISOString();
    for (const row of rows) {
      exec.processedCount++;
      exec.successCount++;
      exec.rowResults.push({
        executionId: exec.id,
        flowId: flow.id,
        applicationId,
        sessionId,
        rowId: row.rowId,
        claimId: row.cells['Claim ID'] || row.rowId,
        payer: row.cells['Payer'] || row.cells['Payor'] || '',
        initialStatus: row.cells['Status'] || '',
        finalStatus: 'Success',
        result: 'SUCCESS',
        verificationResult: 'PASSED',
        recoveryAttempted: false,
        remappingRequired: false,
        remappingConfirmed: false,
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        cells: row.cells,
      });
    }
  }

  private csvEscape(value: unknown): string {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  private statusLabel(result: RowExecutionResult['result']): string {
    if (result === 'SUCCESS') return 'Success';
    if (result === 'SKIPPED') return 'Skipped';
    return 'Failed';
  }

  private buildCsvReport(exec: ExecutionRecord): string {
    const cellKeys = Array.from(
      new Set(exec.rowResults.flatMap((r) => Object.keys(r.cells || {})))
    );
    const headers = ['row_id', ...cellKeys, 'status', 'error'];
    const lines = [headers.map((h) => this.csvEscape(h)).join(',')];
    for (const r of exec.rowResults) {
      const values = [
        this.csvEscape(r.rowId),
        ...cellKeys.map((key) => this.csvEscape(r.cells?.[key] ?? '')),
        this.csvEscape(this.statusLabel(r.result)),
        this.csvEscape(r.result === 'SUCCESS' ? '' : (r.errorMessage || '').replace(/^•\s*/, '')),
      ];
      lines.push(values.join(','));
    }
    return lines.join('\n');
  }
}

export const orchestrator = new StateMachineOrchestrator();
