import { Client } from '@hubspot/api-client';
import { 
  TransitionIntent, 
  QualificationConfig, 
  CommercialSubjectRef 
} from '../commercial-kernel';
import { logger } from '../observability';

export function parseHubSpotTimestamp(val?: string | number | null): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    return new Date(val).toISOString();
  }
  const str = String(val).trim();
  if (!str) return null;

  if (!isNaN(Number(str))) {
    const num = Number(str);
    const date = new Date(num);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }
  return null;
}

export interface VerificationReceipt {
  intentKind: string;
  objectType: string;
  objectId?: string;
  operation: 'CREATE' | 'UPDATE' | 'ASSOCIATE' | 'NOOP';
  verified: boolean;
  error?: string;
}

export interface TransitionExecutionResult {
  success: boolean;
  appliedIntents: number;
  receipts: VerificationReceipt[];
}

export class HubspotAdapter {
  private client: Client;

  constructor(accessTokenOrClient?: string | Client) {
    if (accessTokenOrClient instanceof Client) {
      this.client = accessTokenOrClient;
    } else {
      const token = accessTokenOrClient || process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
      this.client = new Client({ accessToken: token });
    }
  }

  public getRawClient(): Client {
    return this.client;
  }

  private get leadsApi(): any {
    return (this.client.crm.objects as any).leads || (this.client.crm as any).objects?.leads;
  }

  public async findOrCreateLeadForSubject(
    subject: CommercialSubjectRef,
    relationshipKey: string,
    relationshipType: string,
    config?: QualificationConfig,
    offeringKeys?: string
  ): Promise<Record<string, any> | null> {
    const opportunityKey = `${relationshipKey}::LEAD::1`;
    const pipelineId = config?.hubspotPipelines?.leadPipelineId || 'b2b_qualification_lead_pipeline';

    const searchRes = await this.leadsApi.searchApi.doSearch({
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
        'coa_relationship_type',
        'coa_opportunity_type',
        'coa_cycle_index',
        'hs_pipeline',
        'hs_pipeline_stage',
        'coa_qualification_state',
        'coa_managed',
        'coa_offering_keys',
        'createdate'
      ],
      limit: 1,
      after: 0
    });

    if (searchRes.results && searchRes.results.length > 0) {
      const existingLead = searchRes.results[0];
      const props = existingLead.properties || {};

      // If genuine offering input arrives on later invocation, update coa_offering_keys on existing Lead
      if (offeringKeys && offeringKeys.trim() && props.coa_offering_keys !== offeringKeys.trim()) {
        await this.leadsApi.basicApi.update(existingLead.id, {
          properties: { coa_offering_keys: offeringKeys.trim() }
        });
        existingLead.properties.coa_offering_keys = offeringKeys.trim();
      }

      // Revalidate existing Lead properties AND Contact/Company associations authoritatively!
      const propVerified = props.coa_opportunity_key === opportunityKey &&
                           props.coa_relationship_key === relationshipKey &&
                           props.coa_relationship_type === relationshipType &&
                           props.hs_pipeline === pipelineId &&
                           props.coa_managed === 'true';

      let assocVerified = true;
      if (subject.kind === 'CONTACT') {
        try {
          const cAssocs = await this.client.crm.associations.v4.basicApi.getPage('0-136' as any, Number(existingLead.id) || (existingLead.id as any), 'contact');
          if (!(cAssocs.results || []).some(r => String(r.toObjectId) === subject.key)) assocVerified = false;
        } catch { assocVerified = false; }
        if (subject.companyKey) {
          try {
            const compAssocs = await this.client.crm.associations.v4.basicApi.getPage('0-136' as any, Number(existingLead.id) || (existingLead.id as any), 'company');
            if (!(compAssocs.results || []).some(r => String(r.toObjectId) === subject.companyKey)) assocVerified = false;
          } catch { assocVerified = false; }
        }
      } else if (subject.kind === 'COMPANY') {
        try {
          const compAssocs = await this.client.crm.associations.v4.basicApi.getPage('0-136' as any, Number(existingLead.id) || (existingLead.id as any), 'company');
          if (!(compAssocs.results || []).some(r => String(r.toObjectId) === subject.key)) assocVerified = false;
        } catch { assocVerified = false; }
      }

      if (!propVerified || !assocVerified) {
        throw new Error('ACTION_UNVERIFIED: Existing Lead record is malformed or missing associations');
      }

      return existingLead;
    }

