import { HubspotAdapter } from './adapter';
import { 
  OpportunitySnapshot, 
  CommercialSubjectRef, 
  OpportunityType, 
  OpportunityState, 
  EvidenceRecord 
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
    relationshipType: string = 'b2b'
  ): Promise<OpportunitySnapshot> {
    logger.info('Loading pure opportunity snapshot directly from HubSpot CRM', { objectType: recordRef.objectType, objectId: recordRef.objectId });

    let subject: CommercialSubjectRef = { kind: 'CONTACT', key: recordRef.objectId };
    let opportunityType: OpportunityType = 'MQL';
    let opportunityState: OpportunityState = 'OPEN';
    let cycleIndex = 1;
    let relationshipKey = `${organizationKey}_${relationshipType}_${recordRef.objectId}`;
    let opportunityKey = `${relationshipKey}::MQL::1`;
    let predecessorOpportunityKey: string | undefined = undefined;
    let predecessorCompletedAt: string | undefined = undefined;
    let openedAt = '2026-08-05T00:00:00.000Z';
    const facts: Record<string, unknown> = {};

    if (recordRef.objectType === 'contact') {
      const contactFacts = await this.hsAdapter.loadSubjectSnapshot({ kind: 'CONTACT', key: recordRef.objectId });
      Object.assign(facts, contactFacts);
      subject = { kind: 'CONTACT', key: recordRef.objectId };
      relationshipKey = (contactFacts.relationshipKey as string) || (contactFacts.email as string) || `cnt_${recordRef.objectId}`;
      opportunityKey = `${relationshipKey}::MQL::1`;
    } else if (recordRef.objectType === 'company') {
      const companyFacts = await this.hsAdapter.loadSubjectSnapshot({ kind: 'COMPANY', key: recordRef.objectId });
      Object.assign(facts, companyFacts);
      subject = { kind: 'COMPANY', key: recordRef.objectId };
      relationshipKey = (companyFacts.relationshipKey as string) || (companyFacts.domain as string) || `comp_${recordRef.objectId}`;
      opportunityKey = `${relationshipKey}::MQL::1`;
    } else if (recordRef.objectType === 'lead') {
      const leadProps = await this.hsAdapter.loadLeadSnapshot(recordRef.objectId);
      opportunityType = (leadProps.coa_opportunity_type as OpportunityType) || 'MQL';
      cycleIndex = Number(leadProps.coa_cycle_index || 1);
      relationshipKey = (leadProps.coa_relationship_key as string) || `rel_${recordRef.objectId}`;
      opportunityKey = (leadProps.coa_opportunity_key as string) || `${relationshipKey}::${opportunityType}::${cycleIndex}`;
      predecessorOpportunityKey = leadProps.coa_predecessor_opportunity_key as string;
      if (leadProps.createdate) {
        openedAt = new Date(Number(leadProps.createdate)).toISOString();
      }

      // Query associated Contact / Company to resolve subject identity
      try {
        const client = this.hsAdapter.getRawClient();
        const assoc = await client.crm.associations.v4.basicApi.getPage('leads', recordRef.objectId, 'contacts');
        if (assoc.results && assoc.results.length > 0) {
          const contactId = String(assoc.results[0].toObjectId);
          subject = { kind: 'CONTACT', key: contactId };
          const contactFacts = await this.hsAdapter.loadSubjectSnapshot(subject);
          Object.assign(facts, contactFacts);
        }
      } catch (err) {
        // Fallback to record ref
      }

      const stage = (leadProps.hs_pipeline_stage as string) || 'mql';
      if (stage === 'qualified') opportunityState = 'WON';
      else if (stage === 'disqualified') opportunityState = 'LOST';

      facts.stage = stage;
      facts.email = leadProps.email;
    } else if (recordRef.objectType === 'deal') {
      const dealProps = await this.hsAdapter.loadDealSnapshot(recordRef.objectId);
      opportunityType = (dealProps.coa_opportunity_type as OpportunityType) || 'FTP';
      cycleIndex = Number(dealProps.coa_cycle_index || 1);
      relationshipKey = (dealProps.coa_relationship_key as string) || `rel_${recordRef.objectId}`;
      opportunityKey = (dealProps.coa_opportunity_key as string) || `${relationshipKey}::${opportunityType}::${cycleIndex}`;
      predecessorOpportunityKey = dealProps.coa_predecessor_opportunity_key as string;
      predecessorCompletedAt = dealProps.coa_predecessor_completed_at as string;
      if (dealProps.createdate) {
        openedAt = new Date(Number(dealProps.createdate)).toISOString();
      }

      // Query associated Contact / Company / Line Items
      try {
        const client = this.hsAdapter.getRawClient();
        const companyAssoc = await client.crm.associations.v4.basicApi.getPage('deals', recordRef.objectId, 'companies');
        if (companyAssoc.results && companyAssoc.results.length > 0) {
          const companyId = String(companyAssoc.results[0].toObjectId);
          subject = { kind: 'COMPANY', key: companyId };
          const companyFacts = await this.hsAdapter.loadSubjectSnapshot(subject);
          Object.assign(facts, companyFacts);
        } else {
          const contactAssoc = await client.crm.associations.v4.basicApi.getPage('deals', recordRef.objectId, 'contacts');
          if (contactAssoc.results && contactAssoc.results.length > 0) {
            const contactId = String(contactAssoc.results[0].toObjectId);
            subject = { kind: 'CONTACT', key: contactId };
            const contactFacts = await this.hsAdapter.loadSubjectSnapshot(subject);
            Object.assign(facts, contactFacts);
          }
        }
      } catch (err) {
        // Fallback
      }

      const stage = (dealProps.dealstage as string) || 'open';
      if (stage === 'closedwon') opportunityState = 'WON';
      else if (stage === 'closedlost') opportunityState = 'LOST';

      facts.stage = stage;
      facts.amount = dealProps.amount;
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
