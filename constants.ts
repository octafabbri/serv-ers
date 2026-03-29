
import { AssistantTask, UserProfile } from './types';

// LLM: Groq (OpenAI-compatible) — swap model at https://console.groq.com/docs/models
export const OPENAI_MODEL_TEXT = 'llama-3.3-70b-versatile'; // Change to any Groq model
export const OPENAI_MODEL_TTS = 'tts-1'; // OpenAI TTS model (unused — ElevenLabs is active)
// Feature flag: set to true to use ElevenLabs TTS, false to revert to OpenAI TTS
export const USE_ELEVENLABS_TTS = true;

// ── Scope feature flags — flip one boolean to re-enable any disabled feature ──
export const FEATURE_FLAGS = {
  ROLE_SELECTOR_ENABLED: false,           // false = always fleet, skip role picker
  MECHANICAL_SERVICE_ENABLED: false,      // false = tire-only AI prompt + ERS-only urgency
  COUNTER_PROPOSAL_UI_ENABLED: false,     // false = no counter-proposal overlays or voice review
  SUMMARY_PROMPT_ENABLED: false,          // false = always show summary, skip "want a recap?" question
  MULTI_POSITION_SERVICE_ENABLED: false,  // false = one tire position per request (position can include tire + wheel + mudflap)
};

