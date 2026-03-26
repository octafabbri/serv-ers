import React, { useEffect } from 'react';
import { ServiceRequest } from '../../types';
import { StatusBadge } from '../StatusBadge';
import { X, MapPin, Phone, Truck, Clock, Wrench } from 'lucide-react';

interface RequestDetailModalProps {
  request: ServiceRequest;
  isDark: boolean;
  onClose: () => void;
  onReviewCounterProposal?: () => void;
}

function formatDisplayDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  }
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  return dateStr;
}

export const RequestDetailModal: React.FC<RequestDetailModalProps> = ({ request, isDark, onClose, onReviewCounterProposal }) => {
  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const cardStyle: React.CSSProperties = {
    background: isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '12px',
    border: `0.5px solid ${isDark ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.29)'}`,
    padding: '16px',
    marginBottom: '16px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '13px',
    color: 'var(--label-tertiary)',
    marginBottom: '4px',
  };

  const valueStyle: React.CSSProperties = {
    fontSize: '17px',
    color: isDark ? 'var(--label-primary)' : '#000000',
    fontWeight: '500',
  };

  const isScheduled = request.urgency === 'SCHEDULED';

  return (
    <>
      {/* Backdrop — fixed, does not scroll */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Scroll container — full viewport, scrolls independently */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 201,
          overflowY: 'scroll',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Top spacer — tap to close, pushes sheet down */}
        <div style={{ height: '10vh' }} />

        {/* Modal sheet */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '640px',
            margin: '0 auto',
            background: isDark
              ? 'linear-gradient(180deg, #1C1C1E 0%, #2C2C2E 100%)'
              : 'linear-gradient(180deg, #F2F2F7 0%, #FFFFFF 100%)',
            borderRadius: '20px',
            paddingTop: '16px',
            paddingBottom: 'max(env(safe-area-inset-bottom, 32px), 32px)',
          }}
        >
          {/* Drag indicator */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '5px',
                borderRadius: '2.5px',
                background: isDark ? 'rgba(235, 235, 245, 0.3)' : 'rgba(60, 60, 67, 0.3)',
              }}
            />
          </div>

          {/* Close button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px', marginBottom: '8px' }}>
            <button
              onClick={onClose}
              style={{
                background: isDark ? 'rgba(120, 120, 128, 0.24)' : 'rgba(120, 120, 128, 0.16)',
                border: 'none',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={16} style={{ color: isDark ? 'rgba(235, 235, 245, 0.6)' : 'rgba(60, 60, 67, 0.6)' }} />
            </button>
          </div>

          {/* Header */}
          <div style={{ padding: '0 24px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <h2
                style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  letterSpacing: '-0.02em',
                  color: isDark ? 'var(--label-primary)' : '#000000',
                  margin: 0,
                }}
              >
                Work Order
              </h2>
              <StatusBadge status={request.status} />
            </div>
            <p style={{ fontSize: '13px', color: 'var(--label-tertiary)', margin: 0 }}>
              ID: {request.id.slice(0, 8)}
              {request.submitted_at && ` — ${formatDisplayDate(request.submitted_at)}`}
            </p>
          </div>

          {/* Counter-Proposal Action Banner */}
          {request.status === 'counter_proposed' && onReviewCounterProposal && (
            <div style={{ padding: '0 16px', marginBottom: '8px' }}>
              <button
                onClick={onReviewCounterProposal}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: isDark ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                  border: `1px solid rgba(255, 149, 0, 0.4)`,
                  borderRadius: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: '15px', fontWeight: '600', color: '#FF9500' }}>
                  Counter-proposal received — tap to review
                </span>
                <span style={{ fontSize: '20px', color: '#FF9500' }}>›</span>
              </button>
            </div>
          )}

          <div style={{ padding: '0 16px' }}>
            {/* Contact Info */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Phone size={16} style={{ color: 'var(--accent-blue)' }} />
                <span style={{ fontSize: '15px', fontWeight: '600', color: isDark ? 'var(--label-primary)' : '#000000' }}>
                  Contact
                </span>
              </div>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <div style={labelStyle}>Driver</div>
                  <div style={valueStyle}>{request.driver_name}</div>
                </div>
                <div>
                  <div style={labelStyle}>Phone</div>
                  <div style={valueStyle}>{request.contact_phone}</div>
                </div>
                <div>
                  <div style={labelStyle}>Fleet</div>
                  <div style={valueStyle}>{request.fleet_name}</div>
                </div>
              </div>
            </div>

            {/* Service Info */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Wrench size={16} style={{ color: '#FF9500' }} />
                <span style={{ fontSize: '15px', fontWeight: '600', color: isDark ? 'var(--label-primary)' : '#000000' }}>
                  Service Details
                </span>
              </div>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <div style={labelStyle}>Service Type</div>
                  <div style={valueStyle}>{request.service_type}</div>
                </div>
                <div>
                  <div style={labelStyle}>Urgency</div>
                  <div style={valueStyle}>{request.urgency}</div>
                </div>

                {request.service_type === 'TIRE' && request.tire_info && (
                  <>
                    <div>
                      <div style={labelStyle}>Service</div>
                      <div style={valueStyle}>{request.tire_info.requested_service}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>Tire</div>
                      <div style={valueStyle}>{request.tire_info.requested_tire}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>Quantity</div>
                      <div style={valueStyle}>{request.tire_info.number_of_tires}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>Position</div>
                      <div style={valueStyle}>{request.tire_info.tire_position}</div>
                    </div>
                  </>
                )}

                {request.service_type === 'MECHANICAL' && request.mechanical_info && (
                  <>
                    <div>
                      <div style={labelStyle}>Service</div>
                      <div style={valueStyle}>{request.mechanical_info.requested_service}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>Description</div>
                      <div style={valueStyle}>{request.mechanical_info.description}</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Location & Vehicle */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <MapPin size={16} style={{ color: '#34C759' }} />
                <span style={{ fontSize: '15px', fontWeight: '600', color: isDark ? 'var(--label-primary)' : '#000000' }}>
                  Location & Vehicle
                </span>
              </div>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <div style={labelStyle}>Location</div>
                  <div style={valueStyle}>{request.location?.current_location || 'Not provided'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Truck size={14} style={{ color: 'var(--label-tertiary)' }} />
                  <span style={{ ...valueStyle, fontSize: '15px' }}>
                    {request.vehicle?.vehicle_type || 'Not specified'}
                  </span>
                </div>
              </div>
            </div>

            {/* Schedule */}
            {isScheduled && request.scheduled_appointment && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Clock size={16} style={{ color: '#007AFF' }} />
                  <span style={{ fontSize: '15px', fontWeight: '600', color: isDark ? 'var(--label-primary)' : '#000000' }}>
                    Schedule
                  </span>
                </div>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <div style={labelStyle}>Date</div>
                    <div style={valueStyle}>{formatDisplayDate(request.scheduled_appointment.scheduled_date)}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>Time</div>
                    <div style={valueStyle}>{request.scheduled_appointment.scheduled_time}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Provider info */}
            {request.assigned_provider_name && (
              <div style={cardStyle}>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <div style={labelStyle}>Assigned Provider</div>
                    <div style={valueStyle}>{request.assigned_provider_name}</div>
                  </div>
                  {request.accepted_at && (
                    <div>
                      <div style={labelStyle}>Accepted</div>
                      <div style={valueStyle}>{formatDisplayDate(request.accepted_at)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
