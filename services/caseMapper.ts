/**
 * Maps the frontend ServiceRequest + geolocation → the CreateCasePayload
 * shape expected by POST /api/v3/cases.
 */
import { ServiceRequest } from '../types';

// ── Tire position ──────────────────────────────────────────────────────────

export type TirePosition =
  | 'RFI' | 'RFO' | 'RF'
  | 'RRI' | 'RRO' | 'RR'
  | 'LFI' | 'LFO' | 'LF'
  | 'LRI' | 'LRO' | 'LR';

export function mapTirePosition(freeText: string): TirePosition {
  const t = freeText.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');

  if (t.includes('left front inner') || t.includes('lfi')) return 'LFI';
  if (t.includes('left front outer') || t.includes('lfo')) return 'LFO';
  if (t.includes('right front inner') || t.includes('rfi')) return 'RFI';
  if (t.includes('right front outer') || t.includes('rfo')) return 'RFO';
  if (t.includes('left rear inner') || t.includes('lri')) return 'LRI';
  if (t.includes('left rear outer') || t.includes('lro')) return 'LRO';
  if (t.includes('right rear inner') || t.includes('rri')) return 'RRI';
  if (t.includes('right rear outer') || t.includes('rro')) return 'RRO';
  if (t.includes('left front') || t === 'lf') return 'LF';
  if (t.includes('right front') || t === 'rf') return 'RF';
  if (t.includes('left rear') || t === 'lr') return 'LR';
  if (t.includes('right rear') || t === 'rr') return 'RR';

  return 'RF'; // fallback
}

// ── Axle derivation ────────────────────────────────────────────────────────

export type TireAxle = 'STEER' | 'DRIVE' | 'TRAILER' | 'OTHER';

export function deriveAxle(tirePosition: string): TireAxle {
  const t = tirePosition.toLowerCase();
  if (t.includes('steer') || t.includes('front')) return 'STEER';
  if (t.includes('trailer')) return 'TRAILER';
  if (t.includes('drive') || t.includes('rear')) return 'DRIVE';
  return 'OTHER';
}

// ── Tire action ────────────────────────────────────────────────────────────

export function mapTireAction(action: 'REPLACE' | 'REPAIR'): string {
  return action === 'REPAIR' ? 'REPAIR_IF_POSSIBLE' : 'REPLACE';
}

// ── Tire size / brand parsing ──────────────────────────────────────────────

const KNOWN_BRANDS = [
  'michelin', 'bridgestone', 'goodyear', 'continental', 'firestone',
  'dunlop', 'yokohama', 'hankook', 'toyo', 'nexen', 'pirelli',
  'cooper', 'bf goodrich', 'bfgoodrich', 'general', 'sumitomo',
];

export function parseTireSize(requested_tire: string): string {
  for (const brand of KNOWN_BRANDS) {
    const idx = requested_tire.toLowerCase().indexOf(brand);
    if (idx !== -1) return requested_tire.substring(0, idx).trim();
  }
  return requested_tire.trim();
}

export function parseTireBrand(requested_tire: string): string | undefined {
  for (const brand of KNOWN_BRANDS) {
    if (requested_tire.toLowerCase().includes(brand)) {
      const idx = requested_tire.toLowerCase().indexOf(brand);
      return requested_tire.substring(idx, idx + brand.length);
    }
  }
  return undefined;
}

// ── Main mapper ────────────────────────────────────────────────────────────

export interface GeoCoords {
  latitude: string;
  longitude: string;
}

export function mapServiceRequestToApiPayload(
  request: ServiceRequest,
  geo: GeoCoords
) {
  const isFleetManager = request.caller_type === 'FLEET_MANAGER';

  const caller = isFleetManager
    ? { name: request.caller_name ?? '', phone: request.caller_phone ?? '' }
    : { name: request.driver_name, phone: request.contact_phone };

  const driver = isFleetManager
    ? { name: request.driver_name, phone: request.contact_phone }
    : undefined;

  const tireInfo = request.tire_info;
  const tirePosition = tireInfo ? mapTirePosition(tireInfo.tire_position) : 'RF';
  const axle = tireInfo ? deriveAxle(tireInfo.tire_position) : 'OTHER';

  const vehicleType =
    request.vehicle?.vehicle_type === 'TRAILER' ? 'TRAILER' : 'TRACTOR';

  return {
    caller,
    ...(driver && { driver }),
    fleet: { shipTo: request.ship_to },
    assets: [
      {
        vinNumber: request.vin_number ?? '',
        unitNumber: request.unit_number,
        unitPrimary: true,
        type: vehicleType as 'TRACTOR' | 'TRAILER',
        droppedUnit: false,
      },
    ],
    products: [
      {
        type: 'TIRE' as const,
        unitNumber: request.unit_number,
        tire: tireInfo
          ? {
              action: mapTireAction(tireInfo.requested_service),
              position: tirePosition,
              condition: tireInfo.tire_condition ?? 'FLAT_TIRE',
              axle,
              size: parseTireSize(tireInfo.requested_tire),
              brand: parseTireBrand(tireInfo.requested_tire),
            }
          : undefined,
      },
    ],
    location: {
      latitude: geo.latitude,
      longitude: geo.longitude,
      country: 'USA',
      comments: request.location?.current_location ?? '',
      locationValidated: false,
      highway: request.location?.highway_or_road ?? null,
      mileMarker: request.location?.nearest_mile_marker ?? null,
    },
    locationValidated: false,
  };
}