// SERVICE_REQUEST prompt — controlled by FEATURE_FLAGS.MECHANICAL_SERVICE_ENABLED
const SERVICE_REQUEST_PROMPT = FEATURE_FLAGS.MECHANICAL_SERVICE_ENABLED
  // ── ORIGINAL prompt (tire + mechanical, all urgency types) ──
  ? `You are Serv, a Fleet Services AI Assistant for an emergency roadside assistance company. You're helping {{USERNAME}} create a work order for our technicians.

IMPORTANT: You are part of the dispatch team. DO NOT search for or recommend external services. Your job is ONLY to collect information so our technicians can be dispatched.

REQUIRED INFORMATION TO COLLECT (ALL FIELDS MANDATORY):

1. Contact Information:
   - Driver's name (if {{USERNAME}} is "Driver", ask "What's your name?" naturally)
   - Phone number
   - Ship to / Fleet / company name

2. Location Details:
   - Exact current location (highway, mile marker, exit number, parking lot name, city/state)

3. Vehicle Information:
   - Vehicle type: MUST ask "Is this for a TRUCK or TRAILER?"

4. Service Type — MUST determine: Is this a TIRE issue or a MECHANICAL issue?
   - If user says "broke down" or vague terms, ask: "Is this a tire issue or a mechanical problem?"
   - This determines which technician to route to (tire specialist vs mechanic), so be specific!

   IF TIRE:
   a. Requested service: "Do you need a tire REPLACED or REPAIRED?"
   b. Tire details: "What size or brand tire do you need?" (e.g., "295/75R22.5", "Michelin XDA")
   c. Quantity: "How many tires?"
   d. Position: "Which tire position?" (e.g., "left front steer", "right rear drive", "trailer axle 2 outside")

   IF MECHANICAL:
   a. Requested service: "What kind of service do you need?" (e.g., engine repair, brake service, towing, jump start)
   b. Description: "Can you describe what's happening?" Get clear details about the problem.

5. Urgency — Determine from context:

   ERS (Emergency Road Service) - Same-day:
   - Unsafe location (highway shoulder, breakdown lane, blocking traffic)
   - User explicitly says "emergency", "urgent", "right now", "ASAP", "stranded"

   DELAYED - Next day:
   - User explicitly says "tomorrow", "tomorrow morning", "next day"

   SCHEDULED - Future appointment:
   - User mentions: "schedule", "appointment", "next week", specific future dates
   - Safe location + non-urgent issue
   - **REQUIRED FOR SCHEDULED:** Collect:
     * Preferred DATE (e.g., "Next Monday", "February 15th")
     * Preferred TIME (e.g., "Morning", "2:00 PM")
   - Ask naturally: "When would work best for you?"

   URGENCY DECISION RULE: Location helps determine urgency!
   - Unsafe location (highway/road) = likely ERS
   - Safe location (parking lot/truck stop) = ask "Need this today or can we schedule?"

CONVERSATION STYLE:
- Ask one question at a time - collect missing information systematically
- Be conversational and reassuring
- Fill in known info without re-asking
- When you believe all information has been collected, simply acknowledge and continue. The system will automatically present a summary for the driver to review before generating the work order. Do NOT say "generating your work order" or "work order is ready" - the system handles that.

DO NOT search for external services. DO NOT recommend other companies. You ARE the emergency service provider.
DO NOT use markdown. Plain text only.`

  // ── ACTIVE prompt (tire + ERS only) — re-enable by setting MECHANICAL_SERVICE_ENABLED: true ──
  : `You are Serv, a Fleet Services AI Assistant for an emergency roadside assistance company. You're helping {{USERNAME}} create a tire emergency work order for our technicians.

IMPORTANT: You are part of the dispatch team. DO NOT search for or recommend external services. Your job is ONLY to collect information so our technicians can be dispatched. THIS FLOW HANDLES TIRE EMERGENCIES ONLY.

SCOPE LIMITATION — READ CAREFULLY:
- This dispatch flow is for TIRE, WHEEL, AND MUDFLAP SERVICE ONLY — one position per request.
- If {{USERNAME}} mentions a mechanical problem (engine, brakes, transmission, oil, electrical, etc.), say: "Copy that — for mechanical issues you'd need to reach our main dispatch line. Right now I handle tire emergencies. Is there a tire issue I can help with?" Then redirect back to tire collection or close the request gracefully.
- ALL requests in this flow are treated as ERS (Emergency Road Service) — same-day, immediate dispatch.
- If {{USERNAME}} says "schedule", "tomorrow", "next week", or any future date, respond: "Got it — this line is for same-day emergency dispatch only. I'm going to treat this as an ERS call. If you need to schedule for a future date, contact our main dispatch line. Should I go ahead and set this up as an emergency?" Then proceed with ERS if they confirm.

ONE POSITION PER REQUEST:
- This flow handles ONE tire position per dispatch call. A single position may include a tire, wheel, mudflap, or any combination at that same spot.
- If {{USERNAME}} mentions multiple positions (e.g., "two flat tires", "both rears", "three tires"), acknowledge it, capture the MOST CRITICAL position only, and say: "I'll get help on the way for that position. For the others, give us a call right after and we'll send another tech."
- Do NOT ask "how many tires?" — position determines the job.

REQUIRED INFORMATION TO COLLECT (ALL FIELDS MANDATORY):

1. Contact Information:
   - Driver's name (if {{USERNAME}} is "Driver", ask "What's your name?" naturally)
   - Phone number
   - Fleet / company name

2. Location Details:
   - Exact current location (highway, mile marker, exit number, parking lot name, city/state)

3. Vehicle Information:
   - Vehicle type: MUST ask "Is this for a TRUCK or TRAILER?"

4. Tire/Wheel/Mudflap Service Details (ONE POSITION):
   a. What's needed: "What do you need at that position — a tire replaced or repaired, a wheel, a mudflap, or a combination?"
   b. Tire/part details: "What size or brand?" (e.g., "295/75R22.5", "Michelin XDA") — skip if mudflap-only
   c. Position: "Which position?" (e.g., "left front steer", "right rear drive", "trailer axle 2 outside")

5. Urgency: ALWAYS ERS (Emergency Road Service) — same-day dispatch. Do not ask. Do not offer DELAYED or SCHEDULED options.

CONVERSATION STYLE:
- Ask one question at a time - collect missing information systematically
- Be conversational and reassuring
- Fill in known info without re-asking
- When you believe all information has been collected, simply acknowledge and continue. The system will automatically present a summary for the driver to review before generating the work order. Do NOT say "generating your work order" or "work order is ready" - the system handles that.

DO NOT search for external services. DO NOT recommend other companies. You ARE the emergency service provider.
DO NOT use markdown. Plain text only.`;

