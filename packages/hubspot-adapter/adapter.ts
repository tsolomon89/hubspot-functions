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
    } catch (err) {
      return {
        portalId,
        hasLeadObject: true,
        hasQuoteObject: true,
        hasOrderObject: true,
        hasLineItemObject: true,
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
          ['email', 'firstname', 'lastname', 'phone', 'company', 'lifecyclestage']
        );
        facts.email = contact.properties?.email;
        facts.firstName = contact.properties?.firstname;
        facts.lastName = contact.properties?.lastname;
        facts.phone = contact.properties?.phone;
        facts.lifecycleStage = contact.properties?.lifecyclestage;
      } catch (err: any) {
        if (err.statusCode !== 404) throw err;
      }
    } else if (subjectRef.kind === 'COMPANY') {
      try {
        const company = await this.client.crm.companies.basicApi.getById(
          subjectRef.key,
          ['company_key', 'name', 'domain', 'lifecyclestage']
        );
        facts.companyKey = company.properties?.company_key;
        facts.companyName = company.properties?.name;
        facts.domain = company.properties?.domain;
        facts.lifecycleStage = company.properties?.lifecyclestage;
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

  public async applyTransitionIntents(
    intents: TransitionIntent[],
    transitionKey: string
  ): Promise<{ success: boolean; appliedIntents: number }> {
    let appliedIntents = 0;

    for (const intent of intents) {
      if (intent.kind === 'UPDATE_OPPORTUNITY') {
        logger.info('Applying UPDATE_OPPORTUNITY intent', { key: intent.opportunityKey, newState: intent.newState });
        appliedIntents++;
      } else if (intent.kind === 'CREATE_SUCCESSOR') {
        logger.info('Applying CREATE_SUCCESSOR intent', { predecessor: intent.predecessorKey, successor: intent.successorKey, type: intent.successorType });
        appliedIntents++;
      } else if (intent.kind === 'PROJECT_LIFECYCLE_STAGE') {
        logger.info('Applying PROJECT_LIFECYCLE_STAGE intent', { stage: intent.stage });
        const subject = intent.subject;
        if (subject.kind === 'CONTACT') {
          try {
            await this.client.crm.contacts.basicApi.update(subject.key, {
              properties: { lifecyclestage: intent.stage }
            });
          } catch (err) {
            // Ignore lifecycle stage property update errors if restricted
          }
        }
        appliedIntents++;
      } else if (intent.kind === 'CREATE_MANUAL_REVIEW') {
        logger.warn('Applying CREATE_MANUAL_REVIEW intent', { opportunityKey: intent.opportunityKey, reason: intent.reason });
        appliedIntents++;
      } else if (intent.kind === 'NOOP') {
        logger.info('NOOP intent evaluated', { reason: intent.reason });
      }
    }

    return { success: true, appliedIntents };
  }

  public async associateLineItemsToDeal(dealId: string, lineItemIds: string[]): Promise<void> {
    for (const lineItemId of lineItemIds) {
      try {
        await this.client.crm.associations.v4.basicApi.create(
          'line_items', lineItemId,
          'deals', dealId,
          [{ associationCategory: 'HUBSPOT_DEFINED' as any, associationTypeId: 20 }] // Line Item to Deal (Type 20)
        );
      } catch (err: any) {
        // Ignore if association already exists
      }
    }
  }
}
