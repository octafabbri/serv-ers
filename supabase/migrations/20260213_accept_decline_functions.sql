-- Migration: Accept/Decline RPC functions + notifications table
-- Date: 2026-02-13
--
-- Creates:
--   1. service_request_notifications table for server-side notification history
--   2. decline_reason column on service_requests
--   3. accept_service_request(request_id) — SECURITY DEFINER RPC
--   4. decline_service_request(request_id, reason) — SECURITY DEFINER RPC
--
-- Note: In the existing schema, "pending" = status 'submitted',
--       and "declined" = status 'rejected'. These functions use the
--       actual enum/column values, not the user-facing labels.

-- ============================================
-- 1. Notifications table
-- ============================================
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

-- Enable RLS
ALTER TABLE service_request_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY "Users can read own notifications"
  ON service_request_notifications FOR SELECT
  USING (recipient_id = auth.uid());

-- Only server-side functions insert notifications (SECURITY DEFINER)
-- No direct INSERT policy for users — functions handle it
CREATE POLICY "Users can update own notifications"
  ON service_request_notifications FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE service_request_notifications;

-- ============================================
-- 2. Add decline_reason column to service_requests
-- ============================================
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS decline_reason TEXT;

-- ============================================
-- 3. accept_service_request(request_id UUID)
-- ============================================
-- Called by a service provider to accept a request.
-- Validates status is 'submitted' or 'counter_proposed'.
-- Sets status to 'accepted', records the provider, notifies the fleet user.
-- Returns the updated service_request row.

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
  -- Resolve caller role
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role != 'provider' THEN
    RAISE EXCEPTION 'Only service providers can accept requests';
  END IF;

  -- Lock and fetch the request
  SELECT * INTO v_request
    FROM service_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request not found: %', p_request_id;
  END IF;

  -- Validate current status
  IF v_request.status NOT IN ('submitted', 'counter_proposed') THEN
    RAISE EXCEPTION 'Cannot accept request with status "%". Must be "submitted" or "counter_proposed".', v_request.status;
  END IF;

  -- If counter_proposed, only the assigned provider can accept
  IF v_request.status = 'counter_proposed'
     AND v_request.assigned_provider_id IS NOT NULL
     AND v_request.assigned_provider_id != v_caller_id THEN
    RAISE EXCEPTION 'Only the assigned provider can accept a counter-proposed request';
  END IF;

  -- Get provider name
  SELECT name INTO v_provider_name FROM users WHERE id = v_caller_id;

  -- Update the request
  UPDATE service_requests SET
    status = 'accepted',
    assigned_provider_id = v_caller_id,
    assigned_provider_name = COALESCE(v_provider_name, 'Provider'),
    accepted_at = now(),
    last_updated_by = v_caller_id::text,
    decline_reason = NULL
  WHERE id = p_request_id;

  -- Notify the fleet user who created the request
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

  -- Return the updated row
  RETURN QUERY SELECT * FROM service_requests WHERE id = p_request_id;
END;
$$;

-- ============================================
-- 4. decline_service_request(request_id UUID, reason TEXT)
-- ============================================
-- Called by a service provider to decline a request.
-- Validates status is 'submitted' or 'counter_proposed'.
-- Sets status to 'rejected', stores optional reason, notifies the fleet user.
-- Returns the updated service_request row.

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
  -- Resolve caller role
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role != 'provider' THEN
    RAISE EXCEPTION 'Only service providers can decline requests';
  END IF;

  -- Lock and fetch the request
  SELECT * INTO v_request
    FROM service_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request not found: %', p_request_id;
  END IF;

  -- Validate current status
  IF v_request.status NOT IN ('submitted', 'counter_proposed') THEN
    RAISE EXCEPTION 'Cannot decline request with status "%". Must be "submitted" or "counter_proposed".', v_request.status;
  END IF;

  -- If counter_proposed, only the assigned provider can decline
  IF v_request.status = 'counter_proposed'
     AND v_request.assigned_provider_id IS NOT NULL
     AND v_request.assigned_provider_id != v_caller_id THEN
    RAISE EXCEPTION 'Only the assigned provider can decline a counter-proposed request';
  END IF;

  -- Get provider name
  SELECT name INTO v_provider_name FROM users WHERE id = v_caller_id;

  -- Update the request
  UPDATE service_requests SET
    status = 'rejected',
    last_updated_by = v_caller_id::text,
    decline_reason = p_reason,
    -- Clear provider assignment so it returns to the pool
    assigned_provider_id = NULL,
    assigned_provider_name = NULL
  WHERE id = p_request_id;

  -- Notify the fleet user who created the request
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

  -- Return the updated row
  RETURN QUERY SELECT * FROM service_requests WHERE id = p_request_id;
END;
$$;

-- ============================================
-- Grant execute to authenticated users
-- ============================================
GRANT EXECUTE ON FUNCTION public.accept_service_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_service_request(UUID, TEXT) TO authenticated;