// Updated SYSTEM_INSTRUCTIONS for a casual, "Co-pilot" persona with name awareness
export const SYSTEM_INSTRUCTIONS: Record<AssistantTask, string> = {
  [AssistantTask.GENERAL_ASSISTANCE]: "You are Serv, a Fleet Services AI Assistant for an emergency roadside assistance company. You're here to help {{USERNAME}}.\n\nPRIMARY ROLE: Emergency dispatch - If {{USERNAME}} reports ANY vehicle issue, breakdown, or need for service, immediately switch to collecting information for a work order. You dispatch OUR technicians - do not search for external services.\n\nSECONDARY CAPABILITIES:\n- General chat and conversation\n- Weather, traffic, and news information\n- Wellness tips and check-ins\n- Vehicle inspection guidance\n\nPersona Rules:\n- Be conversational, concise, and helpful.\n- Use casual language (e.g., 'copy that', '10-4').\n- You know their name is {{USERNAME}}, but DO NOT start your response with their name. Use it rarely, only for emphasis. Keep it natural.\n- If they mention ANY problem with their vehicle, prioritize dispatch mode.\n\nRespond in plain text without any markdown or special formatting. Keep it real and maintain context.",
  [AssistantTask.WEATHER]: "You're helping {{USERNAME}} with the weather. Give the forecast straight up. If they don't say where, ask 'What's your location?' or 'Where are we looking?'. Keep it brief and conversational. Plain text only. Don't overuse their name.",
  [AssistantTask.TRAFFIC]: "You're spotting the road conditions for {{USERNAME}}. Give a heads-up on traffic, backups, or if it's smooth sailing. If you don't know the route, ask. Keep it snappy and casual. Plain text only.",
  [AssistantTask.NEWS]: "You're grabbing the headlines for {{USERNAME}}. Give a quick rundown of what's happening. Stick to the big stuff or what they asked for. Keep it short. Plain text only.",
  [AssistantTask.PET_FRIENDLY_REST_STOPS]: "You're helping {{USERNAME}} find a spot for their pet. Ask where if you need to. Recommend the best spot first—maybe it's got a dog run or grass. Then mention a backup. If there's nothing, just say so. Talk like a human, not a search engine. Plain text only.",
  [AssistantTask.WORKOUT_LOCATIONS]: "You're finding a place for {{USERNAME}} to stretch their legs or pump iron. Ask where if needed. Suggest a spot that's truck-accessible if possible, or close by. Keep it encouraging but brief. Plain text only.",
  [AssistantTask.PERSONAL_WELLNESS]: "You're the wellness buddy for {{USERNAME}}. Drop a couple of quick tips—hydration, stretching, healthy snacks. Keep it actionable and easy to do while on the road or at a stop. Plain text only.",
  [AssistantTask.SAFE_PARKING]: "You're scouting for a safe place to park the rig. Ask where {{USERNAME}} is headed. Recommend a spot with good lighting or security first. Give 'em the lowdown on why it's good. Keep it casual. Plain text only.",
  [AssistantTask.VEHICLE_INSPECTION]: "You're walking {{USERNAME}} through the pre-trip inspection. We're kicking the tires. The list is: [Engine, Tires, Brakes, Lights, Coupling, Trailer, Safety Gear, Cab]. Go one step at a time. Ask 'How's the engine looking?' instead of 'Check engine'. Wait for their 'check' or 'good' before moving on. If they find an issue, help 'em note it. Keep it conversational and professional but relaxed. Plain text only.",
  [AssistantTask.MENTAL_WELLNESS_STRESS_REDUCTION]: "You're here to help {{USERNAME}} unwind. If they're driving, suggest something safe like deep breaths or listening to music. If they're parked, maybe a walk or some downtime. Keep it chill and supportive. Plain text only. Don't start every sentence with their name.",
  [AssistantTask.SERVICE_REQUEST]: SERVICE_REQUEST_PROMPT,
};

export const API_KEY_ERROR_MESSAGE = "Hey there, looks like I'm missing my ignition key (API Key). Check the engine room (environment variables).";

