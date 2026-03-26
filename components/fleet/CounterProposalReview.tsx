import React, { useState } from 'react';
import { ServiceRequest } from '../../types';
import { ArrowLeft, Clock, MessageSquare } from 'lucide-react';
import {
  approveProposedTime,
  rejectProposedTime,
} from '../../services/supabaseService';

function formatDisplayDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  }
  return dateStr;
}

interface CounterProposalReviewProps {
  request: ServiceRequest;
  isDark: boolean;
  onBack: () => void;
  onResolved: () => void;
  onProposeDifferentTime: (request: ServiceRequest) => void;
}

export const CounterProposalReview: React.FC<CounterProposalReviewProps> = ({
  request,
  isDark,
  onBack,
  onResolved,
  onProposeDifferentTime,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await approveProposedTime(request.id);
      onResolved();
    } catch (err) {
      console.error('Failed to approve proposed time:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await rejectProposedTime(request.id);
      onResolved();
    } catch (err) {
      console.error('Failed to reject proposed time:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '12px',
    border: `0.5px solid ${isDark ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.29)'}`,
    padding: '16px',
    marginBottom: '16px',
  };

  const lastEntry = request.proposal_history?.length
    ? request.proposal_history[request.proposal_history.length - 1]
    : null;

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
        paddingBottom: '160px',
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
          Proposed Time
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--label-secondary)', margin: 0 }}>
          {request.service_type === 'TIRE' ? 'Tire Service' : 'Mechanical Service'} — {request.fleet_name}
        </p>
      </div>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 16px' }}>
        {/* Original Schedule */}
        {request.scheduled_appointment && (
          <div style={{ ...cardStyle, background: isDark ? 'rgba(0, 122, 255, 0.08)' : 'rgba(0, 122, 255, 0.05)' }}>
            <div style={{ fontSize: '13px', color: 'var(--label-tertiary)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: '600' }}>
              Your Requested Schedule
            </div>
            <div style={{ fontSize: '17px', color: isDark ? 'var(--label-primary)' : '#000000', fontWeight: '500' }}>
              {formatDisplayDate(request.scheduled_appointment.scheduled_date)} at {request.scheduled_appointment.scheduled_time}
            </div>
          </div>
        )}

        {/* Current Proposed Time */}
        {request.proposed_date && (
          <div style={{ ...cardStyle, background: isDark ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Clock size={16} style={{ color: '#FF9500' }} />
              <span style={{ fontSize: '13px', color: 'var(--label-tertiary)', textTransform: 'uppercase', fontWeight: '600' }}>
                Provider&apos;s Proposed Time
              </span>
            </div>
            <div style={{ fontSize: '20px', color: isDark ? 'var(--label-primary)' : '#000000', fontWeight: '600' }}>
              {new Date(request.proposed_date).toLocaleString()}
            </div>
            {request.assigned_provider_name && (
              <div style={{ fontSize: '14px', color: 'var(--label-secondary)', marginTop: '4px' }}>
                From: {request.assigned_provider_name}
              </div>
            )}
            {lastEntry?.notes && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '8px' }}>
                <MessageSquare size={14} style={{ color: 'var(--label-tertiary)', marginTop: '2px' }} />
                <span style={{ fontSize: '14px', color: 'var(--label-secondary)', lineHeight: 1.4, fontStyle: 'italic' }}>
                  {lastEntry.notes}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Negotiation History */}
        {request.proposal_history && request.proposal_history.length > 1 && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Clock size={16} style={{ color: '#8E8E93' }} />
              <span style={{ fontSize: '15px', fontWeight: '600', color: isDark ? 'var(--label-primary)' : '#000000' }}>
                Negotiation History
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {request.proposal_history.map((entry, idx) => {
                const isFleet = entry.proposed_by === 'fleet_user';
                const borderColor = isFleet ? '#007AFF' : '#FF9500';
                return (
                  <div
                    key={idx}
                    style={{
                      borderLeft: `3px solid ${borderColor}`,
                      paddingLeft: '12px',
                      paddingTop: '4px',
                      paddingBottom: '4px',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: '500', color: isDark ? 'var(--label-primary)' : '#000000' }}>
                      {new Date(entry.proposed_date).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--label-tertiary)', marginTop: '2px' }}>
                      {isFleet ? 'Fleet' : 'Provider'} — {new Date(entry.proposed_at).toLocaleString()}
                    </div>
                    {entry.notes && (
                      <div style={{ fontSize: '13px', color: 'var(--label-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                        {entry.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
            gap: '10px',
            pointerEvents: 'auto',
          }}
        >
          {/* Reject */}
          <button
            onClick={handleReject}
            disabled={isProcessing}
            style={{
              flex: 1,
              padding: '14px',
              fontSize: '15px',
              fontWeight: '600',
              color: '#FF3B30',
              background: isDark ? 'rgba(255, 59, 48, 0.15)' : 'rgba(255, 59, 48, 0.1)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: 'none',
              borderRadius: '12px',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.5 : 1,
              transition: 'transform 0.1s ease',
            }}
            onMouseDown={(e) => { if (!isProcessing) e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            Reject
          </button>

          {/* Propose Different Time */}
          <button
            onClick={() => onProposeDifferentTime(request)}
            disabled={isProcessing}
            style={{
              flex: 1,
              padding: '14px',
              fontSize: '15px',
              fontWeight: '600',
              color: '#FF9500',
              background: isDark ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: 'none',
              borderRadius: '12px',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.5 : 1,
              transition: 'transform 0.1s ease',
            }}
            onMouseDown={(e) => { if (!isProcessing) e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            Counter
          </button>

          {/* Accept */}
          <button
            onClick={handleApprove}
            disabled={isProcessing}
            style={{
              flex: 1,
              padding: '14px',
              fontSize: '15px',
              fontWeight: '600',
              color: '#FFFFFF',
              background: isProcessing ? (isDark ? 'rgba(52, 199, 89, 0.3)' : 'rgba(52, 199, 89, 0.5)') : '#34C759',
              border: 'none',
              borderRadius: '12px',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'transform 0.1s ease',
              boxShadow: isProcessing ? 'none' : '0 4px 12px rgba(52, 199, 89, 0.3)',
            }}
            onMouseDown={(e) => { if (!isProcessing) e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};
