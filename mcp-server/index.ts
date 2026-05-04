import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apiFetch } from './apiClient.js';
import { callLLM, NodeChatSession } from './llmClient.js';
import { SYSTEM_INSTRUCTIONS, FEATURE_FLAGS } from '../constants.js';
import { AssistantTask } from '../types.js';
import type { ServiceRequest, ProposalEntry } from '../types.js';

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

// ── fleet_chat ─────────────────────────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  'en-US': 'English', 'en-GB': 'English',
  'es-ES': 'Spanish', 'es-MX': 'Spanish',
  'fr-FR': 'French',  'de-DE': 'German',
};

server.tool(
  'fleet_chat',
  'Chat with the fleet AI assistant using a task-aware system prompt. Stateless — pass full history on each call.',
  {
    task: z
      .enum(['GENERAL_ASSISTANCE', 'SERVICE_REQUEST', 'VEHICLE_INSPECTION', 'WEATHER', 'TRAFFIC'])
      .describe('Conversation task type'),
    message: z.string().describe('The user message to send'),
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
      .optional()
      .describe('Prior turns — caller maintains state across calls'),
    languageCode: z.string().optional().describe('BCP-47 locale, e.g. "en-US" (default)'),
    userName: z.string().optional().describe('Driver or user name for {{USERNAME}} substitution'),
  },
  async ({ task, message, history, languageCode, userName }) => {
    const name = userName ?? 'Driver';
    const lang = languageCode ?? 'en-US';
    const langName = LANGUAGE_NAMES[lang] ?? "the user's language";

    const taskKey = task as AssistantTask;
    let systemPrompt = (SYSTEM_INSTRUCTIONS[taskKey] ?? SYSTEM_INSTRUCTIONS[AssistantTask.GENERAL_ASSISTANCE])
      .replaceAll('{{USERNAME}}', name);

    systemPrompt +=
      `\n\nImportant: Respond in ${langName}. Do not switch languages.` +
      `\n\nConstraint: You are talking to ${name}. Do NOT start every response with their name.`;

    const messages = [...(history ?? []), { role: 'user' as const, content: message }];
    const text = await callLLM(systemPrompt, messages, 0.7);

    return {
      content: [{ type: 'text', text: JSON.stringify({ text, task }) }],
    };
  }
);

// ── fleet_extract_service_data ─────────────────────────────────────────────

const parseJsonFromString = <T,>(jsonString: string): T | null => {
  let s = jsonString.trim();
  const match = s.match(/^```(\w*)?\s*\n?(.*?)\n?\s*```$/s);
  if (match?.[2]) s = match[2].trim();
  try { return JSON.parse(s) as T; } catch { return null; }
};

const formatYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const resolveScheduledDate = (dateStr: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const today = new Date();
  const lower = dateStr.toLowerCase().trim();
  if (lower === 'today') return formatYMD(today);
  if (lower === 'tomorrow') { const d = new Date(today); d.setDate(d.getDate() + 1); return formatYMD(d); }
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const cleaned = lower.replace(/^next\s+/, '');
  const target = days.indexOf(cleaned);
  if (target !== -1) {
    let ahead = target - today.getDay();
    if (ahead <= 0) ahead += 7;
    const d = new Date(today); d.setDate(d.getDate() + ahead); return formatYMD(d);
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= today.getFullYear()) return formatYMD(parsed);
  return dateStr;
};

