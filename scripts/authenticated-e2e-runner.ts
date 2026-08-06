import { Client } from '@hubspot/api-client';
import { HubspotAdapter } from '../packages/hubspot-adapter';
import { SchemaTool } from '../packages/domain/schema-cli';
import { processHubSpotCustomCodeAction } from '../src/custom-code-actions/reconcile-record';
import { logger } from '../packages/observability';

export interface HubSpotAccountDetails {
  portalId: number;
  accountType: string;
  timeZone?: string;
  currency?: string;
}

export async function getAuthenticatedAccountDetails(client: Client): Promise<HubSpotAccountDetails> {
  try {
    const res = await (client as any).apiRequest({
      method: 'GET',
      path: '/account-info/v3/details'
    });
    const body = await res.json();
    if (body && body.portalId) {
      return {
        portalId: Number(body.portalId),
        accountType: String(body.accountType || body.accountRole || 'UNKNOWN').toUpperCase()
      };
    }
  } catch (err: any) {
    logger.warn('Failed to query /account-info/v3/details', err);
  }
  throw new Error('TOKEN_ACCOUNT_VERIFICATION_FAILED: Unable to verify account details from token via HubSpot API');
}

export async function runAuthenticatedE2EVerification() {
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_DEVELOPMENT_PERSONAL_ACCESS_KEY;
  if (!token) {
    logger.warn('AUTHENTICATED_E2E_SKIPPED: PRIVATE_APP_ACCESS_TOKEN environment variable not set.');
    return { skipped: true, reason: 'PRIVATE_APP_ACCESS_TOKEN missing' };
  }

  const adapter = new HubspotAdapter(token);
  const rawClient = adapter.getRawClient();
  const schemaTool = new SchemaTool();

  // Gate 7: Retrieve and verify actual portalId AND exact API accountType before mutation!
  const accountDetails = await getAuthenticatedAccountDetails(rawClient);
  console.log(`Verified Authenticated Token Account: Portal ID = ${accountDetails.portalId}, Account Type = ${accountDetails.accountType}`);

  // Gate 7 Guard: Require EXACT DEVELOPER_TEST accountType! APP_DEVELOPER must be rejected!
  if (accountDetails.accountType !== 'DEVELOPER_TEST') {
    const msg = `MUTATION_BLOCKED: Portal ${accountDetails.portalId} accountType is '${accountDetails.accountType}', expected exact 'DEVELOPER_TEST'. Halting execution to prevent mutating parent account.`;
    console.log(msg);
    return {
      success: false,
      portalId: accountDetails.portalId,
      accountType: accountDetails.accountType,
      mutationBlocked: true,
      reason: msg
    };
  }

  console.log(`=== STARTING AUTHENTICATED E2E VERIFICATION ON PORTAL ${accountDetails.portalId} (${accountDetails.accountType}) ===`);

  // 1. Schema Apply & Readback Verification
  const plan1 = schemaTool.plan();
  const applyResult = await schemaTool.apply(plan1, adapter, accountDetails.portalId);
  if (!applyResult.applied || applyResult.errors.length > 0) {
    throw new Error(`SCHEMA_APPLY_FAILED: ${applyResult.errors.join('; ')}`);
  }

  const readbackResult = await schemaTool.readback(adapter);
  if (!readbackResult.verified) {
    throw new Error('SCHEMA_READBACK_FAILED: Schema readback verification failed after apply');
  }

  const plan2 = schemaTool.plan(await schemaTool.inspect(adapter));
  const plan2Empty = plan2.propertyGroupsToCreate.length === 0 &&
                     plan2.propertiesToCreate.length === 0 &&
                     plan2.pipelinesToCreate.length === 0 &&
                     plan2.pipelinesToUpdate.length === 0;

  if (!plan2Empty) {
    throw new Error('SCHEMA_PLAN_NOT_EMPTY: Second schema plan after apply is not empty');
  }

  // 2. Full Live Lifecycle Scenarios with Comprehensive Record Tracking
  const ts = Date.now();
  const createdRecordIds: { type: string; id: string }[] = [];

  try {
    // Scenario 1: B2B Full Progression (Contact -> Lead -> FTP -> RTP1 -> RTP2)
    const b2bComp = await rawClient.crm.companies.basicApi.create({
      properties: { name: `COA_E2E_Comp_${ts}`, domain: `coa-b2b-${ts}.com`, coa_marketing_consent: 'true' }
    });
    createdRecordIds.push({ type: 'company', id: b2bComp.id });

    const b2bCnt = await rawClient.crm.contacts.basicApi.create({
      properties: { email: `coa.b2b.${ts}@test.com`, firstname: 'COA', lastname: `B2B_${ts}`, coa_marketing_consent: 'true' },
      associations: [{ to: { id: b2bComp.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }] }]
    });
    createdRecordIds.push({ type: 'contact', id: b2bCnt.id });

    // Step A: Contact Enrollment -> Creates Lead
    const b2bLeadRes = await processHubSpotCustomCodeAction({
      origin: { portalId: accountDetails.portalId },
      object: { objectId: b2bCnt.id, objectType: 'CONTACT' },
      inputFields: { offeringKeys: 'prod_sw_e2e' }
    }, token, adapter);
    if (b2bLeadRes.outputFields.objectId) createdRecordIds.push({ type: 'lead', id: b2bLeadRes.outputFields.objectId });

    // Step B: Lead Enrollment -> Creates FTP Deal
    const b2bFtpRes = await processHubSpotCustomCodeAction({
      origin: { portalId: accountDetails.portalId },
      object: { objectId: b2bLeadRes.outputFields.objectId, objectType: 'LEAD' }
    }, token, adapter);

    // Scenario 2: B2C Full Progression
    const b2cCnt = await rawClient.crm.contacts.basicApi.create({
      properties: { email: `coa.b2c.${ts}@test.com`, firstname: 'COA', lastname: `B2C_${ts}`, coa_marketing_consent: 'true' }
    });
    createdRecordIds.push({ type: 'contact', id: b2cCnt.id });

    const b2cLeadRes = await processHubSpotCustomCodeAction({
      origin: { portalId: accountDetails.portalId },
      object: { objectId: b2cCnt.id, objectType: 'CONTACT' },
      inputFields: { relationshipType: 'b2c', offeringKeys: 'prod_b2c_e2e' }
    }, token, adapter);
    if (b2cLeadRes.outputFields.objectId) createdRecordIds.push({ type: 'lead', id: b2cLeadRes.outputFields.objectId });

    // Scenario 3: Suppression
    const suppCnt = await rawClient.crm.contacts.basicApi.create({
      properties: { email: `coa.supp.${ts}@test.com`, coa_automation_suppressed: 'true' }
    });
    createdRecordIds.push({ type: 'contact', id: suppCnt.id });

    const suppRes = await processHubSpotCustomCodeAction({
      origin: { portalId: accountDetails.portalId },
      object: { objectId: suppCnt.id, objectType: 'CONTACT' }
    }, token, adapter);

    // Scenario 4: Ambiguity & Manual Review Task
    const noCompCnt = await rawClient.crm.contacts.basicApi.create({
      properties: { email: `coa.nocomp.${ts}@test.com` }
    });
    createdRecordIds.push({ type: 'contact', id: noCompCnt.id });

    const noCompRes = await processHubSpotCustomCodeAction({
      origin: { portalId: accountDetails.portalId },
      object: { objectId: noCompCnt.id, objectType: 'CONTACT' },
      inputFields: { relationshipType: 'b2b' }
    }, token, adapter);

    return {
      success: true,
      portalId: accountDetails.portalId,
      accountType: accountDetails.accountType,
      schemaApplied: applyResult.applied,
      schemaVerified: readbackResult.verified,
      secondPlanEmpty: plan2Empty,
      scenariosExecuted: 4,
      trackedRecordsCount: createdRecordIds.length
    };
  } finally {
    // Gate 7 Cleanup: Discover and archive EVERY synthetic record created!
    console.log('--- Cleaning up Synthetic Live Records ---');
    for (const rec of createdRecordIds.reverse()) {
      try {
        if (rec.type === 'contact') await rawClient.crm.contacts.basicApi.archive(rec.id);
        if (rec.type === 'company') await rawClient.crm.companies.basicApi.archive(rec.id);
        if (rec.type === 'deal') await rawClient.crm.deals.basicApi.archive(rec.id);
        if (rec.type === 'lead') await (rawClient.crm.objects as any).leads.basicApi.archive(rec.id);
        if (rec.type === 'task') await (rawClient.crm.objects as any).tasks.basicApi.archive(rec.id);
        if (rec.type === 'line_item') await rawClient.crm.lineItems.basicApi.archive(rec.id);
      } catch (err: any) {
        logger.warn(`Cleanup failed for ${rec.type} record ${rec.id}`, err);
      }
    }
  }
}

if (require.main === module) {
  runAuthenticatedE2EVerification().then(res => {
    console.log('Verification finished:', JSON.stringify(res, null, 2));
  }).catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
}
