import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apiFetch } from './apiClient.js';

const server = new McpServer({
  name: 'fleet-cases',
  version: '1.0.0',
});

// ── fleet_get_cases ────────────────────────────────────────────────────────

server.tool(
  'fleet_get_cases',
  'List service cases for a fleet account within a date range.',
  {
    shipTo: z.string().describe('Fleet ship-to account ID (e.g. "FLEET001")'),
    startDate: z.string().describe('Start date in ISO format (e.g. "2026-01-01")'),
    endDate: z.string().describe('End date in ISO format (e.g. "2026-12-31")'),
    limit: z.number().optional().describe('Max results to return (default 50)'),
  },
  async ({ shipTo, startDate, endDate, limit }) => {
    const qs = new URLSearchParams({
      customerShipTo: shipTo,
      startDate,
      endDate,
      ...(limit !== undefined && { limit: String(limit) }),
    });

    const data = await apiFetch<{ cases: unknown[]; total: number }>(
      `/api/v3/cases?${qs}`
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── fleet_get_case ─────────────────────────────────────────────────────────

server.tool(
  'fleet_get_case',
  'Fetch full details of a single service case by ID.',
  {
    id: z.string().describe('Case UUID'),
  },
  async ({ id }) => {
    const data = await apiFetch<unknown>(`/api/v3/cases/${id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── fleet_submit_case ──────────────────────────────────────────────────────

server.tool(
  'fleet_submit_case',
  'Create a new TIRE ERS service case. Only TIRE product type is supported.',
  {
    callerName: z.string().describe('Name of the person calling (driver or fleet manager)'),
    callerPhone: z.string().describe('Phone number of the caller'),
    driverName: z.string().optional().describe('Driver name, if caller is a fleet manager'),
    driverPhone: z.string().optional().describe('Driver phone, if caller is a fleet manager'),
    fleetShipTo: z.string().describe('Fleet ship-to account ID'),
    vehicleType: z.enum(['TRACTOR', 'TRAILER', 'DOLLY']).describe('Type of vehicle'),
    unitNumber: z.string().describe('Fleet unit number of the vehicle'),
    vinNumber: z.string().describe('VIN of the vehicle'),
    tirePosition: z.string().optional().describe('Tire position (e.g. "LF", "RF", "LRO")'),
    tireCondition: z.string().optional().describe('Tire condition (e.g. "FLAT", "LOW_AIR")'),
    tireSize: z.string().optional().describe('Tire size (e.g. "295/75R22.5")'),
    tireBrand: z.string().optional().describe('Tire brand (e.g. "Michelin")'),
    tireAction: z.enum(['REPAIR_IF_POSSIBLE', 'REPLACE']).optional().describe('Requested tire service action'),
    locationComments: z.string().describe('Human-readable location description'),
    latitude: z.string().optional().describe('GPS latitude'),
    longitude: z.string().optional().describe('GPS longitude'),
    specialInstructions: z.string().optional().describe('Any special instructions for the technician'),
  },
  async (args) => {
    const isManager = !!(args.driverName || args.driverPhone);

    const payload = {
      caller: {
        name: args.callerName,
        phone: args.callerPhone,
      },
      ...(isManager && {
        driver: {
          name: args.driverName ?? '',
          phone: args.driverPhone ?? '',
        },
      }),
      fleet: { shipTo: args.fleetShipTo },
      assets: [
        {
          vinNumber: args.vinNumber,
          unitNumber: args.unitNumber,
          unitPrimary: true,
          type: args.vehicleType,
          droppedUnit: false,
        },
      ],
      products: [
        {
          type: 'TIRE' as const,
          unitNumber: args.unitNumber,
          tire: {
            action: args.tireAction ?? 'REPAIR_IF_POSSIBLE',
            position: args.tirePosition ?? '',
            condition: args.tireCondition ?? '',
            size: args.tireSize ?? '',
            brand: args.tireBrand ?? '',
          },
        },
      ],
      location: {
        latitude: args.latitude ?? '0',
        longitude: args.longitude ?? '0',
        country: 'US',
        comments: args.locationComments,
        locationValidated: false,
      },
      locationValidated: false,
      ...(args.specialInstructions && { specialInstructions: args.specialInstructions }),
    };

    const data = await apiFetch<unknown>('/api/v3/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── fleet_update_case ──────────────────────────────────────────────────────

server.tool(
  'fleet_update_case',
  'Update billing information on an existing service case.',
  {
    id: z.string().describe('Case UUID to update'),
    poNumber: z.string().optional().describe('Purchase order number'),
    comment: z.string().optional().describe('Billing comment or note'),
  },
  async ({ id, poNumber, comment }) => {
    const data = await apiFetch<unknown>(`/api/v3/cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ billingInfo: { poNumber, comment } }),
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Start ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