server.tool(
  'fleet_extract_service_data',
  'Extract structured ServiceRequest fields from a raw conversation transcript.',
  {
    conversationHistory: z.string().describe('Raw conversation transcript'),
    existingFields: z.record(z.unknown()).optional().describe('Already-known fields from a prior extraction'),
  },
  async ({ conversationHistory, existingFields }) => {
    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const isErsOnly = !FEATURE_FLAGS.MECHANICAL_SERVICE_ENABLED;
    const ersNote = isErsOnly
      ? '\nFLOW CONTEXT: This conversation is from an ERS-only tire dispatch flow. urgency is ALWAYS "ERS" — never leave it empty. service_type is ALWAYS "TIRE".'
      : '';

    const prompt = `You are extracting data from a roadside assistance conversation. Extract ALL information mentioned, even if implicit.${ersNote}

TODAY'S DATE: ${todayStr}

CONVERSATION:
${conversationHistory}

CURRENT DATA (may have empty fields):
${JSON.stringify(existingFields ?? {}, null, 2)}

EXTRACTION RULES:
1. Extract ANY information mentioned - be thorough as these fields are required for dispatch
2. Infer service_type from problem descriptions:
   - "flat tire", "tire blow", "tire change", "blowout", "tire repair", "tire replace" → TIRE
   - "engine", "transmission", "overheating", "coolant", "oil leak", "brakes", "towing", "jump start", "battery", "fuel", "lockout", "won't start" → MECHANICAL
   - DO NOT infer service_type from vague terms like "broke down" alone - wait for specific details
3. Infer urgency CAREFULLY:
   - ERS: Unsafe location (highway shoulder, blocking lane) OR user says "emergency", "urgent", "ASAP", "right now"
   - DELAYED: User says "tomorrow", "tomorrow morning", "next day"
   - SCHEDULED: User mentions scheduling, future dates, appointments, or any specific day of the week (e.g., "Wednesday", "next Monday")
   - DEFAULT: If unclear, leave as empty string
4. Extract driver_name from any mention of the driver's name
5. Extract location from highway numbers, mile markers, city names, streets, rest stops, exits
6. Extract phone from ANY mention of phone/contact number — if two numbers are given (manager + driver), put the driver's number in contact_phone and manager's number in caller_phone
7. Extract fleet_name from company name, fleet name, or trucking company mentions
8. Extract ship_to from any mention of a billing name, ship-to account, or ship-to location for the fleet
9. Extract unit_number from any mention of a unit number, truck number, or trailer number
10. Extract vin_number from any mention of VIN, Vehicle Identification Number, or "VIN is..."
11. Infer vehicle_type: "truck" or "semi" → TRUCK, "trailer" → TRAILER
12. Extract caller_type: "DRIVER" if the caller is the truck driver, "FLEET_MANAGER" if they are calling on behalf of a driver
13. If caller_type is FLEET_MANAGER: extract caller_name (manager's name) and caller_phone (manager's phone number)

FOR TIRE REQUESTS - extract tire_info:
   - requested_service: "REPLACE" or "REPAIR" (from "replace", "new tire" → REPLACE; "repair", "patch", "plug" → REPAIR)
   - tire_condition: one of FLAT_TIRE, BLOWN_TIRE, LEAKING_AIR, OBJECT_IN_TIRE, SIDEWALL_CUT, SHREDDED, CORDS_SHOWING, OFF_THE_RIM, RIM_DAMAGED — infer from description ("flat" → FLAT_TIRE, "blowout"/"blown" → BLOWN_TIRE, "leaking"/"slow leak" → LEAKING_AIR, "sidewall cut" → SIDEWALL_CUT, "shredded" → SHREDDED)
   - requested_tire: tire size/brand (e.g., "295/75R22.5", "11R22.5")
   - number_of_tires: how many tires needed (integer)
   - tire_position: which position (e.g., "left front steer", "right rear drive", "trailer axle 2 outside")

FOR MECHANICAL REQUESTS - extract mechanical_info:
   - requested_service: type of service (e.g., "engine repair", "brake service", "towing", "jump start", "fuel delivery")
   - description: detailed problem description from everything user said

Return JSON with ALL extracted fields. Include fields even if partially complete:
{
  "caller_type": "DRIVER" | "FLEET_MANAGER",
  "caller_name": "string (fleet manager name, if caller_type is FLEET_MANAGER)",
  "caller_phone": "string (fleet manager phone, if caller_type is FLEET_MANAGER)",
  "driver_name": "string",
  "contact_phone": "string",
  "fleet_name": "string",
  "ship_to": "string",
  "unit_number": "string",
  "vin_number": "string",
  "service_type": "TIRE" | "MECHANICAL",
  "urgency": "ERS" | "DELAYED" | "SCHEDULED",
  "location": {
    "current_location": "string",
    "highway_or_road": "string",
    "nearest_mile_marker": "string",
    "is_safe_location": boolean
  },
  "vehicle": {
    "vehicle_type": "TRUCK" | "TRAILER"
  },
  "tire_info": {
    "requested_service": "REPLACE" | "REPAIR",
    "tire_condition": "FLAT_TIRE" | "BLOWN_TIRE" | "LEAKING_AIR" | "OBJECT_IN_TIRE" | "SIDEWALL_CUT" | "SHREDDED" | "CORDS_SHOWING" | "OFF_THE_RIM" | "RIM_DAMAGED",
    "requested_tire": "string",
    "number_of_tires": number,
    "tire_position": "string"
  },
  "mechanical_info": {
    "requested_service": "string",
    "description": "string"
  },
  "scheduled_appointment": {
    "scheduled_date": "YYYY-MM-DD format (e.g. 2026-02-18)",
    "scheduled_time": "HH:MM AM/PM format (e.g. 10:00 AM)"
  }
}

IMPORTANT:
- Only include "tire_info" if service_type is "TIRE". Otherwise omit it.
- Only include "mechanical_info" if service_type is "MECHANICAL". Otherwise omit it.
- Only include "scheduled_appointment" if urgency is "SCHEDULED". Otherwise omit it.
- ALWAYS resolve relative dates to actual calendar dates using today's date. For example: "Wednesday" → the next upcoming Wednesday, "tomorrow" → tomorrow's date, "next Monday" → the next Monday. Use YYYY-MM-DD format for scheduled_date.
- Omit any field where the value is unknown or not mentioned.

Return ONLY the JSON object, no other text.`;

    const raw = await callLLM('You are a data extraction assistant.', [{ role: 'user', content: prompt }], 0.3, true);
    const extracted = parseJsonFromString<Record<string, unknown>>(raw) ?? JSON.parse(raw || '{}');

    // Resolve any relative scheduled_date
    const appt = extracted.scheduled_appointment as Record<string, string> | undefined;
    if (appt?.scheduled_date) {
      appt.scheduled_date = resolveScheduledDate(appt.scheduled_date);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(extracted, null, 2) }],
    };
  }
);

