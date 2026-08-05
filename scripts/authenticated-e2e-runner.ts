import { HubspotAdapter } from '../packages/hubspot-adapter';
import { SchemaTool } from '../packages/domain/schema-cli';
import { processHubSpotCustomCodeAction } from '../src/custom-code-actions/reconcile-record';
import { logger } from '../packages/observability';

export async function runAuthenticatedE2EVerification() {
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_DEVELOPMENT_PERSONAL_ACCESS_KEY;
  if (!token) {
    logger.warn('AUTHENTICATED_E2E_SKIPPED: PRIVATE_APP_ACCESS_TOKEN environment variable not set.');
    return { skipped: true, reason: 'PRIVATE_APP_ACCESS_TOKEN missing' };
  }

  const adapter = new HubspotAdapter(token);
  const schemaTool = new SchemaTool();

  console.log('=== STARTING AUTHENTICATED DEVELOPER-TEST PORTAL 149041124 VERIFICATION ===');

  // 1. Schema Apply & Readback Verification
  console.log('--- Step 1: Applying & Verifying Schema Manifest against Portal 149041124 ---');
  const plan = schemaTool.plan();
  const applyResult = await schemaTool.apply(plan, adapter, 149041124);
  console.log(`Schema Apply Result: Applied Count = ${applyResult.count}, Errors = ${applyResult.errors.length}`);

  const readbackResult = await schemaTool.readback(adapter);
  console.log(`Schema Readback Verified: ${readbackResult.verified}`);

  // 2. Synthetic Fixture Lifecycle Verification
  const ts = Date.now();
  const rawClient = adapter.getRawClient();

  console.log('--- Step 2: Creating Synthetic B2B & B2C Live Fixtures ---');
  let syntheticContact: any = null;
  let syntheticCompany: any = null;

  try {
    syntheticCompany = await rawClient.crm.companies.basicApi.create({
      properties: {
        name: `COA_E2E_Comp_${ts}`,
        domain: `coa-e2e-${ts}.com`,
        coa_relationship_type: 'b2b',
        coa_marketing_consent: 'true'
      }
    });

    syntheticContact = await rawClient.crm.contacts.basicApi.create({
      properties: {
        email: `coa.e2e.${ts}@test.com`,
        phone: `+1555${ts.toString().slice(-7)}`,
        firstname: 'COA',
        lastname: `E2E_${ts}`,
        coa_relationship_type: 'b2b',
        coa_marketing_consent: 'true'
      },
      associations: [{
        to: { id: syntheticCompany.id },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }] // Primary Company -> Contact
      }]
    });

    console.log(`Created Synthetic Company ID: ${syntheticCompany.id}`);
    console.log(`Created Synthetic Contact ID: ${syntheticContact.id}`);

    // Execute Custom Code Action on Contact Event
    const actionResult = await processHubSpotCustomCodeAction({
      origin: { portalId: 149041124 },
      object: { objectId: syntheticContact.id, objectType: 'CONTACT' },
      inputFields: { offeringKeys: 'prod_software' }
    }, token, adapter);

    console.log('Custom Code Action Execution Output:', JSON.stringify(actionResult.outputFields, null, 2));

    return {
      success: true,
      portalId: 149041124,
      schemaApplied: applyResult.applied,
      schemaVerified: readbackResult.verified,
      syntheticContactId: syntheticContact.id,
      syntheticCompanyId: syntheticCompany.id,
      actionResult: actionResult.outputFields
    };
  } finally {
    // Clean up synthetic test records
    console.log('--- Step 3: Cleaning up Synthetic Fixture Records ---');
    if (syntheticContact?.id) {
      try { await rawClient.crm.contacts.basicApi.archive(syntheticContact.id); } catch {}
    }
    if (syntheticCompany?.id) {
      try { await rawClient.crm.companies.basicApi.archive(syntheticCompany.id); } catch {}
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
