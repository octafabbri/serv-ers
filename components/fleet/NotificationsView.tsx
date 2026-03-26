import React from 'react';
import { ServiceRequest } from '../../types';
import { Notification } from '../../hooks/useNotifications';
import { StatusBadge } from '../StatusBadge';
import { ChevronRight } from 'lucide-react';

interface NotificationsViewProps {
  notifications: Notification[];
  requests: ServiceRequest[];
  isDark: boolean;
  isLoading: boolean;
  onReviewCounterProposal: (request: ServiceRequest) => void;
  onViewDetail: (request: ServiceRequest) => void;
}

const URGENCY_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  ERS: { bg: 'rgba(255, 59, 48, 0.12)', color: '#FF3B30', label: 'ERS' },
  DELAYED: { bg: 'rgba(255, 149, 0, 0.12)', color: '#FF9500', label: 'Delayed' },
  SCHEDULED: { bg: 'rgba(0, 122, 255, 0.12)', color: '#007AFF', label: 'Scheduled' },
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

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatScheduledDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts.map(Number);
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Turn detection using proposal_history — works on same-device testing and
// requires no secondary DB lookup. The SQL RPC always appends an entry with
// proposed_by: 'fleet_user' | 'service_provider' on every propose_new_time call.
function lastProposedBy(request: ServiceRequest): 'fleet_user' | 'service_provider' | null {
  const history = request.proposal_history;
  if (!history || history.length === 0) return null;
  return history[history.length - 1].proposed_by;
}

function isFleetTurn(request: ServiceRequest): boolean {
  if (request.status !== 'counter_proposed') return false;
  const by = lastProposedBy(request);
  // Fleet's turn when the last proposal came from the provider
  return by === 'service_provider';
}

