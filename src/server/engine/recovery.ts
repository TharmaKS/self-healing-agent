import { v4 as uuidv4 } from 'uuid';
import {
  HumanInterventionRequest,
  ObservedControl,
  ObservedRow,
  SemanticCapability,
} from '../../types/automation';
import { db } from '../db/database';
import { emitExecutionEvent } from './executionEvents';

export interface RecoveryProposal {
  type: 'CANDIDATE_SUGGESTION' | 'HUMAN_INTERVENTION_REQUIRED' | 'RETRY' | 'ABORT';
  interventionRequest?: HumanInterventionRequest;
  candidates: Array<{ text: string; confidence: number; actionId: string }>;
  message: string;
}

export class RecoveryEngine {
  private activeInterventions: Map<string, {
    request: HumanInterventionRequest;
    resolve: (value: { action: 'CONFIRM' | 'SKIP' | 'STOP' | 'RETRY'; selectedTarget?: string }) => void;
  }> = new Map();

  detectRowRemappingNeed(
    capability: SemanticCapability,
    row: ObservedRow,
    executionId: string
  ): RecoveryProposal {
    const expectedAction = capability.targetDefinition?.semanticIntent || 'Submit';
    const intent = expectedAction.toLowerCase();

    const candidates = row.actions.map((act) => {
      const text = act.visibleText.toLowerCase();
      let confidence = 0.35;
      let reason = 'Same row, different label';
      if (text === intent) {
        confidence = 1;
        reason = 'Exact intent match';
      } else if (text.includes(intent) || intent.includes(text)) {
        confidence = 0.86;
        reason = 'Partial meaning match';
      } else if (/(submit|send|process|dispatch)/.test(text) && /(submit|send|process)/.test(intent)) {
        confidence = 0.82;
        reason = 'Synonym-level match (submit/send/process)';
      } else if (act.role === 'button' || act.controlType === 'button') {
        confidence = 0.55;
        reason = 'Same control type on this row';
      }
      return { text: act.visibleText, confidence, actionId: act.id, reason, selector: act.selectorFallback, role: act.role };
    });

    candidates.sort((a, b) => b.confidence - a.confidence);

    const interventionId = `int-${uuidv4().slice(0, 8)}`;
    const interventionRequest: HumanInterventionRequest = {
      id: interventionId,
      executionId,
      rowId: row.rowId,
      claimId: row.cells['Claim ID'] || row.rowId,
      type: 'CONFIRM_MAPPING',
      expectedIntent: expectedAction,
      candidates,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    return {
      type: 'HUMAN_INTERVENTION_REQUIRED',
      interventionRequest,
      candidates,
      message: `Row ${row.rowId}: Expected action "${expectedAction}" not found. Found ${candidates.length} candidates. Human confirmation required.`,
    };
  }

  detectControlRemappingNeed(
    capability: SemanticCapability,
    controls: ObservedControl[],
    executionId: string
  ): RecoveryProposal {
    const expectedAction = capability.targetDefinition?.semanticIntent || capability.businessName;
    const fakeRow: ObservedRow = {
      rowId: 'page',
      cells: {},
      rawIndex: 0,
      actions: controls.map((c) => ({
        id: c.id,
        intent: c.accessibleName || c.visibleText || c.type,
        visibleText: c.accessibleName || c.visibleText || c.type,
        role: c.role,
        targetId: c.id,
        selectorFallback: c.selectorFallback,
        controlType: c.type,
      })),
    };
    return this.detectRowRemappingNeed({ ...capability, targetDefinition: { ...capability.targetDefinition, semanticIntent: expectedAction } }, fakeRow, executionId);
  }

  registerIntervention(
    request: HumanInterventionRequest,
    resolverFn: (value: { action: 'CONFIRM' | 'SKIP' | 'STOP' | 'RETRY'; selectedTarget?: string }) => void
  ) {
    this.activeInterventions.set(request.id, {
      request,
      resolve: resolverFn,
    });
  }

  resolveIntervention(
    interventionId: string,
    action: 'CONFIRM' | 'SKIP' | 'STOP' | 'RETRY' | 'CHANGE',
    selectedTarget?: string,
    applicationId?: string,
    capabilityId?: string
  ): boolean {
    const item = this.activeInterventions.get(interventionId);
    if (!item) return false;

    const mapped = (action === 'CHANGE' ? 'CONFIRM' : action) as 'CONFIRM' | 'SKIP' | 'STOP' | 'RETRY';
    item.request.status = 'RESOLVED';
    item.request.selectedTarget = selectedTarget;
    item.request.resolutionNote = `Resolved via human response: ${mapped}`;

    item.resolve({ action: mapped, selectedTarget });
    this.activeInterventions.delete(interventionId);
    emitExecutionEvent('HUMAN_INTERVENTION_COMPLETED', { interventionId, action: mapped });
    return true;
  }

  lookupResolvedTarget(applicationId: string, originalTarget: string): string | undefined {
    const hit = db.getExperience(applicationId).find(
      (e) =>
        e.isEnabled &&
        e.originalTarget.toLowerCase() === originalTarget.toLowerCase()
    );
    return hit?.resolvedTarget;
  }

  recordSuccessfulMapping(params: {
    applicationId: string;
    capabilityId?: string;
    pageContext: string;
    originalTarget: string;
    resolvedTarget: string;
  }) {
    const existing = db.getExperience(params.applicationId).find(
      (e) =>
        e.isEnabled &&
        e.originalTarget.toLowerCase() === params.originalTarget.toLowerCase()
    );
    if (existing) {
      existing.resolvedTarget = params.resolvedTarget;
      existing.successCount += 1;
      existing.lastVerifiedAt = new Date().toISOString();
      existing.updatedAt = new Date().toISOString();
      db.saveExperience(existing);
      return existing;
    }
    return db.saveExperience({
      id: `exp-${uuidv4().slice(0, 8)}`,
      applicationId: params.applicationId,
      capabilityId: params.capabilityId,
      pageContext: params.pageContext,
      originalTarget: params.originalTarget,
      resolvedTarget: params.resolvedTarget,
      resolutionMethod: 'HUMAN_CONFIRMATION',
      confidence: 0.95,
      successCount: 1,
      failureCount: 0,
      isEnabled: true,
      lastVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  getActiveInterventions(): HumanInterventionRequest[] {
    return Array.from(this.activeInterventions.values()).map((i) => i.request);
  }

  stopInterventionsForExecution(executionId: string) {
    for (const [id, item] of [...this.activeInterventions.entries()]) {
      if (item.request.executionId !== executionId) continue;
      item.request.status = 'RESOLVED';
      item.request.resolutionNote = 'Stopped by operator';
      item.resolve({ action: 'STOP' });
      this.activeInterventions.delete(id);
      emitExecutionEvent('HUMAN_INTERVENTION_COMPLETED', { interventionId: id, action: 'STOP', executionId });
    }
  }
}

export const recoveryEngine = new RecoveryEngine();
