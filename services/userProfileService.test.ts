import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadUserProfile, saveUserProfile, addMoodEntry } from './userProfileService';
import { UserProfile, MoodEntry } from '../types';

describe('userProfileService', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('loadUserProfile', () => {
    it('should return default profile when localStorage is empty', () => {
      const profile = loadUserProfile();

      expect(profile).toBeDefined();
      expect(profile.userName).toBeUndefined();
      expect(profile.voiceOutput.enabled).toBe(true);
      expect(profile.voiceOutput.voiceURI).toBe('onyx');
      expect(profile.voiceInput.language).toBe('en-US');
      expect(profile.moodHistory).toEqual([]);
      expect(profile.serviceRequests).toEqual([]);
    });

    it('should load saved profile from localStorage', () => {
      const savedProfile: UserProfile = {
        userName: 'Test Driver',
        voiceOutput: {
          enabled: true,
          rate: 1.2,
          pitch: 1,
          volume: 0.8,
          voiceURI: 'nova',
        },
        voiceInput: {
          language: 'es-ES',
        },
        moodHistory: [],
        serviceRequests: [],
      };

      localStorage.setItem('heyBibUserProfile', JSON.stringify(savedProfile));

      const profile = loadUserProfile();

      expect(profile.userName).toBe('Test Driver');
      expect(profile.voiceOutput.voiceURI).toBe('nova');
      expect(profile.voiceInput.language).toBe('es-ES');
    });

    it('should handle corrupted localStorage data', () => {
      localStorage.setItem('heyBibUserProfile', 'invalid json');

      const profile = loadUserProfile();

      // Should return default profile instead of crashing
      expect(profile).toBeDefined();
      expect(profile.voiceOutput.voiceURI).toBe('onyx');
    });
  });

  describe('saveUserProfile', () => {
    it('should save profile to localStorage', () => {
      const profile: UserProfile = {
        userName: 'Test Driver',
        voiceOutput: {
          enabled: true,
          rate: 1,
          pitch: 1,
          volume: 1,
          voiceURI: 'shimmer',
        },
        voiceInput: {
          language: 'en-US',
        },
        moodHistory: [],
        serviceRequests: [],
      };

      saveUserProfile(profile);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'heyBibUserProfile',
        expect.stringContaining('shimmer')
      );
    });
  });

  describe('addMoodEntry', () => {
    it('should add a mood entry to the profile', () => {
      const profile: UserProfile = {
        voiceOutput: {
          enabled: true,
          rate: 1,
          pitch: 1,
          volume: 1,
          voiceURI: 'onyx',
        },
        voiceInput: {
          language: 'en-US',
        },
        moodHistory: [],
        serviceRequests: [],
      };

      const moodEntry: MoodEntry = {
        timestamp: new Date(),
        mood: 'happy',
        stressLevel: 3,
        energyLevel: 7,
      };

      const updatedProfile = addMoodEntry(profile, moodEntry);

      expect(updatedProfile.moodHistory).toHaveLength(1);
      expect(updatedProfile.moodHistory[0]).toBe(moodEntry);
      expect(profile.moodHistory).toHaveLength(0); // Original not mutated
    });

    it('should maintain chronological order of mood entries', () => {
      const profile: UserProfile = {
        voiceOutput: {
          enabled: true,
          rate: 1,
          pitch: 1,
          volume: 1,
          voiceURI: 'onyx',
        },
        voiceInput: {
          language: 'en-US',
        },
        moodHistory: [],
        serviceRequests: [],
      };

      const entry1: MoodEntry = {
        timestamp: new Date('2024-01-01'),
        mood: 'happy',
        stressLevel: 3,
        energyLevel: 7,
      };

      const entry2: MoodEntry = {
        timestamp: new Date('2024-01-02'),
        mood: 'calm',
        stressLevel: 2,
        energyLevel: 5,
      };

      let updatedProfile = addMoodEntry(profile, entry1);
      updatedProfile = addMoodEntry(updatedProfile, entry2);

      expect(updatedProfile.moodHistory).toHaveLength(2);
      expect(updatedProfile.moodHistory[0]).toBe(entry1);
      expect(updatedProfile.moodHistory[1]).toBe(entry2);
    });
  });
});
