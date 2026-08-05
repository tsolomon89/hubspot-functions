-- Migration 001: Initial Persistence Schema for HubSpot Commercial Automation

CREATE TABLE IF NOT EXISTS hubspot_event_inbox (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL,
  subscription_type VARCHAR(255) NOT NULL,
  object_id BIGINT NOT NULL,
  portal_id BIGINT NOT NULL,
  occurred_at BIGINT NOT NULL,
  raw_payload JSONB NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'PENDING',
  CONSTRAINT unique_hubspot_event UNIQUE (event_id, occurred_at)
);

CREATE TABLE IF NOT EXISTS hubspot_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type VARCHAR(100) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'QUEUED',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  leased_until TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hubspot_transition_keys (
  id BIGSERIAL PRIMARY KEY,
  transition_key VARCHAR(255) NOT NULL UNIQUE,
  deal_id VARCHAR(255) NOT NULL,
  source_trigger VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hubspot_execution_log (
  id BIGSERIAL PRIMARY KEY,
  correlation_id VARCHAR(255) NOT NULL,
  object_type VARCHAR(100) NOT NULL,
  object_id VARCHAR(255) NOT NULL,
  action_name VARCHAR(255) NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hubspot_dead_letters (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT REFERENCES hubspot_jobs(id),
  event_id VARCHAR(255),
  reason TEXT NOT NULL,
  payload JSONB NOT NULL,
  failed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hubspot_schema_runs (
  id BIGSERIAL PRIMARY KEY,
  manifest_version VARCHAR(50) NOT NULL,
  mode VARCHAR(50) NOT NULL, -- inspect, plan, apply, readback
  diff_summary JSONB,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
