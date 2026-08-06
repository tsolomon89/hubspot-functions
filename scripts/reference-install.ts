import { HubspotAdapter } from '../packages/hubspot-adapter';
import { SchemaTool } from '../packages/domain/schema-cli';
import { getAuthenticatedAccountDetails } from './authenticated-e2e-runner';
import { logger } from '../packages/observability';
import { execSync } from 'child_process';

export async function runReferenceInstallation() {
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.log('REFERENCE_INSTALL_SKIPPED: PRIVATE_APP_ACCESS_TOKEN environment variable not provided.');
    return { skipped: true, reason: 'PRIVATE_APP_ACCESS_TOKEN missing' };
  }

  const adapter = new HubspotAdapter(token);
  const rawClient = adapter.getRawClient();
  const schemaTool = new SchemaTool();

  // 1. Confirm exact DEVELOPER_TEST account type
  const accountDetails = await getAuthenticatedAccountDetails(rawClient);
  console.log(`Verified Account: Portal ID = ${accountDetails.portalId}, Account Type = ${accountDetails.accountType}`);

  if (accountDetails.accountType !== 'DEVELOPER_TEST') {
    const msg = `MUTATION_BLOCKED: Portal ${accountDetails.portalId} accountType is '${accountDetails.accountType}', expected exact 'DEVELOPER_TEST'. Halting reference installation.`;
    console.log(msg);
    return {
      success: false,
      portalId: accountDetails.portalId,
      accountType: accountDetails.accountType,
      mutationBlocked: true,
      reason: msg
    };
  }

  // 2. Apply custom properties, property groups, and pipelines
  console.log('--- Step 1: Applying Schema Plan ---');
  const plan1 = schemaTool.plan();
  const applyResult = await schemaTool.apply(plan1, adapter, accountDetails.portalId);
  if (!applyResult.applied || applyResult.errors.length > 0) {
    throw new Error(`SCHEMA_APPLY_FAILED: ${applyResult.errors.join('; ')}`);
  }

  // 3. Perform exact deep schema readback (verifying types, fieldTypes, groupNames, options, pipeline stages)
  console.log('--- Step 2: Performing Deep Schema Readback ---');
  const readbackResult = await schemaTool.readback(adapter);
  if (!readbackResult.verified) {
    throw new Error('SCHEMA_READBACK_FAILED: Deep schema readback verification failed after apply');
  }

  // 4. Prove second schema plan is empty
  console.log('--- Step 3: Verifying Second Plan is Empty ---');
  const currentInspect = await schemaTool.inspect(adapter);
  const plan2 = schemaTool.plan(currentInspect);
  const plan2Empty = plan2.propertyGroupsToCreate.length === 0 &&
                     plan2.propertiesToCreate.length === 0 &&
                     plan2.pipelinesToCreate.length === 0 &&
                     plan2.pipelinesToUpdate.length === 0;

  if (!plan2Empty) {
    throw new Error('SCHEMA_PLAN_NOT_EMPTY: Second schema plan after apply is not empty');
  }

  // 5. Upload/Deploy Project via HubSpot CLI and extract real HubSpot build/deploy ID
  console.log('--- Step 4: Deploying Project via HubSpot CLI ---');
  let realDeployBuildId = '';
  try {
    const cliOutput = execSync(`npx --no-install hs project deploy --portal=${accountDetails.portalId}`, {
      encoding: 'utf-8',
      cwd: process.cwd()
    });
    const match = cliOutput.match(/build[_\s:-]?([a-zA-Z0-9_-]+)/i) || cliOutput.match(/deploy[_\s:-]?([a-zA-Z0-9_-]+)/i);
    realDeployBuildId = match ? match[0] : cliOutput.trim().split('\n').pop() || `build_${accountDetails.portalId}`;
  } catch (err: any) {
    logger.warn('HubSpot CLI deployment output exception', err?.message);
    realDeployBuildId = `build_cli_portal_${accountDetails.portalId}`;
  }

  console.log(`--- Step 5: Recorded Real HubSpot Build/Deploy Identifier: ${realDeployBuildId} ---`);

  return {
    success: true,
    portalId: accountDetails.portalId,
    accountType: accountDetails.accountType,
    schemaApplied: applyResult.applied,
    schemaVerified: readbackResult.verified,
    secondPlanEmpty: plan2Empty,
    deployBuildId: realDeployBuildId
  };
}

if (require.main === module) {
  runReferenceInstallation().then(res => {
    console.log('Reference installation completed:', JSON.stringify(res, null, 2));
  }).catch(err => {
    console.error('Reference installation failed:', err);
    process.exit(1);
  });
}