// ── fleet_coordinate_work_order ────────────────────────────────────────────

function formatDateDisplay(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return isoString; }
}

function formatProposalHistory(history: ProposalEntry[] | undefined): string {
  if (!history || history.length === 0) return 'No negotiation history yet.';
  return history.map((e, i) => {
    const who = e.proposed_by === 'fleet_user' ? 'Fleet' : 'Provider';
    const notes = e.notes ? ` — "${e.notes}"` : '';
    return `Round ${i + 1} (${who}): Proposed ${formatDateDisplay(e.proposed_date)}${notes}`;
  }).join('\n');
}

function buildCoordinationSystemPrompt(
  request: ServiceRequest,
  role: 'fleet_user' | 'service_provider',
  callerName: string,
  allRequests?: ServiceRequest[]
): string {
  const urgencyLabels: Record<string, string> = {
    ERS: 'Emergency Roadside Service', DELAYED: 'Delayed', SCHEDULED: 'Scheduled',
  };
  const serviceLabel = request.service_type === 'TIRE' ? 'Tire Service' : 'Mechanical Service';
  const urgencyLabel = urgencyLabels[request.urgency] || request.urgency;

  let workOrder = `\n\n## Current Work Order\nService: ${serviceLabel}\nUrgency: ${urgencyLabel}\nFleet: ${request.fleet_name}\nDriver: ${request.driver_name}\nPhone: ${request.contact_phone}\nLocation: ${request.location?.current_location || 'Not provided'}\nVehicle: ${request.vehicle?.vehicle_type || 'Not specified'}\nStatus: ${request.status}`;

  if (request.service_type === 'TIRE' && request.tire_info) {
    workOrder += `\nTire Service: ${request.tire_info.requested_service}\nTire: ${request.tire_info.requested_tire}\nQuantity: ${request.tire_info.number_of_tires}\nPosition: ${request.tire_info.tire_position}`;
  }
  if (request.service_type === 'MECHANICAL' && request.mechanical_info) {
    workOrder += `\nMechanical: ${request.mechanical_info.requested_service}\nDescription: ${request.mechanical_info.description}`;
  }
  if (request.urgency === 'SCHEDULED' && request.scheduled_appointment) {
    workOrder += `\nScheduled Date: ${request.scheduled_appointment.scheduled_date}\nScheduled Time: ${request.scheduled_appointment.scheduled_time}`;
  }
  if (request.proposed_date) {
    const lastEntry = request.proposal_history?.slice(-1)[0];
    const proposedBy = lastEntry
      ? lastEntry.proposed_by === 'fleet_user' ? 'Fleet' : 'Provider'
      : request.last_updated_by_name || 'Unknown';
    workOrder += `\nProposed Time: ${formatDateDisplay(request.proposed_date)} (proposed by ${proposedBy})`;
  }

  const historySection = `\n\n## Negotiation History\n${formatProposalHistory(request.proposal_history)}`;

  let allRequestsSection = '';
  if (allRequests && allRequests.length > 0) {
    allRequestsSection = '\n\n## All Pending Work Orders\n' + allRequests.map((r, i) => {
      const svc = r.service_type === 'TIRE' ? 'Tire' : 'Mechanical';
      const urg = urgencyLabels[r.urgency] || r.urgency;
      const sched = r.urgency === 'SCHEDULED' && r.scheduled_appointment?.scheduled_date
        ? ` — Scheduled: ${r.scheduled_appointment.scheduled_date}` : '';
      const lastBy = r.proposal_history?.slice(-1)[0]?.proposed_by;
      const action = r.status === 'counter_proposed' && lastBy === 'fleet_user' ? ' [ACTION REQUIRED]' : '';
      return `${i + 1}. ${urg} ${svc} from ${r.fleet_name}, driver ${r.driver_name}${sched} — Status: ${r.status}${action}`;
    }).join('\n');
  }

  const roleContext = role === 'service_provider'
    ? `You are assisting ${callerName}, a service provider. Help them understand incoming work orders and respond. Available actions: accept, decline (with optional reason), or counter-propose a new date and time.

ANSWERING QUESTIONS — critical rules:
- When the provider asks a specific factual question (address, phone number, tire size, driver name, location, etc.), answer with ONLY that fact in one sentence. Do NOT re-summarize the work order or repeat information from a previous turn.
- Examples of correct answers: "The driver is at mile marker 220 on I-40 near Amarillo." / "The contact number is 555-867-5309." / "It's a 295/75R22.5 on the right rear drive axle."
- After answering a factual question, add a single brief natural prompt back to the decision — something like "Does that work for you?" or "Want to go ahead and accept it?" One sentence only.
- Never start your answer with a re-introduction of the work order ("So this is an ERS call from..." etc.) unless the provider explicitly asked for a full summary.`
    : `You are assisting ${callerName}, a fleet manager. Help them review provider responses and make decisions.`;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return `You are a seasoned commercial truck dispatcher — calm, direct, and deeply familiar with the industry. You speak exactly like a person on the phone: relaxed but professional, confident but never stiff.

${roleContext}

VOICE AND TONE — follow these strictly:
- Never say "As an AI", "I'm an assistant", or anything that references technology or artificial intelligence. You are a dispatcher.
- Never use bullet points, numbered lists, or headers. Speak only in natural, flowing sentences.
- Never use abbreviations or acronyms. Say "Monday" not "Mon", "March" not "Mar", "Emergency Roadside Service" not "ERS", "tire" not "TIRE", "mechanical" not "MECH". Always spell words out fully as you would say them aloud.
- Lead with what matters most. Be brief — two or three sentences is usually plenty.
- Use the kind of natural phrasing a person actually uses: "Looks like...", "So you've got...", "The fleet wants to move it to...", "That works — I'll send it over."
- Mirror the energy of the conversation. If someone is moving fast, keep up. If they're unsure, be steady.
- When confirming an action, sound human: "Done, I've got that sent over." not "Counter-proposal submitted successfully."
- When dates or times come up, say them the way a person would: "Monday the ninth at nine in the morning" not "Mon 3/9 9:00 AM".

Today is ${today}.${workOrder}${historySection}${allRequestsSection}`;
}

