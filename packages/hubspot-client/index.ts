import { Client } from '@hubspot/api-client';
import { ResolvedIdentity, CommercialDealState, ActivationTask, ManualReviewTask } from '../domain';

export class HubspotClientWrapper {
  private client: Client;

  constructor(accessToken?: string) {
    this.client = new Client({ accessToken });
  }

  public setAccessToken(token: string): void {
    this.client.setAccessToken(token);
  }

  public getRawClient(): Client {
    return this.client;
  }

  public async getCompanyByKey(companyKey: string): Promise<any> {
    const response = await this.client.crm.companies.searchApi.doSearch({
      filterGroups: [{
        filters: [{ propertyName: 'company_key', operator: 'EQ' as any, value: companyKey }]
      }],
      sorts: [],
      properties: ['company_key', 'name', 'domain'],
      limit: 1,
      after: '0'
    });
    return response.results[0] || null;
  }

  public async getContactByEmail(email: string): Promise<any> {
    const response = await this.client.crm.contacts.searchApi.doSearch({
      filterGroups: [{
        filters: [{ propertyName: 'email', operator: 'EQ' as any, value: email }]
      }],
      sorts: [],
      properties: ['email', 'firstname', 'lastname', 'phone'],
      limit: 1,
      after: '0'
    });
    return response.results[0] || null;
  }

  public async getDealByKey(dealKey: string): Promise<any> {
    const response = await this.client.crm.deals.searchApi.doSearch({
      filterGroups: [{
        filters: [{ propertyName: 'deal_key', operator: 'EQ' as any, value: dealKey }]
      }],
      sorts: [],
      properties: [
        'deal_key', 'dealname', 'amount', 'pipeline', 'dealstage', 
        'opportunity_type', 'opportunity_state', 'opportunity_status', 'automation_suppressed'
      ],
      limit: 1,
      after: '0'
    });
    return response.results[0] || null;
  }

  public async upsertCompany(identity: ResolvedIdentity): Promise<string> {
    const existing = await this.getCompanyByKey(identity.companyKey);
    if (existing) {
      return existing.id;
    }

    try {
      const created = await this.client.crm.companies.basicApi.create({
        properties: {
          company_key: identity.companyKey,
          name: identity.companyName,
          domain: identity.domain || ''
        },
        associations: []
      });
      return created.id;
    } catch (err: any) {
      // Race condition protection: If creation fails due to duplicate, search again
      if (err.statusCode === 409 || err.code === 409) {
        const retryFound = await this.getCompanyByKey(identity.companyKey);
        if (retryFound) return retryFound.id;
      }
      throw err;
    }
  }

  public async upsertContact(identity: ResolvedIdentity): Promise<string> {
    const existing = await this.getContactByEmail(identity.contactEmail);
    if (existing) {
      return existing.id;
    }

    try {
      const created = await this.client.crm.contacts.basicApi.create({
        properties: {
          email: identity.contactEmail,
          firstname: identity.contactFirstName || '',
          lastname: identity.contactLastName || '',
          phone: identity.contactPhone || ''
        },
        associations: []
      });
      return created.id;
    } catch (err: any) {
      // Race condition protection: Search again on 409 conflict
      if (err.statusCode === 409 || err.code === 409) {
        const retryFound = await this.getContactByEmail(identity.contactEmail);
        if (retryFound) return retryFound.id;
      }
      throw err;
    }
  }

  public async associateContactToCompany(contactId: string, companyId: string): Promise<void> {
    try {
      await this.client.crm.associations.v4.basicApi.create(
        'contact', contactId,
        'company', companyId,
        [{ associationCategory: 'HUBSPOT_DEFINED' as any, associationTypeId: 1 }] // Primary Contact to Company
      );
    } catch (err: any) {
      // Ignore if association already exists
    }
  }

  public async associateContactToDeal(contactId: string, dealId: string, role: string): Promise<void> {
    const typeIdMap: Record<string, number> = {
      'Decision Maker': 1001,
      'End User': 1002,
      'Influencer': 1003
    };
    const typeId = typeIdMap[role] || 4;

    try {
      await this.client.crm.associations.v4.basicApi.create(
        'contact', contactId,
        'deal', dealId,
        [{ associationCategory: typeId >= 1000 ? ('USER_DEFINED' as any) : ('HUBSPOT_DEFINED' as any), associationTypeId: typeId }]
      );
    } catch (err: any) {
      // Ignore if association already exists
    }
  }

  public async upsertProductDeal(dealState: CommercialDealState, companyId: string): Promise<string> {
    const existing = await this.getDealByKey(dealState.dealKey);
    if (existing) {
      return existing.id;
    }

    try {
      const created = await this.client.crm.deals.basicApi.create({
        properties: {
          deal_key: dealState.dealKey,
          dealname: dealState.dealName,
          product_key: dealState.productKey,
          pipeline: dealState.pipeline,
          dealstage: dealState.opportunityStage,
          opportunity_type: dealState.opportunityType,
          opportunity_state: dealState.opportunityState,
          opportunity_status: dealState.opportunityStatus,
          automation_suppressed: String(dealState.automationSuppressed)
        },
        associations: []
      });

      // Associate Deal to Company (Primary)
      await this.client.crm.associations.v4.basicApi.create(
        'deal', created.id,
        'company', companyId,
        [{ associationCategory: 'HUBSPOT_DEFINED' as any, associationTypeId: 6 }]
      );

      return created.id;
    } catch (err: any) {
      if (err.statusCode === 409 || err.code === 409) {
        const retryFound = await this.getDealByKey(dealState.dealKey);
        if (retryFound) return retryFound.id;
      }
      throw err;
    }
  }

  public async createActivationTask(task: ActivationTask, contactId: string, dealId: string): Promise<string> {
    const created = await this.client.crm.objects.tasks.basicApi.create({
      properties: {
        hs_task_subject: task.subject,
        hs_task_body: `Canonical task code: ${task.taskCode}. Rep options: ${task.routeOptions.join(', ')}`,
        hs_task_status: 'NOT_STARTED',
        hs_task_priority: 'HIGH'
      },
      associations: []
    });

    if (contactId) {
      await this.client.crm.associations.v4.basicApi.create(
        'task', created.id,
        'contact', contactId,
        [{ associationCategory: 'HUBSPOT_DEFINED' as any, associationTypeId: 204 }]
      );
    }
    if (dealId) {
      await this.client.crm.associations.v4.basicApi.create(
        'task', created.id,
        'deal', dealId,
        [{ associationCategory: 'HUBSPOT_DEFINED' as any, associationTypeId: 216 }]
      );
    }

    return created.id;
  }

  public async createManualReviewTask(task: ManualReviewTask, contactId: string): Promise<string> {
    const created = await this.client.crm.objects.tasks.basicApi.create({
      properties: {
        hs_task_subject: task.subject,
        hs_task_body: `Canonical task code: ${task.taskCode}. Reason: ${task.reason}`,
        hs_task_status: 'NOT_STARTED',
        hs_task_priority: 'HIGH'
      },
      associations: []
    });

    if (contactId) {
      await this.client.crm.associations.v4.basicApi.create(
        'task', created.id,
        'contact', contactId,
        [{ associationCategory: 'HUBSPOT_DEFINED' as any, associationTypeId: 204 }]
      );
    }

    return created.id;
  }
}
