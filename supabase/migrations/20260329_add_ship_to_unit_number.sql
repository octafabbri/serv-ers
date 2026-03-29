-- Add ship_to and unit_number columns to service_requests
-- ship_to: fleet's billing/ship-to account or location name
-- unit_number: truck or trailer unit number

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS ship_to TEXT,
  ADD COLUMN IF NOT EXISTS unit_number TEXT;