server.tool(
  'fleet_coordinate_work_order',
  'AI work order negotiation between fleet user and service provider. Stateless — pass full history on each call.',
  {
    request: z.object({
      id: z.string().optional(),
      service_type: z.string(),
      urgency: z.string(),
      status: z.string(),
      fleet_name: z.string(),
      driver_name: z.string(),
      contact_phone: z.string(),
      location: z.object({ current_location: z.string().optional() }).optional(),
      vehicle: z.object({ vehicle_type: z.string().optional() }).optional(),
      tire_info: z.object({
        requested_service: z.string().optional(),
        requested_tire: z.string().optional(),
        number_of_tires: z.number().optional(),
        tire_position: z.string().optional(),
      }).optional(),
      mechanical_info: z.object({
        requested_service: z.string().optional(),
        description: z.string().optional(),
      }).optional(),
      scheduled_appointment: z.object({
        scheduled_date: z.string().optional(),
        scheduled_time: z.string().optional(),
      }).optional(),
      proposed_date: z.string().optional(),
      last_updated_by_name: z.string().optional(),
      proposal_history: z.array(z.object({
        proposed_by: z.string(),
        proposed_date: z.string(),
        proposed_at: z.string(),
        notes: z.string().optional(),
      })).optional(),
    }).describe('Service request data'),
    role: z.enum(['fleet_user', 'service_provider']),
    callerName: z.string().describe('Name of the person interacting'),
    message: z.string().describe('The user message to send'),
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
      .optional()
      .describe('Prior turns — caller maintains state across calls'),
  },
  async ({ request, role, callerName, message, history }) => {
    const systemPrompt = buildCoordinationSystemPrompt(request as ServiceRequest, role, callerName);
    const messages = [...(history ?? []), { role: 'user' as const, content: message }];
    const text = await callLLM(systemPrompt, messages, 0.7);

    return {
      content: [{ type: 'text', text: JSON.stringify({ text }) }],
    };
  }
);

