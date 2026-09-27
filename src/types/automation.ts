// Core domain definitions for Intent-Based Enterprise Automation Platform

export type ApplicationType = 'UI' | 'API';
export type ApiAuthType = 'NONE' | 'API_KEY' | 'BASIC' | 'OAUTH2';
export type FilterOperator = 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS';
export type AuthType = 'BROWSER_SESSION' | 'BASIC' | 'OAUTH2' | 'NONE';
export type EnvironmentType = 'DEV' | 'STAGING' | 'PRODUCTION';
export type CapabilityType =
  | 'ENTER'
  | 'CLICK'
  | 'TOGGLE'
  | 'SELECT'
  | 'EXTRACT'
  | 'ASSERT'
  | 'TABLE_OPERATION'
  | 'TABLE_FIND'
  | 'TABLE_FILTER'
  | 'TABLE_ROW_ACTION'
  | 'TABLE_PROCESS_ROWS';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FlowStatus = 'DRAFT' | 'TEST' | 'APPROVED' | 'PRODUCTION' | 'RETIRED';
export type FailurePolicy = 'CONTINUE' | 'STOP' | 'RETRY' | 'HUMAN_REVIEW' | 'SKIP_ROW';
export type VerificationResultState = 'PASSED' | 'FAILED' | 'UNKNOWN';
export type SessionStatus =
  | 'CREATED'
  | 'LAUNCHING'
  | 'ACTIVE'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'FAILED'
  | 'CLOSED'
  | 'EXPIRED';
export type RowStatus =
  | 'MATCHED'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'SKIPPED'
  | 'REQUIRES_REMAP'
  | 'HUMAN_REVIEW';
export type InterventionType =
  | 'CONFIRM_MAPPING'
  | 'SELECT_TARGET'
  | 'APPROVE_ACTION'
  | 'RETRY'
  | 'SKIP_ROW'
  | 'STOP_BATCH';

export type AgentMode = 'BUILD' | 'RUN';

export type BuildState =
  | 'CHOOSE_MODE'
  | 'ASK_FLOW_DEFINITION'
  | 'SELECT_APPLICATION'
  | 'LAUNCH_APPLICATION'
  | 'OBSERVE_PAGE'
  | 'SHOW_CAPABILITIES'
  | 'WAIT_FOR_USER_SELECTION'
  | 'AWAIT_FILTER'
  | 'AWAIT_TABLE_KIND'
  | 'AWAIT_ROW_ACTION'
  | 'AWAIT_PAGINATE'
  | 'AWAIT_NEXT_CONTROL'
  | 'EXECUTE_CAPABILITY'
  | 'VERIFY_CAPABILITY'
  | 'SAVE_CAPABILITY'
  | 'OBSERVE_NEXT_PAGE'
  | 'BUILD_FLOW'
  | 'VALIDATE_FLOW'
  | 'TEST_FLOW'
  | 'SAVE_FLOW'
  | 'BUILD_COMPLETE'
  | 'ASK_WORKFLOW_NAME'
  | 'ASK_WORKFLOW_DESCRIPTION';

export type RunState =
  | 'LIST_FLOWS'
  | 'SELECT_FLOW'
  | 'CONFIRM_RUN'
  | 'LOAD_FLOW'
  | 'ACQUIRE_SESSION'
  | 'EXECUTE_NODE'
  | 'VERIFY_NODE'
  | 'PROCESS_ROWS'
  | 'RECOVER'
  | 'HUMAN_INTERVENTION'
  | 'COMPLETE'
  | 'GENERATE_REPORT'
  | 'SHOW_REPORT';

