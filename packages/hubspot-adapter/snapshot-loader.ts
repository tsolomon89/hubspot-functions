import { HubspotAdapter, parseHubSpotTimestamp } from './adapter';
import { 
  OpportunitySnapshot, 
  CommercialSubjectRef, 
  OpportunityType, 
  OpportunityState, 
  EvidenceRecord,
  QualificationConfig
} from '../commercial-kernel';
import { logger } from '../observability';

export interface HubSpotRecordRef {
  objectType: 'contact' | 'company' | 'lead' | 'deal';
  objectId: string;
}

export class HubSpotSnapshotLoader {
  private hsAdapter: HubspotAdapter;

  constructor(hsAdapter: HubspotAdapter) {
    this.hsAdapter = hsAdapter;
  }

  public async loadSnapshotFromRecord(
    recordRef: HubSpotRecordRef,
    organizationKey: string = 'org_default',
    relationshipType: string = 'b2b',
    config?: QualificationConfig
  ): Promise<OpportunitySnapshot> {
    logger.info('Loading pure opportunity snapshot directly from HubSpot CRM', { objectType: recordRef.objectType, objectId: recordRef.objectId });

    let subject: CommercialSubjectRef = { kind: 'CONTACT', key: recordRef.objectId };
    let opportunityType: OpportunityType = 'MQL';
    let opportunityState: OpportunityState = 'OPEN';
    let cycleIndex = 1;
    let relationshipKey = `${organizationKey}_${relationshipType}_${recordRef.objectId}`;
    let opportunityKey = `${relationshipKey}::LEAD::1`;
    let predecessorOpportunityKey: string | undefined = undefined;
    let predecessorCompletedAt: string | undefined = undefined;
    let openedAt = new Date().toISOString();
    const facts: Record<string, unknown> = {};

    const client = this.hsAdapter.getRawClient();

    if (recordRef.objectType === 'contact' || recordRef.objectType === 'company') {
      const isCompany = recordRef.objectType === 'company';
      subject = isCompany ? { kind: 'COMPANY', key: recordRef.objectId } : { kind: 'CONTACT', key: recordRef.objectId };
      
      const subjectFacts = await this.hsAdapter.loadSubjectSnapshot(subject);
      Object.assign(facts, subjectFacts);

      if (facts.automationSuppressed === true) {
        logger.info('Automation suppressed on subject record', { subject });
        facts.blocked = true;
      }
      
      relationshipKey = (subjectFacts.relationshipKey as string) || (isCompany ? (subjectFacts.domain as string) : (subjectFacts.email as string)) || `rel_${recordRef.objectId}`;
      opportunityKey = `${relationshipKey}::LEAD::1`;

      // Bootstrap or retrieve initial managed Lead for Contact/Company relationship
      const managedLead = await this.hsAdapter.findOrCreateLeadForSubject(subject, relationshipKey, relationshipType, config);
      if (managedLead) {
        opportunityType = (managedLead.coa_opportunity_type as OpportunityType) || 'MQL';
        cycleIndex = Number(managedLead.coa_cycle_index || 1);
        opportunityKey = managedLead.coa_opportunity_key || opportunityKey;
        if (managedLead.createdate) {
          openedAt = parseHubSpotTimestamp(managedLead.createdate);
        }
        const stage = (managedLead.hs_pipeline_stage as string) || 'mql';
        if (stage === 'qualified') opportunityState = 'WON';
        else if (stage === 'disqualified') opportunityState = 'LOST';
        facts.stage = stage;
        facts.leadId = managedLead.id;

        if (managedLead.coa_offering_keys) {
          facts.offeringKeys = String(managedLead.coa_offering_keys).split(',');
          facts.products = facts.offeringKeys;
        }
      }
    } else if (recordRef.objectType === 'lead') {
      const leadProps = await this.hsAdapter.loadLeadSnapshot(recordRef.objectId);
      opportunityType = (leadProps.coa_opportunity_type as OpportunityType) || 'MQL';
      cycleIndex = Number(leadProps.coa_cycle_index || 1);
      relationshipKey = (leadProps.coa_relationship_key as string) || `rel_${recordRef.objectId}`;
      opportunityKey = (leadProps.coa_opportunity_key as string) || `${relationshipKey}::LEAD::1`;
      predecessorOpportunityKey = leadProps.coa_predecessor_opportunity_key as string;
      if (leadProps.createdate) {
        openedAt = parseHubSpotTimestamp(leadProps.createdate);
      }

      // Query associated Contact / Company to resolve subject identity
      const assoc = await client.crm.associations.v4.basicApi.getPage('leads', recordRef.objectId, 'contacts');
      if (assoc.results && assoc.results.length > 0) {
        const contactId = String(assoc.results[0].toObjectId);
        subject = { kind: 'CONTACT', key: contactId };
        const contactFacts = await this.hsAdapter.loadSubjectSnapshot(subject);
        Object.assign(facts, contactFacts);
      }

      const stage = (leadProps.hs_pipeline_stage as string) || 'mql';
      if (stage === 'qualified') opportunityState = 'WON';
      else if (stage === 'disqualified') opportunityState = 'LOST';

      facts.stage = stage;
      facts.email = leadProps.email;
      facts.leadId = recordRef.objectId;
      if (leadProps.coa_offering_keys) {
        facts.offeringKeys = String(leadProps.coa_offering_keys).split(',');
        facts.products = facts.offeringKeys;
      }
    } else if (recordRef.objectType === 'deal') {
      const dealProps = await this.hsAdapter.loadDealSnapshot(recordRef.objectId);
      opportunityType = (dealProps.coa_opportunity_type as OpportunityType) || 'FTP';
      cycleIndex = Number(dealProps.coa_cycle_index || 1);
      relationshipKey = (dealProps.coa_relationship_key as string) || `rel_${recordRef.objectId}`;
      opportunityKey = (dealProps.coa_opportunity_key as string) || `${relationshipKey}::${opportunityType}::${cycleIndex}`;
      predecessorOpportunityKey = dealProps.coa_predecessor_opportunity_key as string;
      if (dealProps.coa_predecessor_completed_at) {
        predecessorCompletedAt = parseHubSpotTimestamp(dealProps.coa_predecessor_completed_at);
      }
      if (dealProps.createdate) {
        openedAt = parseHubSpotTimestamp(dealProps.createdate);
      }

      // Query associated Contact / Company
      const companyAssoc = await client.crm.associations.v4.basicApi.getPage('deals', recordRef.objectId, 'companies');
      if (companyAssoc.results && companyAssoc.results.length > 0) {
        const companyId = String(companyAssoc.results[0].toObjectId);
        subject = { kind: 'COMPANY', key: companyId };
        const companyFacts = await this.hsAdapter.loadSubjectSnapshot(subject);
        Object.assign(facts, companyFacts);
      }
      
      const contactAssoc = await client.crm.associations.v4.basicApi.getPage('deals', recordRef.objectId, 'contacts');
      if (contactAssoc.results && contactAssoc.results.length > 0) {
        const contactId = String(contactAssoc.results[0].toObjectId);
        if (subject.kind === 'COMPANY') {
          (subject as any).contactKeys = [contactId];
        } else {
          subject = { kind: 'CONTACT', key: contactId };
        }
        const contactFacts = await this.hsAdapter.loadSubjectSnapshot({ kind: 'CONTACT', key: contactId });
        Object.assign(facts, contactFacts);
      }

      // Load associated Line Items & Products
      try {
        const lineItemAssocs = await client.crm.associations.v4.basicApi.getPage('deals', recordRef.objectId, 'line_items');
        const productIds: string[] = [];
        const lineItems: any[] = [];

        for (const itemAssoc of lineItemAssocs.results || []) {
          const itemId = String(itemAssoc.toObjectId);
          const lineItem = await (client.crm as any).lineItems.basicApi.getById(itemId, ['name', 'hs_product_id', 'quantity', 'price']);
          const prodId = lineItem.properties?.hs_product_id || lineItem.id;
          productIds.push(prodId);
          lineItems.push(lineItem.properties);
        }

        facts.products = productIds;
        facts.offeringKeys = productIds;
        facts.lineItems = lineItems;
      } catch (err) {
        // No line items associated
      }

      const stage = (dealProps.dealstage as string) || 'open';
      if (stage === 'closedwon') {
        opportunityState = 'WON';
        facts.transactionCompleted = true;
      } else if (stage === 'closedlost') {
        opportunityState = 'LOST';
      }

      facts.stage = stage;
      facts.amount = dealProps.amount;
      facts.dealId = recordRef.objectId;
    }

    // Load associated evidence strictly scoped to subject ID within window
    const evidence = await this.hsAdapter.loadAssociatedEvidence(
      subject.key, 
      subject.kind.toLowerCase(), 
      { openedAt, predecessorCompletedAt }
    );

    return {
      organizationKey,
      relationshipKey,
      relationshipType,
      opportunityKey,
      opportunityType,
      opportunityState,
      cycleIndex,
      openedAt,
      predecessorOpportunityKey,
      predecessorCompletedAt,
      subject,
      facts,
      evidence
    };
  }
}
