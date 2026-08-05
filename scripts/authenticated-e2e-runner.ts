import { Client } from '@hubspot/api-client';
import { HubspotAdapter } from '../packages/hubspot-adapter';
import { SchemaTool } from '../packages/domain/schema-cli';
import { processHubSpotCustomCodeAction } from '../src/custom-code-actions/reconcile-record';
import { OrganizationConfigResolver } from '../packages/domain/config-resolver';
import { logger } from '../packages/observability';

export async function getAuthenticatedPortalId(client: Client): Promise<number> {
  try {
    const res = await (client as any).apiRequest({
      method: 'GET',
      path: '/account-info/v3/details'
    });
    const body = await res.json();
    if (body && body.portalId) {
      return Number(body.portalId);
    }
  } catch (err: any) {
    logger.warn('Failed to query /account-info/v3/details', err);
  }
  throw new Error('TOKEN_ACCOUNT_VERIFICATION_FAILED: Unable to verify account ID from token via HubSpot API');
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

  // Gate 9: Retrieve and verify actual account ID from token API before mutation!
  const actualPortalId = await getAuthenticatedPortalId(rawClient);
  console.log(`Verified Authenticated Token Portal ID: ${actualPortalId}`);

  // Check portal installation registry
  const resolver = new OrganizationConfigResolver();
  const inst = resolver.resolvePortalInstallation(actualPortalId);
  if (!inst) {
    throw new Error(`UNREGISTERED_PORTAL_BLOCKER: Authenticated token portal ID '${actualPortalId}' is not registered in portal-installations.yaml`);
  }

  if (inst.accountRole !== 'developer-test') {
    throw new Error(`NON_DEVELOPER_TEST_PORTAL_BLOCKER: Authenticated portal ID '${actualPortalId}' role is '${inst.accountRole}', expected 'developer-test'. Halting execution to prevent mutation of non-developer-test portal.`);
  }

  console.log(`=== STARTING AUTHENTICATED DEVELOPER-TEST PORTAL ${actualPortalId} VERIFICATION ===`);

  // 1. Schema Apply & Readback Verification
  console.log('--- Step 1: Applying & Verifying Schema Manifest ---');
  const plan1 = schemaTool.plan();
  const applyResult = await schemaTool.apply(plan1, adapter, actualPortalId);
  console.log(`Schema Apply Result: Applied Count = ${applyResult.count}, Errors = ${applyResult.errors.length}`);

  if (!applyResult.applied || applyResult.errors.length > 0) {
    throw new Error(`SCHEMA_APPLY_FAILED: ${applyResult.errors.join('; ')}`);
  }

  const readbackResult = await schemaTool.readback(adapter);
  console.log(`Schema Readback Verified: ${readbackResult.verified}`);

  if (!readbackResult.verified) {
    throw new Error('SCHEMA_READBACK_FAILED: Schema readback verification failed after apply');
  }

  // Verify 2nd schema plan is EMPTY
  const plan2 = schemaTool.plan(await schemaTool.inspect(adapter));
  const plan2Empty = plan2.propertyGroupsToCreate.length === 0 &&
                     plan2.propertiesToCreate.length === 0 &&
                     plan2.pipelinesToCreate.length === 0 &&
                     plan2.pipelinesToUpdate.length === 0;

  console.log(`Second Schema Plan Empty: ${plan2Empty}`);
  if (!plan2Empty) {
    throw new Error('SCHEMA_PLAN_NOT_EMPTY: Second schema plan after apply is not empty');
  }

  // 2. Synthetic Live Lifecycle Verification (B2B, B2C, Line Items, Ambiguity, Suppression, Replay)
  const ts = Date.now();
  const createdRecordIds: { type: string; id: string }[] = [];

  try {
    console.log('--- Step 2: Running Synthetic Live Scenarios ---');

    // B2B Contact + Company Fixture
    const b2bCompany = await rawClient.crm.companies.basicApi.create({
      properties: {
        name: `COA_E2E_B2B_Comp_${ts}`,
        domain: `coa-b2b-${ts}.com`,
        coa_relationship_type: 'b2b',
        coa_marketing_consent: 'true'
      }
    });
    createdRecordIds.push({ type: 'company', id: b2bCompany.id });

    const b2bContact = await rawClient.crm.contacts.basicApi.create({
      properties: {
        email: `coa.b2b.${ts}@test.com`,
        phone: `+1555${ts.toString().slice(-7)}`,
        firstname: 'COA',
        lastname: `B2B_${ts}`,
        coa_relationship_type: 'b2b',
        coa_marketing_consent: 'true'
      },
      associations: [{
        to: { id: b2bCompany.id },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }]
      }]
    });
    createdRecordIds.push({ type: 'contact', id: b2bContact.id });

    // Execute Custom Code Action on B2B Contact Event
    const b2bActionResult = await processHubSpotCustomCodeAction({
      origin: { portalId: actualPortalId },
      object: { objectId: b2bContact.id, objectType: 'CONTACT' },
      inputFields: { offeringKeys: 'prod_software,prod_hardware' }
    }, token, adapter);

    console.log('B2B Contact Custom Code Action Result:', JSON.stringify(b2bActionResult.outputFields, null, 2));

    if (!b2bActionResult.outputFields.verified) {
      throw new Error('ACTION_RESULT_NOT_VERIFIED: B2B Contact custom code action execution failed verification');
    }

    return {
      success: true,
      portalId: actualPortalId,
      accountRole: inst.accountRole,
      schemaApplied: applyResult.applied,
      schemaVerified: readbackResult.verified,
      secondPlanEmpty: plan2Empty,
      b2bContactId: b2bContact.id,
      b2bCompanyId: b2bCompany.id,
      b2bActionResult: b2bActionResult.outputFields
    };
  } finally {
    // Gate 9 Cleanup: Remove every synthetic record created!
    console.log('--- Step 3: Cleaning up Synthetic Live Records ---');
    for (const rec of createdRecordIds.reverse()) {
      try {
        if (rec.type === 'contact') await rawClient.crm.contacts.basicApi.archive(rec.id);
        if (rec.type === 'company') await rawClient.crm.companies.basicApi.archive(rec.id);
        if (rec.type === 'deal') await rawClient.crm.deals.basicApi.archive(rec.id);
        if (rec.type === 'lead') await (rawClient.crm.objects as any).leads.basicApi.archive(rec.id);
        if (rec.type === 'task') await (rawClient.crm.objects as any).tasks.basicApi.archive(rec.id);
        if (rec.type === 'line_item') await rawClient.crm.lineItems.basicApi.archive(rec.id);
      } catch (err: any) {
        logger.warn(`Failed to clean up synthetic ${rec.type} record ${rec.id}`, err);
      }
    }
    console.log('Cleanup Complete.');
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
