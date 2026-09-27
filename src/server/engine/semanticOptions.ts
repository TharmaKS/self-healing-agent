import {
  ObservationResult,
  ObservedControl,
  ObservedTable,
  ChatOption,
} from '../../types/automation';

export interface SemanticOption extends ChatOption {
  kind: 'CONTROL' | 'ASSERT' | 'TABLE_EXTRACT' | 'TABLE_FILTER' | 'TABLE_ROW_ACTION' | 'REOBSERVE' | 'FINISH';
}

function controlLabel(control: ObservedControl): string {
  const name = (control.accessibleName || control.visibleText || control.type || 'Control').trim();
  const purpose = (control.semanticPurpose || '').toLowerCase();
  if (purpose === 'username') return 'Enter username';
  if (purpose === 'password') return 'Enter password';
  if (purpose === 'action' || control.type === 'submit' || /sign in|log in|login/i.test(name)) {
    return `Click ${name}`;
  }
  if (['text', 'email', 'tel', 'number', 'search', 'url', 'textarea', 'textbox'].includes(control.type)) {
    return `Enter ${name}`;
  }
  if (control.type === 'select' || control.type === 'combobox') return `Select ${name}`;
  if (control.type === 'checkbox' || control.type === 'radio') return `Toggle ${name}`;
  return `Click ${name}`;
}

export type RowActionKind = 'button' | 'link' | 'checkbox';

const KNOWN_ROW_TEXTS: Array<{ match: RegExp; text: string }> = [
  { match: /^transit claims\b/i, text: 'Transit claims' },
  { match: /^transmit claims\b/i, text: 'Transmit claims' },
  { match: /^submit claims\b/i, text: 'Submit claims' },
  { match: /^view claims\b/i, text: 'View claims' },
  { match: /^send claims\b/i, text: 'Send claims' },
  { match: /^send claim\b/i, text: 'Send claim' },
  { match: /^process\b/i, text: 'Process' },
  { match: /^submit\b/i, text: 'Submit' },
  { match: /^view\b/i, text: 'View' },
  { match: /^select row\b/i, text: 'Select row' },
];

