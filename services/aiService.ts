import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { OPENAI_MODEL_TEXT, OPENAI_MODEL_TTS, SILICONFLOW_MODEL_TTS, GEMINI_MODEL_TTS, TTS_PROVIDER, LLM_PROVIDER, GEMINI_MODEL_TEXT, SYSTEM_INSTRUCTIONS, API_KEY_ERROR_MESSAGE, TASK_KEYWORDS, SUPPORTED_INPUT_LANGUAGES, FEATURE_FLAGS } from '../constants';
import { AssistantTask, VehicleInspectionStep, GroundingSource, ServiceRequest } from '../types';

let openai: OpenAI | null = null;

const getAIClient = (): OpenAI => {
  if (!openai) {
    if (!import.meta.env.VITE_GROQ_API_KEY) {
      console.error(API_KEY_ERROR_MESSAGE);
      throw new Error(API_KEY_ERROR_MESSAGE);
    }
    openai = new OpenAI({
      apiKey: import.meta.env.VITE_GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      dangerouslyAllowBrowser: true,
    });
  }
  return openai;
};

let geminiTextClient: GoogleGenAI | null = null;
const getGeminiClient = (): GoogleGenAI => {
  if (!geminiTextClient) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error('VITE_GEMINI_API_KEY is not set');
    geminiTextClient = new GoogleGenAI({ apiKey });
  }
  return geminiTextClient;
};

/**
 * Chat wrapper to maintain conversation history
 * Mimics Gemini's Chat interface for compatibility
 */
export class ChatSession {
  private messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  private systemInstruction: string;
  private temperature: number;
  private geminiChat: any = null;

  constructor(systemInstruction: string, temperature: number = 0.7) {
    this.systemInstruction = systemInstruction;
    this.temperature = temperature;
    if (LLM_PROVIDER === 'gemini') {
      const genai = getGeminiClient();
      this.geminiChat = genai.chats.create({
        model: GEMINI_MODEL_TEXT,
        config: { systemInstruction, temperature },
      });
    } else {
      this.messages.push({ role: 'system', content: systemInstruction });
    }
  }

  async sendMessage({ message }: { message: string }): Promise<{ text: string; groundingSources?: GroundingSource[] }> {
    try {
      if (LLM_PROVIDER === 'gemini') {
        const response = await this.geminiChat.sendMessage({ message });
        return { text: response.text || '' };
      }

      const client = getAIClient();

      // Add user message to history
      this.messages.push({ role: 'user', content: message });

      const response = await client.chat.completions.create({
        model: OPENAI_MODEL_TEXT,
        messages: this.messages,
        temperature: this.temperature,
      });

      const aiMessage = response.choices[0]?.message?.content || '';

      // Add assistant message to history
      this.messages.push({ role: 'assistant', content: aiMessage });

      return { text: aiMessage };
    } catch (error) {
      console.error('AI API error:', error);
      throw error;
    }
  }

  // Get conversation history for debugging or data extraction
  getHistory(): OpenAI.Chat.ChatCompletionMessageParam[] {
    return this.messages;
  }
}

// Parse JSON from string (unchanged from Gemini version)
export const parseJsonFromString = <T,>(jsonString: string): T | null => {
  let cleanJsonString = jsonString.trim();
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
  const match = cleanJsonString.match(fenceRegex);
  if (match && match[2]) {
    cleanJsonString = match[2].trim();
  }
  try {
    return JSON.parse(cleanJsonString) as T;
  } catch (error) {
    console.error("Failed to parse JSON response:", error, "Raw string:", jsonString);
    return null;
  }
};

/**
 * Extract name from user input using AI
 */
