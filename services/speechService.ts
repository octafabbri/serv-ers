
// Web Speech API interfaces (kept for type compatibility/fallback for Input)
export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionStatic {
  new (): SpeechRecognition;
  prototype: SpeechRecognition;
}

export interface SpeechRecognition extends EventTarget {
  grammars: any;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  serviceURI: string;

  start(): void;
  stop(): void;
  abort(): void;

  onaudiostart: (() => void) | null;
  onaudioend: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
  onnomatch: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onsoundstart: (() => void) | null;
  onsoundend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionStatic;
    webkitSpeechRecognition: SpeechRecognitionStatic;
  }
}

export const getSpeechRecognition = (): SpeechRecognition | null => {
  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionImpl) {
    console.warn("Speech Recognition API not supported in this browser.");
    return null;
  }
  return new SpeechRecognitionImpl();
};

// --- AUDIO PLAYBACK LOGIC FOR MP3 (OpenAI TTS) ---

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === 'closed') {
    // Standard sample rate for MP3 playback
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Must be called during a user interaction (click/tap) to ensure the AudioContext
 * is allowed to play sound (Autoplay Policy).
 */
export const initializeAudio = async () => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (e) {
      console.warn("Failed to resume audio context:", e);
    }
  }
};

/**
 * Decode base64 string to ArrayBuffer for MP3 audio
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    // Clean the base64 string
    const cleanBase64 = base64.replace(/[\r\n\s]/g, '');

    if (!cleanBase64) return new ArrayBuffer(0);

    const binaryString = atob(cleanBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error("Failed to decode base64 audio:", error);
    return new ArrayBuffer(0);
  }
}

export const stopAudioPlayback = () => {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch (e) {
      // Ignore errors if already stopped or invalid state
    }
    currentSource = null;
  }
};

/**
 * Play MP3 audio from base64 string (OpenAI TTS format)
 */
export const playAudioContent = async (base64Audio: string, volume: number = 1.0, onEnd?: () => void): Promise<void> => {
  console.log(`🔊 Playing audio - base64 length: ${base64Audio.length}, volume: ${volume}`);
  stopAudioPlayback(); // Stop any currently playing audio

  // Decode Base64 to ArrayBuffer
  const arrayBuffer = base64ToArrayBuffer(base64Audio);
  console.log(`🔊 Decoded to ArrayBuffer: ${arrayBuffer.byteLength} bytes`);
  if (arrayBuffer.byteLength === 0) {
    console.warn("❌ Empty audio data received");
    if (onEnd) onEnd();
    return;
  }

  const ctx = getAudioContext();
  console.log(`🔊 AudioContext state: ${ctx.state}`);

  // Ensure context is running
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (e) {
      console.warn("Context resume failed in playAudioContent", e);
    }
  }

  try {
    // Use browser's native MP3 decoder via decodeAudioData
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    console.log(`✅ MP3 decoded - duration: ${audioBuffer.duration.toFixed(2)}s, channels: ${audioBuffer.numberOfChannels}`);

    return new Promise((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = ctx.createGain();
      gainNode.gain.value = volume;

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      source.onended = () => {
        console.log(`✅ Audio playback ended`);
        currentSource = null;
        if (onEnd) onEnd();
        resolve();
      };

      currentSource = source;
      console.log(`🔊 Starting audio playback...`);
      source.start();
    });
  } catch (error) {
    console.error("❌ Error playing audio content:", error);
    if (onEnd) onEnd();
    return;
  }
};
