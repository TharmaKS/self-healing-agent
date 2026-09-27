import { FilterOperator, ObservedRow, ObservedTable } from '../../types/automation';
import { genericActionText, rowActionKind, RowActionKind } from './semanticOptions';
import { scoreSemanticMatch } from './resolver';

export function resolveFilterValue(raw?: string): string {
  const name = (raw || '').trim();
  if (!name) return '';
  if (Object.prototype.hasOwnProperty.call(process.env, name) && process.env[name] !== undefined) {
    return String(process.env[name]);
  }
  return name;
}

export function rowMatchesFilters(
  cells: Record<string, string>,
  conditions: Array<{ column: string; operator: FilterOperator; value: string }>
): boolean {
  if (!conditions.length) return true;
  return conditions.every((condition) => {
    const col = Object.keys(cells).find((k) => k.toLowerCase() === condition.column.toLowerCase());
    const cell = (col ? cells[col] : cells[condition.column] ?? '').toString();
    const expected = resolveFilterValue(condition.value);
    const left = cell.toLowerCase();
    const right = expected.toLowerCase();
    if (condition.operator === 'EQUALS') return left === right;
    if (condition.operator === 'NOT_EQUALS') return left !== right;
    if (condition.operator === 'CONTAINS') return left.includes(right);
    return true;
  });
}

export function tableHasColumn(table: ObservedTable | undefined, column: string): boolean {
  if (!table || !column) return false;
  const wanted = column.toLowerCase();
  if ((table.columns || []).some((c) => c.toLowerCase() === wanted)) return true;
  return table.rows.some((r) => Object.keys(r.cells || {}).some((k) => k.toLowerCase() === wanted));
}

export function uniqueColumnValues(table: ObservedTable | undefined, column: string, limit = 16): string[] {
  if (!table || !column) return [];
  const seen: string[] = [];
  for (const row of table.rows) {
    const value = (row.cells[column] || '').trim();
    if (!value) continue;
    if (seen.some((v) => v.toLowerCase() === value.toLowerCase())) continue;
    seen.push(value);
    if (seen.length >= limit) break;
  }
  return seen;
}

export type ActionableRowPreview = {
  line: string;
  actions: Array<{ label: string; kind: RowActionKind }>;
};

function rowActionSummaries(row: ObservedRow): Array<{ label: string; kind: RowActionKind }> {
  const seen = new Map<string, { label: string; kind: RowActionKind }>();
  for (const action of row.actions || []) {
    const label = genericActionText(action.visibleText || action.intent || 'Row action');
    const kind = rowActionKind(action);
    const key = `${kind}:${label.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, { label, kind });
  }
  return Array.from(seen.values());
}

export function previewMatchingActionableRows(
  table: ObservedTable | undefined,
  conditions: Array<{ column: string; operator: FilterOperator; value: string }> = [],
  limit = 5
): ActionableRowPreview[] {
  if (!table) return [];
  const column = conditions[0]?.column;
  const expected = conditions[0] ? resolveFilterValue(conditions[0].value) : '';
  const ranked = table.rows
    .map((row) => {
      const actions = rowActionSummaries(row);
      if (!actions.length) return null;
      const matches = !conditions.length || rowMatchesFilters(row.cells, conditions);
      if (conditions.length && !matches) return null;
      const cell = column
        ? (row.cells[column] || '').trim()
        : (Object.values(row.cells || {}).find((v) => String(v).trim()) || '').toString().trim();
      let score = 1;
      if (expected) {
        const left = cell.toLowerCase();
        const right = expected.toLowerCase();
        if (left === right) score = 3;
        else if (left.includes(right) || right.includes(left)) score = 2;
      }
      const actionPart = actions.map((a) => `${a.kind} · ${a.label}`).join(', ');
      const line = column && cell ? `${column}: ${cell} — ${actionPart}` : actionPart;
      return { line, actions, score };
    })
    .filter((row): row is ActionableRowPreview & { score: number } => Boolean(row))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return ranked.map(({ line, actions }) => ({ line, actions }));
}

export function matchingActionableRows(
  table: ObservedTable | undefined,
  conditions: Array<{ column: string; operator: FilterOperator; value: string }> = []
): ObservedRow[] {
  if (!table) return [];
  return table.rows.filter((row) => {
    if (!(row.actions || []).length) return false;
    if (!conditions.length) return true;
    return rowMatchesFilters(row.cells, conditions);
  });
}

export function findRowAction(row: ObservedRow, intent: string) {
  const wanted = genericActionText(intent).toLowerCase();
  const ranked = (row.actions || [])
    .map((a) => ({
      action: a,
      score: scoreSemanticMatch(wanted, genericActionText(a.visibleText || a.intent || '')),
    }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (top && top.score >= 0.9) return top.action;
  return undefined;
}

export function findRowBySnapshot(
  table: ObservedTable | undefined,
  rowId: string,
  cells?: Record<string, string>
): ObservedRow | undefined {
  if (!table) return undefined;
  const byId = table.rows.find((r) => r.rowId === rowId);
  if (byId) return byId;
  if (!cells) return undefined;
  const fingerprint = JSON.stringify(cells);
  return table.rows.find((r) => JSON.stringify(r.cells) === fingerprint);
}

export function distinctActionsFromPreview(
  preview: ActionableRowPreview[]
): Array<{ label: string; kind: RowActionKind; type: RowActionKind }> {
  const seen = new Map<string, { label: string; kind: RowActionKind; type: RowActionKind }>();
  for (const row of preview) {
    for (const action of row.actions) {
      const key = `${action.kind}:${action.label.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, { label: action.label, kind: action.kind, type: action.kind });
    }
  }
  return Array.from(seen.values());
}
