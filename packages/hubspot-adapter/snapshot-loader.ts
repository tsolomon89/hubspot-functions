import { Client } from '@hubspot/api-client';
import { OpportunitySnapshot, EvidenceRecord, OfferingRef } from '../commercial-kernel/types';
import { parseHubSpotTimestamp, HubspotAdapter } from './adapter';
import { deriveRelationshipKey, sanitizeKey } from '../domain/identity';
import { logger } from '../observability';

export interface HubSpotRecordRef {
  objectId: string;
  objectType: string;
}

export class HubSpotSnapshotLoader {
  private client: Client;

  constructor(accessTokenOrAdapter?: string | HubspotAdapter) {
    if (accessTokenOrAdapter instanceof HubspotAdapter) {
      this.client = accessTokenOrAdapter.getRawClient();
    } else {
      const token = accessTokenOrAdapter || process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
      this.client = new Client({ accessToken: token });
    }
  }

  private get leadsApi(): any {
    return (this.client.crm.objects as any).leads || (this.client.crm as any).objects?.leads;
  }

  /**
   * Bounded association pagination helper with strict fail-closed error handling.
   * Pages through all associations matching fromObjectType -> toObjectType.
   */
  public async getAllAssociations(
    fromObjectType: string,
    fromObjectId: string | number,
    toObjectType: string,
    maxPages: number = 10
  ): Promise<any[]> {
    const results: any[] = [];
    let after: string | undefined = undefined;
    let pageCount = 0;

    do {
      pageCount++;
      try {
        const res = await this.client.crm.associations.v4.basicApi.getPage(
          fromObjectType,
          Number(fromObjectId) || (fromObjectId as any),
          toObjectType,
          after,
          100
        );
        if (res.results && res.results.length > 0) {
          results.push(...res.results);
        }
        after = res.paging?.next?.after;
      } catch (err: any) {
        const is404 = err?.statusCode === 404 || err?.status === 404 || err?.code === 404;
        if (is404 && pageCount === 1) {
          return [];
        }
        throw new Error(`ASSOCIATION_PAGINATION_FAILED: Failed to load associations for ${fromObjectType}:${fromObjectId} -> ${toObjectType} on page ${pageCount}: ${err.message || err}`);
      }

      if (after && pageCount >= maxPages) {
        throw new Error(`ASSOCIATION_PAGINATION_LIMIT_EXCEEDED: Exceeded maxPages (${maxPages}) while more associations remain for ${fromObjectType}:${fromObjectId} -> ${toObjectType}`);
      }
    } while (after && pageCount < maxPages);

    return results;
  }

  /**
   * Explicit primary contact resolution from list of associated contact IDs.
   */
  public async resolvePrimaryContactId(
    fromObjectType: string,
    fromObjectId: string,
    associationResults: any[]
  ): Promise<{ primaryContactId: string | null; isAmbiguous: boolean }> {
    if (!associationResults || associationResults.length === 0) {
      return { primaryContactId: null, isAmbiguous: false };
    }
    if (associationResults.length === 1) {
      return { primaryContactId: String(associationResults[0].toObjectId), isAmbiguous: false };
    }

    for (const assoc of associationResults) {
      const types = assoc.associationTypes || [];
      for (const t of types) {
        const label = String(t.label || t.type || '').toLowerCase();
        if (label.includes('primary') || t.associationTypeId === 1) {
          return { primaryContactId: String(assoc.toObjectId), isAmbiguous: false };
        }
      }
    }

    return { primaryContactId: null, isAmbiguous: true };
  }

  /**
   * Explicit primary company resolution from list of associated company IDs for Contact.
   */
  public async resolvePrimaryCompanyId(
    contactId: string,
    companyAssocs: any[]
  ): Promise<{ primaryCompanyId: string | null; isAmbiguous: boolean }> {
    if (!companyAssocs || companyAssocs.length === 0) {
      return { primaryCompanyId: null, isAmbiguous: false };
    }
    if (companyAssocs.length === 1) {
      return { primaryCompanyId: String(companyAssocs[0].toObjectId), isAmbiguous: false };
    }

    for (const assoc of companyAssocs) {
      const types = assoc.associationTypes || [];
      for (const t of types) {
        const label = String(t.label || t.type || '').toLowerCase();
        if (label.includes('primary') || t.associationTypeId === 1) {
          return { primaryCompanyId: String(assoc.toObjectId), isAmbiguous: false };
        }
      }
    }

    return { primaryCompanyId: null, isAmbiguous: true };
  }

