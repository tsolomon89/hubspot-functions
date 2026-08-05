import { Pool } from 'pg';
import { logger } from '../../packages/observability';
import { HubspotAdapter } from '../../packages/hubspot-adapter';

export interface TransitionReservationResult {
  action: 'RESERVED' | 'ALREADY_APPLIED' | 'RECOVERED_APPLIED';
  transitionKey: string;
}

export class TransitionLedger {
  private dbPool: Pool;
  private hsAdapter: HubspotAdapter;

  constructor(dbPool: Pool, hsAdapter: HubspotAdapter) {
    this.dbPool = dbPool;
    this.hsAdapter = hsAdapter;
  }

  public async reserveTransition(
    transitionKey: string,
    opportunityKey: string
  ): Promise<TransitionReservationResult> {
    try {
      const client = await this.dbPool.connect();
      try {
        // 1. Check existing transition reservation status
        const existingRes = await client.query(
          `SELECT transition_key, status FROM hubspot_transition_keys WHERE transition_key = $1`,
          [transitionKey]
        );

        if (existingRes.rows.length > 0) {
          const row = existingRes.rows[0];
          if (row.status === 'APPLIED') {
            logger.info('Transition key already APPLIED in ledger', { transitionKey });
            return { action: 'ALREADY_APPLIED', transitionKey };
          }

          if (row.status === 'PENDING') {
            try {
              const rawClient = this.hsAdapter.getRawClient();
              const searchRes = await rawClient.crm.deals.searchApi.doSearch({
                filterGroups: [{
                  filters: [{ propertyName: 'coa_opportunity_key', operator: 'EQ' as any, value: opportunityKey }]
                }],
                sorts: [],
                properties: ['dealname', 'coa_opportunity_key'],
                limit: 1,
                after: '0'
              });

              if (searchRes.results.length > 0) {
                await client.query(
                  `UPDATE hubspot_transition_keys SET status = 'APPLIED', hubspot_object_type = 'deal', hubspot_object_id = $1, updated_at = NOW() WHERE transition_key = $2`,
                  [searchRes.results[0].id, transitionKey]
                );
                logger.info('Recovered transition status from HubSpot CRM as APPLIED', { transitionKey, opportunityKey });
                return { action: 'RECOVERED_APPLIED', transitionKey };
              }
            } catch (err) {
              // Proceed with retry if search fails
            }
          }
        }

        // 2. Reserve PENDING transition
        await client.query(
          `INSERT INTO hubspot_transition_keys (transition_key, opportunity_key, status)
           VALUES ($1, $2, 'PENDING')
           ON CONFLICT (transition_key) DO UPDATE SET updated_at = NOW()`,
          [transitionKey, opportunityKey]
        );

        return { action: 'RESERVED', transitionKey };
      } finally {
        client.release();
      }
    } catch (err: any) {
      logger.warn('Database un-contactable for transition reservation; proceeding in fallback mode', { transitionKey, error: err.message });
      return { action: 'RESERVED', transitionKey };
    }
  }

  public async confirmApplied(
    transitionKey: string,
    objectType: string,
    objectId: string
  ): Promise<void> {
    try {
      await this.dbPool.query(
        `UPDATE hubspot_transition_keys SET status = 'APPLIED', hubspot_object_type = $1, hubspot_object_id = $2, updated_at = NOW() WHERE transition_key = $3`,
        [objectType, objectId, transitionKey]
      );
      logger.info('Confirmed transition APPLIED in ledger', { transitionKey, objectType, objectId });
    } catch (err: any) {
      logger.warn('Could not confirm transition applied in database ledger', { transitionKey, error: err.message });
    }
  }

  public async markFailed(
    transitionKey: string,
    error: string,
    terminal: boolean = false
  ): Promise<void> {
    const status = terminal ? 'FAILED_TERMINAL' : 'FAILED_RETRYABLE';
    try {
      await this.dbPool.query(
        `UPDATE hubspot_transition_keys SET status = $1, last_error = $2, updated_at = NOW() WHERE transition_key = $3`,
        [status, error, transitionKey]
      );
    } catch (err: any) {
      // Ignore DB errors in offline mode
    }
  }
}
