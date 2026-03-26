-- Migration: Fleet proposal response RPCs + propose_new_time multi-round fix
-- Date: 2026-02-13
--
-- Creates:
--   approve_proposed_time(request_id) — fleet user accepts provider's proposed time
--   reject_proposed_time(request_id, reason) — fleet user rejects and returns to pool
-- Updates:
--   propose_new_time — allow providers to re-propose on counter_proposed status

-- ============================================
-- 1. approve_proposed_time
-- ============================================
CREATE OR REPLACE FUNCTION public.approve_proposed_time(p_request_id UUID)
RETURNS SETOF service_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_request service_requests%ROWTYPE;
  v_caller_name TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role != 'fleet' THEN
    RAISE EXCEPTION 'Only fleet users can approve proposed times';
  END IF;

  SELECT * INTO v_request FROM service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request not found: %', p_request_id;
  END IF;

  IF v_request.status != 'counter_proposed' THEN
    RAISE EXCEPTION 'Can only approve counter-proposed requests (current status: "%")', v_request.status;
  END IF;

  IF v_request.created_by_id != v_caller_id THEN
    RAISE EXCEPTION 'Only the request creator can approve a proposed time';
  END IF;

  SELECT name INTO v_caller_name FROM users WHERE id = v_caller_id;

  UPDATE service_requests SET
    status = 'counter_approved',
    scheduled_date = to_char(proposed_date AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
    scheduled_time = to_char(proposed_date AT TIME ZONE 'UTC', 'HH24:MI'),
    accepted_at = now(),
    last_updated_by = v_caller_id::text
  WHERE id = p_request_id;

  -- Notify the assigned provider
  IF v_request.assigned_provider_id IS NOT NULL THEN
    INSERT INTO service_request_notifications (
      request_id, recipient_id, actor_id, event_type, message
    ) VALUES (
      p_request_id,
      v_request.assigned_provider_id,
      v_caller_id,
      'counter_approved',
      format('%s approved your proposed time for the %s request',
             COALESCE(v_caller_name, 'Fleet user'),
             v_request.service_type)
    );
  END IF;

  RETURN QUERY SELECT * FROM service_requests WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_proposed_time(UUID) TO authenticated;

-- ============================================
-- 2. reject_proposed_time
-- ============================================
CREATE OR REPLACE FUNCTION public.reject_proposed_time(
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
  v_caller_name TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role != 'fleet' THEN
    RAISE EXCEPTION 'Only fleet users can reject proposed times';
  END IF;

  SELECT * INTO v_request FROM service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request not found: %', p_request_id;
  END IF;

  IF v_request.status != 'counter_proposed' THEN
    RAISE EXCEPTION 'Can only reject counter-proposed requests (current status: "%")', v_request.status;
  END IF;

  IF v_request.created_by_id != v_caller_id THEN
    RAISE EXCEPTION 'Only the request creator can reject a proposed time';
  END IF;

  SELECT name INTO v_caller_name FROM users WHERE id = v_caller_id;

  -- Revert to submitted, unassign provider so it goes back into the pool
  UPDATE service_requests SET
    status = 'submitted',
    assigned_provider_id = NULL,
    assigned_provider_name = NULL,
    proposed_date = NULL,
    last_updated_by = v_caller_id::text
  WHERE id = p_request_id;

  -- Notify the provider their proposal was rejected
  IF v_request.assigned_provider_id IS NOT NULL THEN
    INSERT INTO service_request_notifications (
      request_id, recipient_id, actor_id, event_type, message
    ) VALUES (
      p_request_id,
      v_request.assigned_provider_id,
      v_caller_id,
      'counter_rejected',
      format('%s rejected your proposed time for the %s request%s',
             COALESCE(v_caller_name, 'Fleet user'),
             v_request.service_type,
             CASE WHEN p_reason IS NOT NULL
                  THEN format(': %s', p_reason)
                  ELSE '' END)
    );
  END IF;

  RETURN QUERY SELECT * FROM service_requests WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_proposed_time(UUID, TEXT) TO authenticated;

-- ============================================
-- 3. Update propose_new_time: allow providers on counter_proposed
-- ============================================
-- The provider guard currently restricts to status = 'submitted' only.
-- For multi-round negotiation (US-07), providers also need to re-propose
-- when the fleet counter-proposed back (status = 'counter_proposed').

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
    -- Providers can propose on submitted OR counter_proposed (multi-round)
    IF v_request.status NOT IN ('submitted', 'counter_proposed') THEN
      RAISE EXCEPTION 'Providers can only propose new times on submitted or counter-proposed requests (current status: "%")', v_request.status;
    END IF;
    -- If counter_proposed, only the assigned provider can re-propose
    IF v_request.status = 'counter_proposed'
       AND v_request.assigned_provider_id IS NOT NULL
       AND v_request.assigned_provider_id != v_caller_id THEN
      RAISE EXCEPTION 'Only the assigned provider can respond to a fleet counter-proposal';
    END IF;
    IF v_request.status = 'submitted'
       AND v_request.assigned_provider_id IS NOT NULL
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

GRANT EXECUTE ON FUNCTION public.approve_proposed_time(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_proposed_time(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propose_new_time(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
