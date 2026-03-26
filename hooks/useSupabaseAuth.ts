import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured, signInAnonymously, getSessionUserId, registerUser, SupabaseUser } from '../services/supabaseService';
import { getDeviceId, getUserRole } from '../services/userProfileService';
import { UserRole } from '../types';

interface UseSupabaseAuthReturn {
  userId: string | null;
  user: SupabaseUser | null;
  isLoading: boolean;
  isConfigured: boolean;
  error: string | null;
  register: (role: UserRole, name: string, companyName?: string, contactPhone?: string) => Promise<SupabaseUser | null>;
}

export const useSupabaseAuth = (): UseSupabaseAuthReturn => {
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = isSupabaseConfigured();

  useEffect(() => {
    if (!isConfigured) {
      setIsLoading(false);
      return;
    }

    const init = async () => {
      try {
        // Check for existing session
        let id = await getSessionUserId();

        // If no session, sign in anonymously
        if (!id) {
          id = await signInAnonymously();
        }

        setUserId(id);

        // Auto-register in users table if a role is stored but no user row exists yet.
        // RLS policies rely on get_user_role() which queries the users table —
        // without a row, all RLS checks fail.
        if (id) {
          const storedRole = getUserRole();
          if (storedRole) {
            const deviceId = getDeviceId();
            const registered = await registerUser(deviceId, storedRole, '');
            if (registered) {
              setUser(registered);
            }
          }
        }
      } catch (err) {
        console.error('Supabase auth init failed:', err);
        setError('Failed to initialize authentication');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [isConfigured]);

  const register = useCallback(async (
    role: UserRole,
    name: string,
    companyName?: string,
    contactPhone?: string
  ): Promise<SupabaseUser | null> => {
    if (!isConfigured) return null;

    const deviceId = getDeviceId();
    const registered = await registerUser(deviceId, role, name, companyName, contactPhone);
    if (registered) {
      setUser(registered);
    }
    return registered;
  }, [isConfigured]);

  return { userId, user, isLoading, isConfigured, error, register };
};