function isFleetWaiting(request: ServiceRequest): boolean {
  if (request.status !== 'counter_proposed') return false;
  const by = lastProposedBy(request);
  // Fleet is waiting when the last proposal came from the fleet (awaiting provider)
  return by === 'fleet_user';
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  requests,
  isDark,
  isLoading,
  onReviewCounterProposal,
  onViewDetail,
}) => {
  // Only show counter-proposals as "Action Required" when it's actually the fleet's turn
  const counterProposed = notifications.filter(
    (n) => n.type === 'counter_proposed' && isFleetTurn(n.request)
  );
  const accepted = notifications.filter((n) => n.type === 'accepted');
  const rejected = notifications.filter((n) => n.type === 'rejected');

  const cardStyle: React.CSSProperties = {
    background: isDark ? 'rgba(28, 28, 30, 0.7)' : 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '12px',
    border: `0.5px solid ${isDark ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.29)'}`,
    padding: '14px 16px',
    marginBottom: '10px',
  };

  const sectionHeaderStyle = (color: string): React.CSSProperties => ({
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    color,
    margin: '0 0 10px 0',
    padding: '0 4px',
  });

  const renderUrgencyPill = (urgency: string) => {
    const u = URGENCY_COLORS[urgency] || URGENCY_COLORS.DELAYED;
    return (
      <span
        style={{
          fontSize: '11px',
          fontWeight: '600',
          color: u.color,
          background: u.bg,
          padding: '2px 8px',
          borderRadius: '6px',
        }}
      >
        {u.label}
      </span>
    );
  };

  const renderNotificationCard = (
    notif: Notification,
    accentColor: string,
    detail: React.ReactNode,
    onTap?: () => void,
  ) => {
    const req = notif.request;
    const serviceLabel = req.service_type === 'TIRE' ? 'Tire Service' : 'Mechanical Service';
    const timeAgo = getTimeAgo(notif.timestamp);
    const submittedDate = req.submitted_at ? formatDate(req.submitted_at) : null;
    const scheduledDate = req.urgency === 'SCHEDULED' && req.scheduled_appointment?.scheduled_date
      ? formatScheduledDate(req.scheduled_appointment.scheduled_date)
      : null;

    const content = (
      <div style={{ position: 'relative', paddingLeft: '12px' }}>
        {/* Accent bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '4px',
            borderRadius: '2px',
            background: accentColor,
          }}
        />

        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '15px', fontWeight: '600', color: isDark ? 'var(--label-primary)' : '#000000' }}>
            {serviceLabel}
          </span>
          {renderUrgencyPill(req.urgency)}
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--label-tertiary)' }}>
            {timeAgo}
          </span>
        </div>

        {/* Fleet / driver */}
        <div style={{ fontSize: '14px', color: 'var(--label-secondary)', marginBottom: '4px' }}>
          {req.fleet_name} — {req.driver_name}
        </div>

        {/* Date info */}
        <div style={{ fontSize: '12px', color: 'var(--label-tertiary)', marginBottom: '6px', display: 'flex', gap: '12px' }}>
          {submittedDate && <span>Submitted {submittedDate}</span>}
          {scheduledDate && <span>Scheduled {scheduledDate}</span>}
        </div>

        {/* Detail line */}
        {detail}
      </div>
    );

    return (
      <button
        key={notif.id}
        onClick={onTap || (() => onViewDetail(req))}
        style={{ ...cardStyle, width: '100%', textAlign: 'left', cursor: 'pointer', transition: 'transform 0.1s ease' }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {content}
      </button>
    );
  };

  const hasNotifications = notifications.length > 0;

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
          Alerts
        </h1>
        <p style={{ fontSize: '17px', color: 'var(--label-secondary)', margin: 0 }}>
          {isLoading
            ? 'Loading...'
            : hasNotifications
              ? `${notifications.length} update${notifications.length !== 1 ? 's' : ''}`
              : 'No new updates'}
        </p>
      </div>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 16px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--label-tertiary)', fontSize: '15px' }}>
            Loading...
          </div>
        ) : (
          <>
            {/* Counter-Proposals — Action Required */}
            {counterProposed.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={sectionHeaderStyle('#FF9500')}>Action Required</h2>
                {counterProposed.map((notif) =>
                  renderNotificationCard(
                    notif,
                    '#FF9500',
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '14px', color: '#FF9500', fontWeight: '500' }}>
                        Counter-proposal from {notif.request.assigned_provider_name || 'provider'}
                      </span>
                      <ChevronRight size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                    </div>,
                    () => onReviewCounterProposal(notif.request),
                  )
                )}
              </div>
            )}

            {/* Accepted */}
            {accepted.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={sectionHeaderStyle('#34C759')}>Accepted</h2>
                {accepted.map((notif) =>
                  renderNotificationCard(
                    notif,
                    '#34C759',
                    <span style={{ fontSize: '14px', color: '#34C759', fontWeight: '500' }}>
                      Accepted by {notif.request.assigned_provider_name || 'a provider'}
                    </span>,
                  )
                )}
              </div>
            )}

            {/* Rejected */}
            {rejected.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={sectionHeaderStyle('#FF3B30')}>Declined</h2>
                {rejected.map((notif) =>
                  renderNotificationCard(
                    notif,
                    '#FF3B30',
                    <span style={{ fontSize: '14px', color: '#FF3B30', fontWeight: '500' }}>
                      Declined by provider
                    </span>,
                  )
                )}
              </div>
            )}

            {/* All Work Orders */}
            <div style={{ marginBottom: '24px' }}>
              <h2 style={sectionHeaderStyle(isDark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)')}>
                All Work Orders
              </h2>
              {requests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--label-tertiary)', fontSize: '15px' }}>
                  No work orders yet. Create a service request to get started.
                </div>
              ) : (
                requests.map((request) => {
                  const reqSubmittedDate = request.submitted_at ? formatDate(request.submitted_at) : null;
                  const reqScheduledDate = request.urgency === 'SCHEDULED' && request.scheduled_appointment?.scheduled_date
                    ? formatScheduledDate(request.scheduled_appointment.scheduled_date)
                    : null;
                  const fleetTurn = isFleetTurn(request);
                  const fleetWaiting = isFleetWaiting(request);

                  return (
                    <button
                      key={request.id}
                      onClick={() => {
                        if (fleetTurn) {
                          onReviewCounterProposal(request);
                        } else {
                          onViewDetail(request);
                        }
                      }}
                      style={{
                        ...cardStyle,
                        width: '100%',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'transform 0.1s ease',
                      }}
                      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '17px', fontWeight: '600', color: isDark ? 'var(--label-primary)' : '#000000' }}>
                          {request.service_type === 'TIRE' ? 'Tire Service' : 'Mechanical Service'}
                        </span>
                        <StatusBadge status={request.status} />
                      </div>
                      <div style={{ fontSize: '14px', color: 'var(--label-secondary)', marginBottom: '4px' }}>
                        {request.fleet_name} — {request.urgency}
                        {request.location?.current_location && ` — ${request.location.current_location}`}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--label-tertiary)', display: 'flex', gap: '12px' }}>
                        {reqSubmittedDate && <span>Submitted {reqSubmittedDate}</span>}
                        {reqScheduledDate && <span>Scheduled {reqScheduledDate}</span>}
                      </div>
                      {fleetWaiting && (
                        <div style={{ fontSize: '12px', color: '#FF9500', fontWeight: '500', marginTop: '4px' }}>
                          Awaiting provider response
                        </div>
                      )}
                      {fleetTurn && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                          <span style={{ fontSize: '12px', color: '#FF9500', fontWeight: '500' }}>
                            Counter-proposal — tap to review
                          </span>
                          <ChevronRight size={14} style={{ color: '#FF9500', flexShrink: 0 }} />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Empty state when no notifications AND no requests */}
            {!hasNotifications && requests.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--label-tertiary)', fontSize: '15px' }}>
                No notifications yet. Submit a service request to get started.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
