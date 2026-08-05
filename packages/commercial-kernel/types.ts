export type OpportunityType = 'MQL' | 'SQL' | 'FTP' | 'RTP';
export type OpportunityState = 'OPEN' | 'WON' | 'LOST';
export type QualificationState = 'PENDING' | 'SATISFIED' | 'BLOCKED' | 'MANUAL_REVIEW';

export type CommercialSubjectRef =
  | { kind: 'CONTACT'; key: string; companyKey?: string; phone?: string; email?: string }
  | { kind: 'COMPANY'; key: string; contactKeys?: string[]; companyKey?: string };

export interface OfferingRef {
  offeringKey: string;
  quantity?: number;
  unitPrice?: number;
}

export interface EvidenceRecord {
  id: string;
  predicate: string;
  scope: 'subject' | 'relationship' | 'opportunity' | 'sincePredecessorCompletion';
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
  mqlCompletedAt?: string;
  offerings?: OfferingRef[];
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
  mqlCompletedAt?: string;
}

export interface GoalDefinition {
  key: string;
  name: string;
  predicate: string;
  scope: 'subject' | 'relationship' | 'opportunity' | 'sincePredecessorCompletion';
  params?: Record<string, unknown>;
  conditions?: GoalDefinition[];
  universal?: boolean;
}

export interface HubSpotPipelineConfig {
  leadPipelineId?: string;
  dealPipelineId?: string;
  leadStageIds?: Record<string, string>;
  dealStageIds?: Record<string, string>;
  dealStageProbabilities?: Record<string, number>;
}

export interface OfferingPolicyConfig {
  productOfferingKeyProperty?: string;
  rtpPolicy?: 'carryForward' | 'emptyUntilKnown';
}

export interface QualificationConfig {
  organizationKey: string;
  configVersion: string;
  relationshipType: string;
  goalsByOpportunityType: Record<OpportunityType, GoalDefinition[]>;
  hubspotPipelines?: HubSpotPipelineConfig;
  offeringPolicy?: OfferingPolicyConfig;
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
        offerings?: OfferingRef[];
      } 
    }
  | { 
      kind: 'CREATE_SUCCESSOR'; 
      predecessorKey: string; 
      successorKey: string; 
      successorType: OpportunityType; 
      cycleIndex: number; 
      subject?: CommercialSubjectRef;
      offerings?: OfferingRef[];
      predecessorCompletedAt?: string;
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