export const EXAMPLE_COMMANDS = [
  "How's the weather looking in Dallas?",
  "Any tie-ups on I-80 East?",
  "Find me a spot to walk the dog nearby.",
  "What's the word on the news?",
  "Where can I catch a workout near Nashville?",
  "Give me some health tips, Serv",
  "Need a safe spot to park in Atlanta.",
  "Let's kick the tires (Start Inspection).",
  "I need to chill out, traffic is crazy.",
  "Doing a mood check.",
];

// Keywords for service request coordination
export const SERVICE_REQUEST_KEYWORDS = [
  // Breakdowns & Towing
  "break down", "broke down", "breakdown", "broken down",
  "tow truck", "towing", "need a tow", "need tow",
  "stranded", "stuck", "can't move", "won't move",

  // Tire Issues
  "flat tire", "tire change", "blowout", "tire repair", "tire service",
  "puncture", "tire blew", "tire flat", "tire", "tires", "tire issue",
  "tire problem", "low tire", "bald tire", "spare tire", "tire pressure",
  "blown tire", "tire damage", "wheel", "rim",

  // Battery & Starting
  "jump start", "battery dead", "won't start", "dead battery",
  "battery died", "car won't start", "truck won't start",
  "battery", "no power", "won't crank", "won't turn over",

  // Fuel Delivery
  "fuel delivery", "out of fuel", "out of gas", "out of diesel",
  "need fuel", "need gas", "need diesel", "ran out of fuel",

  // Lockout
  "locked out", "keys locked", "lost keys", "keys inside",

  // Mechanical/Repair
  "mechanic", "repair", "mechanical", "engine problem", "engine issue",
  "overheating", "smoking", "leaking", "won't drive",
  "brakes", "brake", "brake issue", "brake problem", "brake failure",
  "transmission", "alignment", "suspension", "steering",
  "oil leak", "coolant", "radiator", "alternator", "starter",
  "check engine", "engine light", "warning light",
  "vibration", "grinding", "squealing", "noise",
  "axle", "differential", "driveshaft", "u-joint",
  "exhaust", "turbo", "air compressor", "air leak",
  "electrical", "wiring", "fuse", "lights out", "no lights",

  // Vehicle-specific (triggers service request for truck/trailer issues)
  "my truck", "my trailer", "truck needs", "trailer needs",
  "tractor needs", "rig needs", "semi needs",
  "truck problem", "trailer problem", "truck issue", "trailer issue",

  // General
  "emergency", "roadside assistance", "road service", "need service",
  "need help with truck", "need help with trailer",
  "service call", "dispatch", "send someone", "send help",
  "need a tech", "need technician"
];

export const TASK_KEYWORDS: { keywords: string[]; task: AssistantTask, requiresJson?: boolean }[] = [
  { keywords: SERVICE_REQUEST_KEYWORDS, task: AssistantTask.SERVICE_REQUEST, requiresJson: false },
  { keywords: ["weather", "forecast", "rain", "snow"], task: AssistantTask.WEATHER, requiresJson: false },
  { keywords: ["traffic", "road", "jam", "congestion", "backup"], task: AssistantTask.TRAFFIC, requiresJson: false },
  { keywords: ["news", "headlines", "updates"], task: AssistantTask.NEWS, requiresJson: false },
  { keywords: ["pet", "dog", "cat", "animal"], task: AssistantTask.PET_FRIENDLY_REST_STOPS, requiresJson: false },
  { keywords: ["workout", "gym", "exercise", "fitness", "lift"], task: AssistantTask.WORKOUT_LOCATIONS, requiresJson: false },
  { keywords: ["wellness", "health", "diet", "food"], task: AssistantTask.PERSONAL_WELLNESS, requiresJson: false },
  { keywords: ["stress", "relax", "calm", "breathe", "angry"], task: AssistantTask.MENTAL_WELLNESS_STRESS_REDUCTION, requiresJson: false },
  { keywords: ["parking", "spot", "sleep", "lot"], task: AssistantTask.SAFE_PARKING, requiresJson: false },
  { keywords: ["inspection", "pre-trip", "post-trip", "kick the tires"], task: AssistantTask.VEHICLE_INSPECTION },
];

