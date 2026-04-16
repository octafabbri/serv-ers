// Tire position free-text → API enum
export type TirePosition =
  | 'RFI' | 'RFO' | 'RF'
  | 'RRI' | 'RRO' | 'RR'
  | 'LFI' | 'LFO' | 'LF'
  | 'LRI' | 'LRO' | 'LR';

export type TireAxle = 'STEER' | 'DRIVE' | 'TRAILER' | 'OTHER';

export type TireAction = 'REPLACE' | 'REPAIR_IF_POSSIBLE' | 'REPLACE_WITH_SPARE' | 'SPECIAL_INSTRUCTIONS';

export type TireCondition =
  | 'FLAT_TIRE' | 'BLOWN_TIRE' | 'LEAKING_AIR' | 'OBJECT_IN_TIRE'
  | 'SIDEWALL_CUT' | 'SHREDDED' | 'CORDS_SHOWING' | 'OFF_THE_RIM'
  | 'RIM_DAMAGED' | 'TREAD_SEPARATION' | 'PEELED_CAP' | 'WORN_OUT'
  | 'BLANK_CASE' | 'MECHANICAL_SERVICE';

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

export function deriveAxle(tirePosition: string): TireAxle {
  const t = tirePosition.toLowerCase();
  if (t.includes('steer') || t.includes('front')) return 'STEER';
  if (t.includes('trailer')) return 'TRAILER';
  if (t.includes('drive') || t.includes('rear')) return 'DRIVE';
  return 'OTHER';
}

export function mapTireAction(action: string): TireAction {
  if (action === 'REPAIR') return 'REPAIR_IF_POSSIBLE';
  return 'REPLACE';
}

export function mapTireCondition(condition?: string): TireCondition {
  if (!condition) return 'FLAT_TIRE';
  const c = condition.toUpperCase() as TireCondition;
  const valid: TireCondition[] = [
    'FLAT_TIRE', 'BLOWN_TIRE', 'LEAKING_AIR', 'OBJECT_IN_TIRE',
    'SIDEWALL_CUT', 'SHREDDED', 'CORDS_SHOWING', 'OFF_THE_RIM',
    'RIM_DAMAGED', 'TREAD_SEPARATION', 'PEELED_CAP', 'WORN_OUT',
    'BLANK_CASE', 'MECHANICAL_SERVICE',
  ];
  return valid.includes(c) ? c : 'FLAT_TIRE';
}

// Parse size and brand from a combined "requested_tire" string
// e.g. "295/75R22.5 Michelin XDA" → { size: "295/75R22.5", brand: "Michelin" }
const KNOWN_BRANDS = [
  'michelin', 'bridgestone', 'goodyear', 'continental', 'firestone',
  'dunlop', 'yokohama', 'hankook', 'toyo', 'nexen', 'pirelli',
  'cooper', 'bf goodrich', 'bfgoodrich', 'general', 'sumitomo',
];

export function parseTireSize(requested_tire: string): string {
  for (const brand of KNOWN_BRANDS) {
    const idx = requested_tire.toLowerCase().indexOf(brand);
    if (idx !== -1) {
      return requested_tire.substring(0, idx).trim();
    }
  }
  return requested_tire.trim();
}

export function parseTireBrand(requested_tire: string): string | undefined {
  for (const brand of KNOWN_BRANDS) {
    if (requested_tire.toLowerCase().includes(brand)) {
      // Return properly capitalised brand name
      const idx = requested_tire.toLowerCase().indexOf(brand);
      return requested_tire.substring(idx, idx + brand.length);
    }
  }
  return undefined;
}
