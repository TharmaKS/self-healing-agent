import { v4 as uuidv4 } from 'uuid';
import { ObservationResult, SemanticCapability, CapabilityType } from '../../types/automation';
import { db } from '../db/database';
import { genericActionText } from './semanticOptions';

function capabilityTypeFor(controlType: string, purpose?: string): CapabilityType {
  const t = (controlType || '').toLowerCase();
  const p = (purpose || '').toLowerCase();
  if (t === 'checkbox' || t === 'radio' || p === 'toggle') return 'TOGGLE';
  if (t === 'select' || t === 'combobox') return 'SELECT';
  if (['text', 'email', 'password', 'tel', 'number', 'search', 'url', 'textarea', 'textbox'].includes(t) || p === 'input' || p === 'username' || p === 'password') {
    return 'ENTER';
  }
  return 'CLICK';
}

export function capabilitiesFromObservation(
  applicationId: string,
  observation: ObservationResult
): SemanticCapability[] {
  const created: SemanticCapability[] = [];
  const now = new Date().toISOString();

  for (const control of observation.controls) {
    if (control.inRowId) continue;
    const selector = control.selectorFallback || '';
    const name = (control.accessibleName || control.visibleText || control.type || 'Control').trim();
    if (!name) continue;

    const type = capabilityTypeFor(control.type, control.semanticPurpose);
    created.push({
      id: `cap-${uuidv4().slice(0, 8)}`,
      applicationId,
      businessName: name.slice(0, 80),
      type,
      pageContext: observation.title,
      semanticDescription: `${type} "${name}" on "${observation.title || observation.url}"`,
      targetDefinition: {
        semanticIntent: name,
        accessibleNamePattern: name,
        visibleTextPattern: name,
        role: control.role,
        controlType: control.type,
        pageContext: observation.title,
        headingContext: control.headingContext,
        selectorFallback: selector,
      },
      inputDefinition:
        type === 'ENTER'
          ? [{ name: 'value', type: 'STRING', required: true, description: `Value for ${name}` }]
          : [],
      outputDefinition: [],
      verificationDefinition: {
        expectedOutcome: `${name} executed on live page`,
        successCondition: {},
      },
      recoveryDefinition: {
        allowHumanRemapping: true,
        maxRetries: 2,
        onFailure: 'HUMAN_REVIEW',
      },
      riskLevel: control.semanticPurpose === 'password' || type === 'CLICK' ? 'MEDIUM' : 'LOW',
      version: 1,
      isPublished: false,
      isRetired: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const table of observation.tables) {
    const uniqueActions = new Map<string, string>();
    for (const row of table.rows) {
      for (const action of row.actions) {
        const name = genericActionText(action.visibleText || action.intent || 'Row action');
        if (!uniqueActions.has(name)) {
          uniqueActions.set(name, action.selectorFallback || '');
        }
      }
    }

    created.push({
      id: `cap-extract-${uuidv4().slice(0, 8)}`,
      applicationId,
      businessName: `Extract ${table.semanticName}`,
      type: 'EXTRACT',
      pageContext: table.semanticName,
      semanticDescription: `Extract ${table.rows.length} rows from "${table.semanticName}"`,
      targetDefinition: {
        semanticIntent: 'Extract table',
        pageContext: table.semanticName,
      },
      inputDefinition: [],
      outputDefinition: [],
      verificationDefinition: {
        expectedOutcome: `${table.rows.length} rows captured`,
        successCondition: {},
      },
      recoveryDefinition: {
        allowHumanRemapping: true,
        maxRetries: 1,
        onFailure: 'CONTINUE',
      },
      riskLevel: 'LOW',
      version: 1,
      isPublished: false,
      isRetired: false,
      createdAt: now,
      updatedAt: now,
    });

    created.push({
      id: `cap-filter-${uuidv4().slice(0, 8)}`,
      applicationId,
      businessName: `Filter ${table.semanticName}`,
      type: 'TABLE_FILTER',
      pageContext: table.semanticName,
      semanticDescription: `Match rows in "${table.semanticName}" by column value`,
      targetDefinition: {
        semanticIntent: 'Filter table rows',
        pageContext: table.semanticName,
      },
      inputDefinition: [],
      outputDefinition: [],
      verificationDefinition: {
        expectedOutcome: 'Matching rows selected',
        successCondition: {},
      },
      recoveryDefinition: {
        allowHumanRemapping: true,
        maxRetries: 1,
        onFailure: 'CONTINUE',
      },
      riskLevel: 'LOW',
      version: 1,
      isPublished: false,
      isRetired: false,
      createdAt: now,
      updatedAt: now,
    });

    for (const [actionName, selector] of uniqueActions) {
      created.push({
        id: `cap-row-${uuidv4().slice(0, 8)}`,
        applicationId,
        businessName: actionName.slice(0, 80),
        type: 'TABLE_ROW_ACTION',
        pageContext: table.semanticName,
        semanticDescription: `Row action "${actionName}" in table "${table.semanticName}"`,
        targetDefinition: {
          semanticIntent: actionName,
          visibleTextPattern: actionName,
          role: 'button',
          isRowAction: true,
          selectorFallback: selector,
        },
        inputDefinition: [],
        outputDefinition: [],
        verificationDefinition: {
          expectedOutcome: `Row action ${actionName} completed`,
          successCondition: {},
        },
        recoveryDefinition: {
          allowHumanRemapping: true,
          maxRetries: 2,
          onFailure: 'CONTINUE',
        },
        riskLevel: 'HIGH',
        version: 1,
        isPublished: false,
        isRetired: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return created;
}

export function persistTaughtCapabilities(capabilities: SemanticCapability[]): void {
  if (!capabilities.length) return;
  db.createCapabilities(
    capabilities.map((c) => ({
      ...c,
      isPublished: true,
      updatedAt: new Date().toISOString(),
    }))
  );
}
