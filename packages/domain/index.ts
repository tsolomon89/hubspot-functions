export * from './identity';
export * from './config-resolver';

export function computeOpportunityKey(relationshipKey: string, opportunityType: string, cycleIndex: number = 1): string {
  return `${relationshipKey}::${opportunityType}::${cycleIndex}`;
}

export function buildTransitionKey(
  organizationKey: string,
  opportunityKey: string,
  opportunityType: string,
  cycleIndex: number,
  configVersion: string
): string {
  return `complete::${organizationKey}::${opportunityKey}::${opportunityType}::${cycleIndex}::${configVersion}`;
}
