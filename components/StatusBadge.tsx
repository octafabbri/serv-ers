import React from 'react';
import { ServiceRequestStatus } from '../types';

interface StatusBadgeProps {
  status: ServiceRequestStatus;
}

const STATUS_CONFIG: Record<ServiceRequestStatus, { label: string; bg: string; color: string }> = {
  draft: { label: 'Draft', bg: 'rgba(142, 142, 147, 0.12)', color: '#8E8E93' },
  submitted: { label: 'New', bg: 'rgba(0, 122, 255, 0.12)', color: '#007AFF' },
  accepted: { label: 'Accepted', bg: 'rgba(52, 199, 89, 0.12)', color: '#34C759' },
  rejected: { label: 'Rejected', bg: 'rgba(255, 59, 48, 0.12)', color: '#FF3B30' },
  counter_proposed: { label: 'Counter', bg: 'rgba(255, 149, 0, 0.12)', color: '#FF9500' },
  counter_approved: { label: 'Confirmed', bg: 'rgba(52, 199, 89, 0.12)', color: '#34C759' },
  counter_rejected: { label: 'Declined', bg: 'rgba(255, 59, 48, 0.12)', color: '#FF3B30' },
  completed: { label: 'Completed', bg: 'rgba(88, 86, 214, 0.12)', color: '#5856D6' },
  cancelled: { label: 'Cancelled', bg: 'rgba(142, 142, 147, 0.12)', color: '#8E8E93' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: '600',
        letterSpacing: '-0.01em',
        background: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
};
