import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle, XCircle, Clock, X } from 'lucide-react';
import { ToastAlert } from '../hooks/useNotifications';

interface NotificationToastProps {
  toast: ToastAlert;
  isDark: boolean;
  onDismiss: () => void;
  onTap?: () => void;
}

const EVENT_CONFIG: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  request_accepted: { icon: CheckCircle, color: '#34C759', label: 'Accepted' },
  request_declined: { icon: XCircle, color: '#FF3B30', label: 'Declined' },
  counter_proposed: { icon: Clock, color: '#FF9500', label: 'New Time Proposed' },
  counter_approved: { icon: CheckCircle, color: '#34C759', label: 'Proposal Approved' },
  counter_rejected: { icon: XCircle, color: '#FF3B30', label: 'Proposal Rejected' },
  request_completed: { icon: CheckCircle, color: '#34C759', label: 'Completed' },
  request_cancelled: { icon: XCircle, color: '#8E8E93', label: 'Cancelled' },
};

export const NotificationToast: React.FC<NotificationToastProps> = ({
  toast,
  isDark,
  onDismiss,
  onTap,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // Slide in on mount
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const config = EVENT_CONFIG[toast.eventType] || {
    icon: Bell,
    color: '#007AFF',
    label: 'Notification',
  };
  const Icon = config.icon;

  return (
    <div
      onClick={() => {
        onTap?.();
        onDismiss();
      }}
      style={{
        position: 'fixed',
        top: isVisible ? '12px' : '-100px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 24px)',
        maxWidth: '420px',
        zIndex: 300,
        transition: 'top 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: onTap ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '14px 16px',
          borderRadius: '16px',
          background: isDark
            ? 'rgba(44, 44, 46, 0.95)'
            : 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: isDark
            ? '0 8px 32px rgba(0, 0, 0, 0.5)'
            : '0 8px 32px rgba(0, 0, 0, 0.12)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: `${config.color}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={20} style={{ color: config.color }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: '600',
              color: config.color,
              marginBottom: '2px',
            }}
          >
            {config.label}
          </div>
          <div
            style={{
              fontSize: '14px',
              color: isDark ? 'rgba(235,235,245,0.85)' : 'rgba(0,0,0,0.85)',
              lineHeight: '1.3',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {toast.message}
          </div>
        </div>

        {/* Dismiss button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: '4px',
            cursor: 'pointer',
            color: isDark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)',
            flexShrink: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
