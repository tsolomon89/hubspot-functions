-- Migration 002: Universal Commercial Kernel & Native CRM Object Mapping

-- 1. Organization Installations Table
CREATE TABLE IF NOT EXISTS organization_installations (
  organization_key VARCHAR(128) PRIMARY KEY,
  organization_name VARCHAR(255) NOT NULL,
  hubspot_portal_id BIGINT UNIQUE NOT NULL,
  default_relationship_type VARCHAR(64) NOT NULL DEFAULT 'b2b',
  config_version VARCHAR(64) NOT NULL DEFAULT '1.0.0',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 2. Commercial Relationship Projections Table
CREATE TABLE IF NOT EXISTS commercial_relationship_projection (
  relationship_key VARCHAR(255) PRIMARY KEY,
  organization_key VARCHAR(128) NOT NULL REFERENCES organization_installations(organization_key) ON DELETE CASCADE,
  relationship_type VARCHAR(64) NOT NULL,
  subject_kind VARCHAR(64) NOT NULL,
  subject_key VARCHAR(255) NOT NULL,
  hubspot_company_id VARCHAR(64),
  hubspot_contact_id VARCHAR(64),
  active_opportunity_key VARCHAR(255),
  active_opportunity_type VARCHAR(32),
  lifecycle_stage VARCHAR(64) NOT NULL DEFAULT 'lead',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3. Opportunity Projections Table
CREATE TABLE IF NOT EXISTS opportunity_projection (
  opportunity_key VARCHAR(255) PRIMARY KEY,
  relationship_key VARCHAR(255) NOT NULL REFERENCES commercial_relationship_projection(relationship_key) ON DELETE CASCADE,
  organization_key VARCHAR(128) NOT NULL,
  opportunity_type VARCHAR(32) NOT NULL,
  opportunity_state VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  qualification_state VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  cycle_index INT NOT NULL DEFAULT 1,
  predecessor_opportunity_key VARCHAR(255),
  predecessor_completed_at TIMESTAMP WITH TIME ZONE,
  hubspot_lead_id VARCHAR(64),
  hubspot_deal_id VARCHAR(64),
  unsatisfied_goal_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 4. Qualification Evaluations Audit Table
CREATE TABLE IF NOT EXISTS qualification_evaluations (
  evaluation_id BIGSERIAL PRIMARY KEY,
  opportunity_key VARCHAR(255) NOT NULL REFERENCES opportunity_projection(opportunity_key) ON DELETE CASCADE,
  qualification_state VARCHAR(32) NOT NULL,
  satisfied_goal_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  unsatisfied_goal_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_version VARCHAR(64) NOT NULL,
  evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 5. Transition Key Reservation Table for Idempotency
CREATE TABLE IF NOT EXISTS hubspot_transition_keys (
  transition_key VARCHAR(255) PRIMARY KEY,
  opportunity_key VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 6. Add Retry Schedule & Error Classification Columns to Job Queue
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hubspot_jobs' AND column_name='next_attempt_at') THEN
    ALTER TABLE hubspot_jobs ADD COLUMN next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hubspot_jobs' AND column_name='error_class') THEN
    ALTER TABLE hubspot_jobs ADD COLUMN error_class VARCHAR(64);
  END IF;
END $$;

-- 7. Add Unique Guard for Job ID on Dead Letters Table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hubspot_dead_letters_job_id_key') THEN
    ALTER TABLE hubspot_dead_letters ADD CONSTRAINT hubspot_dead_letters_job_id_key UNIQUE (job_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore if constraint already exists
END $$;
