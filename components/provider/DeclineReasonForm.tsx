import React, { useState } from 'react';
import { ServiceRequest } from '../../types';
import { ArrowLeft, MessageSquare } from 'lucide-react';

interface DeclineReasonFormProps {
  request: ServiceRequest;
  isDark: boolean;
  onBack: () => void;
  onSubmit: (reason: string) => void;
}

export const DeclineReasonForm: React.FC<DeclineReasonFormProps> = ({
  request,
  isDark,
  onBack,
  onSubmit,
}) => {
  const [reason, setReason] = useState('');

  const cardStyle: React.CSSProperties = {
    background: isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '12px',
    border: `0.5px solid ${isDark ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.29)'}`,
    padding: '16px',
    marginBottom: '16px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    fontSize: '17px',
    color: isDark ? 'var(--label-primary)' : '#000000',
    background: isDark ? '#1C1C1E' : '#FFFFFF',
    border: `0.5px solid ${isDark ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.29)'}`,
    borderRadius: '10px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  };

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
        paddingBottom: '140px',
      }}
    >
      {/* Back button */}
      <div style={{ padding: '0 24px', marginBottom: '16px' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '17px',
            color: 'var(--accent-blue)',
            padding: 0,
          }}
        >
          <ArrowLeft size={20} />
          Back
        </button>
      </div>

      {/* Header */}
      <div style={{ padding: '0 24px', marginBottom: '24px' }}>
        <h1
          style={{
            fontSize: '28px',
            fontWeight: '700',
            letterSpacing: '-0.02em',
            color: isDark ? 'var(--label-primary)' : '#000000',
            margin: 0,
            marginBottom: '8px',
          }}
        >
          Decline Work Order
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--label-secondary)', margin: 0 }}>
          {request.service_type} — {request.fleet_name}
        </p>
      </div>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 16px' }}>
        {/* Reason */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <MessageSquare size={14} style={{ color: 'var(--label-secondary)' }} />
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--label-secondary)', textTransform: 'uppercase' }}>
              Reason (Optional)
            </span>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Let the fleet manager know why you're declining..."
            rows={4}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Action Buttons — fixed at bottom */}
      <div
        style={{
          position: 'fixed',
          bottom: '84px',
          left: 0,
          right: 0,
          padding: '0 16px',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            maxWidth: '640px',
            margin: '0 auto',
            display: 'flex',
            gap: '12px',
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={onBack}
            style={{
              flex: 1,
              padding: '16px',
              fontSize: '17px',
              fontWeight: '600',
              color: isDark ? 'var(--label-primary)' : '#000000',
              background: isDark ? 'rgba(28, 28, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: `0.5px solid ${isDark ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.29)'}`,
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'transform 0.1s ease',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            Cancel
          </button>

          <button
            onClick={() => onSubmit(reason.trim())}
            style={{
              flex: 1,
              padding: '16px',
              fontSize: '17px',
              fontWeight: '600',
              color: '#FFFFFF',
              background: '#FF3B30',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'transform 0.1s ease',
              boxShadow: '0 4px 12px rgba(255, 59, 48, 0.3)',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
};
