import {
  BusinessFlow,
  ExecutionContract,
  FlowNode,
} from '../../types/automation';
import { db } from '../db/database';

export interface CompilationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  orderedNodes: FlowNode[];
  contracts: Record<string, ExecutionContract>;
}

export class ProcessCompiler {
  compile(flow: BusinessFlow): CompilationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const contracts: Record<string, ExecutionContract> = {};

    const app = db.getApplication(flow.applicationId);
    if (!app) {
      errors.push(`Target application ${flow.applicationId} not found in database.`);
    }

    const startNodes = flow.nodes.filter((n) => n.type === 'START');
    const endNodes = flow.nodes.filter((n) => n.type === 'END');

    if (startNodes.length === 0) {
      errors.push('Business flow must contain exactly one START node.');
    } else if (startNodes.length > 1) {
      errors.push(`Multiple START nodes found (${startNodes.length}). Only one entry point allowed.`);
    }

    if (endNodes.length === 0) {
      errors.push('Business flow must contain at least one END node.');
    }

    const adjacency = new Map<string, string[]>();
    for (const node of flow.nodes) {
      adjacency.set(node.id, []);
    }
    for (const edge of flow.edges) {
      if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) {
        errors.push(`Edge ${edge.id} references non-existent node: ${edge.source} -> ${edge.target}`);
      } else {
        adjacency.get(edge.source)!.push(edge.target);
      }
    }

    const reachable = new Set<string>();
    if (startNodes.length === 1) {
      const queue = [startNodes[0].id];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (!reachable.has(curr)) {
          reachable.add(curr);
          const neighbors = adjacency.get(curr) || [];
          for (const n of neighbors) {
            queue.push(n);
          }
        }
      }
    }

    for (const node of flow.nodes) {
      if (!reachable.has(node.id)) {
        errors.push(`Disconnected node detected: "${node.data.label}" (${node.id}) is not reachable from START.`);
      }
    }

    const orderedNodes: FlowNode[] = [];
    if (startNodes.length === 1) {
      let currentId: string | undefined = startNodes[0].id;
      const visited = new Set<string>();

      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const node = flow.nodes.find((n) => n.id === currentId);
        if (node) {
          orderedNodes.push(node);

          if (node.data.capabilityId) {
            const cap = db.getCapability(node.data.capabilityId);
            if (!cap) {
              errors.push(`Node "${node.data.label}" references missing capability: ${node.data.capabilityId}`);
            } else {
              contracts[node.id] = {
                capabilityId: cap.id,
                intent: cap.targetDefinition?.semanticIntent || cap.businessName,
                preconditions: [
                  'Session authenticated and healthy',
                  'Application page context aligned',
                ],
                allowedAction: cap.type,
                expectedOutcome: cap.verificationDefinition?.expectedOutcome || 'Execution successful',
                verification: cap.verificationDefinition || { expectedOutcome: 'Verified', successCondition: {} },
                failureConditions: cap.verificationDefinition?.successCondition?.prohibitedErrors || ['Application timeout'],
                recovery: cap.recoveryDefinition || { allowHumanRemapping: true, maxRetries: 1, onFailure: 'CONTINUE' },
                riskLevel: cap.riskLevel,
                requiresHumanApproval: cap.riskLevel === 'CRITICAL' || cap.riskLevel === 'HIGH',
                applicationId: flow.applicationId,
                executionMechanism: 'SEMANTIC_TARGET_RESOLVER',
              };
            }
          }
        }

        const nextIds: string[] = adjacency.get(currentId) || [];
        currentId = nextIds[0];
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      orderedNodes: errors.length === 0 ? orderedNodes : flow.nodes,
      contracts,
    };
  }
}

export const compiler = new ProcessCompiler();
