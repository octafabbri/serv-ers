-- Migration: Add scheduling workflow columns to service_requests
-- Date: 2026-02-13
--
-- Adds:
--   1. service_request_status enum type + migrate status column to use it
--   2. proposed_date (timestamptz) — the currently active proposed date/time
--   3. proposal_history (jsonb) — audit log of all proposals
--   4. last_updated_by (text) — user ID of whoever last changed the status
--
-- All existing columns and data are preserved.

-- Step 1: Create the enum type for service request status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_request_status') THEN
    CREATE TYPE service_request_status AS ENUM (
      'draft',
      'submitted',
      'accepted',
      'rejected',
      'counter_proposed',
      'counter_approved',
      'counter_rejected',
      'completed',
      'cancelled'
    );
  END IF;
END
$$;

-- Step 2: Migrate the status column from text to the enum type
--   a. Rename old column
ALTER TABLE service_requests RENAME COLUMN status TO status_old;

--   b. Add new column with enum type, defaulting to 'draft'
ALTER TABLE service_requests
  ADD COLUMN status service_request_status NOT NULL DEFAULT 'draft';

--   c. Copy existing values over (cast text → enum)
UPDATE service_requests SET status = status_old::service_request_status;

--   d. Drop the old text column
ALTER TABLE service_requests DROP COLUMN status_old;

-- Step 3: Add proposed_date — the currently active proposed date/time
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS proposed_date timestamptz;

-- Step 4: Add proposal_history — JSONB array of all proposal entries
--   Each entry shape:
--   {
--     "proposed_by": "fleet_user" | "service_provider",
--     "proposed_at": "ISO 8601 timestamp",
--     "proposed_date": "ISO 8601 timestamp",
--     "notes": "string"
--   }
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS proposal_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Step 5: Add last_updated_by — tracks who last changed the status
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS last_updated_by text;

-- Step 6: Add an index on status for provider dashboard queries
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests (status);

-- Step 7: Add an index on last_updated_by for audit queries
CREATE INDEX IF NOT EXISTS idx_service_requests_last_updated_by ON service_requests (last_updated_by);