  public async loadSnapshotFromRecord(
    recordRef: HubSpotRecordRef,
    organizationKey: string = 'org_global_corp',
    relationshipType: string = 'b2b'
  ): Promise<OpportunitySnapshot> {
    return this.loadPureSnapshotFromHubSpot(recordRef, organizationKey, relationshipType);
  }

  public async loadPureSnapshotFromHubSpot(
    recordRef: HubSpotRecordRef,
    organizationKey: string = 'org_global_corp',
    relationshipType: string = 'b2b'
  ): Promise<OpportunitySnapshot> {
    const rawType = (recordRef.objectType || '').toLowerCase();

    let subjectKind: 'CONTACT' | 'COMPANY' = 'CONTACT';
    let subjectKey = '';
    let contactKeys: string[] = [];
    let companyKey: string | undefined = undefined;
    let primaryContactId: string | undefined = undefined;

    let facts: Record<string, unknown> = {};
    let evidence: EvidenceRecord[] = [];
    let offerings: OfferingRef[] = [];

    let opportunityKey = '';
    let opportunityType: 'MQL' | 'SQL' | 'FTP' | 'RTP' = 'MQL';
    let opportunityState: 'OPEN' | 'WON' | 'LOST' = 'OPEN';
    let cycleIndex = 1;
    let openedAt = new Date().toISOString();
    let predecessorCompletedAt: string | undefined = undefined;
    let mqlCompletedAt: string | undefined = undefined;
    let relationshipKey = '';

    if (rawType === 'contact' || rawType === '0-1') {
      subjectKind = 'CONTACT';
      subjectKey = recordRef.objectId;
      contactKeys = [recordRef.objectId];
      primaryContactId = recordRef.objectId;

      const contact = await this.client.crm.contacts.basicApi.getById(recordRef.objectId, [
        'email',
        'phone',
        'firstname',
        'lastname',
        'lifecyclestage',
        'coa_relationship_key',
        'coa_relationship_type',
        'coa_marketing_consent',
        'coa_automation_suppressed',
        'createdate'
      ]);
      const cProps = contact.properties || {};

      let companySuppressed = false;
      const companyAssocs = await this.getAllAssociations('contact', recordRef.objectId, 'company');
      const { primaryCompanyId, isAmbiguous: isCompanyAmbiguous } = await this.resolvePrimaryCompanyId(recordRef.objectId, companyAssocs);

      if (isCompanyAmbiguous) {
        facts.ambiguousPrimaryCompany = true;
        facts.manualReviewRequired = true;
      }

      companyKey = primaryCompanyId || undefined;

      if (companyKey) {
        try {
          const compRecord = await this.client.crm.companies.basicApi.getById(companyKey, [
            'coa_relationship_key',
            'coa_automation_suppressed'
          ]);
          companySuppressed = compRecord.properties?.coa_automation_suppressed === 'true' || compRecord.properties?.coa_automation_suppressed === '1';
        } catch (err: any) {
          if (err?.statusCode !== 404 && err?.status !== 404) throw err;
        }
      }

      if (relationshipType === 'b2b') {
        if (companyKey) {
          relationshipKey = deriveRelationshipKey(organizationKey, 'b2b', companyKey);
        } else {
          // B2B Contact without Company gets review identity, facts.missingCompany = true
          facts.missingCompany = true;
          facts.manualReviewRequired = true;
          relationshipKey = deriveRelationshipKey(organizationKey, 'review', recordRef.objectId);
        }
      } else {
        relationshipKey = deriveRelationshipKey(organizationKey, 'b2c', recordRef.objectId);
      }

      opportunityKey = `${relationshipKey}::LEAD::1`;

      const contactSuppressed = cProps.coa_automation_suppressed === 'true' || cProps.coa_automation_suppressed === '1';
      facts = {
        ...facts,
        email: cProps.email || undefined,
        contactEmail: cProps.email || undefined,
        phone: cProps.phone || undefined,
        lifecycleStage: cProps.lifecyclestage || undefined,
        marketingConsent: cProps.coa_marketing_consent === 'true' || cProps.coa_marketing_consent === '1',
        automationSuppressed: Boolean(contactSuppressed || companySuppressed)
      };
      openedAt = parseHubSpotTimestamp(cProps.createdate) || openedAt;

    } else if (rawType === 'company' || rawType === '0-2') {
      subjectKind = 'COMPANY';
      subjectKey = recordRef.objectId;
      companyKey = recordRef.objectId;

      const company = await this.client.crm.companies.basicApi.getById(recordRef.objectId, [
        'domain',
        'name',
        'lifecyclestage',
        'coa_relationship_key',
        'coa_relationship_type',
        'coa_marketing_consent',
        'coa_automation_suppressed',
        'createdate'
      ]);
      const compProps = company.properties || {};

      let contactSuppressed = false;
      let contactEmail: string | undefined = undefined;
      let contactPhone: string | undefined = undefined;

      const contactAssocs = await this.getAllAssociations('company', recordRef.objectId, 'contact');
      const { primaryContactId: resolvedPrimary, isAmbiguous } = await this.resolvePrimaryContactId('company', recordRef.objectId, contactAssocs);

      if (contactAssocs.length > 0) {
        contactKeys = contactAssocs.map(r => String(r.toObjectId));
      }

      if (isAmbiguous) {
        facts.ambiguousPrimaryContact = true;
        facts.manualReviewRequired = true;
        primaryContactId = undefined;
      } else {
        primaryContactId = resolvedPrimary || (contactKeys.length === 1 ? contactKeys[0] : undefined);
      }

      if (primaryContactId) {
        try {
          const primaryContact = await this.client.crm.contacts.basicApi.getById(primaryContactId, [
            'email',
            'phone',
            'coa_relationship_key',
            'coa_automation_suppressed'
          ]);
          contactEmail = primaryContact.properties?.email || undefined;
          contactPhone = primaryContact.properties?.phone || undefined;
          contactSuppressed = primaryContact.properties?.coa_automation_suppressed === 'true' || primaryContact.properties?.coa_automation_suppressed === '1';
        } catch (err: any) {
          if (err?.statusCode !== 404 && err?.status !== 404) throw err;
        }
      }

      relationshipKey = deriveRelationshipKey(organizationKey, 'b2b', recordRef.objectId);
      opportunityKey = `${relationshipKey}::LEAD::1`;

      const compSuppressed = compProps.coa_automation_suppressed === 'true' || compProps.coa_automation_suppressed === '1';
      facts = {
        ...facts,
        domain: compProps.domain || undefined,
        companyName: compProps.name || undefined,
        email: contactEmail,
        contactEmail: contactEmail,
        phone: contactPhone,
        lifecycleStage: compProps.lifecyclestage || undefined,
        marketingConsent: compProps.coa_marketing_consent === 'true' || compProps.coa_marketing_consent === '1',
        automationSuppressed: Boolean(compSuppressed || contactSuppressed),
        ambiguousPrimaryContact: isAmbiguous
      };
      openedAt = parseHubSpotTimestamp(compProps.createdate) || openedAt;

    } else if (rawType === 'lead' || rawType === '0-136') {
      const lead = await this.leadsApi.basicApi.getById(recordRef.objectId, [
        'coa_opportunity_key',
        'coa_relationship_key',
        'coa_relationship_type',
        'coa_opportunity_type',
        'coa_cycle_index',
        'hs_pipeline_stage',
        'coa_qualification_state',
        'coa_predecessor_opportunity_key',
        'coa_mql_completed_at',
        'coa_offering_keys',
        'createdate'
      ]);
      const lProps = lead.properties || {};

      const cAssocs = await this.getAllAssociations('lead', recordRef.objectId, 'contact');
      if (cAssocs.length > 0) {
        const { primaryContactId: resContact, isAmbiguous } = await this.resolvePrimaryContactId('lead', recordRef.objectId, cAssocs);
        contactKeys = cAssocs.map(r => String(r.toObjectId));
        if (isAmbiguous) {
          facts.ambiguousPrimaryContact = true;
          facts.manualReviewRequired = true;
          primaryContactId = undefined;
        } else {
          primaryContactId = resContact || (contactKeys.length === 1 ? contactKeys[0] : undefined);
        }
      }

      const compAssocs = await this.getAllAssociations('lead', recordRef.objectId, 'company');
      if (compAssocs.length > 0) {
        companyKey = String(compAssocs[0].toObjectId);
      }

      if (companyKey) {
        subjectKind = 'COMPANY';
        subjectKey = companyKey;
      } else if (primaryContactId) {
        subjectKind = 'CONTACT';
        subjectKey = primaryContactId;
      }

      const anchor = companyKey || primaryContactId || recordRef.objectId;
      relationshipKey = lProps.coa_relationship_key || deriveRelationshipKey(organizationKey, relationshipType, anchor);
      opportunityKey = lProps.coa_opportunity_key || `${relationshipKey}::LEAD::1`;

      const stage = (lProps.hs_pipeline_stage || 'mql').toLowerCase();
      if (stage === 'qualified') {
        opportunityType = 'SQL';
        opportunityState = 'WON';
      } else if (stage === 'sql') {
        opportunityType = 'SQL';
        opportunityState = 'OPEN';
      } else {
        opportunityType = 'MQL';
        opportunityState = 'OPEN';
      }

      if (lProps.coa_offering_keys) {
        const rawKeys = String(lProps.coa_offering_keys).split(',').map(s => s.trim()).filter(Boolean);
        facts.offeringKeys = rawKeys;
        offerings = rawKeys.map(k => ({ offeringKey: k, quantity: 1 }));
      }

      mqlCompletedAt = parseHubSpotTimestamp(lProps.coa_mql_completed_at) || undefined;
      cycleIndex = Number(lProps.coa_cycle_index) || 1;
      openedAt = parseHubSpotTimestamp(lProps.createdate) || openedAt;

    } else if (rawType === 'deal' || rawType === '0-3') {
      const deal = await this.client.crm.deals.basicApi.getById(recordRef.objectId, [
        'dealname',
        'amount',
        'dealstage',
        'pipeline',
        'closedate',
        'coa_opportunity_key',
        'coa_relationship_key',
        'coa_relationship_type',
        'coa_opportunity_type',
        'coa_cycle_index',
        'coa_qualification_state',
        'coa_predecessor_opportunity_key',
        'coa_predecessor_completed_at',
        'coa_mql_completed_at',
        'coa_offering_keys',
        'createdate'
      ]);
      const dProps = deal.properties || {};

      const cAssocs = await this.getAllAssociations('deal', recordRef.objectId, 'contact');
      if (cAssocs.length > 0) {
        const { primaryContactId: resContact, isAmbiguous } = await this.resolvePrimaryContactId('deal', recordRef.objectId, cAssocs);
        contactKeys = cAssocs.map(r => String(r.toObjectId));
        if (isAmbiguous) {
          facts.ambiguousPrimaryContact = true;
          facts.manualReviewRequired = true;
          primaryContactId = undefined;
        } else {
          primaryContactId = resContact || (contactKeys.length === 1 ? contactKeys[0] : undefined);
        }
      }

      const compAssocs = await this.getAllAssociations('deal', recordRef.objectId, 'company');
      if (compAssocs.length > 0) {
        companyKey = String(compAssocs[0].toObjectId);
      }

      if (companyKey) {
        subjectKind = 'COMPANY';
        subjectKey = companyKey;
      } else if (primaryContactId) {
        subjectKind = 'CONTACT';
        subjectKey = primaryContactId;
      }

      const anchor = companyKey || primaryContactId || recordRef.objectId;
      relationshipKey = dProps.coa_relationship_key || deriveRelationshipKey(organizationKey, relationshipType, anchor);
      opportunityType = (dProps.coa_opportunity_type as any) || 'FTP';
      cycleIndex = Number(dProps.coa_cycle_index) || 1;
      opportunityKey = dProps.coa_opportunity_key || `${relationshipKey}::${opportunityType}::${cycleIndex}`;

      const stage = (dProps.dealstage || 'open').toLowerCase();
      openedAt = parseHubSpotTimestamp(dProps.createdate) || openedAt;

      if (stage === 'closedwon') {
        opportunityState = 'WON';
        facts.transactionCompleted = true;
        facts.closedAt = parseHubSpotTimestamp(dProps.closedate || dProps.closedAt || dProps.coa_predecessor_completed_at) || openedAt;
      } else if (stage === 'closedlost') {
        opportunityState = 'LOST';
      } else {
        opportunityState = 'OPEN';
      }

      const lineItemAssocs = await this.getAllAssociations('deal', recordRef.objectId, 'line_item');
      if (lineItemAssocs.length > 0) {
        const loadedOfferings: OfferingRef[] = [];
        for (const lineAssoc of lineItemAssocs) {
          try {
            const li = await this.client.crm.lineItems.basicApi.getById(String(lineAssoc.toObjectId), [
              'name',
              'quantity',
              'price',
              'hs_product_id',
              'hs_sku',
              'coa_line_item_key'
            ]);
            const liProps = li.properties || {};
            const key = liProps.hs_sku || liProps.name;
            if (key) {
              loadedOfferings.push({
                offeringKey: key,
                quantity: Number(liProps.quantity || 1),
                unitPrice: Number(liProps.price || 0)
              });
            }
          } catch (e: any) {
            if (e?.statusCode !== 404 && e?.status !== 404) throw e;
          }
        }
        if (loadedOfferings.length > 0) {
          offerings = loadedOfferings;
          facts.offeringKeys = loadedOfferings.map(o => o.offeringKey);
        }
      } else if (dProps.coa_offering_keys) {
        const rawKeys = String(dProps.coa_offering_keys).split(',').map(s => s.trim()).filter(Boolean);
        facts.offeringKeys = rawKeys;
        offerings = rawKeys.map(k => ({ offeringKey: k, quantity: 1 }));
      }

      predecessorCompletedAt = parseHubSpotTimestamp(dProps.coa_predecessor_completed_at) || undefined;
      mqlCompletedAt = parseHubSpotTimestamp(dProps.coa_mql_completed_at) || undefined;
    } else {
      throw new Error(`INVALID_ENROLLMENT: Unsupported objectType '${recordRef.objectType}'`);
    }

    if (primaryContactId) {
      try {
        const primaryContact = await this.client.crm.contacts.basicApi.getById(primaryContactId, [
          'email',
          'phone',
          'lifecyclestage',
          'coa_marketing_consent',
          'coa_automation_suppressed'
        ]);
        const pcProps = primaryContact.properties || {};
        facts.email = pcProps.email || facts.email;
        facts.contactEmail = pcProps.email || facts.contactEmail;
        facts.phone = pcProps.phone || facts.phone;
        if (pcProps.coa_marketing_consent === 'true' || pcProps.coa_marketing_consent === '1') {
          facts.marketingConsent = true;
        }
        if (pcProps.coa_automation_suppressed === 'true' || pcProps.coa_automation_suppressed === '1') {
          facts.automationSuppressed = true;
        }
      } catch (err: any) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
    }

    if (companyKey) {
      try {
        const compRecord = await this.client.crm.companies.basicApi.getById(companyKey, ['coa_automation_suppressed']);
        if (compRecord.properties?.coa_automation_suppressed === 'true' || compRecord.properties?.coa_automation_suppressed === '1') {
          facts.automationSuppressed = true;
        }
      } catch (err: any) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
    }

    if (primaryContactId) {
      try {
        const lowerTime = predecessorCompletedAt ? new Date(predecessorCompletedAt).getTime() : new Date(openedAt).getTime();
        const meetingAssocs = await this.getAllAssociations('contact', primaryContactId, 'meeting');
        for (const assoc of meetingAssocs) {
          const meetingId = String(assoc.toObjectId);
          const meeting = await (this.client.crm as any).objects.meetings.basicApi.getById(meetingId, [
            'hs_meeting_outcome',
            'hs_timestamp'
          ]);
          const parsedTime = parseHubSpotTimestamp(meeting.properties.hs_timestamp);
          if (parsedTime && new Date(parsedTime).getTime() > lowerTime) {
            const rawOutcome = String(meeting.properties.hs_meeting_outcome || '').toUpperCase();
            let outcome = 'HELD';
            if (rawOutcome === 'COMPLETED') outcome = 'COMPLETED';
            else if (rawOutcome === 'RESCHEDULED') outcome = 'RESCHEDULED';
            else if (rawOutcome === 'NO_SHOW') outcome = 'NO_SHOW';
            else if (rawOutcome === 'CANCELED') outcome = 'CANCELED';

            evidence.push({
              id: meeting.id,
              predicate: 'activityExists',
              scope: 'opportunity',
              occurredAt: parsedTime,
              data: {
                activityType: 'MEETING',
                outcome
              }
            });
          }
        }
      } catch (err: any) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
    }

    return {
      organizationKey,
      relationshipKey,
      relationshipType: relationshipType || 'b2b',
      opportunityKey,
      opportunityType,
      opportunityState,
      cycleIndex,
      openedAt,
      predecessorCompletedAt,
      mqlCompletedAt,
      offerings,
      subject: {
        kind: subjectKind,
        key: subjectKey,
        contactKeys,
        companyKey,
        phone: facts.phone as string | undefined,
        email: facts.email as string | undefined
      },
      facts,
      evidence
    };
  }
}
