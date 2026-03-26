-- Migration: RPC security & correctness fixes
-- Date: 2026-02-13
--
-- Fixes:
-- 1. accept_service_request: generalize provider ownership guard to all statuses
-- 2. decline_service_request: restrict to assigned provider only (prevents pool poisoning)
-- 3. propose_new_time: COALESCE on proposal_history to handle NULL safely

-- ============================================
-- Fix 1: accept_service_request
-- ============================================
-- Problem: The assigned_provider_id check only applied when status = 'counter_proposed'.
-- A submitted request with an assigned_provider_id (direct assignment) could be
-- hijacked by a different provider.
-- Fix: Apply the ownership guard for ALL statuses, not just counter_proposed.

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

  -- Guard: if a provider is already assigned, only THAT provider may accept
  IF v_request.assigned_provider_id IS NOT NULL
     AND v_request.assigned_provider_id != v_caller_id THEN
    RAISE EXCEPTION 'This request is assigned to another provider';
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

-- ============================================
-- Fix 2: decline_service_request
-- ============================================
-- Problem: Any provider could decline any submitted request in the open pool,
-- setting it to 'rejected' and removing it from all providers' dashboards.
-- This is a pool-poisoning vulnerability.
-- Fix: Only the assigned provider can decline. Unassigned pool requests
-- cannot be declined — providers should simply not accept them.

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

  -- Guard: only the assigned provider can decline
  IF v_request.assigned_provider_id IS NULL
     OR v_request.assigned_provider_id != v_caller_id THEN
    RAISE EXCEPTION 'Only the assigned provider can decline this request';
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

-- ============================================
-- Fix 3: propose_new_time
-- ============================================
-- Problem: proposal_history || v_history_entry returns NULL when
-- proposal_history is NULL (the || operator propagates NULL).
-- Rows created before the migration may have NULL instead of '[]'.
-- Fix: Wrap in COALESCE.

CREATE OR REPLACE FUNCTION public.propose_new_time(
  p_request_id UUID,
  p_new_proposed_date TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
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
  v_proposed_by TEXT;
  v_recipient_id UUID;
  v_caller_name TEXT;
  v_history_entry JSONB;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT * INTO v_request FROM service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request not found: %', p_request_id;
  END IF;

  IF v_caller_role = 'provider' THEN
    IF v_request.status != 'submitted' THEN
      RAISE EXCEPTION 'Providers can only propose new times on submitted requests (current status: "%")', v_request.status;
    END IF;
    IF v_request.assigned_provider_id IS NOT NULL
       AND v_request.assigned_provider_id != v_caller_id THEN
      RAISE EXCEPTION 'Only the assigned provider can propose a new time';
    END IF;
    v_proposed_by := 'service_provider';
    v_recipient_id := v_request.created_by_id;

  ELSIF v_caller_role = 'fleet' THEN
    IF v_request.status != 'counter_proposed' THEN
      RAISE EXCEPTION 'Fleet users can only propose new times on counter-proposed requests (current status: "%")', v_request.status;
    END IF;
    IF v_request.created_by_id != v_caller_id THEN
      RAISE EXCEPTION 'Only the request creator can propose a new time';
    END IF;
    v_proposed_by := 'fleet_user';
    v_recipient_id := v_request.assigned_provider_id;

  ELSE
    RAISE EXCEPTION 'Invalid role: %', v_caller_role;
  END IF;

  SELECT name INTO v_caller_name FROM users WHERE id = v_caller_id;

  v_history_entry := jsonb_build_object(
    'proposed_by', v_proposed_by,
    'proposed_at', now()::text,
    'proposed_date', p_new_proposed_date::text,
    'notes', p_notes
  );

  UPDATE service_requests SET
    status = 'counter_proposed',
    proposed_date = p_new_proposed_date,
    proposal_history = COALESCE(proposal_history, '[]'::jsonb) || v_history_entry,
    last_updated_by = v_caller_id::text,
    assigned_provider_id = CASE
      WHEN v_caller_role = 'provider' THEN v_caller_id
      ELSE assigned_provider_id
    END,
    assigned_provider_name = CASE
      WHEN v_caller_role = 'provider' THEN COALESCE(v_caller_name, 'Provider')
      ELSE assigned_provider_name
    END
  WHERE id = p_request_id;

  IF v_recipient_id IS NOT NULL THEN
    INSERT INTO service_request_notifications (
      request_id, recipient_id, actor_id, event_type, message
    ) VALUES (
      p_request_id,
      v_recipient_id,
      v_caller_id,
      'counter_proposed',
      format('%s proposed a new time for your %s request%s',
             COALESCE(v_caller_name, 'Someone'),
             v_request.service_type,
             CASE WHEN p_notes IS NOT NULL
                  THEN format(': %s', p_notes)
                  ELSE '' END)
    );
  END IF;

  RETURN QUERY SELECT * FROM service_requests WHERE id = p_request_id;
END;
$$;

-- Re-grant execute (CREATE OR REPLACE preserves grants, but be explicit)
GRANT EXECUTE ON FUNCTION public.accept_service_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_service_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propose_new_time(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
