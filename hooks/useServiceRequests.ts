import { useState, useEffect, useCallback } from 'react';
import { ServiceRequest } from '../types';
import { getCases } from '../services/apiService';

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function useServiceRequests(shipTo?: string | null) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!shipTo) {
      setIsLoading(false);
      return;
    }

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const cases = await getCases({
        shipTo,
        startDate: toDateString(startDate),
        endDate: toDateString(endDate),
        limit: 50,
      });

      // Map API list items to a minimal ServiceRequest shape for the history list
      const mapped = cases.map((c) => ({
        id: c.id,
        timestamp: new Date(c.created_at),
        status: apiStatusToLocal(c.caseStatus),
        ship_to: c.shipTo ?? shipTo,
        // Required fields with defaults — not available in the list response
        caller_type: 'DRIVER' as const,
        driver_name: '',
        contact_phone: '',
        fleet_name: '',
        unit_number: '',
        vin_number: '',
        service_type: 'TIRE' as ServiceRequest['service_type'],
        urgency: 'ERS' as ServiceRequest['urgency'],
        location: {},
        vehicle: { vehicle_type: 'TRUCK' as ServiceRequest['vehicle']['vehicle_type'] },
      } as ServiceRequest));

      setRequests(mapped);
    } catch (err) {
      console.error('Failed to fetch cases:', err);
    } finally {
      setIsLoading(false);
    }
  }, [shipTo]);

  useEffect(() => {
    fetchRequests();

    if (!shipTo) return;

    const interval = setInterval(fetchRequests, 60_000);
    return () => clearInterval(interval);
  }, [fetchRequests, shipTo]);

  return { requests, isLoading, refresh: fetchRequests };
}

function apiStatusToLocal(caseStatus: string): ServiceRequest['status'] {
  switch (caseStatus) {
    case 'NEW': return 'submitted';
    case 'DISPATCHED': return 'accepted';
    case 'COMPLETED': return 'completed';
    default: return 'submitted';
  }
}
