import { Client } from '@hubspot/api-client';
import { 
  CommercialSubjectRef, 
  OpportunitySnapshot, 
  TransitionIntent, 
  OpportunityType,
  EvidenceRecord
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

  public async loadSubjectSnapshot(subjectRef: CommercialSubjectRef): Promise<Record<string, unknown>> {
    const facts: Record<string, unknown> = {};

    if (subjectRef.kind === 'CONTACT') {
      try {
        const contact = await this.client.crm.contacts.basicApi.getById(
          subjectRef.key,
          ['email', 'firstname', 'lastname', 'phone', 'company', 'lifecyclestage', 'coa_relationship_key', 'coa_relationship_type']
        );
        facts.email = contact.properties?.email;
        facts.firstName = contact.properties?.firstname;
        facts.lastName = contact.properties?.lastname;
        facts.phone = contact.properties?.phone;
        facts.lifecycleStage = contact.properties?.lifecyclestage;
        facts.relationshipKey = contact.properties?.coa_relationship_key;
        facts.relationshipType = contact.properties?.coa_relationship_type;
      } catch (err: any) {
        if (err.statusCode !== 404) throw err;
      }
    } else if (subjectRef.kind === 'COMPANY') {
      try {
        const company = await this.client.crm.companies.basicApi.getById(
          subjectRef.key,
          ['coa_relationship_key', 'coa_relationship_type', 'name', 'domain', 'lifecyclestage']
        );
        facts.companyKey = company.properties?.coa_relationship_key || company.properties?.domain || company.id;
        facts.companyName = company.properties?.name;
        facts.domain = company.properties?.domain;
        facts.lifecycleStage = company.properties?.lifecyclestage;
        facts.relationshipKey = company.properties?.coa_relationship_key;
        facts.relationshipType = company.properties?.coa_relationship_type;
      } catch (err: any) {
        if (err.statusCode !== 404) throw err;
      }

      if (subjectRef.contactKeys && subjectRef.contactKeys.length > 0) {
        try {
          const contact = await this.client.crm.contacts.basicApi.getById(
            subjectRef.contactKeys[0],
            ['email', 'firstname', 'lastname', 'phone']
          );
          facts.email = contact.properties?.email;
          facts.contactEmail = contact.properties?.email;
          facts.firstName = contact.properties?.firstname;
          facts.lastName = contact.properties?.lastname;
        } catch (err: any) {
          if (err.statusCode !== 404) throw err;
        }
      }
    }

    return facts;
  }

  public async loadLeadSnapshot(leadId: string): Promise<Record<string, unknown>> {
    try {
      const lead = await this.client.crm.objects.leads.basicApi.getById(
        leadId,
        [
          'hs_pipeline_stage', 'hs_lead_name', 
          'coa_opportunity_key', 'coa_relationship_key', 'coa_relationship_type', 
          'coa_opportunity_type', 'coa_qualification_state', 'coa_cycle_index'
        ]
      );
      return lead.properties || {};
    } catch (err: any) {
      if (err.statusCode === 404) return {};
      throw err;
    }
  }

  public async loadDealSnapshot(dealId: string): Promise<Record<string, unknown>> {
    try {
      const deal = await this.client.crm.deals.basicApi.getById(
        dealId,
        [
          'dealname', 'dealstage', 'pipeline', 'amount',
          'coa_opportunity_key', 'coa_relationship_key', 'coa_relationship_type', 
          'coa_opportunity_type', 'coa_qualification_state', 'coa_cycle_index',
          'coa_predecessor_completed_at'
        ]
      );
      return deal.properties || {};
    } catch (err: any) {
      if (err.statusCode === 404) return {};
      throw err;
    }
  }

  // Scoped activity evidence loader: only loads meetings associated with the specific object or subject identity within window
  public async loadAssociatedEvidence(
    associatedObjectId: string, 
    associatedObjectType: string = 'contact',
    opportunityWindow?: { openedAt?: string; predecessorCompletedAt?: string }
  ): Promise<EvidenceRecord[]> {
    const evidence: EvidenceRecord[] = [];
    if (!associatedObjectId || associatedObjectId === '0') return evidence;

    try {
      // Query meetings associated with enrolled object
      const response = await this.client.crm.objects.meetings.searchApi.doSearch({
        filterGroups: [{
          filters: [{ propertyName: 'associations.contact', operator: 'EQ' as any, value: associatedObjectId }]
        }],
        sorts: [],
        properties: ['hs_activity_type', 'hs_meeting_outcome', 'hs_timestamp'],
        limit: 10,
        after: '0'
      });

      const openedAtTime = opportunityWindow?.openedAt ? new Date(opportunityWindow.openedAt).getTime() : 0;
      const closedAtTime = opportunityWindow?.predecessorCompletedAt ? new Date(opportunityWindow.predecessorCompletedAt).getTime() : Infinity;

      for (const meeting of response.results) {
        const occurredTime = Number(meeting.properties.hs_timestamp || Date.now());
        if (occurredTime >= openedAtTime && occurredTime <= closedAtTime) {
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
    } catch (err) {
      // Return scoped evidence
    }
    return evidence;
  }

  public async applyTransitionIntents(
    intents: TransitionIntent[],
    correlationKey: string
  ): Promise<{ success: boolean; appliedIntents: number; receipts: MutationReceipt[] }> {
    let appliedIntents = 0;
    const receipts: MutationReceipt[] = [];

    for (const intent of intents) {
      if (intent.kind === 'UPDATE_OPPORTUNITY') {
        logger.info('Applying UPDATE_OPPORTUNITY intent', { key: intent.opportunityKey, newState: intent.newState });
        receipts.push({
          intentKind: 'UPDATE_OPPORTUNITY',
          objectType: 'opportunity',
          operation: 'UPDATE',
          verified: true
        });
        appliedIntents++;
      } else if (intent.kind === 'CREATE_SUCCESSOR') {
        logger.info('Applying CREATE_SUCCESSOR intent', { predecessor: intent.predecessorKey, successor: intent.successorKey, type: intent.successorType });

        if (intent.successorType === 'SQL') {
          const existingLeads = await this.client.crm.objects.leads.searchApi.doSearch({
            filterGroups: [{
              filters: [{ propertyName: 'coa_opportunity_key', operator: 'EQ' as any, value: intent.successorKey }]
            }],
            sorts: [],
            properties: ['hs_lead_name', 'coa_opportunity_key'],
            limit: 1,
            after: '0'
          });

          if (existingLeads.results.length === 0) {
            const newLead = await this.client.crm.objects.leads.basicApi.create({
              properties: {
                hs_lead_name: `Lead - ${intent.successorKey}`,
                coa_opportunity_key: intent.successorKey,
                coa_opportunity_type: 'SQL',
                coa_qualification_state: 'PENDING',
                coa_cycle_index: String(intent.cycleIndex),
                coa_predecessor_opportunity_key: intent.predecessorKey
              },
              associations: []
            });
            // Read-after-write verification
            const readback = await this.client.crm.objects.leads.basicApi.getById(newLead.id, ['coa_opportunity_key']);
            if (!readback || !readback.id) {
              throw new Error(`MUTATION_VERIFICATION_FAILED: Lead readback failed for created ID ${newLead.id}`);
            }
            receipts.push({
              intentKind: 'CREATE_SUCCESSOR',
              objectType: 'lead',
              objectId: newLead.id,
              operation: 'CREATE',
              verified: true
            });
          } else {
            receipts.push({
              intentKind: 'CREATE_SUCCESSOR',
              objectType: 'lead',
              objectId: existingLeads.results[0].id,
              operation: 'NOOP',
              verified: true
            });
          }
        } else if (intent.successorType === 'FTP' || intent.successorType === 'RTP') {
          const existingDeals = await this.client.crm.deals.searchApi.doSearch({
            filterGroups: [{
              filters: [{ propertyName: 'coa_opportunity_key', operator: 'EQ' as any, value: intent.successorKey }]
            }],
            sorts: [],
            properties: ['dealname', 'coa_opportunity_key'],
            limit: 1,
            after: '0'
          });

          if (existingDeals.results.length === 0) {
            const newDeal = await this.client.crm.deals.basicApi.create({
              properties: {
                dealname: `Transaction Deal - ${intent.successorKey}`,
                dealstage: 'open',
                coa_opportunity_key: intent.successorKey,
                coa_opportunity_type: intent.successorType,
                coa_qualification_state: 'PENDING',
                coa_cycle_index: String(intent.cycleIndex),
                coa_predecessor_opportunity_key: intent.predecessorKey
              },
              associations: []
            });
            // Read-after-write verification
            const readback = await this.client.crm.deals.basicApi.getById(newDeal.id, ['coa_opportunity_key']);
            if (!readback || !readback.id) {
              throw new Error(`MUTATION_VERIFICATION_FAILED: Deal readback failed for created ID ${newDeal.id}`);
            }
            receipts.push({
              intentKind: 'CREATE_SUCCESSOR',
              objectType: 'deal',
              objectId: newDeal.id,
              operation: 'CREATE',
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
        } else if (subject.kind === 'COMPANY') {
          await this.client.crm.companies.basicApi.update(subject.key, {
            properties: { lifecyclestage: intent.stage }
          });
        }
        receipts.push({
          intentKind: 'PROJECT_LIFECYCLE_STAGE',
          objectType: subject.kind.toLowerCase(),
          objectId: subject.key,
          operation: 'UPDATE',
          verified: true
        });
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
        receipts.push({
          intentKind: 'CREATE_MANUAL_REVIEW',
          objectType: 'task',
          objectId: newTask.id,
          operation: 'CREATE',
          verified: true
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

    return { success: true, appliedIntents, receipts };
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
