-- ================================================================
-- Combined Migration: Scheduling workflow + RLS + Accept/Decline RPCs
-- Date: 2026-02-13
-- Run this entire script in the Supabase SQL Editor (one shot)
-- ================================================================

-- ============================================
-- PART 1: Add scheduling workflow columns
-- ============================================

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

-- Step 3: Add proposed_date
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS proposed_date timestamptz;

-- Step 4: Add proposal_history
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS proposal_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Step 5: Add last_updated_by
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS last_updated_by text;

-- Step 6: Add index on status
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests (status);

-- Step 7: Add index on last_updated_by
CREATE INDEX IF NOT EXISTS idx_service_requests_last_updated_by ON service_requests (last_updated_by);

-- ============================================
-- PART 2: Replace permissive RLS with role-based policies
-- ============================================

-- Helper: get current user's role from users table
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Drop existing permissive policies on service_requests
DROP POLICY IF EXISTS "Anyone can read submitted requests" ON service_requests;
DROP POLICY IF EXISTS "Anyone can create requests" ON service_requests;
DROP POLICY IF EXISTS "Anyone can update requests" ON service_requests;

-- Drop existing permissive policies on counter_proposals
DROP POLICY IF EXISTS "Anyone can read counter proposals" ON counter_proposals;
DROP POLICY IF EXISTS "Anyone can create counter proposals" ON counter_proposals;
DROP POLICY IF EXISTS "Anyone can update counter proposals" ON counter_proposals;

-- SERVICE REQUESTS — SELECT
CREATE POLICY "Fleet users can read own requests"
  ON service_requests FOR SELECT
  USING (created_by_id = auth.uid());

CREATE POLICY "Providers can read available and assigned requests"
  ON service_requests FOR SELECT
  USING (
    public.get_user_role() = 'provider'
    AND (
      status IN ('submitted')
      OR assigned_provider_id = auth.uid()
    )
  );

-- SERVICE REQUESTS — INSERT
CREATE POLICY "Fleet users can insert requests"
  ON service_requests FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'fleet'
    AND created_by_id = auth.uid()
  );

-- SERVICE REQUESTS — UPDATE
CREATE POLICY "Providers can update submitted or counter-proposed requests"
  ON service_requests FOR UPDATE
  USING (
    public.get_user_role() = 'provider'
    AND status IN ('submitted', 'counter_proposed')
    AND (
      assigned_provider_id = auth.uid()
      OR assigned_provider_id IS NULL
    )
  )
  WITH CHECK (
    status IN ('accepted', 'rejected', 'counter_proposed')
  );

CREATE POLICY "Fleet users can respond to counter-proposals"
  ON service_requests FOR UPDATE
  USING (
    public.get_user_role() = 'fleet'
    AND created_by_id = auth.uid()
    AND status = 'counter_proposed'
  )
  WITH CHECK (
    status IN ('counter_approved', 'submitted')
  );

CREATE POLICY "Fleet users can cancel own requests"
  ON service_requests FOR UPDATE
  USING (
    public.get_user_role() = 'fleet'
    AND created_by_id = auth.uid()
  )
  WITH CHECK (
    status = 'cancelled'
  );

-- COUNTER PROPOSALS — SELECT
CREATE POLICY "Fleet users can read proposals on own requests"
  ON counter_proposals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = counter_proposals.service_request_id
      AND sr.created_by_id = auth.uid()
    )
  );

CREATE POLICY "Providers can read own proposals"
  ON counter_proposals FOR SELECT
  USING (provider_id = auth.uid());

-- COUNTER PROPOSALS — INSERT
CREATE POLICY "Providers can create counter proposals"
  ON counter_proposals FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'provider'
    AND provider_id = auth.uid()
  );

-- COUNTER PROPOSALS — UPDATE
CREATE POLICY "Fleet users can respond to proposals"
  ON counter_proposals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = counter_proposals.service_request_id
      AND sr.created_by_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('approved', 'rejected')
  );

-- USERS — replace permissive policies
DROP POLICY IF EXISTS "Anyone can read users" ON users;
DROP POLICY IF EXISTS "Users can read all users" ON users;
CREATE POLICY "Users can read all users"
  ON users FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can create users" ON users;
CREATE POLICY "Users can insert own record"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Anyone can update users" ON users;
CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  USING (id = auth.uid());