    // Create initial managed Lead record with exact Contact AND Company associations
    const associations: any[] = [];
    if (subject.kind === 'CONTACT') {
      associations.push({
        to: { id: subject.key },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 608 }]
      });
      if (subject.companyKey) {
        associations.push({
          to: { id: subject.companyKey },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 610 }]
        });
      }
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

    const leadProps: Record<string, string> = {
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
    };

    if (offeringKeys && offeringKeys.trim()) {
      leadProps.coa_offering_keys = offeringKeys.trim();
    }

    const newLead = await this.leadsApi.basicApi.create({
      properties: leadProps,
      associations
    });

    return newLead;
  }

  public async applyTransitionIntents(
    intents: TransitionIntent[],
    transitionKey: string,
    config?: QualificationConfig
  ): Promise<TransitionExecutionResult> {
    const receipts: VerificationReceipt[] = [];
    let appliedIntents = 0;

    for (const intent of intents) {
      if (intent.kind === 'NOOP') {
        receipts.push({
          intentKind: 'NOOP',
          objectType: 'none',
          operation: 'NOOP',
          verified: true
        });
        appliedIntents++;
      } else if (intent.kind === 'PROJECT_LIFECYCLE_STAGE') {
        logger.info('Applying PROJECT_LIFECYCLE_STAGE intent', { stage: intent.stage });
        const targetType = intent.subject.kind === 'CONTACT' ? 'contacts' : 'companies';
        const targetId = intent.subject.key;
        
        if (targetType === 'contacts') {
          await this.client.crm.contacts.basicApi.update(targetId, {
            properties: { lifecyclestage: intent.stage }
          });
          const readback = await this.client.crm.contacts.basicApi.getById(targetId, ['lifecyclestage']);
          const verified = readback?.properties?.lifecyclestage === intent.stage;
          receipts.push({
            intentKind: 'PROJECT_LIFECYCLE_STAGE',
            objectType: 'contact',
            objectId: targetId,
            operation: 'UPDATE',
            verified
          });
        } else {
          await this.client.crm.companies.basicApi.update(targetId, {
            properties: { lifecyclestage: intent.stage }
          });
          const readback = await this.client.crm.companies.basicApi.getById(targetId, ['lifecyclestage']);
          const verified = readback?.properties?.lifecyclestage === intent.stage;
          receipts.push({
            intentKind: 'PROJECT_LIFECYCLE_STAGE',
            objectType: 'company',
            objectId: targetId,
            operation: 'UPDATE',
            verified
          });
        }
        appliedIntents++;
      } else if (intent.kind === 'UPDATE_OPPORTUNITY') {
        logger.info('Applying UPDATE_OPPORTUNITY intent', { key: intent.opportunityKey, newState: intent.newState });
        
        let targetId = intent.targetRecordId;
        let targetObjectType = (intent.targetObjectType || '').toLowerCase();

        if (!targetId) {
          if (intent.opportunityKey.includes('::LEAD::')) {
            const search = await this.leadsApi.searchApi.doSearch({
              filterGroups: [{ filters: [{ propertyName: 'coa_opportunity_key', operator: 'EQ' as any, value: intent.opportunityKey }] }],
              sorts: [], properties: ['coa_opportunity_key', 'hs_pipeline_stage'], limit: 1, after: 0
            });
            if (search.results.length > 0) {
              targetId = search.results[0].id;
              targetObjectType = 'lead';
            }
          } else {
            const search = await this.client.crm.deals.searchApi.doSearch({
              filterGroups: [{ filters: [{ propertyName: 'coa_opportunity_key', operator: 'EQ' as any, value: intent.opportunityKey }] }],
              sorts: [], properties: ['coa_opportunity_key', 'dealstage'], limit: 1, after: 0
            });
            if (search.results.length > 0) {
              targetId = search.results[0].id;
              targetObjectType = 'deal';
            }
          }
        }

        if (targetId) {
          if (targetObjectType === 'lead' || targetObjectType === '0-136') {
            const targetStage = intent.details?.targetLeadStage 
              ? String(intent.details.targetLeadStage) 
              : (intent.newState === 'WON' ? 'qualified' : 'mql');
            
            await this.leadsApi.basicApi.update(targetId, {
              properties: {
                hs_pipeline_stage: targetStage,
                coa_qualification_state: intent.qualificationState
              }
            });
            
            const readback = await this.leadsApi.basicApi.getById(targetId, [
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
          } else {
            const updateProps: Record<string, string> = {
              coa_qualification_state: intent.qualificationState
            };
            const targetStage = intent.details?.targetDealStage 
              ? String(intent.details.targetDealStage) 
              : (intent.newState === 'WON' ? 'closedwon' : 'open');
            updateProps.dealstage = targetStage;
            await this.client.crm.deals.basicApi.update(targetId, { properties: updateProps });
            
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
            sorts: [], properties: [
              'dealname', 
              'dealstage', 
              'pipeline', 
              'coa_opportunity_key', 
              'coa_relationship_key',
              'coa_relationship_type',
              'coa_opportunity_type', 
              'coa_cycle_index',
              'coa_predecessor_opportunity_key',
              'coa_predecessor_completed_at',
              'coa_managed',
              'coa_config_version',
              'coa_qualification_state'
            ], limit: 1, after: 0
          });

          // Resolve Contact & Company target IDs for BOTH Contact and Company subjects!
          let expectedContactId: string | undefined = undefined;
          let expectedCompanyId: string | undefined = undefined;

          if (intent.subject?.kind === 'CONTACT') {
            expectedContactId = intent.subject.key;
            if (intent.subject.companyKey) {
              expectedCompanyId = intent.subject.companyKey;
            }
          } else if (intent.subject?.kind === 'COMPANY') {
            expectedCompanyId = intent.subject.key;
            if (intent.subject.contactKeys && intent.subject.contactKeys.length > 0) {
              expectedContactId = intent.subject.contactKeys[0];
            }
          }

          const relKey = intent.successorKey.split('::')[0];
          const pipelineId = config?.hubspotPipelines?.dealPipelineId || 'b2b_transaction_deal_pipeline';

          if (existingDeals.results.length === 0) {
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

            const predecessorCompletedAt = new Date().toISOString();
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
                coa_predecessor_completed_at: predecessorCompletedAt,
                coa_managed: 'true',
                coa_config_version: config?.configVersion || '1.0.0'
              },
              associations
            });

            // Comprehensive Readback verification including predecessorCompletedAt, dealname & qualification_state!
            const readback = await this.client.crm.deals.basicApi.getById(newDeal.id, [
              'dealname',
              'pipeline',
              'dealstage',
              'coa_opportunity_key',
              'coa_relationship_key',
              'coa_relationship_type',
              'coa_opportunity_type',
              'coa_cycle_index',
              'coa_predecessor_opportunity_key',
              'coa_predecessor_completed_at',
              'coa_managed',
              'coa_config_version',
              'coa_qualification_state'
            ]);
            const propVerified = readback?.properties?.dealname === `Transaction Deal - ${intent.successorKey}` &&
                                 readback?.properties?.coa_opportunity_key === intent.successorKey &&
                                 readback?.properties?.coa_opportunity_type === intent.successorType &&
                                 readback?.properties?.coa_cycle_index === String(intent.cycleIndex) &&
                                 readback?.properties?.pipeline === pipelineId &&
                                 readback?.properties?.dealstage === 'open' &&
                                 readback?.properties?.coa_relationship_key === relKey &&
                                 readback?.properties?.coa_relationship_type === (config?.relationshipType || 'b2b') &&
                                 readback?.properties?.coa_predecessor_opportunity_key === intent.predecessorKey &&
                                 Boolean(parseHubSpotTimestamp(readback?.properties?.coa_predecessor_completed_at)) &&
                                 readback?.properties?.coa_config_version === (config?.configVersion || '1.0.0') &&
                                 readback?.properties?.coa_qualification_state === 'PENDING' &&
                                 readback?.properties?.coa_managed === 'true';

            let assocVerified = true;
            if (expectedContactId) {
              const contactAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', Number(newDeal.id) || (newDeal.id as any), 'contact');
              const found = (contactAssoc.results || []).some(r => String(r.toObjectId) === expectedContactId);
              if (!found) assocVerified = false;
            }
            if (expectedCompanyId) {
              const companyAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', Number(newDeal.id) || (newDeal.id as any), 'company');
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
            // Revalidate existing successor Deal properties AND exact Contact & Company associations authoritatively!
            const existingDeal = existingDeals.results[0];
            const props = existingDeal.properties || {};

            const propVerified = (props.dealname === `Transaction Deal - ${intent.successorKey}` || Boolean(props.dealname)) &&
                                 props.coa_opportunity_key === intent.successorKey &&
                                 props.coa_opportunity_type === intent.successorType &&
                                 props.coa_cycle_index === String(intent.cycleIndex) &&
                                 props.pipeline === pipelineId &&
                                 props.coa_relationship_key === relKey &&
                                 props.coa_relationship_type === (config?.relationshipType || 'b2b') &&
                                 props.coa_predecessor_opportunity_key === intent.predecessorKey &&
                                 Boolean(parseHubSpotTimestamp(props.coa_predecessor_completed_at)) &&
                                 props.coa_config_version === (config?.configVersion || '1.0.0') &&
                                 props.coa_managed === 'true';

            let assocVerified = true;
            if (expectedContactId) {
              const contactAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', Number(existingDeal.id) || (existingDeal.id as any), 'contact');
              const found = (contactAssoc.results || []).some(r => String(r.toObjectId) === expectedContactId);
              if (!found) assocVerified = false;
            }
            if (expectedCompanyId) {
              const companyAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', Number(existingDeal.id) || (existingDeal.id as any), 'company');
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
          appliedIntents++;
        }
      } else if (intent.kind === 'CREATE_MANUAL_REVIEW') {
        const tasksApi = (this.client.crm.objects as any).tasks || (this.client.crm as any).objects?.tasks;
        const subjectId = intent.subject.key;
        const assocTypeId = intent.subject.kind === 'CONTACT' ? 204 : 192; // Task -> Contact = 204, Task -> Company = 192

        const associations = [{
          to: { id: subjectId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: assocTypeId }]
        }];

        const taskRes = await tasksApi.basicApi.create({
          properties: {
            hs_task_subject: `Manual Review Required: ${intent.reason}`,
            hs_task_status: 'NOT_STARTED',
            hs_task_priority: 'HIGH',
            hs_task_body: `Opportunity key ${intent.opportunityKey} requires manual review. Reason: ${intent.reason}`
          },
          associations
        });

        const readback = await tasksApi.basicApi.getById(taskRes.id, ['hs_task_subject', 'hs_task_status']);
        const verified = Boolean(readback?.properties?.hs_task_subject?.startsWith('Manual Review Required'));

        receipts.push({
          intentKind: 'CREATE_MANUAL_REVIEW',
          objectType: 'task',
          objectId: taskRes.id,
          operation: 'CREATE',
          verified
        });
        appliedIntents++;
      }
    }

    const allVerified = receipts.every(r => r.verified);
    return {
      success: allVerified,
      appliedIntents,
      receipts
    };
  }
}
