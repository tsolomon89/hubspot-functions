-- Migration 003: Operational Ledger Restructure (HubSpot Sole Commercial System of Record)

-- 1. Safely Drop Commercial State Projection Tables if Unpopulated
DO $$
BEGIN
  -- Drop commercial_relationship_projection if empty
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'commercial_relationship_projection') THEN
    IF (SELECT COUNT(*) FROM commercial_relationship_projection) = 0 THEN
      DROP TABLE commercial_relationship_projection CASCADE;
    ELSE
      RAISE WARNING 'commercial_relationship_projection contains data; refusing destructive drop.';
    END IF;
  END IF;

  -- Drop opportunity_projection if empty
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'opportunity_projection') THEN
    IF (SELECT COUNT(*) FROM opportunity_projection) = 0 THEN
      DROP TABLE opportunity_projection CASCADE;
    ELSE
      RAISE WARNING 'opportunity_projection contains data; refusing destructive drop.';
    END IF;
  END IF;

  -- Drop qualification_evaluations if empty
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'qualification_evaluations') THEN
    IF (SELECT COUNT(*) FROM qualification_evaluations) = 0 THEN
      DROP TABLE qualification_evaluations CASCADE;
    ELSE
      RAISE WARNING 'qualification_evaluations contains data; refusing destructive drop.';
    END IF;
  END IF;
END $$;

-- 2. Transition Reservation Ledger Table (Operational Infrastructure Only)
CREATE TABLE IF NOT EXISTS hubspot_transition_keys (
  transition_key VARCHAR(255) PRIMARY KEY,
  opportunity_key VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  hubspot_object_type VARCHAR(64),
  hubspot_object_id VARCHAR(64),
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Ensure transition columns exist if table already created from migration 002
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hubspot_transition_keys' AND column_name='status') THEN
    ALTER TABLE hubspot_transition_keys ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'PENDING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hubspot_transition_keys' AND column_name='hubspot_object_type') THEN
    ALTER TABLE hubspot_transition_keys ADD COLUMN hubspot_object_type VARCHAR(64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hubspot_transition_keys' AND column_name='hubspot_object_id') THEN
    ALTER TABLE hubspot_transition_keys ADD COLUMN hubspot_object_id VARCHAR(64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hubspot_transition_keys' AND column_name='last_error') THEN
    ALTER TABLE hubspot_transition_keys ADD COLUMN last_error TEXT;
  END IF;
END $$;
