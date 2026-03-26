import { useState, useEffect, useCallback } from 'react';
import { ServiceRequest } from '../types';
import {
  isSupabaseConfigured,
  getServiceRequests,
  subscribeToMyRequests,
} from '../services/supabaseService';

export function useServiceRequests(userId?: string | null) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMyRequests = useCallback(async () => {
    if (!isSupabaseConfigured() || !userId) {
      setIsLoading(false);
      return;
    }

    try {
      const data = await getServiceRequests({ createdBy: userId });
      setRequests(data);
    } catch (err) {
      console.error('Failed to fetch service requests:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMyRequests();

    if (!isSupabaseConfigured() || !userId) return;

    const channel = subscribeToMyRequests(userId, () => {
      fetchMyRequests();
    });

    return () => {
      channel?.unsubscribe();
    };
  }, [fetchMyRequests, userId]);

  return { requests, isLoading, refresh: fetchMyRequests };
}
