import { useState, useEffect, useCallback, useRef } from 'react';
import { ServiceRequest } from '../types';
import {
  isSupabaseConfigured,
  getServiceRequests,
  subscribeToMyRequests,
  subscribeToNotifications,
  getNotifications as getServerNotifications,
  markAllNotificationsRead,
} from '../services/supabaseService';

export interface Notification {
  id: string;
  type: 'counter_proposed' | 'accepted' | 'rejected';
  request: ServiceRequest;
  timestamp: string;
  serverNotificationId?: string;
}

export interface ToastAlert {
  id: string;
  eventType: string;
  requestId: string;
  message: string;
  timestamp: string;
}

const TOAST_DURATION_MS = 5000;

export function useNotifications(userId?: string | null, role?: 'fleet' | 'provider') {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeToast, setActiveToast] = useState<ToastAlert | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const showToast = useCallback((toast: ToastAlert) => {
    // Clear any existing timer
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setActiveToast(toast);
    toastTimerRef.current = setTimeout(() => {
      setActiveToast(null);
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!isSupabaseConfigured() || !userId) return;

    try {
      // Server notifications are RLS-filtered to auth.uid() — works for both roles
      let serverUnread = 0;
      try {
        const serverNotifs = await getServerNotifications(true);
        serverUnread = serverNotifs.length;
      } catch {
        // ignore — badge degrades gracefully
      }

      if (role === 'provider') {
        // Providers have no requests they created; rely entirely on server notifications
        setNotifications([]);
        setUnreadCount(serverUnread);
        return;
      }

      // Fleet: build rich notification list from requests created by this user
      const counterProposed = await getServiceRequests({ status: 'counter_proposed', createdBy: userId });
      const accepted = await getServiceRequests({ status: 'accepted', createdBy: userId });
      const rejected = await getServiceRequests({ status: 'rejected', createdBy: userId });

      const notifs: Notification[] = [
        ...counterProposed.map((r) => ({
          id: `cp-${r.id}`,
          type: 'counter_proposed' as const,
          request: r,
          timestamp: r.submitted_at || new Date().toISOString(),
        })),
        ...accepted.map((r) => ({
          id: `ac-${r.id}`,
          type: 'accepted' as const,
          request: r,
          timestamp: r.accepted_at || new Date().toISOString(),
        })),
        ...rejected.map((r) => ({
          id: `rj-${r.id}`,
          type: 'rejected' as const,
          request: r,
          timestamp: r.submitted_at || new Date().toISOString(),
        })),
      ];

      notifs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setNotifications(notifs);
      setUnreadCount(Math.max(counterProposed.length, serverUnread));
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [userId, role]);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    await fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    fetchNotifications();

    if (!isSupabaseConfigured() || !userId) return;

    // Fleet only: subscribe to status changes on requests they created
    const requestChannel = role !== 'provider'
      ? subscribeToMyRequests(userId, () => { fetchNotifications(); })
      : null;

    // Subscribe to server-side notifications (real-time inserts, filtered by recipient_id)
    const notifChannel = subscribeToNotifications(userId, (payload: unknown) => {
      // Extract notification row from realtime payload
      const record = (payload as { new?: Record<string, unknown> })?.new;

      // Guard: Supabase Realtime filters on RLS tables are not always enforced
      // server-side, so we must verify the notification is actually for this user
      // before refreshing counts or showing a toast.
      // Normalise to lowercase strings so UUID format differences don't break equality.
      const recordRecipient = record ? String(record.recipient_id ?? '').toLowerCase() : '';
      const currentUser = String(userId ?? '').toLowerCase();
      if (!recordRecipient || !currentUser || recordRecipient !== currentUser) return;

      fetchNotifications();

      if (typeof record === 'object') {
        const eventType = record.event_type as string;
        const requestId = record.request_id as string;
        const message = record.message as string;
        const id = record.id as string;

        showToast({
          id: id || Date.now().toString(),
          eventType,
          requestId,
          message: message || formatEventType(eventType),
          timestamp: new Date().toISOString(),
        });
      }
    });

    return () => {
      requestChannel?.unsubscribe();
      notifChannel?.unsubscribe();
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [fetchNotifications, showToast, userId]);

  return {
    notifications,
    unreadCount,
    refresh: fetchNotifications,
    markAllRead,
    activeToast,
    dismissToast,
  };
}

function formatEventType(eventType: string): string {
  switch (eventType) {
    case 'request_accepted': return 'Your request has been accepted';
    case 'request_declined': return 'Your request was declined';
    case 'counter_proposed': return 'A new time has been proposed';
    case 'counter_approved': return 'Your counter-proposal was approved';
    case 'counter_rejected': return 'Your counter-proposal was rejected';
    case 'request_completed': return 'A request has been completed';
    case 'request_cancelled': return 'A request has been cancelled';
    default: return 'You have a new notification';
  }
}
