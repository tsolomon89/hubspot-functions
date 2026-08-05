import { Client } from '@hubspot/api-client';
import { 
  CommercialSubjectRef, 
  OpportunitySnapshot, 
  TransitionIntent, 
  OpportunityType,
  EvidenceRecord,
  QualificationConfig
} from '../commercial-kernel';
import { logger } from '../observability';

export interface PortalCapabilitySnapshot {
  portalId: number;
  hasLeadObject: boolean;
  hasQuoteObject: boolean;
  hasOrderObject: boolean;
  hasLineItemObject: boolean;
  hasCustomObjects: boolean;
}

export interface MutationReceipt {
  intentKind: string;
  objectType: string;
  objectId?: string;
  operation: 'CREATE' | 'UPDATE' | 'ASSOCIATE' | 'NOOP';
  verified: boolean;
  error?: string;
}

export function parseHubSpotTimestamp(raw: unknown): string {
  if (!raw) return new Date().toISOString();
  if (typeof raw === 'number') {
    return new Date(raw).toISOString();
  }
  const str = String(raw).trim();
  if (!isNaN(Number(str)) && !str.includes('-') && !str.includes('T')) {
    return new Date(Number(str)).toISOString();
  }
  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

export class HubspotAdapter {
  private client: Client;

  constructor(accessToken?: string) {
    this.client = new Client({ accessToken });
  }

  public getRawClient(): Client {
    return this.client;
  }

  public async inspectCapabilities(portalId: number): Promise<PortalCapabilitySnapshot> {
    try {
      const schemas = await this.client.crm.schemas.coreApi.getAll();
      const customObjectTypes = (schemas.results || []).map(s => s.fullyQualifiedName);

      return {
        portalId,
        hasLeadObject: true,
        hasQuoteObject: true,
        hasOrderObject: true,
        hasLineItemObject: true,
        hasCustomObjects: customObjectTypes.length > 0
      };
    } catch (err: any) {
      logger.error('Failed to inspect portal capabilities', err);
      return {
        portalId,
        hasLeadObject: false,
        hasQuoteObject: false,
        hasOrderObject: false,
        hasLineItemObject: false,
        hasCustomObjects: false
      };
    }
  }

  public async findOrCreateLeadForSubject(
    subject: CommercialSubjectRef,
    relationshipKey: string,
    relationshipType: string = 'b2b',
    config?: QualificationConfig
  ): Promise<any> {
    const leadKey = `${relationshipKey}::LEAD::1`;

    try {
      const searchRes = await this.client.crm.objects.leads.searchApi.doSearch({
        filterGroups: [{ filters: [{ propertyName: 'coa_opportunity_key', operator: 'EQ' as any, value: leadKey }] }],
        sorts: [], properties: [
          'hs_pipeline_stage', 'hs_lead_name', 'createdate', 
          'coa_opportunity_key', 'coa_relationship_key', 'coa_relationship_type', 
          'coa_opportunity_type', 'coa_qualification_state', 'coa_cycle_index'
        ], limit: 1, after: '0'
      });

      if (searchRes.results && searchRes.results.length > 0) {
        return { id: searchRes.results[0].id, ...searchRes.results[0].properties };
      }

      // Enforce valid Contact resolution (Lead MUST be associated with a Contact)
      let contactId: string | undefined = undefined;
      let companyId: string | undefined = undefined;

      if (subject.kind === 'CONTACT') {
        contactId = subject.key;
      } else if (subject.kind === 'COMPANY') {
        companyId = subject.key;
        if (subject.contactKeys && subject.contactKeys.length > 0) {
          contactId = subject.contactKeys[0];
        } else {
          // Retrieve associated Contact ID via CRM Associations API
          const assoc = await this.client.crm.associations.v4.basicApi.getPage('companies', subject.key, 'contacts');
          if (assoc.results && assoc.results.length > 0) {
            contactId = String(assoc.results[0].toObjectId);
          } else {
            throw new Error(`NO_ASSOCIATED_CONTACT: Cannot create Lead for Company '${subject.key}' without an associated Contact.`);
          }
        }
      }

      const associations: any[] = [];
      if (contactId) {
        associations.push({
          to: { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 550 }]
        });
      }
      if (companyId) {
        associations.push({
          to: { id: companyId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 552 }]
        });
      }

      const pipelineId = config?.hubspotPipelines?.leadPipelineId || 'b2b_qualification_lead_pipeline';

      const newLead = await this.client.crm.objects.leads.basicApi.create({
        properties: {
          hs_lead_name: `Lead - ${relationshipKey}`,
          pipeline: pipelineId,
          hs_pipeline_stage: 'mql',
          coa_opportunity_key: leadKey,
          coa_relationship_key: relationshipKey,
          coa_relationship_type: relationshipType,
          coa_opportunity_type: 'MQL',
          coa_qualification_state: 'PENDING',
          coa_cycle_index: '1',
          coa_managed: 'true',
          coa_config_version: config?.configVersion || '1.0.0'
        },
        associations
      });

      return { id: newLead.id, ...newLead.properties };
    } catch (err: any) {
      logger.error('Failed to find or create managed Lead', err);
      throw err;
    }
  }

  public async loadSubjectSnapshot(subjectRef: CommercialSubjectRef): Promise<Record<string, unknown>> {
    const facts: Record<string, unknown> = {};

    if (subjectRef.kind === 'CONTACT') {
      const contact = await this.client.crm.contacts.basicApi.getById(
        subjectRef.key,
        ['email', 'firstname', 'lastname', 'phone', 'company', 'lifecyclestage', 'coa_relationship_key', 'coa_relationship_type', 'coa_marketing_consent', 'coa_automation_suppressed']
      );
      facts.email = contact.properties?.email;
      facts.firstName = contact.properties?.firstname;
      facts.lastName = contact.properties?.lastname;
      facts.phone = contact.properties?.phone;
      facts.lifecycleStage = contact.properties?.lifecyclestage;
      facts.relationshipKey = contact.properties?.coa_relationship_key;
      facts.relationshipType = contact.properties?.coa_relationship_type;
      facts.marketingConsent = contact.properties?.coa_marketing_consent === 'true';
      facts.automationSuppressed = contact.properties?.coa_automation_suppressed === 'true';
    } else if (subjectRef.kind === 'COMPANY') {
      const company = await this.client.crm.companies.basicApi.getById(
        subjectRef.key,
        ['coa_relationship_key', 'coa_relationship_type', 'name', 'domain', 'lifecyclestage', 'coa_marketing_consent', 'coa_automation_suppressed']
      );
      facts.companyKey = company.properties?.coa_relationship_key || company.properties?.domain || company.id;
      facts.companyName = company.properties?.name;
      facts.domain = company.properties?.domain;
      facts.lifecycleStage = company.properties?.lifecyclestage;
      facts.relationshipKey = company.properties?.coa_relationship_key;
      facts.relationshipType = company.properties?.coa_relationship_type;
      facts.marketingConsent = company.properties?.coa_marketing_consent === 'true';
      facts.automationSuppressed = company.properties?.coa_automation_suppressed === 'true';

      if (subjectRef.contactKeys && subjectRef.contactKeys.length > 0) {
        const contact = await this.client.crm.contacts.basicApi.getById(
          subjectRef.contactKeys[0],
          ['email', 'firstname', 'lastname', 'phone', 'coa_marketing_consent']
        );
        facts.email = contact.properties?.email;
        facts.contactEmail = contact.properties?.email;
        facts.firstName = contact.properties?.firstname;
        facts.lastName = contact.properties?.lastname;
        if (facts.marketingConsent === undefined) {
          facts.marketingConsent = contact.properties?.coa_marketing_consent === 'true';
        }
      }
    }

    return facts;
  }

  public async loadLeadSnapshot(leadId: string): Promise<Record<string, unknown>> {
    const lead = await this.client.crm.objects.leads.basicApi.getById(
      leadId,
      [
        'hs_pipeline_stage', 'hs_lead_name', 'createdate', 'hs_createdate',
        'coa_opportunity_key', 'coa_relationship_key', 'coa_relationship_type', 
        'coa_opportunity_type', 'coa_qualification_state', 'coa_cycle_index',
        'coa_offering_keys'
      ]
    );
    return lead.properties || {};
  }

  public async loadDealSnapshot(dealId: string): Promise<Record<string, unknown>> {
    const deal = await this.client.crm.deals.basicApi.getById(
      dealId,
      [
        'dealname', 'dealstage', 'pipeline', 'amount', 'createdate', 'hs_createdate',
        'coa_opportunity_key', 'coa_relationship_key', 'coa_relationship_type', 
        'coa_opportunity_type', 'coa_qualification_state', 'coa_cycle_index',
        'coa_predecessor_completed_at'
      ]
    );
    return deal.properties || {};
  }

  public async loadAssociatedEvidence(
    associatedObjectId: string, 
    associatedObjectType: string = 'contact',
    opportunityWindow?: { openedAt?: string; predecessorCompletedAt?: string }
  ): Promise<EvidenceRecord[]> {
    const evidence: EvidenceRecord[] = [];
    if (!associatedObjectId || associatedObjectId === '0') return evidence;

    const fromType = associatedObjectType.toLowerCase() === 'company' ? 'companies' : 'contacts';

    const page = await this.client.crm.associations.v4.basicApi.getPage(
      fromType, 
      associatedObjectId, 
      'meetings'
    );

    const openedAtTime = opportunityWindow?.openedAt ? new Date(opportunityWindow.openedAt).getTime() : 0;
    const predecessorTime = opportunityWindow?.predecessorCompletedAt ? new Date(opportunityWindow.predecessorCompletedAt).getTime() : 0;
    const lowerBoundary = Math.max(openedAtTime, predecessorTime);

    for (const assoc of page.results || []) {
      const meetingId = String(assoc.toObjectId);
      const meeting = await this.client.crm.objects.meetings.basicApi.getById(
        meetingId,
        ['hs_activity_type', 'hs_meeting_outcome', 'hs_timestamp']
      );

      const occurredTime = new Date(parseHubSpotTimestamp(meeting.properties.hs_timestamp)).getTime();
      if (occurredTime > lowerBoundary) {
        evidence.push({
          id: meeting.id,
          predicate: 'activityExists',
          scope: 'opportunity',
          occurredAt: new Date(occurredTime).toISOString(),
          data: {
            activityType: 'MEETING',
            outcome: meeting.properties.hs_meeting_outcome === 'COMPLETED' ? 'COMPLETED' : 'HELD'
          }
        });
      }
    }
    return evidence;
  }

  public async applyTransitionIntents(
    intents: TransitionIntent[],
    correlationKey: string,
    config?: QualificationConfig
  ): Promise<{ success: boolean; appliedIntents: number; receipts: MutationReceipt[] }> {
    let appliedIntents = 0;
    const receipts: MutationReceipt[] = [];

    for (const intent of intents) {
      if (intent.kind === 'UPDATE_OPPORTUNITY') {
        logger.info('Applying UPDATE_OPPORTUNITY intent', { key: intent.opportunityKey, newState: intent.newState });
        
        let targetId = intent.targetRecordId;
        let targetType = intent.targetObjectType;

        if (!targetId) {
          const leadSearch = await this.client.crm.objects.leads.searchApi.doSearch({
            filterGroups: [{ filters: [{ propertyName: 'coa_opportunity_key', operator: 'EQ' as any, value: intent.opportunityKey }] }],
            sorts: [], properties: ['coa_opportunity_key'], limit: 1, after: '0'
          });
          if (leadSearch.results.length > 0) {
            targetId = leadSearch.results[0].id;
            targetType = 'lead';
          } else {
            const dealSearch = await this.client.crm.deals.searchApi.doSearch({
              filterGroups: [{ filters: [{ propertyName: 'coa_opportunity_key', operator: 'EQ' as any, value: intent.opportunityKey }] }],
              sorts: [], properties: ['coa_opportunity_key'], limit: 1, after: '0'
            });
            if (dealSearch.results.length > 0) {
              targetId = dealSearch.results[0].id;
              targetType = 'deal';
            }
          }
        }

        if (targetId && targetType) {
          const updateProps: Record<string, string> = {
            coa_qualification_state: intent.qualificationState,
            coa_last_evaluated_at: new Date().toISOString(),
            coa_config_version: config?.configVersion || '1.0.0'
          };

          if (intent.details?.unsatisfiedGoalKeys) {
            updateProps.coa_unsatisfied_goal_keys = JSON.stringify(intent.details.unsatisfiedGoalKeys);
          }

          if (intent.details?.targetOpportunityType) {
            updateProps.coa_opportunity_type = String(intent.details.targetOpportunityType);
          }

          if (targetType === 'lead') {
            const targetStage = intent.details?.targetLeadStage 
              ? String(intent.details.targetLeadStage) 
              : (intent.newState === 'WON' ? 'qualified' : 'mql');
            updateProps.hs_pipeline_stage = targetStage;
            await this.client.crm.objects.leads.basicApi.update(targetId, { properties: updateProps });
            
            // Readback verification
            const readback = await this.client.crm.objects.leads.basicApi.getById(targetId, ['coa_qualification_state', 'hs_pipeline_stage']);
            const verified = readback?.properties?.coa_qualification_state === intent.qualificationState &&
                             readback?.properties?.hs_pipeline_stage === targetStage;
            
            receipts.push({
              intentKind: 'UPDATE_OPPORTUNITY',
              objectType: 'lead',
              objectId: targetId,
              operation: 'UPDATE',
              verified
            });
          } else if (targetType === 'deal') {
            const targetStage = intent.details?.targetDealStage 
              ? String(intent.details.targetDealStage) 
              : (intent.newState === 'WON' ? 'closedwon' : 'open');
            updateProps.dealstage = targetStage;
            await this.client.crm.deals.basicApi.update(targetId, { properties: updateProps });
            
            // Readback verification
            const readback = await this.client.crm.deals.basicApi.getById(targetId, ['coa_qualification_state', 'dealstage']);
            const verified = readback?.properties?.coa_qualification_state === intent.qualificationState &&
                             readback?.properties?.dealstage === targetStage;

            receipts.push({
              intentKind: 'UPDATE_OPPORTUNITY',
              objectType: 'deal',
              objectId: targetId,
              operation: 'UPDATE',
              verified
            });
          }
        } else {
          receipts.push({
            intentKind: 'UPDATE_OPPORTUNITY',
            objectType: 'unknown',
            operation: 'UPDATE',
            verified: false,
            error: 'Target Lead or Deal record not found for update'
          });
        }
        appliedIntents++;
      } else if (intent.kind === 'CREATE_SUCCESSOR') {
        logger.info('Applying CREATE_SUCCESSOR intent', { predecessor: intent.predecessorKey, successor: intent.successorKey, type: intent.successorType });

        if (config?.featureFlags?.dryRunTransactions) {
          logger.info('dryRunTransactions feature flag enabled; skipping real transaction creation', { successorKey: intent.successorKey });
          receipts.push({
            intentKind: 'CREATE_SUCCESSOR',
            objectType: 'deal',
            operation: 'NOOP',
            verified: true
          });
          appliedIntents++;
          continue;
        }

        if (intent.successorType === 'FTP' || intent.successorType === 'RTP') {
          const existingDeals = await this.client.crm.deals.searchApi.doSearch({
            filterGroups: [{ filters: [{ propertyName: 'coa_opportunity_key', operator: 'EQ' as any, value: intent.successorKey }] }],
            sorts: [], properties: ['dealname', 'coa_opportunity_key'], limit: 1, after: '0'
          });

          if (existingDeals.results.length === 0) {
            const relKey = intent.successorKey.split('::')[0];
            const pipelineId = config?.hubspotPipelines?.dealPipelineId || 'b2b_transaction_deal_pipeline';

            // Build native Deal associations (Contact ID, Company ID)
            const associations: any[] = [];
            if (intent.subject?.kind === 'CONTACT') {
              associations.push({
                to: { id: intent.subject.key },
                types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
              });
            } else if (intent.subject?.kind === 'COMPANY') {
              associations.push({
                to: { id: intent.subject.key },
                types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 }]
              });
              if (intent.subject.contactKeys && intent.subject.contactKeys.length > 0) {
                associations.push({
                  to: { id: intent.subject.contactKeys[0] },
                  types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
                });
              }
            }

            const newDeal = await this.client.crm.deals.basicApi.create({
              properties: {
                dealname: `Transaction Deal - ${intent.successorKey}`,
                pipeline: pipelineId,
                dealstage: 'open',
                coa_opportunity_key: intent.successorKey,
                coa_relationship_key: relKey,
                coa_relationship_type: config?.relationshipType || 'b2b',
                coa_opportunity_type: intent.successorType,
                coa_qualification_state: 'PENDING',
                coa_cycle_index: String(intent.cycleIndex),
                coa_predecessor_opportunity_key: intent.predecessorKey,
                coa_predecessor_completed_at: new Date().toISOString(),
                coa_managed: 'true',
                coa_config_version: config?.configVersion || '1.0.0'
              },
              associations
            });

            // Read-after-write verification
            const readback = await this.client.crm.deals.basicApi.getById(newDeal.id, ['coa_opportunity_key', 'coa_opportunity_type', 'coa_cycle_index']);
            const verified = readback?.properties?.coa_opportunity_key === intent.successorKey &&
                             readback?.properties?.coa_opportunity_type === intent.successorType &&
                             readback?.properties?.coa_cycle_index === String(intent.cycleIndex);

            receipts.push({
              intentKind: 'CREATE_SUCCESSOR',
              objectType: 'deal',
              objectId: newDeal.id,
              operation: 'CREATE',
              verified
            });
            receipts.push({
              intentKind: 'ASSOCIATE_DEAL_SUBJECT',
              objectType: 'deal',
              objectId: newDeal.id,
              operation: 'ASSOCIATE',
              verified: true
            });
          } else {
            receipts.push({
              intentKind: 'CREATE_SUCCESSOR',
              objectType: 'deal',
              objectId: existingDeals.results[0].id,
              operation: 'NOOP',
              verified: true
            });
          }
        }
        appliedIntents++;
      } else if (intent.kind === 'PROJECT_LIFECYCLE_STAGE') {
        logger.info('Applying PROJECT_LIFECYCLE_STAGE intent', { stage: intent.stage });
        const subject = intent.subject;
        if (subject.kind === 'CONTACT') {
          await this.client.crm.contacts.basicApi.update(subject.key, {
            properties: { lifecyclestage: intent.stage }
          });
          const readback = await this.client.crm.contacts.basicApi.getById(subject.key, ['lifecyclestage']);
          const verified = readback?.properties?.lifecyclestage === intent.stage;
          receipts.push({
            intentKind: 'PROJECT_LIFECYCLE_STAGE',
            objectType: 'contact',
            objectId: subject.key,
            operation: 'UPDATE',
            verified
          });
        } else if (subject.kind === 'COMPANY') {
          await this.client.crm.companies.basicApi.update(subject.key, {
            properties: { lifecyclestage: intent.stage }
          });
          const readback = await this.client.crm.companies.basicApi.getById(subject.key, ['lifecyclestage']);
          const verified = readback?.properties?.lifecyclestage === intent.stage;
          receipts.push({
            intentKind: 'PROJECT_LIFECYCLE_STAGE',
            objectType: 'company',
            objectId: subject.key,
            operation: 'UPDATE',
            verified
          });
        }
        appliedIntents++;
      } else if (intent.kind === 'CREATE_MANUAL_REVIEW') {
        logger.warn('Applying CREATE_MANUAL_REVIEW intent', { opportunityKey: intent.opportunityKey, reason: intent.reason });
        const newTask = await this.client.crm.objects.tasks.basicApi.create({
          properties: {
            hs_task_subject: `[Manual Review] ${intent.opportunityKey}`,
            hs_task_body: intent.reason,
            hs_task_status: 'NOT_STARTED',
            hs_task_priority: 'HIGH',
            hs_timestamp: String(Date.now())
          },
          associations: []
        });
        const readback = await this.client.crm.objects.tasks.basicApi.getById(newTask.id, ['hs_task_subject']);
        const verified = Boolean(readback?.id);
        receipts.push({
          intentKind: 'CREATE_MANUAL_REVIEW',
          objectType: 'task',
          objectId: newTask.id,
          operation: 'CREATE',
          verified
        });
        appliedIntents++;
      } else if (intent.kind === 'NOOP') {
        receipts.push({
          intentKind: 'NOOP',
          objectType: 'none',
          operation: 'NOOP',
          verified: true
        });
      }
    }

    const allVerified = receipts.length > 0 && receipts.every(r => r.verified);
    return { success: allVerified, appliedIntents, receipts };
  }

  public async associateLineItemsToDeal(dealId: string, lineItemIds: string[]): Promise<void> {
    for (const lineItemId of lineItemIds) {
      await this.client.crm.associations.v4.basicApi.create(
        'line_items', lineItemId,
        'deals', dealId,
        [{ associationCategory: 'HUBSPOT_DEFINED' as any, associationTypeId: 20 }]
      );
    }
  }
}
