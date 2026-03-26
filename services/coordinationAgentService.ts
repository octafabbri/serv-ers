import { ChatSession } from './aiService';
import { ServiceRequest, ProposalEntry } from '../types';

// ── Formatting helpers ───────────────────────────────────────────────────────

function formatDateDisplay(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatProposalHistory(history: ProposalEntry[] | undefined): string {
  if (!history || history.length === 0) return 'No negotiation history yet.';
  return history
    .map((entry, i) => {
      const who = entry.proposed_by === 'fleet_user' ? 'Fleet' : 'Provider';
      const dateStr = formatDateDisplay(entry.proposed_date);
      const notes = entry.notes ? ` — "${entry.notes}"` : '';
      return `Round ${i + 1} (${who}): Proposed ${dateStr}${notes}`;
    })
    .join('\n');
}

// ── System prompt builder ────────────────────────────────────────────────────

function buildCoordinationSystemPrompt(
  request: ServiceRequest,
  role: 'fleet_user' | 'service_provider',
  callerName: string,
  allRequests?: ServiceRequest[]
): string {
  const urgencyLabels: Record<string, string> = {
    ERS: 'Emergency Roadside Service',
    DELAYED: 'Delayed',
    SCHEDULED: 'Scheduled',
  };

  const serviceLabel = request.service_type === 'TIRE' ? 'Tire Service' : 'Mechanical Service';
  const urgencyLabel = urgencyLabels[request.urgency] || request.urgency;

  let workOrderSection = `\n\n## Current Work Order\nService: ${serviceLabel}\nUrgency: ${urgencyLabel}\nFleet: ${request.fleet_name}\nDriver: ${request.driver_name}\nPhone: ${request.contact_phone}\nLocation: ${request.location?.current_location || 'Not provided'}\nVehicle: ${request.vehicle?.vehicle_type || 'Not specified'}\nStatus: ${request.status}`;

  if (request.service_type === 'TIRE' && request.tire_info) {
    workOrderSection += `\nTire Service: ${request.tire_info.requested_service}\nTire: ${request.tire_info.requested_tire}\nQuantity: ${request.tire_info.number_of_tires}\nPosition: ${request.tire_info.tire_position}`;
  }

  if (request.service_type === 'MECHANICAL' && request.mechanical_info) {
    workOrderSection += `\nMechanical: ${request.mechanical_info.requested_service}\nDescription: ${request.mechanical_info.description}`;
  }

  if (request.urgency === 'SCHEDULED' && request.scheduled_appointment) {
    workOrderSection += `\nScheduled Date: ${request.scheduled_appointment.scheduled_date}\nScheduled Time: ${request.scheduled_appointment.scheduled_time}`;
  }

  if (request.proposed_date) {
    const lastEntry = request.proposal_history?.slice(-1)[0];
    const proposedBy = lastEntry
      ? lastEntry.proposed_by === 'fleet_user' ? 'Fleet' : 'Provider'
      : request.last_updated_by_name || 'Unknown';
    workOrderSection += `\nProposed Time: ${formatDateDisplay(request.proposed_date)} (proposed by ${proposedBy})`;
  }

  const historySection = `\n\n## Negotiation History\n${formatProposalHistory(request.proposal_history)}`;

  let allRequestsSection = '';
  if (allRequests && allRequests.length > 0) {
    allRequestsSection =
      '\n\n## All Pending Work Orders\n' +
      allRequests
        .map((r, i) => {
          const svc = r.service_type === 'TIRE' ? 'Tire' : 'Mechanical';
          const urg = urgencyLabels[r.urgency] || r.urgency;
          const schedDate =
            r.urgency === 'SCHEDULED' && r.scheduled_appointment?.scheduled_date
              ? ` — Scheduled: ${r.scheduled_appointment.scheduled_date}`
              : '';
          const lastBy = r.proposal_history?.slice(-1)[0]?.proposed_by;
          const needsAction =
            r.status === 'counter_proposed' && lastBy === 'fleet_user' ? ' [ACTION REQUIRED]' : '';
          return `${i + 1}. ${urg} ${svc} from ${r.fleet_name}, driver ${r.driver_name}${schedDate} — Status: ${r.status}${needsAction}`;
        })
        .join('\n');
  }

  const roleContext =
    role === 'service_provider'
      ? `You are assisting ${callerName}, a service provider. Help them understand incoming work orders and respond. Available actions: accept, decline (with optional reason), or counter-propose a new date and time.

ANSWERING QUESTIONS — critical rules:
- When the provider asks a specific factual question (address, phone number, tire size, driver name, location, etc.), answer with ONLY that fact in one sentence. Do NOT re-summarize the work order or repeat information from a previous turn.
- Examples of correct answers: "The driver is at mile marker 220 on I-40 near Amarillo." / "The contact number is 555-867-5309." / "It's a 295/75R22.5 on the right rear drive axle."
- After answering a factual question, add a single brief natural prompt back to the decision — something like "Does that work for you?" or "Want to go ahead and accept it?" One sentence only.
- Never start your answer with a re-introduction of the work order ("So this is an ERS call from..." etc.) unless the provider explicitly asked for a full summary.`
      : `You are assisting ${callerName}, a fleet manager. Help them review provider responses and make decisions.`;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

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

Today is ${today}.${workOrderSection}${historySection}${allRequestsSection}`;
}

// ── WorkOrderCoordinationAgent ───────────────────────────────────────────────

export class WorkOrderCoordinationAgent {
  private session: ChatSession;
  private role: 'fleet_user' | 'service_provider';

  constructor(
    request: ServiceRequest,
    role: 'fleet_user' | 'service_provider',
    callerName: string,
    allRequests?: ServiceRequest[]
  ) {
    this.role = role;
    const systemPrompt = buildCoordinationSystemPrompt(request, role, callerName, allRequests);
    this.session = new ChatSession(systemPrompt, 0.7);
  }

  async sendMessage(userInput: string): Promise<string> {
    const response = await this.session.sendMessage({ message: userInput });
    return response.text;
  }

  async getRequestSummary(): Promise<string> {
    const prompt =
      this.role === 'service_provider'
        ? 'Give a 2-3 sentence spoken summary of this work order as a dispatcher would say it on the phone — natural, no abbreviations, no lists. Spell out full day and month names. Do not ask any questions. End with exactly: "Say accept, decline, or counter."'
        : "Give a 2-3 sentence spoken summary of this work order and the provider's counter-proposal as a dispatcher would say it on the phone — natural, no abbreviations, no lists. Spell out full day and month names. Do not ask any questions. End with exactly: \"Say accept, decline, or counter-propose.\"";
    return this.sendMessage(prompt);
  }
}

// ── Natural language date parsing ────────────────────────────────────────────

/**
 * Converts natural language date input to YYYY-MM-DD.
 * Handles: "today", "tomorrow", day names, "next Monday", ISO dates, and
 * common English date strings like "March 5th".
 * Returns null if the date cannot be determined.
 */
export function parseNaturalDate(input: string): string | null {
  if (!input) return null;

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim();

  const today = new Date();
  const lower = input.toLowerCase().trim();

  if (lower === 'today') return formatYMD(today);

  if (lower === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return formatYMD(d);
  }

  // Day-of-week with optional "next"/"this" prefix
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const cleaned = lower.replace(/^(next|this)\s+/, '');
  const dayIndex = dayNames.indexOf(cleaned);
  if (dayIndex !== -1) {
    const currentDay = today.getDay();
    let daysAhead = dayIndex - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    const d = new Date(today);
    d.setDate(d.getDate() + daysAhead);
    return formatYMD(d);
  }

  // Try native date parsing (handles "March 5th", "Feb 19", etc.)
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= today.getFullYear()) {
    return formatYMD(parsed);
  }

  return null;
}

/**
 * Parses a time string like "2pm", "14:30", "2:30 PM" into "HH:MM" (24h).
 * Returns null if unparseable.
 */
export function parseTimeString(input: string): string | null {
  const match = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase().replace(/\./g, '');

  if (meridiem === 'pm' && hours !== 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  // No meridiem and hour is ambiguous (1-7): assume PM (business hours)
  if (!meridiem && hours >= 1 && hours <= 7) hours += 12;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Extracts date and time tokens from anywhere in a natural-language utterance.
 * Searches for each independently so filler words around them don't interfere.
 * E.g. "lets counter. send over monday at 9 and see what they say"
 *   → { date: '2026-03-09', time: '09:00' }
 */
export function extractDateTime(input: string): { date: string | null; time: string | null } {
  const lower = input.toLowerCase().trim();

  // ── Time (highest-specificity patterns win) ───────────────────────────────
  let time: string | null = null;

  // "at <number> [am/pm]" — most explicit signal
  const atTimeMatch = lower.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)\b/);
  if (atTimeMatch) time = parseTimeString(atTimeMatch[1]);

  // "[number] am/pm" anywhere
  if (!time) {
    const meridiemMatch = lower.match(/\b(\d{1,2}(?::\d{2})?)\s*(am|pm|a\.m\.|p\.m\.)\b/);
    if (meridiemMatch) time = parseTimeString(meridiemMatch[0]);
  }

  // "H:MM" explicit colon format
  if (!time) {
    const colonMatch = lower.match(/\b(\d{1,2}):(\d{2})\b/);
    if (colonMatch) time = parseTimeString(colonMatch[0]);
  }

  // "X o'clock"
  if (!time) {
    const oclockMatch = lower.match(/\b(\d{1,2})\s*o['']?clock\b/);
    if (oclockMatch) time = parseTimeString(oclockMatch[1]);
  }

  // Named times
  if (!time && /\bnoon\b/.test(lower)) time = '12:00';
  if (!time && /\bmidnight\b/.test(lower)) time = '00:00';

  // ── Date ─────────────────────────────────────────────────────────────────
  let date: string | null = null;

  if (/\btoday\b/.test(lower)) {
    date = parseNaturalDate('today');
  } else if (/\btomorrow\b/.test(lower)) {
    date = parseNaturalDate('tomorrow');
  } else {
    // "next Monday", "this Tuesday", or bare day name anywhere in utterance
    const dayMatch = lower.match(/\b(next\s+|this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (dayMatch) date = parseNaturalDate(dayMatch[0].trim());

    // "March 15th", "March 15" — month name + day
    if (!date) {
      const monthMatch = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b/);
      if (monthMatch) date = parseNaturalDate(monthMatch[0]);
    }
  }

  // Last resort: try parsing the whole input
  if (!date) date = parseNaturalDate(input);

  return { date, time };
}

/**
 * AI-powered date/time extraction for counter-proposal utterances.
 * Unlike extractDateTime, this understands negations and intent:
 * "I can't do Tuesday, how about Monday at 9" → Monday, not Tuesday.
 * Falls back to extractDateTime if the AI call fails.
 */
export async function extractProposedDateTime(
  input: string
): Promise<{ date: string | null; time: string | null }> {
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const session = new ChatSession(
    `Today is ${todayStr}. Extract the date and time being PROPOSED from a voice transcript. ` +
    `The speaker may mention dates they cannot do — ignore those entirely. ` +
    `Reply with ONLY a JSON object, no other text.`,
    0
  );
  try {
    const result = await session.sendMessage({
      message:
        `Extract the proposed date and time from: "${input}"\n\n` +
        `Return: {"date": "YYYY-MM-DD", "time": "HH:MM"}\n` +
        `Use null for any field not mentioned. Resolve relative expressions ` +
        `("monday", "next tuesday", "tomorrow") to actual YYYY-MM-DD dates.`,
    });
    const cleaned = result.text.trim().replace(/```(?:json)?\n?|```/g, '').trim();
    const json = JSON.parse(cleaned);
    const date =
      typeof json.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : null;
    const time =
      typeof json.time === 'string' && /^\d{2}:\d{2}$/.test(json.time) ? json.time : null;
    return { date, time };
  } catch {
    return extractDateTime(input);
  }
}
