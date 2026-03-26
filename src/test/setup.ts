import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock localStorage with proper implementation
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(storage).forEach(key => delete storage[key]);
  }),
};
global.localStorage = localStorageMock as any;

// Mock crypto.randomUUID
global.crypto = {
  randomUUID: () => Math.random().toString(36).substring(2, 15),
} as any;

// Mock Web Speech API
global.webkitSpeechRecognition = vi.fn(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as any;

// Mock Audio API
global.Audio = vi.fn(() => ({
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  load: vi.fn(),
})) as any;
