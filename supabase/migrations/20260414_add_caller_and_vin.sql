-- Add caller identity fields and vehicle VIN to service_requests
-- caller_type: 'DRIVER' | 'FLEET_MANAGER' — who is making the call
-- caller_name/caller_phone: fleet manager contact (when caller_type = 'FLEET_MANAGER')
-- vin_number: vehicle VIN (required for external API dispatch)

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS caller_type TEXT,
  ADD COLUMN IF NOT EXISTS caller_name TEXT,
  ADD COLUMN IF NOT EXISTS caller_phone TEXT,
  ADD COLUMN IF NOT EXISTS vin_number TEXT;