export function genericActionText(raw: string): string {
  const t = (raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Row action';
  for (const known of KNOWN_ROW_TEXTS) {
    if (known.match.test(t)) return known.text;
  }
  return t.replace(/\b[\w-]*\d[\w-]*\b/g, '').replace(/\s+/g, ' ').trim() || t;
}

export function rowActionKind(action: { role?: string; controlType?: string }): RowActionKind {
  const role = (action.role || '').toLowerCase();
  const type = (action.controlType || '').toLowerCase();
  if (role === 'checkbox' || type === 'checkbox' || role === 'switch') return 'checkbox';
  if (role === 'link' || type === 'a' || type === 'link') return 'link';
  return 'button';
}

export function distinctRowActions(
  table?: ObservedTable
): Array<{ label: string; kind: RowActionKind; type: RowActionKind }> {
  if (!table) return [];
  const seen = new Map<string, { label: string; kind: RowActionKind; type: RowActionKind }>();
  for (const row of table.rows) {
    for (const action of row.actions) {
      const label = genericActionText(action.visibleText || action.intent || 'Row action');
      const kind = rowActionKind(action);
      const key = `${kind}:${label.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, { label, kind, type: kind });
    }
  }
  return Array.from(seen.values());
}

function pageControlKey(c: ObservedControl): string {
  const text = genericActionText(c.accessibleName || c.visibleText || c.type || '');
  let type = (c.type || 'control').toLowerCase();
  if (type === 'submit' || type === 'button' || type === 'reset') type = 'button';
  return `${type}|${text}`.toLowerCase();
}

function pageControlRank(c: ObservedControl): number {
  const purpose = (c.semanticPurpose || '').toLowerCase();
  const name = (c.accessibleName || c.visibleText || '').trim();
  if (purpose === 'username' || purpose === 'password') return 0;
  if (purpose === 'action' || c.type === 'submit' || /sign in|log in|login|search|submit/i.test(name)) return 1;
  if (name.length > 1 && (c.type === 'button' || c.type === 'link' || c.type === 'submit')) return 2;
  if (['text', 'email', 'tel', 'number', 'search', 'url', 'textarea', 'textbox'].includes(c.type)) return 3;
  if (!name) return 9;
  return 4;
}

export function uniquePageControls(
  observation: ObservationResult,
  mappedSelectors: string[] = [],
  limit = 10
): ObservedControl[] {
  const mapped = new Set(mappedSelectors.filter(Boolean));
  const counts = new Map<string, number>();
  for (const c of observation.controls) {
    if (c.inRowId) continue;
    const key = pageControlKey(c);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const used = new Set<string>();
  const hasTable = Boolean(observation.tables[0]);
  const candidates: ObservedControl[] = [];
  for (const c of observation.controls) {
    if (c.inRowId) continue;
    if (mapped.has(c.selectorFallback || '')) continue;
    const key = pageControlKey(c);
    if (hasTable && (counts.get(key) || 0) >= 2) continue;
    if (used.has(key)) continue;
    used.add(key);
    candidates.push(c);
  }
  candidates.sort((a, b) => pageControlRank(a) - pageControlRank(b));
  return candidates.slice(0, limit);
}

export function isNextPageLabel(raw: string) {
  const t = genericActionText(raw).toLowerCase().trim();
  if (!t || /prev|previous|back/.test(t)) return false;
  if (/^(next|next page|forward)$/.test(t)) return true;
  if (t === '>' || t === '›' || t === '»') return true;
  return /\bnext(\s*page)?\b/.test(t);
}

export function findNextPageControl(observation: ObservationResult): ObservedControl | undefined {
  return paginationControlCandidates(observation).find((c) =>
    isNextPageLabel(c.accessibleName || c.visibleText || c.type || '')
  );
}

function isPagerLabel(raw: string) {
  const t = genericActionText(raw).toLowerCase().trim();
  if (!t) return false;
  if (isNextPageLabel(t)) return true;
  if (/^(page\s*)?\d{1,3}$/.test(t)) return true;
  if (/load more|more results|show more/.test(t)) return true;
  return false;
}

/** Unique table/page pager controls (not per-row actions). Next-like first. */
export function paginationControlCandidates(observation: ObservationResult): ObservedControl[] {
  const counts = new Map<string, number>();
  for (const c of observation.controls) {
    const key = pageControlKey(c);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const used = new Set<string>();
  const out: ObservedControl[] = [];
  for (const c of observation.controls) {
    const purpose = (c.semanticPurpose || '').toLowerCase();
    if (purpose === 'username' || purpose === 'password') continue;
    if (c.enabled === false) continue;
    const label = c.accessibleName || c.visibleText || c.type || '';
    const key = pageControlKey(c);
    if (used.has(key)) continue;
    const duplicate = (counts.get(key) || 0) >= 2;
    if (c.inRowId && duplicate) continue;
    if (c.inRowId && !isPagerLabel(label)) continue;
    const pageLike =
      isPagerLabel(label) ||
      c.type === 'button' ||
      c.type === 'link' ||
      c.type === 'submit';
    if (!pageLike) continue;
    used.add(key);
    out.push(c);
  }
  out.sort((a, b) => {
    const aNext = isNextPageLabel(a.accessibleName || a.visibleText || '') ? 0 : isPagerLabel(a.accessibleName || a.visibleText || '') ? 1 : 2;
    const bNext = isNextPageLabel(b.accessibleName || b.visibleText || '') ? 0 : isPagerLabel(b.accessibleName || b.visibleText || '') ? 1 : 2;
    if (aNext !== bNext) return aNext - bNext;
    return pageControlRank(a) - pageControlRank(b);
  });
  return out.slice(0, 12);
}

export function semanticOptionsFromObservation(
  observation: ObservationResult,
  mappedSelectors: string[] = [],
  opts: { includeTable?: boolean; includePageControls?: boolean } = {}
): SemanticOption[] {
  const options: SemanticOption[] = [];
  const mapped = new Set(mappedSelectors.filter(Boolean));
  const includePageControls = opts.includePageControls !== false;

  if (mapped.size) {
    options.push({
      id: 'cap-finish',
      kind: 'FINISH',
      label: `Finish mapping (${mapped.size} in flow)`,
      type: 'primary',
    });
  }

  if (includePageControls) {
    const pageControls = uniquePageControls(observation, mappedSelectors, 10);
    for (const control of pageControls) {
      options.push({
        id: `obs-${control.id}`,
        kind: 'CONTROL',
        label: controlLabel(control),
        description: `${control.type}${control.headingContext ? ` · ${control.headingContext}` : ''}`,
        type: 'primary',
        payload: { controlId: control.id, selector: control.selectorFallback, purpose: control.semanticPurpose },
      });
    }
  }

  if (opts.includeTable !== false && observation.tables[0]) {
    options.push({
      id: 'sem-table',
      kind: 'TABLE_ROW_ACTION',
      label: 'Table row action',
      description: 'Several questions, then one table capability',
      type: 'primary',
    });
  }

  options.push({
    id: 'obs-refresh',
    kind: 'REOBSERVE',
    label: 'Re-observe current page',
    type: 'secondary',
  });
  if (!mapped.size) {
    options.push({
      id: 'cap-finish',
      kind: 'FINISH',
      label: 'Finish mapping',
      type: 'secondary',
    });
  }

  return options;
}
