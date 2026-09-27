import {
  ObservedControl,
  TableRowAction,
  TargetDefinition,
  ResolutionResult,
  Candidate,
  ExperienceMemoryEntry,
} from '../../types/automation';
import { db } from '../db/database';
import { genericActionText } from './semanticOptions';

function stemToken(token: string) {
  const t = token.replace(/['"]/g, '');
  if (t === 'claims') return 'claim';
  if (t === 'payers') return 'payer';
  if (t === 'payors') return 'payor';
  return t;
}

function tokens(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(stemToken)
      .filter((t) => t.length > 1)
  );
}

const SYNONYM_GROUPS = [
  ['send', 'send claim', 'send claims', 'submit', 'submit claim', 'submit claims', 'process', 'dispatch', 'transmit', 'transmit claim', 'transmit claims', 'transit', 'transit claim', 'transit claims'],
  ['payer', 'payor', 'carrier', 'insurer', 'insurance'],
  ['save', 'update', 'apply', 'commit'],
  ['delete', 'remove', 'cancel', 'discard'],
  ['sign in', 'login', 'log in', 'authenticate'],
  ['filter', 'search', 'query', 'find'],
  ['close', 'exit', 'done', 'finish'],
];

export function scoreSemanticMatch(expected: string, actual: string): number {
  const a = genericActionText(expected).toLowerCase().trim();
  const b = genericActionText(actual).toLowerCase().trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;

  let synonym = 0.1;
  for (const group of SYNONYM_GROUPS) {
    const matchExpected = group.some((s) => a.includes(s) || s.includes(a));
    const matchActual = group.some((s) => b.includes(s) || s.includes(b));
    if (matchExpected && matchActual) {
      synonym = 0.78;
      if ((a.includes('send') && (b.includes('transmit') || b.includes('transit'))) || ((a.includes('transmit') || a.includes('transit')) && b.includes('send'))) {
        synonym = 0.82;
      }
      if ((a.includes('submit') && (b.includes('transmit') || b.includes('transit'))) || ((a.includes('transmit') || a.includes('transit')) && b.includes('submit'))) {
        synonym = 0.82;
      }
      if ((a.includes('send') && b.includes('submit')) || (a.includes('submit') && b.includes('send'))) {
        synonym = 0.88;
      }
      if ((a.includes('payer') && b.includes('payor')) || (a.includes('payor') && b.includes('payer'))) {
        synonym = 0.9;
      }
      break;
    }
  }

  const ta = tokens(a);
  const tb = tokens(b);
  let overlap = 0;
  if (ta.size && tb.size) {
    let hit = 0;
    for (const t of ta) if (tb.has(t)) hit += 1;
    overlap = hit / new Set([...ta, ...tb]).size;
  }
  const sharedDomain = [...ta].some((t) => tb.has(t) && ['claim', 'payer', 'payor', 'status', 'row'].includes(t));
  let score = Math.max(synonym, overlap * 0.9);
  if (sharedDomain && synonym >= 0.78) score = Math.max(score, 0.82);
  return Math.min(1, Math.round(score * 100) / 100);
}

export class SemanticTargetResolver {
  private highConfidenceThreshold: number = 0.90;
  private ambiguousThreshold: number = 0.70;

  constructor(highThreshold = 0.90, ambiguousThreshold = 0.70) {
    this.highConfidenceThreshold = highThreshold;
    this.ambiguousThreshold = ambiguousThreshold;
  }

  resolve(
    targetDef: TargetDefinition,
    availableControls: Array<ObservedControl | TableRowAction>,
    options?: {
      targetRowId?: string;
      applicationId?: string;
      pageContext?: string;
      capabilityId?: string;
    }
  ): ResolutionResult {
    const candidates: Candidate[] = [];
    const intentLower = (targetDef.semanticIntent || '').toLowerCase().trim();
    const visibleLower = (targetDef.visibleTextPattern || '').toLowerCase().trim();

    // Look up Experience Memory from MySQL persistent store
    let experienceMapping: ExperienceMemoryEntry | undefined;
    if (options?.applicationId) {
      const expList = db.getExperience(options.applicationId).filter((e) => e.isEnabled);
      experienceMapping = expList.find(
        (e) =>
          e.originalTarget.toLowerCase() === intentLower ||
          (visibleLower && e.originalTarget.toLowerCase() === visibleLower)
      );
    }

    for (const ctrl of availableControls) {
      let text = '';
      let role = '';
      let inRow = '';

      if ('visibleText' in ctrl) {
        text = ctrl.visibleText || '';
      }
      if ('role' in ctrl) {
        role = ctrl.role || '';
      }
      if ('inRowId' in ctrl && ctrl.inRowId) {
        inRow = ctrl.inRowId;
      }

      if (options?.targetRowId) {
        const matchesRow = inRow === options.targetRowId || ('targetId' in ctrl && ctrl.targetId.includes(options.targetRowId));
        if (!matchesRow) {
          continue;
        }
      }

      const textLower = text.toLowerCase().trim();
      const reasons: string[] = [];

      // 1. Text Pattern Matching
      let textScore = 0;
      if (intentLower && textLower === intentLower) {
        textScore = 1.0;
        reasons.push(`Exact match on text: "${text}"`);
      } else if (visibleLower && visibleLower.split('|').some((part) => textLower === part.trim())) {
        textScore = 0.95;
        reasons.push(`Pattern match on visible text: "${text}"`);
      } else if (intentLower && (textLower.includes(intentLower) || intentLower.includes(textLower))) {
        textScore = 0.85;
        reasons.push(`Substring match on text: "${text}"`);
      } else {
        textScore = scoreSemanticMatch(intentLower, textLower);
        if (textScore > 0.1) {
          reasons.push(`Semantic synonym match score: ${textScore.toFixed(2)} between "${intentLower}" and "${text}"`);
        }
      }

      // 2. Role Matching
      let roleScore = 0.5;
      if (targetDef.role) {
        if (role.toLowerCase() === targetDef.role.toLowerCase()) {
          roleScore = 1.0;
          reasons.push(`Role match: ${role}`);
        } else {
          roleScore = 0.2;
          reasons.push(`Role mismatch: expected ${targetDef.role}, found ${role}`);
        }
      } else {
        roleScore = 0.8;
      }

      // 3. Experience Memory boost
      let semanticScore = 0.5;
      if (experienceMapping && experienceMapping.resolvedTarget.toLowerCase() === textLower) {
        semanticScore = 1.0;
        reasons.push(`Validated experience boost: mapped "${experienceMapping.originalTarget}" -> "${experienceMapping.resolvedTarget}" (${experienceMapping.resolutionMethod})`);
      } else if (textScore >= 0.8) {
        semanticScore = 0.9;
      }

      // 4. In-row context
      let contextScore = 0.5;
      if (options?.targetRowId) {
        contextScore = 1.0;
        reasons.push(`Target locked to row ID: ${options.targetRowId}`);
      }

      const totalScore = textScore * 0.40 + semanticScore * 0.30 + contextScore * 0.15 + roleScore * 0.15;

      candidates.push({
        control: ctrl,
        score: Math.min(1.0, totalScore),
        semanticMatchScore: semanticScore,
        textScore,
        roleScore,
        reasons,
      });
    }

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      return {
        confidence: 0,
        candidates: [],
        reasons: ['No matching controls found in current view or row context'],
        status: 'NOT_FOUND',
      };
    }

    const topCandidate = candidates[0];

    if (topCandidate.score >= this.highConfidenceThreshold) {
      return {
        target: topCandidate.control,
        confidence: topCandidate.score,
        candidates,
        reasons: topCandidate.reasons,
        status: 'RESOLVED',
      };
    } else if (topCandidate.score >= this.ambiguousThreshold) {
      return {
        target: topCandidate.control,
        confidence: topCandidate.score,
        candidates,
        reasons: [
          `Confidence (${(topCandidate.score * 100).toFixed(0)}%) falls into AMBIGUOUS band. Human confirmation recommended.`,
          ...topCandidate.reasons,
        ],
        status: 'AMBIGUOUS',
      };
    } else {
      return {
        confidence: topCandidate.score,
        candidates,
        reasons: [
          `Top candidate score (${(topCandidate.score * 100).toFixed(0)}%) is below acceptable threshold.`,
          ...topCandidate.reasons,
        ],
        status: 'NOT_FOUND',
      };
    }
  }
}

export const resolver = new SemanticTargetResolver();
