export interface SequenceState {
  contactEmail: string;
  dealKey: string;
  role: string;
  sequenceActivatedAt?: string | null;
  selectedRoute?: 'Email' | 'Call' | 'Manual' | null;
}

export interface ActivationTask {
  subject: string;
  taskCode: string;
  contactEmail: string;
  dealKey: string;
  routeOptions: string[];
}

export function requiresActivationTask(sequenceState: SequenceState): boolean {
  // Activation task is required if sequence is not yet activated and role is Decision Maker
  return !sequenceState.sequenceActivatedAt && sequenceState.role === 'Decision Maker';
}

export function createActivationTask(contactEmail: string, contactName: string, dealKey: string): ActivationTask {
  return {
    subject: `[Sequence Activation] Choose route for ${contactName}`,
    taskCode: '[seq_activation]',
    contactEmail,
    dealKey,
    routeOptions: ['Email', 'Call', 'Manual']
  };
}

export function isOutreachPermitted(sequenceState: SequenceState): boolean {
  // Outreach is permitted ONLY if sequence is activated by a human
  return Boolean(sequenceState.sequenceActivatedAt);
}

export function activateSequence(sequenceState: SequenceState, route: 'Email' | 'Call' | 'Manual'): SequenceState {
  return {
    ...sequenceState,
    sequenceActivatedAt: new Date().toISOString(),
    selectedRoute: route
  };
}
