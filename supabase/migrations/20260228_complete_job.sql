-- Migration: complete_service_request RPC
-- Allows an assigned provider to mark a job as completed

DROP FUNCTION IF EXISTS public.complete_service_request(UUID);

CREATE OR REPLACE FUNCTION public.complete_service_request(p_request_id UUID)
RETURNS SETOF service_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_request service_requests%ROWTYPE;
BEGIN
  SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role != 'provider' THEN
    RAISE EXCEPTION 'Only service providers can complete requests';
  END IF;

  SELECT * INTO v_request FROM service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service request not found: %', p_request_id;
  END IF;

  IF v_request.status NOT IN ('accepted', 'counter_approved') THEN
    RAISE EXCEPTION 'Can only complete accepted or counter-approved requests (current status: "%")', v_request.status;
  END IF;

  IF v_request.assigned_provider_id != v_caller_id THEN
    RAISE EXCEPTION 'Only the assigned provider can complete this request';
  END IF;

  UPDATE service_requests SET
    status = 'completed',
    completed_at = now(),
    last_updated_by = v_caller_id::text,
    updated_at = now()
  WHERE id = p_request_id;

  -- Notify the fleet user
  INSERT INTO service_request_notifications (
    request_id, recipient_id, actor_id, event_type, message
  ) VALUES (
    p_request_id,
    v_request.created_by_id,
    v_caller_id,
    'request_completed',
    format('Your %s request has been completed', v_request.service_type)
  );

  RETURN QUERY SELECT * FROM service_requests WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_service_request(UUID) TO authenticated;
