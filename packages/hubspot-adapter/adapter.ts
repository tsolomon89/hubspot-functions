import { Client } from '@hubspot/api-client';
import { 
  TransitionIntent, 
  CommercialSubjectRef, 
  OpportunitySnapshot, 
  EvidenceRecord 
} from '../commercial-kernel';
import { logger } from '../observability';
import { QualificationConfig } from '../commercial-kernel/types';

export interface MutationReceipt {
  intentKind: string;
  objectType: string;
  objectId?: string;
  operation: 'CREATE' | 'UPDATE' | 'ASSOCIATE' | 'NOOP';
  verified: boolean;
  error?: string;
}

export function parseHubSpotTimestamp(raw?: any): string | null {
  if (raw === null || raw === undefined || raw === '') return null;

  if (typeof raw === 'number') {
    if (isNaN(raw) || !isFinite(raw) || raw < 0 || raw > 253402300799000) return null;
    try {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  }

  const str = String(raw).trim();
  if (!str) return null;

  if (/^\d+$/.test(str)) {
    const num = Number(str);
    if (isNaN(num) || num < 0 || num > 253402300799000) return null;
    try {
      const d = new Date(num);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  }

  try {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

export class HubspotAdapter {
  private client: Client;

  constructor(accessToken?: string) {
    const token = accessToken || process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
    this.client = new Client({ accessToken: token });
  }

  public getRawClient(): Client {
    return this.client;
  }

  public async loadSubjectSnapshot(subject: CommercialSubjectRef): Promise<Record<string, unknown>> {
    try {
      if (subject.kind === 'CONTACT') {
        const contact = await this.client.crm.contacts.basicApi.getById(subject.key, [
          'email',
          'lifecyclestage',
          'coa_relationship_key',
          'coa_relationship_type',
          'coa_marketing_consent',
          'coa_automation_suppressed'
        ]);
        const props = contact.properties || {};
        return {
          email: props.email,
          lifecycleStage: props.lifecyclestage,
          relationshipKey: props.coa_relationship_key,
          relationshipType: props.coa_relationship_type,
          marketingConsent: props.coa_marketing_consent === 'true' || props.coa_marketing_consent === '1',
          automationSuppressed: props.coa_automation_suppressed === 'true' || props.coa_automation_suppressed === '1'
        };
      } else if (subject.kind === 'COMPANY') {
        const company = await this.client.crm.companies.basicApi.getById(subject.key, [
          'domain',
          'name',
          'lifecyclestage',
          'coa_relationship_key',
          'coa_relationship_type',
          'coa_marketing_consent',
          'coa_automation_suppressed'
        ]);
        const props = company.properties || {};
        return {
          domain: props.domain,
          companyName: props.name,
          lifecycleStage: props.lifecyclestage,
          relationshipKey: props.coa_relationship_key,
          relationshipType: props.coa_relationship_type,
          marketingConsent: props.coa_marketing_consent === 'true' || props.coa_marketing_consent === '1',
          automationSuppressed: props.coa_automation_suppressed === 'true' || props.coa_automation_suppressed === '1'
        };
      }
    } catch (err: any) {
      if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      logger.warn(`Subject ${subject.kind}:${subject.key} not found in HubSpot CRM`);
    }
    return {};
  }

  public async loadLeadSnapshot(leadId: string): Promise<Record<string, unknown>> {
    try {
      const lead = await this.client.crm.objects.leads.basicApi.getById(leadId, [
        'coa_opportunity_key',
        'coa_relationship_key',
        'coa_opportunity_type',
        'coa_cycle_index',
        'hs_pipeline_stage',
        'coa_qualification_state',
        'coa_predecessor_opportunity_key',
        'coa_offering_keys',
        'createdate'
      ]);
      return lead.properties || {};
    } catch (err: any) {
      if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      return {};
    }
  }

  public async loadDealSnapshot(dealId: string): Promise<Record<string, unknown>> {
    try {
      const deal = await this.client.crm.deals.basicApi.getById(dealId, [
        'dealname',
        'amount',
        'dealstage',
        'pipeline',
        'coa_opportunity_key',
        'coa_relationship_key',
        'coa_opportunity_type',
        'coa_cycle_index',
        'coa_qualification_state',
        'coa_predecessor_opportunity_key',
        'coa_predecessor_completed_at',
        'createdate'
      ]);
      return deal.properties || {};
    } catch (err: any) {
      if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      return {};
    }
  }

  public async findOrCreateLeadForSubject(
    subject: CommercialSubjectRef,
    relationshipKey: string,
    relationshipType: string,
    config?: QualificationConfig
  ): Promise<Record<string, any> | null> {
    try {
      const opportunityKey = `${relationshipKey}::LEAD::1`;
      const searchRes = await this.client.crm.objects.leads.searchApi.doSearch({
        filterGroups: [{
          filters: [{
            propertyName: 'coa_opportunity_key',
            operator: 'EQ' as any,
            value: opportunityKey
          }]
        }],
        sorts: [],
        properties: [
          'coa_opportunity_key',
          'coa_relationship_key',
          'coa_opportunity_type',
          'coa_cycle_index',
          'hs_pipeline_stage',
          'coa_qualification_state',
          'coa_offering_keys',
          'createdate'
        ],
        limit: 1,
        after: '0'
      });

      if (searchRes.results && searchRes.results.length > 0) {
        return searchRes.results[0];
      }

      // Create initial managed Lead record with exact associations
      const pipelineId = config?.hubspotPipelines?.leadPipelineId || 'b2b_qualification_lead_pipeline';
      
      const associations: any[] = [];
      if (subject.kind === 'CONTACT') {
        associations.push({
          to: { id: subject.key },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 608 }]
        });
      } else if (subject.kind === 'COMPANY') {
        associations.push({
          to: { id: subject.key },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 610 }]
        });
        if (subject.contactKeys && subject.contactKeys.length > 0) {
          associations.push({
            to: { id: subject.contactKeys[0] },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 608 }]
          });
        }
      }

      const newLead = await this.client.crm.objects.leads.basicApi.create({
        properties: {
          hs_pipeline: pipelineId,
          hs_pipeline_stage: 'mql',
          coa_opportunity_key: opportunityKey,
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

      return newLead;
    } catch (err) {
      logger.error('Failed to find or create Lead record', err);
      return null;
    }
  }

  public async loadAssociatedEvidence(
    subjectKey: string,
    subjectKind: string,
    window: { openedAt?: string; predecessorCompletedAt?: string },
    associatedContactId?: string
  ): Promise<EvidenceRecord[]> {
    const evidence: EvidenceRecord[] = [];
    const lowerBoundaryTime = window.predecessorCompletedAt
      ? new Date(window.predecessorCompletedAt).getTime()
      : (window.openedAt ? new Date(window.openedAt).getTime() : 0);

    const contactIdsToQuery = new Set<string>();
    if (subjectKind === 'contact') {
      contactIdsToQuery.add(subjectKey);
    }
    if (associatedContactId) {
      contactIdsToQuery.add(associatedContactId);
    }

    for (const cId of contactIdsToQuery) {
      let assocResults: any[] = [];
      try {
        const meetingAssocs = await this.client.crm.associations.v4.basicApi.getPage(
          'contact',
          cId,
          'meeting'
        );
        assocResults = meetingAssocs.results || [];
      } catch (err: any) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }

      for (const assoc of assocResults) {
        const meetingId = String(assoc.toObjectId);
        const meeting = await (this.client.crm as any).objects.meetings.basicApi.getById(meetingId, [
          'hs_activity_type',
          'hs_meeting_outcome',
          'hs_timestamp'
        ]);

        const rawTimestamp = meeting.properties.hs_timestamp;
        const parsedTimestamp = parseHubSpotTimestamp(rawTimestamp);

        if (parsedTimestamp) {
          const occurredTime = new Date(parsedTimestamp).getTime();
          if (occurredTime > lowerBoundaryTime) {
            evidence.push({
              id: meeting.id,
              predicate: 'activityExists',
              scope: 'opportunity',
              occurredAt: parsedTimestamp,
              data: {
                activityType: 'MEETING',
                outcome: meeting.properties.hs_meeting_outcome === 'COMPLETED' ? 'COMPLETED' : 'HELD'
              }
            });
          }
        }
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
            
            // Comprehensive Readback verification
            const readback = await this.client.crm.objects.leads.basicApi.getById(targetId, [
              'coa_qualification_state', 
              'hs_pipeline_stage',
              'coa_config_version'
            ]);
            const verified = readback?.properties?.coa_qualification_state === intent.qualificationState &&
                             readback?.properties?.hs_pipeline_stage === targetStage &&
                             readback?.properties?.coa_config_version === (config?.configVersion || '1.0.0');
            
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
            
            // Comprehensive Readback verification
            const readback = await this.client.crm.deals.basicApi.getById(targetId, [
              'coa_qualification_state', 
              'dealstage',
              'coa_config_version'
            ]);
            const verified = readback?.properties?.coa_qualification_state === intent.qualificationState &&
                             readback?.properties?.dealstage === targetStage &&
                             readback?.properties?.coa_config_version === (config?.configVersion || '1.0.0');

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
            sorts: [], properties: ['dealname', 'dealstage', 'pipeline', 'coa_opportunity_key', 'coa_opportunity_type', 'coa_cycle_index'], limit: 1, after: '0'
          });

          // Resolve Contact & Company target IDs
          let expectedContactId: string | undefined = undefined;
          let expectedCompanyId: string | undefined = undefined;

          if (intent.subject?.kind === 'CONTACT') {
            expectedContactId = intent.subject.key;
          } else if (intent.subject?.kind === 'COMPANY') {
            expectedCompanyId = intent.subject.key;
            if (intent.subject.contactKeys && intent.subject.contactKeys.length > 0) {
              expectedContactId = intent.subject.contactKeys[0];
            }
          }

          if (existingDeals.results.length === 0) {
            const relKey = intent.successorKey.split('::')[0];
            const pipelineId = config?.hubspotPipelines?.dealPipelineId || 'b2b_transaction_deal_pipeline';

            // Build native Deal associations (Contact ID, Company ID)
            const associations: any[] = [];
            if (expectedContactId) {
              associations.push({
                to: { id: expectedContactId },
                types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
              });
            }
            if (expectedCompanyId) {
              associations.push({
                to: { id: expectedCompanyId },
                types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 }]
              });
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

            // Comprehensive Read-after-write verification for Deal properties AND exact target IDs
            const readback = await this.client.crm.deals.basicApi.getById(newDeal.id, [
              'dealname',
              'pipeline',
              'dealstage',
              'coa_opportunity_key',
              'coa_relationship_key',
              'coa_opportunity_type',
              'coa_cycle_index',
              'coa_managed',
              'coa_config_version'
            ]);
            const propVerified = readback?.properties?.coa_opportunity_key === intent.successorKey &&
                                 readback?.properties?.coa_opportunity_type === intent.successorType &&
                                 readback?.properties?.coa_cycle_index === String(intent.cycleIndex) &&
                                 readback?.properties?.pipeline === pipelineId &&
                                 readback?.properties?.dealstage === 'open' &&
                                 readback?.properties?.coa_managed === 'true';

            let assocVerified = true;
            if (expectedContactId) {
              const contactAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', newDeal.id, 'contact');
              const found = (contactAssoc.results || []).some(r => String(r.toObjectId) === expectedContactId);
              if (!found) assocVerified = false;
            }
            if (expectedCompanyId) {
              const companyAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', newDeal.id, 'company');
              const found = (companyAssoc.results || []).some(r => String(r.toObjectId) === expectedCompanyId);
              if (!found) assocVerified = false;
            }

            receipts.push({
              intentKind: 'CREATE_SUCCESSOR',
              objectType: 'deal',
              objectId: newDeal.id,
              operation: 'CREATE',
              verified: propVerified
            });
            receipts.push({
              intentKind: 'ASSOCIATE_DEAL_SUBJECT',
              objectType: 'deal',
              objectId: newDeal.id,
              operation: 'ASSOCIATE',
              verified: assocVerified
            });
          } else {
            // Revalidate existing successor Deal properties and exact associations
            const existingDeal = existingDeals.results[0];
            const propVerified = existingDeal.properties?.coa_opportunity_key === intent.successorKey &&
                                 existingDeal.properties?.coa_opportunity_type === intent.successorType;

            let assocVerified = true;
            if (expectedContactId) {
              const contactAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', existingDeal.id, 'contact');
              const found = (contactAssoc.results || []).some(r => String(r.toObjectId) === expectedContactId);
              if (!found) assocVerified = false;
            }
            if (expectedCompanyId) {
              const companyAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', existingDeal.id, 'company');
              const found = (companyAssoc.results || []).some(r => String(r.toObjectId) === expectedCompanyId);
              if (!found) assocVerified = false;
            }

            receipts.push({
              intentKind: 'CREATE_SUCCESSOR',
              objectType: 'deal',
              objectId: existingDeal.id,
              operation: 'NOOP',
              verified: propVerified && assocVerified
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
        const taskSubject = `[Manual Review] ${intent.opportunityKey}`;

        const existingTasks = await this.client.crm.objects.tasks.searchApi.doSearch({
          filterGroups: [{ filters: [{ propertyName: 'hs_task_subject', operator: 'EQ' as any, value: taskSubject }] }],
          sorts: [], properties: ['hs_task_subject'], limit: 1, after: '0'
        });

        if (existingTasks.results.length > 0) {
          receipts.push({
            intentKind: 'CREATE_MANUAL_REVIEW',
            objectType: 'task',
            objectId: existingTasks.results[0].id,
            operation: 'NOOP',
            verified: true
          });
        } else {
          const associations: any[] = [];
          if (intent.subject?.kind === 'CONTACT') {
            associations.push({
              to: { id: intent.subject.key },
              types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }]
            });
          } else if (intent.subject?.kind === 'COMPANY') {
            associations.push({
              to: { id: intent.subject.key },
              types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 192 }]
            });
          }

          const newTask = await this.client.crm.objects.tasks.basicApi.create({
            properties: {
              hs_task_subject: taskSubject,
              hs_task_body: intent.reason,
              hs_task_status: 'NOT_STARTED',
              hs_task_priority: 'HIGH',
              hs_timestamp: String(Date.now())
            },
            associations
          });

          const readback = await this.client.crm.objects.tasks.basicApi.getById(newTask.id, ['hs_task_subject']);
          const verified = readback?.properties?.hs_task_subject === taskSubject;

          receipts.push({
            intentKind: 'CREATE_MANUAL_REVIEW',
            objectType: 'task',
            objectId: newTask.id,
            operation: 'CREATE',
            verified
          });
        }
        appliedIntents++;
      }
    }

    const allVerified = receipts.length === 0 || receipts.every(r => r.verified);
    return { success: allVerified, appliedIntents, receipts };
  }
}
