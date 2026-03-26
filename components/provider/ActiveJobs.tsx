import React, { useState, useEffect, useCallback } from 'react';
import { ServiceRequest } from '../../types';
import { WorkOrderCard } from './WorkOrderCard';
import { isSupabaseConfigured, getServiceRequests } from '../../services/supabaseService';

interface ActiveJobsProps {
  isDark: boolean;
  providerId: string;
  onSelectRequest: (request: ServiceRequest) => void;
}

export const ActiveJobs: React.FC<ActiveJobsProps> = ({ isDark, providerId, onSelectRequest }) => {
  const [jobs, setJobs] = useState<ServiceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    try {
      // Fetch accepted + counter_approved requests assigned to this provider
      const [accepted, counterApproved] = await Promise.all([
        getServiceRequests({ status: 'accepted' }),
        getServiceRequests({ status: 'counter_approved' }),
      ]);
      // Filter to only this provider's jobs
      const myJobs = [...accepted, ...counterApproved].filter(
        (r) => r.assigned_provider_id === providerId
      );
      // Sort by most recent first
      myJobs.sort((a, b) => {
        const aTime = a.accepted_at || a.submitted_at || '';
        const bTime = b.accepted_at || b.submitted_at || '';
        return bTime.localeCompare(aTime);
      });
      setJobs(myJobs);
    } catch (err) {
      console.error('Failed to fetch active jobs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

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
          Active Jobs
        </h1>
        <p
          style={{
            fontSize: '17px',
            color: 'var(--label-secondary)',
            margin: 0,
          }}
        >
          {jobs.length} job{jobs.length !== 1 ? 's' : ''} in progress
        </p>
      </div>

      {/* Job List */}
      <div
        style={{
          maxWidth: '640px',
          margin: '0 auto',
          padding: '0 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--label-tertiary)', fontSize: '15px' }}>
            Loading active jobs...
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--label-tertiary)', fontSize: '15px' }}>
            No active jobs. Accept work orders from the Dashboard to see them here.
          </div>
        ) : (
          jobs.map((job) => (
            <WorkOrderCard
              key={job.id}
              request={job}
              isDark={isDark}
              onSelect={onSelectRequest}
            />
          ))
        )}
      </div>
    </div>
  );
};
