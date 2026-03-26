import React, { useState, useEffect, useCallback } from 'react';
import { ServiceRequest, ServiceUrgency } from '../../types';
import { WorkOrderCard } from './WorkOrderCard';
import {
  isSupabaseConfigured,
  getServiceRequests,
  subscribeToServiceRequests,
} from '../../services/supabaseService';

interface ProviderDashboardProps {
  isDark: boolean;
  providerId?: string;
  onSelectRequest: (request: ServiceRequest) => void;
}

type UrgencyFilter = 'ALL' | ServiceUrgency;

export const ProviderDashboard: React.FC<ProviderDashboardProps> = ({ isDark, providerId, onSelectRequest }) => {
  const [incoming, setIncoming] = useState<ServiceRequest[]>([]);
  const [actionRequired, setActionRequired] = useState<ServiceRequest[]>([]);
  const [awaitingResponse, setAwaitingResponse] = useState<ServiceRequest[]>([]);
  const [filter, setFilter] = useState<UrgencyFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    try {
      const data = await getServiceRequests({ status: ['submitted', 'counter_proposed'] });

      // Incoming: submitted requests open to any provider
      const incomingReqs = data.filter((r) => r.status === 'submitted');

      // Counter-proposed requests assigned to this provider
      const myCounterProposed = data.filter(
        (r) => r.status === 'counter_proposed' && r.assigned_provider_id === providerId
      );

      // Use proposal_history to detect whose turn it is — works on same-device
      // testing and requires no secondary DB lookup.
      // Provider's turn = last proposal came from fleet ('fleet_user')
      // Provider waiting = last proposal came from provider ('service_provider')
      const lastProposedBy = (r: typeof myCounterProposed[0]) => {
        const h = r.proposal_history;
        return h && h.length > 0 ? h[h.length - 1].proposed_by : null;
      };

      // Action Required: fleet was last to propose → provider must respond
      const actionReqs = myCounterProposed.filter(
        (r) => lastProposedBy(r) === 'fleet_user'
      );

      // Awaiting Response: provider was last to propose → waiting for fleet
      const waitingReqs = myCounterProposed.filter(
        (r) => lastProposedBy(r) === 'service_provider'
      );

      setIncoming(incomingReqs);
      setActionRequired(actionReqs);
      setAwaitingResponse(waitingReqs);
    } catch (err) {
      console.error('Failed to fetch service requests:', err);
    } finally {
      setIsLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetchRequests();

    if (!isSupabaseConfigured()) return;

    const channel = subscribeToServiceRequests(() => {
      fetchRequests();
    });

    return () => {
      channel?.unsubscribe();
    };
  }, [fetchRequests]);

  const applyFilter = (reqs: ServiceRequest[]) =>
    filter === 'ALL' ? reqs : reqs.filter((r) => r.urgency === filter);

  const totalCount = incoming.length + actionRequired.length + awaitingResponse.length;

  const filters: { id: UrgencyFilter; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: ServiceUrgency.ERS, label: 'ERS' },
    { id: ServiceUrgency.DELAYED, label: 'Delayed' },
    { id: ServiceUrgency.SCHEDULED, label: 'Scheduled' },
  ];

  const sectionHeaderStyle = (color: string): React.CSSProperties => ({
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    color,
    margin: '0 0 10px 0',
    padding: '0 4px',
  });

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
          Dashboard
        </h1>
        <p style={{ fontSize: '17px', color: 'var(--label-secondary)', margin: 0 }}>
          {totalCount} work order{totalCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Urgency Filter Pills */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '0 24px',
          marginBottom: '20px',
          overflowX: 'auto',
        }}
      >
        {filters.map((f) => {
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '14px',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: isActive
                  ? 'var(--accent-blue)'
                  : isDark
                    ? 'rgba(28, 28, 30, 0.7)'
                    : 'rgba(255, 255, 255, 0.9)',
                color: isActive ? '#FFFFFF' : 'var(--label-secondary)',
                transition: 'background 0.2s ease, color 0.2s ease',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          maxWidth: '640px',
          margin: '0 auto',
          padding: '0 16px',
        }}
      >
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--label-tertiary)', fontSize: '15px' }}>
            Loading work orders...
          </div>
        ) : !isSupabaseConfigured() ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--label-tertiary)', fontSize: '15px' }}>
            Supabase is not configured.
          </div>
        ) : (
          <>
            {/* Action Required: fleet counter-proposed back, provider must respond */}
            {applyFilter(actionRequired).length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={sectionHeaderStyle('#FF9500')}>Action Required</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {applyFilter(actionRequired).map((request) => (
                    <WorkOrderCard
                      key={request.id}
                      request={request}
                      isDark={isDark}
                      onSelect={onSelectRequest}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Incoming: submitted, open for any provider to accept */}
            {applyFilter(incoming).length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={sectionHeaderStyle('#007AFF')}>Incoming Requests</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {applyFilter(incoming).map((request) => (
                    <WorkOrderCard
                      key={request.id}
                      request={request}
                      isDark={isDark}
                      onSelect={onSelectRequest}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Awaiting Response: provider proposed, waiting for fleet */}
            {applyFilter(awaitingResponse).length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={sectionHeaderStyle('#8E8E93')}>Awaiting Fleet Response</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {applyFilter(awaitingResponse).map((request) => (
                    <div key={request.id} style={{ position: 'relative' }}>
                      <WorkOrderCard
                        request={request}
                        isDark={isDark}
                        onSelect={onSelectRequest}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '10px',
                          left: '16px',
                          fontSize: '12px',
                          color: '#8E8E93',
                          fontWeight: '500',
                        }}
                      >
                        Waiting for acceptance
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {applyFilter(incoming).length === 0 &&
              applyFilter(actionRequired).length === 0 &&
              applyFilter(awaitingResponse).length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--label-tertiary)', fontSize: '15px' }}>
                {filter === 'ALL'
                  ? 'No incoming work orders right now.'
                  : `No ${filter} work orders right now.`}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
