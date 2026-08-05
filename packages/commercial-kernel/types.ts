export type OpportunityType = 'MQL' | 'SQL' | 'FTP' | 'RTP';
export type OpportunityState = 'OPEN' | 'WON' | 'LOST';
export type QualificationState = 'PENDING' | 'SATISFIED' | 'BLOCKED' | 'MANUAL_REVIEW';

export type CommercialSubjectRef =
  | { kind: 'CONTACT'; key: string; companyKey?: string }
  | { kind: 'COMPANY'; key: string; contactKeys?: string[]; companyKey?: string };

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
  opportunityState: OpportunityState;
  cycleIndex: number;
  openedAt: string;
  predecessorOpportunityKey?: string;
  predecessorCompletedAt?: string;
  subject: CommercialSubjectRef;
  facts: Record<string, unknown>;
  evidence: EvidenceRecord[];
}

export interface EvaluationResult {
  qualificationState: QualificationState;
  satisfiedGoalKeys: string[];
  unsatisfiedGoalKeys: string[];
  evidenceRefsByGoal: Record<string, string[]>;
  evaluatedConfigVersion: string;
}

export interface GoalDefinition {
  key: string;
  name: string;
  predicate?: string;
  predicates?: Array<{ predicate: string; value?: any; params?: Record<string, unknown> }>;
  scope?: 'relationship' | 'opportunity' | 'sincePredecessorCompletion';
  params?: Record<string, unknown>;
  universal?: boolean;
}

export interface HubSpotPipelineConfig {
  leadPipelineId?: string;
  dealPipelineId?: string;
  leadStageIds?: Record<string, string>;
  dealStageIds?: Record<string, string>;
  dealStageProbabilities?: Record<string, number>;
}

export interface QualificationConfig {
  organizationKey: string;
  configVersion: string;
  relationshipType: string;
  goalsByOpportunityType: Record<OpportunityType, GoalDefinition[]>;
  hubspotPipelines?: HubSpotPipelineConfig;
  featureFlags?: {
    automationSuppressed?: boolean;
    dryRunTransactions?: boolean;
  };
}

export type TransitionIntent =
  | { kind: 'NOOP'; reason: string }
  | { 
      kind: 'UPDATE_OPPORTUNITY'; 
      opportunityKey: string; 
      newState: OpportunityState; 
      qualificationState: QualificationState;
      targetRecordId?: string;
      targetObjectType?: string;
      details?: { 
        targetOpportunityType?: OpportunityType; 
        targetLeadStage?: string; 
        targetDealStage?: string; 
        mqlCompletedAt?: string;
        unsatisfiedGoalKeys?: string[];
      } 
    }
  | { 
      kind: 'CREATE_SUCCESSOR'; 
      predecessorKey: string; 
      successorKey: string; 
      successorType: OpportunityType; 
      cycleIndex: number; 
      subject?: CommercialSubjectRef;
    }
  | { 
      kind: 'PROJECT_LIFECYCLE_STAGE'; 
      subject: CommercialSubjectRef; 
      stage: string 
    }
  | { 
      kind: 'CREATE_MANUAL_REVIEW'; 
      opportunityKey: string; 
      reason: string; 
      subject: CommercialSubjectRef 
    };
