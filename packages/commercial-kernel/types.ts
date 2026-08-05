export type OpportunityType = 'MQL' | 'SQL' | 'FTP' | 'RTP';
export type OpportunityState = 'OPEN' | 'WON' | 'LOST';
export type QualificationState = 'PENDING' | 'SATISFIED' | 'BLOCKED' | 'MANUAL_REVIEW';

export type CommercialSubjectRef =
  | { kind: 'CONTACT'; key: string }
  | { kind: 'COMPANY'; key: string; contactKeys?: string[] };

export interface EvidenceRecord {
  id: string;
  predicate: string;
  scope: 'relationship' | 'opportunity' | 'sincePredecessorCompletion';
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface OpportunitySnapshot {
  organizationKey: string;
  relationshipKey: string;
  relationshipType: string;
  opportunityKey: string;
  opportunityType: OpportunityType;
  cycleIndex: number;
  openedAt: string;
  predecessorOpportunityKey?: string;
  subject: CommercialSubjectRef;
  facts: Record<string, unknown>;
  evidence: EvidenceRecord[];
}

export interface GoalDefinition {
  key: string;
  name: string;
  predicate: string;
  scope?: 'relationship' | 'opportunity' | 'sincePredecessorCompletion';
  params?: Record<string, unknown>;
  universal?: boolean;
}

export interface QualificationConfig {
  organizationKey: string;
  configVersion: string;
  relationshipType: string;
  goalsByOpportunityType: Record<OpportunityType, GoalDefinition[]>;
  featureFlags?: {
    automationSuppressed?: boolean;
    dryRunTransactions?: boolean;
  };
}

export interface EvaluationResult {
  qualificationState: QualificationState;
  satisfiedGoalKeys: string[];
  unsatisfiedGoalKeys: string[];
  evidenceRefsByGoal: Record<string, string[]>;
  evaluatedConfigVersion: string;
}

export type TransitionIntent =
  | { kind: 'UPDATE_OPPORTUNITY'; opportunityKey: string; newState: OpportunityState; qualificationState: QualificationState; details?: Record<string, unknown> }
  | { kind: 'CREATE_SUCCESSOR'; predecessorKey: string; successorKey: string; successorType: OpportunityType; cycleIndex: number }
  | { kind: 'PROJECT_LIFECYCLE_STAGE'; subject: CommercialSubjectRef; stage: string }
  | { kind: 'CREATE_MANUAL_REVIEW'; opportunityKey: string; reason: string }
  | { kind: 'NOOP'; reason: string };
