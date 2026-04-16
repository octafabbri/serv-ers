/**
 * Maps POST /api/v3/cases request payload → service_requests DB row fields
 */
import { mapTirePosition, mapTireCondition, deriveAxle, parseTireSize, parseTireBrand } from './tireMapper';

export interface CreateCasePayload {
  caller: { name: string; phone: string; smsNotification?: boolean | null };
  driver?: { name?: string; phone?: string; smsNotification?: boolean | null };
  fleet: { shipTo: string; billTo?: string };
  assets: Array<{
    vinNumber: string;
    unitNumber: string;
    unitPrimary: boolean;
    type: 'TRACTOR' | 'DOLLY' | 'TRAILER';
    droppedUnit: boolean;
  }>;
  products: Array<{
    type: 'TIRE' | 'WHEEL' | 'MECHANICAL';
    unitNumber: string;
    tire?: {
      action?: string;
      position?: string;
      condition?: string;
      axle?: string;
      brand?: string;
      size?: string;
    };
  }>;
  location: {
    latitude: string;
    longitude: string;
    country: string;
    comments: string;
    locationValidated: boolean;
    highway?: string | null;
    mileMarker?: string | null;
    timezone?: string | null;
  };
  locationValidated: boolean;
  specialInstructions?: string;
  billingInfo?: Record<string, string>;
}

export function apiPayloadToDbRow(payload: CreateCasePayload) {
  const asset = payload.assets[0];
  const product = payload.products[0];
  const callerIsMgr = !!payload.driver;

  const tireInfo = product?.type === 'TIRE' && product.tire
    ? {
        requested_service: product.tire.action === 'REPAIR_IF_POSSIBLE' ? 'REPAIR' : 'REPLACE',
        tire_condition: mapTireCondition(product.tire.condition),
        requested_tire: [product.tire.size, product.tire.brand].filter(Boolean).join(' ').trim(),
        number_of_tires: 1,
        tire_position: product.tire.position ?? '',
        axle: deriveAxle(product.tire.position ?? ''),
      }
    : null;

  return {
    // Caller identity
    caller_type: callerIsMgr ? 'FLEET_MANAGER' : 'DRIVER',
    caller_name: callerIsMgr ? payload.caller.name : null,
    caller_phone: callerIsMgr ? payload.caller.phone : null,

    // Driver contact (always the truck driver)
    driver_name: callerIsMgr ? (payload.driver?.name ?? '') : payload.caller.name,
    contact_phone: callerIsMgr ? (payload.driver?.phone ?? '') : payload.caller.phone,

    // Fleet
    fleet_name: payload.fleet.shipTo,
    ship_to: payload.fleet.shipTo,

    // Vehicle
    vehicle_type: asset.type === 'TRACTOR' ? 'TRUCK' : 'TRAILER',
    unit_number: asset.unitNumber,
    vin_number: asset.vinNumber,

    // Location (stored as JSONB)
    location: {
      current_location: payload.location.comments,
      highway_or_road: payload.location.highway ?? undefined,
      nearest_mile_marker: payload.location.mileMarker ?? undefined,
      is_safe_location: false,
      latitude: payload.location.latitude,
      longitude: payload.location.longitude,
    },

    // Service
    service_type: product?.type ?? 'TIRE',
    urgency: 'ERS',
    tire_info: tireInfo,
    mechanical_info: null,

    // Status
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  };
}