export interface Application {
  id: string;
  name: string;
  description: string;
  applicationType: ApplicationType;
  baseUrl: string;
  loginUrl?: string;
  authType: AuthType;
  apiAuthType?: ApiAuthType;
  environment: EnvironmentType;
  usernameEnvVar?: string;
  passwordEnvVar?: string;
  apiKeyEnvVar?: string;
  clientIdEnvVar?: string;
  clientSecretEnvVar?: string;
  credentialKeys: string[];
  isActive: boolean;
  browserConfig: {
    viewport?: { width: number; height: number };
    headed?: boolean;
    timeoutMs?: number;
  };
  supportedMechanisms: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationSession {
  id: string;
  applicationId: string;
  browserId?: string;
  contextId?: string;
  pageId?: string;
  status: SessionStatus;
  currentUrl?: string;
  authenticatedAs?: string;
  startedAt: string;
  lastActivityAt: string;
  metadata?: Record<string, unknown>;
}

export interface ObservedControl {
  id: string;
  type: string;
  role?: string;
  visibleText?: string;
  accessibleName?: string;
  semanticPurpose?: string;
  pageContext?: string;
  headingContext?: string;
  attributes?: Record<string, string>;
  enabled?: boolean;
  visible?: boolean;
  selectorFallback?: string;
  inRowId?: string;
}

export interface TableRowAction {
  id: string;
  intent: string;
  visibleText: string;
  role?: string;
  targetId: string;
  selectorFallback?: string;
  controlType?: string;
}

export interface ObservedRow {
  rowId: string;
  cells: Record<string, string>;
  actions: TableRowAction[];
  rawIndex: number;
}

export interface ObservedTable {
  id: string;
  semanticName: string;
  columns: string[];
  rows: ObservedRow[];
  totalRows?: number;
  currentPage?: number;
  hasPagination?: boolean;
}

export interface ObservationResult {
  url: string;
  title: string;
  headings: string[];
  visibleTextSnippets: string[];
  controls: ObservedControl[];
  tables: ObservedTable[];
  capturedAt: string;
  screenshotUrl?: string;
  mode: 'LIVE_BROWSER' | 'STATIC_OBSERVATION';
}

export interface TargetDefinition {
  semanticIntent: string;
  accessibleNamePattern?: string;
  visibleTextPattern?: string;
  role?: string;
  controlType?: string;
  pageContext?: string;
  headingContext?: string;
  selectorFallback?: string;
  isRowAction?: boolean;
}

export interface InputDefinition {
  name: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'CREDENTIAL_REF';
  required: boolean;
  description?: string;
  defaultValue?: unknown;
}

export interface OutputDefinition {
  name: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'OBJECT';
  description?: string;
}

export interface VerificationDefinition {
  expectedOutcome: string;
  successCondition: {
    statusText?: string;
    requiresReferenceNumber?: boolean;
    referencePattern?: string;
    prohibitedErrors?: string[];
  };
  timeoutMs?: number;
}

export interface RecoveryDefinition {
  allowHumanRemapping: boolean;
  maxRetries: number;
  fallbackCandidates?: string[];
  onFailure: FailurePolicy;
}

export interface SemanticCapability {
  id: string;
  applicationId: string;
  businessName: string;
  type: CapabilityType;
  pageContext?: string;
  semanticDescription: string;
  targetDefinition: TargetDefinition;
  inputDefinition: InputDefinition[];
  outputDefinition: OutputDefinition[];
  verificationDefinition: VerificationDefinition;
  recoveryDefinition: RecoveryDefinition;
  riskLevel: RiskLevel;
  version: number;
  isPublished: boolean;
  isRetired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Candidate {
  control: ObservedControl | TableRowAction;
  score: number;
  semanticMatchScore: number;
  textScore: number;
  roleScore: number;
  reasons: string[];
}

export interface ResolutionResult {
  target?: ObservedControl | TableRowAction;
  confidence: number;
  candidates: Candidate[];
  reasons: string[];
  status: 'RESOLVED' | 'AMBIGUOUS' | 'NOT_FOUND';
}

export interface ExecutionContract {
  capabilityId: string;
  intent: string;
  preconditions: string[];
  allowedAction: string;
  expectedOutcome: string;
  verification: VerificationDefinition;
  failureConditions: string[];
  recovery: RecoveryDefinition;
  riskLevel: RiskLevel;
  requiresHumanApproval: boolean;
  applicationId: string;
  executionMechanism: string;
}

export interface FlowNode {
  id: string;
  type: 'START' | 'END' | 'CAPABILITY' | 'CONDITION' | 'LOOP' | 'APPROVAL' | 'TABLE_PROCESS' | 'CLOSE_BROWSER';
  position: { x: number; y: number };
  data: {
    label: string;
    capabilityId?: string;
    description?: string;
    inputs?: Record<string, unknown>;
    filterConfig?: {
      table?: string;
      conditions?: Array<{ column: string; operator: FilterOperator; value: string }>;
    };
    rowActionIntent?: string;
    paginateOnNext?: boolean;
    nextPageName?: string;
    nextPageSelector?: string;
    rowActionCapabilityId?: string;
    failurePolicy?: FailurePolicy;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface BusinessFlow {
  id: string;
  applicationId: string;
  name: string;
  description: string;
  status: FlowStatus;
  version: number;
  latestTestStatus?: 'PENDING' | 'SUCCESS' | 'FAILED';
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables: Array<{ name: string; type: string; source: 'USER_INPUT' | 'ENVIRONMENT_VARIABLE' | 'FLOW_VARIABLE'; value?: string }>;
  failurePolicy: FailurePolicy;
  isRetired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RowExecutionContext {
  rowId: string;
  claimId?: string;
  payer?: string;
  matchedFilters: Record<string, unknown>;
  currentRow: Record<string, string>;
  rowIndex: number;
  rowStatus: RowStatus;
}

export interface RowExecutionResult {
  executionId: string;
  flowId: string;
  capabilityId?: string;
  applicationId: string;
  sessionId: string;
  rowId: string;
  claimId: string;
  payer: string;
  initialStatus: string;
  finalStatus: string;
  result: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  verificationResult: VerificationResultState;
  recoveryAttempted: boolean;
  recoveryResult?: 'NONE' | 'RECOVERED' | 'FAILED' | 'REMAP_CONFIRMED';
  remappingRequired: boolean;
  remappingConfirmed: boolean;
  errorCode?: string;
  errorMessage?: string;
  referenceNumber?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  cells?: Record<string, string>;
}

export interface ExecutionStep {
  id: string;
  executionId: string;
  capabilityId?: string;
  stepIndex: number;
  stepName: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'RECOVERED';
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  resolvedTarget?: string;
  confidence?: number;
  verificationState?: VerificationResultState;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface HumanInterventionRequest {
  id: string;
  executionId: string;
  rowId?: string;
  claimId?: string;
  type: InterventionType;
  expectedIntent: string;
  candidates: Array<{ text: string; confidence: number; actionId: string; reason?: string; selector?: string; role?: string }>;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  selectedTarget?: string;
  resolutionNote?: string;
  createdAt: string;
}

export interface ExperienceMemoryEntry {
  id: string;
  applicationId: string;
  capabilityId?: string;
  pageContext: string;
  originalTarget: string;
  resolvedTarget: string;
  resolutionMethod: 'HUMAN_CONFIRMATION' | 'HIGH_CONFIDENCE_SEMANTIC' | 'POLICY_APPROVED';
  confidence: number;
  successCount: number;
  failureCount: number;
  isEnabled: boolean;
  lastVerifiedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionRecord {
  id: string;
  flowId: string;
  flowName: string;
  applicationId: string;
  applicationName: string;
  applicationSessionId?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'STOPPED';
  mode: 'TEST' | 'RUN';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  matchedCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  recoveryCount: number;
  remappingCount: number;
  interventionCount: number;
  error?: string;
  csvReportPath?: string;
  steps: ExecutionStep[];
  rowResults: RowExecutionResult[];
  interventions: HumanInterventionRequest[];
}

export interface BatchSummary {
  executionId: string;
  totalMatched: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  recoverySuccessful: number;
  remappingRequired: number;
  remappingConfirmed: number;
  humanInterventions: number;
  durationMs: number;
}

export interface ChatOption {
  id: string;
  label: string;
  action?: string;
  payload?: any;
  description?: string;
  type?: 'primary' | 'secondary' | 'danger' | 'amber';
  badge?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'agent' | 'user' | 'system';
  text: string;
  options?: ChatOption[];
  timestamp: string;
  card?: {
    type: 'CAPABILITY_TEST' | 'WORKFLOW_SUMMARY' | 'BATCH_PROGRESS' | 'REMAP_REQUEST' | 'REPORT_SUMMARY' | 'APP_SELECTION' | 'TABLE_VIEW' | 'FLOW_DEFINITION' | 'FILTER_FORM' | 'ROW_ACTION_PICKER' | 'TABLE_KIND' | 'MODE_CHOICE' | 'OBSERVATION' | 'MATCH_PREVIEW';
    data: any;
  };
}

export interface ConfirmedWorkflowStep {
  id: string;
  name: string;
  capabilityId: string;
  description: string;
  verifiedOutcome?: string;
  confidence?: number;
  testPassed?: boolean;
  selectorFallback?: string;
  filterConfig?: {
    table?: string;
    conditions: Array<{ column: string; operator: FilterOperator; value: string }>;
  };
  rowActionIntent?: string;
  paginateOnNext?: boolean;
  nextPageName?: string;
  nextPageSelector?: string;
}

export interface WorkflowBuildSession {
  id: string;
  workflowName: string;
  description: string;
  applicationId: string;
  currentState: BuildState;
  confirmedCapabilities: SemanticCapability[];
  confirmedSteps: ConfirmedWorkflowStep[];
  variables: Record<string, unknown>;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface DependencyCheckResult {
  hasDependencies: boolean;
  capabilitiesCount: number;
  flowsCount: number;
  referencingFlows: string[];
  message: string;
}

// WebSocket Event Types
export type WebSocketEventType =
  | 'APPLICATION_LAUNCHED'
  | 'SESSION_CREATED'
  | 'SESSION_AUTHENTICATED'
  | 'PAGE_OBSERVED'
  | 'TABLE_OBSERVED'
  | 'CAPABILITY_DISCOVERED'
  | 'FLOW_STARTED'
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'ROW_STARTED'
  | 'ROW_COMPLETED'
  | 'ROW_FAILED'
  | 'TARGET_RESOLUTION_STARTED'
  | 'TARGET_RESOLVED'
  | 'TARGET_AMBIGUOUS'
  | 'TARGET_NOT_FOUND'
  | 'RECOVERY_STARTED'
  | 'RECOVERY_COMPLETED'
  | 'REMAPPING_REQUIRED'
  | 'HUMAN_INTERVENTION_REQUIRED'
  | 'HUMAN_INTERVENTION_COMPLETED'
  | 'VERIFICATION_STARTED'
  | 'VERIFICATION_COMPLETED'
  | 'BATCH_PROGRESS'
  | 'BATCH_COMPLETED'
  | 'EXECUTION_COMPLETED'
  | 'AGENT_MESSAGE_CREATED'
  | 'BUILD_SESSION_UPDATED';

export interface WebSocketMessage {
  type: WebSocketEventType;
  payload: Record<string, unknown>;
  timestamp: string;
  correlationIds?: {
    executionId?: string;
    stepId?: string;
    flowId?: string;
    capabilityId?: string;
    applicationId?: string;
    sessionId?: string;
    rowId?: string;
  };
}