-- ============================================
-- PART 3: Notifications table + Accept/Decline RPCs
-- ============================================

-- Notifications table
CREATE TABLE IF NOT EXISTS service_request_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'request_submitted',
    'request_accepted',
    'request_declined',
    'counter_proposed',
    'counter_approved',
    'counter_rejected',
    'request_completed',
    'request_cancelled'
  )),
  message TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srn_recipient ON service_request_notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_srn_request ON service_request_notifications(request_id);
CREATE INDEX IF NOT EXISTS idx_srn_unread ON service_request_notifications(recipient_id, read_at)
  WHERE read_at IS NULL;

-- Enable RLS on notifications
ALTER TABLE service_request_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON service_request_notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON service_request_notifications FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE service_request_notifications;

-- Add decline_reason column to service_requests
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS decline_reason TEXT;

-- Accept RPC
CREATE OR REPLACE FUNCTION public.accept_service_request(p_request_id UUID)
RETURNS SETOF service_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_request service_requests%ROWTYPE;
  v_provider_name TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role != 'provider' THEN
    RAISE EXCEPTION 'Only service providers can accept requests';
  END IF;

  SELECT * INTO v_request FROM service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request not found: %', p_request_id;
  END IF;

  IF v_request.status NOT IN ('submitted', 'counter_proposed') THEN
    RAISE EXCEPTION 'Cannot accept request with status "%". Must be "submitted" or "counter_proposed".', v_request.status;
  END IF;

  IF v_request.status = 'counter_proposed'
     AND v_request.assigned_provider_id IS NOT NULL
     AND v_request.assigned_provider_id != v_caller_id THEN
    RAISE EXCEPTION 'Only the assigned provider can accept a counter-proposed request';
  END IF;

  SELECT name INTO v_provider_name FROM users WHERE id = v_caller_id;

  UPDATE service_requests SET
    status = 'accepted',
    assigned_provider_id = v_caller_id,
    assigned_provider_name = COALESCE(v_provider_name, 'Provider'),
    accepted_at = now(),
    last_updated_by = v_caller_id::text,
    decline_reason = NULL
  WHERE id = p_request_id;

  INSERT INTO service_request_notifications (
    request_id, recipient_id, actor_id, event_type, message
  ) VALUES (
    p_request_id,
    v_request.created_by_id,
    v_caller_id,
    'request_accepted',
    format('Your %s request has been accepted by %s',
           v_request.service_type, COALESCE(v_provider_name, 'a provider'))
  );

  RETURN QUERY SELECT * FROM service_requests WHERE id = p_request_id;
END;
$$;

-- Decline RPC
CREATE OR REPLACE FUNCTION public.decline_service_request(
  p_request_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS SETOF service_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_request service_requests%ROWTYPE;
  v_provider_name TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role != 'provider' THEN
    RAISE EXCEPTION 'Only service providers can decline requests';
  END IF;

  SELECT * INTO v_request FROM service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request not found: %', p_request_id;
  END IF;

  IF v_request.status NOT IN ('submitted', 'counter_proposed') THEN
    RAISE EXCEPTION 'Cannot decline request with status "%". Must be "submitted" or "counter_proposed".', v_request.status;
  END IF;

  IF v_request.status = 'counter_proposed'
     AND v_request.assigned_provider_id IS NOT NULL
     AND v_request.assigned_provider_id != v_caller_id THEN
    RAISE EXCEPTION 'Only the assigned provider can decline a counter-proposed request';
  END IF;

  SELECT name INTO v_provider_name FROM users WHERE id = v_caller_id;

  UPDATE service_requests SET
    status = 'rejected',
    last_updated_by = v_caller_id::text,
    decline_reason = p_reason,
    assigned_provider_id = NULL,
    assigned_provider_name = NULL
  WHERE id = p_request_id;

  INSERT INTO service_request_notifications (
    request_id, recipient_id, actor_id, event_type, message
  ) VALUES (
    p_request_id,
    v_request.created_by_id,
    v_caller_id,
    'request_declined',
    format('Your %s request was declined%s',
           v_request.service_type,
           CASE WHEN p_reason IS NOT NULL
                THEN format(': %s', p_reason)
                ELSE '' END)
  );

  RETURN QUERY SELECT * FROM service_requests WHERE id = p_request_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.accept_service_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_service_request(UUID, TEXT) TO authenticated;
