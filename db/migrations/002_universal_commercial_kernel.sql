-- Migration 002: Universal Commercial Kernel and HubSpot Native Object Model

CREATE TABLE IF NOT EXISTS organization_installations (
  id BIGSERIAL PRIMARY KEY,
  portal_id BIGINT NOT NULL UNIQUE,
  organization_key VARCHAR(255) NOT NULL,
  config_version VARCHAR(50) NOT NULL,
  account_role VARCHAR(100) DEFAULT 'developer-test',
  capability_snapshot JSONB NOT NULL,
  installed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commercial_relationship_projection (
  id BIGSERIAL PRIMARY KEY,
  relationship_key VARCHAR(255) NOT NULL UNIQUE,
  subject_references JSONB NOT NULL,
  relationship_type VARCHAR(100) NOT NULL,
  active_lead_id VARCHAR(255),
  active_deal_id VARCHAR(255),
  latest_opportunity_type VARCHAR(50) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS opportunity_projection (
  id BIGSERIAL PRIMARY KEY,
  opportunity_key VARCHAR(255) NOT NULL UNIQUE,
  relationship_key VARCHAR(255) NOT NULL REFERENCES commercial_relationship_projection(relationship_key),
  crm_object_type VARCHAR(50) NOT NULL, -- 'lead' or 'deal'
  crm_object_id VARCHAR(255),
  opportunity_type VARCHAR(50) NOT NULL, -- MQL, SQL, FTP, RTP
  cycle_index INT DEFAULT 1,
  predecessor_key VARCHAR(255),
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT unique_predecessor_successor UNIQUE (predecessor_key, opportunity_type, cycle_index)
);

CREATE TABLE IF NOT EXISTS qualification_evaluations (
  id BIGSERIAL PRIMARY KEY,
  opportunity_key VARCHAR(255) NOT NULL REFERENCES opportunity_projection(opportunity_key),
  config_version VARCHAR(50) NOT NULL,
  result JSONB NOT NULL,
  evidence_refs JSONB,
  evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE hubspot_jobs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE hubspot_jobs ADD COLUMN IF NOT EXISTS error_class VARCHAR(255);

ALTER TABLE hubspot_dead_letters ADD CONSTRAINT unique_dead_letter_job UNIQUE (job_id);
