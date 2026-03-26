-- Hey App: Supabase Schema (complete — includes all migrations)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================
-- Clean up any previous partial runs
-- ============================================
DROP TABLE IF EXISTS service_request_notifications CASCADE;
DROP TABLE IF EXISTS counter_proposals CASCADE;
DROP TABLE IF EXISTS service_requests CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS update_updated_at();
DROP FUNCTION IF EXISTS public.get_user_role();
DROP FUNCTION IF EXISTS public.accept_service_request(UUID);
DROP FUNCTION IF EXISTS public.decline_service_request(UUID, TEXT);
DROP FUNCTION IF EXISTS public.propose_new_time(UUID, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.approve_proposed_time(UUID);
DROP FUNCTION IF EXISTS public.reject_proposed_time(UUID, TEXT);
DROP FUNCTION IF EXISTS public.complete_service_request(UUID);
DROP TYPE IF EXISTS service_request_status;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Enum type for service request status
-- ============================================
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

-- ============================================
-- Users table (device-based identity for MVP)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('fleet', 'provider')),
  name TEXT NOT NULL DEFAULT '',
  company_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_device ON users(device_id);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- Service Requests table
-- ============================================
CREATE TABLE service_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Contact
  driver_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  fleet_name TEXT NOT NULL,

  -- Service
  service_type TEXT NOT NULL CHECK (service_type IN ('TIRE', 'MECHANICAL')),
  urgency TEXT NOT NULL CHECK (urgency IN ('ERS', 'DELAYED', 'SCHEDULED')),

  -- Location & Vehicle (stored as JSONB for flexibility)
  location JSONB NOT NULL DEFAULT '{}',
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('TRUCK', 'TRAILER')),

  -- Service-specific info (JSONB, nullable)
  tire_info JSONB,
  mechanical_info JSONB,

  -- Scheduling (original fields)
  scheduled_date TEXT,
  scheduled_time TEXT,

  -- Status & workflow (uses enum type)
  status service_request_status NOT NULL DEFAULT 'draft',

  -- Provider assignment
  assigned_provider_id UUID REFERENCES users(id),
  assigned_provider_name TEXT,

  -- Tracking
  created_by_id UUID NOT NULL,
  submitted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Transcript
  conversation_transcript TEXT,

  -- Scheduling workflow (proposal negotiation)
  proposed_date TIMESTAMPTZ,
  proposal_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_updated_by TEXT,
  decline_reason TEXT
);

CREATE INDEX idx_sr_status ON service_requests(status);
CREATE INDEX idx_sr_urgency ON service_requests(urgency);
CREATE INDEX idx_sr_created_by ON service_requests(created_by_id);
CREATE INDEX idx_sr_provider ON service_requests(assigned_provider_id);
CREATE INDEX idx_service_requests_last_updated_by ON service_requests(last_updated_by);

-- ============================================
-- Counter Proposals table
-- ============================================
CREATE TABLE counter_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL,
  provider_name TEXT NOT NULL,
  proposed_date TEXT NOT NULL,
  proposed_time TEXT NOT NULL,
  message TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX idx_cp_request ON counter_proposals(service_request_id);
CREATE INDEX idx_cp_status ON counter_proposals(status);

-- ============================================
-- Service Request Notifications table
-- ============================================
CREATE TABLE service_request_notifications (
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

CREATE INDEX idx_srn_recipient ON service_request_notifications(recipient_id);
CREATE INDEX idx_srn_request ON service_request_notifications(request_id);
CREATE INDEX idx_srn_unread ON service_request_notifications(recipient_id, read_at)
  WHERE read_at IS NULL;

-- ============================================
-- Auto-update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_requests_updated_at
  BEFORE UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Helper: get current user's role
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- Enable Row Level Security
-- ============================================
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies — Service Requests
-- ============================================

-- Fleet users can see their own requests
CREATE POLICY "Fleet users can read own requests"
  ON service_requests FOR SELECT
  USING (created_by_id = auth.uid());

-- Providers can see submitted requests (available pool) and requests assigned to them
CREATE POLICY "Providers can read available and assigned requests"
  ON service_requests FOR SELECT
  USING (
    public.get_user_role() = 'provider'
    AND (
      status IN ('submitted')
      OR assigned_provider_id = auth.uid()
    )
  );

-- Only fleet users can create new requests
CREATE POLICY "Fleet users can insert requests"
  ON service_requests FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'fleet'
    AND created_by_id = auth.uid()
  );

-- Providers can update requests to accept, reject, or counter-propose
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

-- Fleet users can respond to counter-proposals
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

-- Fleet users can cancel their own requests
CREATE POLICY "Fleet users can cancel own requests"
  ON service_requests FOR UPDATE
  USING (
    public.get_user_role() = 'fleet'
    AND created_by_id = auth.uid()
  )
  WITH CHECK (
    status = 'cancelled'
  );

-- ============================================
-- RLS Policies — Counter Proposals
-- ============================================

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

CREATE POLICY "Providers can create counter proposals"
  ON counter_proposals FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'provider'
    AND provider_id = auth.uid()
  );

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

-- ============================================
-- RLS Policies — Users
-- ============================================

CREATE POLICY "Users can read all users"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own record"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  USING (id = auth.uid());

-- ============================================
-- RLS Policies — Notifications
-- ============================================

CREATE POLICY "Users can read own notifications"
  ON service_request_notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON service_request_notifications FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ============================================
-- Accept Service Request RPC
-- ============================================
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
-- Decline Service Request RPC
-- ============================================
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
-- Grant execute to authenticated users
-- ============================================
GRANT EXECUTE ON FUNCTION public.accept_service_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_service_request(UUID, TEXT) TO authenticated;

-- ============================================
-- Propose New Time RPC
-- ============================================
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

GRANT EXECUTE ON FUNCTION public.propose_new_time(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- ============================================
-- Approve Proposed Time RPC (fleet accepts provider's counter-proposal)
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
-- Reject Proposed Time RPC (fleet rejects provider's counter-proposal)
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

  UPDATE service_requests SET
    status = 'submitted',
    assigned_provider_id = NULL,
    assigned_provider_name = NULL,
    proposed_date = NULL,
    last_updated_by = v_caller_id::text
  WHERE id = p_request_id;

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
-- Enable Realtime
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE service_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE counter_proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE service_request_notifications;