// ── fleet_parse_datetime ───────────────────────────────────────────────────

function parseNaturalDate(input: string): string | null {
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim();
  const today = new Date();
  const lower = input.toLowerCase().trim();
  if (lower === 'today') return formatYMD(today);
  if (lower === 'tomorrow') { const d = new Date(today); d.setDate(d.getDate() + 1); return formatYMD(d); }
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const cleaned = lower.replace(/^(next|this)\s+/, '');
  const dayIndex = days.indexOf(cleaned);
  if (dayIndex !== -1) {
    let ahead = dayIndex - today.getDay();
    if (ahead <= 0) ahead += 7;
    const d = new Date(today); d.setDate(d.getDate() + ahead); return formatYMD(d);
  }
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= today.getFullYear()) return formatYMD(parsed);
  return null;
}

function parseTimeString(input: string): string | null {
  const match = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase().replace(/\./g, '');
  if (meridiem === 'pm' && hours !== 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (!meridiem && hours >= 1 && hours <= 7) hours += 12;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function extractDateTime(input: string): { date: string | null; time: string | null } {
  const lower = input.toLowerCase().trim();
  let time: string | null = null;
  const atTimeMatch = lower.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)\b/);
  if (atTimeMatch) time = parseTimeString(atTimeMatch[1]);
  if (!time) { const m = lower.match(/\b(\d{1,2}(?::\d{2})?)\s*(am|pm|a\.m\.|p\.m\.)\b/); if (m) time = parseTimeString(m[0]); }
  if (!time) { const m = lower.match(/\b(\d{1,2}):(\d{2})\b/); if (m) time = parseTimeString(m[0]); }
  if (!time) { const m = lower.match(/\b(\d{1,2})\s*o['']?clock\b/); if (m) time = parseTimeString(m[1]); }
  if (!time && /\bnoon\b/.test(lower)) time = '12:00';
  if (!time && /\bmidnight\b/.test(lower)) time = '00:00';

  let date: string | null = null;
  if (/\btoday\b/.test(lower)) {
    date = parseNaturalDate('today');
  } else if (/\btomorrow\b/.test(lower)) {
    date = parseNaturalDate('tomorrow');
  } else {
    const dayMatch = lower.match(/\b(next\s+|this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (dayMatch) date = parseNaturalDate(dayMatch[0].trim());
    if (!date) {
      const monthMatch = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b/);
      if (monthMatch) date = parseNaturalDate(monthMatch[0]);
    }
  }
  if (!date) date = parseNaturalDate(input);
  return { date, time };
}

server.tool(
  'fleet_parse_datetime',
  'Parse natural-language date/time references from text. Returns { date: "YYYY-MM-DD" | null, time: "HH:MM" | null }.',
  {
    text: z.string().describe('Text containing a date and/or time reference (e.g. "next Tuesday at 2pm")'),
  },
  async ({ text }) => {
    const result = extractDateTime(text);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
);

// ── Start ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
