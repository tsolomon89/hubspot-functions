import { describe, it, expect } from 'vitest';
import { 
  requiresActivationTask, 
  createActivationTask, 
  isOutreachPermitted, 
  activateSequence, 
  SequenceState 
} from '../../packages/domain';

describe('Sequence Activation Gate Domain Logic', () => {
  const unactivatedState: SequenceState = {
    contactEmail: 'alice@globex.com',
    dealKey: 'globex.com::SKU-360-FIXED',
    role: 'Decision Maker',
    sequenceActivatedAt: null,
    selectedRoute: null
  };

  it('should require activation task for Decision Maker without sequenceActivatedAt', () => {
    expect(requiresActivationTask(unactivatedState)).toBe(true);
  });

  it('should generate activation task with canonical task code [seq_activation]', () => {
    const task = createActivationTask('alice@globex.com', 'Alice Smith', 'globex.com::SKU-360-FIXED');
    expect(task.subject).toContain('[Sequence Activation] Choose route for Alice Smith');
    expect(task.taskCode).toBe('[seq_activation]');
    expect(task.routeOptions).toEqual(['Email', 'Call', 'Manual']);
  });

  it('should suppress outreach while sequence is not activated', () => {
    expect(isOutreachPermitted(unactivatedState)).toBe(false);
  });

  it('should permit outreach once activated by human rep', () => {
    const activatedState = activateSequence(unactivatedState, 'Email');
    expect(activatedState.sequenceActivatedAt).toBeDefined();
    expect(activatedState.selectedRoute).toBe('Email');
    expect(isOutreachPermitted(activatedState)).toBe(true);
  });
});
