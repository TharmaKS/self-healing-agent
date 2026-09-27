import {
  Application,
  ChatMessage,
  ChatOption,
  FilterOperator,
  ObservedRow,
  ObservedTable,
  WorkflowBuildSession,
} from '../../types/automation';
import { browserSessions } from '../browser/sessionManager';
import { findRowAction, findRowBySnapshot, matchingActionableRows, tableHasColumn } from './tableFilter';
import { genericActionText, uniquePageControls, findNextPageControl, paginationControlCandidates } from './semanticOptions';
import { recoveryEngine } from './recovery';
import { emitExecutionEvent } from './executionEvents';
import { scoreSemanticMatch } from './resolver';
import { db } from '../db/database';

export type RankedCandidate = {
  text: string;
  selector?: string;
  confidence: number;
  actionId: string;
};

export type RowActionLoopResult = {
  attempted: number;
  passed: number;
  failed: number;
  skipped: number;
  rowIds: string[];
  lines: string[];
  results: Array<{
    rowId: string;
    ok: boolean;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    line: string;
    cells?: Record<string, string>;
  }>;
};

async function clickRowControl(app: Application, name: string, selector?: string) {
  if (selector) {
    try {
      await browserSessions.click(app, selector);
      return;
    } catch {
      await browserSessions.clickByName(app, name, selector);
      return;
    }
  }
  await browserSessions.clickByName(app, name);
}

const AUTO_MATCH = 0.9;

function percent(score: number) {
  return `${Math.round(score * 100)}%`;
}

function stripUsePrefix(raw: string) {
  return String(raw || '').replace(/^use\s+/i, '').trim();
}

function pickMappedCandidate(
  ranked: RankedCandidate[],
  selected?: string,
  selector?: string
): RankedCandidate | undefined {
  const wanted = stripUsePrefix(selected || '');
  const sel = String(selector || '').trim();
  return ranked.find(
    (c) =>
      (sel && c.selector === sel) ||
      (wanted &&
        (c.text === wanted ||
          c.selector === wanted ||
          genericActionText(c.text).toLowerCase() === genericActionText(wanted).toLowerCase() ||
          c.text.toLowerCase() === wanted.toLowerCase()))
  );
}

function uniqueHighMatch(ranked: RankedCandidate[]) {
  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.confidence < AUTO_MATCH) return undefined;
  if (second && second.confidence >= AUTO_MATCH) return undefined;
  return top;
}

export function rankControlCandidates(
  intent: string,
  items: Array<{ text: string; selector?: string; actionId: string }>
): RankedCandidate[] {
  const seen = new Set<string>();
  const ranked: RankedCandidate[] = [];
  for (const item of items) {
    const text = genericActionText(item.text || '');
    const key = `${text.toLowerCase()}|${item.selector || ''}`;
    if (!text || seen.has(key)) continue;
    seen.add(key);
    ranked.push({
      text,
      selector: item.selector,
      actionId: item.actionId,
      confidence: scoreSemanticMatch(intent, text),
    });
  }
  ranked.sort((a, b) => b.confidence - a.confidence);
  return ranked.slice(0, 8);
}

function rowCandidates(row: ObservedRow, intent: string): RankedCandidate[] {
  return rankControlCandidates(
    intent,
    (row.actions || []).map((a) => ({
      text: a.visibleText || a.intent,
      selector: a.selectorFallback,
      actionId: a.id,
    }))
  );
}

function pageCandidates(
  obs: Awaited<ReturnType<typeof browserSessions.observe>>,
  intent: string
): RankedCandidate[] {
  return rankControlCandidates(
    intent,
    uniquePageControls(obs, [], 8).map((c) => ({
      text: c.accessibleName || c.visibleText || c.type,
      selector: c.selectorFallback,
      actionId: c.id,
    }))
  );
}

function actionFromExperience(row: ObservedRow, remembered: string) {
  const wanted = remembered.toLowerCase();
  return (row.actions || []).find((a) => {
    const raw = a.visibleText || a.intent || '';
    const text = genericActionText(raw).toLowerCase();
    if (text === wanted || raw.toLowerCase() === wanted || a.selectorFallback === remembered) return true;
    return scoreSemanticMatch(remembered, raw) >= 0.8;
  });
}

