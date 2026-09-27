import {
  VerificationDefinition,
  VerificationResultState,
  ObservationResult,
} from '../../types/automation';

export interface VerificationCheckInput {
  definition: VerificationDefinition;
  targetRowId?: string;
  observation: ObservationResult;
  lastOutcomeMessage?: string;
  referenceNumber?: string;
}

export interface VerificationCheckResult {
  state: VerificationResultState;
  referenceNumber?: string;
  reasons: string[];
  errorMessage?: string;
}

export class VerificationEngine {
  verify(input: VerificationCheckInput): VerificationCheckResult {
    const { definition, targetRowId, observation, lastOutcomeMessage, referenceNumber } = input;
    const reasons: string[] = [];
    const condition = definition.successCondition;

    const allText = [
      lastOutcomeMessage || '',
      ...observation.visibleTextSnippets,
      ...observation.headings,
    ].join(' ');

    if (condition.prohibitedErrors && condition.prohibitedErrors.length > 0) {
      for (const errPattern of condition.prohibitedErrors) {
        if (allText.toLowerCase().includes(errPattern.toLowerCase())) {
          return {
            state: 'FAILED',
            errorMessage: `Business outcome failed: Prohibited error condition matched: "${errPattern}" in application response`,
            reasons: [`Application returned error state: "${errPattern}"`],
          };
        }
      }
    }

    let foundRowInTable = false;
    let rowStatus = '';

    for (const table of observation.tables) {
      const row = table.rows.find((r) => r.rowId === targetRowId);
      if (row) {
        foundRowInTable = true;
        rowStatus = row.cells['Status'] || '';
        const observedRef = row.cells['Reference'];

        if (observedRef && !referenceNumber) {
          input.referenceNumber = observedRef;
        }

        reasons.push(`Observed row ${targetRowId} in table "${table.semanticName}": Status = "${rowStatus}"`);
        break;
      }
    }

    if (condition.statusText) {
      const expectedStatus = condition.statusText.toLowerCase();
      const statusMatched =
        rowStatus.toLowerCase().includes(expectedStatus) ||
        (lastOutcomeMessage && lastOutcomeMessage.toLowerCase().includes(expectedStatus));

      if (statusMatched) {
        reasons.push(`Verified expected status condition "${condition.statusText}"`);
      } else if (foundRowInTable) {
        return {
          state: 'FAILED',
          errorMessage: `Row ${targetRowId} status is "${rowStatus}", expected "${condition.statusText}"`,
          reasons,
        };
      }
    }

    let extractedRef = referenceNumber;
    if (condition.requiresReferenceNumber) {
      if (!extractedRef && lastOutcomeMessage) {
        const match = lastOutcomeMessage.match(/SUB-\d+/i);
        if (match) {
          extractedRef = match[0];
        }
      }

      if (extractedRef) {
        if (condition.referencePattern) {
          const regex = new RegExp(condition.referencePattern, 'i');
          if (regex.test(extractedRef)) {
            reasons.push(`Verified submission reference number "${extractedRef}" matches pattern "${condition.referencePattern}"`);
          } else {
            return {
              state: 'FAILED',
              errorMessage: `Extracted reference "${extractedRef}" does not match required pattern "${condition.referencePattern}"`,
              reasons,
            };
          }
        } else {
          reasons.push(`Extracted valid reference number "${extractedRef}"`);
        }
      } else {
        return {
          state: 'UNKNOWN',
          errorMessage: 'Expected transaction reference number was not emitted in application state',
          reasons: [...reasons, 'Reference number absent from verified response'],
        };
      }
    }

    return {
      state: 'PASSED',
      referenceNumber: extractedRef,
      reasons: reasons.length > 0 ? reasons : ['Expected outcome verified successfully against observed application state'],
    };
  }
}

export const verificationEngine = new VerificationEngine();
