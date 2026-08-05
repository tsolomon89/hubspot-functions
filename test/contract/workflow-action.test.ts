import { describe, it, expect } from 'vitest';
import { buildServer } from '../../services/api';

describe('Stateless Workflow Action API Contract Tests', () => {
  it('should respond with OK on health check without database connection', async () => {
    const app = buildServer('fake-token');
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('OK');
    expect(body.runtime).toBe('stateless-workflow-actions');
  });

  it('should fail closed with FAILED_TERMINAL when required body parameters are missing', async () => {
    const app = buildServer('fake-token');
    const response = await app.inject({
      method: 'POST',
      url: '/workflow-actions/reconcile',
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('FAILED_TERMINAL');
    expect(body.error).toContain('Missing required objectId or objectType');
  });

  it('should handle unauthenticated API errors with FAILED_RETRYABLE status code 500', async () => {
    const app = buildServer('invalid-token-xyz');
    const response = await app.inject({
      method: 'POST',
      url: '/workflow-actions/reconcile',
      payload: {
        portalId: '149041124',
        objectType: 'contact',
        objectId: 'cnt_88123',
        relationshipType: 'b2c'
      }
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('FAILED_RETRYABLE');
    expect(body.verified).toBe(false);
  });
});