export const extractNameWithAI = async (userInput: string): Promise<string> => {
  try {
    const prompt = `The user was asked "What is your name?". They replied: "${userInput}". Extract the name they want to be called. Return ONLY the name as a plain string. If it's unclear or they refuse, return "Driver". Do not include punctuation or quotes.`;

    if (LLM_PROVIDER === 'gemini') {
      const genai = getGeminiClient();
      const response = await genai.models.generateContent({
        model: GEMINI_MODEL_TEXT,
        contents: prompt,
        config: { temperature: 0.3 },
      });
      return (response.text || 'Driver').trim().replace(/['"]/g, '');
    }

    const client = getAIClient();
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL_TEXT,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const name = response.choices[0]?.message?.content?.trim().replace(/['"]/g, '') || "Driver";
    return name;
  } catch (error) {
    console.error("Error extracting name:", error);
    return "Driver";
  }
};

/**
 * Generate speech using OpenAI TTS
 * Returns base64-encoded audio data
 */
/**
 * Convert ArrayBuffer to base64 string using chunked processing
 * to avoid stack overflow with large audio files
 */
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB chunks
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

/**
 * Wrap raw PCM bytes in a WAV container so the Web Audio API can decode it.
 */
function pcmToWav(pcm: Uint8Array, sampleRate: number, numChannels: number, bitDepth: number): ArrayBuffer {
  const byteRate = sampleRate * numChannels * bitDepth / 8;
  const blockAlign = numChannels * bitDepth / 8;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcm);
  return buffer;
}

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string | null> => {
  console.log(`🎤 Generating speech — provider: ${TTS_PROVIDER}, voice: ${voiceName}, text length: ${text.length}`);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (TTS_PROVIDER === 'elevenlabs') {
        // --- ElevenLabs TTS ---
        const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
        if (!apiKey) throw new Error('VITE_ELEVENLABS_API_KEY is not set');

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceName}`, {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw Object.assign(new Error(`ElevenLabs error: ${err}`), { status: response.status });
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log(`✅ ElevenLabs audio buffer: ${arrayBuffer.byteLength} bytes`);
        return arrayBufferToBase64(arrayBuffer);

      } else if (TTS_PROVIDER === 'siliconflow') {
        // --- SiliconFlow TTS (OpenAI-compatible) ---
        const apiKey = import.meta.env.VITE_SILICONFLOW_API_KEY;
        if (!apiKey) throw new Error('VITE_SILICONFLOW_API_KEY is not set');

        const sfClient = new OpenAI({
          apiKey,
          baseURL: 'https://api.siliconflow.com/v1',
          dangerouslyAllowBrowser: true,
        });

        const response = await sfClient.audio.speech.create({
          model: SILICONFLOW_MODEL_TTS,
          voice: voiceName as any,
          input: text,
          response_format: 'mp3',
        });

        const arrayBuffer = await response.arrayBuffer();
        console.log(`✅ SiliconFlow audio buffer: ${arrayBuffer.byteLength} bytes`);
        return arrayBufferToBase64(arrayBuffer);

      } else if (TTS_PROVIDER === 'gemini') {
        // --- Gemini 3.1 Flash TTS Preview ---
        // Returns raw PCM (24kHz, 16-bit mono) — encode to WAV for the AudioContext
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error('VITE_GEMINI_API_KEY is not set');

        const genai = new GoogleGenAI({ apiKey });
        const response = await genai.models.generateContent({
          model: GEMINI_MODEL_TTS,
          contents: text,
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName },
              },
            },
          },
        });

        const pcmBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!pcmBase64) throw new Error('Gemini TTS returned no audio data');

        // Wrap raw PCM in a WAV container (24000 Hz, 16-bit, mono)
        const pcmBytes = Uint8Array.from(atob(pcmBase64), c => c.charCodeAt(0));
        const wavBuffer = pcmToWav(pcmBytes, 24000, 1, 16);
        console.log(`✅ Gemini audio (WAV): ${wavBuffer.byteLength} bytes`);
        return arrayBufferToBase64(wavBuffer);

      } else {
        // --- OpenAI TTS ---
        const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
        const validVoice = validVoices.includes(voiceName.toLowerCase()) ? voiceName.toLowerCase() : 'onyx';
        const client = getAIClient();

        const response = await client.audio.speech.create({
          model: OPENAI_MODEL_TTS,
          voice: validVoice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
          input: text,
          response_format: 'mp3',
        });

        const arrayBuffer = await response.arrayBuffer();
        console.log(`✅ OpenAI audio buffer: ${arrayBuffer.byteLength} bytes`);
        return arrayBufferToBase64(arrayBuffer);
      }
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status;
      if ((status === 503 || status === 429) && attempt < maxAttempts) {
        const delay = attempt * 1000;
        console.warn(`⚠️ TTS attempt ${attempt} failed (${status}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.error("❌ Error generating speech:", error);
      return null;
    }
  }
  return null;
};

/**
 * Create a new chat session for a specific task
 */
export const createNewChatWithTask = (
  task: AssistantTask,
  languageCode: string,
  userName?: string
): ChatSession => {
  let systemInstruction = SYSTEM_INSTRUCTIONS[task];

  const language = SUPPORTED_INPUT_LANGUAGES.find(l => l.code === languageCode);
  const languageName = language ? language.name.split(' (')[0] : 'the user\'s language';
  const nameToUse = userName || 'Driver';

  // Replace placeholder in instruction
  systemInstruction = systemInstruction.replace(/{{USERNAME}}/g, nameToUse);

  // Language instruction
  systemInstruction += `\n\nImportant: The user is speaking ${languageName} (locale: ${languageCode}). ALL of your responses MUST be in ${languageName}. Do not switch languages.`;

  // Name usage constraint
  systemInstruction += `\n\nConstraint: You are talking to ${nameToUse}. Do NOT start every response with their name.`;

  // Note: OpenAI doesn't have built-in Google Search like Gemini
  // For tasks requiring real-time data (weather, traffic, news), you may need to implement external API calls
  // or use OpenAI's function calling feature

  const taskDefinition = TASK_KEYWORDS.find(t => t.task === task);
  const temperature = taskDefinition?.requiresJson ? 0.3 : 0.7;

  return new ChatSession(systemInstruction, temperature);
};

/**
 * Start vehicle inspection chat
 */
export const startVehicleInspectionChat = (languageCode: string, userName?: string): ChatSession => {
  return createNewChatWithTask(AssistantTask.VEHICLE_INSPECTION, languageCode, userName);
};

/**
 * Continue vehicle inspection conversation
 */
export const continueVehicleInspectionChat = async (
  chatSession: ChatSession,
  userMessage: string
): Promise<{ text: string; data?: VehicleInspectionStep; groundingSources?: GroundingSource[] }> => {
  try {
    const messageToSend = userMessage === "START_INSPECTION"
      ? "Let's begin the vehicle inspection. Please describe the first step."
      : userMessage;

    const response = await chatSession.sendMessage({ message: messageToSend });
    const aiResponseText = response.text;

    const inspectionData: VehicleInspectionStep = {
      current_step_description: aiResponseText,
    };

    return { text: aiResponseText, data: inspectionData };
  } catch (error) {
    console.error("Error in vehicle inspection chat:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { text: `Sorry, there was an issue with the inspection guidance: ${errorMessage}` };
  }
};

/**
 * Determine task from user input based on keywords
 */
export const determineTaskFromInput = (input: string): { task: AssistantTask; requiresJson: boolean } => {
  const lowerInput = input.toLowerCase();
  for (const taskDef of TASK_KEYWORDS) {
    if (taskDef.keywords.some(kw => lowerInput.includes(kw))) {
      return { task: taskDef.task, requiresJson: !!taskDef.requiresJson };
    }
  }
  return { task: AssistantTask.GENERAL_ASSISTANCE, requiresJson: false };
};

/**
 * Resolve a scheduled_date that may be a day name or relative term
 * into an actual YYYY-MM-DD date string.
 * Falls through to the original value if already in YYYY-MM-DD format.
 */
const resolveScheduledDate = (dateStr: string): string => {
  // Already in YYYY-MM-DD format — return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  const today = new Date();
  const lower = dateStr.toLowerCase().trim();

  // "today"
  if (lower === 'today') {
    return formatYMD(today);
  }

  // "tomorrow"
  if (lower === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return formatYMD(d);
  }

  // Day-of-week names (with optional "next" prefix)
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const cleaned = lower.replace(/^next\s+/, '');
  const targetDay = dayNames.indexOf(cleaned);
  if (targetDay !== -1) {
    const currentDay = today.getDay();
    let daysAhead = targetDay - currentDay;
    if (daysAhead <= 0) daysAhead += 7; // always pick the upcoming occurrence
    const d = new Date(today);
    d.setDate(d.getDate() + daysAhead);
    return formatYMD(d);
  }

  // Try parsing as a natural date string (e.g., "February 19, 2026")
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= today.getFullYear()) {
    return formatYMD(parsed);
  }

  return dateStr;
};

const formatYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Extract structured service request data from conversation
 * Uses OpenAI to analyze conversation and extract fields
 */
export const extractServiceDataFromConversation = async (
  conversationHistory: string,
  currentRequest: ServiceRequest
): Promise<Partial<ServiceRequest>> => {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Build context flags based on active feature flags
  const isErsOnlyFlow = !FEATURE_FLAGS.MECHANICAL_SERVICE_ENABLED;
  const ersOnlyNote = isErsOnlyFlow
    ? '\nFLOW CONTEXT: This conversation is from an ERS-only tire dispatch flow. urgency is ALWAYS "ERS" — never leave it empty. service_type is ALWAYS "TIRE".'
    : '';

  const prompt = `You are extracting data from a roadside assistance conversation. Extract ALL information mentioned, even if implicit.${ersOnlyNote}

TODAY'S DATE: ${todayStr}

CONVERSATION:
${conversationHistory}

CURRENT DATA (may have empty fields):
${JSON.stringify(currentRequest, null, 2)}

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

  try {
    let jsonText: string;
    if (LLM_PROVIDER === 'gemini') {
      console.log('🔍 Calling Gemini for data extraction...');
      const genai = getGeminiClient();
      const response = await genai.models.generateContent({
        model: GEMINI_MODEL_TEXT,
        contents: prompt,
        config: { temperature: 0.3, responseMimeType: 'application/json' },
      });
      jsonText = response.text || '{}';
    } else {
      console.log('🔍 Calling Groq for data extraction...');
      const client = getAIClient();
      const response = await client.chat.completions.create({
        model: OPENAI_MODEL_TEXT,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });
      jsonText = response.choices[0]?.message?.content || '{}';
    }
    console.log('📥 Raw LLM extraction response:', jsonText);

    const parsed = parseJsonFromString(jsonText) || {};

    // Post-process: resolve any unresolved day names or relative dates
    if (parsed.scheduled_appointment?.scheduled_date) {
      parsed.scheduled_appointment.scheduled_date = resolveScheduledDate(
        parsed.scheduled_appointment.scheduled_date
      );
    }

    console.log('📦 Parsed extraction result:', parsed);

    return parsed;
  } catch (error) {
    console.error("❌ Data extraction error:", error);
    return {};
  }
};
