import { describe, it, expect } from 'vitest';
import {
  createServiceRequest,
  validateServiceRequest,
  addServiceRequest,
  updateServiceRequest,
} from './serviceRequestService';
import { ServiceRequest, UserProfile, ServiceType, ServiceUrgency, VehicleType, TireServiceType } from '../types';

describe('serviceRequestService', () => {
  describe('createServiceRequest', () => {
    it('should create a new service request with draft status', () => {
      const request = createServiceRequest();

      expect(request).toBeDefined();
      expect(request.id).toBeDefined();
      expect(request.status).toBe('draft');
      expect(request.timestamp).toBeInstanceOf(Date);
    });

    it('should create unique IDs for each request', () => {
      const request1 = createServiceRequest();
      const request2 = createServiceRequest();

      expect(request1.id).not.toBe(request2.id);
    });
  });

  describe('validateServiceRequest', () => {
    const createValidTireRequest = (): ServiceRequest => ({
      id: '123',
      timestamp: new Date(),
      driver_name: 'John Doe',
      contact_phone: '555-1234',
      fleet_name: 'ABC Trucking',
      service_type: ServiceType.TIRE,
      urgency: ServiceUrgency.ERS,
      location: {
        current_location: 'I-80 Mile 145',
      },
      vehicle: {
        vehicle_type: VehicleType.TRUCK,
      },
      tire_info: {
        requested_service: TireServiceType.REPLACE,
        requested_tire: '295/75R22.5',
        number_of_tires: 1,
        tire_position: 'left front steer',
      },
      status: 'draft',
    });

    const createValidMechanicalRequest = (): ServiceRequest => ({
      id: '456',
      timestamp: new Date(),
      driver_name: 'Jane Smith',
      contact_phone: '555-5678',
      fleet_name: 'XYZ Logistics',
      service_type: ServiceType.MECHANICAL,
      urgency: ServiceUrgency.ERS,
      location: {
        current_location: 'I-95 Exit 42',
      },
      vehicle: {
        vehicle_type: VehicleType.TRUCK,
      },
      mechanical_info: {
        requested_service: 'engine repair',
        description: 'Engine overheating, coolant leak',
      },
      status: 'draft',
    });

    // ── Base field validation ──

    it('should validate a complete TIRE service request', () => {
      const request = createValidTireRequest();
      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('should validate a complete MECHANICAL service request', () => {
      const request = createValidMechanicalRequest();
      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('should detect missing driver name', () => {
      const request = createValidTireRequest();
      request.driver_name = '';

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain('driver_name');
    });

    it('should detect missing phone number', () => {
      const request = createValidTireRequest();
      request.contact_phone = '';

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain('contact_phone');
    });

    it('should detect missing fleet name', () => {
      const request = createValidTireRequest();
      request.fleet_name = '';

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain('fleet_name');
    });

    it('should detect missing vehicle type', () => {
      const request = createValidTireRequest();
      request.vehicle = {} as any;

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain('vehicle.vehicle_type');
    });

    // ── TIRE-specific validation ──

    it('should detect missing tire_info when service_type is TIRE', () => {
      const request = createValidTireRequest();
      delete request.tire_info;

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain('tire_info');
    });

    it('should detect missing tire fields individually', () => {
      const request = createValidTireRequest();
      request.tire_info = {
        requested_service: '' as TireServiceType,
        requested_tire: '',
        number_of_tires: 0,
        tire_position: '',
      };

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain('tire_info.requested_service');
      expect(result.missingFields).toContain('tire_info.requested_tire');
      expect(result.missingFields).toContain('tire_info.number_of_tires');
      expect(result.missingFields).toContain('tire_info.tire_position');
    });

    // ── MECHANICAL-specific validation ──

    it('should detect missing mechanical_info when service_type is MECHANICAL', () => {
      const request = createValidMechanicalRequest();
      delete request.mechanical_info;

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain('mechanical_info');
    });

    it('should detect missing mechanical fields individually', () => {
      const request = createValidMechanicalRequest();
      request.mechanical_info = {
        requested_service: '',
        description: '',
      };

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain('mechanical_info.requested_service');
      expect(result.missingFields).toContain('mechanical_info.description');
    });

    // ── SCHEDULED urgency validation ──

    it('should require scheduled appointment details for SCHEDULED urgency', () => {
      const request = createValidTireRequest();
      request.urgency = ServiceUrgency.SCHEDULED;

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain('scheduled_appointment');
    });

    it('should validate TIRE + SCHEDULED with appointment', () => {
      const request = createValidTireRequest();
      request.urgency = ServiceUrgency.SCHEDULED;
      request.scheduled_appointment = {
        scheduled_date: '2025-02-15',
        scheduled_time: '10:00 AM',
      };

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('should validate MECHANICAL + SCHEDULED with appointment', () => {
      const request = createValidMechanicalRequest();
      request.urgency = ServiceUrgency.SCHEDULED;
      request.scheduled_appointment = {
        scheduled_date: 'Next Wednesday',
        scheduled_time: '2:00 PM',
      };

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    // ── Cross-combination validation ──

    it('should validate TIRE + DELAYED (no appointment needed)', () => {
      const request = createValidTireRequest();
      request.urgency = ServiceUrgency.DELAYED;

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('should validate MECHANICAL + DELAYED (no appointment needed)', () => {
      const request = createValidMechanicalRequest();
      request.urgency = ServiceUrgency.DELAYED;

      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('should not require tire_info for MECHANICAL requests', () => {
      const request = createValidMechanicalRequest();
      // No tire_info set — should still be valid
      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(true);
      expect(result.missingFields).not.toContain('tire_info');
    });

    it('should not require mechanical_info for TIRE requests', () => {
      const request = createValidTireRequest();
      // No mechanical_info set — should still be valid
      const result = validateServiceRequest(request);

      expect(result.isComplete).toBe(true);
      expect(result.missingFields).not.toContain('mechanical_info');
    });
  });

  describe('addServiceRequest', () => {
    it('should add a service request to user profile', () => {
      const profile: UserProfile = {
        userName: 'Test User',
        voiceOutput: {
          enabled: true,
          rate: 1,
          pitch: 1,
          volume: 1,
          voiceURI: 'onyx',
        },
        voiceInput: {
          language: 'en-US',
        },
        moodHistory: [],
        serviceRequests: [],
      };

      const request = createServiceRequest();
      request.driver_name = 'John Doe';
      request.status = 'submitted';

      const updatedProfile = addServiceRequest(profile, request);

      expect(updatedProfile.serviceRequests).toHaveLength(1);
      expect(updatedProfile.serviceRequests[0]).toBe(request);
      expect(profile.serviceRequests).toHaveLength(0); // Original not mutated
    });
  });

  describe('updateServiceRequest', () => {
    it('should update an existing service request', () => {
      const profile: UserProfile = {
        userName: 'Test User',
        voiceOutput: {
          enabled: true,
          rate: 1,
          pitch: 1,
          volume: 1,
          voiceURI: 'onyx',
        },
        voiceInput: {
          language: 'en-US',
        },
        moodHistory: [],
        serviceRequests: [
          {
            id: '123',
            timestamp: new Date(),
            driver_name: 'John Doe',
            contact_phone: '555-1234',
            fleet_name: 'ABC Trucking',
            service_type: ServiceType.TIRE,
            urgency: ServiceUrgency.ERS,
            location: {
              current_location: 'I-80 Mile 145',
            },
            vehicle: {
              vehicle_type: VehicleType.TRUCK,
            },
            status: 'draft',
          },
        ],
      };

      const updatedProfile = updateServiceRequest(profile, '123', {
        status: 'submitted',
        contact_phone: '555-5678',
      });

      expect(updatedProfile.serviceRequests[0].status).toBe('submitted');
      expect(updatedProfile.serviceRequests[0].contact_phone).toBe('555-5678');
      expect(updatedProfile.serviceRequests[0].driver_name).toBe('John Doe'); // Unchanged
    });
  });
});
