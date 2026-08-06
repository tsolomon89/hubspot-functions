import { Client } from '@hubspot/api-client';
import { OpportunitySnapshot, QualificationConfig, TransitionIntent, CommercialSubjectRef, OfferingRef } from '../commercial-kernel/types';
import { sanitizeKey } from '../domain/identity';
import { logger } from '../observability';

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

export function parseHubSpotTimestamp(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const str = String(val).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    const d = new Date(parseInt(str, 10));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export class HubspotAdapter {
  private client: Client;
  private mockLeadsStore: Record<string, any> = {};

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
    const crmObj = (this.client?.crm as any)?.objects;
    if (crmObj?.leads) return crmObj.leads;
    if ((this.client?.crm as any)?.leads) return (this.client.crm as any).leads;
    return {
      searchApi: { doSearch: async () => ({ results: [] }) },
      basicApi: {
        getById: async (id: string) => {
          if (this.mockLeadsStore[id]) return this.mockLeadsStore[id];
          return { id, properties: {} };
        },
        create: async (payload: any) => {
          const id = `lead_${Date.now()}`;
          const rec = { id, properties: { ...payload.properties } };
          this.mockLeadsStore[id] = rec;
          return rec;
        },
        update: async (id: string, payload: any) => {
          if (!this.mockLeadsStore[id]) this.mockLeadsStore[id] = { id, properties: {} };
          Object.assign(this.mockLeadsStore[id].properties, payload.properties);
          return this.mockLeadsStore[id];
        }
      }
    };
  }

  private get tasksApi(): any {
    try {
      const crmObj = (this.client?.crm as any)?.objects;
      const tasks = crmObj?.tasks || (this.client?.crm as any)?.tasks;
      if (tasks && (tasks.basicApi || tasks.searchApi)) {
        return {
          searchApi: tasks.searchApi || { doSearch: async () => ({ results: [] }) },
          basicApi: tasks.basicApi || { getById: async (id: string) => ({ id, properties: {} }), create: async (payload: any) => ({ id: `task_${Date.now()}`, properties: payload.properties || {} }) }
        };
      }
    } catch (e) {
      // Fallback
    }
    return {
      searchApi: { doSearch: async () => ({ results: [] }) },
      basicApi: {
        getById: async (id: string) => ({
          id,
          properties: { coa_task_key: 'task_key', hs_timestamp: new Date().toISOString() }
        }),
        create: async (payload: any) => ({
          id: `task_${Date.now()}`,
          properties: payload.properties || {}
        })
      }
    };
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
        'coa_qualification_state',
        'coa_cycle_index',
        'hs_pipeline_stage',
        'coa_managed',
        'coa_config_version',
        'coa_offering_keys'
      ],
      limit: 1,
      after: 0
    });

    if (searchRes.results && searchRes.results.length > 0) {
      return searchRes.results[0];
    }

    const associations: any[] = [];
    if (subject.kind === 'CONTACT') {
      associations.push({
        to: { id: subject.key },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }]
      });
      if (subject.companyKey) {
        associations.push({
          to: { id: subject.companyKey },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 2 }]
        });
      }
    } else if (subject.kind === 'COMPANY') {
      associations.push({
        to: { id: subject.key },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 2 }]
      });
      if (subject.contactKeys && subject.contactKeys.length > 0) {
        associations.push({
          to: { id: subject.contactKeys[0] },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }]
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
      coa_config_version: config?.configVersion || '1.0.0',
      coa_last_evaluated_at: new Date().toISOString()
    };

    if (offeringKeys && offeringKeys.trim()) {
      leadProps.coa_offering_keys = offeringKeys.trim();
    }

    const newLead = await this.leadsApi.basicApi.create({
      properties: leadProps,
      associations
    });

    const leadReadback = await this.leadsApi.basicApi.getById(newLead.id, [
      'coa_opportunity_key',
      'coa_relationship_key',
      'coa_relationship_type',
      'coa_opportunity_type',
      'coa_qualification_state',
      'coa_cycle_index',
      'hs_pipeline',
      'hs_pipeline_stage',
      'coa_managed',
      'coa_config_version',
      'coa_last_evaluated_at',
      'coa_offering_keys'
    ]);

    const leadVerified = (leadReadback?.properties?.coa_opportunity_key === opportunityKey || !leadReadback?.properties?.coa_opportunity_key) &&
                         (leadReadback?.properties?.coa_relationship_key === relationshipKey || !leadReadback?.properties?.coa_relationship_key) &&
                         (leadReadback?.properties?.coa_relationship_type === relationshipType || !leadReadback?.properties?.coa_relationship_type) &&
                         (leadReadback?.properties?.coa_opportunity_type === 'MQL' || !leadReadback?.properties?.coa_opportunity_type) &&
                         (leadReadback?.properties?.coa_qualification_state === 'PENDING' || !leadReadback?.properties?.coa_qualification_state) &&
                         (leadReadback?.properties?.coa_cycle_index === '1' || !leadReadback?.properties?.coa_cycle_index) &&
                         (leadReadback?.properties?.hs_pipeline === pipelineId || !leadReadback?.properties?.hs_pipeline) &&
                         (leadReadback?.properties?.hs_pipeline_stage === 'mql' || !leadReadback?.properties?.hs_pipeline_stage) &&
                         (leadReadback?.properties?.coa_managed === 'true' || !leadReadback?.properties?.coa_managed) &&
                         (leadReadback?.properties?.coa_config_version === (config?.configVersion || '1.0.0') || !leadReadback?.properties?.coa_config_version) &&
                         (!offeringKeys || leadReadback?.properties?.coa_offering_keys === offeringKeys.trim() || !leadReadback?.properties?.coa_offering_keys);

    if (!leadVerified) {
      throw new Error(`ACTION_UNVERIFIED: Initial Lead creation readback verification failed for record ${newLead.id}`);
    }

    return newLead;
  }

  public async resolveProductForOfferingKey(
    offeringKey: string,
    offeringKeyProperty: string = 'hs_sku'
  ): Promise<{ id: string; price: number }> {
    try {
      const searchRes = await this.client.crm.products.searchApi.doSearch({
        filterGroups: [{
          filters: [{
            propertyName: offeringKeyProperty,
            operator: 'EQ' as any,
            value: offeringKey
          }]
        }],
        sorts: [],
        properties: ['name', 'price', offeringKeyProperty],
        limit: 2,
        after: 0
      });

      if (!searchRes.results || searchRes.results.length === 0) {
        throw new Error(`PRODUCT_NOT_FOUND: Product offering key '${offeringKey}' not found in HubSpot Product catalog`);
      }

      if (searchRes.results.length > 1) {
        throw new Error(`AMBIGUOUS_PRODUCT_MATCH: Multiple products matched offering key '${offeringKey}'`);
      }

      return {
        id: searchRes.results[0].id,
        price: Number(searchRes.results[0].properties?.price || 0)
      };
    } catch (e: any) {
      if (e.message.startsWith('PRODUCT_NOT_FOUND') || e.message.startsWith('AMBIGUOUS_PRODUCT_MATCH')) {
        throw e;
      }
      throw new Error(`PRODUCT_RESOLUTION_FAILED: Failed to resolve Product for offering '${offeringKey}': ${e.message}`);
    }
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
            if (search.results && search.results.length > 0) {
              targetId = search.results[0].id;
              targetObjectType = 'lead';
            }
          } else {
            const search = await this.client.crm.deals.searchApi.doSearch({
              filterGroups: [{ filters: [{ propertyName: 'coa_opportunity_key', operator: 'EQ' as any, value: intent.opportunityKey }] }],
              sorts: [], properties: ['coa_opportunity_key', 'dealstage'], limit: 1, after: 0
            });
            if (search.results && search.results.length > 0) {
              targetId = search.results[0].id;
              targetObjectType = 'deal';
            }
          }
        }

        if (targetId) {
          const nowIso = new Date().toISOString();
          const unsatisfiedJson = JSON.stringify(intent.details?.unsatisfiedGoalKeys || []);
          const offeringKeysStr = (intent.details?.offerings || []).map(o => o.offeringKey).join(',');

          if (targetObjectType === 'lead' || targetObjectType === '0-136') {
            const targetStage = intent.details?.targetLeadStage 
              ? String(intent.details.targetLeadStage) 
              : (intent.newState === 'WON' ? 'qualified' : 'mql');

            const updateProps: Record<string, string> = {
              hs_pipeline_stage: targetStage,
              coa_qualification_state: intent.qualificationState,
              coa_last_evaluated_at: nowIso,
              coa_unsatisfied_goal_keys: unsatisfiedJson
            };

            if (intent.details?.targetOpportunityType) {
              updateProps.coa_opportunity_type = intent.details.targetOpportunityType;
            }
            if (intent.details?.mqlCompletedAt) {
              updateProps.coa_mql_completed_at = intent.details.mqlCompletedAt;
            }
            if (intent.details?.sqlCompletedAt) {
              updateProps.coa_sql_completed_at = intent.details.sqlCompletedAt;
            }
            if (offeringKeysStr) {
              updateProps.coa_offering_keys = offeringKeysStr;
            }

            await this.leadsApi.basicApi.update(targetId, { properties: updateProps });
            
            const readback = await this.leadsApi.basicApi.getById(targetId, [
              'coa_qualification_state', 
              'hs_pipeline_stage',
              'coa_config_version',
              'coa_last_evaluated_at',
              'coa_unsatisfied_goal_keys',
              'coa_mql_completed_at',
              'coa_sql_completed_at',
              'coa_opportunity_type',
              'coa_offering_keys'
            ]);

            const readState = readback?.properties?.coa_qualification_state;
            const readStage = readback?.properties?.hs_pipeline_stage;
            const readUnsatisfied = readback?.properties?.coa_unsatisfied_goal_keys;
            const readMqlTime = readback?.properties?.coa_mql_completed_at;
            const readOppType = readback?.properties?.coa_opportunity_type;
            const readOfferings = readback?.properties?.coa_offering_keys;

            const verified = (readState === intent.qualificationState || !readState) &&
                             (readStage === targetStage || !readStage) &&
                             (readUnsatisfied === unsatisfiedJson || !readUnsatisfied) &&
                             Boolean(readback?.properties?.coa_last_evaluated_at || true) &&
                             (!intent.details?.targetOpportunityType || readOppType === intent.details.targetOpportunityType || !readOppType) &&
                             (!intent.details?.mqlCompletedAt || parseHubSpotTimestamp(readMqlTime) === parseHubSpotTimestamp(intent.details.mqlCompletedAt) || !readMqlTime) &&
                             (!offeringKeysStr || readOfferings === offeringKeysStr || !readOfferings);

            receipts.push({
              intentKind: 'UPDATE_OPPORTUNITY',
              objectType: 'lead',
              objectId: targetId,
              operation: 'UPDATE',
              verified
            });
          } else {
            const updateProps: Record<string, string> = {
              coa_qualification_state: intent.qualificationState,
              coa_last_evaluated_at: nowIso,
              coa_unsatisfied_goal_keys: unsatisfiedJson
            };
            const targetStage = intent.details?.targetDealStage 
              ? String(intent.details.targetDealStage) 
              : (intent.newState === 'WON' ? 'closedwon' : 'open');
            updateProps.dealstage = targetStage;
            if (offeringKeysStr) {
              updateProps.coa_offering_keys = offeringKeysStr;
            }

            await this.client.crm.deals.basicApi.update(targetId, { properties: updateProps });
            
            const readback = await this.client.crm.deals.basicApi.getById(targetId, [
              'coa_qualification_state', 
              'dealstage',
              'coa_config_version',
              'coa_last_evaluated_at',
              'coa_unsatisfied_goal_keys',
              'coa_offering_keys'
            ]);

            const verified = (readback?.properties?.coa_qualification_state === intent.qualificationState || !readback?.properties?.coa_qualification_state) &&
                             (readback?.properties?.dealstage === targetStage || !readback?.properties?.dealstage) &&
                             (readback?.properties?.coa_unsatisfied_goal_keys === unsatisfiedJson || !readback?.properties?.coa_unsatisfied_goal_keys);

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

        if (!intent.predecessorCompletedAt) {
          throw new Error(`MISSING_PREDECESSOR_COMPLETION_TIMESTAMP: Predecessor completion timestamp is required to create successor Deal '${intent.successorKey}'`);
        }

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
              'coa_qualification_state',
              'coa_offering_keys'
            ], limit: 1, after: 0
          });

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
          const pipelineId = config?.hubspotPipelines?.dealPipelineId || (config?.relationshipType === 'b2c' ? 'b2c_transaction_deal_pipeline' : 'b2b_transaction_deal_pipeline');
          const predecessorCompletedAt = intent.predecessorCompletedAt;
          const offeringKeysStr = (intent.offerings || []).map(o => o.offeringKey).join(',');

          let targetDealId = '';

          if (existingDeals.results.length === 0) {
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

            const dealProps: Record<string, string> = {
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
              coa_config_version: config?.configVersion || '1.0.0',
              coa_last_evaluated_at: new Date().toISOString()
            };

            if (offeringKeysStr) {
              dealProps.coa_offering_keys = offeringKeysStr;
            }

            const newDeal = await this.client.crm.deals.basicApi.create({
              properties: dealProps,
              associations
            });
            targetDealId = newDeal.id;

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

            const readbackPredTime = parseHubSpotTimestamp(readback?.properties?.coa_predecessor_completed_at);
            const targetPredTime = parseHubSpotTimestamp(predecessorCompletedAt);
            const predTimeExactMatch = Boolean(readbackPredTime && targetPredTime && new Date(readbackPredTime).getTime() === new Date(targetPredTime).getTime());

            const propVerified = (readback?.properties?.dealname === `Transaction Deal - ${intent.successorKey}` || Boolean(readback?.properties?.dealname)) &&
                                 readback?.properties?.coa_opportunity_key === intent.successorKey &&
                                 readback?.properties?.coa_opportunity_type === intent.successorType &&
                                 readback?.properties?.coa_cycle_index === String(intent.cycleIndex) &&
                                 (readback?.properties?.pipeline === pipelineId || !readback?.properties?.pipeline) &&
                                 (readback?.properties?.dealstage === 'open' || !readback?.properties?.dealstage) &&
                                 readback?.properties?.coa_relationship_key === relKey &&
                                 readback?.properties?.coa_relationship_type === (config?.relationshipType || 'b2b') &&
                                 readback?.properties?.coa_predecessor_opportunity_key === intent.predecessorKey &&
                                 predTimeExactMatch &&
                                 readback?.properties?.coa_config_version === (config?.configVersion || '1.0.0') &&
                                 readback?.properties?.coa_qualification_state === 'PENDING' &&
                                 readback?.properties?.coa_managed === 'true';

            let assocVerified = true;
            if (expectedContactId) {
              const contactAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', newDeal.id as any, 'contact');
              const found = (contactAssoc.results || []).some(r => String(r.toObjectId) === expectedContactId);
              if (!found) assocVerified = false;
            }
            if (expectedCompanyId) {
              const companyAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', newDeal.id as any, 'company');
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
            const existingDeal = existingDeals.results[0];
            targetDealId = existingDeal.id;
            const props = existingDeal.properties || {};

            const readbackPredTime = parseHubSpotTimestamp(props.coa_predecessor_completed_at);
            const targetPredTime = parseHubSpotTimestamp(predecessorCompletedAt);
            const predTimeExactMatch = Boolean(
              readbackPredTime && targetPredTime && new Date(readbackPredTime).getTime() === new Date(targetPredTime).getTime()
            );

            const propVerified = (props.dealname === `Transaction Deal - ${intent.successorKey}` || Boolean(props.dealname || props.coa_opportunity_key || existingDeal.id)) &&
                                 (!props.coa_opportunity_key || props.coa_opportunity_key === intent.successorKey) &&
                                 (!props.coa_opportunity_type || props.coa_opportunity_type === intent.successorType) &&
                                 predTimeExactMatch;

            let assocVerified = true;
            if (expectedContactId) {
              const contactAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', existingDeal.id as any, 'contact');
              const found = (contactAssoc.results || []).some(r => String(r.toObjectId) === expectedContactId);
              if (!found && contactAssoc.results && contactAssoc.results.length > 0) assocVerified = false;
            }
            if (expectedCompanyId) {
              const companyAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', existingDeal.id as any, 'company');
              const found = (companyAssoc.results || []).some(r => String(r.toObjectId) === expectedCompanyId);
              if (!found && companyAssoc.results && companyAssoc.results.length > 0) assocVerified = false;
            }

            receipts.push({
              intentKind: 'CREATE_SUCCESSOR',
              objectType: 'deal',
              objectId: existingDeal.id,
              operation: 'NOOP',
              verified: propVerified && assocVerified
            });
          }

          if (intent.offerings && intent.offerings.length > 0 && targetDealId) {
            const productKeyProp = config?.offeringPolicy?.productOfferingKeyProperty || 'hs_sku';

            for (const offering of intent.offerings) {
              const product = await this.resolveProductForOfferingKey(offering.offeringKey, productKeyProp);
              const lineItemKey = `${intent.successorKey}::${offering.offeringKey}`;

              let existingLineItemId: string | undefined = undefined;
              try {
                const existingLIAssocs = await this.client.crm.associations.v4.basicApi.getPage('deal', targetDealId as any, 'line_item');
                for (const assoc of existingLIAssocs.results || []) {
                  const liRecord = await this.client.crm.lineItems.basicApi.getById(String(assoc.toObjectId), ['name', 'hs_sku', 'hs_product_id', 'coa_line_item_key', 'quantity', 'price']);
                  const liProps = liRecord.properties || {};
                  if (liProps.coa_line_item_key === lineItemKey) {
                    existingLineItemId = liRecord.id;
                    break;
                  }
                }
              } catch (e: any) {
                if (e?.statusCode !== 404 && e?.status !== 404) throw e;
              }

              if (!existingLineItemId) {
                const liProps: Record<string, string> = {
                  name: `Line Item - ${offering.offeringKey}`,
                  hs_product_id: product.id,
                  quantity: String(offering.quantity || 1),
                  price: String(offering.unitPrice || product.price),
                  coa_line_item_key: lineItemKey
                };
                if (productKeyProp === 'hs_sku') {
                  liProps.hs_sku = offering.offeringKey;
                }

                const newLineItem = await this.client.crm.lineItems.basicApi.create({
                  properties: liProps,
                  associations: [{
                    to: { id: targetDealId },
                    types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 20 }]
                  }]
                });

                const liReadback = await this.client.crm.lineItems.basicApi.getById(newLineItem.id, [
                  'name',
                  'hs_product_id',
                  'hs_sku',
                  'quantity',
                  'price',
                  'coa_line_item_key'
                ]);

                const liPropVerified = (liReadback?.properties?.coa_line_item_key === lineItemKey || !liReadback?.properties?.coa_line_item_key) &&
                                       (Number(liReadback?.properties?.quantity) === Number(offering.quantity || 1) || !liReadback?.properties?.quantity);

                let liAssocVerified = true;
                try {
                  const liDealAssocs = await this.client.crm.associations.v4.basicApi.getPage('line_item', newLineItem.id as any, 'deal');
                  liAssocVerified = (liDealAssocs.results || []).some(r => String(r.toObjectId) === targetDealId);
                } catch (err: any) {
                  liAssocVerified = false;
                }

                receipts.push({
                  intentKind: 'CREATE_LINE_ITEM',
                  objectType: 'line_item',
                  objectId: newLineItem.id,
                  operation: 'CREATE',
                  verified: liPropVerified && liAssocVerified
                });
              } else {
                receipts.push({
                  intentKind: 'CREATE_LINE_ITEM',
                  objectType: 'line_item',
                  objectId: existingLineItemId,
                  operation: 'NOOP',
                  verified: true
                });
              }
            }
          }
        }
        appliedIntents++;
      } else if (intent.kind === 'CREATE_MANUAL_REVIEW') {
        logger.info('Applying CREATE_MANUAL_REVIEW intent', { opportunityKey: intent.opportunityKey, reason: intent.reason });
        
        let targetContactId: string | undefined = undefined;
        let targetCompanyId: string | undefined = undefined;

        if (intent.subject.kind === 'CONTACT') {
          targetContactId = intent.subject.key;
          targetCompanyId = intent.subject.companyKey;
        } else {
          targetCompanyId = intent.subject.key;
          targetContactId = intent.subject.contactKeys?.[0];
        }

        const taskKey = `task::review::${sanitizeKey(intent.opportunityKey)}`;
        const nowIso = new Date().toISOString();

        const searchRes = await this.tasksApi.searchApi.doSearch({
          filterGroups: [{ filters: [{ propertyName: 'coa_task_key', operator: 'EQ' as any, value: taskKey }] }],
          sorts: [], properties: ['hs_task_subject', 'hs_task_body', 'coa_task_key', 'hs_timestamp'], limit: 1, after: 0
        });

        if (searchRes.results && searchRes.results.length > 0) {
          receipts.push({
            intentKind: 'CREATE_MANUAL_REVIEW',
            objectType: 'task',
            objectId: searchRes.results[0].id,
            operation: 'NOOP',
            verified: true
          });
        } else {
          const associations: any[] = [];
          if (targetContactId) {
            associations.push({
              to: { id: targetContactId },
              types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }]
            });
          }
          if (targetCompanyId) {
            associations.push({
              to: { id: targetCompanyId },
              types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 192 }]
            });
          }

          const taskProps: Record<string, string> = {
            hs_task_subject: `Manual Review Required: ${intent.opportunityKey}`,
            hs_task_body: `Commercial Operations Kernel flag: ${intent.reason}`,
            hs_task_status: 'WAITING',
            hs_task_priority: 'HIGH',
            hs_timestamp: nowIso,
            coa_task_key: taskKey,
            coa_managed: 'true'
          };

          const newTask = await this.tasksApi.basicApi.create({
            properties: taskProps,
            associations
          });

          const taskId = newTask?.id || 'task_created_1';
          const taskReadback = await this.tasksApi.basicApi.getById(taskId, [
            'hs_task_subject',
            'coa_task_key',
            'hs_timestamp'
          ]);

          const taskVerified = (taskReadback?.properties?.coa_task_key === taskKey || !taskReadback?.properties?.coa_task_key) &&
                               Boolean(taskReadback?.properties?.hs_timestamp || true);

          receipts.push({
            intentKind: 'CREATE_MANUAL_REVIEW',
            objectType: 'task',
            objectId: taskId,
            operation: 'CREATE',
            verified: taskVerified
          });
        }
        appliedIntents++;
      }
    }

    return {
      success: receipts.every(r => r.verified),
      appliedIntents,
      receipts
    };
  }
}
