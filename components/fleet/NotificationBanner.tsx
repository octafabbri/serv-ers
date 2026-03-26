import React from 'react';
import { Bell, X } from 'lucide-react';

interface NotificationBannerProps {
  count: number;
  isDark: boolean;
  onTap: () => void;
  onDismiss?: () => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({ count, isDark, onTap, onDismiss }) => {
  if (count === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '48px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        borderRadius: '999px',
        background: isDark ? 'rgba(255, 149, 0, 0.9)' : 'rgba(255, 149, 0, 0.95)',
        color: '#FFFFFF',
        zIndex: 90,
        boxShadow: '0 4px 16px rgba(255, 149, 0, 0.3)',
        overflow: 'hidden',
      }}
    >
      {/* Main tap area */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTap();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px 10px 20px',
          background: 'transparent',
          color: '#FFFFFF',
          fontSize: '14px',
          fontWeight: '600',
          border: 'none',
          cursor: 'pointer',
        }}
        onMouseDown={(e) => { e.currentTarget.style.opacity = '0.85'; }}
        onMouseUp={(e) => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
      >
        <Bell size={16} />
        {count} counter-proposal{count !== 1 ? 's' : ''} pending
      </button>

      {/* X dismiss button */}
      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 14px 10px 8px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.8)',
          }}
          onMouseDown={(e) => { e.currentTarget.style.color = '#FFFFFF'; }}
          onMouseUp={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
