import { UserProfile, MoodEntry, UserRole } from '../types';
import { DEFAULT_USER_PROFILE, USER_PROFILE_STORAGE_KEY, USER_ROLE_STORAGE_KEY, DEVICE_ID_STORAGE_KEY } from '../constants';

export const loadUserProfile = (): UserProfile => {
  try {
    const serializedProfile = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (serializedProfile === null) {
      return { ...DEFAULT_USER_PROFILE, moodHistory: [], serviceRequests: [] };
    }
    const storedProfile = JSON.parse(serializedProfile);
    // Ensure moodHistory and serviceRequests are arrays and merge with defaults
    return {
        userName: storedProfile.userName,
        // Always force voice output on — it is not user-configurable
        voiceOutput: { ...DEFAULT_USER_PROFILE.voiceOutput, ...storedProfile.voiceOutput, enabled: true },
        voiceInput: { ...DEFAULT_USER_PROFILE.voiceInput, ...storedProfile.voiceInput },
        moodHistory: Array.isArray(storedProfile.moodHistory) ? storedProfile.moodHistory : [],
        serviceRequests: Array.isArray(storedProfile.serviceRequests) ? storedProfile.serviceRequests : [],
    };
  } catch (error) {
    console.error('Error loading user profile from localStorage:', error);
    return { ...DEFAULT_USER_PROFILE, moodHistory: [], serviceRequests: [] };
  }
};

export const saveUserProfile = (profile: UserProfile): void => {
  try {
    // Optionally, prune moodHistory if it gets too large
    // const MAX_MOOD_ENTRIES = 100;
    // if (profile.moodHistory.length > MAX_MOOD_ENTRIES) {
    //   profile.moodHistory = profile.moodHistory.slice(-MAX_MOOD_ENTRIES);
    // }
    const serializedProfile = JSON.stringify(profile);
    localStorage.setItem(USER_PROFILE_STORAGE_KEY, serializedProfile);
  } catch (error) {
    console.error('Error saving user profile to localStorage:', error);
  }
};

// ── Device ID ──

export const getDeviceId = (): string => {
  let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  }
  return deviceId;
};

// ── User Role ──

export const getUserRole = (): UserRole | null => {
  const role = localStorage.getItem(USER_ROLE_STORAGE_KEY);
  if (role === 'fleet' || role === 'provider') return role;
  return null;
};

export const setUserRole = (role: UserRole): void => {
  localStorage.setItem(USER_ROLE_STORAGE_KEY, role);
};

export const clearUserRole = (): void => {
  localStorage.removeItem(USER_ROLE_STORAGE_KEY);
};

// ── Mood History ──

export const addMoodEntry = (profile: UserProfile, entry: MoodEntry): UserProfile => {
  const updatedMoodHistory = [...(profile.moodHistory || []), entry];
  // Optional: Limit the number of stored entries
  // const MAX_ENTRIES = 30; 
  // if (updatedMoodHistory.length > MAX_ENTRIES) {
  //   updatedMoodHistory.splice(0, updatedMoodHistory.length - MAX_ENTRIES);
  // }
  return { ...profile, moodHistory: updatedMoodHistory };
};