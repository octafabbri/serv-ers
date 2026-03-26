import React from 'react';
import { ServiceRequest } from '../../types';
import { StatusBadge } from '../StatusBadge';

interface WorkOrderHistoryProps {
  requests: ServiceRequest[];
  isDark: boolean;
  isLoading: boolean;
  onSelectRequest: (request: ServiceRequest) => void;
}

export const WorkOrderHistory: React.FC<WorkOrderHistoryProps> = ({
  requests,
  isDark,
  isLoading,
  onSelectRequest,
}) => {
  return (
    <div
      style={{
        height: '100vh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: isDark
          ? 'linear-gradient(180deg, #000000 0%, #1C1C1E 100%)'
          : 'linear-gradient(180deg, #F2F2F7 0%, #FFFFFF 100%)',
        paddingTop: '60px',
        paddingBottom: '100px',
      }}
    >
      {/* Header */}
      <div style={{ padding: '0 24px', marginBottom: '24px' }}>
        <h1
          style={{
            fontSize: '34px',
            fontWeight: '700',
            letterSpacing: '-0.02em',
            color: isDark ? 'var(--label-primary)' : '#000000',
            margin: 0,
            marginBottom: '8px',
          }}
        >
          Work Orders
        </h1>
        <p style={{ fontSize: '17px', color: 'var(--label-secondary)', margin: 0 }}>
          {requests.length} request{requests.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* List */}
      <div
        style={{
          maxWidth: '640px',
          margin: '0 auto',
          padding: '0 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--label-tertiary)', fontSize: '15px' }}>
            Loading...
          </div>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--label-tertiary)', fontSize: '15px' }}>
            No work orders yet. Create a service request to get started.
          </div>
        ) : (
          requests.map((request) => (
            <button
              key={request.id}
              onClick={() => onSelectRequest(request)}
              style={{
                width: '100%',
                padding: '14px 16px',
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span
                  style={{
                    fontSize: '17px',
                    fontWeight: '600',
                    color: isDark ? 'var(--label-primary)' : '#000000',
                  }}
                >
                  {request.service_type === 'TIRE' ? 'Tire Service' : 'Mechanical Service'}
                </span>
                <StatusBadge status={request.status} />
              </div>
              <div style={{ fontSize: '14px', color: 'var(--label-secondary)' }}>
                {request.fleet_name} — {request.urgency}
                {request.location?.current_location && ` — ${request.location.current_location}`}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
