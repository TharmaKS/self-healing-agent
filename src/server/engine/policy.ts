import { RiskLevel, SemanticCapability } from '../../types/automation';

export interface PolicyEvaluationInput {
  capability: SemanticCapability;
  confidence: number;
  isRemapped: boolean;
  rowId?: string;
  hasValidatedExperience?: boolean;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  requiresHumanApproval: boolean;
  reason: string;
  enforcedAction: 'PROCEED' | 'REQUIRE_HUMAN_APPROVAL' | 'ABORT';
}

export class PolicyEngine {
  evaluate(input: PolicyEvaluationInput): PolicyEvaluationResult {
    const { capability, confidence, isRemapped, hasValidatedExperience } = input;
    const risk = capability.riskLevel;

    if (risk === 'CRITICAL') {
      return {
        allowed: false,
        requiresHumanApproval: true,
        reason: 'Policy safeguard: CRITICAL risk capabilities always require mandatory human approval prior to execution.',
        enforcedAction: 'REQUIRE_HUMAN_APPROVAL',
      };
    }

    if (risk === 'HIGH' && isRemapped && !hasValidatedExperience && confidence < 0.9) {
      return {
        allowed: false,
        requiresHumanApproval: true,
        reason: `HIGH-risk capability "${capability.businessName}" remapped below 90%. Confirm the live control to proceed.`,
        enforcedAction: 'REQUIRE_HUMAN_APPROVAL',
      };
    }

    if (confidence < 0.70) {
      return {
        allowed: false,
        requiresHumanApproval: true,
        reason: `Target resolution confidence (${(confidence * 100).toFixed(0)}%) is below minimum threshold (70%). Autonomous action prohibited.`,
        enforcedAction: 'REQUIRE_HUMAN_APPROVAL',
      };
    }

    if (confidence >= 0.70 && confidence < 0.90 && (risk === 'HIGH' || risk === 'MEDIUM')) {
      return {
        allowed: false,
        requiresHumanApproval: true,
        reason: `Action confidence (${(confidence * 100).toFixed(0)}%) is ambiguous for ${risk}-risk capability. Policy requests human confirmation.`,
        enforcedAction: 'REQUIRE_HUMAN_APPROVAL',
      };
    }

    return {
      allowed: true,
      requiresHumanApproval: false,
      reason: `Policy check passed: ${risk} risk with ${(confidence * 100).toFixed(0)}% verified confidence.`,
      enforcedAction: 'PROCEED',
    };
  }
}

export const policyEngine = new PolicyEngine();
