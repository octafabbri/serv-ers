-- Migration: Replace permissive RLS policies with role-based proposal workflow policies
-- Date: 2026-02-13
--
-- Prerequisites:
--   - users table with: id (UUID, matches auth.uid()), role ('fleet' | 'provider')
--   - service_requests table with: created_by_id, assigned_provider_id, status
--   - counter_proposals table with: provider_id, service_request_id
--
-- Rules enforced:
--   1. Providers can UPDATE requests only when status IN ('submitted', 'counter_proposed')
--      AND only if they are the assigned provider (or request is unassigned for initial accept)
--   2. Fleet users can UPDATE requests only when status = 'counter_proposed'
--      AND only for requests they created
--   3. Fleet users can INSERT new requests
--   4. Both roles can SELECT requests they are a party to

-- ============================================
-- Helper: get current user's role from users table
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- Drop existing permissive policies
-- ============================================

-- Service requests
DROP POLICY IF EXISTS "Anyone can read submitted requests" ON service_requests;
DROP POLICY IF EXISTS "Anyone can create requests" ON service_requests;
DROP POLICY IF EXISTS "Anyone can update requests" ON service_requests;

-- Counter proposals
DROP POLICY IF EXISTS "Anyone can read counter proposals" ON counter_proposals;
DROP POLICY IF EXISTS "Anyone can create counter proposals" ON counter_proposals;
DROP POLICY IF EXISTS "Anyone can update counter proposals" ON counter_proposals;

-- ============================================
-- SERVICE REQUESTS — SELECT
-- ============================================

-- Fleet users can see their own requests
CREATE POLICY "Fleet users can read own requests"
  ON service_requests FOR SELECT
  USING (
    created_by_id = auth.uid()
  );

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

-- ============================================
-- SERVICE REQUESTS — INSERT
-- ============================================

-- Only fleet users can create new requests, and created_by_id must match their auth id
CREATE POLICY "Fleet users can insert requests"
  ON service_requests FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'fleet'
    AND created_by_id = auth.uid()
  );

-- ============================================
-- SERVICE REQUESTS — UPDATE
-- ============================================

-- Providers can update requests to accept, reject, or counter-propose
-- Only when the request is in 'submitted' status (initial action)
-- or 'counter_proposed' status (after fleet counter-proposes back)
-- Provider must be the assigned provider, or request must be unassigned (first accept)
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
    -- After update, status must be a valid provider action
    status IN ('accepted', 'rejected', 'counter_proposed')
  );

-- Fleet users can update their own requests when a counter-proposal is pending
-- (to approve or reject the counter-proposal)
CREATE POLICY "Fleet users can respond to counter-proposals"
  ON service_requests FOR UPDATE
  USING (
    public.get_user_role() = 'fleet'
    AND created_by_id = auth.uid()
    AND status = 'counter_proposed'
  )
  WITH CHECK (
    -- After update, status must be a valid fleet response
    status IN ('counter_approved', 'submitted')
  );

-- Fleet users can cancel their own requests at any time
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
-- COUNTER PROPOSALS — SELECT
-- ============================================

-- Fleet users can read proposals on their requests
CREATE POLICY "Fleet users can read proposals on own requests"
  ON counter_proposals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = counter_proposals.service_request_id
      AND sr.created_by_id = auth.uid()
    )
  );

-- Providers can read their own proposals
CREATE POLICY "Providers can read own proposals"
  ON counter_proposals FOR SELECT
  USING (
    provider_id = auth.uid()
  );

-- ============================================
-- COUNTER PROPOSALS — INSERT
-- ============================================

-- Only providers can create counter-proposals, and provider_id must match auth id
CREATE POLICY "Providers can create counter proposals"
  ON counter_proposals FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'provider'
    AND provider_id = auth.uid()
  );

-- ============================================
-- COUNTER PROPOSALS — UPDATE
-- ============================================

-- Fleet users can update proposal status (approve/reject) on their own requests
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
-- USERS table — keep simple policies
-- ============================================
-- (not changing users policies — leave existing or add minimal ones)

-- Users can read all users (needed for provider name resolution)
CREATE POLICY IF NOT EXISTS "Users can read all users"
  ON users FOR SELECT
  USING (true);

-- Users can insert/update their own record
DROP POLICY IF EXISTS "Anyone can create users" ON users;
CREATE POLICY "Users can insert own record"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Anyone can update users" ON users;
CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  USING (id = auth.uid());
