import { Client } from '@hubspot/api-client';
import { OpportunitySnapshot, EvidenceRecord } from '../commercial-kernel/types';
import { parseHubSpotTimestamp, HubspotAdapter } from './adapter';
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

  public async loadSnapshotFromRecord(
    recordRef: HubSpotRecordRef,
    organizationKey: string = 'org_default',
    relationshipType: string = 'b2b'
  ): Promise<OpportunitySnapshot> {
    return this.loadPureSnapshotFromHubSpot(recordRef, organizationKey, relationshipType);
  }

  public async loadPureSnapshotFromHubSpot(
    recordRef: HubSpotRecordRef,
    organizationKey: string = 'org_default',
    relationshipType: string = 'b2b'
  ): Promise<OpportunitySnapshot> {
    const rawType = (recordRef.objectType || '').toLowerCase();

    let subjectKind: 'CONTACT' | 'COMPANY' = 'CONTACT';
    let subjectKey = '';
    let contactKeys: string[] = [];
    let companyKey: string | undefined = undefined;

    let facts: Record<string, unknown> = {};
    let evidence: EvidenceRecord[] = [];

    let opportunityKey = '';
    let opportunityType: 'MQL' | 'SQL' | 'FTP' | 'RTP' = 'MQL';
    let opportunityState: 'OPEN' | 'WON' | 'LOST' = 'OPEN';
    let cycleIndex = 1;
    let openedAt = new Date().toISOString();
    let predecessorCompletedAt: string | undefined = undefined;
    let relationshipKey = '';

    if (rawType === 'contact' || rawType === '0-1') {
      subjectKind = 'CONTACT';
      subjectKey = recordRef.objectId;
      contactKeys = [recordRef.objectId];

      const contact = await this.client.crm.contacts.basicApi.getById(recordRef.objectId, [
        'email',
        'lifecyclestage',
        'coa_relationship_key',
        'coa_relationship_type',
        'coa_marketing_consent',
        'coa_automation_suppressed',
        'createdate'
      ]);
      const cProps = contact.properties || {};

      try {
        const companyAssocs = await this.client.crm.associations.v4.basicApi.getPage(
          'contact',
          Number(recordRef.objectId) || (recordRef.objectId as any),
          'company'
        );
        if (companyAssocs.results && companyAssocs.results.length > 0) {
          companyKey = String(companyAssocs.results[0].toObjectId);
        }
      } catch (err: any) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }

      // Canonical Relationship Key Resolution: if Contact lacks coa_relationship_key, attempt Company lookup before fallback
      relationshipKey = cProps.coa_relationship_key || '';
      if (!relationshipKey && companyKey) {
        try {
          const compRecord = await this.client.crm.companies.basicApi.getById(companyKey, ['coa_relationship_key']);
          if (compRecord.properties?.coa_relationship_key) {
            relationshipKey = compRecord.properties.coa_relationship_key;
          }
        } catch (err: any) {
          if (err?.statusCode !== 404 && err?.status !== 404) throw err;
        }
      }
      if (!relationshipKey) {
        relationshipKey = companyKey ? `comp_${companyKey}` : `cnt_${recordRef.objectId}`;
      }

      opportunityKey = `${relationshipKey}::LEAD::1`;

      facts = {
        email: cProps.email,
        contactEmail: cProps.email,
        lifecycleStage: cProps.lifecyclestage,
        marketingConsent: cProps.coa_marketing_consent === 'true' || cProps.coa_marketing_consent === '1',
        automationSuppressed: cProps.coa_automation_suppressed === 'true' || cProps.coa_automation_suppressed === '1'
      };
      openedAt = parseHubSpotTimestamp(cProps.createdate) || openedAt;

    } else if (rawType === 'company' || rawType === '0-2') {
      subjectKind = 'COMPANY';
      subjectKey = recordRef.objectId;

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

      try {
        const contactAssocs = await this.client.crm.associations.v4.basicApi.getPage(
          'company',
          Number(recordRef.objectId) || (recordRef.objectId as any),
          'contact'
        );
        if (contactAssocs.results && contactAssocs.results.length > 0) {
          contactKeys = contactAssocs.results.map(r => String(r.toObjectId));
        }
      } catch (err: any) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }

      relationshipKey = compProps.coa_relationship_key || `comp_${recordRef.objectId}`;
      opportunityKey = `${relationshipKey}::LEAD::1`;

      facts = {
        domain: compProps.domain,
        companyName: compProps.name,
        lifecycleStage: compProps.lifecyclestage,
        marketingConsent: compProps.coa_marketing_consent === 'true' || compProps.coa_marketing_consent === '1',
        automationSuppressed: compProps.coa_automation_suppressed === 'true' || compProps.coa_automation_suppressed === '1'
      };
      openedAt = parseHubSpotTimestamp(compProps.createdate) || openedAt;

    } else if (rawType === 'lead' || rawType === '0-136') {
      const lead = await this.leadsApi.basicApi.getById(recordRef.objectId, [
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
      const lProps = lead.properties || {};

      let assocContactId: string | undefined = undefined;
      let assocCompanyId: string | undefined = undefined;

      try {
        const cAssoc = await this.client.crm.associations.v4.basicApi.getPage('lead', Number(recordRef.objectId) || (recordRef.objectId as any), 'contact');
        if (cAssoc.results && cAssoc.results.length > 0) {
          assocContactId = String(cAssoc.results[0].toObjectId);
          contactKeys.push(assocContactId);
        }
      } catch (err: any) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }

      try {
        const compAssoc = await this.client.crm.associations.v4.basicApi.getPage('lead', Number(recordRef.objectId) || (recordRef.objectId as any), 'company');
        if (compAssoc.results && compAssoc.results.length > 0) {
          assocCompanyId = String(compAssoc.results[0].toObjectId);
          companyKey = assocCompanyId;
        }
      } catch (err: any) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }

      if (assocCompanyId) {
        subjectKind = 'COMPANY';
        subjectKey = assocCompanyId;
      } else if (assocContactId) {
        subjectKind = 'CONTACT';
        subjectKey = assocContactId;
      }

      relationshipKey = lProps.coa_relationship_key || (subjectKey ? `${subjectKind.toLowerCase()}_${subjectKey}` : `rel_lead_${recordRef.objectId}`);
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
        facts.offeringKeys = String(lProps.coa_offering_keys).split(',').map(s => s.trim());
      }

      cycleIndex = Number(lProps.coa_cycle_index) || 1;
      openedAt = parseHubSpotTimestamp(lProps.createdate) || openedAt;

    } else if (rawType === 'deal' || rawType === '0-3') {
      const deal = await this.client.crm.deals.basicApi.getById(recordRef.objectId, [
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
        'coa_offering_keys',
        'createdate'
      ]);
      const dProps = deal.properties || {};

      let assocContactId: string | undefined = undefined;
      let assocCompanyId: string | undefined = undefined;

      try {
        const cAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', Number(recordRef.objectId) || (recordRef.objectId as any), 'contact');
        if (cAssoc.results && cAssoc.results.length > 0) {
          assocContactId = String(cAssoc.results[0].toObjectId);
          contactKeys.push(assocContactId);
        }
      } catch (err: any) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }

      try {
        const compAssoc = await this.client.crm.associations.v4.basicApi.getPage('deal', Number(recordRef.objectId) || (recordRef.objectId as any), 'company');
        if (compAssoc.results && compAssoc.results.length > 0) {
          assocCompanyId = String(compAssoc.results[0].toObjectId);
          companyKey = assocCompanyId;
        }
      } catch (err: any) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }

      if (assocCompanyId) {
        subjectKind = 'COMPANY';
        subjectKey = assocCompanyId;
      } else if (assocContactId) {
        subjectKind = 'CONTACT';
        subjectKey = assocContactId;
      }

      relationshipKey = dProps.coa_relationship_key || (subjectKey ? `${subjectKind.toLowerCase()}_${subjectKey}` : `rel_deal_${recordRef.objectId}`);
      opportunityType = (dProps.coa_opportunity_type as any) || 'FTP';
      cycleIndex = Number(dProps.coa_cycle_index) || 1;
      opportunityKey = dProps.coa_opportunity_key || `${relationshipKey}::${opportunityType}::${cycleIndex}`;

      const stage = (dProps.dealstage || 'open').toLowerCase();
      if (stage === 'closedwon') {
        opportunityState = 'WON';
        facts.transactionCompleted = true;
      } else if (stage === 'closedlost') {
        opportunityState = 'LOST';
      } else {
        opportunityState = 'OPEN';
      }

      if (dProps.coa_offering_keys) {
        facts.offeringKeys = String(dProps.coa_offering_keys).split(',').map(s => s.trim());
      }

      openedAt = parseHubSpotTimestamp(dProps.createdate) || openedAt;
      predecessorCompletedAt = parseHubSpotTimestamp(dProps.coa_predecessor_completed_at) || undefined;
    } else {
      throw new Error(`INVALID_ENROLLMENT: Unsupported objectType '${recordRef.objectType}'`);
    }

    // Hydrate subject contact facts
    if (contactKeys.length > 0) {
      try {
        const primaryContact = await this.client.crm.contacts.basicApi.getById(contactKeys[0], [
          'email',
          'lifecyclestage',
          'coa_marketing_consent',
          'coa_automation_suppressed'
        ]);
        const pcProps = primaryContact.properties || {};
        facts.email = pcProps.email || facts.email;
        facts.contactEmail = pcProps.email || facts.contactEmail;
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

    // Load meetings evidence associated with primary contact
    if (contactKeys.length > 0) {
      try {
        const lowerTime = predecessorCompletedAt ? new Date(predecessorCompletedAt).getTime() : new Date(openedAt).getTime();
        const meetingAssocs = await this.client.crm.associations.v4.basicApi.getPage('contact', Number(contactKeys[0]) || (contactKeys[0] as any), 'meeting');
        for (const assoc of meetingAssocs.results || []) {
          const meetingId = String(assoc.toObjectId);
          const meeting = await (this.client.crm as any).objects.meetings.basicApi.getById(meetingId, [
            'hs_meeting_outcome',
            'hs_timestamp'
          ]);
          const parsedTime = parseHubSpotTimestamp(meeting.properties.hs_timestamp);
          if (parsedTime && new Date(parsedTime).getTime() > lowerTime) {
            evidence.push({
              id: meeting.id,
              predicate: 'activityExists',
              scope: 'opportunity',
              occurredAt: parsedTime,
              data: {
                activityType: 'MEETING',
                outcome: meeting.properties.hs_meeting_outcome === 'COMPLETED' ? 'COMPLETED' : 'HELD'
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
      subject: {
        kind: subjectKind,
        key: subjectKey,
        contactKeys,
        companyKey
      },
      facts,
      evidence
    };
  }
}