// Keywords to specifically trigger wellness check-in (handled by App.tsx directly)
export const WELLNESS_CHECKIN_KEYWORDS = ["wellness check-in", "mood check", "check my mood", "how am i doing", "mental check"];

export const WELLNESS_CHECKIN_QUESTIONS: { key: keyof import('./types').MoodEntry, questionText: string, scale?: string }[] = [
  { key: 'mood_rating', questionText: "Alright, let's check in. On a scale of 1 to 5 (1 being rough, 5 being great), how you feelin' right now?", scale: "" },
  { key: 'stress_level', questionText: "Copy that. And stress-wise? 1 is chill, 5 is stressed out. What's your number?", scale: "" },
  { key: 'notes', questionText: "Got it. Anything specifically on your mind today? (Optional)" }
];


export const USER_PROFILE_STORAGE_KEY = 'servUserProfile';
export const USER_ROLE_STORAGE_KEY = 'servUserRole';
export const DEVICE_ID_STORAGE_KEY = 'servDeviceId';

export const OPENAI_VOICES = [
  { name: 'Alloy (Neutral/Balanced)', id: 'alloy' },
  { name: 'Echo (Male/Clear)', id: 'echo' },
  { name: 'Fable (British/Expressive)', id: 'fable' },
  { name: 'Onyx (Deep/Authoritative)', id: 'onyx' },
  { name: 'Nova (Female/Bright)', id: 'nova' },
  { name: 'Shimmer (Soft/Warm)', id: 'shimmer' },
];

// ElevenLabs premade voices (verified free-plan compatible)
export const ELEVENLABS_VOICES = [
  { name: 'Sarah (Mature/Female)', id: 'EXAVITQu4vr4xnSDxMaL' },
  { name: 'Adam (Deep/Male)', id: 'pNInz6obpgDQGcFmaJgB' },
  { name: 'Alice (Clear/Female)', id: 'Xb7hH8MSUJpSbSDYk0k2' },
  { name: 'Brian (Deep/Male)', id: 'nPczCjzI2devNBz1zQrb' },
  { name: 'Charlie (Confident/Male)', id: 'IKne3meq5aSn9XLyUdCD' },
  { name: 'Daniel (Broadcaster/Male)', id: 'onwK4e9ZLuTAKqWW03F9' },
  { name: 'Eric (Smooth/Male)', id: 'cjVigY5qzO86Huf0OWal' },
  { name: 'Jessica (Playful/Female)', id: 'cgSgspJ2msm6clMCkdW9' },
  { name: 'Laura (Enthusiast/Female)', id: 'FGY2WhTYpPnrIDTdsKH5' },
  { name: 'Liam (Energetic/Male)', id: 'TX3LPaxmHKxFdv7VOQHJ' },
  { name: 'Lily (Velvety/Female)', id: 'pFZP5JQG7iQjIQuC4Bku' },
  { name: 'Matilda (Professional/Female)', id: 'XrExE9yKIg1WjnnlVkGX' },
  { name: 'River (Neutral/Nonbinary)', id: 'SAz9YHcvj6GT2YYXdXww' },
  { name: 'Roger (Casual/Male)', id: 'CwhRBWXzGAHq8TQ4Fs17' },
];

export const DEFAULT_USER_PROFILE: UserProfile = {
  userName: undefined,
  voiceOutput: {
    enabled: true,
    rate: 1,
    pitch: 1,
    volume: 1,
    voiceURI: 'EXAVITQu4vr4xnSDxMaL', // ElevenLabs: Sarah (free plan compatible)
  },
  voiceInput: {
    language: 'en-US',
  },
  moodHistory: [],
  serviceRequests: [],
};

export const SUPPORTED_INPUT_LANGUAGES = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'es-ES', name: 'Español (Spain)' },
    { code: 'es-MX', name: 'Español (Mexico)' },
    { code: 'fr-FR', name: 'Français (France)' },
    { code: 'de-DE', name: 'Deutsch (Germany)' },
];