function rowFingerprint(row: { rowId: string; cells?: Record<string, string> }) {
  return `${row.rowId}|${JSON.stringify(row.cells || {})}`;
}

function dataColumnsFromRows(rows: ObservedRow[]) {
  const cols = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.cells || {})) {
      if (String(value || '').trim()) cols.add(key);
    }
  }
  return [...cols];
}

function isDataRow(row: ObservedRow, dataColumns: string[]) {
  const cells = row.cells || {};
  if (!dataColumns.length) {
    return Object.values(cells).some((v) => String(v || '').trim());
  }
  const keys = Object.keys(cells);
  return dataColumns.some((col) => {
    const hit = keys.find((k) => k.toLowerCase() === col.toLowerCase());
    return Boolean(hit && String(cells[hit] || '').trim());
  });
}

function isFormChromeRow(row: ObservedRow) {
  const texts = (row.actions || []).map((a) =>
    genericActionText(a.visibleText || a.intent || '').toLowerCase()
  );
  if (!texts.length) return false;
  const chrome = /(file claim|save draft|cancel|^back$|^close$|^ok$)/i;
  const hits = texts.filter((t) => chrome.test(t)).length;
  return hits >= 2 || (hits >= 1 && texts.length <= 4 && !texts.some((t) => /send claim/.test(t)));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type LiveObs = Awaited<ReturnType<typeof browserSessions.observe>>;

function tableContentFingerprint(obs: LiveObs) {
  const table = obs.tables[0];
  const cells = (table?.rows || []).map((r) => JSON.stringify(r.cells || {})).join('||');
  return `${obs.url || ''}|${cells}`;
}

function relativeUiChange(before: LiveObs, after: LiveObs, fpBefore: string, fpAfter: string): string | null {
  const bits: string[] = [];
  if (before.url && after.url && before.url !== after.url) bits.push(`url → ${after.url}`);
  if (before.title !== after.title && after.title) bits.push(`title → "${after.title}"`);
  const rowBefore = before.tables[0]?.rows.length || 0;
  const rowAfter = after.tables[0]?.rows.length || 0;
  if (fpBefore !== fpAfter) bits.push(`table content updated (${rowBefore} → ${rowAfter} rows)`);
  else if (rowBefore !== rowAfter) bits.push(`row count ${rowBefore} → ${rowAfter}`);
  if (before.controls.length !== after.controls.length) {
    bits.push(`controls ${before.controls.length} → ${after.controls.length}`);
  }
  if (!bits.length) return null;
  return `UI changed after Next: ${bits.join('; ')}.`;
}

async function waitForPaginateUiChange(opts: {
  app: Application;
  before: LiveObs;
  fpBefore: string;
  session?: WorkflowBuildSession;
  executionId: string;
}): Promise<{ changed: boolean; obs: LiveObs }> {
  const deadline = Date.now() + 10_000;
  let last = opts.before;
  while (Date.now() < deadline) {
    await sleep(400);
    last = await browserSessions.observe(opts.app, { quick: true });
    const fpAfter = tableContentFingerprint(last);
    const note = relativeUiChange(opts.before, last, opts.fpBefore, fpAfter);
    if (note) {
      emitExecutionEvent('PAGE_OBSERVED', {
        executionId: opts.executionId,
        message: note,
        changed: true,
      });
      return { changed: true, obs: last };
    }
  }
  emitExecutionEvent('PAGE_OBSERVED', {
    executionId: opts.executionId,
    message: 'Next did not change the page. Completing this table action.',
    changed: false,
  });
  return { changed: false, obs: last };
}

function pushAgentMessage(
  session: WorkflowBuildSession | undefined,
  text: string,
  options?: ChatOption[],
  card?: ChatMessage['card']
) {
  const id = `msg-note-${Date.now().toString(36)}`;
  emitExecutionEvent('AGENT_MESSAGE_CREATED', { id, text, options: options || [], card: card || null });
  if (!session) return;
  session.messages.push({
    id,
    sender: 'agent',
    text,
    options,
    card,
    timestamp: new Date().toISOString(),
  });
  db.saveBuildSession(session);
  try {
    emitExecutionEvent('BUILD_SESSION_UPDATED', { sessionId: session.id, messageCount: session.messages.length });
  } catch {
    /* session can be too large for a full WS payload */
  }
}

const STOPPED_CHAT = 'Stopped. Remaining records were not processed. Browser is still open.';

export function postStoppedNote(session?: WorkflowBuildSession) {
  if (session?.messages.some((m) => m.text === STOPPED_CHAT)) return;
  pushAgentMessage(session, STOPPED_CHAT);
}

function mapNote(from: string, to: string, kind: 'control' | 'column' = 'control') {
  return kind === 'column' ? `Mapped column "${from}" → "${to}".` : `Mapped "${from}" → "${to}".`;
}

function postRemapAlert(
  session: WorkflowBuildSession | undefined,
  interventionId: string,
  expectedIntent: string,
  kind: 'CONTROL' | 'COLUMN',
  ranked: RankedCandidate[],
  skipLabel: string
) {
  const options: ChatOption[] = [
    { id: `trace-retry-${interventionId}`, label: 'Retry', type: 'primary' },
    ...ranked.slice(0, 6).map((c, i) => ({
      id: `trace-map-${interventionId}-${i}`,
      label: `Use ${c.text}`,
      type: 'secondary' as const,
      badge: percent(c.confidence),
      payload: { interventionId, selectedTarget: c.text, selector: c.selector, expectedIntent },
    })),
    { id: `trace-skip-${interventionId}`, label: skipLabel, type: 'secondary' },
  ];
  const text =
    kind === 'COLUMN' ? `Could not find column "${expectedIntent}".` : `Could not click "${expectedIntent}".`;
  const need =
    kind === 'COLUMN' ? 'Choose the column for this filter.' : 'Choose the control that means the same thing.';
  pushAgentMessage(session, text, options, {
    type: 'REMAP_REQUEST',
    data: { interventionId, expectedIntent, kind, need },
  });
}

export async function askClickRecovery(opts: {
  app: Application;
  intent: string;
  executionId: string;
  session?: WorkflowBuildSession;
  obs: Awaited<ReturnType<typeof browserSessions.observe>>;
  row?: ObservedRow;
  lastError?: string;
}): Promise<{
  action: 'CONFIRM' | 'SKIP' | 'STOP' | 'RETRY';
  selectedTarget?: string;
  name: string;
  selector?: string;
  remapped: boolean;
}> {
  const { app, intent, executionId, session, obs, row } = opts;
  const ranked = row && (row.actions || []).length ? rowCandidates(row, intent) : pageCandidates(obs, intent);
  const auto = !opts.lastError ? uniqueHighMatch(ranked) : undefined;
  if (auto) {
    const note = mapNote(intent, auto.text);
    pushAgentMessage(session, note);
    emitExecutionEvent('TARGET_RESOLVED', {
      executionId,
      expectedIntent: intent,
      resolvedTarget: auto.text,
      confidence: auto.confidence,
      auto: true,
      message: note,
      rowId: row?.rowId,
    });
    return {
      action: 'CONFIRM',
      selectedTarget: auto.selector || auto.text,
      name: auto.text,
      selector: auto.selector,
      remapped: true,
    };
  }
  const proposal = recoveryEngine.detectRowRemappingNeed(
    {
      id: 'cap-click-help',
      applicationId: app.id,
      businessName: intent,
      type: row ? 'TABLE_ROW_ACTION' : 'CLICK',
      semanticDescription: intent,
      targetDefinition: { semanticIntent: intent, visibleTextPattern: intent, role: 'button' },
      inputDefinition: [],
      outputDefinition: [],
      verificationDefinition: { expectedOutcome: intent, successCondition: {} },
      recoveryDefinition: { allowHumanRemapping: true, maxRetries: 3, onFailure: 'CONTINUE' },
      riskLevel: 'HIGH',
      version: 1,
      isPublished: true,
      isRetired: false,
      createdAt: '',
      updatedAt: '',
    },
    row || {
      rowId: 'page',
      cells: {},
      rawIndex: 0,
      actions: ranked.map((c) => ({
        id: c.actionId,
        intent: c.text,
        visibleText: c.text,
        role: 'button',
        targetId: c.actionId,
        selectorFallback: c.selector,
        controlType: 'button',
      })),
    },
    executionId
  );
  const intervention = proposal.interventionRequest!;
  intervention.candidates = ranked.map((c) => ({
    text: c.text,
    confidence: c.confidence,
    actionId: c.actionId,
    selector: c.selector,
  }));
  emitExecutionEvent('HUMAN_INTERVENTION_REQUIRED', {
    executionId,
    interventionId: intervention.id,
    rowId: row?.rowId,
    expectedIntent: intent,
    message: `Could not click "${intent}".`,
    lastError: opts.lastError || '',
    candidates: intervention.candidates,
    kind: 'CONTROL',
  });
  postRemapAlert(
    session,
    intervention.id,
    intent,
    'CONTROL',
    ranked,
    row ? 'Skip this row' : 'Skip this step'
  );
  const human = await new Promise<{
    action: 'CONFIRM' | 'SKIP' | 'STOP' | 'RETRY';
    selectedTarget?: string;
  }>((resolve) => {
    recoveryEngine.registerIntervention(intervention, resolve);
  });
  const picked = pickMappedCandidate(ranked, human.selectedTarget);
  const name = picked?.text || stripUsePrefix(human.selectedTarget || '') || intent;
  if (human.action === 'CONFIRM' && name && name !== intent) {
    recoveryEngine.recordSuccessfulMapping({
      applicationId: app.id,
      pageContext: obs.title || '',
      originalTarget: intent,
      resolvedTarget: name,
    });
    pushAgentMessage(session, mapNote(intent, name));
  }
  return {
    ...human,
    name,
    selector: picked?.selector,
    remapped: human.action === 'CONFIRM',
  };
}

export async function askColumnRecovery(opts: {
  app: Application;
  taughtColumn: string;
  executionId: string;
  table?: ObservedTable;
  session?: WorkflowBuildSession;
}): Promise<{ action: 'CONFIRM' | 'SKIP' | 'STOP' | 'RETRY'; column?: string; remapped: boolean }> {
  const columns = opts.table?.columns || [];
  const ranked = rankControlCandidates(
    opts.taughtColumn,
    columns.map((c) => ({ text: c, selector: c, actionId: c }))
  );
  const autoCol = uniqueHighMatch(ranked);
  if (autoCol) {
    const note = mapNote(opts.taughtColumn, autoCol.text, 'column');
    pushAgentMessage(opts.session, note);
    emitExecutionEvent('TARGET_RESOLVED', {
      executionId: opts.executionId,
      expectedIntent: opts.taughtColumn,
      resolvedTarget: autoCol.text,
      confidence: autoCol.confidence,
      auto: true,
      kind: 'COLUMN',
      message: note,
    });
    return {
      action: 'CONFIRM',
      column: autoCol.text,
      remapped: true,
    };
  }
  const proposal = recoveryEngine.detectRowRemappingNeed(
    {
      id: 'cap-col-help',
      applicationId: opts.app.id,
      businessName: opts.taughtColumn,
      type: 'TABLE_FILTER',
      semanticDescription: opts.taughtColumn,
      targetDefinition: { semanticIntent: opts.taughtColumn, visibleTextPattern: opts.taughtColumn, role: 'column' },
      inputDefinition: [],
      outputDefinition: [],
      verificationDefinition: { expectedOutcome: opts.taughtColumn, successCondition: {} },
      recoveryDefinition: { allowHumanRemapping: true, maxRetries: 3, onFailure: 'CONTINUE' },
      riskLevel: 'HIGH',
      version: 1,
      isPublished: true,
      isRetired: false,
      createdAt: '',
      updatedAt: '',
    },
    {
      rowId: 'columns',
      cells: {},
      rawIndex: 0,
      actions: ranked.map((c) => ({
        id: c.actionId,
        intent: c.text,
        visibleText: c.text,
        role: 'column',
        targetId: c.actionId,
        selectorFallback: c.text,
        controlType: 'column',
      })),
    },
    opts.executionId
  );
  const intervention = proposal.interventionRequest!;
  intervention.candidates = ranked.map((c) => ({
    text: c.text,
    confidence: c.confidence,
    actionId: c.actionId,
    selector: c.text,
  }));
  emitExecutionEvent('HUMAN_INTERVENTION_REQUIRED', {
    executionId: opts.executionId,
    interventionId: intervention.id,
    expectedIntent: opts.taughtColumn,
    message: `Could not find column "${opts.taughtColumn}".`,
    candidates: intervention.candidates,
    kind: 'COLUMN',
  });
  postRemapAlert(opts.session, intervention.id, opts.taughtColumn, 'COLUMN', ranked, 'Skip filter');
  const human = await new Promise<{
    action: 'CONFIRM' | 'SKIP' | 'STOP' | 'RETRY';
    selectedTarget?: string;
  }>((resolve) => {
    recoveryEngine.registerIntervention(intervention, resolve);
  });
  if (human.action === 'CONFIRM' && human.selectedTarget) {
    pushAgentMessage(opts.session, mapNote(opts.taughtColumn, human.selectedTarget, 'column'));
  }
  return {
    action: human.action,
    column: human.selectedTarget,
    remapped: human.action === 'CONFIRM' && !!human.selectedTarget,
  };
}

export async function clickActionOnMatchingRows(
  app: Application,
  opts: {
    actionIntent: string;
    conditions?: Array<{ column: string; operator: FilterOperator; value: string }>;
    shouldStop?: () => boolean;
    executionId?: string;
    session?: WorkflowBuildSession;
    paginateOnNext?: boolean;
    nextPageName?: string;
    nextPageSelector?: string;
  }
): Promise<RowActionLoopResult> {
  const conditions = (opts.conditions || []).map((c) => ({ ...c }));
  const intent = opts.actionIntent;
  const executionId = opts.executionId || `exec-${Date.now().toString().slice(-6)}`;
  const results: Array<{
    rowId: string;
    ok: boolean;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    line: string;
    cells?: Record<string, string>;
  }> = [];
  const allRowIds: string[] = [];
  let pendingColumnSave: { original: string; resolved: string } | undefined;
  let resolvedName = recoveryEngine.lookupResolvedTarget(app.id, intent) || '';
  let resolvedSelector: string | undefined;
  let nextName =
    recoveryEngine.lookupResolvedTarget(app.id, `paginate-next:${intent}`) || opts.nextPageName || '';
  let nextSelector = opts.nextPageSelector;
  const MAX_PAGES = 25;

  const matchesTaughtNext = (c: { accessibleName?: string; visibleText?: string; selectorFallback?: string }) => {
    const live = genericActionText(c.accessibleName || c.visibleText || '');
    if (nextSelector && c.selectorFallback === nextSelector) return true;
    if (nextName && live.toLowerCase() === genericActionText(nextName).toLowerCase()) return true;
    if (nextName && scoreSemanticMatch(nextName, live) >= 0.9) return true;
    return false;
  };

  try {
  for (let page = 0; page < MAX_PAGES; page++) {
    if (opts.shouldStop?.()) break;
    const first = await browserSessions.observe(app);
    for (const cond of conditions) {
      const remembered = recoveryEngine.lookupResolvedTarget(app.id, `column:${cond.column}`);
      if (!remembered) continue;
      const live = (first.tables[0]?.columns || []).find((c) => c.toLowerCase() === remembered.toLowerCase());
      if (live) cond.column = live;
    }
    const taughtColumn = conditions[0]?.column;
    if (page === 0 && taughtColumn && first.tables[0] && !tableHasColumn(first.tables[0], taughtColumn)) {
      const colHelp = await askColumnRecovery({
        app,
        taughtColumn,
        executionId,
        table: first.tables[0],
        session: opts.session,
      });
      if (colHelp.remapped && colHelp.column) {
        pendingColumnSave = { original: `column:${taughtColumn}`, resolved: colHelp.column };
        conditions[0].column = colHelp.column;
      }
    }

    const firstSnapshot = matchingActionableRows(first.tables[0], conditions);
    const dataColumns = dataColumnsFromRows(firstSnapshot);
    emitExecutionEvent('TABLE_OBSERVED', {
      executionId,
      matchedCount: firstSnapshot.length,
      matchedRowIds: firstSnapshot.map((r) => r.rowId),
      tableName: first.tables[0]?.semanticName || 'Table',
      totalRows: first.tables[0]?.rows.length || 0,
      page: page + 1,
    });

    const doneKeys = new Set<string>();
    while (!opts.shouldStop?.()) {
      const obs = await browserSessions.observe(app);
      const liveTable = obs.tables[0];
      if (!liveTable?.rows?.length) break;
      const remaining = matchingActionableRows(liveTable, conditions).filter(
        (r) =>
          !doneKeys.has(rowFingerprint(r)) &&
          isDataRow(r, dataColumns) &&
          !isFormChromeRow(r)
      );
      if (!remaining.length) break;
      const row = remaining[0];
      const rowId = row.rowId;
      const rowKey = rowFingerprint(row);
      allRowIds.push(rowId);
      const index = results.length;
      emitExecutionEvent('ROW_STARTED', {
        executionId,
        rowIndex: index,
        rowId,
        total: remaining.length + doneKeys.size,
        actionIntent: resolvedName || intent,
      });
      const experienced = resolvedName ? actionFromExperience(row, resolvedName) : undefined;
      let action = experienced || findRowAction(row, intent);
      let name = action?.visibleText || action?.intent || resolvedName || intent;
      let selector = action?.selectorFallback || resolvedSelector;
      let ok = false;
      let lastError = '';
      let skipKind: 'FAILED' | 'SKIPPED' = 'FAILED';
      let pendingActionSave: { original: string; resolved: string } | undefined;
      const stillOnPage = async () =>
        findRowBySnapshot((await browserSessions.observe(app)).tables[0], rowId, row.cells);
      if (!action) {
        if (!(await stillOnPage()) || !isDataRow(row, dataColumns) || isFormChromeRow(row)) {
          doneKeys.add(rowKey);
          continue;
        }
        lastError = `Could not click "${intent}" on this row.`;
        emitExecutionEvent('ROW_FAILED', {
          executionId,
          rowId,
          rowIndex: index,
          error: lastError,
          waiting: true,
        });
        const human = await askClickRecovery({
          app,
          intent,
          executionId,
          session: opts.session,
          obs,
          row,
          lastError,
        });
        if (human.action === 'SKIP') {
          skipKind = 'SKIPPED';
        } else if (human.action === 'STOP') {
          skipKind = 'SKIPPED';
          lastError = 'stopped';
        } else if (human.action !== 'RETRY' && human.remapped) {
          name = human.name;
          const liveAction = actionFromExperience(row, human.name);
          selector = liveAction?.selectorFallback || human.selector;
          pendingActionSave = { original: intent, resolved: human.name };
          resolvedName = human.name;
          resolvedSelector = selector;
          action = liveAction;
        } else if (human.action === 'RETRY') {
          action = findRowAction(row, intent);
          name = action?.visibleText || resolvedName || intent;
          selector = action?.selectorFallback || resolvedSelector;
        }
        if (human.action === 'SKIP' || human.action === 'STOP') {
          doneKeys.add(rowKey);
          results.push({
            rowId,
            ok: false,
            status: 'SKIPPED',
            line: `• ${rowId}: ${lastError || 'skipped'}`,
            cells: row.cells,
          });
          emitExecutionEvent('ROW_FAILED', {
            executionId,
            rowId,
            rowIndex: index,
            error: lastError || 'skipped',
          });
          if (lastError === 'stopped') break;
          continue;
        }
      }
      for (let tryCount = 0; tryCount < 4 && !ok; tryCount++) {
        try {
          await clickRowControl(app, name || intent, selector);
          ok = true;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          if (!(await stillOnPage()) || !isDataRow(row, dataColumns) || isFormChromeRow(row)) {
            ok = true;
            break;
          }
          if (resolvedName && name !== resolvedName) {
            name = resolvedName;
            selector = resolvedSelector;
            try {
              await clickRowControl(app, name, selector);
              ok = true;
              continue;
            } catch (err2) {
              lastError = err2 instanceof Error ? err2.message : String(err2);
            }
          }
          if (!(await stillOnPage()) || !isDataRow(row, dataColumns) || isFormChromeRow(row)) {
            ok = true;
            break;
          }
          emitExecutionEvent('ROW_FAILED', {
            executionId,
            rowId,
            rowIndex: index,
            error: lastError,
            waiting: true,
          });
          const human = await askClickRecovery({
            app,
            intent,
            executionId,
            session: opts.session,
            obs,
            row,
            lastError,
          });
          if (human.action === 'SKIP') {
            ok = false;
            skipKind = 'SKIPPED';
            lastError = lastError || 'skipped';
            break;
          }
          if (human.action === 'STOP') {
            ok = false;
            skipKind = 'SKIPPED';
            lastError = 'stopped';
            break;
          }
          if (human.action === 'RETRY') {
            continue;
          }
          name = human.name;
          const liveAction = actionFromExperience(row, human.name);
          selector = liveAction?.selectorFallback || human.selector;
          if (human.remapped) {
            pendingActionSave = { original: intent, resolved: human.name };
            resolvedName = human.name;
            resolvedSelector = selector;
          }
        }
      }
      doneKeys.add(rowKey);
      if (ok) {
        results.push({
          rowId,
          ok: true,
          status: 'SUCCESS',
          line: `• ${rowId}: clicked ${name}`,
          cells: row.cells,
        });
        emitExecutionEvent('ROW_COMPLETED', {
          executionId,
          rowId,
          rowIndex: index,
          result: 'SUCCESS',
          line: `clicked ${name}`,
          total: remaining.length + doneKeys.size,
        });
        if (pendingActionSave) {
          recoveryEngine.recordSuccessfulMapping({
            applicationId: app.id,
            pageContext: obs.title,
            originalTarget: pendingActionSave.original,
            resolvedTarget: pendingActionSave.resolved,
          });
        }
        if (pendingColumnSave) {
          recoveryEngine.recordSuccessfulMapping({
            applicationId: app.id,
            pageContext: obs.title,
            originalTarget: pendingColumnSave.original,
            resolvedTarget: pendingColumnSave.resolved,
          });
          pendingColumnSave = undefined;
        }
      } else {
        const status = skipKind;
        results.push({
          rowId,
          ok: false,
          status,
          line: `• ${rowId}: ${lastError || (status === 'SKIPPED' ? 'skipped' : 'failed')}`,
          cells: row.cells,
        });
        emitExecutionEvent('ROW_FAILED', {
          executionId,
          rowId,
          rowIndex: index,
          error: lastError || status.toLowerCase(),
        });
      }
      emitExecutionEvent('BATCH_PROGRESS', {
        executionId,
        processed: results.length,
        total: remaining.length + doneKeys.size,
        success: results.filter((r) => r.status === 'SUCCESS').length,
        failed: results.filter((r) => r.status === 'FAILED').length,
        skipped: results.filter((r) => r.status === 'SKIPPED').length,
      });
      if (lastError === 'stopped') break;
    }

    if (opts.shouldStop?.()) break;
    if (!opts.paginateOnNext) break;
    const after = await browserSessions.observe(app);
    const cands = paginationControlCandidates(after);
    const taught = cands.find(matchesTaughtNext);
    if (taught && taught.enabled === false) break;
    const nextCtrl = (taught && taught.enabled !== false ? taught : undefined) || findNextPageControl(after);
    const clickName = nextCtrl?.accessibleName || nextCtrl?.visibleText || nextName || 'Next';
    const clickSelector = nextCtrl?.selectorFallback || nextSelector;
    if (!clickSelector && !nextName && !nextCtrl) break;
    try {
      await clickRowControl(app, clickName, clickSelector);
    } catch {
      // Click may still have navigated; wait on observation instead of failing.
    }
    const fpBefore = tableContentFingerprint(after);
    const waited = await waitForPaginateUiChange({
      app,
      before: after,
      fpBefore,
      session: opts.session,
      executionId,
    });
    if (!waited.changed) break;
  }
  } catch {
    /* table may have navigated away; return rows already processed */
  }

  const passed = results.filter((r) => r.status === 'SUCCESS').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  const skipped = results.filter((r) => r.status === 'SKIPPED').length;
  return {
    attempted: results.length,
    passed,
    failed,
    skipped,
    rowIds: allRowIds,
    lines: results.map((r) => r.line),
    results,
  };
}
