/**
 * Maps service_requests DB row → API response shape (mirrors OpenAPI spec)
 */
import { mapTirePosition, mapTireCondition, deriveAxle } from './tireMapper';

function mapStatus(dbStatus: string): string {
  switch (dbStatus) {
    case 'submitted': return 'NEW';
    case 'accepted': return 'DISPATCHED';
    case 'completed': return 'COMPLETED';
    default: return 'NEW';
  }
}

function mapVehicleType(dbType: string): 'TRACTOR' | 'TRAILER' {
  return dbType === 'TRUCK' ? 'TRACTOR' : 'TRAILER';
}

export function dbRowToApiResponse(row: Record<string, unknown>) {
  const location = (row.location as Record<string, unknown>) ?? {};
  const tireInfo = (row.tire_info as Record<string, unknown> | null);

  const requestedService = tireInfo
    ? [{
        type: 'TIRE',
        unitNumber: row.unit_number as string,
        action: tireInfo.requested_service === 'REPAIR' ? 'REPAIR_IF_POSSIBLE' : 'REPLACE',
        condition: mapTireCondition(tireInfo.tire_condition as string | undefined),
        position: mapTirePosition((tireInfo.tire_position as string) ?? ''),
        axle: deriveAxle((tireInfo.tire_position as string) ?? ''),
        tireSize: tireInfo.requested_tire as string,
        tireBrand: undefined,
        loadRange: undefined,
      }]
    : [];

  return {
    id: row.id as string,
    customerST: row.ship_to as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at ?? row.created_at,
    ersResponse: {
      codeResponse: 200,
      data: {
        caseNumber: row.id as string,
        caseStatus: mapStatus(row.status as string),
        statusTimeStamp: row.submitted_at ?? row.created_at,
        userName: row.driver_name as string,
        specialInstructions: '',
        delayedService: false,
        customer: {
          shipTo: row.ship_to as string,
          billTo: null,
          name: row.fleet_name as string,
        },
        contacts: [
          {
            contactName: row.driver_name as string,
            contactPhone: row.contact_phone as string,
            contactType: 'driver_cell',
            contactEmail: null,
            callbackEta: false,
            callbackRolltime: false,
          },
          ...(row.caller_type === 'FLEET_MANAGER' ? [{
            contactName: row.caller_name as string,
            contactPhone: row.caller_phone as string,
            contactType: 'dispatch',
            contactEmail: null,
            callbackEta: false,
            callbackRolltime: false,
          }] : []),
        ],
        assets: [{
          identifier: row.id as string,
          unitNumber: row.unit_number as string,
          unitType: mapVehicleType(row.vehicle_type as string).toLowerCase(),
          vin: row.vin_number as string || null,
        }],
        assetLocation: {
          note: location.current_location as string ?? '',
          highway: location.highway_or_road as string ?? null,
          milemarker: location.nearest_mile_marker as string ?? null,
          latitude: location.latitude as number ?? null,
          longitude: location.longitude as number ?? null,
          country: 'USA',
        },
        requestedService,
        agreedService: [],
        suppliedService: [],
        caseNotes: [],
      },
    },
    mechanicalResponse: {
      codeResponse: 204,
      data: null,
    },
  };
}

export function dbRowToListItem(row: Record<string, unknown>) {
  const location = (row.location as Record<string, unknown>) ?? {};
  return {
    id: row.id as string,
    caseId: row.id as string,
    ipn: null,
    customerShipTo: row.ship_to as string,
    customerBillTo: null,
    ocxId: row.id as string,
    fntId: null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at ?? row.created_at,
    ocxCase: {
      data: {
        type: 'ers-cases',
        attributes: {
          caseStatus: mapStatus(row.status as string),
          primaryAsset: {
            unitNumber: row.unit_number as string,
            unitType: mapVehicleType(row.vehicle_type as string).toLowerCase(),
          },
          location: {
            comments: location.current_location as string ?? '',
          },
        },
      },
    },
  };
}
