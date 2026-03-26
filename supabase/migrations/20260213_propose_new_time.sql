-- Migration: propose_new_time RPC function
-- Date: 2026-02-13
--
-- Creates propose_new_time(request_id, new_proposed_date, notes) — SECURITY DEFINER RPC
--
-- Called by either party to propose a new date/time during negotiation:
--   - Providers can propose when status = 'submitted' (initial counter)
--   - Fleet users can propose when status = 'counter_proposed' (counter back)
--
-- Appends the new proposal to proposal_history, sets proposed_date,
-- updates status to 'counter_proposed', and notifies the other party.

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
  -- Resolve caller role
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Lock and fetch the request
  SELECT * INTO v_request
    FROM service_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request not found: %', p_request_id;
  END IF;

  -- Validate status based on caller role
  IF v_caller_role = 'provider' THEN
    IF v_request.status != 'submitted' THEN
      RAISE EXCEPTION 'Providers can only propose new times on submitted requests (current status: "%")', v_request.status;
    END IF;
    -- Must be assigned provider or request unassigned
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

  -- Get caller name for notification message
  SELECT name INTO v_caller_name FROM users WHERE id = v_caller_id;

  -- Build history entry
  v_history_entry := jsonb_build_object(
    'proposed_by', v_proposed_by,
    'proposed_at', now()::text,
    'proposed_date', p_new_proposed_date::text,
    'notes', p_notes
  );

  -- Update the request
  UPDATE service_requests SET
    status = 'counter_proposed',
    proposed_date = p_new_proposed_date,
    proposal_history = proposal_history || v_history_entry,
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

  -- Notify the other party
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

  -- Return the updated row
  RETURN QUERY SELECT * FROM service_requests WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.propose_new_time(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
