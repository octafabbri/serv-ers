import React from 'react';
import { ServiceRequest } from '../../types';
import { StatusBadge } from '../StatusBadge';
import { MapPin, Clock, Truck } from 'lucide-react';

function formatDisplayDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
  }
  return dateStr;
}

interface WorkOrderCardProps {
  request: ServiceRequest;
  isDark: boolean;
  onSelect: (request: ServiceRequest) => void;
}

const URGENCY_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  ERS: { bg: 'rgba(255, 59, 48, 0.12)', color: '#FF3B30', label: 'ERS' },
  DELAYED: { bg: 'rgba(255, 149, 0, 0.12)', color: '#FF9500', label: 'Delayed' },
  SCHEDULED: { bg: 'rgba(0, 122, 255, 0.12)', color: '#007AFF', label: 'Scheduled' },
};

export const WorkOrderCard: React.FC<WorkOrderCardProps> = ({ request, isDark, onSelect }) => {
  const urgency = URGENCY_COLORS[request.urgency] || URGENCY_COLORS.DELAYED;
  const timeAgo = getTimeAgo(request.submitted_at || request.created_at || new Date().toISOString());

  const serviceLabel = request.service_type === 'TIRE'
    ? `Tire — ${request.tire_info?.requested_service || 'Service'}`
    : `Mechanical — ${request.mechanical_info?.requested_service || 'Service'}`;

  return (
    <button
      onClick={() => onSelect(request)}
      style={{
        width: '100%',
        padding: '16px',
        background: isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '12px',
        border: `0.5px solid ${isDark ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.29)'}`,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'transform 0.1s ease',
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {/* Top row: urgency + status + time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <span
          style={{
            padding: '3px 8px',
            borderRadius: '5px',
            fontSize: '11px',
            fontWeight: '700',
            background: urgency.bg,
            color: urgency.color,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
        >
          {urgency.label}
        </span>
        <StatusBadge status={request.status} />
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '12px',
            color: 'var(--label-tertiary)',
          }}
        >
          {timeAgo}
        </span>
      </div>

      {/* Service type */}
      <div
        style={{
          fontSize: '17px',
          fontWeight: '600',
          color: isDark ? 'var(--label-primary)' : '#000000',
          marginBottom: '6px',
        }}
      >
        {serviceLabel}
      </div>

      {/* Fleet name */}
      <div
        style={{
          fontSize: '15px',
          color: 'var(--label-secondary)',
          marginBottom: '10px',
        }}
      >
        {request.fleet_name} — {request.driver_name}
      </div>

      {/* Bottom row: location + vehicle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {request.location?.current_location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={14} style={{ color: 'var(--label-tertiary)' }} />
            <span
              style={{
                fontSize: '13px',
                color: 'var(--label-tertiary)',
                maxWidth: '180px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {request.location.current_location}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Truck size={14} style={{ color: 'var(--label-tertiary)' }} />
          <span style={{ fontSize: '13px', color: 'var(--label-tertiary)' }}>
            {request.vehicle?.vehicle_type || 'Vehicle'}
          </span>
        </div>
        {request.urgency === 'SCHEDULED' && request.scheduled_appointment && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={14} style={{ color: 'var(--label-tertiary)' }} />
            <span style={{ fontSize: '13px', color: 'var(--label-tertiary)' }}>
              {formatDisplayDate(request.scheduled_appointment.scheduled_date)}
            </span>
          </div>
        )}
      </div>
    </button>
  );
};

function getTimeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMin = Math.floor((now - then) / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
