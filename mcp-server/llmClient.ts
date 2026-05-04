import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function getProvider(): 'gemini' | 'groq' {
  return (process.env.LLM_PROVIDER ?? 'gemini') as 'gemini' | 'groq';
}

export async function callLLM(
  systemPrompt: string,
  messages: ChatMessage[],
  temperature = 0.7,
  jsonMode = false
): Promise<string> {
  if (getProvider() === 'gemini') {
    const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    // Build contents: system turn first (as user role), then conversation
    const contents = [
      { role: 'user' as const, parts: [{ text: systemPrompt }] },
      { role: 'model' as const, parts: [{ text: 'Understood.' }] },
      ...messages.map(m => ({
        role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        parts: [{ text: m.content }],
      })),
    ];

    const response = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        temperature,
        ...(jsonMode && { responseMimeType: 'application/json' }),
      },
    });
    return response.text ?? '';
  }

  // Groq (OpenAI-compatible)
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const response = await client.chat.completions.create({
    model: GROQ_MODEL,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ],
    ...(jsonMode && { response_format: { type: 'json_object' as const } }),
  });

  return response.choices[0]?.message?.content ?? '';
}

export class NodeChatSession {
  private history: ChatMessage[] = [];

  constructor(
    private readonly systemPrompt: string,
    private readonly temperature = 0.7
  ) {}

  async sendMessage({ message }: { message: string }): Promise<{ text: string }> {
    this.history.push({ role: 'user', content: message });
    const text = await callLLM(this.systemPrompt, this.history, this.temperature);
    this.history.push({ role: 'assistant', content: text });
    return { text };
  }

  getHistory(): ChatMessage[] {
    return this.history;
  }
}
