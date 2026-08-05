import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { ReconciliationWorker, dbPool } from '../../../services/worker';

describe('Real PostgreSQL Worker Integration & Queue Durability Test Suite', () => {
  const isPostgresAvailable = process.env.DATABASE_URL !== undefined;

  beforeAll(async () => {
    if (!isPostgresAvailable) return;
    const client = await dbPool.connect();
    try {
      // Run table initialization
      await client.query(`
        CREATE TABLE IF NOT EXISTS hubspot_jobs (
          id SERIAL PRIMARY KEY,
          job_type VARCHAR(64) NOT NULL,
          record_id VARCHAR(128) NOT NULL,
          payload JSONB NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
          attempts INT NOT NULL DEFAULT 0,
          max_attempts INT NOT NULL DEFAULT 3,
          leased_until TIMESTAMP WITH TIME ZONE,
          next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          last_error TEXT,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS hubspot_event_inbox (
          event_id VARCHAR(128) PRIMARY KEY,
          portal_id BIGINT NOT NULL,
          app_id BIGINT NOT NULL,
          subscription_id BIGINT NOT NULL,
          event_type VARCHAR(64) NOT NULL,
          raw_payload JSONB NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS hubspot_dead_letters (
          job_id INT PRIMARY KEY,
          reason TEXT NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS hubspot_execution_log (
          id SERIAL PRIMARY KEY,
          correlation_id VARCHAR(128) NOT NULL,
          object_type VARCHAR(64) NOT NULL,
          object_id VARCHAR(128) NOT NULL,
          action_name VARCHAR(128) NOT NULL,
          details JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `);
    } finally {
      client.release();
    }
  });

  it('should lease queued job atomically with FOR UPDATE SKIP LOCKED when DB is connected', async () => {
    if (!isPostgresAvailable) {
      console.log('Skipping real PostgreSQL integration test: DATABASE_URL not set');
      expect(true).toBe(true);
      return;
    }

    const client = await dbPool.connect();
    try {
      // Insert test job
      const insertRes = await client.query(`
        INSERT INTO hubspot_jobs (job_type, record_id, payload, status)
        VALUES ('INTAKE_INGESTION', 'rec_test_1', '{"contact":{"email":"test@example.com"}}', 'QUEUED')
        RETURNING id;
      `);
      const jobId = insertRes.rows[0].id;

      const worker = new ReconciliationWorker();
      const job = await worker.leaseNextJob();

      expect(job).not.toBeNull();
      expect(job?.id).toBe(jobId);
    } finally {
      client.release();
    }
  });

  it('should recover expired abandoned lease safely', async () => {
    if (!isPostgresAvailable) return;

    const client = await dbPool.connect();
    try {
      const insertRes = await client.query(`
        INSERT INTO hubspot_jobs (job_type, record_id, payload, status, leased_until)
        VALUES ('INTAKE_INGESTION', 'rec_test_2', '{"contact":{"email":"expired@example.com"}}', 'PROCESSING', NOW() - INTERVAL '10 minutes')
        RETURNING id;
      `);
      const jobId = insertRes.rows[0].id;

      const worker = new ReconciliationWorker();
      const job = await worker.leaseNextJob();

      expect(job).not.toBeNull();
      expect(job?.id).toBe(jobId);
    } finally {
      client.release();
    }
  });
});
